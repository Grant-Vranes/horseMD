# In-App PDF & Image Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PDF and image files open as read-only in-app viewer tabs (Chromium built-in PDF viewer in an iframe; `<img>`-based image viewer with toolbar) instead of binary garbage in the plain-text textarea.

**Architecture:** Extend the existing file-classification constants (`FILE_EXTS` in main, regexes in `paths.js`) so media files appear in the sidebar tree and open through a dedicated branch in `openPaths` that never reads them as text. Two new lazy viewer components mount in `EditorArea.jsx` following the proven `.excalidraw`/`.drawio` pattern. Files are served through the already-registered `local-media://` protocol (dev) or `file://` (packaged), reusing `toDisplayImageUrl`.

**Tech Stack:** Electron IPC + `protocol.handle`, React lazy chunks, no new npm dependencies.

**Spec:** `docs/superpowers/specs/2026-09-14-pdf-image-viewer-design.md`

## Global Constraints

- No new npm dependencies.
- No Node integration in the renderer; media loads only via `local-media://` / `file://`.
- Image formats: `png`, `jpg`, `jpeg`, `gif`, `webp`, `svg`, `bmp`, `ico`, `avif`. PDF: `pdf`. Nothing else (no HEIC).
- Media tabs are read-only: never dirty, never saved, no textarea, no Crepe, no source/rich split, no find & replace.
- Desktop only this round; mobile hides viewers via `window.api.capabilities.mediaViewer`.
- Style: ES modules, two-space indent, single quotes, no semicolons. New logic in focused files, not `App.jsx`/`Editor.jsx`.
- `Editor.jsx` is untouched by this plan.
- `npm run build` must pass before handoff.

---

### Task 1: Renderer classification helpers in `paths.js`

**Files:**
- Modify: `src/renderer/src/paths.js` (near the existing `EXCALIDRAW_RE` / `DRAWIO_RE` block, ~lines 94-105)
- Test: `scripts/test-media-classification.mjs` (new)

**Interfaces:**
- Produces: `isImageName(name) → bool`, `isPdfName(name) → bool`, `isMediaDoc(tab) → bool` — used by Tasks 4, 6, 7, 8. `isPlainTextDoc(tab)` changes to return `false` for media tabs (media must never route to the textarea).

- [ ] **Step 1: Write the failing test**

Create `scripts/test-media-classification.mjs`:

```js
// Regression guard: media files must classify as viewers, NOT plain text —
// otherwise the textarea captures binary files and renders garbage.
import assert from 'node:assert/strict'
import { isImageName, isPdfName, isMediaDoc, isPlainTextDoc } from '../src/renderer/src/paths.js'

assert.equal(isImageName('a.png'), true)
assert.equal(isImageName('a.JPG'), true)
assert.equal(isImageName('a.jpeg'), true)
assert.equal(isImageName('a.webp'), true)
assert.equal(isImageName('a.svg'), true)
assert.equal(isImageName('a.bmp'), true)
assert.equal(isImageName('a.ico'), true)
assert.equal(isImageName('a.avif'), true)
assert.equal(isImageName('a.heic'), false)
assert.equal(isImageName('a.md'), false)
assert.equal(isImageName(''), false)
assert.equal(isPdfName('b.pdf'), true)
assert.equal(isPdfName('b.PDF'), true)
assert.equal(isPdfName('b.md'), false)
assert.equal(isPdfName('b.pdfx'), false)
const imgTab = { path: '/x/a.png', content: '', savedContent: '' }
const pdfTab = { path: '/x/b.pdf', content: '', savedContent: '' }
assert.equal(isMediaDoc(imgTab), true)
assert.equal(isMediaDoc(pdfTab), true)
assert.equal(isMediaDoc({ path: '/x/c.md' }), false)
assert.equal(isMediaDoc({}), false)
assert.equal(isMediaDoc(null), false)
// Media must not land in the textarea (the pre-feature bug).
assert.equal(isPlainTextDoc(imgTab), false)
assert.equal(isPlainTextDoc(pdfTab), false)
// Plain-text behavior is unchanged for existing types.
assert.equal(isPlainTextDoc({ path: '/x/c.txt' }), true)
assert.equal(isPlainTextDoc({ path: '/x/d.excalidraw' }), false)
assert.equal(isPlainTextDoc({ path: '/x/d.drawio' }), false)
console.log('media classification OK')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-media-classification.mjs`
Expected: FAIL — `SyntaxError: The requested module ... does not provide an export named 'isImageName'`

