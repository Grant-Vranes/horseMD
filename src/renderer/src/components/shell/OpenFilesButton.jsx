// Topbar open-files toggle button with a floating list panel: shows every
// open tab when the tab strip is crowded. Click an item to activate its tab,
// click the close dot to close the tab. The panel is position:fixed (measured
// from the button) because .topbar is overflow:hidden and would clip an
// absolutely-positioned dropdown.
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../icons.jsx'
import { isTabDirty } from '../../lib/tab-state.js'
import { tabFileIcon } from '../../lib/file-type-icon.js'
import { tabFileMeta } from '../../lib/file-meta.js'
import { getCachedFileSize, fetchFileSize } from '../../lib/file-size.js'

export default function OpenFilesButton({ tabs, activeId, t, onActivate, onClose }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  // Disk sizes for media tabs (images / PDF keep their tab content empty).
  const [sizes, setSizes] = useState({})
  const rootRef = useRef(null)
  const btnRef = useRef(null)

  // Resolve missing disk sizes when the flyout opens (cached per path).
  useEffect(() => {
    if (!open) return
    tabs.forEach((tab) => {
      const path = tab.path
      if (!path || getCachedFileSize(path) != null) return
      fetchFileSize(path).then((size) => {
        if (size != null) setSizes((prev) => (prev[path] === size ? prev : { ...prev, [path]: size }))
      })
    })
  }, [open, tabs])

  const measure = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) })
  }

  const toggle = () => {
    if (open) setOpen(false)
    else {
      measure()
      setOpen(true)
    }
  }

  // Click-outside closes.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="open-files-wrap">
      <button
        ref={btnRef}
        className={`icon-btn drag-no${open ? ' active' : ''}`}
        title={t('topbar.openFiles')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        <Icon name="list" size={16} />
      </button>
      {open && pos && (
        <div className="open-files-flyout context-menu" role="menu" style={{ top: pos.top, right: pos.right }}>
          {tabs.length === 0 && <div className="open-files-empty">{t('topbar.noOpenFiles')}</div>}
          {tabs.map((tab) => {
            const active = tab.id === activeId
            const dirty = isTabDirty(tab)
            return (
              <button
                key={tab.id}
                role="menuitem"
                className={`open-files-item${active ? ' active' : ''}`}
                title={(() => {
                  const meta = tabFileMeta(tab, tab.path ? (getCachedFileSize(tab.path) ?? sizes[tab.path] ?? null) : null)
                  const base = tab.path || tab.title
                  return meta ? `${base}\n${meta}` : base
                })()}
                onClick={() => {
                  onActivate(tab.id)
                  setOpen(false)
                }}
              >
                <span className="new-file-item-icon">
                  <Icon name={tabFileIcon(tab)} size={14} />
                </span>
                <span className="open-files-item-title">{tab.title}</span>
                <span
                  className={`open-files-item-close${dirty ? ' dirty' : ''}`}
                  title={t('tab.close')}
                  onClick={(e) => {
                    e.stopPropagation()
                    onClose(tab.id)
                  }}
                >
                  {dirty && !active ? <span className="dot" /> : <Icon name="close" size={12} />}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
