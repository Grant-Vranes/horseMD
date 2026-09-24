// editor-html-view.js — pure helpers for the HTML document tab: frame URL building
// and per-path view-mode persistence (render vs source) across sessions.
// (Named -view to avoid the pre-existing editor-html.js Milkdown raw-HTML module.)
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

// Display URL for the iframe. The document is always served over
// local-html://doc/<abs-path> (registered in src/main/index.js): a sandboxed
// file: iframe loads nothing (opaque origin), while local-html is a standard
// scheme the sandbox happily navigates. Relative subresources resolve against
// the document path inside the same scheme.
export function buildHtmlFrameUrl(tab) {
  const norm = String(tab?.path || '').replace(/\\/g, '/')
  if (!norm) return ''
  return 'local-html://doc' + (norm.startsWith('/') ? norm : '/' + norm)
}
