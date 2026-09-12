# Draw.io Local Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** HorseMD opens, edits, and saves `.drawio` files in a persistent tab editor backed by a locally-packaged diagrams.net webapp (offline, desktop-only), mirroring the existing Excalidraw whiteboard integration.

**Architecture:** A fetch script vendors the pinned drawio webapp into `resources/drawio/` (gitignored). The Electron main process serves it over a registered custom protocol `drawio-local://editor` and exposes the iframe URL via IPC. A lazy-loaded `DrawioEditor.jsx` hosts the iframe and speaks the drawio JSON embed protocol (`{action:'load', xml, autosave:1}` → `{event:'save', xml}`), feeding the existing tab save pipeline with Excalidraw-style baseline dirty-marking. Capabilities gate the feature off on mobile.

**Tech Stack:** Electron `protocol.handle` + `net.fetch`, drawio webapp v31.4.5 (draw.war), React lazy chunks, existing tab/editor-api/save IPC plumbing.

**Spec:** `docs/superpowers/specs/2026-09-12-drawio-integration-design.md`

## Global Constraints

- Version pin: drawio **v31.4.5** (`https://github.com/jgraph/drawio/releases/download/v31.4.5/draw.war`); record it in `scripts/fetch-drawio.mjs` and `resources/drawio/DRAWIO_VERSION` (generated).
- `resources/drawio/` must NOT be committed to git (54MB raw). Only the fetch script is committed.
- Draw.io iframe URL origin is exactly `drawio-local://editor`; every iframe→host message must be validated with `event.source === iframe.contentWindow` (spec risk section).
- `.drawio` must stay OUT of global search: only add it to `FILE_EXTS` in `src/main/index.js` (the `MD_RE`-based search pattern must not change).
- Desktop/mobile contract: add `drawio: true` to `src/preload/index.js` capabilities and `drawio: false` to `src/renderer/src/platform/capacitor-api.js` capabilities. Renderer code must guard `window.api?.capabilities?.drawio` AND `window.api?.drawio` (the Capacitor shim has no drawio API object).
- Code style: ES modules, React function components, 2-space indent, single quotes, no semicolons. Match nearby code.
- Keep `App.jsx` / `EditorArea.jsx` additions minimal — new logic goes into `components/DrawioEditor.jsx` and `lib/drawio-file.js`.
- Commands/menus: mirror the Excalidraw export command shape (`command-definitions.js` entry + `menuHandlers.js` handler + `COMMAND_PALETTE_ICONS` entry).
- i18n: every user-facing string goes into BOTH the English and Chinese dictionaries in `src/renderer/src/i18n.jsx`.
- Never mark tabs dirty from mount/init churn: first observed save serialization is a baseline (same rule as `ExcalidrawEditor.jsx`).
- All commits use concise imperative subjects; run `npm run build` before handing off.

---

### Task 1: Vendor script for the drawio webapp

**Files:**
- Create: `scripts/fetch-drawio.mjs`
- Modify: `package.json` (dist scripts, devDependency)
- Modify: `.gitignore`
- Generated (not committed): `resources/drawio/**`

**Interfaces:**
- Consumes: network access to github.com release assets.
- Produces: `resources/drawio/index.html` + full webapp tree on disk, and `resources/drawio/DRAWIO_VERSION` containing `31.4.5`. Later tasks (protocol handler, packaging) read this directory; nothing imports the script at runtime.

- [ ] **Step 1: Write the fetch script**

Create `scripts/fetch-drawio.mjs`:

```js
// Downloads the pinned diagrams.net webapp (draw.war) and unpacks it into
// resources/drawio/ for local iframe embedding. resources/drawio is
// gitignored — run this once per machine (npm run dist does it automatically).
// The version is pinned deliberately; upgrading drawio is an explicit
// human action (change PINNED_VERSION, re-run).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import extract from 'extract-zip'

const PINNED_VERSION = '31.4.5'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'resources', 'drawio')
const versionFile = join(target, 'DRAWIO_VERSION')

if (existsSync(versionFile) && readFileSync(versionFile, 'utf8').trim() === PINNED_VERSION) {
  console.log(`drawio v${PINNED_VERSION} already vendored at ${target}`)
  process.exit(0)
}

const url = `https://github.com/jgraph/drawio/releases/download/v${PINNED_VERSION}/draw.war`
const warPath = join(root, 'resources', `draw-${PINNED_VERSION}.war`)
mkdirSync(join(root, 'resources'), { recursive: true })

console.log(`Downloading ${url} ...`)
const res = await fetch(url, { redirect: 'follow' })
if (!res.ok) {
  console.error(`Download failed: HTTP ${res.status} ${res.statusText}`)
  process.exit(1)
}
const buf = Buffer.from(await res.arrayBuffer())
if (buf.length < 1024 * 1024) {
  console.error(`Downloaded file is suspiciously small (${buf.length} bytes) — aborting`)
  process.exit(1)
}
writeFileSync(warPath, buf)

console.log(`Unpacking into ${target} ...`)
rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
await extract(warPath, { dir: target })
rmSync(warPath, { force: true })

// Sanity checks: the files the iframe actually loads must exist.
for (const required of ['index.html', join('js', 'app.min.js')]) {
  if (!existsSync(join(target, required))) {
    console.error(`Vendored webapp is missing ${required} — the war layout may have changed`)
    process.exit(1)
  }
}
writeFileSync(versionFile, PINNED_VERSION + '\n')
console.log(`drawio v${PINNED_VERSION} vendored OK`)
```

Note: `extract-zip` resolves dirs lazily — it creates parent directories itself, so `mkdirSync(target)` before extraction is sufficient.

- [ ] **Step 2: Add devDependency and wire dist scripts**

Run:

```bash
npm install --save-dev extract-zip
```

In `package.json`, change:

```json
"dist": "node scripts/fetch-drawio.mjs && electron-vite build && electron-builder",
"dist:dir": "node scripts/fetch-drawio.mjs && electron-vite build && electron-builder --dir",
```

(Leave every other script untouched.)

- [ ] **Step 3: Gitignore the vendored tree**

Append to `.gitignore` (match the file's existing section style):

```
# Vendored diagrams.net webapp (scripts/fetch-drawio.mjs)
/resources/drawio/
```

- [ ] **Step 4: Run the script and verify output**

Run: `node scripts/fetch-drawio.mjs`
Expected: ends with `drawio v31.4.5 vendored OK`; `ls resources/drawio/index.html resources/drawio/js/app.min.js resources/drawio/DRAWIO_VERSION` all exist. Re-run it: expected `drawio v31.4.5 already vendored ...` (idempotent).

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch-drawio.mjs package.json package-lock.json .gitignore
git commit -m "feat(drawio): vendoring script for pinned diagrams.net webapp"
```

