// Diagnostic against a real user folder: stage-by-stage timing, 60s stage cap.
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchBuiltElectron } from './lib/electron-test-app.mjs'

const targetDir = process.argv[2] || '/Users/akio/Akio'
const profileDir = join(tmpdir(), 'horsemd-ws-diag2')
const cdp = await launchBuiltElectron({ profileDir, port: 9341, cleanProfile: true })
console.log('launched, target:', targetDir)

const evalStage = async (label, expr, capMs = 60000) => {
  const start = Date.now()
  try {
    const v = await Promise.race([
      cdp.evaluate(expr),
      new Promise((_, rej) => setTimeout(() => rej(new Error(`STAGE TIMEOUT ${capMs}ms`)), capMs))
    ])
    console.log(`${label}: ${Date.now() - start}ms ->`, JSON.stringify(v)?.slice(0, 300))
    return v
  } catch (e) {
    console.log(`${label}: FAILED after ${Date.now() - start}ms:`, e.message)
    return null
  }
}

await evalStage('sanity', 'window.api ? "ok" : "no-api"')
const d = JSON.stringify(targetDir)
await evalStage('watchStart', `window.api.watchStart(${d}).then(r => 'started:' + r)`)
await evalStage('listFiles', `window.api.listFiles(${d}).then(f => 'files:' + f.length)`, 120000)
await evalStage('readDir', `window.api.readDir(${d}).then(f => 'nodes:' + f.length)`, 120000)
await evalStage('watchStop', `window.api.watchStop(${d}).then(() => 'stopped')`, 120000)
// Renderer responsiveness probe during a fresh watchStart (chokidar full walk).
const r = await evalStage(`watchStart2+responsiveness`, `(async () => {
  const start = performance.now()
  const watch = window.api.watchStart(${d})
  let pings = 0
  const tick = setInterval(async () => { pings += 1 }, 5)
  await watch
  clearInterval(tick)
  return { watchResolveMs: Math.round(performance.now() - start), pings }
})()`, 120000)
console.log('DONE', JSON.stringify(r))
cdp.child?.kill?.('SIGTERM')
process.exit(0)