- [ ] **Step 3: Write minimal implementation**

In `src/renderer/src/paths.js`, right after the `isDrawioName` export (before `isPlainTextDoc`), add:

```js
// Read-only media files open in dedicated viewer tabs (Chromium <img> / built-in
// PDF viewer). Like .excalidraw/.drawio they are NOT plain-text docs (the
// textarea must never capture them) and stay out of global search (the main
// process keeps its own MD_EXTS list for search classification).
export const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i
export const isImageName = (name) => IMAGE_RE.test(name || '')
export const PDF_RE = /\.pdf$/i
export const isPdfName = (name) => PDF_RE.test(name || '')

export const isMediaDoc = (tab) =>
  !!(tab && tab.path && (IMAGE_RE.test(tab.path) || PDF_RE.test(tab.path)))
```

Then change `isPlainTextDoc` to exclude media:

```js
export const isPlainTextDoc = (tab) =>
  !!(tab && tab.path && !MD_DOC_RE.test(tab.path) && !EXCALIDRAW_RE.test(tab.path) &&
    !DRAWIO_RE.test(tab.path) && !IMAGE_RE.test(tab.path) && !PDF_RE.test(tab.path))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/test-media-classification.mjs`
Expected: PASS — prints `media classification OK`

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/paths.js scripts/test-media-classification.mjs
git commit -m "feat(media): classify image/pdf files as read-only viewer docs"
```

---

### Task 2: Main process — `FILE_EXTS`, local-media PDF MIME, `media:saveAs` IPC

**Files:**
- Modify: `src/main/index.js` (lines ~25-28 `FILE_EXTS`; `registerLocalMediaProtocol` ~lines 323-358; new IPC near `shell:showInFolder` ~line 480)
- Modify: `src/main/index.js` comment above `MEDIA_EXT_RE`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `FILE_EXTS` includes image + `pdf` (sidebar tree, open-dialog filter, launch args all pick this up automatically); local-media serves `.pdf` with `Content-Type: application/pdf`; `ipcMain.handle('media:saveAs', sourcePath)` → `{ canceled: true } | { canceled: false, path } | { error }`, consumed by Task 6 via preload (Task 3).

- [ ] **Step 1: Extend `FILE_EXTS`**

At `src/main/index.js` line 25, change:

```js
const FILE_EXTS = [...MD_EXTS, 'excalidraw', 'drawio', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'pdf']
```

and update the comment above it to note that image/pdf extensions open in read-only viewer tabs. Global search stays MD_RE-only, so media is automatically excluded from search.

- [ ] **Step 2: Allow PDF through local-media with correct MIME**

In `registerLocalMediaProtocol`, extend `MEDIA_EXT_RE` and force the PDF content type (Chromium's file-URL MIME inference is not guaranteed for custom-scheme `net.fetch` passthrough, and the built-in PDF viewer refuses to activate without `application/pdf`):

```js
// Serves document-relative images and PDF viewer tabs over local-media://
// <abs-path> for renderer pages that cannot load file:// URLs (http dev server
// origin). Only image/PDF extensions are served; anything else is 403 so the
// scheme cannot become a generic file-read channel.
const MEDIA_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico|pdf)$/i
```

and replace the final `return net.fetch(...)` line with:

```js
    const res = await net.fetch(pathToFileURL(filePath).toString())
    // The built-in PDF viewer only activates for application/pdf responses.
    if (/\.pdf$/i.test(filePath)) {
      const body = await res.arrayBuffer()
      return new Response(body, { headers: { 'content-type': 'application/pdf' } })
    }
    return res
