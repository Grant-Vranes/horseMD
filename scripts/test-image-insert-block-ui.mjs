// Regression: an image pasted into an empty paragraph / blank line must become
// the same `image-block` node as authored standalone images — centered
// `.milkdown-image-block` with the caption/resize toolbar — not a bare inline
// image node. Inserting an inline image also serialized to `![alt](src)` which
// re-parsed as an image-block on the next pass, tripping the fail-closed
// "rich text and source diverged" toast.
import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { launchBuiltElectron, stopBuiltElectron } from './lib/electron-test-app.mjs'
import { sleep } from './lib/cdp.mjs'

const dir = '/tmp/horsemd-image-block-insert'
const file = join(dir, 'note.md')
const port = Number(process.env.CDP_PORT || 9494)

// 1x1 transparent PNG
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
)

const source = ['标题行', '', ''].join('\n')

async function waitFor(check, message, attempts = 60) {
  for (let index = 0; index < attempts; index += 1) {
    const result = await check()
    if (result) return result
    await sleep(100)
  }
  throw new Error(message)
}

async function pasteImageAtCaret(evaluate) {
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

    // Place the caret at the end of the empty last line.
    const placed = await evaluate(`(() => {
      const editor = [...document.querySelectorAll('.ProseMirror')].find((node) => node.offsetParent)
      if (!editor) return false
      const last = editor.lastElementChild
      if (!last) return false
      const range = document.createRange()
      range.selectNodeContents(last)
      range.collapse(false)
      const selection = getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      editor.focus()
      return true
    })()`)
    assert.ok(placed, 'Could not place caret in empty last paragraph')

    await pasteImageAtCaret(evaluate)
    await sleep(2500)

    const toast = await evaluate(`document.querySelector('.hm-toast-msg')?.textContent ?? null`)
    assert.ok(
      !toast || !String(toast).includes('检测到富文本与源码不一致'),
      `source-sync mismatch toast fired: ${toast}`
    )

    // The pasted image must render as an image-block node view (centered
    // block with the operation toolbar), not a bare inline image.
    const blockRendered = await evaluate(`(() => {
      const editor = [...document.querySelectorAll('.ProseMirror')].find((node) => node.offsetParent)
      if (!editor) return null
      const block = editor.querySelector('.milkdown-image-block')
      if (!block) return 'no .milkdown-image-block'
      const img = block.querySelector('img')
      if (!img) return 'block without img'
      if (!(img.complete && img.naturalWidth > 0)) return 'broken:' + (img.currentSrc || img.getAttribute('src'))
      const style = getComputedStyle(block)
      return style.display === 'block' || style.display === 'flex' ? 'ok' : 'display:' + style.display
    })()`)
    assert.equal(blockRendered, 'ok', `Pasted image did not render as image-block: ${blockRendered}`)

    // Saved source must round-trip as a plain standalone image and reopen as
    // the same image-block (no ratio noise, no caption loss).
    const point = await waitFor(() => evaluate(`(() => {
      const button = document.querySelector('.hm-save-fab')
      const rect = button?.getBoundingClientRect()
      return rect ? { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) } : null
    })()`), 'Save button did not appear after image paste')
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
    await waitFor(() => evaluate(`!document.querySelector('.hm-save-fab')`), 'Save did not complete')

    const saved = await readFile(file, 'utf8')
    assert.match(saved, /!\[[^\]]*\]\([^)]+\)/, `Saved file lost the image markdown:\n${saved}`)
    assert.ok(!/\d\.\d\d\]\(/.test(saved), `Saved file used legacy ratio alt:\n${saved}`)

    console.log('PASS: pasted image renders as image-block with toolbar, no sync mismatch, save round-trips')
  } finally {
    await stopBuiltElectron(app)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
