// SourceGutter — line numbers for the markdown source-mode textarea.
//
// The source textarea is uncontrolled and softly wraps long lines, so a naive
// "count \n" gutter drifts out of alignment. This component measures soft-wrap
// row counts with a hidden mirror element (same font / width / wrapping as the
// textarea), caches per-line row counts, and overlays a non-interactive number
// column on the pane's left edge that scrolls in lockstep with the textarea.
//
// Contracts respected:
//   - The textarea stays uncontrolled; the gutter never writes to it.
//   - pointer-events: none — clicks/caret hits pass through to the textarea.
//   - Re-measure triggers: mount, textarea input, programmatic value writes
//     (poll check), and width/font-size changes (ResizeObserver).
//   - Huge docs: measurement is chunked via requestIdleCallback with a cached
//     per-line map, so a first paint shows physical-line numbers that converge
//     to wrap-accurate numbers without blocking typing.

import { useEffect, useRef } from 'react'

const MIRROR_CHUNK = 4000
const CACHE_LIMIT = 200000

function nextIdle(fn) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback(fn)
  else setTimeout(fn, 0)
}

export default function SourceGutter() {
  const gutterRef = useRef(null)
  const mirrorRef = useRef(null)
  const cacheRef = useRef(new Map())
  const rowsRef = useRef([]) // per-logical-line row counts
  const measuredRef = useRef(-1) // how many logical lines measured so far
  const valueLenRef = useRef(-1)
  const widthRef = useRef(0)
  const timerRef = useRef(null)

  useEffect(() => {
    // Sibling refs are attached before effects run, so the wrapper's textarea
    // is guaranteed to exist here. Each gutter instance owns exactly one
    // textarea (no shared ref), which keeps split panes independent.
    const ta = gutterRef.current?.parentElement?.querySelector(':scope > textarea')
    if (!ta) return undefined
    let cancelled = false

    const getMirror = () => {
      if (mirrorRef.current) return mirrorRef.current
      const m = document.createElement('div')
      m.setAttribute('aria-hidden', 'true')
      Object.assign(m.style, {
        position: 'absolute',
        visibility: 'hidden',
        top: '0',
        left: '0',
        whiteSpace: 'pre-wrap',
        overflowWrap: 'break-word',
        pointerEvents: 'none',
        zIndex: '-1'
      })
      document.body.appendChild(m)
      mirrorRef.current = m
      return m
    }

    const syncScroll = () => {
      if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop
    }

    const renderNumbers = () => {
      if (cancelled || !gutterRef.current) return
      const rows = rowsRef.current
      const parts = []
      let n = 0
      for (let i = 0; i < rows.length; i++) {
        n += 1
        parts.push(String(n))
        for (let r = 1; r < rows[i]; r++) parts.push('')
      }
      gutterRef.current.textContent = parts.length ? parts.join('\n') : '1'
      syncScroll()
    }

    const measureChunk = (lines, start, taStyle, lineHeight, contentWidth) => {
      const mirror = getMirror()
      mirror.style.font = taStyle.font
      mirror.style.width = `${contentWidth}px`
      const cache = cacheRef.current
      const rows = rowsRef.current
      const end = Math.min(start + MIRROR_CHUNK, lines.length)
      const batch = []
      for (let i = start; i < end; i++) {
        const cached = cache.get(lines[i])
        if (cached != null) {
          rows[i] = cached
          continue
        }
        const div = document.createElement('div')
        div.textContent = lines[i] || ' '
        batch.push([i, div])
        mirror.appendChild(div)
      }
      if (batch.length) {
        // One layout pass for the whole batch, then reuse the nodes' heights.
        for (const [i, div] of batch) {
          const h = div.offsetHeight
          const r = Math.max(1, Math.round(h / lineHeight))
          rows[i] = r
          if (cache.size < CACHE_LIMIT) cache.set(lines[i], r)
        }
        mirror.textContent = ''
      }
      return end
    }

    const measure = () => {
      if (cancelled) return
      const value = ta.value || ''
      valueLenRef.current = value.length
      const taStyle = getComputedStyle(ta)
      const lineHeight = parseFloat(taStyle.lineHeight) || parseFloat(taStyle.fontSize) * 1.75
      const contentWidth = Math.max(
        40,
        ta.clientWidth - parseFloat(taStyle.paddingLeft) - parseFloat(taStyle.paddingRight)
      )
      const widthKey = `${ta.clientWidth}x${taStyle.fontSize}`
      if (widthRef.current !== widthKey) {
        widthRef.current = widthKey
        cacheRef.current = new Map()
      }
      const lines = value.split('\n')
      if (rowsRef.current.length !== lines.length) rowsRef.current = new Array(lines.length)
      let start = 0
      const step = () => {
        if (cancelled) return
        start = measureChunk(lines, start, taStyle, lineHeight, contentWidth)
        renderNumbers()
        if (start < lines.length) nextIdle(step)
      }
      step()
    }

    const scheduleMeasure = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(measure, 250)
    }

    // Paint initial physical-line numbers instantly, then converge to
    // wrap-accurate numbers.
    const initial = (ta.value || '').split('\n')
    rowsRef.current = initial.map(() => 1)
    renderNumbers()
    measure()

    ta.addEventListener('input', scheduleMeasure)
    ta.addEventListener('scroll', syncScroll, { passive: true })
    const ro = new ResizeObserver(() => {
      syncScroll()
      scheduleMeasure()
    })
    ro.observe(ta)
    // Programmatic value writes (source/rich sync, external reload) don't fire
    // 'input'; a cheap length check covers them.
    const poll = setInterval(() => {
      const len = (ta.value || '').length
      if (len !== valueLenRef.current) scheduleMeasure()
    }, 700)

    return () => {
      cancelled = true
      clearInterval(poll)
      if (timerRef.current) clearTimeout(timerRef.current)
      ta.removeEventListener('input', scheduleMeasure)
      ta.removeEventListener('scroll', syncScroll)
      ro.disconnect()
      mirrorRef.current?.remove()
      mirrorRef.current = null
    }
    // The textarea persists per tab; gutter remounts with it via key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={gutterRef} className="source-gutter" aria-hidden="true" />
}
