# Deferred Source-Sync Warning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 源码同步完整性失败不再立即弹 sticky 警告——先进入 600ms 静默观察窗口，期间发布成功即静默恢复；到期仍未恢复才弹非 sticky toast（6s 自动消失），3s 内同签名二次到期才升级回 sticky。

**Architecture:** 新增纯逻辑模块 `editor-source-sync-warning.js`（pending 警告状态机，Node 可直测），`Editor.jsx` 的 `reportSourceSyncFailure()` 改为登记 pending 而非立即 fireToast，全部源码发布成功点调用 `noteSourceSyncRecovery()` 取消 pending。fail-closed 语义（不提交、保留 dirty）完全不动。

**Tech Stack:** 原生 ES Module（无依赖）、Node 内置 test runner 风格 assert 脚本、Electron CDP e2e（`scripts/lib/electron-test-app.mjs`）。

**Spec:** `docs/superpowers/specs/2026-10-01-source-sync-deferred-warning-design.md`

## Global Constraints

- 不修改任何 mapper / owner / sourceSyncBridge 的校验逻辑；不修改 `saveTab` / `commitAllLive`。
- 观察窗口 600ms；升级滑动窗口 3000ms；非 sticky toast `duration: 6000`。
- trace 事件名固定：`source-sync-warning-deferred`、`source-sync-recovered`、`source-sync-warning-shown`。
- 跨平台规则不受影响（本设计不涉平台分支）。
- 提交信息用 conventional commits（`feat:` / `test:`），每次任务一个 commit。

---

### Task 1: 警告管理器纯逻辑模块（TDD）

**Files:**
- Create: `src/renderer/src/components/editor-source-sync-warning.js`
- Create: `scripts/test-source-sync-warning-manager.mjs`
- Modify: `package.json`（scripts 区新增一条）

**Interfaces:**
- Consumes: 无（纯模块）。
- Produces: `createSourceSyncWarningManager({ fire, trace, now?, setTimer?, clearTimer? })` → `{ deferFailure(reason), noteRecovery(site), hasPending(signature), dispose() }`；常量 `SOURCE_SYNC_WARNING_WINDOW_MS = 600`、`SOURCE_SYNC_ESCALATION_WINDOW_MS = 3000`、`SOURCE_SYNC_TOAST_DURATION_MS = 6000`。Task 2 依赖 `deferFailure` / `noteRecovery` / `dispose`。

- [ ] **Step 1: 写失败测试**

创建 `scripts/test-source-sync-warning-manager.mjs`：

