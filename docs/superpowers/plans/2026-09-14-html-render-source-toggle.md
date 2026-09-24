# HTML Render + Source Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `.html`/`.htm` files open rendered in a sandboxed iframe by default, with a one-click toggle to the existing CodeMirror source editor.

**Architecture:** A new `HtmlEditor.jsx` renders the HTML **from disk** via a `file://` iframe (packaged) or `local-media://media/…` (dev), matching the `PdfViewer.jsx` pattern. Because the iframe document is loaded from a real URL (not `srcdoc`), it does **not** inherit the renderer's restrictive `script-src 'self'` CSP meta tag, so scripts, remote CSS/images, and relative-path assets work — while `sandbox="allow-scripts allow-popups allow-forms"` (no `allow-same-origin`) keeps the document in an opaque origin that cannot touch `window.api`, `localStorage`, or the parent DOM. Source mode reuses `CodeEditor.jsx`. Mode is per-tab state (`tab.htmlSource`) persisted across restarts in a localStorage map keyed by path.

**Tech Stack:** React, Electron, existing CodeMirror 6 `CodeEditor.jsx`, existing `local-media:` privileged scheme, CDP test harness (`scripts/lib/electron-test-app.mjs` + `scripts/lib/human-input.mjs`).

## Global Constraints

- Renderer CSP (`src/renderer/index.html:10-12`) stays unchanged: `script-src 'self'; frame-src drawio-local: local-media: file:` — `file:` and `local-media:` frames are already allowed.
- iframe sandbox attribute MUST be exactly `sandbox="allow-scripts allow-popups allow-forms"`. Never add `allow-same-origin`.
- Never load HTML via `srcdoc` or `blob:` (srcdoc inherits parent CSP → scripts dead).
- Rendering is **read-from-disk**: toggling from source to render commits and saves the tab first (`saveTab`), then remounts the iframe. Render mode always reflects the file on disk.
- Code style: ES modules, two-space indent, single quotes, no semicolons. React function components. No new dependencies.
- Do not add large logic to `App.jsx` — the toggle handler is ~15 lines and is the exception; everything else lives in `editor-html.js` / `HtmlEditor.jsx`.
- Repo uses monotonically increasing patch versions; this feature bumps `0.13.240` → `0.13.241` at the final task.
- CDP tests must use `launchBuiltElectron()` default background mode; no native focus.

---

### Task 1: File classification in `paths.js`

**Files:**
- Modify: `src/renderer/src/paths.js`
- Test: `scripts/test-html-classification.mjs`

**Interfaces:**
- Produces: `HTML_DOC_RE`, `isHtmlName(name)`, `isHtmlTab(tab)`, `isHtmlDoc(tab)` (all exported). `isHtmlTab(tab)` accepts a pathless tab with `tab.fileType === 'html'` (scratch-tab symmetry with `isExcalidrawTab`). Later tasks and `EditorArea.jsx` consume these.
- Also produces: `HTML_RENDER_MAX_BYTES = 2 * 1024 * 1024` and `shouldAutoRenderHtml(content)` returning `false` when `content.length > HTML_RENDER_MAX_BYTES`.

- [ ] **Step 1: Write the failing test**

Create `scripts/test-html-classification.mjs`:

