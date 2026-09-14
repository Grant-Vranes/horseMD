// Topbar "+" button with a hover flyout: Markdown / Excalidraw / Drawio.
// Desktop: hovering the button opens the flyout; clicking keeps the classic
// one-step "new Markdown tab" (menu item does the same). Mobile has no hover:
// tapping toggles the flyout and Markdown is one of the items.
// The flyout is position:fixed (measured from the button) because .topbar is
// overflow:hidden and would clip an absolutely-positioned dropdown.
import { useEffect, useRef, useState } from 'react'
import { Icon } from '../icons.jsx'
import { labelWithShortcut } from '../../lib/commands/shortcut-labels.js'

export default function NewFileButton({
  isMobile,
  t,
  effectiveKeybindings,
  onNew,
  onNewTyped
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const closeTimer = useRef(null)
  const rootRef = useRef(null)
  const btnRef = useRef(null)
  const canExcalidraw = window.api?.capabilities?.excalidraw === true
  const canDrawio = window.api?.capabilities?.drawio === true

  const measure = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) })
  }

  const cancelClose = () => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }
  const scheduleClose = () => {
    cancelClose()
    closeTimer.current = setTimeout(() => setOpen(false), 160)
  }

  useEffect(() => cancelClose, [])

  // Click-outside closes (mainly for the mobile tap-toggle path).
  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open])

  const items = [
    { type: 'markdown', label: t('topbar.newMarkdown'), icon: 'file' },
    ...(canExcalidraw ? [{ type: 'excalidraw', label: t('topbar.newExcalidraw'), icon: 'whiteboard' }] : []),
    ...(canDrawio ? [{ type: 'drawio', label: t('topbar.newDrawio'), icon: 'diagram' }] : [])
  ]

  const pick = (type) => {
    cancelClose()
    setOpen(false)
    onNewTyped(type)
  }

  const openMenu = () => {
    measure()
    cancelClose()
    setOpen(true)
  }

  const onButtonClick = () => {
    if (isMobile) {
      open ? setOpen(false) : openMenu()
    } else {
      // Desktop: click stays the fast "new Markdown tab" path; the flyout is
      // hover-driven. Close it so a stale flyout doesn't linger.
      cancelClose()
      setOpen(false)
      onNew()
    }
  }

  return (
    <div
      ref={rootRef}
      className="new-file-wrap"
      onMouseEnter={() => {
        if (!isMobile) openMenu()
      }}
      onMouseLeave={() => {
        if (!isMobile) scheduleClose()
      }}
    >
      <button
        ref={btnRef}
        className="icon-btn drag-no"
        title={labelWithShortcut(t('welcome.newFile'), 'file.new', effectiveKeybindings)}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onButtonClick}
      >
        <Icon name="plus" size={18} />
      </button>
      {open && pos && (
        <div className="new-file-flyout context-menu" role="menu" style={{ top: pos.top, right: pos.right }}>
          {items.map((item) => (
            <button key={item.type} role="menuitem" onClick={() => pick(item.type)}>
              <span className="new-file-item-icon">
                <Icon name={item.icon} size={15} />
              </span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
