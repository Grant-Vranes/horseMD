// Read-only image tab with a small standard viewer toolbar: zoom out/in,
// fit, 1:1, rotate 90°, save-as. Ctrl/Cmd+wheel (trackpad pinch included)
// zooms continuously; plain wheel pans; double-click toggles fit / 1:1.
// Zoom renders via transform: scale() on a composited layer — resizing the
// <img> width would re-layout and re-rasterize the full bitmap every frame.
// Zoom/rotation are per-tab ephemeral state; no editing, no dirty tracking.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { fileUrlForAbsolutePath, toDisplayImageUrl } from './editor-images.js'
import { useI18n } from '../i18n.jsx'

const MIN_ZOOM = 0.02
const MAX_ZOOM = 32
const clampZoom = (z) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

export default function MediaViewer({ tab }) {
  const { t } = useI18n()
  const [zoom, setZoom] = useState(null) // null = fit stage
  const [fitScale, setFitScale] = useState(1)
  const [rotation, setRotation] = useState(0)
  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [failed, setFailed] = useState(false)
  const stageRef = useRef(null)

  const src = useMemo(() => {
    const fileUrl = fileUrlForAbsolutePath(tab?.path)
    return fileUrl ? toDisplayImageUrl(fileUrl) : ''
  }, [tab?.path])

  // A different path in the same mounted tab (e.g. restored session) resets state.
  useEffect(() => {
    setZoom(null)
    setRotation(0)
    setFailed(false)
    setNatural({ w: 0, h: 0 })
  }, [tab?.path])

  // Contain-fit scale for the current stage size and rotation. Recomputed via
  // ResizeObserver so split-pane resizes keep the fit view correct.
  useEffect(() => {
    const stage = stageRef.current
    if (!stage || !natural.w || !natural.h) return undefined
    const compute = () => {
      const rotated = rotation % 180 !== 0
      const dw = rotated ? natural.h : natural.w
      const dh = rotated ? natural.w : natural.h
      const availW = Math.max(1, stage.clientWidth - 24)
      const availH = Math.max(1, stage.clientHeight - 24)
      setFitScale(Math.max(MIN_ZOOM, Math.min(availW / dw, availH / dh)))
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(stage)
    return () => ro.disconnect()
  }, [natural.w, natural.h, rotation])

  // Latest fitScale without re-binding the wheel listener.
  const fitScaleRef = useRef(fitScale)

  // Continuous zoom: exponential step from wheel delta (Ctrl/Cmd+wheel or
  // trackpad pinch). Plain wheel keeps native pan scrolling.
  useEffect(() => {
    const el = stageRef.current
    if (!el) return undefined
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      zoomAt(Math.exp(-e.deltaY * 0.002), e.clientX, e.clientY)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    fitScaleRef.current = fitScale
  }, [fitScale])

  // Track the effective zoom so cursor-anchored zooming can compute ratios
  // without re-binding listeners.
  const zoomRef = useRef(zoom)
  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  // Zoom by `ratio` keeping the image point under (clientX, clientY) fixed on
  // screen (stage center when null). The sizer box drives real layout
  // overflow, so after the zoom commits we re-anchor the scroll offset:
  // cursor distance from the content origin scales by the zoom ratio, the
  // distance from the viewport edge stays constant. 12px matches the stage
  // padding, which does not scale with the content.
  const zoomAt = useCallback((ratio, clientX, clientY) => {
    const stage = stageRef.current
    if (!stage) return
    const prev = zoomRef.current == null ? fitScaleRef.current : zoomRef.current
    const next = clampZoom(prev * ratio)
    if (next === prev) return
    flushSync(() => setZoom(next))
    const rect = stage.getBoundingClientRect()
    const ox = clientX == null ? rect.width / 2 : clientX - rect.left
    const oy = clientY == null ? rect.height / 2 : clientY - rect.top
    const r = next / prev
    const pad = 12
    stage.scrollLeft = pad + (stage.scrollLeft + ox - pad) * r - ox
    stage.scrollTop = pad + (stage.scrollTop + oy - pad) * r - oy
  }, [])

  const toggleFit = useCallback(() => {
    setZoom((prev) => {
      const atFit = prev == null || Math.abs(prev - fitScaleRef.current) < 0.01
      return atFit ? 1 : null
    })
  }, [])

  const saveAs = async () => {
    const res = await window.api?.mediaSaveAs?.(tab.path)
    if (res?.error) window.alert(res.error)
  }

  const effective = zoom == null ? fitScale : zoom
  const rotated = rotation % 180 !== 0
  const dispW = rotated ? natural.h : natural.w
  const dispH = rotated ? natural.w : natural.h

  if (failed) {
    return (
      <div className="media-viewer media-missing" role="status">
        <div className="media-missing-icon">⚠</div>
        <div className="media-missing-text">{t('media.missing')}</div>
        <div className="media-missing-path">{tab?.path}</div>
      </div>
    )
  }

  return (
    <div className="media-viewer">
      <div className="media-toolbar" role="toolbar" aria-label={t('media.toolbarLabel')}>
        <button
          type="button"
          title={t('media.zoomOut')}
          onClick={() => zoomAt(0.8)}
        >
          −
        </button>
        <button
          type="button"
          title={t('media.zoomIn')}
          onClick={() => zoomAt(1.25)}
        >
          +
        </button>
        <button
          type="button"
          className={zoom == null ? 'is-active' : ''}
          onClick={() => setZoom(null)}
        >
          {t('media.fitWidth')}
        </button>
        <button
          type="button"
          className={zoom === 1 ? 'is-active' : ''}
          onClick={() => setZoom(1)}
        >
          1:1
        </button>
        <button type="button" title={t('media.rotate')} onClick={() => setRotation((r) => (r + 90) % 360)}>
          ⟳
        </button>
        <button type="button" title={t('media.saveAs')} onClick={saveAs}>
          ⤓
        </button>
      </div>
      <div className="media-stage" ref={stageRef} onDoubleClick={toggleFit}>
        {/* The img must always be mounted: onError drives the missing-file
            state for corrupt/undeletable files before natural size is known. */}
        <div
          className="media-sizer"
          style={
            dispW > 0
              ? { width: `${Math.round(dispW * effective)}px`, height: `${Math.round(dispH * effective)}px` }
              : { width: '0px', height: '0px' }
          }
        >
          <img
            src={src}
            alt={tab.title || ''}
            draggable={false}
            onError={() => setFailed(true)}
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            style={{ transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${effective})` }}
          />
        </div>
      </div>
    </div>
  )
}
