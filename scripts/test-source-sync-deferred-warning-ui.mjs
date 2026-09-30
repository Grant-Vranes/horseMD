// Regression: a source-sync integrity failure must NOT immediately show the
// sticky "rich text and source diverged" toast. A failure that self-heals via
// a later publication stays silent; a persistent one shows a NON-sticky toast
// after the 600ms window; a second expiry of the same signature within 3s
// escalates to sticky. The failure itself is injected through the debug
// handle globalThis.__hmSourceSyncWarning (wired in Editor.jsx).
import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { launchBuiltElectron, stopBuiltElectron } from './lib/electron-test-app.mjs'
import { sleep } from './lib/cdp.mjs'

const dir = '/tmp/horsemd-deferred-warning'
const file = join(dir, 'note.md')
const port = Number(process.env.CDP_PORT || 9494)
const MISMATCH = '检测到富文本与源码不一致'

const source = ['第一段。', '', '第二段。'].join('\n')

async function waitFor(check, message, attempts = 60) {
  for (let index = 0; index < attempts; index += 1) {
    const result = await check()
    if (result) return result
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
    entrypoint: process.env.HORSEMD_APP_PATH || 'out/main/index.cjs'
  })
  const { evaluate, send } = app

  try {
    await waitFor(
      () => evaluate(`[...document.querySelectorAll('.ProseMirror')].some((node) => node.offsetParent)`),
      'Rich editor did not become visible'
    )
    const handle = await evaluate(`typeof globalThis.__hmSourceSyncWarning?.deferFailure === 'function'`)
    assert.ok(handle, '__hmSourceSyncWarning debug handle missing')

    // --- Scenario 1: failure, then a real edit publishes source → silent. ---
    await evaluate(`globalThis.__hmSourceSyncWarning.deferFailure('e2e-transient')`)
    // Focus the editor and type one character so the sync pipeline publishes.
    await evaluate(`(() => {
      const editor = [...document.querySelectorAll('.ProseMirror')].find((node) => node.offsetParent)
      if (!editor) return false
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT)
      let target = null
      while (walker.nextNode()) {
        if (walker.currentNode.nodeValue.includes('第一段')) target = walker.currentNode
      }
      if (!target) return false
      const range = document.createRange()
      range.setStart(target, target.nodeValue.length)
      range.collapse(true)
      const selection = getSelection()
      selection.removeAllRanges()
      selection.addRange(range)
      editor.focus()
      return true
    })()`)
    await send('Input.dispatchKeyEvent', { type: 'char', text: 'x', key: 'x', code: 'KeyX', windowsVirtualKeyCode: 88 })
    await sleep(1500)
    const toast1 = await evaluate(`document.querySelector('.hm-toast-msg')?.textContent ?? null`)
    assert.ok(
      !toast1 || !String(toast1).includes(MISMATCH),
      `transient failure must not toast, got: ${toast1}`
    )
    const recovered = await evaluate(
      `(globalThis.__hmSourceSyncTrace || []).some((e) => e.name === 'source-sync-recovered')`
    )
    assert.ok(recovered, 'expected a source-sync-recovered trace entry')

    // --- Scenario 2: persistent failure → non-sticky toast after ~600ms. ---
    await evaluate(`globalThis.__hmSourceSyncWarning.deferFailure('e2e-persistent')`)
    await sleep(250)
    const tooEarly = await evaluate(`document.querySelector('.hm-toast-msg')?.textContent ?? null`)
    assert.ok(
      !tooEarly || !String(tooEarly).includes(MISMATCH),
      `toast must not appear inside the 600ms window, got: ${tooEarly}`
    )
    await sleep(700)
    const shown = await evaluate(`(() => {
      const el = document.querySelector('.hm-toast')
      return el ? { text: el.textContent, sticky: el.classList.contains('sticky') } : null
    })()`)
    assert.ok(shown, 'persistent failure must show a toast after the window')
    assert.ok(String(shown.text).includes(MISMATCH), `wrong toast text: ${shown.text}`)
    assert.equal(shown.sticky, false, 'first expiry must be non-sticky')

    // --- Scenario 3: second expiry within 3s → sticky. ---
    await evaluate(`globalThis.__hmSourceSyncWarning.deferFailure('e2e-persistent')`)
    await sleep(1000)
    const escalated = await evaluate(`document.querySelector('.hm-toast')?.classList.contains('sticky') ?? false`)
    assert.ok(escalated, 'second expiry within 3s must escalate to sticky')
  } finally {
    await stopBuiltElectron(app)
  }
}

main().catch(async (error) => {
  try {
    const { writeFileSync } = await import('node:fs')
    writeFileSync('/tmp/horsemd-deferred-warning-e2e-error.log', String(error && error.stack ? error.stack : error))
  } catch {}
  console.error(error)
  process.exit(1)
})
