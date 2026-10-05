import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchBuiltElectron } from './lib/electron-test-app.mjs'

const profileDir = join(tmpdir(), 'horsemd-drop-diag4')
const cdp = await launchBuiltElectron({ profileDir, port: 9336, cleanProfile: true })
const r = await cdp.evaluate(`(async () => {
  const out = {}
  const dt = new DataTransfer()
  dt.items.add(new File([], 'x.md'))
  const mk = (type) => new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt })
  const tb = document.querySelector('.topbar')
  tb.dispatchEvent(mk('dragenter'))
  await new Promise((r) => setTimeout(r, 300))
  out.overlayAfterEnter = Boolean(document.querySelector('[class*="drop"]'))
  out.bodyDropEls = [...document.querySelectorAll('body *')].filter((el) => /drop/i.test(el.className)).map((el) => el.className).slice(0, 5)
  // try a capture listener at window to see ordering
  out.captureSeen = false
  window.addEventListener('drop', () => { out.captureSeen = true }, { capture: true, once: true })
  tb.dispatchEvent(mk('drop'))
  await new Promise((r) => setTimeout(r, 100))
  return out
})()`)
console.log(JSON.stringify(r, null, 2))
cdp.child?.kill?.('SIGTERM')
process.exit(0)
