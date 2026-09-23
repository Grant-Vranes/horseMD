import { useEffect, useState } from 'react'

const hasExternalFiles = (event) =>
  Array.from(event.dataTransfer?.types || []).includes('Files')

const droppedNativePaths = (dataTransfer) => {
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

// Desktop shell drop-open boundary. Dropping external files/folders on the
// topbar opens them as tabs/workspaces; drops anywhere else are ignored so the
// editor keeps its own insert behaviors. Internal tab/sidebar/outline drags do
// not carry the native `Files` type and are ignored. Drops without native
// paths (e.g. an image dragged from a browser) fall through to the editor.
export function useDropOpen({ enabled, openPaths, addFolder }) {
  const [active, setActive] = useState(false)

  useEffect(() => {
    if (!enabled || !window.api.classifyDroppedPaths || !window.api.getPathForDroppedFile) {
      setActive(false)
      return undefined
    }

    // Cheap per-event checks; all payload inspection happens once, at drop time.
    const hasExternalFileDrag = (event) => hasExternalFiles(event)
    const overTopbar = (event) => Boolean(event.target?.closest?.('.topbar'))

    const openDroppedPaths = async (paths) => {
      if (!paths.length) return
      const entries = await window.api.classifyDroppedPaths(paths)
      const files = []
      for (const entry of entries || []) {
        if (entry?.type === 'dir') addFolder(entry.path)
        else if (entry?.type === 'file') files.push(entry.path)
      }
      if (files.length) await openPaths(files)
    }

    const onDragEnter = (event) => {
      if (!hasExternalFileDrag(event)) return
      // Only the topbar is a drop target; everywhere else shows the
      // not-allowed cursor and the editor keeps its own drop behavior.
      if (!overTopbar(event)) {
        setActive(false)
        return
      }
      // Flip the overlay on immediately, without waiting for the next dragover.
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      setActive(true)
    }

    const onDragOver = (event) => {
      if (!hasExternalFileDrag(event)) return
      if (!overTopbar(event)) {
        setActive(false)
        return
      }
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      setActive(true)
    }

    const onDragLeave = (event) => {
      if (!event.relatedTarget) {
        // Left the window (or entered an iframe): end the visual drag state.
        setActive(false)
      }
    }

    const onDrop = (event) => {
      if (!hasExternalFiles(event)) return
      if (!overTopbar(event)) return // Not on the drop target: let other handlers run.
      setActive(false)
      // Only claim the drop when there are real native paths to open. Synthetic
      // payloads (e.g. an image dragged from a browser) have no native path;
      // letting those fall through keeps the editor's insert-image and plain
      // text drop handlers working.
      const paths = droppedNativePaths(event.dataTransfer)
      if (!paths.length) return
      event.preventDefault()
      event.stopPropagation()
      void openDroppedPaths(paths)
        // The dropped item may disappear or become unreadable after the native
        // drag starts. Treat that like a cancelled drop instead of leaving an
        // unhandled renderer promise rejection.
        .catch(() => {})
    }

    // Capture the drop before ProseMirror can consume an unsupported file.
    window.addEventListener('dragenter', onDragEnter, true)
    window.addEventListener('dragover', onDragOver, true)
    window.addEventListener('dragleave', onDragLeave, true)
    window.addEventListener('drop', onDrop, true)
    return () => {
      window.removeEventListener('dragenter', onDragEnter, true)
      window.removeEventListener('dragover', onDragOver, true)
      window.removeEventListener('dragleave', onDragLeave, true)
      window.removeEventListener('drop', onDrop, true)
    }
  }, [enabled, openPaths, addFolder])

  return active
}
