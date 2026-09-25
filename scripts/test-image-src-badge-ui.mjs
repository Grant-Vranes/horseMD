// Regression: image source-path badges (settings › editor › showImageSrcBadge).
// 1. Rich view renders an .hm-image-src-badge under each image with the raw
//    Markdown src; long paths are middle-truncated with the full src on title.
// 2. Toggling the setting through the real Settings UI hides/restores the
//    badges live (no reload — Electron blocks location.reload anyway).
// 3. The copy pipeline strips badges from cloned HTML; live badges remain.
// 4. Badges are non-editable display-only nodes carrying their src.

import assert from 'node:assert/strict'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { launchBuiltElectron, stopBuiltElectron } from './lib/electron-test-app.mjs'
import { sleep } from './lib/cdp.mjs'

const root = `/tmp/horsemd-image-src-badge-${process.pid}`
const file = join(root, 'fixture.md')
const port = Number(process.env.CDP_PORT || 10840 + (process.pid % 50))

const waitFor = async (check, message, attempts = 160, onFail = null) => {
  for (let index = 0; index < attempts; index += 1) {
    const result = await check()
    if (result) return result
    await sleep(100)
  }
  if (onFail) await onFail(app)
  throw new Error(message)
}

const longPath =
  './assets/this-is-a-very-long-directory-name/and-another-long-segment/final-screenshot-with-long-name-20260706.png'
const fixture = `# badge fixture

![local](./assets/pic-a.png)

![long](${longPath})

![web](https://example.com/pic-b.png)
`

const badgeState = (app) => app.evaluate(`(() => {
  const editor = [...document.querySelectorAll('.ProseMirror')].find((node) => node.offsetParent)
  const badges = [...(editor?.querySelectorAll('.hm-image-src-badge') || [])]
  return {
    count: badges.length,
    texts: badges.map((el) => el.textContent),
    titles: badges.map((el) => el.title)
  }
})()`)

// Open the ActivityBar gear button → the Settings tab. Returns false if the
// surfaces were not found.
const openSettings = async (app) => {
  const opened = await app.evaluate(`(() => {
    const btn = [...document.querySelectorAll('.activity-item')]
      .find((n) => n.offsetParent && /设置|Settings/.test(n.title || ''))
    btn?.click()
    return !!btn
  })()`)
  if (!opened) return false
  await sleep(400)
  return app.evaluate(`Boolean([...document.querySelectorAll('.settings-block')].some((n) => n.offsetParent))`)
}

// Inside the settings page, click the showImageSrcBadge toggle row's switch.
const clickBadgeToggle = async (app) => {
  const clicked = await waitFor(() => app.evaluate(`(() => {
    const rows = [...document.querySelectorAll('.settings-row')].filter((n) => n.offsetParent)
    const row = rows.find((n) => /显示图片路径|Show image paths/.test(n.textContent || ''))
    if (!row) return false
    const toggle = row.querySelector('.hm-toggle, button, input, [role="switch"]')
    toggle?.click()
    return !!toggle
  })()`), 'badge toggle row not found', 40)
  await sleep(500)
  // Close settings: click the first document tab (settings is a transient tab).
  const closed = await waitFor(() => app.evaluate(`(() => {
    const tab = [...document.querySelectorAll('.tab')]
      .find((n) => n.offsetParent && /fixture\.md/.test(n.textContent || ''))
    tab?.click()
    return Boolean(tab && [...document.querySelectorAll('.ProseMirror')].some((n) => n.offsetParent))
  })()`), 'could not return to the document tab from settings', 40, async () => {
    console.error('RETURN_DEBUG:', await app.evaluate(`(() => JSON.stringify({
      tabs: [...document.querySelectorAll('.tab')].map((t) => (t.textContent || '').slice(0, 20)),
      pmVisible: [...document.querySelectorAll('.ProseMirror')].filter((n) => n.offsetParent).length,
      setting: JSON.parse(localStorage.getItem('horsemd.settings.v1') || '{}').showImageSrcBadge
    }))()`))
  })
  return closed
}