```js
// Unit tests for the deferred source-sync warning manager.
// Uses a manual clock + queue-based fake timers so no real waiting happens.
import assert from 'node:assert/strict'
import {
  createSourceSyncWarningManager,
  SOURCE_SYNC_WARNING_WINDOW_MS,
  SOURCE_SYNC_ESCALATION_WINDOW_MS,
  SOURCE_SYNC_TOAST_DURATION_MS
} from '../src/renderer/src/components/editor-source-sync-warning.js'

function makeHarness() {
  const timers = []
  let id = 0
  let nowMs = 1_000_000
  const fired = []
  const traced = []
  const manager = createSourceSyncWarningManager({
    fire: (signature, sticky) => fired.push({ signature, sticky, at: nowMs }),
    trace: (name, data) => traced.push({ name, data, at: nowMs }),
    now: () => nowMs,
    setTimer: (fn, ms) => {
      const entry = { id: ++id, fn, due: nowMs + ms, cancelled: false }
      timers.push(entry)
      return entry
    },
    clearTimer: (entry) => { entry.cancelled = true }
  })
  const advance = (ms) => {
    nowMs += ms
    for (const entry of timers) {
      if (!entry.cancelled && entry.due <= nowMs) {
        entry.cancelled = true
        entry.fn()
      }
    }
  }
  return { manager, fired, traced, advance }
}

// 1. Constants match the spec.
assert.equal(SOURCE_SYNC_WARNING_WINDOW_MS, 600)
assert.equal(SOURCE_SYNC_ESCALATION_WINDOW_MS, 3000)
assert.equal(SOURCE_SYNC_TOAST_DURATION_MS, 6000)

// 2. Recovery inside the window cancels the warning; no toast fires.
{
  const h = makeHarness()
  h.manager.deferFailure('blockquote-exit-range-unmapped')
  assert.ok(h.manager.hasPending('blockquote-exit-range-unmapped'))
  h.advance(200)
  h.manager.noteRecovery('structural-owner')
  assert.equal(h.manager.hasPending('blockquote-exit-range-unmapped'), false)
  h.advance(1000)
  assert.equal(h.fired.length, 0)
  const recovered = h.traced.find((e) => e.name === 'source-sync-recovered')
  assert.ok(recovered, 'recovery must be traced')
  assert.equal(recovered.data.reason, 'blockquote-exit-range-unmapped')
  assert.equal(recovered.data.site, 'structural-owner')
}

// 3. Warning surviving the window fires NON-sticky once.
{
  const h = makeHarness()
  h.manager.deferFailure('unmapped-source-change')
  h.advance(700)
  assert.deepEqual(h.fired, [{ signature: 'unmapped-source-change', sticky: false, at: 1_000_700 }])
  assert.ok(h.traced.some((e) => e.name === 'source-sync-warning-shown' && e.data.sticky === false))
}

// 4. Same signature expiring twice within 3s escalates to sticky.
{
  const h = makeHarness()
  h.manager.deferFailure('boom')
  h.advance(700) // first expiry, non-sticky
  h.manager.deferFailure('boom')
  h.advance(700) // second expiry, 700ms after the first → sticky
  assert.equal(h.fired.length, 2)
  assert.equal(h.fired[1].sticky, true)
}

// 5. Second expiry OUTSIDE 3s stays non-sticky.
{
  const h = makeHarness()
  h.manager.deferFailure('boom')
  h.advance(700)
  h.advance(4000) // far past the escalation window
  h.manager.deferFailure('boom')
  h.advance(700)
  assert.equal(h.fired.length, 2)
  assert.equal(h.fired[1].sticky, false)
}

// 6. A different signature replaces the pending one; recovery cancels the latest.
{
  const h = makeHarness()
  h.manager.deferFailure('a')
  h.manager.deferFailure('b')
  assert.equal(h.manager.hasPending('a'), false)
  assert.equal(h.manager.hasPending('b'), true)
  h.advance(700)
  assert.deepEqual(h.fired, [{ signature: 'b', sticky: false, at: 1_000_700 }])
}

// 7. Same-signature refire extends the window instead of expiring early.
{
  const h = makeHarness()
  h.manager.deferFailure('a')
  h.advance(400)
  h.manager.deferFailure('a') // refire at +400ms resets the 600ms window
  h.advance(400) // +800 from the first failure, but only 400 since the refire
  assert.equal(h.fired.length, 0)
  h.advance(300)
  assert.equal(h.fired.length, 1)
}

// 8. dispose() cancels a pending warning.
{
  const h = makeHarness()
  h.manager.deferFailure('a')
  h.manager.dispose()
  h.advance(1000)
  assert.equal(h.fired.length, 0)
}

// 9. Empty/undefined reason falls back to the default signature.
{
  const h = makeHarness()
  h.manager.deferFailure(undefined)
  h.advance(700)
  assert.equal(h.fired[0].signature, 'source-document-mismatch')
}

// 10. Required options are validated.
assert.throws(() => createSourceSyncWarningManager({ trace: () => {} }), TypeError)
assert.throws(() => createSourceSyncWarningManager({ fire: () => {} }), TypeError)

console.log('PASS: source-sync warning manager unit tests')
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node scripts/test-source-sync-warning-manager.mjs`
Expected: FAIL — `Cannot find module '.../editor-source-sync-warning.js'`

- [ ] **Step 3: 写实现**

创建 `src/renderer/src/components/editor-source-sync-warning.js`：

