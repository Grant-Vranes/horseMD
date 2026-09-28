import { imageBlockSchema } from '@milkdown/kit/component/image-block'

const ratioPattern = /^(?:0|[1-9]\d*)(?:\.\d+)?$/

function parseLegacyRatio(value) {
  if (typeof value !== 'string' || !ratioPattern.test(value)) return null
  const ratio = Number(value)
  return Number.isFinite(ratio) && ratio > 0 ? ratio : null
}

function imageText(value) {
  return typeof value === 'string' ? value : ''
}

// Alignment is persisted inside the image's `alt` field as a trailing suffix:
// `![desc|right](url)`. Markdown has no native image alignment, and the alt
// field already carries metadata in this project (the legacy numeric resize
// ratio), so this follows the same precedent. The suffix is stripped before
// any other alt handling so legacy `![1.00](url)` ratios keep working.
const ALIGN_PATTERN = /^(.*)\|(left|center|right)$/i
const ALIGN_VALUES = new Set(['left', 'center', 'right'])

function splitAlignFromAlt(rawAlt) {
  const match = ALIGN_PATTERN.exec(imageText(rawAlt))
  if (!match) return { alt: imageText(rawAlt), align: 'center' }
  const align = match[2].toLowerCase()
  return ALIGN_VALUES.has(align) ? { alt: match[1], align } : { alt: imageText(rawAlt), align: 'center' }
}

function joinAlignIntoAlt(alt, align) {
  return align === 'left' || align === 'right' ? `${alt}|${align}` : alt
}

// Crepe's image-block component uses Markdown's image `alt` field to persist
// its resize ratio and puts the visible caption in `title`. That rewrites a
// normal `![description](url)` as `![1.00](url)` after the next rich edit.
// Keep an explicit alt attribute in the ProseMirror node, while still reading
// the numeric syntax emitted by earlier HorseMD versions for resized images.
export const imageBlockMarkdownSchema = imageBlockSchema.extendSchema((prev) => (ctx) => {
  const schema = prev(ctx)

  return {
    ...schema,
    attrs: {
      ...schema.attrs,
      src: { default: '', validate: 'string' },
      align: { default: 'center', validate: 'string' },
      alt: { default: '', validate: 'string' }
    },
    parseMarkdown: {
      match: ({ type }) => type === 'image-block',
      runner: (state, node, type) => {
        const title = imageText(node.title)
        const { alt, align } = splitAlignFromAlt(node.alt)
        const legacyRatio = parseLegacyRatio(alt)
        const isLegacyImage = legacyRatio !== null && Boolean(title)

        state.addNode(type, {
          src: imageText(node.url),
          alt: isLegacyImage ? '' : alt,
          caption: isLegacyImage ? title : title || alt,
          ratio: legacyRatio ?? 1,
          align
        })
      }
    },
    toMarkdown: {
      match: (node) => node.type.name === 'image-block',
      runner: (state, node) => {
        const alt = imageText(node.attrs.alt)
        const caption = imageText(node.attrs.caption)
        const ratio = Number(node.attrs.ratio)
        const align = ALIGN_VALUES.has(node.attrs.align) ? node.attrs.align : 'center'
        const resized = Number.isFinite(ratio) && ratio > 0 && Math.abs(ratio - 1) > 0.001

        // The align suffix rides in alt; the legacy numeric ratio keeps its
        // exact-match shape when alignment is default (center).
        const baseAlt = resized ? ratio.toFixed(2) : alt || caption
        const altWithAlign = joinAlignIntoAlt(baseAlt, align)

        state.openNode('paragraph')
        state.addNode('image', undefined, undefined, {
          url: imageText(node.attrs.src),
          alt: altWithAlign,
          title: resized ? caption || undefined : caption && caption !== alt ? caption : undefined
        })
        state.closeNode()
      }
    }
  }
})
