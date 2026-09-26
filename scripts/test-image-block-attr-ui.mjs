// Reproduce the reported image-block family (trace horsemd-input-trace-54911):
// caption editing and resize handle dragging on an image block must commit to
// source without the "检测到富文本与源码不一致" sticky toast, and the saved
// file must keep the image markdown intact (never literal `0.71](...` text).
import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { launchBuiltElectron, stopBuiltElectron } from './lib/electron-test-app.mjs'
import { sleep } from './lib/cdp.mjs'

const dir = '/tmp/horsemd-image-attr-sync'
const file = join(dir, 'note.md')
const port = Number(process.env.CDP_PORT || 9494)

// 4x4 red PNG
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAFElEQVR4nGP8z8DwnwEKmBhQAABbWQMA3nL9BAAAAABJRU5ErkJggg==',
  'base64'
)

const source = [
  '第一段。',
  '',
  '![1.00](assets/a.png "image.png")',
  '',
  '第二段。'
].join('\n')

async function waitFor(check, message, attempts = 60) {
  for (let index = 0; index < attempts; index += 1) {
    const result = await check()
    if (result) return result
    await sleep(100)
  }
  throw new Error(message)
}

const mismatchToast = (evaluate) => evaluate(
  `(() => {
    const t = document.querySelector('.hm-toast-msg')?.textContent ?? ''
    return t.includes('富文本与源码不一致') || t.includes('rich text and source')
  })()`
)

async function clickCenter(send, evaluate, selector) {
  const point = await evaluate(`(() => {
    const el = ${selector}
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })()`)
  assert.ok(point, `element for ${selector} not found`)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
  return point
}

async function typeText(send, text) {
  for (const ch of text) {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch })
    await send('Input.dispatchKeyEvent', { type: 'keyUp', text: ch })
    await sleep(30)
  }
}

async function main() {
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  await mkdir(join(dir, 'assets'), { recursive: true })
  await writeFile(join(dir, 'assets', 'a.png'), png)
  await writeFile(file, source, 'utf8')

  const app = await launchBuiltElectron({
    profileDir: join(dir, 'profile'),
    port,
    appArgs: [file],
    entrypoint: process.env.HORSEMD_APP_PATH || 'out/main/index.cjs'
  })
  const { evaluate, send } = app
  try {
    await waitFor(() => evaluate(
      `[...document.querySelectorAll('.ProseMirror')].some((node) => node.offsetParent)`,
    ), 'Rich editor not visible')
    await evaluate(`globalThis.__hmPreserveLog = []; globalThis.__hmSourceIntegrityTrace = []`)
    await waitFor(() => evaluate(`(() => {
      const img = [...document.querySelectorAll('.ProseMirror img')].find((n) => n.offsetParent)
      return img ? (img.complete && img.naturalWidth > 0 ? 'ok' : 'loading') : null
    })()`), 'image never rendered', 80)

    // 1) Caption edit: click image to select, then click the caption input and
    //    type real characters.
    await clickCenter(send, evaluate,
      `[...document.querySelectorAll('.ProseMirror img')].find((n) => n.offsetParent)`)
    await sleep(400)
    await clickCenter(send, evaluate,
      `[...document.querySelectorAll('.caption-input')].find((n) => n.offsetParent)`)
    await sleep(300)
    await typeText(send, '图注A')
    await sleep(1500)
    console.log('after caption toast:', await mismatchToast(evaluate))
    const dump = await evaluate(`JSON.stringify({ preserve: (globalThis.__hmPreserveLog || []).slice(-6), integrity: (globalThis.__hmSourceIntegrityTrace || []).slice(-4) })`)
    console.log('DUMP:', dump)

    // 2) Resize: drag the resize handle right by ~30px.
    await clickCenter(send, evaluate,
      `[...document.querySelectorAll('.ProseMirror img')].find((n) => n.offsetParent)`)
    await sleep(400)
    const handle = await evaluate(`(() => {
      const h = [...document.querySelectorAll('.image-resize-handle')].find((n) => n.offsetParent)
      if (!h) return null
      const r = h.getBoundingClientRect()
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
    })()`)
    if (handle) {
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: handle.x, y: handle.y, button: 'left', clickCount: 1 })
      await sleep(100)
      for (let step = 1; step <= 6; step += 1) {
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: handle.x + step * 5, y: handle.y, button: 'left' })
        await sleep(40)
      }
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: handle.x + 30, y: handle.y, button: 'left', clickCount: 1 })
      await sleep(1500)
    } else {
      console.log('no resize handle found after selecting image')
    }
    console.log('after resize toast:', await mismatchToast(evaluate))

    // 3) Save and inspect the persisted source.
    const point = await waitFor(() => evaluate(`(() => {
      const button = document.querySelector('.hm-save-fab')
      const rect = button?.getBoundingClientRect()
      return rect ? { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) } : null
    })()`), 'Save button did not appear')
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 })
    await waitFor(() => evaluate(`!document.querySelector('.hm-save-fab')`), 'Save did not complete')
    const saved = await readFile(file, 'utf8')
    console.log('saved file:', JSON.stringify(saved))
    assert.ok(!saved.includes('0.71](') || saved.includes('![0.71]('), 'image markdown lost its opener')
  } finally {
    await stopBuiltElectron(app)
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
