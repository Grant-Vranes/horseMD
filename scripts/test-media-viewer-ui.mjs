// E2E for read-only media viewer tabs (spec: docs/superpowers/specs/2026-09-14-pdf-image-viewer-design.md).
// Launches the BUILT app (background mode, no focus steal) with fixture files
// and locks:
//   1. PNG/SVG tabs render the image viewer (img loaded, toolbar present) —
//      NOT the textarea, NOT ProseMirror.
//   2. PDF tab renders the built-in PDF viewer iframe.
//   3. A .txt tab still uses the textarea (classification did not overreach).
//   4. A corrupt .png (garbage bytes) shows the inline error state.
//   5. Session restore reopens media tabs as viewers, not textareas.
import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { launchBuiltElectron, stopBuiltElectron } from './lib/electron-test-app.mjs'
import { sleep } from './lib/cdp.mjs'

const root = `/tmp/horsemd-media-viewer-${process.pid}`
const port = Number(process.env.CDP_PORT || 9865)

// 1×1 red PNG.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

// Minimal valid single-page PDF (offsets computed below so the xref is exact).
function minimalPdf() {
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    '4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 24 Tf 20 100 Td (HorseMD PDF) Tj ET\nendstream\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n'
  ]
  let body = '%PDF-1.4\n'
  const offsets = []
  for (const obj of objects) {
    offsets.push(body.length)
    body += obj
  }
  const xrefStart = body.length
  let xref = 'xref\n0 6\n0000000000 65535 f \n'
  for (const off of offsets) xref += `${String(off).padStart(10, '0')} 00000 n \n`
  const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  return body + xref + trailer
}

async function waitFor(evaluate, expression, message, attempts = 120) {
  for (let index = 0; index < attempts; index += 1) {
    if (await evaluate(expression)) return
    await sleep(200)
  }
  throw new Error(message)
}

// Activate a tab by clicking its DOM element (React onClick fires on .click()).
const activateTab = async (evaluate, titleSuffix) => {
  const ok = await evaluate(`(() => {
    const tabs = [...document.querySelectorAll('.tab')]
    const el = tabs.find((t) => (t.title || t.textContent || '').includes(${JSON.stringify(titleSuffix)}))
    if (!el) return false
    el.click()
    return true
  })()`)
  if (!ok) throw new Error(`tab not found: ${titleSuffix}`)
  await sleep(400)
}

const fixtureNames = { png: 'pixel.png', svg: 'vector.svg', pdf: 'doc.pdf', txt: 'notes.txt', bad: 'broken.png' }

const checkViewerState = async (evaluate) => evaluate(`(() => {
  const pane = document.querySelector('.editor-area')
  if (!pane) return null
  const visible = (sel) => [...pane.querySelectorAll(sel)].some((el) => el.offsetParent !== null)
  return {
    mediaViewer: visible('.media-viewer'),
    mediaImg: visible('.media-stage img'),
    mediaMissing: visible('.media-missing'),
    pdfFrame: visible('.pdf-viewer-frame'),
    textarea: visible('textarea'),
    proseMirror: visible('.ProseMirror'),
    imgLoaded: [...pane.querySelectorAll('.media-stage img')].some((el) => el.offsetParent !== null && el.naturalWidth > 0)
  }
})()`)

const expectState = async (evaluate, expected, message) => {
  for (let index = 0; index < 120; index += 1) {
    const state = await checkViewerState(evaluate)
    if (state && expected.every(([key, value]) => !!state[key] === value)) return state
    await sleep(200)
  }
  const state = await checkViewerState(evaluate)
  throw new Error(`${message} — state: ${JSON.stringify(state)}`)
}

// Fixtures MUST exist before launch: main's extractArgs filters argv files
// through FILE_EXTS at startup and enqueues them for the app-ready signal.
await rm(root, { recursive: true, force: true })
await mkdir(root, { recursive: true })
await writeFile(join(root, fixtureNames.png), Buffer.from(PNG_BASE64, 'base64'))
await writeFile(join(root, fixtureNames.svg),
  '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="18" fill="teal"/></svg>',
  'utf8')
