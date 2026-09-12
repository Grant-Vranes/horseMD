// Drawio diagram UI regression. Run: npm run test:drawio-ui
// (requires `npm run build` first — launches the built app, background mode).
//
// Covers: drawio iframe mount over drawio-local://, init handshake (vendored
// webapp answers init), corrupt-file fallback note, programmatic xml edit →
// debounced dirty → Save-FAB disk roundtrip, save-reopen fidelity without
// false dirty. Edits are driven through window.__hmDrawioApi.simulateChange
// (real cross-origin canvas interaction is not automatable from the host).
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchBuiltElectron, stopBuiltElectron } from './lib/electron-test-app.mjs'
import { sleep } from './lib/cdp.mjs'

const port = Number(process.env.CDP_PORT || 9831)

async function waitFor(check, message, attempts = 120) {
  for (let i = 0; i < attempts; i += 1) {
    const r = await check()
    if (r) return r
    await sleep(250)
  }
  throw new Error(message)
}

const GOOD_XML =
  '<mxfile host="horsemd" version="31.4.5">' +
  '<diagram id="page-1" name="Page-1">' +
  '<mxGraphModel dx="1422" dy="798" grid="1" gridSize="10" guides="1" tooltips="1" ' +
  'connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" ' +
  'math="0" shadow="0"><root><mxCell id="0" /><mxCell id="1" parent="0" /></root>' +
  '</mxGraphModel></diagram></mxfile>'

// Same document plus one visible rectangle mxCell.
const NEW_XML =
  '<mxfile host="horsemd" version="31.4.5">' +
  '<diagram id="page-1" name="Page-1">' +
  '<mxGraphModel dx="1422" dy="798" grid="1" gridSize="10" guides="1" tooltips="1" ' +
  'connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" ' +
  'math="0" shadow="0"><root><mxCell id="0" /><mxCell id="1" parent="0" />' +
  '<mxCell id="rect-1" value="test box" style="rounded=0;whiteSpace=wrap;html=1;" vertex="1" parent="1">' +
  '<mxGeometry x="120" y="80" width="160" height="80" as="geometry" /></mxCell></root>' +
  '</mxGraphModel></diagram></mxfile>'

// Activate a tab by its title text (clicks the tab strip entry).
const activateTab = (title) => evaluate(`(() => {
  const tabs = [...document.querySelectorAll('.tab-title')]
    .filter((n) => n.offsetParent && n.textContent === ${JSON.stringify(title)})
  if (!tabs.length) return false
  tabs[0].closest('[class*=tab]').click()
  return true
})()`)

const dir = mkdtempSync(join(tmpdir(), 'horsemd-drawio-'))
const good = join(dir, 'diagram.drawio')
writeFileSync(good, GOOD_XML)
const bad = join(dir, 'broken.drawio')
writeFileSync(bad, '<html>not a diagram</html>')

const app = await launchBuiltElectron({
  profileDir: `/tmp/horsemd-drawio-ui-${process.pid}`,
  port,
  appArgs: [good, bad]
})
const { evaluate } = app

try {
  // 1) Drawio editor mounts (lazy chunk + iframe) for the .drawio tab.
  await waitFor(
    () => evaluate(`!!document.querySelector('.drawio-host')`),
    'drawio host did not mount'
  )

  // 2) Init handshake completes: the vendored webapp loaded over
  //    drawio-local:// and answered init to our load message.
  await waitFor(
    () => evaluate(`(() => { const h = [...document.querySelectorAll('.drawio-host')].find((n) => n.offsetParent); return h && h.dataset.ready === 'true' })()`),
    'drawio init handshake never completed'
  )

  // 3) Corrupt file → blank canvas + one-shot note, no crash.
  assert.ok(
    await waitFor(() => activateTab('broken.drawio'), 'broken tab not found'),
    'could not activate broken.drawio'
  )
  await waitFor(
    () => evaluate(`(() => {
      const notes = [...document.querySelectorAll('.drawio-corrupt-note')]
        .filter((n) => n.offsetParent)
      return notes.length > 0
    })()`),
    'corrupt-file note never appeared on the broken tab'
  )
  assert.ok(
    await evaluate(`!!document.querySelector('.drawio-host')`),
    'app did not stay alive on corrupt file'
  )

  // 4) Programmatic xml edit → debounced dirty → save → disk roundtrip.
  assert.ok(await activateTab('diagram.drawio'), 'could not switch back to diagram tab')
  await sleep(400)
  // Untouched tab must NOT be dirty (baseline rule).
  assert.ok(
    await evaluate(`![...document.querySelectorAll('.tab-close.dirty')].some((n) => n.offsetParent)`),
    'untouched drawio tab should not be dirty'
  )
  assert.ok(
    await evaluate(`window.__hmDrawioApi && window.__hmDrawioApi.isReady() === true`),
    'test api missing or drawio editor not ready'
  )
  await evaluate(`window.__hmDrawioApi.simulateChange(${JSON.stringify(NEW_XML)})`)
  await waitFor(
    () => evaluate(`[...document.querySelectorAll('.tab-close.dirty')].some((n) => n.offsetParent)`),
    'debounced xml change never marked the tab dirty'
  )
  // Save via the floating Save FAB (the mouse path of file.save). CDP-injected
  // key events never reach Electron's native menu accelerator, so Cmd+S cannot
  // be automated without a product test hook — the FAB calls the identical
  // handlers.current.save() path. .hm-save-fab is position:fixed so check
  // client rects, not offsetParent.
  await waitFor(
    () => evaluate(`(() => { const el = document.querySelector('.hm-save-fab'); if (!el || !el.getClientRects().length) return false; el.click(); return true })()`),
    'Save FAB never appeared for the dirty drawio tab'
  )
  await waitFor(
    () => readFileSync(good, 'utf8') === NEW_XML,
    'save did not write the edited xml to disk'
  )
  await waitFor(
    () => evaluate(`![...document.querySelectorAll('.tab-close.dirty')].some((n) => n.offsetParent)`),
    'dirty marker did not clear after save'
  )
} finally {
  await stopBuiltElectron(app)
}

// 5) Save-reopen fidelity: a fresh instance opens the saved file, the editor
//    mounts and becomes ready, the file on disk is unchanged, and the freshly
//    opened (untouched) tab is NOT dirty.
const app2 = await launchBuiltElectron({
  profileDir: `/tmp/horsemd-drawio-reopen-${process.pid}`,
  port,
  appArgs: [good]
})
try {
  const { evaluate: evaluate2 } = app2
  await waitFor(
    () => evaluate2(`(() => { const h = [...document.querySelectorAll('.drawio-host')].find((n) => n.offsetParent); return h && h.dataset.ready === 'true' })()`),
    'reopened drawio tab never completed the init handshake'
  )
  assert.equal(readFileSync(good, 'utf8'), NEW_XML, 'saved file changed across reopen')
  assert.ok(
    await evaluate2(`![...document.querySelectorAll('.tab-close.dirty')].some((n) => n.offsetParent)`),
    'freshly reopened drawio tab must not be dirty'
  )
  console.log('test-drawio-ui: all checks passed')
} finally {
  await stopBuiltElectron(app2)
  rmSync(dir, { recursive: true, force: true })
}
