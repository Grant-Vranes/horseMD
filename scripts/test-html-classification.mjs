import assert from 'node:assert/strict'
import {
  isHtmlName, isHtmlTab, isCodeName, isCodeDoc, isPlainTextDoc,
  HTML_RENDER_MAX_BYTES, shouldAutoRenderHtml
} from '../src/renderer/src/paths.js'

assert.ok(isHtmlName('page.html'))
assert.ok(isHtmlName('page.htm'))
assert.ok(!isHtmlName('page.md'))
assert.ok(!isCodeName('page.html'), 'html must leave the CodeMirror classification')
assert.ok(!isCodeName('page.htm'))
assert.ok(isHtmlTab({ path: '/a/b.html' }))
assert.ok(isHtmlTab({ path: null, fileType: 'html' }))
assert.ok(!isHtmlTab({ path: '/a/b.md' }))
assert.ok(!isCodeDoc({ path: '/a/b.html' }))
assert.ok(isPlainTextDoc({ path: '/a/b.txt' }))
assert.ok(!isPlainTextDoc({ path: '/a/b.html' }), 'html must not fall into the textarea')
assert.equal(HTML_RENDER_MAX_BYTES, 2 * 1024 * 1024)
assert.ok(shouldAutoRenderHtml('<p>hi</p>'))
assert.ok(!shouldAutoRenderHtml('x'.repeat(HTML_RENDER_MAX_BYTES + 1)))
console.log('test-html-classification OK')
