import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { launchBuiltElectron, stopBuiltElectron } from './lib/electron-test-app.mjs'
import { sleep } from './lib/cdp.mjs'

const dir = '/tmp/horsemd-image-align-repro'
const file = join(dir, 'image-align.md')
const port = Number(process.env.CDP_PORT || 9490)
const source = [
  '# 对齐回归',
  '',
  '![测试图片](image/test.png)',
  '',
  '![替代说明](image/with-title.png "图片标题")',
  '',
  '正文'
].join('\n')

async function waitFor(check, message, attempts = 60) {
  for (let i = 0; i < attempts; i++) {
    const r = await check()
    if (r) return r
    await sleep(100)
  }
  throw new Error(message)
}

async function main() {
  await rm(dir, { recursive: true, force: true })
  await mkdir(dir, { recursive: true })
  await writeFile(file, source, 'utf8')

  const app = await launchBuiltElectron({
    profileDir: join(dir, 'profile'),
    port,
    appArgs: [file],
    env: { ...process.env, ELECTRON_DISABLE_SANDBOX: '1', ELECTRON_RUN_AS_NODE: undefined }
  })
  const { evaluate, send } = app
  try {
    await waitFor(() => evaluate(`[...document.querySelectorAll('.ProseMirror')].some(n => n.offsetParent)`), 'editor not mounted')
    // Trap renderer errors for diagnosis
    await evaluate(`window.__errs = []; window.addEventListener('error', e => window.__errs.push(String(e.message))); const _ce = console.error; console.error = (...a) => { window.__errs.push(a.map(String).join(' ')); _ce(...a) }`)

    // Hover the first image block to summon the align group (synthetic first).
    await waitFor(() => evaluate(`(() => {
      const block = (function(){const ed=[...document.querySelectorAll('.ProseMirror')].find(n=>n.offsetParent);return ed?ed.querySelector('.milkdown-image-block'):null})()
      if (!block) return false
      block.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
      return true
    })()`), 'no image block')

    // Force-show the align group at the image position and click 居右 with a
    // real mouse event so the plugin's handler runs the real dispatch path.
    const btnBox = await evaluate(`(() => {
      const img = (function(){const ed=[...document.querySelectorAll('.ProseMirror')].find(n=>n.offsetParent);return ed?ed.querySelector('.milkdown-image-block img'):null})()
      const g = (function(){const ed=[...document.querySelectorAll('.ProseMirror')].find(n=>n.offsetParent);return ed&&ed.parentElement?ed.parentElement.querySelector('.hm-image-align'):null})()
      const btn = g?.querySelector('[data-align="right"]')
      if (!img || !btn) return null
      g.classList.add('visible')
      g.style.pointerEvents = 'auto'
      g.style.opacity = '1'
      const r = img.getBoundingClientRect()
      g.style.left = (r.left + 6) + 'px'
      g.style.top = (r.top + 6) + 'px'
      const b = btn.getBoundingClientRect()
      const cs = getComputedStyle(btn)
      return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height, display: cs.display, width: cs.width, pos: getComputedStyle(g).position, gRect: g.getBoundingClientRect().toJSON() }
    })()`)
    console.log('BTN BOX:', JSON.stringify(btnBox))
    if (!btnBox) throw new Error('align button missing')
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: btnBox.x, y: btnBox.y, button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: btnBox.x, y: btnBox.y, button: 'left', clickCount: 1 })
    await sleep(800)
    const blockClass = await evaluate(`(function(){const ed=[...document.querySelectorAll('.ProseMirror')].find(n=>n.offsetParent);return ed?ed.querySelector('.milkdown-image-block'):null})()?.className`)
    console.log('BLOCK CLASS:', blockClass)
    const errs = await evaluate(`window.__errs`)
    console.log('ERRS:', JSON.stringify(errs))
    const toastsMid = await evaluate(`[...document.querySelectorAll('body *')].filter(n => n.children.length === 0 && /安全合并|恢复副本/.test(n.textContent)).map(n => n.textContent).slice(0, 5)`)
    console.log('TOASTS-MID:', JSON.stringify(toastsMid))

    // Save via FAB (same path as saveTab -> getSettledMarkdownForTab)
    await waitFor(() => evaluate(`(() => {
      const button = document.querySelector('.hm-save-fab')
      if (!button) return false
      button.click()
      return true
    })()`), 'Save FAB not available')

    const saved = await waitFor(async () => {
      const text = await readFile(file, 'utf8')
      return text !== source ? text : false
    }, 'file was not saved')

    console.log('SAVED FILE:')
    console.log(saved)
    const toasts = await evaluate(`[...document.querySelectorAll('body *')].filter(n => n.children.length === 0 && /安全合并|恢复副本|Failed|失败/.test(n.textContent)).map(n => n.textContent).slice(0, 5)`)
    console.log('TOASTS:', JSON.stringify(toasts))
  } finally {
    await stopBuiltElectron(app, { removeProfile: true })
    await rm(dir, { recursive: true, force: true })
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
