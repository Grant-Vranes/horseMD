// Diagnostic: drive the REAL renderer drop path (useDropOpen → openDroppedPaths
// → addFolder → tree render) over CDP by monkey-patching the native-path bridge
// and dispatching a synthetic drop on the topbar. Measures renderer
// responsiveness before/after the drop.
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchBuiltElectron } from './lib/electron-test-app.mjs'

const dirCount = Number(process.argv[2] || 2000)
const filesPerDir = Number(process.argv[3] || 5)
const root = join(await mkdtemp(join(tmpdir(), 'horsemd-bigtree-')), 'bigtree')
await mkdir(root, { recursive: true })
for (let d = 0; d < dirCount; d += 1) {
  const dir = join(root, `dir-${String(d).padStart(5, '0')}`)
  await mkdir(dir)
  for (let f = 0; f < filesPerDir; f += 1) {
    await writeFile(join(dir, `note-${f}.md`), `# note ${d}-${f}\n\nbody\n`)
  }
}
console.error(`tree ready: ${root} (${dirCount * filesPerDir} files)`)

const profileDir = join(tmpdir(), 'horsemd-drop-diag2')
const cdp = await launchBuiltElectron({ profileDir, port: 9334, cleanProfile: true })

const probe = `(async (ms) => {
  const start = performance.now()
  let frames = 0
  while (performance.now() - start < ms) {
    await new Promise((r) => setTimeout(r, 5))
    frames += 1
  }
  return frames
})`

const before = await cdp.evaluate(`(async () => {
  const start = performance.now()
  let frames = 0
  while (performance.now() - start < 1000) {
    await new Promise((r) => setTimeout(r, 5))
    frames += 1
  }
  return frames
})()`)
console.error(`responsiveness before: ${before} frames/1000ms`)

const result = await cdp.evaluate(`(async () => {
  const dir = ${JSON.stringify(root)}
  window.__errs = []
  window.addEventListener('error', (e) => window.__errs.push(String(e.message)))
  window.addEventListener('unhandledrejection', (e) => window.__errs.push('rej:' + String(e.reason)))
  window.api.getPathForDroppedFile = () => dir
  const origClassify = window.api.classifyDroppedPaths
  window.__classified = null
  window.api.classifyDroppedPaths = async (p) => { window.__classified = p; return origClassify(p) }
  const origWatch = window.api.watchStart
  window.__watches = []
  window.api.watchStart = (d) => { window.__watches.push(d); return origWatch(d) }
  const topbar = document.querySelector('.topbar')
  if (!topbar) return ['no-topbar', 0]
  const dt = new DataTransfer()
  dt.items.add(new File([], 'x.md'))
  const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })
  topbar.dispatchEvent(drop)
  const start = performance.now()
  for (let i = 0; i < 300; i += 1) {
    await new Promise((r) => setTimeout(r, 100))
    if (performance.now() - start > 30000) break
    const sb = document.querySelector('.sidebar')
    if (sb && sb.textContent.length > 0) {
      return ['sidebarText', sb.textContent.slice(0, 100), Math.round(performance.now() - start), window.__watches, window.__errs.slice(0, 3)]
    }
  }
  return ['timeout', document.body.innerHTML.length, window.__watches, window.__errs.slice(0, 5)]
})()`)
console.log('drop result:', JSON.stringify(result))

const after = await cdp.evaluate(`(async () => {
  const start = performance.now()
  let frames = 0
  while (performance.now() - start < 3000) {
    await new Promise((r) => setTimeout(r, 5))
    frames += 1
  }
  return frames
})()`)
console.log(`responsiveness after drop: ${after} frames/3000ms (${Math.round(after / 3)}/s, healthy ≈ 180+/s at 5ms timer)`)
const ui = await cdp.evaluate(`({
  sidebarText: (document.querySelector('.sidebar')?.textContent || '').slice(0, 120),
  sidebarChildren: document.querySelector('.sidebar')?.children.length ?? -1,
  settings: (localStorage['horsemd.settings.v1'] || '').slice(0, 300)
})`)
console.log('ui:', JSON.stringify(ui))

cdp.child?.kill?.('SIGTERM')
process.exit(0)
