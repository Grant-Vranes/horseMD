// Hover "align image" button group for block images (rich view only).
//
// Mirrors editor-image-remove-button.js: Crepe's image-block is an atom node
// rendered by a Vue node view WITHOUT a contentDOM, so in-node widgets never
// render. This plugin keeps ONE fixed-position button group and shows it at
// the hovered image's top-left corner with three 32px circular buttons
// (left / center / right), matching Crepe's operation-row style.
//
// The buttons are editor chrome only — they never enter the ProseMirror
// document. Clicking dispatches a real setNodeAttribute edit on the node's
// `align` attr, which flows through the normal markdownUpdated/save pipeline
// and is persisted in markdown via the alt suffix (see
// editor-image-markdown.js: `![alt|right](url)`).
//
// Visible alignment is applied by a node decoration that adds
// `.hm-align-left|center|right` to the .milkdown-image-block element; the CSS
// lives in app.css (Crepe centers .image-wrapper by default, so only the
// left/right variants need rules).

import { Plugin, PluginKey } from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'

export const imageAlignKey = new PluginKey('hm-image-align')

const BLOCK_SELECTOR = '.milkdown-image-block'
const GROUP_CLASS = 'hm-image-align'

const ICONS = {
  left:
    '<svg viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" ' +
    'stroke-linecap="round" aria-hidden="true">' +
    '<path d="M4 5h16" stroke="#FFFFFF"/><path d="M4 10h10" stroke="#FFFFFF"/>' +
    '<path d="M4 15h16" stroke="#FFFFFF"/><path d="M4 20h10" stroke="#FFFFFF"/></svg>',
  center:
    '<svg viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" ' +
    'stroke-linecap="round" aria-hidden="true">' +
    '<path d="M4 5h16" stroke="#FFFFFF"/><path d="M7 10h10" stroke="#FFFFFF"/>' +
    '<path d="M4 15h16" stroke="#FFFFFF"/><path d="M7 20h10" stroke="#FFFFFF"/></svg>',
  right:
    '<svg viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" ' +
    'stroke-linecap="round" aria-hidden="true">' +
    '<path d="M4 5h16" stroke="#FFFFFF"/><path d="M10 10h10" stroke="#FFFFFF"/>' +
    '<path d="M4 15h16" stroke="#FFFFFF"/><path d="M10 20h10" stroke="#FFFFFF"/></svg>'
}

const ALIGN_TITLE = {
  left: '图片居左',
  center: '图片居中',
  right: '图片居右'
}

function createAlignButton(align, onAlign) {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = `${GROUP_CLASS}-item`
  el.dataset.align = align
  el.title = ALIGN_TITLE[align]
  el.setAttribute('aria-label', ALIGN_TITLE[align])
  el.contentEditable = 'false'
  el.innerHTML = ICONS[align]
  // Keep the buttons outside ProseMirror's event flow entirely.
  el.addEventListener('mousedown', (event) => {
    event.preventDefault()
    event.stopPropagation()
  })
  el.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    onAlign(align)
  })
  return el
}

