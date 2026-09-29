// Shared helpers for native desktop drag-and-drop of files/folders. Used by
// both the topbar drop-open boundary (useDropOpen) and the sidebar
// drop-to-add-workspace boundary (Sidebar).

export const hasExternalFiles = (event) =>
  Array.from(event.dataTransfer?.types || []).includes('Files')

// Resolve the native filesystem paths behind a drop payload. Returns [] when
// the runtime can't map File objects to paths (e.g. synthetic browser drags).
export const droppedNativePaths = (dataTransfer) => {
  const resolvePath = window.api.getPathForDroppedFile
  if (!resolvePath) return []
  const paths = []
  const seen = new Set()
  for (const file of [...(dataTransfer?.files || [])]) {
    let path = ''
    try {
      path = resolvePath(file)
    } catch {
      path = ''
    }
    if (!path || seen.has(path)) continue
    seen.add(path)
    paths.push(path)
  }
  return paths
}

// Split classified dropped paths into workspace folders and openable files:
// directories are added as folder roots, files are opened as tabs.
export const openDroppedPaths = async (paths, { addFolder, openPaths }) => {
  if (!paths.length) return
  const entries = await window.api.classifyDroppedPaths(paths)
  const files = []
  for (const entry of entries || []) {
    if (entry?.type === 'dir') addFolder(entry.path)
    else if (entry?.type === 'file') files.push(entry.path)
  }
  if (files.length) await openPaths(files)
}
