// Reproduction for the 0.13.25x image-paste corruption trace (horsemd-input-trace-43946):
// replacing one persisted image with another whose filename differs only inside
// the invisible URL region reduced the canonical delta to the filename digits.
// The visible-affinity mapper spliced those digits after the preceding heading
// (`## 合集概览101635357`) because images carry zero visible characters, so the
// changed region's visible position collapsed onto the heading text boundary.
import assert from 'node:assert/strict'
import { preserveRichMarkdownSource } from '../src/renderer/src/markdown-source-preservation.js'
import {
  preserveLocallyAlignedTextChange
} from '../src/renderer/src/lib/markdown-preservation/regions.js'

const source = [
  '# RAG知识库搭建系统教程 · 100集内容全总结',
  '',
  '## 合集概览',
  '',
  '![image.png](RAG知识库搭建教程100集内容总结.assets/image-20260926091917996.png)',
  '',
  '本教程是一套系统化课程。'
].join('\n')

// The pasted image replaced the previous one: canonical changes only the
// invisible URL digits (images have no visible text).
const next = source.replace('image-20260926091917996.png', 'image-20260926101635357.png')
assert.notEqual(source, next)

const start = next.indexOf('image-20260926') + 'image-20260926'.length
const previousEnd = start + '091917996'.length
const nextEnd = start + '101635357'.length

// Direct mapper contract: the digits must land inside the image URL line, or
// the mapper must fail closed — never after the heading.
const direct = preserveLocallyAlignedTextChange({
  source,
  previous: source,
  next,
  start,
  previousEnd,
  nextEnd
})
if (direct?.preserved) {
  assert.ok(
    !direct.markdown.includes('合集概览101635357'),
    `locally-aligned mapper polluted the heading: ${JSON.stringify(direct.markdown)}`
  )
  assert.ok(
    direct.markdown.includes('image-20260926101635357.png'),
    'invisible URL delta must be applied inside the image line when uniquely anchored'
  )
}

// Full preservation entry point, diverged-visible-stream branch: an unrelated
// visible divergence (正文A vs 正文 A) must not stop the invisible image-URL
// delta from being applied inside the image line.
const divergedSource = source.replace('本教程是一套系统化课程。', '正文A')
const divergedPrevious = source.replace('本教程是一套系统化课程。', '正文 A')
const divergedNext = divergedPrevious.replace(
  'image-20260926091917996.png',
  'image-20260926101635357.png'
)
const diverged = preserveRichMarkdownSource(divergedSource, divergedPrevious, divergedNext)
assert.ok(diverged?.preserved !== false, 'diverged image-URL delta must preserve')
assert.ok(
  diverged.markdown.includes('image-20260926101635357.png') &&
    !diverged.markdown.includes('合集概览101635357') &&
    diverged.markdown.includes('正文A'),
  `diverged branch result: ${JSON.stringify(diverged.markdown)} (reason ${diverged.reason})`
)

// Full preservation entry point (diverged-visible-stream branch included).
const preserved = preserveRichMarkdownSource(source, source, next)
if (preserved?.preserved !== false) {
  assert.ok(
    !preserved.markdown.includes('合集概览101635357'),
    `preservation polluted the heading via ${preserved.reason}: ${JSON.stringify(preserved.markdown)}`
  )
}
console.log('test-image-src-invisible-delta: ok')