```

(the handler callback becomes effectively async — `protocol.handle` supports promise returns; confirm the arrow function has no other early returns that break this).

- [ ] **Step 3: Add `media:saveAs` IPC**

Near the `shell:showInFolder` handler in `src/main/index.js` add:

```js
// Read-only media viewer "Save as…" — copies the viewed file to a
// user-chosen destination without opening a write channel into the renderer.
ipcMain.handle('media:saveAs', async (_e, sourcePath) => {
  try {
    if (typeof sourcePath !== 'string' || !MEDIA_EXT_RE.test(sourcePath)) {
      return { error: 'unsupported file' }
    }
    const res = await dialog.showSaveDialog(getMainWindow(), {
      defaultPath: basename(sourcePath)
    })
    if (res.canceled || !res.filePath) return { canceled: true }
    await fsPromises.copyFile(sourcePath, res.filePath)
    return { canceled: false, path: res.filePath }
  } catch (e) {
    return { error: e?.message || String(e) }
  }
})
```

Check the file's existing imports: `dialog` is already imported (used in documents.js registration call sites — verify at top of `index.js`; if `dialog` is only imported in `documents.js`, add `dialog` to the `electron` import in `index.js`). Ensure `fsPromises` / `basename` match the names this file already uses (`fs.promises` and `basename` from `path` — reuse whatever aliases exist; do not re-import under new names if aliases exist).

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/index.js
git commit -m "feat(media): serve pdf via local-media and add media:saveAs IPC"
```

---

### Task 3: Capability flags (preload + Capacitor shim)

**Files:**
- Modify: `src/preload/index.js` (~line 182, inside `capabilities`)
- Modify: `src/renderer/src/platform/capacitor-api.js` (~line 284, inside `capabilities`)

**Interfaces:**
- Produces: `window.api.capabilities.mediaViewer` — `true` on desktop, `false` on mobile. Consumed by Task 7.

- [ ] **Step 1: Desktop preload**

In `src/preload/index.js` `capabilities` object, after `drawio: true`, add:

```js
    mediaViewer: true,
```

- [ ] **Step 2: Capacitor shim**

In `src/renderer/src/platform/capacitor-api.js` `capabilities`, after the `drawio: false` line, add:

```js
  mediaViewer: false, // image/pdf viewer tabs are desktop-only for now
```

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build completes.

- [ ] **Step 4: Commit**

```bash
git add src/preload/index.js src/renderer/src/platform/capacitor-api.js
git commit -m "feat(media): gate viewer tabs behind mediaViewer capability"
```

---

### Task 4: `openPaths` media branch + `saveTab` guard in `useFileOps.js`

**Files:**
- Modify: `src/renderer/src/hooks/useFileOps.js` (`openPaths` ~line 64; `saveTab` ~line 413; import line ~1)

**Interfaces:**
- Consumes: `isImageName`, `isPdfName` from Task 1.
- Produces: media tabs have shape `{ id, kind: 'doc', path, title, content: '', savedContent: '', mtimeMs: null, reloadNonce: 0, heavy: false, restoreOffset: null, restoreScrollTop: null }` — no `content` read from disk. Session restore (which re-calls `openPaths`) and sidebar clicks / launch args / native drop all get this for free.

- [ ] **Step 1: Add the media branch to `openPaths`**

Add to the existing import from `'../paths.js'` in `useFileOps.js`: `isImageName, isPdfName`.

Inside the `for (const path of paths)` loop, directly after the `existing` dedupe check and before the `try {` that calls `window.api.readFile(path)`, insert:

```js
      // Read-only media files (images / PDF) never go through readFile: they
      // are binary and the tab content stays empty. The viewer resolves the
      // file itself via local-media/file URLs.
      if (isImageName(path) || isPdfName(path)) {
        const id = genId()
        lastId = id
        const mediaTab = {
          id,
          kind: 'doc',
          path,
          title: baseName(path),
          content: '',
          savedContent: '',
          mtimeMs: null,
          reloadNonce: 0,
          heavy: false,
          restoreOffset: null,
          restoreScrollTop: null
        }
        tabsRef.current = [...tabsRef.current, mediaTab]
        setTabs((prev) => [...prev, mediaTab])
        remember(path)
        continue
      }
```

- [ ] **Step 2: Guard `saveTab`**

Add to the imports from `'../paths.js'` in `useFileOps.js`: `isMediaDoc`.

In `saveTab`, directly after `if (!tab) return`, add:

