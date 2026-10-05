import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchBuiltElectron } from './lib/electron-test-app.mjs'

const profileDir = join(tmpdir(), 'horsemd-drop-diag3')
const cdp = await launchBuiltElectron({ profileDir, port: 9335, cleanProfile: true })
const r = await cdp.evaluate(`(async () => {
  const out = {}
  out.apiKeys = ['classifyDroppedPaths', 'getPathForDroppedFile', 'listFiles'].map((k) => typeof window.api?.[k])
  out.hasDataTransfer = typeof DataTransfer
  try {
    const dt = new DataTransfer()
    dt.items.add(new File([], 'x.md'))
    out.types = [...dt.types]
    window.addEventListener('drop', (e) => { out.got = true }, { once: true })
    const tb = document.querySelector('.topbar')
    out.topbar = Boolean(tb)
    tb.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }))
    await new Promise((r) => setTimeout(r, 200))
    out.received = Boolean(out.got)
  } catch (e) { out.err = String(e) }
  return out
})()`)
console.log(JSON.stringify(r, null, 2))
cdp.child?.kill?.('SIGTERM')
process.exit(0)
