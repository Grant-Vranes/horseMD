import fs from 'node:fs/promises'
import chokidar from 'chokidar'

const WATCH_IGNORE_RE = /(^|[\\/])(\.(git|obsidian|horsemd)|node_modules)([\\/]|$)/

// Bounded default depth for workspace-root folder watchers. chokidar recursively
// enumerates every directory up to `depth` on the main process when a watcher is
// created (even with ignoreInitial:true) to register its baseline. The previous
// depth of 12 made adding a huge root (tens of GB, broad trees) saturate the
// main-process event loop for minutes — every menu click, window control, save
// and other IPC was starved, so the whole app appeared frozen. A shallow default
// bounds enumeration to well under a second (measured ~0.4s on a 19GB root at
// depth 4 vs. freezing for minutes at depth 12). Deeper changes still surface
// through the renderer's scoped tree reload on expand/refresh, mirroring the
// existing ENOSPC graceful-degrade path (which already drops to depth 2).
export const DEFAULT_WATCH_DEPTH = 4

export function isAbsoluteWatchPath(path) {
  return /^\//.test(path) || /^[a-zA-Z]:[\\/]/.test(path) || /^\\\\/.test(path)
}

export function isRestrictedWatchRoot(path) {
  const normalized = (path || '').replace(/[\\/]+$/, '')
  if (normalized === '' || normalized === '/' || normalized === '.' || normalized === '..') return true
  if (!isAbsoluteWatchPath(normalized)) return true
  return /^\/(dev|proc|System\/Volumes|private\/var\/(db|folders)|\.vol)(\/|$)/.test(normalized)
}

export function registerWatcherIpc(ipcMain, { sendToRenderer, watcherFactory = chokidar }) {
  const folderWatchers = new Map()
  const fileWatchers = new Map()

  // Large workspaces exhaust the kernel's per-user inotify watch budget
  // (Linux default fs.inotify.max_user_watches = 8192) because chokidar holds
  // one watch handle per directory up to the depth limit. On ENOSPC, rebuild
  // the watcher with a shallow depth so watching degrades gracefully — the
  // root and near-root levels keep live updates, and deeper changes surface
  // via the renderer's existing refresh paths — instead of silently dying.
  const isEnospc = (error) =>
    error?.code === 'ENOSPC' || /ENOSPC|System limit for number of file watchers/i.test(String(error?.message || error))

  const watchFolder = (dir, depth) =>
    watcherFactory.watch(dir, {
      ignored: (path) => WATCH_IGNORE_RE.test(path) || isRestrictedWatchRoot(path),
      ignoreInitial: true,
      depth,
      followSymlinks: false,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
    })

  ipcMain.handle('watch:start', async (_event, dir) => {
    if (folderWatchers.has(dir)) return true
    if (isRestrictedWatchRoot(dir)) return false

    const entry = { watcher: null, timer: null, degraded: false }
    const attach = (watcher) => {
      entry.watcher = watcher
      const ping = () => {
        clearTimeout(entry.timer)
        entry.timer = setTimeout(() => sendToRenderer('watch:changed', dir), 120)
      }
      watcher.on('add', ping).on('unlink', ping).on('addDir', ping).on('unlinkDir', ping)
      watcher.on('error', async (error) => {
        if (!isEnospc(error)) {
          console.error('watch:start error (ignored):', error?.message || error)
          return
        }
        if (entry.degraded) return
        entry.degraded = true
        console.warn(
          `File watcher limit reached for ${dir} (ENOSPC). ` +
            'Falling back to shallow watching (depth 2). To watch large workspaces fully, raise the kernel limit: ' +
            'sudo sysctl fs.inotify.max_user_watches=524288'
        )
        clearTimeout(entry.timer)
        try {
          await entry.watcher.close()
        } catch {
          /* already dead */
        }
        try {
          attach(watchFolder(dir, 2))
        } catch (rebuildError) {
          console.error('watch:start rebuild after ENOSPC failed:', rebuildError?.message || rebuildError)
        }
      })
    }
    attach(watchFolder(dir, DEFAULT_WATCH_DEPTH))
    folderWatchers.set(dir, entry)
    return true
  })

  ipcMain.handle('watch:stop', async (_event, dir) => {
    const entry = folderWatchers.get(dir)
    if (entry) {
      clearTimeout(entry.timer)
      await entry.watcher.close()
      folderWatchers.delete(dir)
    }
    return true
  })

  ipcMain.handle('watch:file', async (_event, path) => {
    if (fileWatchers.has(path)) return true
    const watcher = watcherFactory.watch(path, {
      ignoreInitial: true,
      usePolling: true,
      interval: 1000,
      binaryInterval: 1200,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 50 }
    })
    const entry = { watcher, timer: null }
    const notify = () => {
      clearTimeout(entry.timer)
      entry.timer = setTimeout(async () => {
        let mtimeMs = 0
        try {
          mtimeMs = (await fs.stat(path)).mtimeMs
        } catch {
          /* file may have been removed */
        }
        sendToRenderer('file:changed', { path, mtimeMs })
      }, 80)
    }
    watcher.on('change', notify).on('add', notify)
    watcher.on('error', (error) => console.error('watch:file error (ignored):', error?.message || error))
    fileWatchers.set(path, entry)
    return true
  })

  ipcMain.handle('watch:unfile', async (_event, path) => {
    const entry = fileWatchers.get(path)
    if (entry) {
      clearTimeout(entry.timer)
      await entry.watcher.close()
      fileWatchers.delete(path)
    }
    return true
  })
}
