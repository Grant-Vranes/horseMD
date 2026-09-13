// Resolve the user's "attachment folder" preference into a concrete target
// directory plus the Markdown path prefix for files written there. Shared by
// image:save, attachment:save and image:inlineForSave so pasted images,
// attached files and save-time relocation all land in the same folder.
// Pure node:path math — no Electron imports — so
// scripts/test-attachment-folder.mjs can verify it without launching the app.
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'

// 'current'  — next to the document (./)
// 'assets'   — ./assets (legacy default)
// 'docname'  — ./<filename>.assets (Typora's ${filename}.assets)
// 'custom'   — user path, ${filename} expands to the document stem
export const ATTACHMENT_MODES = ['current', 'assets', 'docname', 'custom']

const expandCustomPath = (raw, stem) => String(raw).replaceAll('${filename}', stem)

export function resolveAttachmentTarget(docPath, mode, customPath) {
  const docDir = dirname(docPath)
  const stem = basename(docPath, extname(docPath))
  let dir
  if (mode === 'current') {
    dir = docDir
  } else if (mode === 'docname') {
    dir = join(docDir, `${stem}.assets`)
  } else if (mode === 'custom') {
    const raw = String(customPath || '').trim()
    if (!raw) {
      // Empty custom path would scatter files into an unintended place; fall
      // back to the classic ./assets instead of writing next to the document.
      dir = join(docDir, 'assets')
    } else {
      const expanded = expandCustomPath(raw, stem)
      dir = isAbsolute(expanded) ? resolve(expanded) : resolve(docDir, expanded)
    }
  } else {
    dir = join(docDir, 'assets')
  }
  // Markdown link prefix: prefer a path relative to the document folder so the
  // saved file stays portable; node:path.relative already returns an absolute
  // path when the target sits on a different drive (Windows), which still
  // produces a valid link after separator normalization.
  const rel = relative(docDir, dir).split(sep).join('/')
  const prefix = rel === '' ? '' : rel + '/'
  return { dir, prefix }
}