export function createImageAlignButtonsPlugin({ isReadOnly, markUserEdit } = {}) {
  let hoveredBlock = null

  const hide = () => {
    hoveredBlock = null
    group.classList.remove('visible')
  }

  const setAlignment = (align) => {
    const view = pluginView
    const blockEl = hoveredBlock
    if (!view || !blockEl || isReadOnly?.()) return
    view.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'image-block') return true
      if (view.nodeDOM(pos) === blockEl) {
        // Raise the user-edit TTL BEFORE dispatching. The source-sync pipeline
        // gates its markdownUpdated commit on hasRecentUserEdit(); a dispatch
        // without that mark leaves the baseline stale and the next forced
        // flush/save fails closed with the source-sync mismatch toast.
        markUserEdit?.()
        view.dispatch(view.state.tr.setNodeAttribute(pos, 'align', align))
        markActive(align)
        return false
      }
      return true
    })
  }

  const markActive = (align) => {
    for (const btn of group.children) {
      btn.classList.toggle('active', btn.dataset.align === align)
    }
  }

  const group = document.createElement('div')
  group.className = GROUP_CLASS
  group.contentEditable = 'false'
  for (const align of ['left', 'center', 'right']) {
    group.appendChild(createAlignButton(align, setAlignment))
  }
  // Moving between the group's own children must not hide it (they are the
  // mouseover target, not the editor).
  group.addEventListener('mouseover', (event) => event.stopPropagation())

  const showFor = (blockEl) => {
    const view = pluginView
    if (!view || isReadOnly?.()) return
    const image = blockEl.querySelector('img')
    const rect = (image || blockEl).getBoundingClientRect()
    if (!rect.width && !rect.height) return
    hoveredBlock = blockEl
    // Top-left corner inside the image, mirroring the remove button's
    // top-right corner placement so the two chrome groups never overlap.
    group.style.top = `${Math.round(rect.top + 6)}px`
    group.style.left = `${Math.round(rect.left + 6)}px`
    // Reflect the node's current alignment on the active button.
    let current = 'center'
    view.state.doc.descendants((node, pos) => {
      if (node.type.name !== 'image-block') return true
      if (view.nodeDOM(pos) === blockEl) {
        current = node.attrs.align || 'center'
        return false
      }
      return true
    })
    markActive(current)
    group.classList.add('visible')
  }

  // Reposition while the hovered image moves under the cursor (scroll inside
  // the editor, page scroll, window resize).
  const reposition = () => {
    if (hoveredBlock && group.classList.contains('visible')) {
      if (!hoveredBlock.isConnected) hide()
      else showFor(hoveredBlock)
    }
  }

  let pluginView = null

  const onEditorMouseOver = (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const block = target.closest(BLOCK_SELECTOR)
    if (block && pluginView && pluginView.dom.contains(block)) showFor(block)
    else if (hoveredBlock) hide()
  }
  const onEditorMouseLeave = (event) => {
    // Moving onto the align group itself (it lives outside view.dom) fires
    // mouseleave on the editor — keep the group visible in that case, or the
    // click would land on a hidden, pointer-events:none element.
    if (event.relatedTarget?.closest?.(`.${GROUP_CLASS}`)) return
    hide()
  }

  return new Plugin({
    key: imageAlignKey,
    props: {
      // Map the node's `align` attr onto a class so plain CSS can position
      // the image without touching Crepe's Vue node view.
      decorations(state) {
        const decos = []
        state.doc.descendants((node, pos) => {
          if (node.type.name !== 'image-block') return true
          const align = node.attrs.align
          if (align === 'left' || align === 'right') {
            decos.push(
              Decoration.node(pos, pos + node.nodeSize, {
                class: `hm-align-${align}`
              })
            )
          }
          return true
        })
        if (!decos.length) return DecorationSet.empty
        return DecorationSet.create(state.doc, decos)
      }
    },
    view(editorView) {
      pluginView = editorView
      // Sits next to the editor DOM (outside .ProseMirror) so it never becomes
      // part of editor content. One group per editor instance (lazy-mounted
      // tabs each own one).
      const host = editorView.dom.parentElement || document.body
      host.appendChild(group)
      // ProseMirror only registers its own known event set from
      // handleDOMEvents; mouseover is not among them, so listen directly.
      editorView.dom.addEventListener('mouseover', onEditorMouseOver, true)
      editorView.dom.addEventListener('mouseleave', onEditorMouseLeave)
      window.addEventListener('scroll', reposition, true)
      window.addEventListener('resize', reposition)
      return {
        destroy() {
          editorView.dom.removeEventListener('mouseover', onEditorMouseOver, true)
          editorView.dom.removeEventListener('mouseleave', onEditorMouseLeave)
          window.removeEventListener('scroll', reposition, true)
          window.removeEventListener('resize', reposition)
          group.remove()
          if (pluginView === editorView) pluginView = null
        }
      }
    }
  })
}
