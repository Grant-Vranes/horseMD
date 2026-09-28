// Confirm: with a diverged baseline (+ list vs canonical *) and two images
// sharing the same src URL, editing ONE image (align-right on the first)
// triggers the source-sync mismatch toast because preserveImageTokenChange
// fail-closes on the duplicate URL and the generic mapper mis-splices.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { launchBuiltElectron, stopBuiltElectron } from './lib/electron-test-app.mjs'
import { sleep } from './lib/cdp.mjs'

const dir = '/tmp/horsemd-image-dupe-url'
const file = join(dir, 'dupe.md')
const port = Number(process.env.CDP_PORT || 9477)
const source = [
  '# 重复图',
  '',
  '+ 项目甲',
  '+ 项目乙',
  '',
  '![测试](img/a.png)',
  '',
  '![测试](img/a.png)',
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
    appArgs: [file, '--horsemd-input-trace'],
    env: { ...process.env, ELECTRON_DISABLE_SANDBOX: '1', ELECTRON_RUN_AS_NODE: undefined }
  })
  const { evaluate, send } = app
  try {
    await waitFor(() => evaluate(`[...document.querySelectorAll('.ProseMirror')].some(n => n.offsetParent)`), 'editor not mounted')

    // Hover FIRST image block to summon align group, force-show, click 居右.
    await waitFor(() => evaluate(`(() => {
      const ed=[...document.querySelectorAll('.ProseMirror')].find(n=>n.offsetParent)
      const block=ed?ed.querySelector('.milkdown-image-block'):null
      if (!block) return false
      block.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
      return true
    })()`), 'no image block')

    const btnBox = await evaluate(`(() => {
      const ed=[...document.querySelectorAll('.ProseMirror')].find(n=>n.offsetParent)
      const img=ed?ed.querySelector('.milkdown-image-block img'):null
      const g=ed&&ed.parentElement?ed.parentElement.querySelector('.hm-image-align'):null
      const btn=g?.querySelector('[data-align="right"]')
      if (!img||!btn) return null
      g.classList.add('visible'); g.style.pointerEvents='auto'; g.style.opacity='1'
      const r=img.getBoundingClientRect()
      g.style.left=(r.left+6)+'px'; g.style.top=(r.top+6)+'px'
      const b=btn.getBoundingClientRect()
      return { x:b.left+b.width/2, y:b.top+b.height/2 }
    })()`)
    if (!btnBox) throw new Error('align button missing')
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: btnBox.x, y: btnBox.y, button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: btnBox.x, y: btnBox.y, button: 'left', clickCount: 1 })
    await sleep(1200)

    const toasts = await evaluate(`[...document.querySelectorAll('body *')].filter(n => n.children.length === 0 && /富文本与源码不一致/.test(n.textContent)).map(n => n.textContent).slice(0,3)`)
    console.log('TOASTS:', JSON.stringify(toasts))

    const integrity = await evaluate(`(() => {
      const t = globalThis.__hmSourceIntegrityTrace || []
      const last = t[t.length-1]
      return { ok: last?.ok, reason: last?.reason, preservationReason: last?.preservationReason, candidateTail: last?.candidate ? String(last.candidate).slice(-120) : null }
    })()`)
    console.log('INTEGRITY:', JSON.stringify(integrity))
  } finally {
    await stopBuiltElectron(app, { removeProfile: true })
    await rm(dir, { recursive: true, force: true })
  }
}

main().catch((e) => { console.error(e); process.exit(1) })