---

### Task 2: Main process — drawio-local protocol, editor URL IPC, FILE_EXTS

**Files:**
- Modify: `src/main/index.js` (~line 26 `FILE_EXTS`; top-of-file privileged schemes; inside `app.whenReady()` where other `protocol`/IPC setup lives; IPC handler registration area)

**Interfaces:**
- Consumes: `resources/drawio/` from Task 1.
- Produces: IPC channel `drawio:getEditorUrl` invoked as `window.api.drawio.getEditorUrl(lang)` where `lang` is `'zh'` or `'en'` (anything else → `'en'`); resolves to a string like `drawio-local://editor/index.html?embed=1&proto=json&ui=min&noExitBtn=1&spin=1&lang=zh`. Later tasks rely on the exact origin `drawio-local://editor` and these params.
- Produces: `FILE_EXTS` includes `'drawio'` (open dialog, launch args, sidebar tree, workspace tree). Global search pattern `MD_RE` must NOT change.

- [ ] **Step 1: Register the privileged scheme**

Near the top of `src/main/index.js`, below the existing `const FILE_RE = ...` declarations, add (must execute before `app.ready`):

```js
// diagrams.net editor iframe (see registerDrawioProtocol). standard+secure so
// the iframe has a real origin ("drawio-local://editor") for postMessage
// targetOrigin checks; supportFetchAPI lets the webapp fetch its own assets.
protocol.registerSchemesAsPrivileged([
  { scheme: 'drawio-local', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])
```

- [ ] **Step 2: Add the protocol handler function**

Add a module-level function (place it near the other filesystem-related helpers in `src/main/index.js`; if `src/main/filesystem.js` is a more natural home given how other handlers are split, put it there and import it — keep `index.js` assembly-only):

```js
// Serves the vendored diagrams.net webapp (resources/drawio, unpacked by
// scripts/fetch-drawio.mjs) over drawio-local://editor/... for the editor
// iframe. File reads are confined to the drawio root via path normalization.
function registerDrawioProtocol() {
  const drawioRoot = app.isPackaged
    ? join(process.resourcesPath, 'drawio')
    : join(app.getAppPath(), 'resources', 'drawio')

  protocol.handle('drawio-local', (request) => {
    const url = new URL(request.url)
    // Standard-scheme URLs are drawio-local://<host>/<path>; everything is
    // served from the host "editor" so the iframe origin is stable.
    const relPath = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html'
    const filePath = normalize(join(drawioRoot, relPath))
    if (!filePath.startsWith(normalize(drawioRoot + sep))) {
      return new Response('Forbidden', { status: 403 })
    }
    return net.fetch(pathToFileURL(filePath).toString())
  })
}
```

Adjust imports at the top of the file: add `protocol` to the existing `electron` import destructure (it currently has `app, BrowserWindow, ipcMain, Menu, shell, net, safeStorage, session, clipboard`), and `normalize` to the existing `node:path` import (which already has `sep`). `net` and `pathToFileURL` are already imported.

- [ ] **Step 3: Call the handler and add the IPC channel**

Inside `app.whenReady().then(...)`, next to where other IPC handlers are registered (before the window is created is fine), add:

```js
registerDrawioProtocol()

// Renderer asks for the packaged editor iframe URL. lang is 'zh' | 'en'
// (anything unknown falls back to 'en').
ipcMain.handle('drawio:getEditorUrl', (event, lang) => {
  const safeLang = lang === 'zh' ? 'zh' : 'en'
  const params = new URLSearchParams({
    embed: '1',
    proto: 'json',
    ui: 'min',
    noExitBtn: '1',
    spin: '1',
    lang: safeLang
  })
  return `drawio-local://editor/index.html?${params.toString()}`
})
```

Verify during implementation how `ipcMain.handle` registrations are structured in `index.js` (some flows delegate to `src/main/filesystem.js` with `registerFileSystemIpc`). Prefer following the existing delegation pattern if one exists for similar renderer-query IPC; otherwise the inline `ipcMain.handle` above is correct.

- [ ] **Step 4: Extend FILE_EXTS**

Change (around line 26):

```js
const FILE_EXTS = [...MD_EXTS, 'excalidraw', 'drawio']
```

and update the comment above it to mention `.drawio` alongside `.excalidraw`:

```js
// Openable file types: open-dialog filter, launch args, sidebar tree.
// Superset of MD_EXTS — .excalidraw/.drawio open in canvas editors but must
// stay OUT of global search (registerGlobalSearchIpc keeps MD_RE below).
```

Also update the comment at ~line 130 ("markdown + excalidraw") to "markdown + excalidraw + drawio". Do NOT touch `MD_RE`, the `registerGlobalSearchIpc` call, or the comment at ~line 349.

- [ ] **Step 5: Build to verify**

Run: `npm run build`
Expected: succeeds (main bundle compiles; protocol/IPC changes are runtime behavior verified in Task 8's UI test).

Manual smoke (optional but cheap): `npm start`, open the app, no startup errors in console. Note: full drawio roundtrip is verified by the CDP test in Task 8.

- [ ] **Step 6: Commit**

```bash
git add src/main/index.js
git commit -m "feat(drawio): drawio-local protocol, editor URL IPC, .drawio file type"
```

---

### Task 3: Preload API + capabilities (desktop and mobile shim)

**Files:**
- Modify: `src/preload/index.js` (~line 20 API block and ~line 154 capabilities object)
- Modify: `src/renderer/src/platform/capacitor-api.js` (~line 284 capabilities object)

**Interfaces:**
- Consumes: IPC channel `drawio:getEditorUrl` from Task 2.
- Produces: `window.api.drawio.getEditorUrl(lang)` → `Promise<string>` (desktop only); `window.api.capabilities.drawio === true` (desktop) / `false` (mobile). Tasks 4–7 guard on both.

- [ ] **Step 1: Preload API + capability**

In `src/preload/index.js`, next to the other `ipcRenderer.invoke` wrappers (near `saveAs`/`writeBinary`), add inside the `api` object:

```js
drawio: {
  getEditorUrl: (lang) => ipcRenderer.invoke('drawio:getEditorUrl', lang)
},
```

In the `capabilities` object (~line 154), add `drawio: true` right after `excalidraw: true`:

```js
nativeDropOpen: true,
excalidraw: true,
drawio: true
```

- [ ] **Step 2: Capacitor shim capability**

In `src/renderer/src/platform/capacitor-api.js` (~line 290), mirror the excalidraw style:

```js
excalidraw: false, // whiteboard canvas is desktop-only
drawio: false // packaged diagrams.net iframe is desktop-only
```

Do NOT add a drawio API object to the shim — mobile has no implementation, and renderer guards must tolerate `window.api.drawio === undefined`.

- [ ] **Step 3: Build to verify**

Run: `npm run build && npm run build:mobile`
Expected: both succeed (the mobile build compiles the same renderer sources).

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.js src/renderer/src/platform/capacitor-api.js
git commit -m "feat(drawio): preload editor URL API + desktop/mobile capabilities"
```