```js
import assert from 'node:assert/strict'
import {
  isHtmlName, isHtmlTab, isCodeName, isCodeDoc, isPlainTextDoc,
  HTML_RENDER_MAX_BYTES, shouldAutoRenderHtml
} from '../src/renderer/src/paths.js'

assert.ok(isHtmlName('page.html'))
assert.ok(isHtmlName('page.htm'))
assert.ok(!isHtmlName('page.md'))
assert.ok(!isCodeName('page.html'), 'html must leave the CodeMirror classification')
assert.ok(!isCodeName('page.htm'))
assert.ok(isHtmlTab({ path: '/a/b.html' }))
assert.ok(isHtmlTab({ path: null, fileType: 'html' }))
assert.ok(!isHtmlTab({ path: '/a/b.md' }))
assert.ok(!isCodeDoc({ path: '/a/b.html' }))
assert.ok(isPlainTextDoc({ path: '/a/b.txt' }))
assert.ok(!isPlainTextDoc({ path: '/a/b.html' }), 'html must not fall into the textarea')
assert.equal(HTML_RENDER_MAX_BYTES, 2 * 1024 * 1024)
assert.ok(shouldAutoRenderHtml('<p>hi</p>'))
assert.ok(!shouldAutoRenderHtml('x'.repeat(HTML_RENDER_MAX_BYTES + 1)))
console.log('test-html-classification OK')
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-html-classification.mjs`
Expected: FAIL — `HTML_DOC_RE`/exports do not exist (SyntaxError or undefined import), and `isCodeName('page.html')` currently returns `true`.

- [ ] **Step 3: Implement**

In `src/renderer/src/paths.js`:

1. In `CODE_EXTS`, remove `'html', 'htm',` from the line containing `'css', 'scss', 'sass', 'less', 'html', 'htm', 'vue', 'svelte',` so it becomes `'css', 'scss', 'sass', 'less', 'vue', 'svelte',`.
2. Below the `DRAWIO_RE` / `isDrawioName` block, add:

```js
// HTML documents open rendered (sandboxed iframe) with a source-mode toggle
// to the CodeMirror editor. They are NOT plain-text docs and NOT code docs.
export const HTML_DOC_RE = /\.(html|htm)$/i
export const isHtmlName = (name) => HTML_DOC_RE.test(name || '')
export const isHtmlTab = (tab) =>
  !!(tab && (tab.fileType === 'html' || isHtmlName(tab.path)))
export const isHtmlDoc = (tab) => isHtmlTab(tab)

// Large HTML files open directly in source mode; rendering multi-megabyte
// documents into an iframe is not a useful default.
export const HTML_RENDER_MAX_BYTES = 2 * 1024 * 1024
export const shouldAutoRenderHtml = (content) =>
  typeof content === 'string' && content.length <= HTML_RENDER_MAX_BYTES
```

