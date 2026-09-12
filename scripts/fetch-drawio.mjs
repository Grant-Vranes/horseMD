// Downloads the pinned diagrams.net webapp (draw.war) and unpacks it into
// resources/drawio/ for local iframe embedding. resources/drawio is
// gitignored — run this once per machine (npm run dist does it automatically).
// The version is pinned deliberately; upgrading drawio is an explicit
// human action (change PINNED_VERSION, re-run).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import extract from 'extract-zip'

const PINNED_VERSION = '31.4.5'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const target = join(root, 'resources', 'drawio')
const versionFile = join(target, 'DRAWIO_VERSION')

if (existsSync(versionFile) && readFileSync(versionFile, 'utf8').trim() === PINNED_VERSION) {
  console.log(`drawio v${PINNED_VERSION} already vendored at ${target}`)
  process.exit(0)
}

const url = `https://github.com/jgraph/drawio/releases/download/v${PINNED_VERSION}/draw.war`
const warPath = join(root, 'resources', `draw-${PINNED_VERSION}.war`)
mkdirSync(join(root, 'resources'), { recursive: true })

console.log(`Downloading ${url} ...`)
const res = await fetch(url, { redirect: 'follow' })
if (!res.ok) {
  console.error(`Download failed: HTTP ${res.status} ${res.statusText}`)
  process.exit(1)
}
const buf = Buffer.from(await res.arrayBuffer())
if (buf.length < 1024 * 1024) {
  console.error(`Downloaded file is suspiciously small (${buf.length} bytes) — aborting`)
  process.exit(1)
}
writeFileSync(warPath, buf)

console.log(`Unpacking into ${target} ...`)
rmSync(target, { recursive: true, force: true })
mkdirSync(target, { recursive: true })
await extract(warPath, { dir: target })
rmSync(warPath, { force: true })

// Sanity checks: the files the iframe actually loads must exist.
for (const required of ['index.html', join('js', 'app.min.js')]) {
  if (!existsSync(join(target, required))) {
    console.error(`Vendored webapp is missing ${required} — the war layout may have changed`)
    process.exit(1)
  }
}
writeFileSync(versionFile, PINNED_VERSION + '\n')
console.log(`drawio v${PINNED_VERSION} vendored OK`)
