// User-machine drawio diagnostic. Usage:
//   node scripts/diag-user-drawio.mjs "/path/to/问题文件.drawio" [更多文件...]
// Launches the INSTALLED /Applications/HorseMD.app with a debug port, opens the
// given files, then inspects each drawio iframe from INSIDE the frame: whether
// the vendored webapp booted, and any console errors it printed.
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchBuiltElectron, stopBuiltElectron } from './lib/electron-test-app.mjs'
import { sleep } from './lib/cdp.mjs'

delete process.env.ELECTRON_RUN_AS_NODE
const files = process.argv.slice(2)
if (!files.length) {
  console.error('用法: node scripts/diag-user-drawio.mjs "/path/to/文件.drawio"')
  process.exit(1)
}
const port = Number(process.env.CDP_PORT || 9843)

const app = await launchBuiltElectron({
  profileDir: join(tmpdir(), 'horsemd-user-diag-profile'),
  port,
  cleanProfile: true,
  executable: '/Applications/HorseMD.app/Contents/MacOS/HorseMD',
  entrypoint: null,
  appArgs: files
})

// Capture console from every target (page + iframes)
const logs = []
app.ws.addEventListener?.('message', (ev) => {
  try {
    const m = JSON.parse(typeof ev === 'string' ? ev : ev.data)
    const c = m.params?.consoleAPICalled || (m.method === 'Runtime.exceptionThrown' ? m.params : null)
    if (!c) return
    if (c.exceptionDetails) logs.push('EXC: ' + (c.exceptionDetails.exception?.description || c.exceptionDetails.text || '').slice(0, 400))
    else if (c.type && c.type !== 'debug') logs.push(c.type + ': ' + (c.args || []).map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 400))
  } catch {}
})
await app.send('Runtime.enable', {})
await app.send('Page.enable', {})
await sleep(6000)

// Activate each non-md tab
for (const f of files) {
  const name = f.split('/').pop()
  await app.evaluate(`(() => {
    const t = [...document.querySelectorAll('.tab-title')].find(n => n.textContent === ${JSON.stringify(name)})
    if (t) { t.closest('[class*=tab]').click(); return 'clicked' }
    return 'TAB NOT FOUND: ' + ${JSON.stringify(name)}
  })()`).then((r) => console.log('activate', name, '->', r)).catch((e) => console.log('activate fail', name, e.message))
  await sleep(12000)
}

const state = await app.evaluate(`(() => ({
  tabs: [...document.querySelectorAll('.tab-title')].map(n => n.textContent),
  frames: [...document.querySelectorAll('iframe')].map((f) => ({ cls: f.className, src: f.src })),
  loadErr: document.querySelector('.drawio-load-error')?.textContent || null,
  ready: document.querySelector('.drawio-host')?.getAttribute('data-ready') || null
}))()`).catch((e) => ({ err: e.message }))
console.log('HOST STATE:', JSON.stringify(state, null, 1))

// List all CDP targets (iframe targets included) and probe each drawio-local one
const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json())
const drawioTargets = targets.filter((t) => t.url.startsWith('drawio-local'))
console.log('drawio iframe targets:', drawioTargets.length)
for (const t of drawioTargets) {
  const { sessionId } = await app.send('Target.attachToTarget', { targetId: t.id, flatten: true })
  const probe = await app.send('Runtime.evaluate', {
    expression: `(() => { try { return JSON.stringify({
      url: location.href,
      readyState: document.readyState,
      hasEditor: typeof window.Editor !== 'undefined',
      hasGraph: typeof window.mxGraph !== 'undefined',
      bodyChildren: document.body ? document.body.children.length : -1,
      title: document.title
    }) } catch (e) { return 'PROBE ERR ' + e.message } })()`,
    returnByValue: true
  }, sessionId).catch((e) => ({ error: e.message }))
  console.log('IFRAME PROBE:', JSON.stringify(probe?.result?.result?.value ?? probe))
  await sleep(500)
}

console.log('--- console / exceptions captured ---')
console.log(logs.slice(-60).join('\n') || '(none)')
await stopBuiltElectron(app, { removeProfile: false })
console.log('DONE')
process.exit(0)
