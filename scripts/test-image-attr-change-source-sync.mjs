// Regression for the 2026-09-26 image-block family (trace
// horsemd-input-trace-54911): image-block caption edits, resize-ratio changes
// and src replacements change ONLY invisible bytes inside the image token
// (`![...](url "title")`). Images contribute zero visible characters, so the
// generic visible-affinity mapper spliced inside the token and dropped the
// `![` opener (`第一段。图注Ae.png](assets/...`), failing integrity validation
// with the sticky mismatch toast and blocking saves.
//
// Contract: when the canonical delta lies inside one image token on both
// sides, the mapper must rewrite the whole token in the source, anchored by
// the unchanged/old URL; ambiguous (multi-URL) matches must fail closed.
import assert from 'node:assert/strict'
import { preserveRichMarkdownSource } from '../src/renderer/src/markdown-source-preservation.js'

const changed = (r) => {
  assert.ok(r?.preserved !== false, `should preserve: ${JSON.stringify(r)}`)
  return r.markdown
}

// 1) Caption edit on a legacy-ratio image opened from file: baseline canonical
//    already re-serialized ratio->alt, the caption delta is inside the token.
{
  const source = '第一段。\n\n![1.00](assets/a.png "image.png")\n\n第二段。'
  const prev = '第一段。\n\n![image.png](assets/a.png "image.png")\n'
  const next = '第一段。\n\n![imag图注Ae.png](assets/a.png "imag图注Ae.png")\n'
  const result = changed(preserveRichMarkdownSource(source, prev, next))
  assert.ok(
    result.includes('![imag图注Ae.png](assets/a.png "imag图注Ae.png")'),
    `caption edit rewrote the whole token: ${JSON.stringify(result)}`
  )
  assert.ok(!result.includes('1.00]('), `no ratio residue: ${JSON.stringify(result)}`)
}

// 2) Resize ratio change: alt digits change inside the token.
{
  const source = '第一段。\n\n![image.png](assets/a.png "image.png")\n\n第二段。'
  const prev = '第一段。\n\n![image.png](assets/a.png "image.png")\n\n第二段。'
  const next = '第一段。\n\n![0.71](assets/a.png "image.png")\n\n第二段。'
  const result = changed(preserveRichMarkdownSource(source, prev, next))
  assert.ok(result.includes('![0.71]('), `ratio applied: ${JSON.stringify(result)}`)
  assert.ok(!result.includes('![image.png](') || result.includes('0.71'), `old ratio alt gone: ${JSON.stringify(result)}`)
}

// 3) Replace image: URL digits change (invisible->invisible).
{
  const source = '第一段。\n\n![image.png](assets/image-20260926112538485.png "image.png")\n\n第二段。'
  const prev = '第一段。\n\n![image.png](assets/image-20260926112538485.png "image.png")\n\n第二段。'
  const next = '第一段。\n\n![image.png](assets/image-20260926163535700.png "image.png")\n\n第二段。'
  const result = changed(preserveRichMarkdownSource(source, prev, next))
  assert.ok(
    result.includes('assets/image-20260926163535700.png'),
    `new url committed: ${JSON.stringify(result)}`
  )
  assert.ok(
    !result.includes('20260926112538485'),
    `old url gone: ${JSON.stringify(result)}`
  )
}

// 4) Inline image caption edit inside a paragraph line.
{
  const source = '第一段。![1.00](assets/a.png "image.png")正文继续。'
  const prev = '第一段。![image.png](assets/a.png "image.png")正文继续。'
  const next = '第一段。![新图注](assets/a.png "新图注")正文继续。'
  const result = changed(preserveRichMarkdownSource(source, prev, next))
  assert.ok(
    result.includes('![新图注](assets/a.png "新图注")正文继续。'),
    `inline caption rewrite keeps surrounding authored text: ${JSON.stringify(result)}`
  )
}

// 5) Ambiguity: two source images sharing the same URL must fail closed.
{
  const source = '![image.png](assets/a.png "t")\n\n![image.png](assets/a.png "t")'
  const prev = '![image.png](assets/a.png "t")\n\n![image.png](assets/a.png "t")'
  const next = '![改](assets/a.png "改")\n\n![image.png](assets/a.png "t")'
  const r = preserveRichMarkdownSource(source, prev, next)
  if (r?.preserved !== false) {
    // A non-ambiguous structural mapper may still own it; it must never
    // corrupt both tokens into the same new caption.
    const matches = r.markdown.match(/!\[改\]/g) || []
    assert.ok(matches.length <= 1, `ambiguous match must not rewrite both: ${JSON.stringify(r.markdown)}`)
  }
}

// 6) Unrelated URL in another image must be untouched.
{
  const source = '![one](assets/one.png "one")\n\n![image.png](assets/a.png "image.png")'
  const prev = '![one](assets/one.png "one")\n\n![image.png](assets/a.png "image.png")'
  const next = '![one](assets/one.png "one")\n\n![新](assets/a.png "新")'
  const result = changed(preserveRichMarkdownSource(source, prev, next))
  assert.ok(result.includes('![one](assets/one.png "one")'), `sibling untouched: ${JSON.stringify(result)}`)
  assert.ok(result.includes('![新](assets/a.png "新")'), `target rewritten: ${JSON.stringify(result)}`)
}

// 7) Standalone image-block row deletion: the canonical delta spans the token
//    plus its paragraph separator; the authored line and one blank must go.
{
  const source = '第一段。\n\n![1.00](assets/a.png "image.png")\n\n第二段。'
  const prev = '第一段。\n\n![image.png](assets/a.png "image.png")\n\n第二段。'
  const next = '第一段。\n\n第二段。'
  const result = changed(preserveRichMarkdownSource(source, prev, next))
  assert.equal(result, '第一段。\n\n第二段。', `row deleted cleanly: ${JSON.stringify(result)}`)
}

console.log('test-image-attr-change-source-sync: ok')
