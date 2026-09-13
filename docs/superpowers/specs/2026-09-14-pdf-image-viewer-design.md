# In-App PDF & Image Viewer — Design

Date: 2026-09-14
Status: Approved (design dialogue 2026-09-14)

## Goal

HorseMD currently treats every non-Markdown/non-canvas file (`.txt` fallback path) as
plain text in the textarea. Clicking a PDF or image file in the sidebar shows binary
garbage. This feature makes HorseMD a usable workspace hub: PDFs and images open as
read-only in-app viewer tabs.

## Scope decisions (user-approved)

- **Open behavior:** in-app viewing in tabs (not `shell.openPath` handoff).
- **Image formats (basic tier):** `png`, `jpg`, `jpeg`, `gif`, `webp`, `svg`, `bmp`,
  `ico`, plus `avif` (Chromium-native). HEIC/HEIF explicitly out of scope.
- **PDF rendering:** Chromium's built-in PDF viewer inside an `<iframe>` — zero new
  npm dependencies. A self-built pdf.js viewer was considered and rejected
  (heavy, high maintenance, editor app does not need a custom PDF UI).
- **Image viewer tier:** standard viewer — small toolbar (zoom in/out, fit width,
  1:1, rotate, save-as) + Ctrl/Cmd+wheel zoom. No same-folder prev/next browsing.
- **Platform:** desktop (Electron) first. Mobile gates the feature off via
  `window.api.capabilities`; no Capacitor viewer implementation this round.

## Current-code touchpoints

- `src/main/index.js` — `FILE_EXTS` drives the open-dialog filter, launch-arg
  extraction, and sidebar tree membership. Add the image extensions and `pdf`.
- `src/renderer/src/paths.js` — `MD_DOC_RE` / `isPlainTextDoc` classify tabs. Media
  files must be classified as read-only viewers, NOT plain text (the textarea must
  never capture them), mirroring the existing `.excalidraw` / `.drawio` pattern.
- `src/main/index.js` local-media protocol handler — currently image-only; must also
  allow `pdf` with `application/pdf` Content-Type so the renderer iframe can load it.
- Renderer CSP — add `frame-src local-media:` if the current policy does not cover it.

## Architecture

### File classification (renderer)

In `paths.js`:

- `IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i`, `isImageName()`.
- `PDF_RE = /\.pdf$/i`, `isPdfName()`.
- `isMediaDoc(tab)` = has path && (isImageName || isPdfName).
- `isPlainTextDoc` gains a media exclusion so media never routes to the textarea.

Media tabs are read-only: never dirty, never saved, excluded from find/replace,
outline, review, and global search (search exclusion falls out automatically because
main-process search classification keeps its own `MD_EXTS` list).

### Viewers (renderer)

- `src/renderer/src/components/PdfViewer.jsx` — an `<iframe>` pointed at
  `local-media://<abs-path>`. Chromium's built-in viewer provides paging, zoom,
  search, and outline. Lazy-loaded chunk like the Excalidraw/drawio editors.
- `src/renderer/src/components/MediaViewer.jsx` (image viewer) — centered `<img>`
  with a small toolbar: zoom in / out, fit-width, 100%, rotate 90°, save-as.
  Ctrl/Cmd+wheel zooms around the cursor. Lazy-loaded chunk.
- `EditorArea.jsx` (rendering only) routes: media tab → viewer component; it must not
  mount Crepe or the textarea for media tabs.

URL scheme note: on a `file://` renderer origin an `<iframe src="file://…">` would
also work, but `local-media://` is already the sanctioned channel for local media on
both dev (http) and packaged origins — use it for both viewers.

### Main process

- `FILE_EXTS` gains the image extensions and `pdf` (open dialog, launch args, tree).
- local-media protocol handler: allow `pdf`, return correct MIME; keep the existing
  path-security posture (absolute paths, no restricted roots).
- If Chromium's built-in PDF viewer fails to activate under the custom scheme
  (verified during implementation), fall back to a per-tab "open with system viewer"
  button and report back to the user. Do not silently ship a broken viewer.

### Session & state

- Media tabs persist through session restore like document tabs (path + type only;
  no content, no dirty state). Settings tabs remain transient; media viewer tabs are
  ordinary restored tabs that re-resolve their file on activation.

## Error handling

- Missing/unreadable file: viewer shows an inline error state (icon + path +
  "file missing or unreadable"); the tab stays open and can be closed.
- Unsupported/corrupt image: `<img>` error handler → same inline error state.
- Rotation/zoom state is per-tab ephemeral; resetting on reopen is acceptable.

## Security

- No Node integration changes; viewers consume files only through the existing
  `local-media` protocol, which already enforces absolute-path serving.
- SVGs render through `<img>` (image context never executes scripts inside SVGs).
- No new npm dependencies.

## Testing & delivery

- New `scripts/test-media-viewer-ui.mjs` (CDP, `launchBuiltElectron()` background
  mode): fixture PNG, SVG, and PDF; assert the viewer mounts, the textarea does not
  capture the file, session restore reopens a media tab as a viewer, and the error
  state appears for a deleted file.
- `npm run build` before handoff; run the media viewer script plus the existing
  source-fidelity suite untouched.
- Docs: update `docs/manual-test-checklist.md`, the matching `guide/` page, and
  `CHANGELOG.md`; bump the patch version; build/package and launch for manual
  verification per standing workflow.
