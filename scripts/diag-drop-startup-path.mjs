// Diagnostic: seed the workspace root via localStorage + reload, so the app
// runs the exact post-drop startup path (watchStart + listAllRoots + expanded
// tree render). Measures renderer responsiveness across the load.
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchBuiltElectron } from './lib/electron-test-app.mjs'

const dirCount = Number(process.argv[2] || 5000)
const filesPerDir = Number(process.argv[3] || 3)
let root = join(await mkdtemp(join(tmpdir(), 'horsemd-bigtree2-')), 'bigtree')
await mkdir(root, { recursive: true })
for (let d = 0; d < dirCount; d += 1) {
  const dir = join(root, `d-${String(d).padStart(5, '0')}`)
  await mkdir(dir)
  for (let f = 0; f < filesPerDir; f += 1) {
    await writeFile(join(dir, `n-${f}.md`), `# ${d}-${f}\nbody\n`)
  }
}
console.error(`tree: ${root} ${dirCount * filesPerDir} files`)

const profileDir = join(tmpdir(), 'horsemd-drop-diag5')
const cdp = await launchBuiltElectron({ profileDir, port: 9337, cleanProfile: true })

// Seed the workspace root, then reload to run the startup path with it.
await cdp.evaluate(`localStorage.setItem('minimd.session.v1', JSON.stringify({ folderRoots: [${JSON.stringify(root)}] }))`)
const reloadStart = Date.now()
await cdp.send('Page.enable')
await cdp.send('Page.reload')
// Poll responsiveness while the app loads the workspace.
const samples = []
for (let i = 0; i < 30; i += 1) {
  const t0 = Date.now()
  let v = 0
  try {
    v = await Promise.race([
      cdp.evaluate('1+1'),
      new Promise((r) => setTimeout(() => r('SLOW'), 3000))
    ])
  } catch { v = 'ERR' }
  samples.push([Date.now() - t0, v])
  if (Date.now() - reloadStart > 45000) break
  await new Promise((r) => setTimeout(r, 1000))
}
console.log('eval latency samples (ms):', samples.map((s) => s[0]).join(','))
const ui = await cdp.evaluate(`({
  sidebarChildren: document.querySelector('.sidebar')?.children.length ?? -1,
  text: (document.querySelector('.sidebar')?.textContent || '').length
})`).catch((e) => String(e))
console.log('ui:', JSON.stringify(ui))
cdp.child?.kill?.('SIGTERM')
process.exit(0)