---

### Task 4: drawio-file.js helpers + paths.js predicate + unit test

**Files:**
- Modify: `src/renderer/src/paths.js` (~line 96, next to `EXCALIDRAW_RE`; plus `isPlainTextDoc` at ~line 99 — without this, `.drawio` falls into the plain-text branch and opens in a textarea!)
- Create: `src/renderer/src/lib/drawio-file.js`
- Test: `scripts/test-drawio-file.mjs`
- Modify: `package.json` (npm script)

**Interfaces:**
- Consumes: nothing.
- Produces (used by Tasks 5–7):
  - `DRAWIO_RE` (`/\.drawio$/i`), `isDrawioName(name)` — same shape as `EXCALIDRAW_RE`/`isExcalidrawName`.
  - `EMPTY_DRAWIO_XML` — a complete single-page `<mxfile>` document string.
  - `isValidDrawioXml(text)` — returns `true` when `text` contains `<mxfile` or `<mxGraphModel` (case-insensitive); else `false`.

- [ ] **Step 1: paths.js predicates**

In `src/renderer/src/paths.js`, extend the comment block and exports at ~line 94:

```js
// Excalidraw whiteboards and drawio diagrams: standalone files opened in
// dedicated canvas editors (lazy chunks). They are NOT plain-text docs (the
// textarea must not capture them) and are excluded from global search by the
// main process.
export const EXCALIDRAW_RE = /\.excalidraw$/i
export const isExcalidrawName = (name) => EXCALIDRAW_RE.test(name || '')
export const DRAWIO_RE = /\.drawio$/i
export const isDrawioName = (name) => DRAWIO_RE.test(name || '')

export const isPlainTextDoc = (tab) =>
  !!(tab && tab.path && !MD_DOC_RE.test(tab.path) && !EXCALIDRAW_RE.test(tab.path) && !DRAWIO_RE.test(tab.path))
```

(`isPlainTextDoc` gains only the `!DRAWIO_RE.test(tab.path)` conjunct; the rest stays verbatim.)

- [ ] **Step 2: Write the failing test**

Create `scripts/test-drawio-file.mjs`:

```js
// Unit checks for drawio-file helpers (no Electron needed).
// Run: npm run test:drawio-file
import assert from 'node:assert/strict'
import { EMPTY_DRAWIO_XML, isValidDrawioXml } from '../src/renderer/src/lib/drawio-file.js'

// Template is itself valid, single-page, and uncompressed.
assert.equal(isValidDrawioXml(EMPTY_DRAWIO_XML), true)
assert.ok(EMPTY_DRAWIO_XML.includes('<mxfile'))
assert.ok(EMPTY_DRAWIO_XML.includes('<diagram'))

// Valid variants a real .drawio file can take.
assert.equal(isValidDrawioXml('<mxfile version="31.4.5"><diagram id="a" name="Page-1">x</diagram></mxfile>'), true)
assert.equal(isValidDrawioXml('<mxGraphModel dx="0" dy="0"><root/></mxGraphModel>'), true)
assert.equal(isValidDrawioXml('  <MxFile><diagram/></MxFile>  '), true) // case-insensitive, padded

// Compressed (deflate+base64) payloads never start with '<mxfile' but the
// mxGraphModel marker check still applies to uncompressed internals; a fully
// opaque compressed body must be rejected so the corrupt-fallback fires.
assert.equal(isValidDrawioXml('eNqljTEKgDAMBL9 '), false)
assert.equal(isValidDrawioXml(''), false)
assert.equal(isValidDrawioXml(null), false)
assert.equal(isValidDrawioXml(undefined), false)
assert.equal(isValidDrawioXml('{ not xml }'), false)
assert.equal(isValidDrawioXml('<html><body>x</body></html>'), false)

console.log('drawio-file tests passed')
```

Add to `package.json` scripts (alphabetically near the other small test scripts):

```json
"test:drawio-file": "node scripts/test-drawio-file.mjs",
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:drawio-file`
Expected: FAIL — `Cannot find module '../src/renderer/src/lib/drawio-file.js'`.

- [ ] **Step 4: Implement drawio-file.js**

Create `src/renderer/src/lib/drawio-file.js`:

