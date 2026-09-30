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
