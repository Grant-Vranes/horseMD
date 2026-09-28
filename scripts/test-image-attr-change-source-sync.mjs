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

// 8) Same src URL reused 2+ times (common: same local asset embedded twice on an
//    already-diverged baseline): editing ONE duplicate must rewrite only that
//    occurrence (by ordinal rank with byte-identical same-rank proof), never let
//    the generic mapper splice alt bytes into a nearby visible line — the
//    align/caption/replace/delete family regression from repro-image-dupe-url.
{
  const source = '# t\n\n+ 项目甲\n+ 项目乙\n\n![测试](img/a.png)\n\n![测试](img/a.png)\n\n正文'
  const prev = '# t\n\n* 项目甲\n* 项目乙\n\n![测试](img/a.png)\n\n![测试](img/a.png)\n\n正文'
  // edit the FIRST duplicate (align-right persisted via alt suffix)
  const firstOnly = changed(preserveRichMarkdownSource(
    source, prev,
    '# t\n\n* 项目甲\n* 项目乙\n\n![测试|right](img/a.png)\n\n![测试](img/a.png)\n\n正文'
  ))
  assert.ok(firstOnly.includes('+ 项目甲'), `authored list marker intact: ${JSON.stringify(firstOnly)}`)
  assert.ok(!firstOnly.includes('项目甲|right'), `no splice into list text: ${JSON.stringify(firstOnly)}`)
  assert.match(firstOnly, /\n\n!\[测试\|right\]\(img\/a\.png\)\n\n!\[测试\]\(img\/a\.png\)\n\n正文$/, `first duplicate rewritten only: ${JSON.stringify(firstOnly)}`)
  // edit the SECOND duplicate
  const secondOnly = changed(preserveRichMarkdownSource(
    source, prev,
    '# t\n\n* 项目甲\n* 项目乙\n\n![测试](img/a.png)\n\n![测试|right](img/a.png)\n\n正文'
  ))
  assert.match(secondOnly, /\n\n!\[测试\]\(img\/a\.png\)\n\n!\[测试\|right\]\(img\/a\.png\)\n\n正文$/, `second duplicate rewritten only: ${JSON.stringify(secondOnly)}`)
  // caption first duplicate
  const capOnly = changed(preserveRichMarkdownSource(
    source, prev,
    '# t\n\n* 项目甲\n* 项目乙\n\n![新图](img/a.png)\n\n![测试](img/a.png)\n\n正文'
  ))
  assert.match(capOnly, /\n\n!\[新图\]\(img\/a\.png\)\n\n!\[测试\]\(img\/a\.png\)\n\n正文$/, `caption on first duplicate: ${JSON.stringify(capOnly)}`)
  // delete the SECOND duplicate row
  const delOnly = changed(preserveRichMarkdownSource(
    source, prev,
    '# t\n\n* 项目甲\n* 项目乙\n\n![测试](img/a.png)\n\n正文'
  ))
  assert.equal(delOnly, '# t\n\n+ 项目甲\n+ 项目乙\n\n![测试](img/a.png)\n\n正文', `duplicate row deleted cleanly: ${JSON.stringify(delOnly)}`)
}
// 9) Duplicate URLs on a divergent ORDER (source vs baseline rank differ) or a
//    count mismatch must still fail closed, never claim a wrong same-rank token.
{
  // order diverged: source [甲,乙] vs baseline [乙,甲], edit baseline first (乙)
  const badOrder = preserveRichMarkdownSource(
    '# t\n\n![甲](img/x.png)\n\n![乙](img/x.png)\n\n正文',
    '# t\n\n![乙](img/x.png)\n\n![甲](img/x.png)\n\n正文',
    '# t\n\n![乙|right](img/x.png)\n\n![甲](img/x.png)\n\n正文'
  )
  if (badOrder?.preserved !== false && badOrder?.reason === 'image-token-change') {
    assert.fail(`order-diverged dup must not claim image-token-change: ${JSON.stringify(badOrder)}`)
  }
  // count mismatch: source 2 dups, baseline 3 dups
  const countMismatch = preserveRichMarkdownSource(
    '# t\n\n![a](img/x.png)\n\n![b](img/x.png)\n\n正文',
    '# t\n\n![a](img/x.png)\n\n![b](img/x.png)\n\n![c](img/x.png)\n\n正文',
    '# t\n\n![a](img/x.png)\n\n![b](img/x.png)\n\n![右](img/x.png)\n\n正文'
  )
  if (countMismatch?.preserved !== false && countMismatch?.reason === 'image-token-change') {
    assert.fail(`count-mismatch dup must not claim image-token-change: ${JSON.stringify(countMismatch)}`)
  }
}
// 10) Clicking 居中 on an image that currently carries a `|left`/`|right` align
//     suffix removes that suffix — a STRICT sub-token deletion inside one image
//     token (no visible bytes). It must strip the suffix from ONLY the targeted
//     occurrence, never let a structural mapper duplicate sibling image lines
//     (repro-image-dupe-center).
{
  const src = '# t\n\n+ 甲\n+ 乙\n\n![测试|right](img/a.png)\n\n![测试|right](img/a.png)\n\n正文'
  const prev = '# t\n\n* 甲\n* 乙\n\n![测试|right](img/a.png)\n\n![测试|right](img/a.png)\n\n正文'
  // center the FIRST duplicate -> strip only its `|right`
  const first = changed(preserveRichMarkdownSource(
    src, prev, '# t\n\n* 甲\n* 乙\n\n![测试](img/a.png)\n\n![测试|right](img/a.png)\n\n正文'
  ))
  assert.match(first, /\n\n!\[测试\]\(img\/a\.png\)\n\n!\[测试\|right\]\(img\/a\.png\)\n\n正文$/, `center strips first duplicate suffix: ${JSON.stringify(first)}`)
  assert.ok(first.includes('+ 甲'), `authored marker intact: ${JSON.stringify(first)}`)
  // center the SECOND duplicate
  const second = changed(preserveRichMarkdownSource(
    src, prev, '# t\n\n* 甲\n* 乙\n\n![测试|right](img/a.png)\n\n![测试](img/a.png)\n\n正文'
  ))
  assert.match(second, /\n\n!\[测试\|right\]\(img\/a\.png\)\n\n!\[测试\]\(img\/a\.png\)\n\n正文$/, `center strips second duplicate suffix: ${JSON.stringify(second)}`)
  // center a single authored-|right image
  const single = changed(preserveRichMarkdownSource(
    '# t\n\n+ 甲\n+ 乙\n\n![测试|right](img/single.png)\n\n正文',
    '# t\n\n* 甲\n* 乙\n\n![测试|right](img/single.png)\n\n正文',
    '# t\n\n* 甲\n* 乙\n\n![测试](img/single.png)\n\n正文'
  ))
  assert.match(single, /\n\n!\[测试\]\(img\/single\.png\)\n\n正文$/, `center strips single suffix: ${JSON.stringify(single)}`)
  assert.ok(!/!\[测试\|right\]/.test(single), `no right-suffix residue: ${JSON.stringify(single)}`)
  // Fail closed when the source target token differs from the baseline token at
  // the same spot: the relative splice would be invalid, so no image claim.
  const diverged = preserveRichMarkdownSource(
    '# t\n\n![甲|right](img/x.png)\n\n正文',
    '# t\n\n![乙|right](img/x.png)\n\n正文',
    '# t\n\n![乙](img/x.png)\n\n正文'
  )
  if (diverged?.preserved !== false && diverged?.reason === 'image-token-change') {
    assert.fail(`partial-deletion on byte-diverged target must not claim image-token-change: ${JSON.stringify(diverged)}`)
  }
}

console.log('test-image-attr-change-source-sync: ok')
