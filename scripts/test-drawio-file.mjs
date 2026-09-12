// Unit checks for drawio-file helpers (no Electron needed).
// Run: npm run test:drawio-file
import assert from 'node:assert/strict'
import { EMPTY_DRAWIO_XML, isValidDrawioXml } from '../src/renderer/src/lib/drawio-file.js'

// Template is itself valid, single-page, and uncompressed.
assert.equal(isValidDrawioXml(EMPTY_DRAWIO_XML), true)
assert.ok(EMPTY_DRAWIO_XML.includes('<mxfile'))
assert.ok(EMPTY_DRAWIO_XML.includes('<diagram'))

// Valid variants a real .drawio file can take.
assert.equal(isValidDrawioXml('<mxfile version="31.4.5"><diagram id="a" name="Page-1">x</diagram></mxfile>'), true)
assert.equal(isValidDrawioXml('<mxGraphModel dx="0" dy="0"><root/></mxGraphModel>'), true)
assert.equal(isValidDrawioXml('  <MxFile><diagram/></MxFile>  '), true) // case-insensitive, padded

// Compressed (deflate+base64) payloads never start with '<mxfile' but the
// mxGraphModel marker check still applies to uncompressed internals; a fully
// opaque compressed body must be rejected so the corrupt-fallback fires.
assert.equal(isValidDrawioXml('eNqljTEKgDAMBL9 '), false)
assert.equal(isValidDrawioXml(''), false)
assert.equal(isValidDrawioXml(null), false)
assert.equal(isValidDrawioXml(undefined), false)
assert.equal(isValidDrawioXml('{ not xml }'), false)
assert.equal(isValidDrawioXml('<html><body>x</body></html>'), false)

console.log('drawio-file tests passed')
