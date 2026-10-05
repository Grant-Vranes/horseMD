import { useCallback, useEffect, useRef, useState } from 'react'
import {
  isAbsolutePath,
  isRestrictedPath,
  normalizePathKey,
  sanitizeFolderRoots
} from '../paths.js'

// Owns the renderer-side multi-root workspace. Open-document file watchers stay
// in useFileOps because they have a different lifecycle and dirty-content guard.
export function useWorkspace({ initialFolderRoots, setSidebarOpen }) {
  const [folderRoots, setFolderRoots] = useState(() => sanitizeFolderRoots(initialFolderRoots))
  const folderRootsKey = folderRoots.join('\n')
  // `files` (the command-palette quick-switcher list) is EXPENSIVE to build:
  // fs:listFiles walks every root recursively on the main process. Building it
  // eagerly on add/remove or on watcher bursts froze the whole app on large
  // workspaces, so it is computed lazily via ensureFiles() when the palette
  // opens, and reused until the root set changes.
  const [files, setFiles] = useState([])
  const filesRootsKeyRef = useRef(null)
  const filesPendingRef = useRef(null)
  const listAllRoots = useCallback(() => {
    const roots = folderRootsKey ? folderRootsKey.split('\n') : []
    if (!roots.length) {
      filesRootsKeyRef.current = folderRootsKey
      setFiles([])
      return Promise.resolve()
    }
    if (filesPendingRef.current) return filesPendingRef.current
    filesRootsKeyRef.current = folderRootsKey
    filesPendingRef.current = Promise.all(
      roots.map((root) => window.api.listFiles(root).catch(() => []))
    )
      .then((lists) => setFiles(lists.flat()))
      .finally(() => {
        filesPendingRef.current = null
      })
    return filesPendingRef.current
  }, [folderRootsKey])

  const ensureFiles = useCallback(() => {
    // Root set unchanged and already populated → reuse the cached list.
    if (filesRootsKeyRef.current === folderRootsKey && filesRootsKeyRef.current !== null) {
      return filesPendingRef.current || Promise.resolve()
    }
    return listAllRoots()
  }, [folderRootsKey, listAllRoots])

  // Refresh signal for the sidebar tree. Watch events are merged and flushed
  // on a trailing timer: a busy dropped folder (sync clients, builds,
  // downloads) would otherwise force a full recursive re-walk of every root
  // plus a full tree reload on every single fs event and stall the whole app.
  // `dirs` scopes the tree reload to roots that actually changed; an empty
  // array means "unknown scope, reload everything loaded".
  const [refreshSignal, setRefreshSignal] = useState({ nonce: 0, dirs: [] })
  const signalNonceRef = useRef(0)
  const pendingDirsRef = useRef(null)
  const refreshTimerRef = useRef(null)

  const scheduleRefresh = useCallback((delay) => {
    if (refreshTimerRef.current) return
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null
      const dirs = pendingDirsRef.current
      pendingDirsRef.current = null
      signalNonceRef.current += 1
      setRefreshSignal({ nonce: signalNonceRef.current, dirs: dirs ? [...dirs] : [] })
    }, delay)
  }, [])

  const bumpRefresh = useCallback(() => {
    // Full-scope refresh (rename/delete/sync paths): coalesce bursts, but keep
    // the delay short so the sidebar feels immediate.
    pendingDirsRef.current = null
    scheduleRefresh(150)
  }, [scheduleRefresh])

  const addFolder = useCallback(
    (dir) => {
      if (!dir || !isAbsolutePath(dir) || isRestrictedPath(dir)) return
      setFolderRoots((prev) => sanitizeFolderRoots([...prev, dir]))
      setSidebarOpen(true)
    },
    [setSidebarOpen]
  )

  const removeFolder = useCallback((rootPath) => {
    const target = normalizePathKey(rootPath)
    setFolderRoots((prev) => prev.filter((root) => normalizePathKey(root) !== target))
  }, [])

  const openFolder = useCallback(async () => {
    const dir = await window.api.openFolder()
    if (dir) addFolder(dir)
  }, [addFolder])

  // Diff-based watcher management: removing one root must not tear down and
  // rebuild chokidar watchers for the surviving roots. chokidar close + a deep
  // re-scan of every remaining root on the main process is what made removal
  // feel like a whole-app stall.
  const mountedRootsRef = useRef([])
  useEffect(() => {
    const roots = folderRootsKey ? folderRootsKey.split('\n') : []
    const prev = mountedRootsRef.current
    const nextKeys = new Set(roots.map(normalizePathKey))
    const prevKeys = new Set(prev.map(normalizePathKey))
    for (const root of prev) {
      if (!nextKeys.has(normalizePathKey(root))) window.api.watchStop(root)
    }
    for (const root of roots) {
      if (!prevKeys.has(normalizePathKey(root))) window.api.watchStart(root)
    }
    mountedRootsRef.current = roots
    return () => {
      // Only runs on unmount; root changes are handled by the diff above.
      for (const root of mountedRootsRef.current) window.api.watchStop(root)
      mountedRootsRef.current = []
    }
    // listAllRoots is keyed by the same stable root string.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folderRootsKey])

  useEffect(() => {
    const off = window.api.onWatchChanged((dir) => {
      if (dir) {
        if (!pendingDirsRef.current) pendingDirsRef.current = new Set()
        pendingDirsRef.current.add(dir)
      } else {
        pendingDirsRef.current = null
      }
      scheduleRefresh(800)
    })
    return () => {
      off()
      clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = null
    }
  }, [scheduleRefresh])

  return {
    openFolder,
    folderRoots,
    addFolder,
    removeFolder,
    files,
    ensureFiles,
    refreshSignal,
    bumpRefresh
  }
}
