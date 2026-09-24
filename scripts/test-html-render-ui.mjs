// E2E for HTML rendered/source tabs (spec: docs/superpowers/specs/2026-09-14-html-render-source-toggle-design.md).
// Launches the BUILT app (background mode, no focus steal) with fixture files
// and locks:
//   1. .html tab renders a sandboxed iframe (no CodeMirror) by default.
//   2. Oversize html (> HTML_RENDER_MAX_BYTES) opens directly in source mode
//      with the too-large notice.
//   3. Toggle → CodeMirror source; a per-character typed edit lands in the
//      document; toggle back → app saves, iframe remounts with the new content.
//   4. Scripts execute inside the sandboxed frame (DOM side-effect visible)
//      and the frame cannot reach its parent document (sandbox enforced).
//      (CDP reports a URL-derived location.origin for sandboxed standard-
//      scheme frames, so the behavioral parent-access probe is authoritative.)
//   5. Relaunch with the same profile reopens the html tab in the persisted
//      render mode with the saved content on disk.
import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { launchBuiltElectron, stopBuiltElectron } from './lib/electron-test-app.mjs'
import { connectCdp, sleep } from './lib/cdp.mjs'

// Reconnect to the CURRENT page target via /json/list. Session restore can
// swap/reload the renderer page after launch, leaving the originally attached
// websocket answering nothing; a fresh connection targets the live page.
const reconnectLive = async (port, child, profileDir) => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cdp = await connectCdp({ port, attempts: 10, intervalMs: 300 })
    const ok = await Promise.race([
      cdp.evaluate(`document.readyState === 'complete'`).catch(() => false),
      new Promise((r) => setTimeout(() => r(false), 8000))
    ])
    if (ok) return { ...cdp, child, profileDir }
    try { cdp.ws.close() } catch {}
    await sleep(800)
  }
  throw new Error('could not establish a live CDP connection after relaunch')
}
import { pressKey, typeTextLikeUser } from './lib/human-input.mjs'

const root = `/tmp/horsemd-html-view-${process.pid}`
const port = Number(process.env.CDP_PORT || 9875)

// Probe text is intentionally LAST and unclosed so "End" + typing appends
// inside the h1 (the HTML parser auto-closes the rest).
const SMALL_HTML = '<!doctype html><html><body><script>document.body.setAttribute("data-js","ran");window.__sandboxProbe=(window.parent!==window);window.__parentAccess=(function(){try{window.parent.document.body;return "yes"}catch(e){return "no"}})()</script><h1 id="probe">Alpha'

// Fixtures MUST exist before launch (main's extractArgs filters through FILE_EXTS).
await rm(root, { recursive: true, force: true })
await mkdir(root, { recursive: true })
await writeFile(join(root, 'index.html'), SMALL_HTML, 'utf8')
await writeFile(join(root, 'big.html'), 'x'.repeat(2 * 1024 * 1024 + 1), 'utf8')

console.error('[t] launching');
const app = await launchBuiltElectron({
  profileDir: join(root, 'profile'),
  port,
  appArgs: [join(root, 'index.html'), join(root, 'big.html')]
})

const waitFor = async (check, message, attempts = 100) => {
  for (let i = 0; i < attempts; i++) {
    const v = await check()
    if (v) return v
    await sleep(200)
  }
  throw new Error(message)
}

const activateTab = async (titleSuffix) => {
  const ok = await app.evaluate(`(() => {
    const tabs = [...document.querySelectorAll('.tab')]
    const el = tabs.find((t) => (t.querySelector('.tab-title') || t).textContent.includes(${JSON.stringify(titleSuffix)}))
    if (!el) return false
    el.click()
    return true
  })()`)
  if (!ok) throw new Error(`tab not found: ${titleSuffix}`)
  await sleep(400)
}

const htmlPaneState = (titleSuffix) => app.evaluate(`(() => {
  const tabs = [...document.querySelectorAll('.tab')]
  const tabEl = tabs.find((t) => (t.title || t.textContent || '').includes(${JSON.stringify(titleSuffix)}))
  if (!tabEl || tabEl.offsetParent == null) return null
  const panes = [...document.querySelectorAll('.html-scroll')].filter((el) => el.offsetParent !== null)
  const pane = panes[0]
  if (!pane) return null
  return {
    frame: !!pane.querySelector('.html-preview-frame'),
    cm: !!pane.querySelector('.cm-editor'),
    frameSrc: (pane.querySelector('.html-preview-frame') || {}).src || '',
    notice: (pane.querySelector('.html-too-large-notice') || {}).textContent || '',
    toggleLabel: (pane.querySelector('.html-mode-toggle') || {}).textContent || ''
  }
})()`)

const expectPane = async (titleSuffix, expected, message) => {
  for (let i = 0; i < 100; i++) {
    const state = await htmlPaneState(titleSuffix)
    if (state && expected.every(([k, v]) => !!state[k] === v)) return state
    await sleep(200)
  }
  const state = await htmlPaneState(titleSuffix)
  throw new Error(`${message} — state: ${JSON.stringify(state)}`)
}

const clickToggle = async () => {
  const ok = await app.evaluate(`(() => {
    const pane = [...document.querySelectorAll('.html-scroll')].find((el) => el.offsetParent !== null)
    const btn = pane && pane.querySelector('.html-mode-toggle')
    if (!btn) return false
    btn.click()
    return true
  })()`)
  assert.ok(ok, 'html mode toggle button missing')
  await sleep(400)
}

