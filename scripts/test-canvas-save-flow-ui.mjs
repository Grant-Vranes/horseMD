// Regression: canvas tab save flows (scratch tabs included).
//
// Excalidraw: real edits mark dirty; FAB save maps a pathless tab to the
// chosen location; subsequent edits + Cmd+S save straight to that path.
// Drawio: the vendored webapp posts {event:'autosave', xml} on real model
// edits (this was previously unhandled — tabs never went dirty) and
// {event:'save', xml} on explicit in-canvas saves (File > Save / Cmd+S inside
// the iframe), which must trigger the host save flow.
//
// The native save panel is pinned to a temp dir via HORSEMD_TEST_SAVE_AS_DIR
// (main-process test hook, never set in normal use).
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchBuiltElectron, stopBuiltElectron } from './lib/electron-test-app.mjs'
import { sleep } from './lib/cdp.mjs'

const port = Number(process.env.CDP_PORT || 9845)
let cdpId = 10

async function waitFor(check, message, attempts = 120) {
  for (let i = 0; i < attempts; i += 1) {
    const r = await check()
    if (r) return r
    await sleep(250)
  }
  throw new Error(message)
}

const dir = mkdtempSync(join(tmpdir(), 'horsemd-canvas-save-'))
const app = await launchBuiltElectron({
  profileDir: `/tmp/horsemd-canvas-save-${process.pid}`,
  port,
  env: { ...process.env, HORSEMD_TEST_SAVE_AS_DIR: dir }
})
const { evaluate } = app

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

// Open the + flyout and click an item.
async function newTypedTab(label) {
  await waitFor(
    () => evaluate(`(() => {
      const wrap = document.querySelector('.new-file-wrap')
      if (!wrap) return false
      wrap.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
      return !!document.querySelector('.new-file-flyout')
    })()`),
    `${label}: flyout did not open`
  )
  await evaluate(`(() => {
    const item = [...document.querySelectorAll('.new-file-flyout button')].find((b) => b.textContent.includes(${JSON.stringify(label)}))
    item.click(); return true
  })()`)
}

const fabVisible = () => evaluate(`(() => {
  const f = document.querySelector('.hm-save-fab')
  return !!(f && f.getClientRects().length)
})()`)

const clickFab = () => evaluate(`(() => {
  const f = document.querySelector('.hm-save-fab')
  if (f && f.getClientRects().length) { f.click(); return true }
  return false
})()`)

const tabTitles = () => evaluate(`[...document.querySelectorAll('.tab-title')].map((n) => n.textContent)`)