```js
// Drawio (.drawio) file helpers: the minimal valid document used when creating
// a new diagram, and the validity rule for loaded files. .drawio content is
// XML (`<mxfile>` wrapping one or more `<diagram>` pages, optionally
// deflate+base64 compressed). We never parse the XML semantics — XML passes
// through to the drawio editor verbatim; this module only decides
// "blank canvas vs corrupt file" and provides the empty template.
export const EMPTY_DRAWIO_XML =
  '<mxfile host="horsemd" version="31.4.5">' +
  '<diagram id="page-1" name="Page-1">' +
  '<mxGraphModel dx="1422" dy="798" grid="1" gridSize="10" guides="1" tooltips="1" ' +
  'connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="850" pageHeight="1100" ' +
  'math="0" shadow="0"><root><mxCell id="0" /><mxCell id="1" parent="0" /></root>' +
  '</mxGraphModel></diagram></mxfile>'

// A loaded file is treated as drawio XML when it carries one of the known
// root markers. Fully-compressed bodies (deflate+base64, no '<' at all) are
// rejected on purpose: drawio re-serializes them on first save, and the
// corrupt fallback (blank canvas + one-shot note) is the safer default for
// anything we cannot recognize.
export function isValidDrawioXml(text) {
  if (typeof text !== 'string') return false
  return /<mxfile[\s>]/i.test(text) || /<mxGraphModel[\s>]/i.test(text)
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:drawio-file`
Expected: `drawio-file tests passed`.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/paths.js src/renderer/src/lib/drawio-file.js scripts/test-drawio-file.mjs package.json
git commit -m "feat(drawio): file predicates, empty template, validity rule + unit test"
```

---

### Task 5: DrawioEditor.jsx component + CSS

**Files:**
- Create: `src/renderer/src/components/DrawioEditor.jsx`
- Modify: `src/renderer/src/styles/app.css` (next to the `.excalidraw-*` rules ~line 2460)

**Interfaces:**
- Consumes: `window.api.drawio.getEditorUrl(lang)` (Task 2/3), `isValidDrawioXml` (Task 4), `useI18n()` (existing, provides `{ t, language }` — verify the exact exported members during implementation and match what `ExcalidrawEditor.jsx` uses).
- Produces (used by Tasks 6–7):
  - Component `DrawioEditor` with props `{ tab, onChange, registerApi }` — identical contract to `ExcalidrawEditor`.
  - `registerApi` receives `{ getXml: () => string, exportPng: () => Promise<string /*dataURL*/>, exportSvg: () => Promise<string /*dataURL*/> }` or `null` on unmount.
  - DOM: `.drawio-host` wrapper; `.drawio-corrupt-note` one-shot notice; `.drawio-load-error` + retry button on frame load failure; `data-ready="true"` attribute on `.drawio-host` once the `init` handshake completes (UI test hook).
  - Test hook: `window.__hmDrawioApi = { simulateChange(xml), isReady() }` while mounted (mirrors `window.__hmExcalidrawApi`).

- [ ] **Step 1: Write the component**

Create `src/renderer/src/components/DrawioEditor.jsx` with EXACTLY this content:

```jsx
// Drawio diagram tab editor — embeds the locally-vendored diagrams.net webapp
// (resources/drawio, served over drawio-local://editor) inside an iframe.
// Imported ONLY via lazy() from EditorArea so the app shell and the Milkdown
// editor chunk never evaluate it.
//
// Contract with EditorArea/App:
//   props.tab          doc tab whose `content` is .drawio XML text
//   props.onChange     (xml) => void — debounced save-message feed into
//                      updateContent (dirty marking is tab-state's job)
//   props.registerApi  (api|null) => void — exposes getXml/exportPng/exportSvg
//                      to the save/export pipelines via editorApis
//
// Embed protocol (drawio ?embed=1&proto=json), JSON-stringified messages:
//   iframe -> host: {event: 'init'}                     editor ready
//   host   -> iframe: {action: 'load', xml, autosave: 1}
//   iframe -> host: {event: 'save', xml}                content changed
//   host   -> iframe: {action: 'export', format}        export request
//   iframe -> host: {event: 'export', format, data}     data URL response
import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n.jsx'
import { isValidDrawioXml } from '../lib/drawio-file.js'

const CHANGE_DEBOUNCE_MS = 500
const EXPORT_TIMEOUT_MS = 20000
const INIT_TIMEOUT_MS = 30000
const FRAME_ORIGIN = 'drawio-local://editor'

