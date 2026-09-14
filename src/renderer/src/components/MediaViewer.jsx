// Read-only image tab with a small standard viewer toolbar: zoom out/in,
// fit-width, 1:1, rotate 90°, save-as. Ctrl/Cmd+wheel zooms. Zoom/rotation
// are per-tab ephemeral state; no editing, no dirty tracking.
import { useEffect, useMemo, useRef, useState } from 'react'
import { fileUrlForAbsolutePath, toDisplayImageUrl } from './editor-images.js'
import { useI18n } from '../i18n.jsx'

export default function MediaViewer({ tab }) {
  const { t } = useI18n()
  const [zoom, setZoom] = useState('fit') // 'fit' | number (percent)
  const [rotation, setRotation] = useState(0)
  const [failed, setFailed] = useState(false)
  const frameRef = useRef(null)

  const src = useMemo(() => {
    const fileUrl = fileUrlForAbsolutePath(tab?.path)
    return fileUrl ? toDisplayImageUrl(fileUrl) : ''
  }, [tab?.path])

  // A different path in the same mounted tab (e.g. restored session) resets state.
  useEffect(() => {
    setZoom('fit')
    setRotation(0)
    setFailed(false)
  }, [tab?.path])

  // Ctrl/Cmd+wheel zoom (wheel listener must be non-passive to preventDefault).
  useEffect(() => {
    const el = frameRef.current
    if (!el) return undefined
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return
      e.preventDefault()
      setZoom((prev) => {
        const base = prev === 'fit' ? 100 : prev
        const next = e.deltaY < 0 ? base + 10 : base - 10
        return Math.min(800, Math.max(10, next))
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const saveAs = async () => {
    const res = await window.api?.mediaSaveAs?.(tab.path)
    if (res?.error) window.alert(res.error)
  }

  if (failed) {
    return (
      <div className="media-viewer media-missing" role="status">
        <div className="media-missing-icon">⚠</div>
        <div className="media-missing-text">{t('media.missing')}</div>
        <div className="media-missing-path">{tab?.path}</div>
      </div>
    )
  }

  const style =
    zoom === 'fit'
      ? { transform: `rotate(${rotation}deg)`, maxWidth: '100%', maxHeight: '100%' }
      : { transform: `rotate(${rotation}deg)`, width: `${zoom}%`, maxWidth: 'none' }

  return (
    <div className="media-viewer" ref={frameRef}>
      <div className="media-toolbar" role="toolbar" aria-label={t('media.toolbarLabel')}>
        <button type="button" title={t('media.zoomOut')} onClick={() => setZoom((p) => Math.max(10, (p === 'fit' ? 100 : p) - 10))}>−</button>
        <button type="button" title={t('media.zoomIn')} onClick={() => setZoom((p) => Math.min(800, (p === 'fit' ? 100 : p) + 10))}>+</button>
        <button type="button" className={zoom === 'fit' ? 'is-active' : ''} onClick={() => setZoom('fit')}>{t('media.fitWidth')}</button>
        <button type="button" className={zoom === 100 ? 'is-active' : ''} onClick={() => setZoom(100)}>1:1</button>
        <button type="button" title={t('media.rotate')} onClick={() => setRotation((r) => (r + 90) % 360)}>⟳</button>
        <button type="button" title={t('media.saveAs')} onClick={saveAs}>⤓</button>
      </div>
      <div className="media-stage">
        <img src={src} alt={tab.title || ''} style={style} onError={() => setFailed(true)} draggable={false} />
      </div>
    </div>
  )
}
