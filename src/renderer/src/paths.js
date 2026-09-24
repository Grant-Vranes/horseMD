// Shared pure helpers: paths, filenames, doc classification, session, ids.
// All stateless — no React, no DOM mutation — so safe to import anywhere in the
// renderer. (The main process has its own copies; it can't import this module.)

// Compare dotted versions: is `a` newer than `b`? (e.g. '0.1.5' > '0.1.4')
// Is semver `a` newer than semver `b`? Call as isNewerVersion(latest, current)
// → true when an update is available. (a/b order matters; a flipped call would
// always report "up to date".)
export function isNewerVersion(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0)
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0)
    if (d !== 0) return d > 0
  }
  return false
}

// An absolute path: POSIX "/…", Windows "C:\…"/"C:/…", or a UNC "\\…". A relative
// path like "." would resolve against the process CWD (= "/" under launchd), so a
// workspace must be absolute — otherwise the file tree / watcher target the wrong
// place (and recursively watching "/" crashes the app).
export const isAbsolutePath = (p) =>
  typeof p === 'string' && (/^\//.test(p) || /^[a-zA-Z]:[\\/]/.test(p) || /^\\\\/.test(p))

export function normalizePathKey(p) {
  let s = String(p || '').replace(/\\/g, '/')
  while (s.length > 1 && !/^[a-zA-Z]:\/$/.test(s) && s.endsWith('/')) s = s.slice(0, -1)
  return s
}

// Renderer-side mirror of main's isRestrictedRoot: paths we must never treat as
// a workspace folder root. Watching or listing one (/, /dev, /System/Volumes…)
// floods the tree with permission-protected files and crashes the recursive
// chokidar watcher. Kept in sync with src/main/index.js isRestrictedRoot.
export const isRestrictedPath = (p) => {
  const norm = (p || '').replace(/[\\/]+$/, '')
  if (norm === '' || norm === '/' || norm === '.' || norm === '..') return true
  if (!isAbsolutePath(norm)) return true
  return /^\/(dev|proc|System\/Volumes|private\/var\/(db|folders)|\.vol)(\/|$)/.test(norm)
}

// ---- Single-workspace data model ----
// The workspace is the single, unnamed container for the sidebar file tree. It
// holds N folder roots (multi-root tree) — that's it. No name, no multiple
// workspaces, no switching (HorseMD is a writing app, one workspace is enough;
// users add/remove folders within it). Session persists `folderRoots: [abs,…]`.

// Filter to absolute, non-restricted, de-duplicated roots (mirrors main's
// isRestrictedRoot; a relative/restricted root would crash the chokidar watcher).
export function sanitizeFolderRoots(list) {
  if (!Array.isArray(list)) return []
  const seen = new Set()
  const out = []
  for (const p of list) {
    if (typeof p !== 'string' || !isAbsolutePath(p) || isRestrictedPath(p)) continue
    const k = normalizePathKey(p)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(k)
  }
  return out
}

// Migrate the session into a flat folderRoots array. Accepts the current shape
// { folderRoots } plus two legacy shapes (no data loss across upgrades):
//   - { workspaces: [{ folderRoots }] }   (the multi-workspace build) → merge all roots
//   - { workspace: { rootPath } }          (the original single-folder build) → [rootPath]
export function loadFolderRootsFromSession(session) {
  if (!session) return []
  if (Array.isArray(session.folderRoots)) return sanitizeFolderRoots(session.folderRoots)
  if (Array.isArray(session.workspaces)) {
    const all = session.workspaces.flatMap((w) => (w && Array.isArray(w.folderRoots) ? w.folderRoots : []))
    return sanitizeFolderRoots(all)
  }
  const legacy = session.workspace
  if (legacy && isAbsolutePath(legacy.rootPath) && !isRestrictedPath(legacy.rootPath)) {
    return sanitizeFolderRoots([legacy.rootPath])
  }
  return []
}

export const baseName = (p) => (p ? p.split(/[\\/]/).pop() : 'Untitled')
export const dirName = (p) => (p ? p.replace(/[\\/][^\\/]*$/, '') : '')
export const joinPath = (dir, name) => `${dir.replace(/[\\/]+$/, '')}/${name}`

// Files that open in the rich Markdown editor. Anything else with a path (e.g.
// .txt) is treated as plain text and opened in the fast textarea — feeding plain
// text through Milkdown collapses its line breaks and bogs down on large files.
export const MD_DOC_RE = /\.(md|markdown|mdx)$/i
export const isMarkdownName = (name) => MD_DOC_RE.test(name || '')

// Excalidraw whiteboards and drawio diagrams: standalone files opened in
// dedicated canvas editors (lazy chunks). They are NOT plain-text docs (the
// textarea must not capture them) and are excluded from global search by the
// main process.
export const EXCALIDRAW_RE = /\.excalidraw$/i
export const isExcalidrawName = (name) => EXCALIDRAW_RE.test(name || '')
export const DRAWIO_RE = /\.drawio$/i
export const isDrawioName = (name) => DRAWIO_RE.test(name || '')

// HTML documents open rendered (sandboxed iframe) with a source-mode toggle
// to the CodeMirror editor. They are NOT plain-text docs and NOT code docs.
export const HTML_DOC_RE = /\.(html|htm)$/i
export const isHtmlName = (name) => HTML_DOC_RE.test(name || '')
export const isHtmlTab = (tab) =>
  !!(tab && (tab.fileType === 'html' || isHtmlName(tab.path)))
export const isHtmlDoc = (tab) => isHtmlTab(tab)

// Large HTML files open directly in source mode; rendering multi-megabyte
// documents into an iframe is not a useful default.
export const HTML_RENDER_MAX_BYTES = 2 * 1024 * 1024
export const shouldAutoRenderHtml = (content) =>
  typeof content === 'string' && content.length <= HTML_RENDER_MAX_BYTES

// Source-code / config files open in the CodeMirror-based code editor (syntax
// highlighting + line numbers). Keep this list in sync with the main
// process's FILE_EXTS (src/main/index.js) so the file tree shows these files.
export const CODE_EXTS = [
  'java', 'py', 'pyw', 'yml', 'yaml', 'xml', 'json', 'jsonc', 'json5',
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'mts', 'cts', 'tsx',
  'css', 'scss', 'sass', 'less', 'vue', 'svelte',
  'c', 'h', 'cpp', 'cc', 'cxx', 'hpp', 'hh', 'cs', 'go', 'rs', 'rb', 'php',
  'swift', 'kt', 'kts', 'scala', 'dart', 'lua', 'pl', 'pm', 'r', 'jl',
  'sh', 'bash', 'zsh', 'fish', 'bat', 'cmd', 'ps1',
  'sql', 'graphql', 'gql', 'proto', 'toml', 'ini', 'cfg', 'conf', 'properties',
  'gradle', 'groovy', 'cmake', 'mk', 'make', 'dockerfile', 'env', 'gitignore',
  'csv', 'tsv', 'diff', 'patch', 'vim', 'tf', 'hcl', 'nginx', 'sln', 'csproj'
]
export const CODE_RE = new RegExp(`\\.(${CODE_EXTS.join('|')})$`, 'i')
// Extensionless well-known names (Dockerfile, Makefile, .gitignore-style dotfiles).
export const CODE_BASENAMES = /^(dockerfile|makefile|gnumakefile|cmakelists\.txt|\.gitignore|\.env.*|\.editorconfig|\.npmrc|\.babelrc)$/i
export const isCodeName = (name) =>
  !!name && (CODE_RE.test(name) || CODE_BASENAMES.test(name))
export const isCodeDoc = (tab) => !!(tab && tab.path && isCodeName(tab.path))

// Read-only media files open in dedicated viewer tabs (Chromium <img> / built-in
// PDF viewer). Like .excalidraw/.drawio they are NOT plain-text docs (the
// textarea must never capture them) and stay out of global search (the main
// process keeps its own MD_EXTS list for search classification).
export const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i
export const isImageName = (name) => IMAGE_RE.test(name || '')
export const PDF_RE = /\.pdf$/i
export const isPdfName = (name) => PDF_RE.test(name || '')

export const isMediaDoc = (tab) =>
  !!(tab && tab.path && (IMAGE_RE.test(tab.path) || PDF_RE.test(tab.path)))

// Canvas tab classification. Scratch (pathless) tabs created from the topbar
// flyout carry an explicit `fileType` so they render as canvas editors and
// save with the right extension before the first save assigns a real path;
// saved tabs are classified by their path extension as before.
export const isExcalidrawTab = (tab) =>
  !!(tab && (tab.fileType === 'excalidraw' || isExcalidrawName(tab.path)))
export const isDrawioTab = (tab) =>
  !!(tab && (tab.fileType === 'drawio' || isDrawioName(tab.path)))
// Default save extension for a tab: canvas kinds use their own extension,
// everything else is Markdown (the legacy scratch-tab default).
export const tabSaveExt = (tab) =>
  isExcalidrawTab(tab) ? 'excalidraw' : isDrawioTab(tab) ? 'drawio' : 'md'

export const isPlainTextDoc = (tab) =>
  !!(tab && tab.path && !MD_DOC_RE.test(tab.path) && !EXCALIDRAW_RE.test(tab.path) &&
    !DRAWIO_RE.test(tab.path) && !IMAGE_RE.test(tab.path) && !PDF_RE.test(tab.path) &&
    !HTML_DOC_RE.test(tab.path) &&
    !isCodeDoc(tab))

// A valid single path-segment name: no separators / reserved chars, not "."/"..".
export const isValidName = (name) => !!name && !/[\\/:*?"<>|]/.test(name) && name !== '.' && name !== '..'
// Does this fs error mean "a file/folder with that name already exists"?
export const isExistsError = (e) => /eexist|already exists/i.test(e?.message || '')

// Docs above this size must never render through a full-content <textarea>:
// Blink lays out the entire value synchronously on mount (a 15MB text file
// measured ~6.6s of main-thread block with soft wrap, still ~2s with wrap off),
// which whites out the whole app while opening. Such docs open in the
// virtualized CodeMirror editor instead — same content/save contracts as code
// docs (onChange → updateContent, registerApi flushMarkdown for saves).
export const HUGE_TEXT_LIMIT = 2 * 1024 * 1024
export const isHugeTextDoc = (tab) =>
  !!(tab && typeof tab.content === 'string' && tab.content.length > HUGE_TEXT_LIMIT)

// A Markdown doc is "heavy" to render richly when:
//   ① it has a huge run of non-blank lines (no paragraph breaks) → ProseMirror
//     near-quadratic freeze;
//   ② total chars > 400 K;
//   ③ total lines > 50 K → even with normal blank-line breaks, the sheer number
//     of nodes (50 K+ paragraphs) makes the full parse + DOM render block the
//     main thread for many seconds.
// Such docs open in the fast plain-text editor by default (instant); the user
// can opt into the rich editor per-tab.
const HEAVY_MAX_BLOCK_LINES = 1000
const HEAVY_MAX_TOTAL = 400000
const HEAVY_MAX_LINES = 50000
export function isHeavyDoc(content) {
  if (!content) return false
  if (content.length > HEAVY_MAX_TOTAL) return true
  let run = 0
  let lines = 0
  for (const line of content.split('\n')) {
    if (++lines > HEAVY_MAX_LINES) return true // ← P0-1: line-count guard
    if (/^[ \t\r]*$/.test(line)) {
      run = 0
    } else if (++run > HEAVY_MAX_BLOCK_LINES) {
      return true
    }
  }
  return false
}

// CSS content-visibility helps truly huge rich documents, but it is not free:
// Chromium must swap each off-screen block from estimated to real height as it
// scrolls in. On Windows that estimation churn regressed medium CJK-heavy docs
// such as "WhatIf因果推断详细笔记.md" (~245 K chars, ~585 rendered blocks).
// Gate CV by rough block/line scale instead of raw character count.
export function shouldUseRichContentVisibility(content) {
  if (!content) return false
  if (content.length >= 400000) return true
  let lines = 0
  let blocks = 0
  let inBlock = false
  for (const line of content.split('\n')) {
    lines += 1
    if (/^[ \t\r]*$/.test(line)) {
      inBlock = false
    } else if (!inBlock) {
      blocks += 1
      inBlock = true
    }
    if (lines >= 8000 || blocks >= 1200) return true
  }
  return false
}

let idCounter = 0
export const genId = () => `t${++idCounter}_${Date.now()}`

export const LS = 'minimd.session.v1'
export const loadSession = () => {
  try {
    return JSON.parse(localStorage.getItem(LS)) || {}
  } catch {
    return {}
  }
}
