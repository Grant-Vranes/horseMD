// Disk file-size cache for hover tips. Media tabs (images / PDF) keep their
// content empty — the viewer resolves the binary itself — so the tab's text
// content cannot provide a size. This module resolves the real on-disk size
// once per path via `fs:stat` and caches it for both tip surfaces (tab strip
// card and the open-files flyout).
const cache = new Map() // path -> bytes
const pending = new Map() // path -> Promise<bytes|null>

export const getCachedFileSize = (path) => (path ? (cache.has(path) ? cache.get(path) : null) : null)

export const fetchFileSize = async (path) => {
  if (!path) return null
  if (cache.has(path)) return cache.get(path)
  if (pending.has(path)) return pending.get(path)
  const promise = window.api
    .fileStat(path)
    .then((s) => {
      const size = s?.size ?? null
      pending.delete(path)
      if (size != null) cache.set(path, size)
      return size
    })
    .catch(() => {
      pending.delete(path)
      return null
    })
  pending.set(path, promise)
  return promise
}