3. In `isPlainTextDoc`, extend the exclusion chain: add `&& !HTML_DOC_RE.test(tab.path)` after the `IMAGE_RE`/`PDF_RE` checks (before `!isCodeDoc(tab)`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/test-html-classification.mjs`
Expected: PASS (`test-html-classification OK`).

- [ ] **Step 5: Fix downstream references to html-as-code**

Run: `grep -rn "isCodeName\|CODE_EXTS" src/renderer/src/lib/file-type-icon.js src/renderer/src/App.jsx src/renderer/src/hooks/*.js | grep -i html`
Expected: no html-specific handling exists yet (html simply stops matching `isCodeName`).

In `src/renderer/src/lib/file-type-icon.js`, add an html branch returning `'html'` if the file has an icon mapping object — inspect the file; if icons are keyed by extension and no `html` key exists, add `html: 'html'` (or map to the closest existing icon) so sidebar icons don't regress. Keep the change minimal.

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/paths.js src/renderer/src/lib/file-type-icon.js scripts/test-html-classification.mjs
git commit -m "feat(html): classify .html/.htm as rendered documents, not code files"
```

---

### Task 2: Dev-mode frame URL support in main process

**Files:**
- Modify: `src/main/index.js` (`MEDIA_EXT_RE`, ~line 516)

**Interfaces:**
- Produces: `local-media://media/<abs-path>` also serves `.html`/`.htm` files. Consumed by `HtmlEditor.jsx` in dev only (packaged builds use `file://` directly through `toDisplayImageUrl`).

- [ ] **Step 1: Extend the media extension allowlist**

In `src/main/index.js`, change:

```js
const MEDIA_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico|pdf)$/i
```

to:

```js
// .html/.htm are served so dev-mode (http: renderer origin) can embed local
// HTML documents in a sandboxed iframe; packaged builds load file:// directly.
// Deliberate local-file read channel limited to media + html documents.
const MEDIA_EXT_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico|pdf|html?)$/i
```

- [ ] **Step 2: Verify**

Run: `npm run build`
Expected: succeeds (main bundle compiles).

- [ ] **Step 3: Commit**

```bash
git add src/main/index.js
git commit -m "feat(html): serve .html/.htm over local-media for dev-mode iframe preview"
```

---

### Task 3: `editor-html.js` helpers + `HtmlEditor.jsx`

**Files:**
- Create: `src/renderer/src/components/editor-html.js`
- Create: `src/renderer/src/components/HtmlEditor.jsx`
- Create: `src/renderer/src/styles/html-editor.css` (or append to the existing editor stylesheet — inspect `src/renderer/src/` for the main CSS file; if there is one `app.css`, append there instead of a new file)

**Interfaces:**
- Consumes: `fileUrlForAbsolutePath`, `toDisplayImageUrl` from `./editor-images.js`; `shouldAutoRenderHtml` from `../paths.js`.
- Produces:
  - `editor-html.js`: `loadHtmlViewModes()` → `Record<path,'source'>` (or `{}`), `saveHtmlViewMode(path, mode)` (`mode` is `'render'` | `'source'`; `render` deletes the entry), `buildHtmlFrameUrl(tab)` → `string` (display URL or `''`), `HTML_RENDER_MAX_BYTES` re-export.
  - `HtmlEditor.jsx`: `<HtmlEditor tab renderNonce />` — renders the sandboxed iframe; `renderNonce` change forces a remount (reload). Also exports nothing else.

- [ ] **Step 1: Write `editor-html.js`**

```js
// editor-html.js — pure helpers for the HTML document tab: frame URL building
// and per-path view-mode persistence (render vs source) across sessions.
import { fileUrlForAbsolutePath, toDisplayImageUrl } from './editor-images.js'
import { shouldAutoRenderHtml as _shouldAutoRender } from '../paths.js'

export const HTML_RENDER_MAX_BYTES = 2 * 1024 * 1024
export const shouldAutoRenderHtml = _shouldAutoRender

const LS_KEY = 'horsemd.htmlView.v1'

export function loadHtmlViewModes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LS_KEY))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function saveHtmlViewMode(path, mode) {
  if (!path) return
  try {
    const modes = loadHtmlViewModes()
    if (mode === 'source') modes[path] = 'source'
    else delete modes[path]
    localStorage.setItem(LS_KEY, JSON.stringify(modes))
  } catch {
    // Persistence is best-effort; view mode is a preference, not data.
  }
}

// Display URL for the iframe. Packaged builds (file: page) return file://
// directly; dev builds map to local-media://media/<abs-path> (served by the
// main process — see MEDIA_EXT_RE in src/main/index.js).
export function buildHtmlFrameUrl(tab) {
  const fileUrl = fileUrlForAbsolutePath(tab?.path)
  return fileUrl ? toDisplayImageUrl(fileUrl) : ''
}
```

- [ ] **Step 2: Write `HtmlEditor.jsx`**

```jsx
// HtmlEditor — read-only rendered view of an HTML document. The iframe loads
// the document from disk (file:// packaged, local-media:// dev) so scripts,
// remote resources, and document-relative assets behave like a real browser
// page. sandbox without allow-same-origin keeps the frame in an opaque origin:
// its scripts cannot reach window.api, localStorage, or the parent window.
// Render mode always reflects the file on disk; App saves before toggling here.
export default function HtmlEditor({ tab, renderNonce }) {
  const src = buildHtmlFrameUrl(tab)
  if (!src) return null
  return (
    <iframe
      key={renderNonce}
      className="html-preview-frame"
      src={src}
      sandbox="allow-scripts allow-popups allow-forms"
      title={tab.title || 'HTML'}
      referrerPolicy="no-referrer"
    />
  )
}
```

(with `import { buildHtmlFrameUrl } from './editor-html.js'` at the top)

- [ ] **Step 3: Add CSS**

Append to the app stylesheet:

```css
.html-preview-frame {
  width: 100%;
  height: 100%;
  border: none;
  background: #fff;
  display: block;
}
.html-mode-toggle {
  position: absolute;
  top: 10px;
  right: 14px;
  z-index: 5;
}
```

(Adjust selector names if the stylesheet uses a different convention — inspect neighbors like `.pdf-viewer-frame` and match.)

- [ ] **Step 4: Build + commit**

Run: `npm run build` → expected: succeeds.

```bash
git add src/renderer/src/components/editor-html.js src/renderer/src/components/HtmlEditor.jsx src/renderer/src/styles/html-editor.css
git commit -m "feat(html): sandboxed disk-backed HTML preview iframe with view-mode persistence helpers"
```

---

### Task 4: `EditorArea.jsx` — html pane rendering + toggle button

**Files:**
- Modify: `src/renderer/src/components/shell/EditorArea.jsx`
- Modify: `src/renderer/src/App.jsx` (only the props passed to `EditorArea`)
- Modify: `src/renderer/src/i18n.jsx`

**Interfaces:**
- Consumes: `isHtmlTab`, `isHtmlDoc`, `shouldAutoRenderHtml` from `../paths.js`; `HtmlEditor` (lazy `import('../components/HtmlEditor.jsx')`); `CodeEditor` (already lazily imported).
- Produces: new `EditorArea` props `onToggleHtmlSource(tabId)` and `htmlRenderNonce` (`Record<tabId, number>`), both supplied by App in Task 5. HTML tabs render `HtmlEditor` when `!tab.htmlSource`, else `CodeEditor`.

- [ ] **Step 1: Add i18n strings**

In `src/renderer/src/i18n.jsx`, add to the English dict (near the `sourceRich.unavailable` entry, ~line 46):

```js
'html.toggleSource': 'Toggle rendered / source view',
'html.tooLarge': 'This HTML file is too large to render; opened in source mode.',
'html.mobilePlaceholder': 'HTML preview is currently desktop-only',
```

And the matching keys in the Chinese dict (~line 827 area):

```js
'html.toggleSource': '切换 渲染 / 源码 视图',
'html.tooLarge': 'HTML 文件过大，已直接以源码模式打开。',
'html.mobilePlaceholder': 'HTML 预览目前仅桌面版支持',
```

Match the file's structure for the remaining locales — inspect which locales exist in `i18n.jsx` (there are at least en + zh at these line ranges) and add all three keys to each with sensible translations (or fall back to the English text for locales you cannot translate confidently).

- [ ] **Step 2: Wire the html branch into EditorArea**

In `src/renderer/src/components/shell/EditorArea.jsx`:

1. Add imports: `isHtmlTab, shouldAutoRenderHtml` to the existing `paths.js` import; `const HtmlEditor = lazy(() => import('../HtmlEditor.jsx'))` next to the `CodeEditor` lazy import (line ~30).
2. Inside the `tabs.map`, after `const codeDoc = isCodeDoc(tab)` (line ~129), add:

```js
const htmlDoc = isHtmlTab(tab)
const htmlRenderEligible = htmlDoc && shouldAutoRenderHtml(tab.content || '')
const htmlShowSource = !htmlRenderEligible || tab.htmlSource === true
```

3. Guard every existing classification expression that must exclude html. Add `&& !htmlDoc` to: `plainText` (`isPlainTextDoc(tab) && !codeDoc` → `&& !htmlDoc`), `richEligible`, `sourceForActiveRich`, `isSourceRichSplit`, and `heavyAsSource` is unaffected (html tabs never set `heavy`). Grep the file for `!codeDoc` to find all of them.
4. Add a render branch modeled on the `shouldMountCode` block (host-ref registration pattern identical):

```jsx
const shouldMountHtml = htmlDoc && (inView || mountedIds.has(tab.id))
if (shouldMountHtml) {
  const setHtmlHost = (el) => {
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
      key={`html:${tab.id}:${tab.reloadNonce}`}
      className={`editor-scroll html-scroll${paneClass}`}
      ref={setHtmlHost}
      style={{ display: inView ? undefined : 'none', order, flex: paneFlex, position: 'relative' }}
      onFocusCapture={() => onPaneFocus('rich')}
      onMouseDownCapture={() => onPaneFocus('rich')}
    >
      <button
        type="button"
        className="hm-icon-btn html-mode-toggle"
        title={t('html.toggleSource')}
        onClick={() => onToggleHtmlSource?.(tab.id)}
      >
        {htmlShowSource ? t('html.toggleRenderLabel') : t('html.toggleSourceLabel')}
      </button>
      {!isMobile && !htmlShowSource ? (
        <Suspense fallback={editorChunkFallback}>
          <HtmlEditor tab={tab} renderNonce={htmlRenderNonce?.[tab.id] || 0} />
        </Suspense>
      ) : isMobile ? (
        <div className="excalidraw-mobile-placeholder" role="status">{t('html.mobilePlaceholder')}</div>
      ) : (
        <Suspense fallback={editorChunkFallback}>
          <CodeEditor
            tab={tab}
            readOnly={readOnly}
            onChange={(text) => updateContent(tab.id, text)}
            registerApi={(api) => registerEditorApi(tab.id, api)}
            onRequestSave={() => onRequestSave?.(tab.id)}
          />
        </Suspense>
      )}
    </div>
  )
}
```

5. Because the `shouldMountCode` block would now never match html tabs (`isCodeDoc` is false), no further change is needed there.

- [ ] **Step 3: Add the two extra i18n labels**

Add `'html.toggleRenderLabel': 'Source'` / `'html.toggleSourceLabel': 'Rendered'` (en) and `'html.toggleRenderLabel': '源码'` / `'html.toggleSourceLabel': '渲染'` (zh) — the button shows the mode you will switch **to**.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: succeeds. (App does not pass the new props yet — the button is inert; `onToggleHtmlSource?.()` is optional-chained.)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/components/shell/EditorArea.jsx src/renderer/src/App.jsx src/renderer/src/i18n.jsx
git commit -m "feat(html): render html tabs in sandboxed iframe with source-mode toggle UI"
```

---

### Task 5: App wiring — toggle handler, open routing, guards

**Files:**
- Modify: `src/renderer/src/App.jsx`
- Modify: `src/renderer/src/hooks/useFileOps.js`
- Modify: `src/renderer/src/components/shell/EditorArea.jsx` (prop plumbing)

**Interfaces:**
- Consumes: `isHtmlTab`, `shouldAutoRenderHtml`, `loadHtmlViewModes`, `saveHtmlViewMode` from earlier tasks; App's existing `saveTab`, `setTabs`, `tabsRef`.
- Produces: `toggleHtmlSource(tabId)` in App; `htmlRenderNonce` state in App; html tabs open with `tab.htmlSource` initialized from the persisted view-mode map (default: render, or source when oversize).

- [ ] **Step 1: Initialize mode on open**

In `useFileOps.js`, in the `newTab` object (line ~143) add after `heavy: isHeavyDoc(content),`:

```js
htmlSource: isHtmlName(path) && (!shouldAutoRenderHtml(content) || loadHtmlViewModes()[norm] === 'source'),
```

Add the imports at the top: `isHtmlName` to the existing `paths.js` import, and `import { loadHtmlViewModes, saveHtmlViewMode } from '../components/editor-html.js'`.

- [ ] **Step 2: Toggle handler + render nonce in App.jsx**

In `App.jsx`:

1. Add state near the other view-mode state: `const [htmlRenderNonce, setHtmlRenderNonce] = useState({})`.
2. Add the handler near `toggleSourceRichSplit` (~line 812):

```js
// HTML tabs: rendered (disk-backed iframe) ↔ CodeMirror source. Toggling to
// render commits and saves first — the iframe reads the file from disk.
const toggleHtmlSource = useCallback(async (tabId) => {
  const tab = tabsRef.current.find((item) => item.id === tabId)
  if (!tab || tab.kind === 'settings') return
  const next = tab.htmlSource !== true
  if (!next) {
    await saveTab(tabId)
    setHtmlRenderNonce((prev) => ({ ...prev, [tabId]: (prev[tabId] || 0) + 1 }))
  }
  setTabs((items) => items.map((item) =>
    item.id === tabId ? { ...item, htmlSource: next } : item
  ))
  tabsRef.current = tabsRef.current.map((item) =>
    item.id === tabId ? { ...item, htmlSource: next } : item
  )
  if (tab.path) saveHtmlViewMode(tab.path, next ? 'source' : 'render')
}, [saveTab, setTabs, tabsRef])
```

Verify `saveTab` exists with that name/signature in App.jsx (`grep -n "const saveTab" src/renderer/src/App.jsx`); if it is named differently or lives in a hook, use the same call path `onRequestSave` resolves to. `saveHtmlViewMode` import comes from `./components/editor-html.js`? — no: `./components/editor-html.js` relative to `src/renderer/src/` is `./components/editor-html.js` (App.jsx sits in `src/renderer/src/`).

3. Pass both props to `EditorArea` (search for `<EditorArea` around line 1387): `onToggleHtmlSource={toggleHtmlSource}` and `htmlRenderNonce={htmlRenderNonce}`. Add the matching props to `EditorArea.jsx`'s destructure (near line 49).
4. Guards: in `toggleSourceRichSplit` (line ~819), add `isHtmlTab(tab)` to the unavailable check. In `findSourceActive` (line ~967), add `|| isHtmlTab(activeTab)`. In `outlineSourceMode` (line ~888), add `|| isHtmlTab(outlineTab)`. Import `isHtmlTab` into App.jsx's `paths.js` import.

- [ ] **Step 3: Manual smoke via build**

Run: `npm run build && npm start`
Create a test file `/tmp/horsemd-html-test/index.html`:

```html
<!doctype html><html><head><style>h1{color:crimson}</style></head>
<body><h1>Hello HorseMD</h1><script>document.title='JS-RAN'</script></body></html>
```

Open it from the sidebar. Expected: rendered view shows "Hello HorseMD" in crimson; DevTools console (dev run) shows no CSP violations; `document.title` inside the frame changes but the app window title does not. Click the toggle → CodeMirror source appears; edit `<h1>` text; toggle back → app saves, iframe reloads showing the edit. Quit, reopen → file opens in the mode last used.

- [ ] **Step 4: Build + commit**

Run: `npm run build` → succeeds.

```bash
git add src/renderer/src/App.jsx src/renderer/src/hooks/useFileOps.js src/renderer/src/components/shell/EditorArea.jsx
git commit -m "feat(html): wire toggle handler, save-before-render, and persisted view mode"
```

---

### Task 6: CDP regression test

**Files:**
- Create: `scripts/test-html-render-ui.mjs`

**Interfaces:**
- Consumes: `launchBuiltElectron`, `stopBuiltElectron` from `scripts/lib/electron-test-app.mjs` (default background mode); `human-input.mjs` only if text must be committed per-character (source edits here can use `insertText`-style bulk only for fixture setup — for the typed edit, send characters one at a time via `scripts/lib/human-input.mjs` per repo policy).
- Produces: `npm run test:html-render-ui` (add to `package.json` scripts).

- [ ] **Step 1: Write the test**

Model the script on an existing CDP test (read `scripts/test-pdf-table-layout-fidelity-ui.mjs` or another `test-*-ui.mjs` for the exact harness API before writing). Test flow:

1. Create a temp workspace with `index.html` containing `<h1 id="probe">Alpha</h1><script>window.__sandboxProbe=(window.parent!==window)</script>`.
2. Launch built app pointed at the workspace.
3. Assert the html tab renders an `.html-preview-frame` iframe and the pane does **not** contain a CodeMirror `.cm-editor`.
4. Click `.html-mode-toggle` → assert `.cm-editor` exists inside `.html-scroll` and the iframe is gone.
5. In the source editor, type `Beta` (per-character via human-input) replacing `Alpha`; toggle back → assert the iframe is present and, after reload, evaluate inside the frame (CDP `Runtime.evaluate` with the frame's execution context) that `document.getElementById('probe').textContent === 'Beta'` and `window.__sandboxProbe === true` (proves scripts ran and the frame is a distinct origin).
6. Save (Cmd/Ctrl+S via the harness), quit, relaunch → assert the tab reopens in render mode (iframe present) and content persisted.
7. Oversize case: write a 2 MB + 1 byte html fixture, open it → assert it opens directly in source mode with the `html.tooLarge` notice text present.

- [ ] **Step 2: Run it**

Run: `npm run build && node scripts/test-html-render-ui.mjs`
Expected: PASS. Iterate on failures until green (frame evaluation may need `Page.getFrameTree` / `Runtime.evaluate` with `contextId` — follow how existing scripts evaluate inside the PDF iframe if one does).

- [ ] **Step 3: Register the script**

In `package.json` `"scripts"`, add: `"test:html-render-ui": "node scripts/test-html-render-ui.mjs",`.

- [ ] **Step 4: Commit**

```bash
git add scripts/test-html-render-ui.mjs package.json
git commit -m "test(html): CDP regression for rendered/source toggle, sandbox, and reopen"
```

---

### Task 7: Docs, changelog, version bump, verification

**Files:**
- Modify: `package.json` (version), `CHANGELOG.md`, `docs/manual-test-checklist.md`

- [ ] **Step 1: Update docs**

- `CHANGELOG.md`: add a `0.13.241` entry — "HTML files now open rendered in a sandboxed preview with a toggle to source editing."
- `docs/manual-test-checklist.md`: add an HTML section — open/render/edit-in-source/toggle/save/reopen, oversized file opens in source, script-heavy page renders without affecting the app window.

- [ ] **Step 2: Bump version**

In `package.json`, set `"version": "0.13.241"`.

- [ ] **Step 3: Full verification**

Run in order; all must pass:

```bash
node scripts/test-html-classification.mjs
npm run test:html-render-ui
node scripts/test-strike-guard.mjs
npm run build
```

- [ ] **Step 4: Package + launch for user testing**

Per standing workflow:

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:dir
# kill running HorseMD, copy the fresh app to /Applications/HorseMD.app,
# xattr -dr com.apple.quarantine /Applications/HorseMD.app, launch it,
# verify the running process points at /Applications/HorseMD.app and that
# app.asar contains a marker string, e.g. 'horsemd.htmlView.v1'
```

- [ ] **Step 5: Commit**

```bash
git add package.json CHANGELOG.md docs/manual-test-checklist.md
git commit -m "chore: bump to 0.13.241; HTML render + source toggle docs"
```

---

## Dev-mode caveat (document, do not fix)

In dev (`npm run dev`, http: origin), an html file's **subresources** (relative `.css`/`.js` files next to it) resolve under `local-media://media/dir/...` and are 403-rejected by the media allowlist — only the html document itself is served. Inline styles/scripts and remote resources still work in dev. Full fidelity (local subresources) is verified on the packaged build where the page origin is `file://`. This is intentional; do not widen `MEDIA_EXT_RE` further.