```js
// Deferred warning manager for source-sync integrity failures.
// Spec: docs/superpowers/specs/2026-10-01-source-sync-deferred-warning-design.md
//
// The sync pipeline already retries the cumulative delta on every later
// callback / forced flush, so most integrity failures self-heal within a few
// hundred milliseconds. Warning at the instant of failure therefore punishes
// users for transient divergences. This manager defers the toast:
//
//   failure → 600ms observation window
//     any successful source publication cancels it (trace-only)
//     window expiry → NON-sticky toast (6s auto-dismiss, Editor supplies the
//       duration; this module only reports sticky=true/false)
//   same signature expiring twice within 3s → sticky toast (legacy behavior)
//
// Fail-closed semantics live elsewhere and are untouched: nothing here
// commits, reverts, or mutates document/source state.

export const SOURCE_SYNC_WARNING_WINDOW_MS = 600
export const SOURCE_SYNC_ESCALATION_WINDOW_MS = 3000
export const SOURCE_SYNC_TOAST_DURATION_MS = 6000

export function createSourceSyncWarningManager({
  fire,
  trace,
  now = () => Date.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = (id) => clearTimeout(id)
}) {
  if (typeof fire !== 'function') throw new TypeError('fire is required')
  if (typeof trace !== 'function') throw new TypeError('trace is required')

  let pending = null // { signature, since, timer }
  const lastShownAt = new Map() // signature -> last expiry timestamp

  const clearPending = () => {
    if (pending) clearTimer(pending.timer)
    pending = null
  }

  const pruneShown = (t) => {
    for (const [signature, at] of lastShownAt) {
      if (t - at > SOURCE_SYNC_ESCALATION_WINDOW_MS) lastShownAt.delete(signature)
    }
  }

  function onExpire() {
    if (!pending) return
    const { signature } = pending
    const t = now()
    pending = null
    pruneShown(t)
    const last = lastShownAt.get(signature)
    const sticky = typeof last === 'number' && t - last <= SOURCE_SYNC_ESCALATION_WINDOW_MS
    lastShownAt.set(signature, t)
    trace('source-sync-warning-shown', { reason: signature, sticky })
    fire(signature, sticky)
  }

  return {
    deferFailure(reason) {
      const signature = String(reason || 'source-document-mismatch')
      if (pending?.signature === signature) {
        // Same failure re-fires: extend the observation window.
        clearTimer(pending.timer)
        pending.timer = setTimer(onExpire, SOURCE_SYNC_WARNING_WINDOW_MS)
        return
      }
      clearPending()
      pending = {
        signature,
        since: now(),
        timer: setTimer(onExpire, SOURCE_SYNC_WARNING_WINDOW_MS)
      }
      trace('source-sync-warning-deferred', { reason: signature })
    },
    noteRecovery(site) {
      if (!pending) return
      const { signature, since } = pending
      clearPending()
      trace('source-sync-recovered', {
        reason: signature,
        ms: now() - since,
        site: String(site || 'unknown')
      })
    },
    hasPending(signature) {
      return pending ? pending.signature === String(signature) : false
    },
    dispose() {
      clearPending()
      lastShownAt.clear()
    }
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node scripts/test-source-sync-warning-manager.mjs`
Expected: `PASS: source-sync warning manager unit tests`

- [ ] **Step 5: 注册 npm script 并提交**

在 `package.json` 的 `scripts` 中（紧跟某条 `test:` 行之后）加入：

```json
"test:source-sync-warning-manager": "node scripts/test-source-sync-warning-manager.mjs",
```

```bash
git add src/renderer/src/components/editor-source-sync-warning.js scripts/test-source-sync-warning-manager.mjs package.json
git commit -m "feat: deferred source-sync warning manager (pure logic)"
```

---

### Task 2: Editor.jsx 接入

**Files:**
- Modify: `src/renderer/src/components/Editor.jsx`（import 区 ~line 44；`reportSourceSyncFailure` ~1727-1764；成功发布点 2448 / 2492 / 2559 / 2593 / 3248 / 3295 / 3315 / publishSourceSyncResult ~1722；cleanups ~3410）

**Interfaces:**
- Consumes: Task 1 的 `createSourceSyncWarningManager`。
- Produces: `globalThis.__hmSourceSyncWarning`（debug handle，Task 3 的 CDP 测试用它注入 `deferFailure`）；编辑器卸载时清理。

