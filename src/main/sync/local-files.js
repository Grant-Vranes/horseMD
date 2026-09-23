import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { join, relative, sep } from 'node:path'

const INTERNAL_DIRS = new Set(['.horsemd', '.git', '.obsidian', 'node_modules'])

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

// Stream the file in chunks instead of reading whole bytes into memory: a
// workspace with large attachments (videos, images) would otherwise OOM when
// every file's full content was buffered just to compute its hash.
function sha256File(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    const stream = createReadStream(path, { highWaterMark: 1024 * 1024 })
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', () => resolve(hash.digest('hex')))
  })
}

function isInternalRelativePath(path) {
  return path.split(/[\\/]/).some((segment) => INTERNAL_DIRS.has(segment))
}

// Scan all ordinary files, including attachments, but never follow symlinks or
// include app-control directories. The result uses portable POSIX paths.
export async function scanLocalWorkspace(rootPath, { maxFiles = 20000 } = {}) {
  const files = new Map()
  async function walk(dir, depth) {
    if (depth > 32) return
    let entries
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory() && INTERNAL_DIRS.has(entry.name)) continue
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walk(fullPath, depth + 1)
        continue
      }
      if (!entry.isFile()) continue
      if (files.size >= maxFiles) throw new Error(`同步文件数量超过上限（${maxFiles}）。`)
      const relativePath = relative(rootPath, fullPath)
      if (!relativePath || relativePath.startsWith(`..${sep}`) || isInternalRelativePath(relativePath)) continue
      const [sha256Hex, stat] = await Promise.all([sha256File(fullPath), fs.stat(fullPath)])
      files.set(relativePath.replace(/\\/g, '/'), {
        sha256: sha256Hex,
        size: stat.size,
        mtimeMs: stat.mtimeMs
      })
    }
  }
  await walk(rootPath, 0)
  return files
}
