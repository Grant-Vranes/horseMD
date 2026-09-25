// One-off diagnostic: session-restore blank drawio/html reproduction.
// Phase 1: launch with a persistent profile, open drawio+html, verify render.
// Phase 2: kill the process (simulating quit), relaunch SAME profile, inspect.
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchBuiltElectron, stopBuiltElectron } from './lib/electron-test-app.mjs'
import { sleep } from './lib/cdp.mjs'

delete process.env.ELECTRON_RUN_AS_NODE
const port = Number(process.env.CDP_PORT || 9834)
const profile = join(tmpdir(), 'horsemd-restore-diag-profile')

const GOOD_XML =
  '<mxfile host="horsemd" version="31.4.5"><diagram id="p1" name="Page-1">' +
  '<mxGraphModel dx="100" dy="100" grid="1" gridSize="10" page="1"><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>' +
  '</diagram></mxfile>'
const dir = mkdtempSync(join(tmpdir(), 'horsemd-restore-diag-'))
const drawioPath = join(dir, 'd.drawio')
writeFileSync(drawioPath, GOOD_XML)
const htmlPath = join(dir, 'page.html')
writeFileSync(htmlPath, '<!doctype html><html><body><h1>HTML OK</h1></body></html>')

const inspect = async (app, label) => {
  for (let i = 0; i < 24; i++) {
    const tabs = await app.evaluate(`[...document.querySelectorAll('.tab-title')].map(n=>n.textContent)`).catch(() => [])
    if (tabs && tabs.some((t) => t.endsWith('.drawio') || t.endsWith('.html'))) break
    await sleep(500)
  }
  // activate drawio tab
  await app.evaluate(`(() => {
    const t = [...document.querySelectorAll('.tab-title')].find(n => n.textContent === 'd.drawio')
    if (t) { t.closest('[class*=tab]').click(); return true }
    return false
  })()`).catch(() => {})
  await sleep(8000)
  const s1 = await app.evaluate(`(() => ({
    frames: [...document.querySelectorAll('iframe')].map((f) => ({ cls: f.className, src: f.src.slice(0, 60), ready: f.closest('[data-ready]')?.getAttribute('data-ready') })),
    loadErr: document.querySelector('.drawio-load-error')?.textContent || null
  }))()`).catch((e) => ({ err: e.message }))
  console.log(label, 'drawio active:', JSON.stringify(s1))
  // activate html tab
  await app.evaluate(`(() => {
    const t = [...document.querySelectorAll('.tab-title')].find(n => n.textContent === 'page.html')
    if (t) { t.closest('[class*=tab]').click(); return true }
    return false
  })()`).catch(() => {})
  await sleep(4000)
  const s2 = await app.evaluate(`(() => ({
    frames: [...document.querySelectorAll('iframe')].map((f) => ({ cls: f.className, src: f.src.slice(0, 60) }))
  }))()`).catch((e) => ({ err: e.message }))
  console.log(label, 'html active:', JSON.stringify(s2))
  // leave HTML tab ACTIVE (user's scenario: quit while html was open)
}

// Phase 1 — fresh profile, files via args
{
  const app = await launchBuiltElectron({ profileDir: profile, port, cleanProfile: true, appArgs: [drawioPath, htmlPath] })
  await sleep(3000)
  await inspect(app, '[fresh]')
  // graceful quit: trigger Cmd+Q-ish via renderer? use app quit IPC if any; fallback SIGTERM
  await app.evaluate(`(() => { window.close(); return true })()`).catch(() => {})
  await sleep(2000)
  await stopBuiltElectron(app, { removeProfile: false })
}

// Phase 2 — relaunch same profile (session restore)
{
  const app = await launchBuiltElectron({ profileDir: profile, port, cleanProfile: false })
  await inspect(app, '[restored]')
  await stopBuiltElectron(app, { removeProfile: false })
}
console.log('dir kept for inspection:', dir)