export default function DrawioEditor({ tab, onChange, registerApi }) {
  const { t, language } = useI18n()
  // Parse exactly once per mount; tab.content changes only through our own
  // onChange/save cycle, and the load message must not reset while editing.
  const [initialXml] = useState(() => {
    const raw = tab.content || ''
    return isValidDrawioXml(raw) ? raw : ''
  })
  const [corrupt] = useState(() => initialXml === '' && !!(tab.content || '').trim())
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [frameUrl, setFrameUrl] = useState(null)
  const [frameNonce, setFrameNonce] = useState(0)
  const frameRef = useRef(null)
  const latestXmlRef = useRef(initialXml)
  // Excalidraw-style baseline: the first observed save is a baseline, not an
  // edit — drawio re-serializes XML in its own canonical (often compressed)
  // form on load, and init churn must never mark the tab dirty.
  const lastBaselineRef = useRef(null)
  const timerRef = useRef(null)
  // Pending {action:'export'} requests keyed by format.
  const exportWaitersRef = useRef(new Map())
  const readyRef = useRef(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const publishChange = useCallback((xml) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      if (xml === lastBaselineRef.current) return
      lastBaselineRef.current = xml
      onChangeRef.current?.(xml)
    }, CHANGE_DEBOUNCE_MS)
  }, [])

  const postToFrame = useCallback((payload) => {
    frameRef.current?.contentWindow?.postMessage(JSON.stringify(payload), FRAME_ORIGIN)
  }, [])

  const handleFrameMessage = useCallback((event) => {
    // Only accept messages from OUR iframe — never from stray windows.
    if (event.source !== frameRef.current?.contentWindow) return
    if (event.origin !== FRAME_ORIGIN) return
    let msg = null
    try {
      msg = JSON.parse(typeof event.data === 'string' ? event.data : '')
    } catch {
      return
    }
    if (!msg || typeof msg !== 'object') return
    if (msg.event === 'init') {
      readyRef.current = true
      setReady(true)
      setLoadError(false)
      // xml omitted for a blank canvas — drawio substitutes its empty diagram.
      postToFrame({ action: 'load', xml: initialXml || undefined, autosave: 1 })
      return
    }
    if (msg.event === 'save' && typeof msg.xml === 'string' && msg.xml.length > 0) {
      latestXmlRef.current = msg.xml
      if (lastBaselineRef.current === null) {
        // First observation after mount: baseline, not an edit.
        lastBaselineRef.current = msg.xml
        return
      }
      publishChange(msg.xml)
      return
    }
    if (msg.event === 'export' && typeof msg.data === 'string') {
      const waiter = exportWaitersRef.current.get(msg.format)
      if (waiter) {
        exportWaitersRef.current.delete(msg.format)
        waiter.resolve(msg.data)
      }
    }
    // 'exit'/'openLink'/'resize'/'draft' are ignored — the tab owns the
    // document lifecycle and noExitBtn=1 hides the exit affordance.
  }, [initialXml, postToFrame, publishChange])

  useEffect(() => {
    let cancelled = false
    window.addEventListener('message', handleFrameMessage)
    // Resolve the packaged editor URL through the main process (dev/prod
    // resource locations differ). Missing desktop API = capability off.
    Promise.resolve(window.api?.drawio?.getEditorUrl?.(language))
      .then((url) => {
        if (cancelled) return
        if (!url) {
          setLoadError(true)
          return
        }
        setFrameUrl(url)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
    return () => {
      cancelled = true
      window.removeEventListener('message', handleFrameMessage)
    }
  }, [handleFrameMessage, language])

  // Frame loaded but never sent init (broken vendored build, protocol
  // failure): surface the retry affordance.
  useEffect(() => {
    if (!frameUrl || ready) return
    const timer = setTimeout(() => {
      if (!readyRef.current) setLoadError(true)
    }, INIT_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [frameUrl, ready, frameNonce])

  // A pending debounce means the last edit never reached the parent. Flush it
  // synchronously so closing/switching cannot lose it (same rule as
  // ExcalidrawEditor's unmount flush).
  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
        const xml = latestXmlRef.current
        if (xml && xml !== lastBaselineRef.current) {
          lastBaselineRef.current = xml
          onChangeRef.current?.(xml)
        }
      }
    },
    []
  )

  const retry = useCallback(() => {
    setLoadError(false)
    setReady(false)
    readyRef.current = false
    lastBaselineRef.current = null
    setFrameNonce((n) => n + 1)
  }, [])

  // Save/export pipeline API. getXml returns the LIVE xml — null only when we
  // have nothing usable (callers must then abort saving, same as the rich
  // editor null path). Export posts {action:'export'} and waits for the
  // matching {event:'export'} data URL.
  const registerApiRef = useRef(registerApi)
  registerApiRef.current = registerApi
  useEffect(() => {
    if (!ready) return
    const requestExport = (format) =>
      new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          exportWaitersRef.current.delete(format)
          reject(new Error('drawio export timed out'))
        }, EXPORT_TIMEOUT_MS)
        exportWaitersRef.current.set(format, {
          resolve: (data) => {
            clearTimeout(timeout)
            resolve(data)
          },
          reject
        })
        postToFrame({ action: 'export', format })
      })
    const api = {
      getXml: () => {
        const xml = latestXmlRef.current
        return isValidDrawioXml(xml) ? xml : null
      },
      exportPng: () => requestExport('png'),
      exportSvg: () => requestExport('svg')
    }
    registerApiRef.current?.(api)
    return () => registerApiRef.current?.(null)
  }, [ready, postToFrame])

  // Test hook (CDP scripts drive content changes programmatically — real
  // cross-origin canvas interaction is not automatable from the host page).
  useEffect(() => {
    window.__hmDrawioApi = {
      simulateChange: (xml) => {
        latestXmlRef.current = xml
        if (lastBaselineRef.current === null) {
          lastBaselineRef.current = xml
          return
        }
        publishChange(xml)
      },
      isReady: () => ready
    }
    return () => {
      delete window.__hmDrawioApi
    }
  }, [ready, publishChange])

  return (
    <div className={`drawio-host${ready ? ' drawio-ready' : ''}`} data-ready={ready ? 'true' : 'false'}>
      {corrupt && <div className="drawio-corrupt-note">{t('drawio.corruptNote')}</div>}
      {loadError && (
        <div className="drawio-load-error" role="status">
          {t('drawio.loadError')}
          <button onClick={retry}>{t('drawio.retry')}</button>
        </div>
      )}
      {frameUrl && !loadError && (
        <iframe
          key={frameNonce}
          ref={frameRef}
          className="drawio-frame"
          title="drawio"
          sandbox="allow-scripts allow-same-origin allow-popups allow-downloads allow-forms"
          src={frameUrl}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: CSS**

In `src/renderer/src/styles/app.css`, directly after the `.excalidraw-mobile-placeholder` block (~line 2468), add:

```css
.drawio-host { position: relative; width: 100%; height: 100%; min-height: 0; }
.drawio-frame { width: 100%; height: 100%; border: 0; background: var(--hm-bg, #fff); }
.drawio-corrupt-note {
  position: absolute; top: 8px; left: 50%; transform: translateX(-50%);
  z-index: 5; padding: 4px 12px; border-radius: 6px;
  font-size: 12px; pointer-events: none;
}
.drawio-load-error {
  position: absolute; inset: 0; display: flex; flex-direction: column;
  align-items: center; justify-content: center; gap: 8px; font-size: 13px;
}
```

Match the visual token conventions of `.excalidraw-corrupt-note` (copy its background/color/border values rather than inventing new ones).

- [ ] **Step 3: Build to verify**

Run: `npm run build`
Expected: succeeds. (Behavior verified in Task 8.)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/DrawioEditor.jsx src/renderer/src/styles/app.css
git commit -m "feat(drawio): iframe tab editor component with embed protocol"
```

---

### Task 6: EditorArea wiring

**Files:**
- Modify: `src/renderer/src/components/shell/EditorArea.jsx`

**Interfaces:**
- Consumes: `isDrawioName` (Task 4), `DrawioEditor` (Task 5), `window.api?.capabilities?.drawio` (Task 3).
- Produces: `.drawio` tabs render the drawio editor instead of the rich/textarea editors; `onChange` feeds `updateContent(tab.id, xml, false)`; `registerApi` feeds `registerEditorApi(tab.id, api)`.

- [ ] **Step 1: Imports**

In `EditorArea.jsx`:

```jsx
import { isDrawioName, isExcalidrawName, isPlainTextDoc, shouldUseRichContentVisibility } from '../../paths.js'
const DrawioEditor = lazy(() => import('../DrawioEditor.jsx'))
```

(Extend the existing import lines; keep the lazy call below the react import.)

- [ ] **Step 2: Tab classification**

Inside the `tabs.map` body, next to the excalidraw classification (~lines 120–124), add and thread `!drawioDoc` into every markdown-surface condition:

```jsx
const drawioDoc = isDrawioName(tab.path)
const drawioEnabled = window.api?.capabilities?.drawio === true
const isSourceRichSplit = sourceRichSplitMode && isLeft && !plainText && !heavyAsSource && !excalidrawDoc && !drawioDoc
const sourceForActiveRich = (sourceMode || isSourceRichSplit) && isLeft && !plainText && !heavyAsSource && !excalidrawDoc && !drawioDoc
const richEligible = !plainText && !heavyAsSource && !excalidrawDoc && !drawioDoc
```

(`usesTextarea` needs no change: `plainText`/`heavyAsSource` are false for `.drawio`, and `sourceForActiveRich` now excludes it.)

- [ ] **Step 3: Mount branch**

Immediately after the existing `if (excalidrawDoc && shouldMountExcalidraw) { ... }` block, add the mirror branch:

```jsx
if (drawioDoc && (inView || mountedIds.has(tab.id))) {
  const setDrawioHost = (el) => {
    if (el) {
      editorHosts.current[tab.id] = el
      if (isLeft) editorHostRef.current = el
      return
    }
    const existing = editorHosts.current[tab.id]
    delete editorHosts.current[tab.id]
    if (isLeft && (!existing || editorHostRef.current === existing)) editorHostRef.current = null
  }
  nodes.push(
    <div
      key={`drawio:${tab.id}:${tab.reloadNonce}`}
      className={`editor-scroll drawio-scroll${paneClass}`}
      ref={setDrawioHost}
      style={{ display: inView ? undefined : 'none', order, flex: paneFlex }}
      onFocusCapture={() => onPaneFocus('rich')}
      onMouseDownCapture={() => onPaneFocus('rich')}
    >
      {drawioEnabled ? (
        <Suspense fallback={editorChunkFallback}>
          <DrawioEditor
            tab={tab}
            onChange={(xml) => updateContent(tab.id, xml, false)}
            registerApi={(api) => registerEditorApi(tab.id, api)}
          />
        </Suspense>
      ) : (
        <div className="excalidraw-mobile-placeholder" role="status">
          {t('drawio.mobilePlaceholder')}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Build + manual smoke**

Run: `npm run build && node scripts/fetch-drawio.mjs && npm start`
Expected: app starts cleanly with no drawio tab open. (Full behavior check is Task 8.)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/shell/EditorArea.jsx
git commit -m "feat(drawio): route .drawio tabs to the drawio editor in EditorArea"
```

---

### Task 7: App.jsx save/export pipeline, commands, Sidebar entry, i18n

**Files:**
- Modify: `src/renderer/src/App.jsx` (imports ~line 63; `getMarkdownForTab` ~line 526; `exportExcalidrawImage` ~line 548; `getSettledMarkdownForTab` ~line 576; commands object ~line 651; Topbar props ~line 1157)
- Modify: `src/renderer/src/components/shell/Topbar.jsx` (prop passthrough ~lines 32/67)
- Modify: `src/renderer/src/components/Tabs.jsx` (import ~line 4; tab menu ~line 214)
- Modify: `src/renderer/src/lib/menuHandlers.js` (~line 27 icons map, ~line 113 destructure, ~line 156 handlers)
- Modify: `src/renderer/src/lib/commands/command-definitions.js` (after the excalidraw export entries ~line 155)
- Modify: `src/renderer/src/components/Sidebar.jsx` (~line 13 import, ~line 91 new-diagram starter, ~line 133 empty-content commit, ~line 438 button)
- Modify: `src/renderer/src/components/icons.jsx` (add `diagram` icon if no suitable existing one)
- Modify: `src/renderer/src/i18n.jsx` (en ~line 218/730, zh ~line 949/1458)

**Interfaces:**
- Consumes: `isDrawioName`, `EMPTY_DRAWIO_XML` (Task 4); editor api `{ getXml, exportPng, exportSvg }` (Task 5); `window.api.saveAs` / `window.api.writeBinary` / `window.api.writeFile` (existing).
- Produces: `.drawio` tabs save via the existing `saveTab` durability path; tab context menu + command palette export PNG/SVG for `.drawio` tabs; sidebar "new diagram" entry creating `untitled.drawio` with `EMPTY_DRAWIO_XML`; i18n keys `drawio.corruptNote`, `drawio.mobilePlaceholder`, `drawio.loadError`, `drawio.retry`, `side.newDiagram`, `cmd.exportDrawioPng`, `cmd.exportDrawioSvg`, `error.drawioExportUnavailable` (en + zh).

- [ ] **Step 1: App.jsx — save durability branches**

Extend the import from `./paths.js` with `isDrawioName`. In `getMarkdownForTab` (~line 526) add a drawio branch BEFORE the `flushMarkdown` path, mirroring the excalidraw one:

```js
// Drawio durability boundary: the LIVE xml from the iframe channel — null
// means serialization failed and callers must abort rather than resurrect
// stale tab.content (same rule as the rich editors).
if (anyEditorApi?.getXml) return anyEditorApi.getXml()
```

In `getSettledMarkdownForTab` (~line 576), add the identical branch next to the `getSceneJson` one.

- [ ] **Step 2: App.jsx — export callback**

After `exportExcalidrawImage` (~line 548), add:

```js
const exportDrawioImage = useCallback(async (id, format) => {
  const tab = tabsRef.current.find((x) => x.id === id)
  if (!tab || !isDrawioName(tab.path)) return
  const api = editorApis.current[id]
  if (!api?.exportPng) {
    window.alert(tRef.current('error.drawioExportUnavailable'))
    return
  }
  const base = (tab.title || 'diagram').replace(/\.drawio$/i, '')
  const target = await window.api.saveAs(`${base}.${format}`, {
    filters: [{ name: format.toUpperCase(), extensions: [format] }]
  })
  if (!target) return
  try {
    const dataUrl = format === 'png' ? await api.exportPng() : await api.exportSvg()
    if (format === 'png') {
      // fs:writeBinary expects BARE base64 (no data: prefix) — same contract
      // excalidraw's blobToBase64 honors (see lib/excalidraw-export.js).
      await window.api.writeBinary(target, dataUrl.split(',')[1] || '')
    } else {
      // SVG arrives as a data URL; decode to UTF-8 text for writeFile.
      const bin = atob(dataUrl.split(',')[1] || '')
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
      await window.api.writeFile(target, new TextDecoder().decode(bytes))
    }
  } catch (e) {
    window.alert((tRef.current('error.exportFailed') || 'Export failed: ') + (e?.message || e))
  }
}, [editorApis, tabsRef, tRef])
```

(This mirrors the shape of `exportExcalidrawImage` exactly — save dialog first, then IPC write, then error alert.)

- [ ] **Step 3: App.jsx — command plumbing + Topbar chain**

In the handlers object (~line 651, next to `exportExcalidraw`):

```js
exportDrawio: (format) => {
  if (activeIdRef.current) exportDrawioImage(activeIdRef.current, format)
},
```

On the `<Topbar ...>` JSX (~line 1157), add `onExportDrawio={exportDrawioImage}`.

In `src/renderer/src/components/shell/Topbar.jsx`: add `onExportDrawio,` to the destructure (~line 32) and `onExportDrawio={onExportDrawio}` in the `<Tabs ...>` call (~line 67).

In `src/renderer/src/components/Tabs.jsx`: extend the paths import with `isDrawioName`; after the excalidraw export block (~line 214), add:

```jsx
{isDrawioName(tab.title) && window.api.capabilities?.drawio && (
  <>
    <button className="tab-menu-item" onClick={run(() => onExportDrawio?.(tab.id, 'png'))}>
      {t('cmd.exportDrawioPng')}
    </button>
    <button className="tab-menu-item" onClick={run(() => onExportDrawio?.(tab.id, 'svg'))}>
      {t('cmd.exportDrawioSvg')}
    </button>
  </>
)}
```

Add `onExportDrawio,` to the Tabs destructure (~line 26).

- [ ] **Step 4: Command definitions + palette**

In `src/renderer/src/lib/commands/command-definitions.js`, after the `file.exportExcalidrawSvg` entry (~line 155):

```js
{
  id: 'file.exportDrawioPng',
  handler: 'exportDrawioPng',
  titleKey: 'cmd.exportDrawioPng',
  category: COMMAND_CATEGORIES.FILE,
  context: COMMAND_CONTEXTS.DOCUMENT,
  defaultKeybindings: [],
  electronAccelerator: true,
  capability: 'drawio',
  palette: true
},
{
  id: 'file.exportDrawioSvg',
  handler: 'exportDrawioSvg',
  titleKey: 'cmd.exportDrawioSvg',
  category: COMMAND_CATEGORIES.FILE,
  context: COMMAND_CONTEXTS.DOCUMENT,
  defaultKeybindings: [],
  electronAccelerator: true,
  capability: 'drawio',
  palette: true
},
```

In `src/renderer/src/lib/menuHandlers.js`:
- `COMMAND_PALETTE_ICONS` (~line 27): add `'file.exportDrawioPng': 'file',` and `'file.exportDrawioSvg': 'file',`.
- Destructure (~line 113): add `exportDrawio,`.
- Handlers (~line 156):

```js
exportDrawioPng: () => exportDrawio?.('png'),
exportDrawioSvg: () => exportDrawio?.('svg'),
```

- [ ] **Step 5: Sidebar new-diagram entry**

In `src/renderer/src/components/Sidebar.jsx`:
- Import: `import { EMPTY_DRAWIO_XML } from '../lib/drawio-file.js'`.
- Starter (~line 91, next to `startNewWhiteboard`):

```js
// Start inline creation for a drawio diagram
const startNewDiagram = (dirNode) => {
  const dir = dirNode ? dirNode.path : defaultRoot
  if (!dir) return
  setCreating({ dir, type: 'file', value: 'untitled.drawio', defaultExt: '.drawio' })
  setExpanded((s) => new Set(s).add(dir))
  if (!childrenMap[dir]) loadDir(dir)
}
```

- Empty-content commit (~line 133): change

```js
fileName.toLowerCase().endsWith('.excalidraw') ? EMPTY_EXCALIDRAW_SCENE : ''
```

to

```js
fileName.toLowerCase().endsWith('.excalidraw')
  ? EMPTY_EXCALIDRAW_SCENE
  : fileName.toLowerCase().endsWith('.drawio')
    ? EMPTY_DRAWIO_XML
    : ''
```

- Header button (~line 438, next to the whiteboard button):

```jsx
{window.api?.capabilities?.drawio && (
  <button title={t('side.newDiagram')} onClick={() => startNewDiagram(null)}>
    <Icon name="diagram" size={15} />
  </button>
)}
```

- In `src/renderer/src/components/icons.jsx`: check whether a suitable diagram/flow icon already exists; if not, add a `diagram` entry modeled on the existing `whiteboard` icon (simple 24×24 stroke SVG — three boxes connected by lines is fine). Do not copy from external icon sets with incompatible licenses; draw a minimal original glyph or reuse an existing in-repo icon shape.

- [ ] **Step 6: i18n keys**

In `src/renderer/src/i18n.jsx` — English dictionary (near the excalidraw block ~line 729 and the error keys ~line 218):

```js
// drawio diagrams
'drawio.corruptNote': 'File is not a valid drawio document — showing a blank canvas',
'drawio.mobilePlaceholder': 'Diagram editing is currently desktop-only',
'drawio.loadError': 'The drawio editor could not be loaded',
'drawio.retry': 'Retry',
'side.newDiagram': 'New Diagram',
'cmd.exportDrawioPng': 'Export Diagram as PNG',
'cmd.exportDrawioSvg': 'Export Diagram as SVG',
```

and near `error.excalidrawExportUnavailable` (~line 218):

```js
'error.drawioExportUnavailable': 'Diagram editor is not ready yet — please try again in a moment',
```

Chinese dictionary (mirror locations ~line 949/1458):

```js
// drawio 图表
'drawio.corruptNote': '文件内容不是有效的 drawio 文档，已显示为空白画布',
'drawio.mobilePlaceholder': '图表编辑目前仅桌面版支持',
'drawio.loadError': 'drawio 编辑器未能加载',
'drawio.retry': '重试',
'side.newDiagram': '新建绘图',
'cmd.exportDrawioPng': '导出图表为 PNG',
'cmd.exportDrawioSvg': '导出图表为 SVG',
```

```js
'error.drawioExportUnavailable': '图表编辑器尚未就绪，请稍候重试',
```

- [ ] **Step 7: Build + unit tests**

Run: `npm run build && npm run test:drawio-file`
Expected: both pass.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/App.jsx src/renderer/src/components/shell/Topbar.jsx src/renderer/src/components/Tabs.jsx src/renderer/src/lib/menuHandlers.js src/renderer/src/lib/commands/command-definitions.js src/renderer/src/components/Sidebar.jsx src/renderer/src/components/icons.jsx src/renderer/src/i18n.jsx
git commit -m "feat(drawio): save/export pipeline, commands, sidebar entry, i18n"
```

---

### Task 8: UI regression test, version bump, docs, full verification

**Files:**
- Create: `scripts/test-drawio-ui.mjs`
- Modify: `package.json` (script + version `0.13.207` → `0.13.208`)
- Modify: `CHANGELOG.md`
- Modify: `docs/manual-test-checklist.md`
- Create: `guide/` drawio page (follow `docs/user-guide-maintenance.md` for the exact page structure/metadata requirements)

**Interfaces:**
- Consumes: everything from Tasks 1–7; `launchBuiltElectron` from `scripts/lib/electron-test-app.mjs` (background mode default, no native focus); `window.__hmDrawioApi.simulateChange` test hook (Task 5).
- Produces: `npm run test:drawio-ui` regression entry.

- [ ] **Step 1: Write the UI regression script**

Create `scripts/test-drawio-ui.mjs`, modeled on `scripts/test-excalidraw-ui.mjs` (same `launchBuiltElectron` + `waitFor` skeleton — copy its imports, `waitFor`, and `activateTab` helpers verbatim from that file; use a different default CDP port, e.g. `9831`, and a distinct tmpdir prefix `horsemd-drawio-`):

Coverage (in order, each with an assert + failure message):

1. Create fixture files:

```js
const good = join(dir, 'diagram.drawio')
writeFileSync(good, EMPTY_DRAWIO_SNIPPET) // inline copy of a minimal <mxfile> doc
const bad = join(dir, 'broken.drawio')
writeFileSync(bad, '<html>not a diagram</html>')
```

Launch with `appArgs: [good, bad]`.

2. Drawio tab mounts: `waitFor(() => evaluate(`!!document.querySelector('.drawio-host')`), 'drawio host did not mount')`.
3. Handshake completes: `waitFor(() => evaluate(`(() => { const h = [...document.querySelectorAll('.drawio-host')].find((n) => n.offsetParent); return h && h.dataset.ready === 'true' })()`), 'drawio init handshake never completed')` — this proves the vendored webapp loaded over `drawio-local://` and answered `init`.
4. Corrupt fallback: activate `broken.drawio`, assert a visible `.drawio-corrupt-note`, no crash.
5. Programmatic edit → debounced dirty → save → disk roundtrip (mirror the
   excalidraw test's exact mechanics: `.tab-close.dirty` marker, Save FAB —
   CDP key events never reach Electron's native menu accelerator):

```js
// Untouched tab must NOT be dirty (baseline rule)
assert.ok(
  await evaluate(`![...document.querySelectorAll('.tab-close.dirty')].some((n) => n.offsetParent)`),
  'untouched drawio tab should not be dirty'
)
const newXml = GOOD_XML_WITH_RECTANGLE // an <mxfile> whose diagram contains one mxCell rectangle
assert.ok(
  await evaluate(`window.__hmDrawioApi && window.__hmDrawioApi.isReady() === true`),
  'test api missing or editor not ready'
)
await evaluate(`window.__hmDrawioApi.simulateChange(${JSON.stringify(newXml)})`)
await waitFor(
  () => evaluate(`[...document.querySelectorAll('.tab-close.dirty')].some((n) => n.offsetParent)`),
  'debounced xml change never marked the tab dirty'
)
// Save via the floating Save FAB (identical handlers.current.save() path;
// .hm-save-fab is position:fixed so check client rects, not offsetParent).
await waitFor(
  () => evaluate(`(() => { const el = document.querySelector('.hm-save-fab'); if (!el || !el.getClientRects().length) return false; el.click(); return true })()`),
  'Save FAB never appeared for the dirty drawio tab'
)
await waitFor(
  () => readFileSync(good, 'utf8') === newXml,
  'save did not write the edited xml to disk'
)
await waitFor(
  () => evaluate(`![...document.querySelectorAll('.tab-close.dirty')].some((n) => n.offsetParent)`),
  'dirty marker did not clear after save'
)
```

6. Save-reopen fidelity: close the tab, relaunch with the same file via a
   second `launchBuiltElectron` call, assert `.drawio-host[data-ready="true"]`
   mounts and the file on disk still equals `newXml`. (Note the baseline rule:
   reopen must NOT mark the tab dirty — assert `.tab-close.dirty` is absent.)

7. Kill the app, `rmSync(dir, { recursive: true, force: true })` in a `finally` block (copy the excalidraw script's teardown).

Add to `package.json` scripts:

```json
"test:drawio-ui": "node scripts/test-drawio-ui.mjs",
```

- [ ] **Step 2: Run the UI test**

Run: `npm run build && npm run test:drawio-ui`
Expected: all assertions pass. If the real autosave→`save`-message flow is slow (>10s after `simulateChange` is bypassed — note `simulateChange` feeds the same debounced path, so this should not happen), investigate before weakening the test.

- [ ] **Step 3: Version bump + changelog**

In `package.json`: `"version": "0.13.208"`.
In `CHANGELOG.md`, add an entry at the top following the file's existing format:

```markdown
## 0.13.208

- feat(drawio): open, edit, and save .drawio diagrams in a fully offline, locally-packaged drawio editor (desktop-only; sidebar "New Diagram" entry; PNG/SVG export)
```

- [ ] **Step 4: Guide page + manual checklist**

Create the guide page per `docs/user-guide-maintenance.md` (front-matter/metadata, version fields, no personal paths in any screenshot; if a screenshot is included it must come from a freshly built+installed app with an isolated profile). Content: what `.drawio` support covers (open/edit/save, multi-page, export PNG/SVG), the sidebar "New Diagram" entry, desktop-only note.
Update `docs/manual-test-checklist.md` with a drawio section mirroring the excalidraw checklist items (open, edit, dirty, save, reopen, export, corrupt file, mobile placeholder absence).
Run: `npm run guide:check`
Expected: passes.

- [ ] **Step 5: Full verification matrix**

Run in order:

```bash
npm run build
npm run build:mobile
npm run test:drawio-file
npm run test:excalidraw-ui   # guard: excalidraw flow must not regress
npm run test:drawio-ui
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add scripts/test-drawio-ui.mjs package.json CHANGELOG.md docs/manual-test-checklist.md guide/
git commit -m "feat(drawio): UI regression test, version 0.13.208, guide + checklist"
```

---

## Task Dependency Order

Task 1 → Task 2 → Task 3 → Task 4 → (Task 5 → Task 6 → Task 7) → Task 8.

Tasks 4 and 5 are independent of 2–3 except for the `window.api.drawio` call inside Task 5's effect (guarded with `?.`, so Task 5 can be built in parallel with 2–3 but only verified end-to-end after them).