```js
      // Media viewer tabs are read-only — Cmd/Ctrl+S must never write an
      // empty string over the binary file.
      if (isMediaDoc(tab)) return
```

- [ ] **Step 3: Verify no other write path touches media tabs**

Run: `rg -n "writeFile\(" src/renderer/src/hooks/useFileOps.js`
Expected: writes only occur inside `saveTab`/`saveTabAs` paths already behind the tab lookup. If `saveTabAs` (Save As on a doc) exists and can be invoked on a media tab, add the same `isMediaDoc(tab) return` guard after its tab lookup.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build completes.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/hooks/useFileOps.js
git commit -m "feat(media): open image/pdf files as empty read-only viewer tabs"
```

---

### Task 5: Absolute-path URL helper

**Files:**
- Modify: `src/renderer/src/components/editor-images.js` (append at end)

**Interfaces:**
- Produces: `fileUrlForAbsolutePath(p) → 'file:///…'` — consumed by Tasks 6 and 7's viewers, combined with the existing `toDisplayImageUrl(fileUrl)` which keeps `file://` on packaged (file://) origins and rewrites to `local-media://media/…` on dev (http) origins.

- [ ] **Step 1: Add the helper**

Append to `src/renderer/src/components/editor-images.js`:

```js
// Build a display file:// URL from an absolute filesystem path (tab.path).
// Mirrors resolveToFileUrl's URL shape but takes an already-absolute path
// instead of (baseDir, relativeSrc). encodeURI leaves '#'/'?' literal — same
// pre-existing caveat as resolveToFileUrl for exotic filenames.
export function fileUrlForAbsolutePath(p) {
  const norm = String(p || '').replace(/\\/g, '/')
  if (!norm) return ''
  const url = /^[a-zA-Z]:\//.test(norm)
    ? 'file:///' + norm
    : 'file://' + (norm.startsWith('/') ? norm : '/' + norm)
  return encodeURI(url)
}
```

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: build completes.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/components/editor-images.js
git commit -m "feat(media): absolute-path file URL helper for viewer tabs"
```

---

### Task 6: Viewer components + CSS + i18n

**Files:**
- Create: `src/renderer/src/components/PdfViewer.jsx`
- Create: `src/renderer/src/components/MediaViewer.jsx`
- Modify: `src/renderer/src/styles/app.css` (append a `.media-viewer` section)
- Modify: `src/renderer/src/i18n.jsx` (English block ~line 750 area; Chinese block ~line 1499 area)

**Interfaces:**
- Consumes: `fileUrlForAbsolutePath` (Task 5), `toDisplayImageUrl` (existing), `mediaSaveAs` preload API (Task 3 adds `mediaSaveAs: (sourcePath) => ipcRenderer.invoke('media:saveAs', sourcePath)` — **add this line to `src/preload/index.js` near `showInFolder` (line ~88) in this task**, since Task 6 is its first consumer). `useI18n()` from `../i18n.jsx` provides `{ t }`.
- Produces: `<PdfViewer tab={tab} />` and `<MediaViewer tab={tab} />`, both read-only, no props beyond `tab`. Consumed by Task 7.

- [ ] **Step 1: Add the preload API**

In `src/preload/index.js`, next to `showInFolder` (~line 88):

```js
  mediaSaveAs: (sourcePath) => ipcRenderer.invoke('media:saveAs', sourcePath),
```

- [ ] **Step 2: Create `PdfViewer.jsx`**

```jsx
// Read-only PDF tab: Chromium's built-in PDF viewer inside a plain iframe.
// Dev pages load via local-media:// (main process forces application/pdf);
// packaged pages load file:// directly. No toolbar of our own — the embedded
// viewer already provides paging, zoom, search, and the sidebar outline.
import { useMemo } from 'react'
import { fileUrlForAbsolutePath, toDisplayImageUrl } from './editor-images.js'

