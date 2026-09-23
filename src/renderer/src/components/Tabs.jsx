import { useEffect, useRef, useState } from 'react'
import { Icon } from './icons.jsx'
import { useI18n } from '../i18n.jsx'
import { isMarkdownName, isExcalidrawName, isDrawioName, isExcalidrawTab, isDrawioTab } from '../paths.js'
import { tabFileIcon } from '../lib/file-type-icon.js'
import { copyToClipboard } from '../ui.js'
import { labelWithShortcut } from '../lib/commands/shortcut-labels.js'
import ExportContextSubmenu from './ExportContextSubmenu.jsx'
import { isTabDirty } from '../lib/tab-state.js'

export default function Tabs({
  tabs,
  activeId,
  splitId,
  focusedPane,
  onActivate,
  onClose,
  onNew,
  onCloseOthers,
  onOpenRight,
  onRename,
  onDuplicate,
  onDelete,
  onExportPdf,
  onExportHtml,
  onExportPandoc,
  onExportExcalidraw,
  onExportDrawio,
  onReorder,
  effectiveKeybindings
}) {
  const { t } = useI18n()
  const activeRef = useRef(null)
  // Right-click context menu: { x, y, tab } in viewport coords, or null.
  const [menu, setMenu] = useState(null)
  // Tab drag-reorder (#31). dragIndexRef holds the source index during a drag;
  // dragOverIndex drives the visual insertion indicator (the tab being hovered).
  const dragIndexRef = useRef(null)
  const [dragOverIndex, setDragOverIndex] = useState(-1)
  // On touch there's no hover to reveal the close ✕, so show it always and use a
  // clear ✕ (the unsaved state is shown in the bottom bar, not as a tab dot).
  const isMobile = window.api.platform === 'ios' || window.api.platform === 'android'
  const scrollRef = useRef(null)
  // Whether the strip currently overflows. When it does, the strip must opt out
  // of -webkit-app-region: drag (see app.css): drag regions swallow wheel and
  // touch events at the OS level, which made horizontal scrolling work only
  // while the pointer happened to sit on a tab pill. canScroll also gates the
  // edge fades; fadeLeft/fadeRight show when content is hidden beyond each edge.
  const [canScroll, setCanScroll] = useState(false)
  const [fadeLeft, setFadeLeft] = useState(false)
  const [fadeRight, setFadeRight] = useState(false)

  // Keep overflow state in sync: tab count changes, renames that change widths,
  // window resizes, and user scrolling all flip it.
  useEffect(() => {
    const strip = scrollRef.current
    if (!strip) return
    const update = () => {
      const max = strip.scrollWidth - strip.clientWidth
      setCanScroll(max > 1)
      setFadeLeft(strip.scrollLeft > 1)
      setFadeRight(strip.scrollLeft < max - 1)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(strip)
    // Scroll position changes (user swipes, scrollIntoView on activation) also
    // flip the fades.
    strip.addEventListener('scroll', update, { passive: true })
    // Tab pills are children; their width changes (add/remove/rename/title
    // truncate) don't always resize the strip itself, so observe them too.
    const children = Array.from(strip.children)
    const ro2 = new ResizeObserver(update)
    children.forEach((child) => ro2.observe(child))
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      ro2.disconnect()
      strip.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [tabs])

  // A plain wheel over the tab strip scrolls it horizontally: trackpads send a
  // vertical delta (Shift+wheel is the OS-level escape hatch, but the strip is
  // itself horizontal, so steering the wheel at it should just work). Only
  // intercept when the strip can actually scroll that way, so a wheel over the
  // tabs keeps scrolling the document when the strip is fully expanded.
  useEffect(() => {
    const strip = scrollRef.current
    if (!strip) return
    const onWheel = (event) => {
      if (event.defaultPrevented || event.ctrlKey) return
      const canScroll = strip.scrollWidth > strip.clientWidth
      const wheelX = Math.abs(event.deltaX) > Math.abs(event.deltaY)
      if (!canScroll || wheelX) return
      strip.scrollLeft += event.deltaY
      event.preventDefault()
    }
    strip.addEventListener('wheel', onWheel, { passive: false })
    return () => strip.removeEventListener('wheel', onWheel)
  }, [])

  // When the active tab changes (opened a new file, switched, or restored a
  // session), the tab strip may have scrolled it out of view once the tabs
  // overflow the window width. Pull it back into the visible range so the user
  // never has to hunt/scroll for the file they just opened. `inline: 'nearest'`
  // only scrolls when it's actually off-screen and never jumps vertically.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [activeId, tabs.length])

  // Close the menu on Escape (clicks outside are handled by the backdrop).
  useEffect(() => {
    if (!menu) return
    const onKey = (e) => {
      if (e.key === 'Escape') setMenu(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu])

  const copyPath = (tab) => {
    if (tab.path) copyToClipboard(tab.path, t('code.copied'))
  }
  const copyName = (tab) => copyToClipboard(tab.title || '', t('code.copied'))
  const reveal = (tab) => {
    if (tab.path) window.api.showInFolder(tab.path)
  }

  return (
    <div className="tabs">
      <div className={`tabs-scroll${canScroll ? ' can-scroll' : ''}`} ref={scrollRef}>
        {tabs.map((tab, index) => {
          const dirty = isTabDirty(tab)
          const isLeft = tab.id === activeId
          const isRight = splitId != null && tab.id === splitId
          // Both panes' tabs are highlighted in split view; the focused pane's tab
          // gets the stronger style (that's where a tab click lands).
          const isActive = isLeft || isRight
          const focused = isRight ? focusedPane === 'right' : isLeft ? focusedPane !== 'right' : false
          return (
            <div
              key={tab.id}
              ref={isLeft ? activeRef : null}
              className={`tab${isActive ? ' active' : ''}${isActive && !focused ? ' split-peer' : ''}${dragOverIndex === index ? ' drag-over' : ''}`}
              draggable={!!onReorder && !isMobile}
              onDragStart={(e) => {
                if (e.target.closest('.tab-close')) { e.preventDefault(); return }
                dragIndexRef.current = index
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', '') // Firefox requires data
              }}
              onDragOver={(e) => { e.preventDefault(); if (dragIndexRef.current !== null && dragOverIndex !== index) setDragOverIndex(index) }}
              onDragLeave={() => { if (dragOverIndex === index) setDragOverIndex(-1) }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragIndexRef.current !== null && onReorder) onReorder(dragIndexRef.current, index)
                dragIndexRef.current = null
                setDragOverIndex(-1)
              }}
              onDragEnd={() => { dragIndexRef.current = null; setDragOverIndex(-1) }}
              onClick={() => onActivate(tab.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ x: e.clientX, y: e.clientY, tab })
              }}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault()
                  onClose(tab.id)
                }
              }}
              title={tab.path || tab.title}
            >
              <Icon className="tab-icon" name={tabFileIcon(tab)} size={13} />
              <span className="tab-title">{tab.title}</span>
              <span
                className={`tab-close${dirty ? ' dirty' : ''}`}
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(tab.id)
                }}
              >
                {dirty && !isMobile ? <span className="dot" /> : <Icon name="close" size={13} />}
              </span>
            </div>
          )
        })}
      </div>
      {/* Edge fades: shown only while content is hidden beyond that edge. They
          are pure paint (pointer-events: none, no-drag) so swipes over them
          reach the strip underneath. */}
      {canScroll && (
        <>
          <div className={`tabs-fade left${fadeLeft ? ' visible' : ''}`} aria-hidden="true" />
          <div className={`tabs-fade right${fadeRight ? ' visible' : ''}`} aria-hidden="true" />
        </>
      )}
      <button className="tab-new" title={labelWithShortcut(t('tab.new'), 'file.new', effectiveKeybindings)} onClick={onNew}>
        <Icon name="plus" size={16} />
      </button>

      {menu && (
        <>
          <div
            className="menu-backdrop"
            onMouseDown={() => setMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault()
              setMenu(null)
            }}
          />
          <div
            className="tab-ctxmenu"
            role="menu"
            style={{
              left: Math.min(menu.x, window.innerWidth - 220),
              top: Math.min(menu.y, window.innerHeight - 400)
            }}
          >
            {(() => {
              const tab = menu.tab
              const hasPath = !!tab.path
              const noPathTip = !hasPath ? t('tab.noPath') : undefined
              const run = (fn) => () => { fn(); setMenu(null) }
              return (
                <>
                  {window.api.capabilities?.splitView !== false && onOpenRight && tabs.length > 1 && (
                    <>
                      <button className="tab-menu-item" onClick={run(() => onOpenRight(tab.id))}>
                        {t('tab.openRight')}
                      </button>
                      <div className="tab-menu-sep" />
                    </>
                  )}
                  <button className="tab-menu-item" disabled={!hasPath} title={noPathTip} onClick={run(() => copyPath(tab))}>
                    {t('tab.copyPath')}
                  </button>
                  <button className="tab-menu-item" onClick={run(() => copyName(tab))}>
                    {t('tab.copyName')}
                  </button>
                  {window.api.capabilities?.revealInFolder !== false && (
                    <button className="tab-menu-item" disabled={!hasPath} title={noPathTip} onClick={run(() => reveal(tab))}>
                      {t('tab.reveal')}
                    </button>
                  )}
                  <div className="tab-menu-sep" />
                  <button className="tab-menu-item" disabled={!hasPath} title={noPathTip} onClick={run(() => onRename?.(tab.id))}>
                    {t('side.rename')}
                  </button>
                  <button className="tab-menu-item" disabled={!hasPath} title={noPathTip} onClick={run(() => onDuplicate?.(tab.id))}>
                    {t('side.duplicate')}
                  </button>
                  {hasPath && isMarkdownName(tab.title) && (
                    <ExportContextSubmenu
                      t={t}
                      itemClassName="tab-menu-item"
                      onClose={() => setMenu(null)}
                      onExportPdf={onExportPdf ? () => onExportPdf(tab.path) : undefined}
                      onExportHtml={onExportHtml ? () => onExportHtml(tab.path) : undefined}
                      onExportPandoc={onExportPandoc ? (format) => onExportPandoc(tab.path, format) : undefined}
                    />
                  )}
                  {isExcalidrawTab(tab) && window.api.capabilities?.excalidraw && (
                    <>
                      <button className="tab-menu-item" onClick={run(() => onExportExcalidraw?.(tab.id, 'png'))}>
                        {t('cmd.exportExcalidrawPng')}
                      </button>
                      <button className="tab-menu-item" onClick={run(() => onExportExcalidraw?.(tab.id, 'svg'))}>
                        {t('cmd.exportExcalidrawSvg')}
                      </button>
                    </>
                  )}
                  {isDrawioTab(tab) && window.api.capabilities?.drawio && (
                    <>
                      <button className="tab-menu-item" onClick={run(() => onExportDrawio?.(tab.id, 'png'))}>
                        {t('cmd.exportDrawioPng')}
                      </button>
                      <button className="tab-menu-item" onClick={run(() => onExportDrawio?.(tab.id, 'svg'))}>
                        {t('cmd.exportDrawioSvg')}
                      </button>
                    </>
                  )}
                  <div className="tab-menu-sep" />
                  <button className="tab-menu-item" onClick={run(() => onClose(tab.id))}>
                    {t('tab.close')}
                  </button>
                  {onCloseOthers && tabs.length > 1 && (
                    <button className="tab-menu-item" onClick={run(() => onCloseOthers(tab.id))}>
                      {t('tab.closeOthers')}
                    </button>
                  )}
                  {onDelete && (
                    <button className="tab-menu-item danger" disabled={!hasPath} title={noPathTip} onClick={run(() => onDelete(tab.id))}>
                      {t('side.delete')}
                    </button>
                  )}
                </>
              )
            })()}
          </div>
        </>
      )}
    </div>
  )
}
