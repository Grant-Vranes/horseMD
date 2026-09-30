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