- [ ] **Step 1: 加 import**

在 `Editor.jsx` 顶部 import 区（`import { mountEditorInputTrace, traceEditorEvent } from './editor-input-trace.js'` 之后）加：

```js
import { createSourceSyncWarningManager } from './editor-source-sync-warning.js'
```

- [ ] **Step 2: 创建管理器实例并改写 reportSourceSyncFailure**

在 `let lastSourceSyncWarning = null`（~1727）之前插入管理器创建（放在 `publishSourceSyncResult` 定义之后即可，两处调用均为运行时调用，无 TDZ 问题；若 lint 报 no-use-before-define，则把插入点移到 `publishSourceSyncResult` 之前并让 `publishSourceSyncResult` 体内引用它——箭头函数体在调用时求值，同样安全）：

```js
const sourceSyncWarning = createSourceSyncWarningManager({
  fire: (signature, sticky) => {
    fireToast(
      tRef.current('save.sourceSyncMismatch'),
      sticky ? { sticky: true } : { duration: 6000 }
    )
  },
  trace: (name, data) => traceEditorEvent(name, data)
})
globalThis.__hmSourceSyncWarning = sourceSyncWarning
```

把 `reportSourceSyncFailure` 函数体最后一行：

```js
fireToast(tRef.current('save.sourceSyncMismatch'), { sticky: true })
```

替换为：

```js
sourceSyncWarning.deferFailure(signature)
```

（函数内其余逻辑——1.5s 同签名去重、`source-sync-integrity-failure` trace、evidence dump——全部保留不动。）

- [ ] **Step 3: 在全部成功发布点调用恢复钩子**

在 `reportSourceSyncFailure` 定义之后加本地助手：

```js
const noteSourceSyncRecovery = (site) => sourceSyncWarning.noteRecovery(site)
```

在下列每个「成功发布」分支的第一行加对应调用（行号为当前文件行号，插入后会有漂移，以代码上下文为准）：

1. `publishSourceSyncResult`（~1722）成功分支：
   ```js
   const coordinated = sourceSyncBridge.publish(input)
   if (coordinated?.ok) {
     noteSourceSyncRecovery('publish-result')
     pendingSourceSyncTransactionJournal = null
   }
   return coordinated
   ```
2. `publishPendingStructuralTransactionImpl` 的 owner 发布成功（~1855 `publishOwned` 之后、`pushStructuralTransactionTrace(entry, { phase: 'published', ok: true, ...})` 之前）：
   ```js
   noteSourceSyncRecovery('structural-owner')
   ```
3. `if (ownedStructuralTransaction.ok) {`（~2448）分支首行：`noteSourceSyncRecovery('structural-markdown-updated')`
4. retired-structural scratch fallback 成功 `if (coordinatedFallback?.ok) {`（~2492）内，`traceEditorEvent('scratch-canonical-fallback', ...)` 之后：`noteSourceSyncRecovery('retired-structural-fallback')`
5. plain-paragraph authority 成功 `if (published.ok) {`（~2559）内：`noteSourceSyncRecovery('plain-paragraph-authority')`
6. fast-confirm 分支（~2587-2594，`canonicalMarkdownRef.current = canonical` 之后、`onChange?.(...)` 之前）：`noteSourceSyncRecovery('fast-confirm')`
7. unmapped-preserve scratch fallback 成功 `if (coordinatedFallback?.ok) {`（~3248）内 trace 之后：`noteSourceSyncRecovery('unmapped-preserve-fallback')`
8. publish-prepared scratch fallback 成功 `if (coordinatedFallback?.ok) {`（~3295）内 trace 之后：`noteSourceSyncRecovery('publish-prepared-fallback')`
9. `sourceSyncBridge.publishPrepared(preparedSourceSync, ...)` 主路径成功（~3311 `reportSourceSyncFailure(reason)` 所在 `if (!coordinated?.ok) {...}` 块结束后、`transactionSourcePendingPublish = false`（~3315）之前）：`noteSourceSyncRecovery('markdown-updated-final')`

