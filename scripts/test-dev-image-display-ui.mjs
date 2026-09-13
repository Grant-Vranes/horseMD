// Dev-mode image display regression (http-origin page, like `npm run dev`).
//
// Chromium blocks file:// subresources from non-file origins, so document-
// relative images rewritten to file:// URLs render broken on the Vite dev
// server. Fix: the desktop main process registers a local-media:// privileged
// protocol (host "media", image extensions only) and the renderer rewrites
// resolved file:// image srcs to local-media://media/<abs-path> when the page
// origin is not file://. Production (file:// page) keeps plain file:// srcs.
//
// This test serves out/renderer over a plain http server, launches the built
// app with ELECTRON_RENDERER_URL pointed at it, pastes an image into a saved
// document, and asserts the <img> actually loads (naturalWidth > 0) with a
// local-media:// src.
import { createServer } from 'node:http'
import { mkdir, readdir, rm, writeFile, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { launchBuiltElectron, stopBuiltElectron } from './lib/electron-test-app.mjs'
import { sleep } from './lib/cdp.mjs'
import assert from 'node:assert/strict'

const root = '/tmp/horsemd-dev-image-display'
const file = join(root, 'note.md')
const outRoot = join(process.cwd(), 'out', 'renderer')
const port = Number(process.env.CDP_PORT || 9466)
const httpPort = 8936
const pngB64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.mjs': 'text/javascript' }

async function waitFor(check, message, attempts = 80) {
  for (let i = 0; i < attempts; i += 1) {
    const result = await check()
    if (result) return result
    await sleep(100)
  }
  throw new Error(message)
}

let app = null
const server = createServer(async (req, res) => {
  try {
    const path = req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]
    const data = await readFile(join(outRoot, path))
    res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream' })
    res.end(data)
  } catch {
    res.writeHead(404)
    res.end('not found')
  }
})

try {
  await rm(root, { recursive: true, force: true })
  await mkdir(root, { recursive: true })
  await writeFile(file, '第一段，这里粘贴图片。\n\n第二段。', 'utf8')
  await new Promise((resolve) => server.listen(httpPort, resolve))

  app = await launchBuiltElectron({
    profileDir: join(root, 'profile'),
    port,
    appArgs: [file],
    entrypoint: 'out/main/index.cjs',
    env: { ELECTRON_RENDERER_URL: `http://localhost:${httpPort}` }
  })
  const { evaluate } = app

  await waitFor(
    () => evaluate(`[...document.querySelectorAll('.ProseMirror')].some((node) => node.offsetParent)`),
    'Rich editor did not become visible on the http origin'
  )

  await evaluate(`(() => {
    const editor = [...document.querySelectorAll('.ProseMirror')].find((node) => node.offsetParent)
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
    let target = null
    while (walker.nextNode()) {
      if (walker.currentNode.nodeValue.includes('第一段')) target = walker.currentNode
    }
    const range = document.createRange()
    range.setStart(target, target.nodeValue.length)
    range.collapse(true)
    const selection = getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    editor.focus()
    return true
  })()`)

  await evaluate(`(() => {
    const bytes = Uint8Array.from(atob(${JSON.stringify(pngB64)}), (c) => c.charCodeAt(0))
    const f = new File([bytes], 'image.png', { type: 'image/png' })
    const dt = new DataTransfer()
    dt.items.add(f)
    const editor = [...document.querySelectorAll('.ProseMirror')].find((node) => node.offsetParent)
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }))
    return true
  })()`)

  const state = await waitFor(async () => {
    const value = await evaluate(`(() => {
      const img = [...document.querySelectorAll('.ProseMirror img')][0]
      if (!img) return null
      return {
        src: img.getAttribute('src'),
        complete: img.complete,
        naturalWidth: img.naturalWidth,
        origin: location.origin
      }
    })()`)
    return value && value.complete ? value : null
  }, 'Pasted image element never settled on the http origin')

  assert.equal(state.origin, `http://localhost:${httpPort}`, 'Unexpected page origin')
  assert.match(state.src, /^local-media:\/\/media\/.+\.png$/, `Image src was not rewritten to local-media: ${state.src}`)
  assert.ok(state.naturalWidth > 0, `Image did not load over local-media protocol: ${JSON.stringify(state)}`)

  const assets = await readdir(join(root, 'assets')).catch(() => [])
  assert.equal(assets.length, 1, `Expected exactly one saved asset, got: ${assets.join(',')}`)

  console.log(`PASS dev image display: http-origin page loads pasted image via ${state.src}`)
} finally {
  await stopBuiltElectron(app, { removeProfile: true })
  server.close()
  await rm(root, { recursive: true, force: true }).catch(() => {})
}
