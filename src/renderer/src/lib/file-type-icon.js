// Shared tab file-type icon picker. Used by the topbar tab strip (Tabs.jsx)
// and the open-files flyout (shell/OpenFilesButton.jsx) so both always show
// the same glyph for the same file.
import {
  isMarkdownName,
  isExcalidrawName,
  isDrawioName,
  isImageName,
  isPdfName,
  isHtmlName,
  isCodeName
} from '../paths.js'

export const tabFileIcon = (tab) => {
  const name = tab.path || tab.title || ''
  if (isMarkdownName(name)) return 'markdown'
  if (isExcalidrawName(name)) return 'whiteboard'
  if (isDrawioName(name)) return 'diagram'
  if (isImageName(name)) return 'image'
  if (isPdfName(name)) return 'file'
  if (isHtmlName(name)) return 'html'
  if (isCodeName(name)) return 'code'
  return 'file'
}
