// Hover "remove image" button for block images (rich view only).
//
// Crepe's image-block is an atom node rendered by a Vue node view WITHOUT a
// contentDOM, so in-node widget decorations never render. Instead this plugin
// keeps ONE fixed-position button element and shows it right-aligned just
// below the hovered block's Crepe operation row (same 32px circular style),
// never overlapping it.
//
// The button is editor chrome only — it never enters the ProseMirror document,
// and clipboard/PDF paths strip `.hm-image-remove` (see editor-dom-content.js /
// editor-pdf-content.js). Clicking deletes the image node as a real user edit,
// flowing through the normal markdownUpdated/save pipeline.

import { Plugin, PluginKey } from '@milkdown/prose/state'

export const imageRemoveKey = new PluginKey('hm-image-remove')

const BLOCK_SELECTOR = '.milkdown-image-block'
const BUTTON_CLASS = 'hm-image-remove'

function createButtonElement(onRemove) {
  const el = document.createElement('button')
  el.type = 'button'
  el.className = BUTTON_CLASS
  el.title = '移除图片'
  el.setAttribute('aria-label', '移除图片')
  el.contentEditable = 'false'
  // Trash icon in Crepe's stroke-icon style.
  el.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
    '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>' +
    '<path d="M10 11v6"/><path d="M14 11v6"/></svg>'
  // Keep the button outside ProseMirror's event flow entirely.
  el.addEventListener('mousedown', (event) => {
    event.preventDefault()
    event.stopPropagation()
  })
  el.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    onRemove()
  })
  return el
}

export function createImageRemoveButtonPlugin({ isReadOnly } = {}) {
  let hoveredBlock = null

  const hide = () => {
    hoveredBlock = null
    button.classList.remove('visible')
  }

  const removeHoveredImage = () => {
    const view = pluginView
    const blockEl = hoveredBlock
    hide()
    if (!view || !blockEl || isReadOnly?.()) return
    const imageBlockType = view.state.schema.nodes['image-block']
    if (!imageBlockType) return
    let deleted = false
    view.state.doc.descendants((node, pos) => {
      if (deleted || node.type !== imageBlockType) return true
      if (view.nodeDOM(pos) === blockEl) {
        view.dispatch(view.state.tr.delete(pos, pos + node.nodeSize))
        deleted = true
        return false
      }
      return true
    })
  }

  const button = createButtonElement(removeHoveredImage)

  const showFor = (blockEl) => {
    const view = pluginView
    if (!view || isReadOnly?.()) return
    const image = blockEl.querySelector('img')
    const rect = (image || blockEl).getBoundingClientRect()
    if (!rect.width && !rect.height) return
    hoveredBlock = blockEl
    // Right-aligned directly below Crepe's operation row (caption toggle at
    // the image's top-right) so the two controls stack without overlapping.
    const operation = blockEl.querySelector('.operation')
    const opRect = operation?.getBoundingClientRect()
    if (opRect && opRect.width) {
      button.style.top = `${Math.round(opRect.bottom + 8)}px`
      button.style.left = `${Math.round(opRect.right - 32)}px`
    } else {
      button.style.top = `${Math.round(rect.top + 6)}px`
      button.style.left = `${Math.round(rect.right - 32)}px`
    }
    button.classList.add('visible')
  }

  // Reposition while the hovered image moves under the cursor (scroll inside
  // the editor, page scroll, window resize).
  const reposition = () => {
    if (hoveredBlock && button.classList.contains('visible')) {
      if (!hoveredBlock.isConnected) hide()
      else showFor(hoveredBlock)
    }
  }

  let pluginView = null

  const onEditorMouseOver = (event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest(`.${BUTTON_CLASS}`)) return
    const block = target.closest(BLOCK_SELECTOR)
    if (block && pluginView && pluginView.dom.contains(block)) showFor(block)
    else if (hoveredBlock) hide()
  }
  const onEditorMouseLeave = (event) => {
    // Moving onto the remove button itself (it lives outside view.dom) fires
    // mouseleave on the editor — keep the button visible in that case, or the
    // click would land on a hidden, pointer-events:none element.
    if (event.relatedTarget?.closest?.(`.${BUTTON_CLASS}`)) return
    hide()
  }

  return new Plugin({
    key: imageRemoveKey,
    view(editorView) {
      pluginView = editorView
      // Sits next to the editor DOM (outside .ProseMirror) so it never becomes
      // part of editor content. One button per editor instance (lazy-mounted
      // tabs each own one).
      const host = editorView.dom.parentElement || document.body
      host.appendChild(button)
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
          button.remove()
          if (pluginView === editorView) pluginView = null
        }
      }
    }
  })
}
