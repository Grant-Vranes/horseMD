# HTML File Rendering With Source Mode Toggle — Design

Date: 2026-09-14 (approved in conversation; versioned spec)
Status: Approved

## Goal

`.html` / `.htm` files currently open in the CodeMirror code editor (source
highlighting only). Users want HTML files to open **rendered by default**, with
a one-click toggle to a source-code editing mode — mirroring the app's existing
Markdown rich/source mental model.

Decision summary from brainstorming:

- Rendering approach: **A** — rendered view + source mode toggle (not split
  preview, not read-only render).
- Sandbox capability: **B** — iframe sandbox with scripts and network allowed;
  no same-origin privileges.
- Refresh model: re-render the whole page when switching back to render mode;
  no live re-render while typing in source mode.

## 1. File Classification (`src/renderer/src/paths.js`)

- Add `HTML_DOC_RE = /\.(html|htm)$/i`, `isHtmlName()`, `isHtmlTab(tab)`.
- `.html/.htm` are removed from the plain CodeMirror path: the file tree still
  lists them (main process `FILE_EXTS` already includes html), but opening
  routes to the new HTML editor instead of the code editor.
- Large-file guard: above a threshold (~2 MB) the tab opens in source mode only
  and does not auto-render, consistent with the heavy-document strategy. A
  top-bar notice explains why.

## 2. Render Component

New `src/renderer/src/components/HtmlEditor.jsx` plus focused helper
`components/editor-html.js` (per repo convention of `editor-*.js` helpers).

- Render mode: `<iframe sandbox="allow-scripts allow-popups allow-forms">`.
  Deliberately **not** `allow-same-origin`: scripts run in an opaque origin and
  cannot reach `window.api`, `localStorage`, or the parent window DOM.
- Content write: initial `srcdoc`; subsequent updates (switch back to render)
  rewrite the whole document — simple and reliable.
- External `http(s)://` resources load normally. The renderer CSP must be
  checked/adjusted so the iframe can load remote styles/scripts/images
  (frame-src / resource directives). Local relative-path assets resolve
  against the workspace using the same mechanism as existing image resource
  resolution.
- Render mode is read-only; no editor toolbar is shown.

## 3. Source Mode (reuse existing facilities)

- Reuse the existing CodeMirror-based `CodeEditor.jsx` (html highlighting
  already available).
- Toggle control mirrors the Markdown source/rich toggle (toolbar button +
  shortcut; exact keybinding aligned with the existing mode-switch hooks at
  implementation time).
- No `useSourceModeSwitch` offset-mapping machinery is needed — the switch is
  a pure UI toggle between iframe display and CodeMirror display. Switching
  back to render re-renders from the latest committed source.

## 4. State, Dirty Tracking, And Save

- Editing happens only in source mode and flows through the existing
  dirty + `saveTab()` pipeline. No new save boundary.
- `tab.content` holds the HTML source; the last active mode is recorded on the
  tab and restored by session restore.
- Before switching to render mode, any uncommitted source edits are committed
  first.

## 5. Errors And Boundaries

- Script errors inside the iframe are contained by the sandbox and cannot
  affect the main window.
- Render failure or oversized files: fall back to source mode with a notice
  bar.

## 6. Testing

- New CDP script under `scripts/`: open html → renders by default → toggle to
  source, edit → toggle back, content updated → save and reopen, content
  identical. A file containing `<script>` runs in the sandbox but cannot touch
  the parent window.
- `npm run build` before handoff; add an HTML section to
  `docs/manual-test-checklist.md`.

## Out Of Scope

- Split-pane live preview (option B of the original question).
- Per-file script on/off settings (option C) — rejected in favor of always-on
  sandboxed scripts.
- Making rendered HTML editable in place (WYSIWYG HTML editing).
