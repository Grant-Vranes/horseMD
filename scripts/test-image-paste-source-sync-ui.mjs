// Regression: pasting an image into a rich markdown document must be committed
// into the authored source instead of tripping the fail-closed
// "rich text and source diverged" toast.
//
// Root cause (0.13.211): ProseMirror images are atom nodes — they contribute
// no visible characters to the visible-stream index. preserveMiddleEmptyBlock's
// boundary-only placeholder guard compared visible text only, so an inline
// image insertion inside an existing paragraph was misclassified as a
// placeholder-only boundary move and silently dropped from the candidate
// source; integrity validation then failed closed with the mismatch toast.
import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { launchBuiltElectron, stopBuiltElectron } from './lib/electron-test-app.mjs'
import { sleep } from './lib/cdp.mjs'

const dir = '/tmp/horsemd-image-paste-source-sync'
const file = join(dir, 'note.md')
const port = Number(process.env.CDP_PORT || 9493)

// 1x1 transparent PNG
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

const source = ['第一段，这里粘贴图片。', '', '第二段。'].join('\n')

async function waitFor(check, message, attempts = 60) {
  for (let index = 0; index < attempts; index += 1) {
    const result = await check()
    if (result) return result
    await sleep(100)
  }
  throw new Error(message)
}

async function main() {
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  await writeFile(file, source, 'utf8')

  const app = await launchBuiltElectron({
    profileDir: join(dir, 'profile'),
    port,
    appArgs: [file],
    entrypoint: process.env.HORSEMD_APP_PATH || 'out/main/index.cjs'
  })
  const { evaluate, send } = app

  try {
    await waitFor(
      () => evaluate(`[...document.querySelectorAll('.ProseMirror')].some((node) => node.offsetParent)`),
      'Rich editor did not become visible'
    )

    // Place the caret at the end of the first paragraph.
    const placed = await evaluate(`(() => {
      const editor = [...document.querySelectorAll('.ProseMirror')].find((node) => node.offsetParent)
      if (!editor) return false
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
      let target = null
      while (walker.nextNode()) {
        if (walker.currentNode.nodeValue.includes('第一段')) target = walker.currentNode
      }
      if (!target) return false
      const range = document.createRange()
      range.setStart(target, target.nodeValue.length)
      range.collapse(true)
      const selection = getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      editor.focus()
      return true
    })()`)
    assert.ok(placed, 'Could not place caret')

    // Paste an image file (paste semantics; bulk clipboard payload is allowed).
    const pasted = await evaluate(`(() => {
      const bytes = Uint8Array.from(atob(${JSON.stringify(png.toString('base64'))}), (c) => c.charCodeAt(0))
      const file = new File([bytes], 'image.png', { type: 'image/png' })
      const dt = new DataTransfer()
      dt.items.add(file)
      const editor = [...document.querySelectorAll('.ProseMirror')].find((node) => node.offsetParent)
      if (!editor) return false
      editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
      return true
    })()`)
    assert.ok(pasted, 'Paste dispatch failed')

    await sleep(2000)

    const toast = await evaluate(`document.querySelector('.hm-toast-msg')?.textContent ?? null`)
    assert.ok(
      !toast || !String(toast).includes('检测到富文本与源码不一致'),
      `source-sync mismatch toast fired: ${toast}`
    )

    const editorHasImage = await evaluate(`(() => {
      const editor = [...document.querySelectorAll('.ProseMirror')].find((node) => node.offsetParent)
      if (!editor) return null
      const img = editor.querySelector('img')
      if (!img) return false
      // The image must actually LOAD, not just exist in the DOM (a broken
      // file:// or blocked-protocol src renders as a broken image).
      return img.complete && img.naturalWidth > 0 ? true : 'broken:' + (img.currentSrc || img.getAttribute('src'))
    })()`)
    assert.equal(editorHasImage, true, `Editor did not render the pasted image: ${editorHasImage}`)

    // The committed rich baseline must contain the image markdown. Save the
    // document and verify the persisted file, proving source mode and saves
    // both see the image.
    const point = await waitFor(() => evaluate(`(() => {
      const button = document.querySelector('.hm-save-fab')
      const rect = button?.getBoundingClientRect()
      return rect ? { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) } : null
    })()`), 'Save button did not appear after image paste')
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
    await waitFor(() => evaluate(`!document.querySelector('.hm-save-fab')`), 'Save did not complete')

    const saved = await readFile(file, 'utf8')
    assert.match(
      saved,
      /第一段，这里粘贴图片。!\[[^\]]*\]\(assets\/[^)]+\.png\)/,
      `Saved file lost the pasted image: ${JSON.stringify(saved)}`
    )
    console.log('PASS: image paste committed to source, no mismatch toast, file saved with image')
  } finally {
    await stopBuiltElectron(app)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
