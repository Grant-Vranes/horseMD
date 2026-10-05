import { useCallback, useEffect, useRef, useState } from 'react'
import { dirName as parentDir, normalizePathKey } from '../paths.js'

export function useSidebarTree({ folderRoots, activePath, refreshSignal }) {
  const [childrenMap, setChildrenMap] = useState({})
  const [expanded, setExpanded] = useState(() => new Set())
  const childrenRef = useRef(childrenMap)
  childrenRef.current = childrenMap
  const activeRowRef = useRef(null)
  const lastScrolledRef = useRef(null)
  const folderRootsKey = folderRoots.join('\n')

  const loadDir = useCallback(async (dir) => {
    const nodes = await window.api.readDir(dir)
    setChildrenMap((current) => ({ ...current, [dir]: nodes }))
    return nodes
  }, [])

  // Previous roots snapshot, so a root change only expands what's new instead
  // of collapsing/expanding the whole tree (e.g. when a folder is dropped in).
  const prevRootsRef = useRef(null)

  useEffect(() => {
    const roots = folderRootsKey ? folderRootsKey.split('\n') : []
    const rootKeys = roots.map(normalizePathKey)
    const prevKeys = prevRootsRef.current
      ? new Set(prevRootsRef.current.map(normalizePathKey))
      : null
    // Removing a root must not blow away the whole loaded tree (re-reading and
    // re-rendering every surviving root is the other half of the removal
    // stall). Only drop cached children under roots that actually went away;
    // untouched roots keep their loaded directories and expanded subdirs.
    if (prevKeys) {
      const removed = [...prevKeys].filter((k) => !rootKeys.some((rk) => k === rk))
      if (removed.length) {
        setChildrenMap((current) => {
          const next = {}
          for (const [dir, nodes] of Object.entries(current)) {
            const key = normalizePathKey(dir)
            if (!removed.some((rk) => key === rk || key.startsWith(rk + '/'))) next[dir] = nodes
          }
          return next
        })
      }
    } else {
      setChildrenMap({})
    }
    setExpanded((current) => {
      if (prevRootsRef.current === null) return new Set(roots)
      const prevKeys = new Set(prevRootsRef.current.map(normalizePathKey))
      const next = new Set([...current].filter((item) =>
        rootKeys.some((rk) => {
          const key = normalizePathKey(item)
          return key === rk || key.startsWith(rk + '/')
        })
      ))
      // Newly added roots start expanded so the drop/add result is visible;
      // everything else keeps its current collapsed/expanded state.
      roots.forEach((root) => {
        if (!prevKeys.has(normalizePathKey(root))) next.add(root)
      })
      return next
    })
    // Only newly added roots need a load; surviving roots keep their cached
    // children so removal/add doesn't re-read the whole workspace.
    roots.forEach((root) => {
      if (!prevKeys || !prevKeys.has(normalizePathKey(root)) || !childrenRef.current[root]) loadDir(root)
    })
    prevRootsRef.current = roots
  }, [folderRootsKey, loadDir])

  useEffect(() => {
    if (refreshSignal.nonce === 0) return
    const changedRoots = refreshSignal.dirs.map(normalizePathKey)
    Object.keys(childrenRef.current).forEach((dir) => {
      // Scope the reload to roots that actually changed when the watcher
      // tells us which root fired; empty dirs means a full refresh.
      if (changedRoots.length) {
        const key = normalizePathKey(dir)
        if (!changedRoots.some((rk) => key === rk || key.startsWith(rk + '/'))) return
      }
      loadDir(dir)
    })
  }, [refreshSignal, loadDir])

  // Reveal an active file opened by the tree, recents, search, or a link.
  useEffect(() => {
    if (!activePath || !folderRoots.length) return
    const activeKey = normalizePathKey(activePath)
    const root = folderRoots
      .map(normalizePathKey)
      .sort((a, b) => b.length - a.length)
      .find((candidate) => activeKey === candidate || activeKey.startsWith(candidate + '/'))
    if (!root) return

    let cancelled = false
    ;(async () => {
      const ancestors = []
      let dir = parentDir(activePath)
      let guard = 0
      while (dir && guard++ < 50) {
        ancestors.unshift(dir)
        if (normalizePathKey(dir) === root) break
        const up = parentDir(dir)
        if (!up || up === dir) break
        dir = up
      }
      for (const ancestor of ancestors) {
        if (cancelled) return
        if (!childrenRef.current[ancestor]) await loadDir(ancestor)
      }
      if (cancelled) return
      setExpanded((current) => {
        const next = new Set(current)
        ancestors.forEach((ancestor) => next.add(ancestor))
        return next
      })
    })()

    return () => {
      cancelled = true
    }
  }, [activePath, folderRootsKey, loadDir])

  useEffect(() => {
    if (!activePath) return
    if (activeRowRef.current && lastScrolledRef.current !== activePath) {
      activeRowRef.current.scrollIntoView({ block: 'nearest' })
      lastScrolledRef.current = activePath
    }
  }, [activePath, expanded, childrenMap])

  const toggle = useCallback(async (node) => {
    if (expanded.has(node.path)) {
      setExpanded((current) => {
        const next = new Set(current)
        next.delete(node.path)
        return next
      })
      return
    }
    if (!childrenRef.current[node.path]) await loadDir(node.path)
    setExpanded((current) => new Set(current).add(node.path))
  }, [expanded, loadDir])

  return {
    childrenMap,
    expanded,
    setExpanded,
    loadDir,
    toggle,
    activeRowRef
  }
}
