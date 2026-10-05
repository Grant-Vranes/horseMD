// Diagnostic: stage-by-stage timing of the workspace add/remove code path over
// CDP, with progress printed after each stage so a hang identifies itself.
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchBuiltElectron } from './lib/electron-test-app.mjs'

// Synthetic workspace: 300 dirs x 30 files = 9k files, depth 4.
const ws = join(await mkdtemp(join(tmpdir(), 'horsemd-ws-')), 'bigws')
for (let i = 0; i < 300; i++) {
  const d = join(ws, `d${Math.floor(i / 30)}`, `sub${i}`)
  await mkdir(d, { recursive: true })
  for (let j = 0; j < 30; j++) await writeFile(join(d, `f${j}.md`), '# hi\n\ncontent\n')
}
console.log('fixture ready:', ws)

const profileDir = join(tmpdir(), 'horsemd-ws-diag')
const cdp = await launchBuiltElectron({ profileDir, port: 9337, cleanProfile: true })
console.log('launched')

const evalStage = async (label, expr) => {
  const start = Date.now()
  try {
    const v = await Promise.race([
      cdp.evaluate(expr),
      new Promise((_, rej) => setTimeout(() => rej(new Error('STAGE TIMEOUT 60s')), 60000))
    ])
    console.log(`${label}: ${Date.now() - start}ms ->`, JSON.stringify(v)?.slice(0, 300))
    return v
  } catch (e) {
    console.log(`${label}: FAILED after ${Date.now() - start}ms:`, e.message)
    throw e
  }
}

await evalStage('sanity', 'window.api ? "ok" : "no-api"')
await evalStage('watchStart', `window.api.watchStart(${JSON.stringify(ws)}).then(r => 'started:' + r)`)
await evalStage('listFiles', `window.api.listFiles(${JSON.stringify(ws)}).then(f => 'files:' + f.length)`)
await evalStage('readDir', `window.api.readDir(${JSON.stringify(ws)}).then(f => 'nodes:' + f.length)`)
// Main-process responsiveness DURING watchStart of a second big root.
const ws2 = ws + '2'
const r = await cdp.evaluate(`(async () => {
  const start = performance.now()
  const watch = window.api.watchStart(${JSON.stringify(ws2)})
  let pings = 0
  const ping = async () => { pings += 1; return window.api.listFiles(${JSON.stringify(ws)}) }
  await watch
  return { watchMs: Math.round(performance.now() - start), pings }
})()`)
console.log('second watchStart concurrent:', JSON.stringify(r))
await evalStage('watchStop', `window.api.watchStop(${JSON.stringify(ws)}).then(() => 'stopped')`)
console.log('DONE')

cdp.child?.kill?.('SIGTERM')
await rm(ws, { recursive: true, force: true }).catch(() => {})
await rm(ws2, { recursive: true, force: true }).catch(() => {})
process.exit(0)