await writeFile(join(root, fixtureNames.pdf), minimalPdf(), 'utf8')
await writeFile(join(root, fixtureNames.txt), 'plain text fixture\n', 'utf8')
// Valid extension, invalid content — exercises the img onError error state.
await writeFile(join(root, fixtureNames.bad), Buffer.from([0x00, 0x01, 0x02, 0x03]))

const app = await launchBuiltElectron({
  profileDir: join(root, 'profile'),
  port,
  appArgs: [
    join(root, fixtureNames.png),
    join(root, fixtureNames.svg),
    join(root, fixtureNames.pdf),
    join(root, fixtureNames.txt),
    join(root, fixtureNames.bad)
  ]
})

try {
  const { evaluate } = app
  await sleep(1500)

  // 1) corrupt png is active (opened last) and shows the inline error state.
  await expectState(evaluate, [['mediaMissing', true], ['mediaImg', false], ['textarea', false], ['proseMirror', false]], 'corrupt png did not show the error state')

  // 2) PNG tab → image viewer, loaded, no textarea/ProseMirror.
  await activateTab(evaluate, fixtureNames.png)
  await expectState(evaluate, [['mediaViewer', true], ['mediaImg', true], ['imgLoaded', true], ['textarea', false], ['proseMirror', false], ['mediaMissing', false]], 'png tab did not render a loaded image viewer')
  const toolbar = await evaluate(`!!document.querySelector('.media-toolbar')`)
  assert.ok(toolbar, 'image viewer toolbar missing')

  // 3) SVG tab → image viewer.
  await activateTab(evaluate, fixtureNames.svg)
  await expectState(evaluate, [['mediaViewer', true], ['imgLoaded', true], ['textarea', false], ['proseMirror', false]], 'svg tab did not render the image viewer')

  // 4) PDF tab → built-in viewer iframe.
  await activateTab(evaluate, fixtureNames.pdf)
  await expectState(evaluate, [['pdfFrame', true], ['textarea', false], ['proseMirror', false], ['mediaViewer', false]], 'pdf tab did not render the pdf viewer iframe')
  const pdfFrameInfo = await evaluate(`(() => {
    const pane = document.querySelector('.editor-area')
    const frame = [...pane.querySelectorAll('.pdf-viewer-frame')].find((el) => el.offsetParent !== null)
    if (!frame) return null
    let embed = null
    try { embed = !!frame.contentDocument?.querySelector('embed, plugin') } catch { embed = 'cross-origin' }
    return { src: frame.src, embed }
  })()`)
  assert.ok(pdfFrameInfo, 'pdf iframe not inspectable')
  assert.ok(/\.pdf$/i.test(pdfFrameInfo.src), `pdf iframe src is not the pdf file: ${pdfFrameInfo.src}`)
  assert.ok(pdfFrameInfo.embed !== false, `pdf viewer did not mount an embed/plugin: ${JSON.stringify(pdfFrameInfo)}`)

  // 5) txt tab still uses the textarea (classification did not overreach).
  await activateTab(evaluate, fixtureNames.txt)
  await expectState(evaluate, [['textarea', true], ['mediaViewer', false], ['proseMirror', false]], 'txt tab did not open in textarea')

  // 6) Session restore: relaunch with the same profile; media tabs reopen as
  // viewers. The corrupt png still opens (as a media tab with error state).
  await stopBuiltElectron(app)
  const relaunched = await launchBuiltElectron({
    profileDir: join(root, 'profile'),
    port,
    cleanProfile: false,
    appArgs: []
  })
  try {
    const evaluate2 = relaunched.evaluate
    await sleep(1800)
    await activateTab(evaluate2, fixtureNames.png)
    await expectState(evaluate2, [['mediaViewer', true], ['imgLoaded', true], ['textarea', false], ['proseMirror', false]], 'restored png tab did not reopen as a viewer')
    await activateTab(evaluate2, fixtureNames.pdf)
    await expectState(evaluate2, [['pdfFrame', true], ['textarea', false], ['proseMirror', false]], 'restored pdf tab did not reopen as the pdf viewer')
    console.log('media viewer UI OK')
  } finally {
    await stopBuiltElectron(relaunched)
  }
} finally {
  await rm(root, { recursive: true, force: true }).catch(() => {})
}
