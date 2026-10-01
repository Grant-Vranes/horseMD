// Shared file meta formatting for topbar hover tips (Tabs.jsx tab tip card and
// the open-files flyout item titles). Derived from the tab itself: the type
// from the file name, the size from the current document content in bytes.
import { isMarkdownName, isExcalidrawName, isDrawioName, isImageName } from '../paths.js'

const extOf = (name) => {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(i + 1).toLowerCase() : ''
}

export const tabFileTypeName = (tab) => {
  const name = tab?.path || tab?.title || ''
  if (isMarkdownName(name)) return 'Markdown'
  if (isExcalidrawName(name)) return 'Excalidraw'
  if (isDrawioName(name)) return 'Draw.io'
  if (isImageName(name)) {
    const ext = extOf(name)
    return ext ? ext.toUpperCase() : 'Image'
  }
  const ext = extOf(name)
  return ext ? ext.toUpperCase() : ''
}

export const formatBytes = (bytes) => {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes}B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb >= 100 ? Math.round(kb) : Math.round(kb * 10) / 10}KB`
  const mb = kb / 1024
  return `${mb >= 100 ? Math.round(mb) : Math.round(mb * 10) / 10}MB`
}

// "Markdown • 12.3KB" style meta string; empty pieces are omitted.
// sizeOverride (bytes) comes from the disk-size cache for media tabs whose
// tab content is empty; otherwise the text content length is used.
export const tabFileMeta = (tab, sizeOverride) => {
  if (!tab) return ''
  const type = tabFileTypeName(tab)
  const bytes = sizeOverride != null
    ? sizeOverride
    : new TextEncoder().encode(tab.savedContent ?? tab.content ?? '').length
  const size = formatBytes(bytes)
  return [type, size].filter(Boolean).join(' • ')
}
