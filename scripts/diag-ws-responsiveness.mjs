// Renderer responsiveness during a long fs:listFiles walk on a huge root.
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchBuiltElectron } from './lib/electron-test-app.mjs'

const targetDir = process.argv[2] || '/Users/akio/Akio'
const profileDir = join(tmpdir(), 'horsemd-ws-diag3')
const cdp = await launchBuiltElectron({ profileDir, port: 9343, cleanProfile: true })
const d = JSON.stringify(targetDir)
const r = await Promise.race([
  cdp.evaluate(`(async () => {
    const p = window.api.listFiles(${d})
    const start = performance.now()
    let frames = 0
    while (performance.now() - start < 3000) {
      await new Promise((r2) => setTimeout(r2, 5))
      frames += 1
    }
    const listMs = Math.round(performance.now() - start)
    const n = await p.then((f) => f.length).catch(() => -1)
    return { framesIn3000ms: frames, totalListMs: listMs, files: n }
  })()`),
  new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), 180000))
])
console.log(JSON.stringify(r))
cdp.child?.kill?.('SIGTERM')
process.exit(0)
