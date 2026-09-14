// scripts/test-excalidraw-classify.mjs
// Run: node scripts/test-excalidraw-classify.mjs
import assert from 'node:assert/strict'
import { EXCALIDRAW_RE, isExcalidrawName, isPlainTextDoc, isMarkdownName, isHeavyDoc, isExcalidrawTab, isDrawioTab, tabSaveExt } from '../src/renderer/src/paths.js'

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

// Tab-level classification: saved tabs classify by path extension, scratch
// (pathless) flyout tabs classify by their explicit fileType marker.
assert.equal(isExcalidrawTab({ path: '/x/a.excalidraw' }), true)
assert.equal(isExcalidrawTab({ path: null, fileType: 'excalidraw' }), true)
assert.equal(isExcalidrawTab({ path: null }), false)
assert.equal(isExcalidrawTab({ path: '/x/a.md' }), false)
assert.equal(isDrawioTab({ path: '/x/a.drawio' }), true)
assert.equal(isDrawioTab({ path: null, fileType: 'drawio' }), true)
assert.equal(isDrawioTab({ path: null, fileType: 'excalidraw' }), false)
assert.equal(isDrawioTab({ path: '/x/a.excalidraw' }), false)

// Save extension: canvas kinds keep their own extension, everything else is md
assert.equal(tabSaveExt({ path: null, fileType: 'excalidraw' }), 'excalidraw')
assert.equal(tabSaveExt({ path: null, fileType: 'drawio' }), 'drawio')
assert.equal(tabSaveExt({ path: '/x/a.excalidraw' }), 'excalidraw')
assert.equal(tabSaveExt({ path: '/x/a.drawio' }), 'drawio')
assert.equal(tabSaveExt({ path: null }), 'md')
assert.equal(tabSaveExt({ path: '/x/a.md' }), 'md')

console.log('excalidraw classify: all assertions passed')