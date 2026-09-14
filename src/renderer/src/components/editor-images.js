// Resolve relative image paths in a document against the file's folder, as
// display-only file:// URLs (the document model keeps the original relative src).

// Typora-style unique filename for a pasted/clipboard image: keep the original
// stem + ext, insert a millisecond timestamp before the extension so repeated
// pastes (QQ/WeChat screenshots default to "image.png", "QQ_*.png") never
// overwrite a same-named file on the image host. e.g. image.png →
// image-20260706004550557.png. Stale/generic names ("image", "QQ_screenshot_…")
// and empty names all get a unique stamp; real names are preserved as-is.
const PAD2 = (n) => String(n).padStart(2, '0')
const timestamp17 = () => {
  const d = new Date()
  return `${d.getFullYear()}${PAD2(d.getMonth() + 1)}${PAD2(d.getDate())}` +
    `${PAD2(d.getHours())}${PAD2(d.getMinutes())}${PAD2(d.getSeconds())}` +
    `${String(d.getMilliseconds()).padStart(3, '0')}`
}
export function uniqueImageName(name) {
  const ext = (String(name || '').match(/\.([a-z0-9]+)$/i)?.[1] || 'png').toLowerCase()
  const raw = String(name || '').replace(/\.[^.]+$/, '').trim() || 'image'
  const stem = raw.replace(/[\\/:*?"<>|]/g, '_').slice(0, 48) || 'image'
  return `${stem}-${timestamp17()}.${ext}`
}

export function dirOf(path) {
  if (!path) return null
  const norm = path.replace(/\\/g, '/')
  const i = norm.lastIndexOf('/')
  return i >= 0 ? norm.slice(0, i) : null
}

// A src is "relative" if it has no scheme (http:, data:, file:…), is not a
// protocol-relative URL, and is not an absolute filesystem path.
export function isRelativePath(src) {
  if (!src) return false
  if (/^[a-z][a-z0-9+.-]*:/i.test(src)) return false // http:, data:, file:, C: …
  if (src.startsWith('//')) return false
  if (src.startsWith('/')) return false
  return true
}

export function resolveToFileUrl(baseDir, src) {
  const base = baseDir.replace(/\\/g, '/').replace(/\/+$/, '')
  const isWin = /^[a-zA-Z]:/.test(base)
  const segs = base.split('/')
  // Markdown parsers preserve authored percent escapes such as `%20`. Decode
  // those once before constructing the file URL; passing them straight to
  // encodeURI turns `%20` into `%2520`, so paths with spaces/CJK fail (#101).
  let decodedSrc = String(src || '')
  try {
    decodedSrc = decodeURI(decodedSrc)
  } catch {
    // Keep malformed percent sequences literal; encodeURI below will make them
    // a valid path rather than rejecting the whole image.
  }
  for (const part of decodedSrc.replace(/\\/g, '/').split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') segs.pop()
    else segs.push(part)
  }
  const joined = segs.join('/')
  const url = isWin ? 'file:///' + joined : 'file://' + (joined.startsWith('/') ? joined : '/' + joined)
  return encodeURI(url)
}

// Display-only URL for a resolved file:// image URL. On a file:// page (the
// packaged desktop app) file:// subresources load directly. On any other
// origin (Vite dev server, and non-file embedded hosts) Chromium blocks
// file:// subresources, so rewrite to the desktop-only local-media://
// protocol registered by the main process. Standard schemes parse the first
// path segment as the host, so the fixed host "media" carries the absolute
// file path in the pathname. Mobile shims have no such protocol and never
// get here: their window.api.platform is not a desktop value, so they keep
// whatever src they had.
const DESKTOP_PLATFORMS = new Set(['darwin', 'win32', 'linux'])
export function toDisplayImageUrl(fileUrl) {
  if (!fileUrl || !fileUrl.startsWith('file://')) return fileUrl
  if (typeof window === 'undefined') return fileUrl
  if (window.location?.protocol === 'file:') return fileUrl
  const platform = window.api?.platform
  if (!DESKTOP_PLATFORMS.has(platform)) return fileUrl
  return 'local-media://media' + fileUrl.slice('file://'.length)
}

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
