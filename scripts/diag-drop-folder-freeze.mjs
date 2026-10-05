// Diagnostic: reproduce the "drop a folder into workspace freezes the app"
// report by driving the exact renderer code path over CDP and timing each
// stage (watchStart, listFiles, readDir, addFolder state update).
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchBuiltElectron } from './lib/electron-test-app.mjs'

const targetDir = process.argv[2] || '/Users/akio/Akio'
const profileDir = join(tmpdir(), 'horsemd-drop-diag')

const cdp = await launchBuiltElectron({ profileDir, port: 9333, cleanProfile: true })
await cdp.evaluate('window.api && window.api.capabilities ? true : false')

const timing = await cdp.evaluate(`(async () => {
  const t = (label, p) => {
    const start = performance.now()
    return p.then((v) => [label, Math.round(performance.now() - start), v])
  }
  const dir = ${JSON.stringify(targetDir)}
  const out = []
  out.push(await t('watchStart', window.api.watchStart(dir).catch((e) => String(e))))
  out.push(await t('listFiles', window.api.listFiles(dir).then((f) => f.length).catch((e) => String(e))))
  out.push(await t('readDir', window.api.readDir(dir).then((f) => f.length).catch((e) => String(e))))
  // Renderer responsiveness probe DURING a second concurrent full listing.
  const p = window.api.listFiles(dir)
  const start = performance.now()
  let frames = 0
  while (performance.now() - start < 2000) {
    await new Promise((r) => setTimeout(r, 5))
    frames += 1
  }
  out.push(['responsiveFrames2000ms', frames, null])
  out.push(await t('listFiles2', p.then((f) => f.length).catch((e) => String(e))))
  return out
})()`)
console.log(JSON.stringify(timing, null, 2))

cdp.child?.kill?.('SIGTERM')
process.exit(0)
