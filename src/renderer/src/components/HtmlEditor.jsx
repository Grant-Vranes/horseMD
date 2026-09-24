// HtmlEditor — read-only rendered view of an HTML document. The iframe loads
// the document from disk (file:// packaged, local-media:// dev) so scripts,
// remote resources, and document-relative assets behave like a real browser
// page. sandbox without allow-same-origin keeps the frame in an opaque origin:
// its scripts cannot reach window.api, localStorage, or the parent window.
// Render mode always reflects the file on disk; App saves before toggling here.
import { buildHtmlFrameUrl } from './editor-html-view.js'

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