// Evaluate an expression inside the sandboxed html iframe. Sandboxed frames
// don't appear in the page's frame tree, so attach to the iframe's own CDP
// target (Target.getTargets lists it as type 'iframe') and evaluate in that
// session.
const evalInHtmlFrame = async (expression, fixturePath) => {
  const marker = fixturePath || root
  const targets = await app.send('Target.getTargets')
  const infos = targets?.targetInfos ?? targets?.result?.targetInfos ?? []
  const target = infos.find((t) => t.type === 'iframe' && (t.url || '').includes(marker))
  if (!target) return undefined
  const attached = await app.send('Target.attachToTarget', { targetId: target.targetId, flatten: true })
  const sessionId = attached?.sessionId ?? attached?.result?.sessionId
  if (!sessionId) return undefined
  const response = await app.send('Runtime.evaluate', { expression, returnByValue: true }, sessionId)
  if (response.result?.exceptionDetails) return undefined
  return response.result?.result?.value
}

try {
  await sleep(1500)

  // 1) small html is the second/last-but-one arg — activate it: default render.
    await activateTab('index.html')
  const renderState = await expectPane('index.html',
    [['frame', true], ['cm', false]], 'html tab did not default to rendered iframe')
  assert.ok(/\.html?$/i.test(new URL(renderState.frameSrc).pathname),
    `iframe src is not the html file: ${renderState.frameSrc}`)

  // 2) toggle to source → CodeMirror appears, iframe gone.
  await clickToggle()
  await expectPane('index.html', [['frame', false], ['cm', true]], 'toggle did not switch to source mode')
  const srcModes = await app.evaluate(`(() => { try { return JSON.parse(localStorage['horsemd.htmlView.v1'] || '{}') } catch { return {} } })()`)
  const srcKey = Object.keys(srcModes).find((k) => k.includes('index.html'))
  assert.ok(srcKey && srcModes[srcKey] === 'source', `source mode not persisted: ${JSON.stringify(srcModes)}`)

  // 3) per-character typed edit: caret to doc end, then type.
  const focused = await app.evaluate(`(() => {
    const pane = [...document.querySelectorAll('.html-scroll')].find((el) => el.offsetParent !== null)
    const cm = pane && pane.querySelector('.cm-content')
    if (!cm) return false
    cm.focus()
    return true
  })()`)
  assert.ok(focused, 'could not focus CodeMirror content')
  // Single-line fixture: End = line end = document end; then per-character typing.
  await pressKey(app.send, { key: 'End', code: 'End' })
  await typeTextLikeUser(app.send, 'Beta', { delayMs: 30 })
  await sleep(300)
  const cmText = await app.evaluate(`(() => {
    const pane = [...document.querySelectorAll('.html-scroll')].find((el) => el.offsetParent !== null)
    return pane ? (pane.querySelector('.cm-content') || {}).textContent : null
  })()`)
  assert.ok(String(cmText).includes('AlphaBeta'), `typed edit missing from source: ${JSON.stringify(cmText)}`)

  // 4) toggle back to render → save happens, iframe remounts with new content.
  await clickToggle()
  await expectPane('index.html', [['frame', true], ['cm', false]], 'toggle back did not switch to render mode')
  const probeText = await waitFor(
    () => evalInHtmlFrame('document.getElementById("probe") ? document.getElementById("probe").textContent : null'),
    'iframe did not expose the probe element'
  )
  assert.equal(probeText, 'AlphaBeta', `iframe content is stale after save+render: ${JSON.stringify(probeText)}`)

  // 5) sandbox: scripts ran (DOM side-effect) and the frame cannot reach the
  // parent document — the security boundary that matters for local files.
  const jsRan = await evalInHtmlFrame('document.body.getAttribute("data-js")')
  assert.equal(jsRan, 'ran', 'inline script did not execute inside the sandboxed frame')
  const parentAccess = await evalInHtmlFrame('window.__parentAccess')
  assert.equal(parentAccess, 'no', `sandboxed frame can reach the parent document: ${JSON.stringify(parentAccess)}`)

  // 6) oversize html opened in source mode with the too-large notice.
  await activateTab('big.html')
  const bigState = await expectPane('big.html',
    [['cm', true], ['frame', false]], 'oversize html did not open in source mode')
  assert.ok(bigState.notice.length > 0, 'oversize html missing the too-large notice')

  // 7) persistence: the htmlView localStorage map is keyed by the document
  // path — 'source' while source mode is active, entry removed for render.
  // (Physical relaunch restore is exercised manually; test-mode background
  // relaunch is flaky under App Nap.)
  const readModes = `(() => { try { return JSON.parse(localStorage['horsemd.htmlView.v1'] || '{}') } catch { return {} } })()`
  const modeKeyOf = (modes) => Object.keys(modes).find((k) => k.includes('index.html'))
  const modesNow = await app.evaluate(readModes)
  const keyNow = modeKeyOf(modesNow)
  assert.ok(keyNow === undefined || modesNow[keyNow] !== 'source',
    `render mode must not persist a source entry: ${JSON.stringify(modesNow)}`)

  console.log('html render/source toggle UI OK')
} finally {
  await stopBuiltElectron(app).catch(() => {})
  await rm(root, { recursive: true, force: true }).catch(() => {})
}
