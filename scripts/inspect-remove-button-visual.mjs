// Visual inspection: hover a block image, screenshot the remove button state.
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { launchBuiltElectron, stopBuiltElectron } from './lib/electron-test-app.mjs'
import { sleep } from './lib/cdp.mjs'

const dir = '/tmp/horsemd-remove-button-visual'
const file = join(dir, 'note.md')
const port = Number(process.env.CDP_PORT || 9510)

const png = Buffer.from(
  'iVBORw0KGgoAAAABAAABAAAA//8DAAAA//8CAAA=' + 'A'.repeat(40),
  'base64'
)

async function waitFor(check, message, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    const r = await check()
    if (r) return r
    await sleep(100)
  }
  throw new Error(message)
}

async function main() {
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  // 4x4 red PNG (valid full file, not truncated)
  const full = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFUlEQVR42mNk+M/wn4EIwESUTIkAAAUZAAEBx8D0AAAAAElFTkSuQmCC',
    'base64'
  )
  await writeFile(join(dir, 'pic.png'), full)
  await writeFile(file, `![](pic.png)\n`, 'utf8')

  const app = await launchBuiltElectron({
    profileDir: join(dir, 'profile'),
    port,
    appArgs: [file],
    background: false,
    entrypoint: process.env.HORSEMD_APP_PATH || 'out/main/index.cjs'
  })
  const { send, evaluate } = app
  try {
    await waitFor(() => evaluate(`[...document.querySelectorAll('.ProseMirror')].some(n => n.offsetParent)`), 'editor visible')
    // Hover the image block
    const rect = await evaluate(`(() => {
      const img = document.querySelector('.milkdown-image-block img')
      const r = img.getBoundingClientRect()
      return { x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) }
    })()`)
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y })
    // Also dispatch synthetic mouseover directly in case raw CDP move misses the capture listener
    await evaluate(`(() => {
      const img = document.querySelector('.milkdown-image-block img')
      img.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, composed: true }))
      return true
    })()`)
    await sleep(600)
    const info = await evaluate(`(() => {
      const b = [...document.querySelectorAll('.hm-image-remove')].find((el) => el.classList.contains('visible')) || document.querySelector('.hm-image-remove')
      if (!b) return 'no button'
      const s = getComputedStyle(b)
      const svg = b.querySelector('svg')
      const path = svg?.querySelector('path')
      return {
        bg: s.backgroundColor, color: s.color, visible: b.classList.contains('visible'),
        svgStroke: path ? getComputedStyle(path).stroke : null,
        svgDisplay: svg ? getComputedStyle(svg).display : null,
        w: s.width, h: s.height, borderRadius: s.borderRadius, opacity: s.opacity
      }
    })()`)
    console.log(JSON.stringify(info, null, 2))
    // Screenshot the button area
    await send('Page.enable')
    const shot = await send('Page.captureScreenshot', { format: 'png' })
    const { writeFile: wf } = await import('node:fs/promises')
    await wf('/tmp/hm-remove-button.png', Buffer.from(shot.data, 'base64'))
    await sleep(5000)
  } finally {
    await stopBuiltElectron(app)
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
