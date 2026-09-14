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
