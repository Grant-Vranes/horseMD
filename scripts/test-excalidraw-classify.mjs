// scripts/test-excalidraw-classify.mjs
// Run: node scripts/test-excalidraw-classify.mjs
import assert from 'node:assert/strict'
import { EXCALIDRAW_RE, isExcalidrawName, isPlainTextDoc, isMarkdownName, isHeavyDoc } from '../src/renderer/src/paths.js'

// isExcalidrawName
assert.equal(isExcalidrawName('a.excalidraw'), true)
assert.equal(isExcalidrawName('/x/y/A.EXCALIDRAW'), true)
assert.equal(isExcalidrawName('a.md'), false)
assert.equal(isExcalidrawName('a.excalidraw.md'), false)
assert.equal(isExcalidrawName(''), false)
assert.equal(isExcalidrawName(null), false)
assert.ok(EXCALIDRAW_RE.test('b.excalidraw'))

// isPlainTextDoc must NOT capture .excalidraw (textarea would steal the tab)
assert.equal(isPlainTextDoc({ path: '/x/a.excalidraw' }), false)
assert.equal(isPlainTextDoc({ path: '/x/a.txt' }), true)
assert.equal(isPlainTextDoc({ path: '/x/a.md' }), false)
assert.equal(isPlainTextDoc({ path: null }), false)

// untouched invariants
assert.equal(isMarkdownName('/x/a.md'), true)
assert.equal(isHeavyDoc(''), false)

console.log('excalidraw classify: all assertions passed')