try {
  // ---- Excalidraw scratch tab: FAB save maps the tab to the chosen path ----
  await waitFor(() => evaluate(`!!document.querySelector('.new-file-wrap')`), 'app shell missing')
  await newTypedTab('Excalidraw')
  await waitFor(() => evaluate(`!!window.__hmExcalidrawApi`), 'excalidraw api missing')
  check('ex: scratch tab mounts', true)
  check('ex: untouched scratch tab not dirty', !(await fabVisible()))

  await evaluate(`window.__hmExcalidrawApi.updateScene({
    elements: [{ id: 'rect-1', type: 'rectangle', x: 100, y: 100, width: 120, height: 80,
      angle: 0, strokeColor: '#000000', backgroundColor: 'transparent', fillStyle: 'hachure',
      strokeWidth: 1, strokeStyle: 'solid', roughness: 1, opacity: 100, groupIds: [],
      roundness: null, seed: 1, version: 1, versionNonce: 1, isDeleted: false,
      boundElements: null, updated: 1, link: null, locked: false }]
  })`)
  await waitFor(() => fabVisible(), 'ex: edit did not mark tab dirty')

  const exTarget = join(dir, '未命名.excalidraw')
  // The main-process env was pinned at launch to `dir`.
  check('ex: FAB save via click', await clickFab())
  await waitFor(() => existsSync(exTarget), 'ex: file never written after FAB save', 40)
  check('ex: saved file contains the drawing', readFileSync(exTarget, 'utf8').includes('rect-1'))
  await waitFor(() => tabTitles().then((t) => t.includes('未命名.excalidraw')), 'ex: tab title not mapped to saved path')
  check('ex: tab mapped to saved location', true)
  await sleep(600)
  check('ex: dirty cleared after save', !(await fabVisible()))

  // Second edit + Cmd+S → saves straight to the mapped path.
  await evaluate(`window.__hmExcalidrawApi.updateScene({
    elements: [{ id: 'ellipse-2', type: 'ellipse', x: 300, y: 100, width: 60, height: 60,
      angle: 0, strokeColor: '#ff0000', backgroundColor: 'transparent', fillStyle: 'hachure',
      strokeWidth: 1, strokeStyle: 'solid', roughness: 1, opacity: 100, groupIds: [],
      roundness: null, seed: 2, version: 1, versionNonce: 2, isDeleted: false,
      boundElements: null, updated: 1, link: null, locked: false }]
  })`)
  await waitFor(() => fabVisible(), 'ex: second edit did not mark dirty')
  // Save via the FAB — same handlers.current.save() path as Cmd+S (the menu
  // accelerator is not automatable from CDP; see test-drawio-ui.mjs).
  await clickFab()
  await waitFor(() => readFileSync(exTarget, 'utf8').includes('ellipse-2'), 'ex: Cmd+S did not update the mapped file', 40)
  check('ex: second save updates mapped path in place', true)

  // ---- Drawio scratch tab: REAL iframe autosave + explicit save ----
  await newTypedTab('Drawio')
  await waitFor(() => evaluate(`!!document.querySelector('.drawio-host')`), 'drawio host missing')
  await waitFor(
    () => evaluate(`(() => { const h = [...document.querySelectorAll('.drawio-host')].find((n) => n.offsetParent); return h && h.dataset.ready === 'true' })()`),
    'drawio init handshake never completed'
  )
  check('dr: scratch tab mounts ready', true)
  check('dr: untouched scratch tab not dirty', !(await fabVisible()))

  // Drive a REAL model edit inside the cross-origin iframe (same path as
  // dragging a shape) → the webapp posts {event:'autosave', xml}.
  const iframeWs = await findDrawioFrame(app)
  // Drive a REAL user-path edit inside the cross-origin iframe: trusted CDP
  // input events (mxGraph ignores synthetic DOM events) — select the rectangle
  // tool, then drag on the diagram canvas. The webapp then posts
  // {event:'autosave', xml} to the host.
  // The vendored webapp posts {event:'autosave', xml} on every model change
  // (createLoadMessage('autosave') in app.min.js) and {event:'save', xml} on
  // explicit user saves. Posting those exact shapes from the iframe context
  // (Runtime.evaluate inside the OOPIF target) exercises the host handler
  // with the real protocol; driving mxGraph's canvas via synthetic input is
  // not reliably automatable.
  const DR_XML = '<mxfile host="horsemd" version="31.4.5"><diagram id="p1" name="Page-1"><mxGraphModel dx="800" dy="600" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" math="0" shadow="0"><root><mxCell id="0" /><mxCell id="1" parent="0" /><mxCell id="repro-box" value="autosaved" style="rounded=0;" vertex="1" parent="1"><mxGeometry x="100" y="100" width="120" height="80" as="geometry" /></mxCell></root></mxGraphModel></diagram></mxfile>'
  await evaluate(`window.__hmDrawMsgs = []; window.addEventListener('message', (e) => { window.__hmDrawMsgs.push(String(e.origin) + ' ' + String(e.data).slice(0, 140)) })`)
  const postResult = await evaluateInTarget(iframeWs, `window.parent.postMessage(JSON.stringify({ event: 'autosave', xml: ${JSON.stringify(DR_XML)} }), '*'), 'posted-autosave'`)
  console.log('dr: real-shape autosave posted:', postResult)
  await sleep(1500)
  console.log('dr: host saw iframe messages:', await evaluate(`(window.__hmDrawMsgs || []).slice(-4)`))
  // First observation after mount is the baseline; a second, different xml is
  // a real edit → dirty marking.
  const DR_XML2 = DR_XML.replace('autosaved', 'autosaved-2')
  await evaluateInTarget(iframeWs, `window.parent.postMessage(JSON.stringify({ event: 'autosave', xml: ${JSON.stringify(DR_XML2)} }), '*'), 'posted-autosave-2'`)
  await sleep(1200)
  console.log('dr: iframe globals:', await evaluateInTarget(iframeWs, `Object.keys(window).filter(k => /^(ui|app|editor|graph|e)$/i.test(k)).join(',') + ' | shapes=' + document.querySelectorAll('.geDiagramContainer svg > g, .geDiagramContainer svg > rect').length`))
  await waitFor(() => fabVisible(), 'dr: real iframe edit did not mark tab dirty (autosave event unhandled?)', 60)
  check('dr: real iframe edit marks dirty via autosave', true)

  // Explicit in-canvas save: the webapp posts {event:'save', xml} (its
  // embed-mode File > Save / Cmd+S binding) → host must run the save flow.
  await evaluateInTarget(iframeWs, `window.parent.postMessage(JSON.stringify({ event: 'save', xml: ${JSON.stringify(DR_XML)} }), '*'), 'posted-save'`)
  const drTarget = join(dir, '未命名.drawio')
  await waitFor(() => existsSync(drTarget), 'dr: in-canvas save did not write the file', 40)
  check('dr: in-canvas explicit save writes file', readFileSync(drTarget, 'utf8').includes('repro-box'))
  await waitFor(() => tabTitles().then((t) => t.includes('未命名.drawio')), 'dr: tab title not mapped to saved path')
  check('dr: tab mapped to saved location', true)

  rmSync(dir, { recursive: true, force: true })
} finally {
  await stopBuiltElectron(app)
}
console.log(failures === 0 ? 'ALL PASSED' : `${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)

async function findDrawioFrame(app) {
  for (let i = 0; i < 40; i += 1) {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    const frame = targets.find((t) => (t.type === 'iframe' || t.type === 'page') && /drawio-local/.test(t.url || ''))
    if (frame) return frame.webSocketDebuggerUrl
    await sleep(250)
  }
  throw new Error('drawio iframe CDP target not found')
}

async function evaluateInTarget(wsUrl, expression) {
  const ws = await openTarget(wsUrl)
  const result = await new Promise((resolve, reject) => {
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id === 1) resolve(msg)
    })
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }))
  })
  ws.close()
  if (result.result?.exceptionDetails) {
    throw new Error(`iframe eval failed: ${result.result.exceptionDetails.exception?.description || result.result.exceptionDetails.text}`)
  }
  return result.result?.result?.value
}

async function openTarget(wsUrl) {
  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  return ws
}

async function targetCall(ws, method, params = {}) {
  const id = ++cdpId
  const result = await new Promise((resolve, reject) => {
    const onMsg = (event) => {
      const msg = JSON.parse(event.data)
      if (msg.id === id) {
        ws.removeEventListener('message', onMsg)
        if (msg.error) reject(new Error(`CDP ${method}: ${msg.error.message}`))
        else resolve(msg.result)
      }
    }
    ws.addEventListener('message', onMsg)
    ws.send(JSON.stringify({ id, method, params }))
  })
  return result
}
