// Real-editor: authored doc with + list (diverged baseline) and two images that
// share the same URL, both aligned right. Clicking 居中 (center) on the FIRST
// one strips only its `|right` suffix. Before the fix this hit the generic
// structural mapper, duplicated image lines, and surfaced the source-sync
// mismatch toast.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { launchBuiltElectron, stopBuiltElectron } from './lib/electron-test-app.mjs'
import { sleep } from './lib/cdp.mjs'

const dir = '/tmp/horsemd-image-dupe-center'
const file = join(dir, 'center.md')
const port = Number(process.env.CDP_PORT || 9478)
const source = [
  '# 居中回归',
  '',
  '+ 项目甲',
  '+ 项目乙',
  '',
  '![测试|right](img/a.png)',
  '',
  '![测试|right](img/a.png)',
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

    await waitFor(() => evaluate(`(() => {
      const ed=[...document.querySelectorAll('.ProseMirror')].find(n=>n.offsetParent)
      const block=ed?ed.querySelector('.milkdown-image-block'):null
      if (!block) return false
      block.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
      return true
    })()`), 'no image block')

    // Click the 居中 button of the FIRST image's align group.
    const btnBox = await evaluate(`(() => {
      const ed=[...document.querySelectorAll('.ProseMirror')].find(n=>n.offsetParent)
      const img=ed?ed.querySelector('.milkdown-image-block img'):null
      const g=ed&&ed.parentElement?ed.parentElement.querySelector('.hm-image-align'):null
      const btn=g?.querySelector('[data-align="center"]')
      if (!img||!btn) return null
      g.classList.add('visible'); g.style.pointerEvents='auto'; g.style.opacity='1'
      const r=img.getBoundingClientRect()
      g.style.left=(r.left+6)+'px'; g.style.top=(r.top+6)+'px'
      const b=btn.getBoundingClientRect()
      return { x:b.left+b.width/2, y:b.top+b.height/2 }
    })()`)
    if (!btnBox) throw new Error('center button missing')
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: btnBox.x, y: btnBox.y, button: 'left', clickCount: 1 })
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: btnBox.x, y: btnBox.y, button: 'left', clickCount: 1 })
    await sleep(1200)

    const toasts = await evaluate(`[...document.querySelectorAll('body *')].filter(n => n.children.length === 0 && /富文本与源码不一致/.test(n.textContent)).map(n => n.textContent).slice(0,3)`)
    const integrity = await evaluate(`(() => {
      const t = globalThis.__hmSourceIntegrityTrace || []
      const last = t[t.length-1]
      return { ok: last?.ok, reason: last?.reason, preservationReason: last?.preservationReason,
               candidateTail: last?.candidate ? String(last.candidate).slice(-150) : null }
    })()`)
    console.log('TOASTS:', JSON.stringify(toasts))
    console.log('INTEGRITY:', JSON.stringify(integrity))

    // Save via FAB and confirm the file committed only the first image to center.
    await waitFor(() => evaluate(`(() => { const b=document.querySelector('.hm-save-fab'); if(!b) return false; b.click(); return true })()`), 'Save FAB missing')
    const saved = await waitFor(async () => {
      const t = await readFile(file, 'utf8')
      return t !== source ? t : false
    }, 'file not saved')
    console.log('SAVED FILE:')
    console.log(saved)
    const dupImages = (saved.match(/!\[测试(?:\|right)?\]/g) || []).length
    const rightCount = (saved.match(/!\[测试\|right\]/g) || []).length
    const centerImages = (saved.match(/!\[测试\]\(img\/a\.png\)/g) || []).length
    console.log(`checks: imageTokens=${dupImages} right=${rightCount} explicitCenter=${centerImages}`)
    if (toasts.length) process.exitCode = 1
    if (rightCount !== 1 || centerImages !== 1) process.exitCode = 1
    if (/\+ 项目甲/.test(saved) !== true) process.exitCode = 1
  } finally {
    await stopBuiltElectron(app, { removeProfile: true })
    await rm(dir, { recursive: true, force: true })
  }
}

main().catch((e) => { console.error(e); process.exit(1) })