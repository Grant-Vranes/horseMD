// Regression: topbar "+" button click behavior.
// A direct click must never create a document — it only toggles the flyout
// menu (hover opens it too). Markdown / Excalidraw / Drawio are created
// exclusively through the flyout items.
import { launchBuiltElectron, stopBuiltElectron } from './lib/electron-test-app.mjs'
import { sleep } from './lib/cdp.mjs'

const port = Number(process.env.CDP_PORT || 9846)

async function waitFor(check, message, attempts = 120) {
  for (let i = 0; i < attempts; i += 1) {
    const r = await check()
    if (r) return r
    await sleep(250)
  }
  throw new Error(message)
}

const app = await launchBuiltElectron({
  profileDir: `/tmp/horsemd-newfile-btn-${process.pid}`,
  port
})
const { evaluate } = app

let failures = 0
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

try {
  await waitFor(() => evaluate(`!!document.querySelector('.new-file-wrap')`), 'topbar + button missing')
  const tabCount = () => evaluate(`document.querySelectorAll('.tab-title').length`)
  const before = await tabCount()

  // Direct click: flyout opens (toggle), no tab is created.
  await evaluate(`(() => { document.querySelector('.new-file-wrap button.icon-btn').click(); return true })()`)
  await sleep(400)
  check('click opens flyout', await evaluate(`!!document.querySelector('.new-file-flyout')`))
  check('click does not create a tab', (await tabCount()) === before, `tabs ${before} -> ${await tabCount()}`)

  // Second click closes it.
  await evaluate(`(() => { document.querySelector('.new-file-wrap button.icon-btn').click(); return true })()`)
  await sleep(400)
  check('second click closes flyout', !(await evaluate(`!!document.querySelector('.new-file-flyout')`)))
  check('second click still creates no tab', (await tabCount()) === before)

  // Flyout item still creates a tab.
  await evaluate(`(() => { const wrap = document.querySelector('.new-file-wrap'); wrap.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })); return true })()`)
  await waitFor(() => evaluate(`!!document.querySelector('.new-file-flyout')`), 'hover did not open flyout')
  await evaluate(`(() => {
    const item = [...document.querySelectorAll('.new-file-flyout button')].find((b) => b.textContent.includes('Markdown'))
    item.click(); return true
  })()`)
  await waitFor(() => tabCount().then((n) => n === before + 1), 'flyout Markdown item did not create a tab')
  check('flyout Markdown item creates a tab', true)
} finally {
  await stopBuiltElectron(app)
}
console.log(failures === 0 ? 'ALL PASSED' : `${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
