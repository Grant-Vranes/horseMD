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