- [ ] **Step 4: 卸载清理**

在 `cleanups.push(() => cancelDeferredMarkdownSync())`（~3410）旁边加：

```js
cleanups.push(() => {
  sourceSyncWarning.dispose()
  delete globalThis.__hmSourceSyncWarning
})
```

（先 `grep -n "cleanups.push" src/renderer/src/components/Editor.jsx` 确认 `cleanups` 的定义位置与销毁方式，跟随同一数组即可；若销毁走别的机制如 `cleanups` 之外的手动调用列表，则在同一销毁处追加上面两行。）

- [ ] **Step 5: 构建验证**

Run: `npm run build`
Expected: 构建 0 error（`Editor.jsx` 通过 Vite 编译）。

- [ ] **Step 6: 回归既有 UI 用例（600ms 窗口不得破坏现有断言）**

Run: `npm run test:source-sync-warning-manager && npm run test:image-paste-source-sync-ui && npm run test:middle-blockquote-empty-paragraph-ui && npm run test:empty-blockquote-removal-ui`
Expected: 全部 PASS。这些用例断言 mismatch toast **不出现**；若因 toast 延迟出现而失败，说明该场景真实失败且未自愈——不要放宽断言，把失败 reason（查 `globalThis.__hmSourceIntegrityTrace`）记录到 commit message 并回到设计讨论。

- [ ] **Step 7: 提交**

```bash
git add src/renderer/src/components/Editor.jsx
git commit -m "feat: defer source-sync mismatch toast behind a 600ms recovery window"
```

---

### Task 3: E2E 回归（真实 Electron CDP）

**Files:**
- Create: `scripts/test-source-sync-deferred-warning-ui.mjs`
- Modify: `package.json`（scripts 区新增一条）

**Interfaces:**
- Consumes: Task 1/2 的 `globalThis.__hmSourceSyncWarning`（`deferFailure(reason)`）、`launchBuiltElectron` / `stopBuiltElectron`（`scripts/lib/electron-test-app.mjs`）、`sleep`（`scripts/lib/cdp.mjs`）。
- Produces: `npm run test:source-sync-deferred-warning-ui`。

- [ ] **Step 1: 写 E2E 测试**

创建 `scripts/test-source-sync-deferred-warning-ui.mjs`：

```js
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

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

**实现注意**：Scenario 1 断言 `__hmSourceSyncTrace` 存在 `source-sync-recovered` 条目——这要求 trace 落到一个可读数组。Task 2 的 `trace` 回调除了 `traceEditorEvent` 外，同时 push 到 `globalThis.__hmSourceSyncTrace`（上限 50，shift 淘汰）。若 Task 2 未加，在本任务补上：管理器创建处的 `trace` 改为：

```js
trace: (name, data) => {
  const log = (globalThis.__hmSourceSyncTrace ||= [])
  log.push({ name, data, at: Date.now() })
  if (log.length > 50) log.shift()
  traceEditorEvent(name, data)
}
```

Scenario 1 中，若真实编辑发布失败而未恢复（不应该是——普通段落打字是已回归覆盖的稳定路径），该用例会 FAIL 并暴露 reason，按 Task 2 Step 6 的规则处理，不得放宽断言。

- [ ] **Step 2: 构建**

Run: `npm run build`
Expected: 0 error（e2e 加载 `out/main/index.cjs`）。

- [ ] **Step 3: 运行 E2E**

Run: `npm run test:source-sync-deferred-warning-ui`
Expected: 正常退出（无 `process.exit(1)`），三个 scenario 全过。

- [ ] **Step 4: 全量焦点回归**

Run: `npm run test:ui-regression`
Expected: 全部 PASS。若某条用例因「toast 延迟出现」而失败，按 Task 2 Step 6 的规则处理（记录 reason，回到设计讨论），**不放宽任何 warningPattern 断言**。

- [ ] **Step 5: 提交**

```bash
git add scripts/test-source-sync-deferred-warning-ui.mjs package.json src/renderer/src/components/Editor.jsx
git commit -m "test: e2e coverage for deferred source-sync warning (silent recovery, non-sticky, sticky escalation)"
```
