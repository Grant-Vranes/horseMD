// Regression: image hover "remove" button (below Crepe's operation row).
// 1. Hovering a .milkdown-image-block shows the fixed .hm-image-remove button,
//    styled like Crepe's operation-item (32px circle), positioned below the
//    operation row without overlapping it.
// 2. A REAL mouse move onto the button (crossing the editor's mouseleave
//    boundary) keeps it visible; a real press/release deletes the image.
// 3. The button never lives inside editor content.

import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { launchBuiltElectron, stopBuiltElectron } from './lib/electron-test-app.mjs'
import { sleep } from './lib/cdp.mjs'

const root = `/tmp/horsemd-image-remove-${process.pid}`
const file = join(root, 'fixture.md')
const port = Number(process.env.CDP_PORT || 10840 + (process.pid % 50))

const waitFor = async (check, message, attempts = 160) => {
  for (let index = 0; index < attempts; index += 1) {
    const result = await check()
    if (result) return result
    await sleep(100)
  }
  throw new Error(message)
}

const btnOf = `(() => {
  const eds = [...document.querySelectorAll('.ProseMirror')]
  const editor = eds.find((n) => n.offsetParent)
  return editor ? editor.parentElement.querySelector(':scope > .hm-image-remove') : null
})()`

const fixture = `# remove fixture

![first](./assets/pic-a.png)

![second](./assets/pic-b.png)

tail paragraph
`

await mkdir(root, { recursive: true })
await writeFile(file, fixture, 'utf8')

const app = await launchBuiltElectron({
  profileDir: join(root, 'profile'),
  port,
  appArgs: [file]
})

try {
  await waitFor(
    () => app.evaluate(`(() => {
      const editor = [...document.querySelectorAll('.ProseMirror')].find((n) => n.offsetParent)
      return Boolean(editor && editor.querySelectorAll('.milkdown-image-block').length >= 2)
    })()`),
    'editor with 2 image blocks did not mount'
  )

  // Button lives outside the editor, hidden until hover.
  const initial = await app.evaluate(`(() => {
    const btn = ${btnOf}
    return { exists: !!btn, visible: !!btn?.classList.contains('visible') }
  })()`)
  assert.ok(initial.exists, 'fixed remove button not created next to editor')
  assert.equal(initial.visible, false, 'button should start hidden')

  // Hover the first image block (synthetic mouseover bubbles to our capture
  // listener on view.dom).
  await app.evaluate(`(() => {
    const editor = [...document.querySelectorAll('.ProseMirror')].find((n) => n.offsetParent)
    const block = editor.querySelector('.milkdown-image-block')
    block.querySelector('img')?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
  })()`)
  await sleep(250)

  const shown = await app.evaluate(`(() => {
    const btn = ${btnOf}
    const editor = [...document.querySelectorAll('.ProseMirror')].find((n) => n.offsetParent)
    const block = editor.querySelector('.milkdown-image-block')
    // Must sit below Crepe's own .operation row, not on it.
    const op = block.querySelector('.operation')
    const opRect = op?.getBoundingClientRect()
    const b = btn.getBoundingClientRect()
    const overlapsOperation = opRect &&
      b.left < opRect.right && b.right > opRect.left &&
      b.top < opRect.bottom && b.bottom > opRect.top
    // Styled like Crepe's operation-item: 32px circular button.
    const cs = getComputedStyle(btn)
    return {
      visible: btn.classList.contains('visible'),
      overlapsOperation: Boolean(overlapsOperation),
      circular: cs.borderRadius === '50%' && Math.abs(parseFloat(cs.width) - 32) < 1,
      belowOperation: opRect ? b.top >= opRect.bottom - 1 : true,
      hasSvg: !!btn.querySelector('svg'),
      insideEditor: editor.contains(btn)
    }
  })()`)
  assert.ok(shown.visible, 'button did not become visible on hover')
  assert.equal(shown.overlapsOperation, false, 'button overlaps Crepe operation row: ' + JSON.stringify(shown))
  assert.ok(shown.circular, 'button not styled as 32px circle: ' + JSON.stringify(shown))
  assert.ok(shown.belowOperation, 'button not below the operation row')
  assert.ok(shown.hasSvg, 'button missing trash icon')
  assert.equal(shown.insideEditor, false, 'button must not live inside editor content')

  // Real mouse move onto the button (crosses the editor's mouseleave boundary)
  // then a real press/release — the button must stay visible and clickable.
  const btnCenter = await app.evaluate(`(() => {
    const b = ${btnOf}
    const r = b.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })()`)
  await app.send('Input.dispatchMouseEvent', {
    type: 'mouseMoved', x: btnCenter.x, y: btnCenter.y
  })
  await sleep(150)
  const stillVisible = await app.evaluate(`(() => {
    const b = ${btnOf}
    return b.classList.contains('visible') && getComputedStyle(b).pointerEvents !== 'none'
  })()`)
  assert.ok(stillVisible, 'button hid itself when the pointer moved onto it (mouseleave)')
  for (const type of ['mousePressed', 'mouseReleased']) {
    await app.send('Input.dispatchMouseEvent', {
      type, x: btnCenter.x, y: btnCenter.y, button: 'left', clickCount: 1
    })
  }
  await sleep(500)

  const after = await app.evaluate(`(() => {
    const editor = [...document.querySelectorAll('.ProseMirror')].find((n) => n.offsetParent)
    return {
      blocks: editor.querySelectorAll('.milkdown-image-block').length,
      text: editor.textContent || ''
    }
  })()`)
  assert.equal(after.blocks, 1, 'image block was not removed')
  assert.ok(!after.text.includes('first'), 'first image content still present')

  // Moving to the remaining image re-aims the button.
  await app.evaluate(`(() => {
    const editor = [...document.querySelectorAll('.ProseMirror')].find((n) => n.offsetParent)
    const block = editor.querySelectorAll('.milkdown-image-block')[0]
    block.querySelector('img')?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
  })()`)
  await sleep(200)
  const reshown = await app.evaluate(`(() => { const b = ${btnOf}; return b?.classList.contains('visible') })()`)
  assert.ok(reshown, 'button did not re-appear for the remaining image')

  console.log('PASS test-image-remove-button-ui')
} finally {
  await stopBuiltElectron(app)
  await rm(root, { recursive: true, force: true })
}
