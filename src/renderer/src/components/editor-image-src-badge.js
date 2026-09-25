// Show a small, always-visible path badge under every rendered image (rich
// view only). The badge is a widget decoration — it never enters the
// ProseMirror document, so serialization, saves, and dirty tracking are
// untouched. Clipboard/HTML-copy and PDF-export paths strip `.hm-image-src-*`
// nodes explicitly (see editor-dom-content.js / editor-pdf-content.js).

import { Plugin, PluginKey } from '@milkdown/prose/state'
import { Decoration, DecorationSet } from '@milkdown/prose/view'

export const imageSrcBadgeKey = new PluginKey('hm-image-src-badge')

const BADGE_CLASS = 'hm-image-src-badge'
const MAX_TEXT = 56
const HEAD = 28
const TAIL = 24
const EMBEDDED_PREFIX = 'data:'

// Middle-truncate a long path, keeping the head (host/leading folders) and the
// tail (filename) visible; the full value stays on the title tooltip.
function badgeText(src) {
  if (src.length <= MAX_TEXT) return src
  return src.slice(0, HEAD) + '…' + src.slice(-TAIL)
}

function badgeLabel(src, embeddedLabel) {
  if (src.startsWith(EMBEDDED_PREFIX)) return embeddedLabel
  return badgeText(src)
}

function createBadgeElement(src, embeddedLabel) {
  const el = document.createElement('span')
  el.className = BADGE_CLASS
  el.textContent = badgeLabel(src, embeddedLabel)
  el.title = src
  el.setAttribute('data-hm-image-src', src)
  // Decoration widgets are not part of the editable content; make sure they
  // can never become a selection/copy source or a caret target.
  el.contentEditable = 'false'
  return el
}

function buildDecorations(doc, schema, { embeddedLabel }) {
  const decorations = []
  const imageBlockType = schema.nodes['image-block']
  const imageType = schema.nodes['image']
  if (!imageBlockType && !imageType) return DecorationSet.empty

  doc.descendants((node, pos) => {
    if ((imageBlockType && node.type === imageBlockType) || (imageType && node.type === imageType)) {
      const src = String(node.attrs.src || '')
      if (!src) return
      const inline = node.type === imageType && !node.type.isBlock
      const el = createBadgeElement(src, embeddedLabel)
      if (inline) el.classList.add('hm-image-src-inline')
      decorations.push(
        Decoration.widget(pos + node.nodeSize, () => el, {
          side: 1,
          // Keep the widget out of serializations and ignore-mutation paths;
          // it is display-only.
          marks: [],
          key: `hm-src-badge:${src}`
        })
      )
    }
    return true
  })
  return DecorationSet.create(doc, decorations)
}

export function createImageSrcBadgePlugin({ getEnabled, getEmbeddedLabel }) {
  const enabled = () => (getEnabled ? getEnabled() !== false : true)
  const label = () => (getEmbeddedLabel ? getEmbeddedLabel() : '(内嵌图片)')

  return new Plugin({
    key: imageSrcBadgeKey,
    state: {
      init(_, state) {
        return {
          enabled: enabled(),
          decorations: enabled()
            ? buildDecorations(state.doc, state.schema, { embeddedLabel: label() })
            : DecorationSet.empty
        }
      },
      apply(tr, prev, _old, newState) {
        const meta = tr.getMeta(imageSrcBadgeKey)
        const nowEnabled = enabled()
        const enabledChanged = nowEnabled !== prev.enabled
        if (!tr.docChanged && !enabledChanged && !meta?.refresh) return prev
        const wasEnabled = prev.enabled
        const state = { enabled: nowEnabled }
        // When only the enabled flag flipped off, drop everything without a
        // full rebuild; otherwise recompute from the new doc.
        state.decorations = nowEnabled
          ? buildDecorations(newState.doc, newState.schema, { embeddedLabel: label() })
          : wasEnabled && !nowEnabled
            ? DecorationSet.empty
            : prev.decorations
        return state
      }
    },
    props: {
      decorations(state) {
        return imageSrcBadgeKey.getState(state)?.decorations || DecorationSet.empty
      }
    }
  })
}