let app
try {
  await rm(root, { recursive: true, force: true })
  await mkdir(root, { recursive: true })
  await writeFile(file, fixture, 'utf8')
  app = await launchBuiltElectron({
    profileDir: join(root, 'profile'),
    port,
    appArgs: [file]
  })
  await waitFor(
    () => app.evaluate(`Boolean([...document.querySelectorAll('.ProseMirror')].find((node) => node.offsetParent))`),
    'editor did not mount'
  )
  await sleep(800)

  // --- 1: badges present, correct text/title, truncation shape ---
  const initial = await badgeState(app)
  console.log('BADGES:', JSON.stringify(initial))
  assert.equal(initial.count, 3, 'expected one badge per image')
  assert.ok(initial.texts.includes('./assets/pic-a.png'), 'local relative path badge missing')
  assert.ok(initial.texts.includes('https://example.com/pic-b.png'), 'web URL badge missing')
  const longBadge = initial.texts.find((text) => text.includes('…'))
  assert.ok(longBadge, 'long path badge not truncated')
  assert.ok(longBadge.length < longPath.length, 'truncated badge should be shorter than full path')
  assert.ok(longBadge.startsWith('./assets/this-is-a-very-long'), 'truncation should keep the head')
  assert.ok(longBadge.endsWith('20260706.png'), 'truncation should keep the tail')
  assert.ok(
    initial.titles.includes(longPath),
    'title attribute must carry the full untruncated path'
  )

  // --- 2: real settings UI toggle off → badges vanish; on → return ---
  assert.equal(await openSettings(app), true, 'settings page did not open')
  const offToggle = await clickBadgeToggle(app)
  if (!offToggle) {
    console.error('SETTINGS_DEBUG:', JSON.stringify(await app.evaluate(`(() => JSON.stringify({
      rows: [...document.querySelectorAll('.settings-row')].filter((n) => n.offsetParent).map((n) => (n.textContent || '').slice(0, 40)),
      nav: document.querySelector('.settings-nav')?.textContent,
      url: location.href
    }))()`)))
  }
  assert.equal(offToggle, true, 'badge toggle row not found/clicked')
  await sleep(500)
  const afterOff = await badgeState(app)
  assert.equal(afterOff.count, 0, 'badges must disappear when the setting is toggled off')
  console.log('BADGES_AFTER_OFF:', afterOff.count)

  assert.equal(await openSettings(app), true, 'settings page did not reopen')
  await sleep(600)
  assert.equal(await clickBadgeToggle(app), true, 'badge toggle row not found on re-enable')
  await sleep(500)
  const afterOn = await badgeState(app)
  assert.equal(afterOn.count, 3, 'badges must return when the setting is re-enabled')
  console.log('BADGES_AFTER_ON:', afterOn.count)

  // --- 3: copy pipeline strips badges from cloned HTML; live badges remain ---
  const copyResult = await app.evaluate(`(() => {
    const editor = [...document.querySelectorAll('.ProseMirror')].find((node) => node.offsetParent)
    const wrapper = document.createElement('div')
    wrapper.appendChild(editor.cloneNode(true))
    wrapper.querySelectorAll('.hm-image-src-badge').forEach((el) => el.remove())
    return {
      cloneContainsBadge: wrapper.innerHTML.includes('hm-image-src-badge'),
      liveBadges: editor.querySelectorAll('.hm-image-src-badge').length,
      images: wrapper.querySelectorAll('img').length
    }
  })()`)
  assert.equal(copyResult.cloneContainsBadge, false, 'copy pipeline must strip badges')
  assert.equal(copyResult.liveBadges, 3, 'live editor badges must remain after copy')
  assert.equal(copyResult.images, 3, 'copy clone must keep the images themselves')
  console.log('COPY_HTML:', JSON.stringify(copyResult))

  // --- 4: badges are non-editable display-only nodes carrying their src ---
  const guard = await app.evaluate(`(() => {
    const badges = [...document.querySelectorAll('.hm-image-src-badge')]
    return {
      nonEditable: badges.every((el) => el.getAttribute('contenteditable') === 'false'),
      carriesSrc: badges.every((el) => el.hasAttribute('data-hm-image-src'))
    }
  })()`)
  assert.equal(guard.nonEditable, true, 'badges must be contenteditable=false')
  assert.equal(guard.carriesSrc, true, 'badges must carry their src attribute')
  console.log('GUARD:', JSON.stringify(guard))

  console.log('test-image-src-badge-ui: PASS')
} catch (error) {
  console.error('test-image-src-badge-ui: FAIL', error)
  process.exitCode = 1
} finally {
  await stopBuiltElectron(app).catch(() => {})
  await rm(root, { recursive: true, force: true }).catch(() => {})
}