export default function PdfViewer({ tab }) {
  const src = useMemo(() => {
    const fileUrl = fileUrlForAbsolutePath(tab?.path)
    return fileUrl ? toDisplayImageUrl(fileUrl) : ''
  }, [tab?.path])
  if (!src) return null
  return <iframe className="pdf-viewer-frame" src={src} title={tab.title || 'PDF'} />
}
```

- [ ] **Step 3: Create `MediaViewer.jsx`**

```jsx
// Read-only image tab with a small standard viewer toolbar: zoom out/in,
// fit-width, 1:1, rotate 90°, save-as. Ctrl/Cmd+wheel zooms. Zoom/rotation
// are per-tab ephemeral state; no editing, no dirty tracking.
import { useEffect, useMemo, useRef, useState } from 'react'
import { fileUrlForAbsolutePath, toDisplayImageUrl } from './editor-images.js'
import { useI18n } from '../i18n.jsx'

export default function MediaViewer({ tab }) {
  const { t } = useI18n()
  const [zoom, setZoom] = useState('fit') // 'fit' | number (percent)
  const [rotation, setRotation] = useState(0)
  const [failed, setFailed] = useState(false)
  const frameRef = useRef(null)

  const src = useMemo(() => {
    const fileUrl = fileUrlForAbsolutePath(tab?.path)
    return fileUrl ? toDisplayImageUrl(fileUrl) : ''
  }, [tab?.path])

  // A different path in the same mounted tab (e.g. restored session) resets state.
  useEffect(() => {
    setZoom('fit')
    setRotation(0)
    setFailed(false)
  }, [tab?.path])

  // Ctrl/Cmd+wheel zoom (wheel listener must be non-passive to preventDefault).
  useEffect(() => {
    const el = frameRef.current
    if (!el) return undefined
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      setZoom((prev) => {
        const base = prev === 'fit' ? 100 : prev
        const next = e.deltaY < 0 ? base + 10 : base - 10
        return Math.min(800, Math.max(10, next))
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const saveAs = async () => {
    const res = await window.api?.mediaSaveAs?.(tab.path)
    if (res?.error) window.alert(res.error)
  }

  if (failed) {
    return (
      <div className="media-viewer media-missing" role="status">
        <div className="media-missing-icon">⚠</div>
        <div className="media-missing-text">{t('media.missing')}</div>
        <div className="media-missing-path">{tab?.path}</div>
      </div>
    )
  }

  const style =
    zoom === 'fit'
      ? { transform: `rotate(${rotation}deg)`, maxWidth: '100%', maxHeight: '100%' }
      : { transform: `rotate(${rotation}deg)`, width: `${zoom}%`, maxWidth: 'none' }

  return (
    <div className="media-viewer" ref={frameRef}>
      <div className="media-toolbar" role="toolbar" aria-label={t('media.toolbarLabel')}>
        <button type="button" title={t('media.zoomOut')} onClick={() => setZoom((p) => Math.max(10, (p === 'fit' ? 100 : p) - 10))}>−</button>
        <button type="button" title={t('media.zoomIn')} onClick={() => setZoom((p) => Math.min(800, (p === 'fit' ? 100 : p) + 10))}>+</button>
        <button type="button" className={zoom === 'fit' ? 'is-active' : ''} onClick={() => setZoom('fit')}>{t('media.fitWidth')}</button>
        <button type="button" className={zoom === 100 ? 'is-active' : ''} onClick={() => setZoom(100)}>1:1</button>
        <button type="button" title={t('media.rotate')} onClick={() => setRotation((r) => (r + 90) % 360)}>⟳</button>
        <button type="button" title={t('media.saveAs')} onClick={saveAs}>⤓</button>
      </div>
      <div className="media-stage">
        <img src={src} alt={tab.title || ''} style={style} onError={() => setFailed(true)} draggable={false} />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Add CSS**

Append to `src/renderer/src/styles/app.css`:

```css
/* ---- Read-only media viewer tabs (images + PDF) ---- */
.media-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.media-toolbar {
  display: flex;
  gap: 4px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--hm-border, rgba(128, 128, 128, 0.25));
  flex: none;
}
.media-toolbar button {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 13px;
  line-height: 1.4;
}
.media-toolbar button:hover { background: var(--hm-hover, rgba(128, 128, 128, 0.15)); }
.media-toolbar button.is-active { background: var(--hm-active, rgba(128, 128, 128, 0.25)); }
.media-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: auto;
  padding: 12px;
}
.media-stage img { transition: width 0.12s ease; }
.media-missing {
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  opacity: 0.75;
}
.media-missing-path {
  font-family: var(--hm-mono, monospace);
  font-size: 12px;
  word-break: break-all;
}
.pdf-viewer-frame {
  width: 100%;
  height: 100%;
  border: none;
  background: transparent;
}
```

(Use the app's actual CSS variable names if `--hm-border`/`--hm-hover`/`--hm-active`/`--hm-mono` do not exist — check `app.css` `:root` and substitute the closest existing tokens rather than inventing parallel ones.)

- [ ] **Step 5: Add i18n strings**

In `src/renderer/src/i18n.jsx`, English block (after `'drawio.mobilePlaceholder'` ~line 750):

```js
    'media.toolbarLabel': 'Image viewer tools',
    'media.zoomIn': 'Zoom in',
    'media.zoomOut': 'Zoom out',
    'media.fitWidth': 'Fit width',
    'media.rotate': 'Rotate 90°',
    'media.saveAs': 'Save as…',
    'media.missing': 'File is missing or unreadable',
    'mediaViewer.mobilePlaceholder': 'Image and PDF preview is currently desktop-only',
```

Chinese block (after `'drawio.mobilePlaceholder'` ~line 1499):

```js
    'media.toolbarLabel': '图片查看工具',
    'media.zoomIn': '放大',
    'media.zoomOut': '缩小',
    'media.fitWidth': '适应宽度',
    'media.rotate': '旋转 90°',
    'media.saveAs': '另存为…',
    'media.missing': '文件缺失或无法读取',
    'mediaViewer.mobilePlaceholder': '图片与 PDF 预览目前仅桌面版支持',
```

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: build completes.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/components/PdfViewer.jsx src/renderer/src/components/MediaViewer.jsx src/renderer/src/components/editor-images.js 2>/dev/null; git add src/renderer/src/styles/app.css src/renderer/src/i18n.jsx src/preload/index.js
git commit -m "feat(media): image viewer + pdf viewer components with toolbar and i18n"
```

---

### Task 7: EditorArea routing + App.jsx interaction guards

**Files:**
- Modify: `src/renderer/src/components/shell/EditorArea.jsx` (imports ~lines 26-28, routing ~lines 122-160, add media branch after the drawio branch)
- Modify: `src/renderer/src/App.jsx` (line ~793 `toggleSourceRichSplit`; line ~939 `findSourceActive`)

**Interfaces:**
- Consumes: `isMediaDoc`, `isPdfName` (Task 1), `PdfViewer`/`MediaViewer` (Task 6), `capabilities.mediaViewer` (Task 3).
- Produces: media tabs render a viewer pane and are excluded from textarea/Crepe/source-split/find — the app's interaction matrix treats them like the canvas editors.

- [ ] **Step 1: Route media tabs in `EditorArea.jsx`**

Add lazy imports next to the existing ones (below the `react` import, same block as `DrawioEditor`):

```js
const PdfViewer = lazy(() => import('../PdfViewer.jsx'))
const MediaViewer = lazy(() => import('../MediaViewer.jsx'))
```

Extend the import from `'../../paths.js'` (line ~13) with `isMediaDoc, isPdfName`.

Inside the `tabs.map` callback, next to `const drawioDoc = isDrawioName(tab.path)` (~line 125), add:

```js
        const mediaDoc = isMediaDoc(tab)
        const mediaEnabled = window.api?.capabilities?.mediaViewer === true
```

Add `!mediaDoc` to the four boolean expressions that already carry `!excalidrawDoc && !drawioDoc` (~lines 129, 151, 157):

```js
        const isSourceRichSplit = sourceRichSplitMode && isLeft && !plainText && !heavyAsSource && !excalidrawDoc && !drawioDoc && !mediaDoc
        const sourceForActiveRich = (sourceMode || isSourceRichSplit) && isLeft && !plainText && !heavyAsSource && !excalidrawDoc && !drawioDoc && !mediaDoc
        const richEligible = !plainText && !heavyAsSource && !excalidrawDoc && !drawioDoc && !mediaDoc
```

After the closing of the `drawioDoc` node block, add the media branch (same lazy-mount/host-ref pattern):

```js
        if (mediaDoc && (inView || mountedIds.has(tab.id))) {
          const setMediaHost = (el) => {
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
              key={`media:${tab.id}`}
              className={`editor-scroll media-scroll${paneClass}`}
              ref={setMediaHost}
              style={{ display: inView ? undefined : 'none', order, flex: paneFlex }}
              onFocusCapture={() => onPaneFocus('rich')}
              onMouseDownCapture={() => onPaneFocus('rich')}
            >
              {mediaEnabled ? (
                <Suspense fallback={editorChunkFallback}>
                  {isPdfName(tab.path) ? <PdfViewer tab={tab} /> : <MediaViewer tab={tab} />}
                </Suspense>
              ) : (
                <div className="excalidraw-mobile-placeholder" role="status">
                  {t('mediaViewer.mobilePlaceholder')}
                </div>
              )}
            </div>
          )
        }
```

- [ ] **Step 2: Guard source/rich split and find in `App.jsx`**

Extend the import from `'./paths.js'` (line ~63) with `isMediaDoc`.

Line ~793 (`toggleSourceRichSplit`):

```js
    if (isMediaDoc(tab) || isPlainTextDoc(tab) || (tab.heavy && !richForced.has(tab.id))) {
```

Line ~939 (`findSourceActive`):

```js
  const findSourceActive = sourceMode ||
    (sourceRichSplitMode && sourceRichFocusedPane === 'source') ||
    isMediaDoc(activeTab) ||
    isPlainTextDoc(activeTab) || (activeTab?.heavy && !richForced.has(activeTab.id))
```

(The outline site at line ~861 intentionally follows the excalidraw/drawio precedent — no headings are ever reported for a viewer, so no special case.)

- [ ] **Step 3: Build + smoke test**

Run: `npm run build && npm start`, open any `.png` and `.pdf` from the sidebar.
Expected: image shows with toolbar; PDF shows the built-in viewer; no textarea, no editor chrome. Close both.

- [ ] **Step 4: Commit**

```bash
git add src/renderer/src/components/shell/EditorArea.jsx src/renderer/src/App.jsx
git commit -m "feat(media): route image/pdf tabs to read-only viewers"
```

---

### Task 8: UI regression script

**Files:**
- Create: `scripts/test-media-viewer-ui.mjs`

**Interfaces:**
- Consumes: everything above, against the BUILT app via `launchBuiltElectron()` (background mode — must not take focus).
- Produces: the regression gate named in the spec.

- [ ] **Step 1: Write the script**

Model it on `scripts/test-pdf-latex-ui.mjs` (`launchBuiltElectron` / `stopBuiltElectron` from `./lib/electron-test-app.mjs`, `sleep` from `./lib/cdp.mjs`). Fixtures: a small PNG (1×1 red pixel base64), an SVG file, a PDF (minimal valid single-page PDF bytes as a base64 constant), and one `.txt`. Assert:

1. Opening the PNG via `app.evaluate` calling the renderer's open flow (`window`-level: simulate through the same path the sidebar uses — simplest reliable route is `evaluate` that dispatches the app's own `openPaths` indirectly by invoking `window.api.readFile`-free flow: use the CDP `Input` events to click the sidebar tree entry, or evaluate `localStorage` session pre-seed then reload). Preferred: seed `localStorage['minimd.session.v1']` with `openPaths: [pngPath, svgPath, pdfPath, txtPath]` before app start (write profile Local Storage via `launchBuiltElectron`'s profileDir + a first pass, following how existing scripts seed sessions — if no seeding helper exists, instead click sidebar entries with synthesized mouse events at the tree node coordinates from `evaluate`).
2. Active PNG tab renders `.media-viewer .media-stage img` with `naturalWidth > 0` and NO `.ProseMirror` or `textarea` mounted in the active pane.
3. SVG tab renders its image; PDF tab renders `.pdf-viewer-frame` whose contentDocument (same-origin file:/local-media) reports `application/pdf` loaded — assert simply that the iframe exists and (dev fallback check) no error toast appeared.
4. The `.txt` tab still uses the textarea (classification did not overreach).
5. Delete the PNG on disk, then evaluate a reopen of the same path in a fresh tab → `.media-missing` error state appears.
6. Session restore: relaunch with the same profile; the PNG/PDF tabs restore as viewers (`.media-viewer` / `.pdf-viewer-frame` present), not textareas.

Every assertion failure throws with a descriptive message; exit code 0 on success; always `stopBuiltElectron` in `finally`.

- [ ] **Step 2: Run to verify**

Run: `npm run build && node scripts/test-media-viewer-ui.mjs`
Expected: PASS. If Chromium's built-in PDF viewer does not activate under `local-media://` in dev, packaged (`file://`) must still work — verify with `npm run dist:dir` + manual open; if the custom scheme fundamentally blocks the built-in viewer, stop and report back (spec fallback: per-tab "open with system viewer" button) rather than shipping a broken viewer.

- [ ] **Step 3: Commit**

```bash
git add scripts/test-media-viewer-ui.mjs
git commit -m "test(media): UI regression suite for image/pdf viewer tabs"
```

---

### Task 9: Docs, changelog, version, packaging

**Files:**
- Modify: `docs/manual-test-checklist.md` (add a media-viewer section)
- Modify: `guide/` — the appropriate basics/files page (find the page listing supported file types; add images + PDF as openable read-only tabs; no screenshots of personal paths)
- Modify: `CHANGELOG.md` (under `## [Unreleased]`)
- Modify: `package.json` version `0.13.214` → `0.13.215`

- [ ] **Step 1: Docs + changelog**

`CHANGELOG.md` under `## [Unreleased]`:

```markdown
### Added
- 应用内查看 PDF 与图片：侧边栏/启动参数/拖拽打开 `.pdf`、`.png`、`.jpg/.jpeg`、`.gif`、`.webp`、`.svg`、`.bmp`、`.ico`、`.avif` 文件时，以只读查看器标签页打开。PDF 使用 Chromium 内置查看器（翻页/缩放/搜索/目录）；图片查看器提供缩放（含 Ctrl/Cmd+滚轮）、适应宽度、1:1、旋转与另存为。文件缺失或损坏时显示错误状态。移动端暂不支持（ capability 关闭）。
```

`docs/manual-test-checklist.md` new section: open each format from sidebar, verify viewer vs textarea, zoom/rotate/save-as, missing-file error state, session restore, find/replace & source split unavailable on media tabs, `.txt` unchanged.

- [ ] **Step 2: Version + full verification**

Run:

```bash
npm version 0.13.215 --no-git-tag-version
npm run build
node scripts/test-media-classification.mjs
node scripts/test-media-viewer-ui.mjs
```

Expected: all pass.

- [ ] **Step 3: Package and launch for the user (standing authorization)**

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:dir
```

Then: kill running HorseMD/Electron processes, copy the fresh app to `/Applications/HorseMD.app`, `xattr -dr com.apple.quarantine /Applications/HorseMD.app`, launch it, and verify the running process points at `/Applications/HorseMD.app`. Verify `/Applications/HorseMD.app/Contents/Resources/app.asar` contains a marker of the feature (e.g. `media-viewer-frame`) before telling the user to test.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json CHANGELOG.md docs/manual-test-checklist.md guide/
git commit -m "feat(media): in-app PDF & image viewer tabs (0.13.215)"
```

---

## Self-Review

- **Spec coverage:** in-app viewing (T4/T7), basic tier formats + avif (T1/T2), Chromium built-in PDF (T2/T6), standard image toolbar w/ Ctrl-wheel zoom (T6), desktop-only capability gating (T3/T7), local-media pdf MIME + fallback decision point (T2/T8), read-only/no-dirty/save-guard (T1/T4), session restore (T4/T8), error state (T6/T8), no new deps (all), docs/changelog/version/package (T9). ✅
- **Placeholder scan:** none — every code step carries complete code; Task 8 describes assertions concretely and names its model script.
- **Type consistency:** `isMediaDoc/isImageName/isPdfName` names consistent across T1/T4/T7; `mediaSaveAs` (preload) ↔ `media:saveAs` (main) ↔ `MediaViewer.saveAs` aligned; `capabilities.mediaViewer` consistent in T3/T7; tab shape identical between T4 and T1's test fixtures. ✅
