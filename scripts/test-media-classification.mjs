// Regression guard: media files must classify as viewers, NOT plain text —
// otherwise the textarea captures binary files and renders garbage.
import assert from 'node:assert/strict'
import { isImageName, isPdfName, isMediaDoc, isPlainTextDoc } from '../src/renderer/src/paths.js'

assert.equal(isImageName('a.png'), true)
assert.equal(isImageName('a.JPG'), true)
assert.equal(isImageName('a.jpeg'), true)
assert.equal(isImageName('a.webp'), true)
assert.equal(isImageName('a.svg'), true)
assert.equal(isImageName('a.bmp'), true)
assert.equal(isImageName('a.ico'), true)
assert.equal(isImageName('a.avif'), true)
assert.equal(isImageName('a.heic'), false)
assert.equal(isImageName('a.md'), false)
assert.equal(isImageName(''), false)
assert.equal(isPdfName('b.pdf'), true)
assert.equal(isPdfName('b.PDF'), true)
assert.equal(isPdfName('b.md'), false)
assert.equal(isPdfName('b.pdfx'), false)
const imgTab = { path: '/x/a.png', content: '', savedContent: '' }
const pdfTab = { path: '/x/b.pdf', content: '', savedContent: '' }
assert.equal(isMediaDoc(imgTab), true)
assert.equal(isMediaDoc(pdfTab), true)
assert.equal(isMediaDoc({ path: '/x/c.md' }), false)
assert.equal(isMediaDoc({}), false)
assert.equal(isMediaDoc(null), false)
// Media must not land in the textarea (the pre-feature bug).
assert.equal(isPlainTextDoc(imgTab), false)
assert.equal(isPlainTextDoc(pdfTab), false)
// Plain-text behavior is unchanged for existing types.
assert.equal(isPlainTextDoc({ path: '/x/c.txt' }), true)
assert.equal(isPlainTextDoc({ path: '/x/d.excalidraw' }), false)
assert.equal(isPlainTextDoc({ path: '/x/d.drawio' }), false)
console.log('media classification OK')
