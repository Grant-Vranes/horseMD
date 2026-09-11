// Excalidraw whiteboard UI regression. Run: npm run test:excalidraw-ui
// (requires `npm run build` first — launches the built app, background mode).
//
// Covers: lazy-canvas mount for .excalidraw tabs, corrupt-file fallback note,
// programmatic scene edit → debounced dirty → Cmd/S disk roundtrip.
// Scene edits are driven through window.__hmExcalidrawApi.updateScene (the
// official excalidrawAPI captured by ExcalidrawEditor) instead of simulating
// hand-drawn strokes.
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchBuiltElectron, stopBuiltElectron } from './lib/electron-test-app.mjs'
import { sleep } from './lib/cdp.mjs'

const port = Number(process.env.CDP_PORT || 9830)

async function waitFor(check, message, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    const r = await check()
    if (r) return r
    await sleep(250)
  }
  throw new Error(message)
}

// Minimal valid rectangle element (full excalidraw element shape).
const rectangle = JSON.stringify({
  id: 'test-rect-1', type: 'rectangle', x: 10, y: 10, width: 120, height: 80,
  angle: 0, strokeColor: '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid',
  strokeWidth: 2, strokeStyle: 'solid', roughness: 1, opacity: 100, groupIds: [],
  frameId: null, roundness: null, seed: 1, version: 1, versionNonce: 1,
  isDeleted: false, boundElements: null, updated: 1, link: null, locked: false
})

// Activate a tab by its title text (clicks the tab strip entry).
const activateTab = (title) => evaluate(`(() => {
  const tabs = [...document.querySelectorAll('.tab-title')]
    .filter((n) => n.offsetParent && n.textContent === ${JSON.stringify(title)})
  if (!tabs.length) return false
  tabs[0].closest('[class*=tab]').click()
  return true
})()`)

const dir = mkdtempSync(join(tmpdir(), 'horsemd-excalidraw-'))
const good = join(dir, 'scene.excalidraw')
writeFileSync(good, JSON.stringify({ type: 'excalidraw', version: 2, elements: [], appState: {}, files: {} }))
const bad = join(dir, 'broken.excalidraw')
writeFileSync(bad, '{ this is not json')

const app = await launchBuiltElectron({
  profileDir: `/tmp/horsemd-excalidraw-ui-${process.pid}`,
  port,
  appArgs: [good, bad]
})
const { evaluate, send } = app

try {
  // 1) Canvas editor mounts (lazy chunk loaded) for the excalidraw tab.
  await waitFor(
    () => evaluate(`!!document.querySelector('.excalidraw-host .excalidraw')`),
    'excalidraw canvas did not mount'
  )

  // 2) Corrupted file → blank canvas + one-shot note, no crash. Switch to the
  //    broken tab and back; the note only shows on the mounted corrupt tab.
  assert.ok(
    await waitFor(() => activateTab('broken.excalidraw'), 'broken tab not found'),
    'could not activate broken.excalidraw'
  )
  await waitFor(
    () => evaluate(`(() => {
      const notes = [...document.querySelectorAll('.excalidraw-corrupt-note')]
        .filter((n) => n.offsetParent)
      return notes.length > 0
    })()`),
    'corrupt-file note never appeared on the broken tab'
  )
  assert.ok(
    await evaluate(`!!document.querySelector('.excalidraw-host .excalidraw')`),
    'app did not stay alive on corrupt file'
  )
  assert.ok(await activateTab('scene.excalidraw'), 'could not switch back to scene tab')
  await sleep(400)

  // 3) Programmatic scene edit → debounced onChange marks dirty → save writes
  //    the live scene back to disk. Tab content is renderer state (the session
  //    dump stores only openPaths), so dirty is asserted via the tab marker.
  assert.ok(
    await evaluate(`![...document.querySelectorAll('.tab-close.dirty')].some((n) => n.offsetParent)`),
    'untouched whiteboard tab should not be dirty'
  )
  await evaluate(`window.__hmExcalidrawApi?.updateScene({ elements: [${rectangle}] })`)
  await waitFor(
    () => evaluate(`[...document.querySelectorAll('.tab-close.dirty')].some((n) => n.offsetParent)`),
    'debounced scene change never marked the tab dirty'
  )

  // Save via the floating Save FAB (the mouse path of file.save). CDP-injected
  // key events never reach Electron's native menu accelerator, so Cmd+S cannot
  // be automated without a product test hook — the FAB calls the identical
  // handlers.current.save() path.
  // NOTE: .hm-save-fab is position:fixed so offsetParent is always null; check
  // client rects instead.
  await waitFor(
    () => evaluate(`(() => { const el = document.querySelector('.hm-save-fab'); if (!el || !el.getClientRects().length) return false; el.click(); return true })()`),
    'Save FAB never appeared for the dirty whiteboard tab'
  )
  await waitFor(
    () => readFileSync(good, 'utf8').includes('test-rect-1'),
    'Cmd+S did not write the live scene to disk'
  )
  await waitFor(
    () => evaluate(`![...document.querySelectorAll('.tab-close.dirty')].some((n) => n.offsetParent)`),
    'dirty marker did not clear after save'
  )

  console.log('test-excalidraw-ui: all checks passed')
} finally {
  await stopBuiltElectron(app)
  rmSync(dir, { recursive: true, force: true })
}
