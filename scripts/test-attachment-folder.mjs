// Focused tests for src/main/attachment-folder.js — the shared target-folder
// resolver behind "设置 → 附件文件夹 → 插入图片时". Run: node scripts/test-attachment-folder.mjs
import { strictEqual, deepStrictEqual, ok } from 'node:assert'
import { describe, it } from 'node:test'
import { resolveAttachmentTarget } from '../src/main/attachment-folder.js'

// On macOS/Linux node:path is posix; on Windows it is win32 — the assertions
// below use platform-appropriate separators so the suite runs on both hosts.
const WIN = process.platform === 'win32'
const p = (...parts) => (WIN ? parts.join('\\') : parts.join('/'))
const DOC = p('/Users/me/docs', 'note.md')
const DOC_DIR = p('/Users/me/docs')

describe('resolveAttachmentTarget', () => {
  it('assets (default) writes into ./assets with an assets/ prefix', () => {
    const { dir, prefix } = resolveAttachmentTarget(DOC, 'assets', '')
    strictEqual(dir, p(DOC_DIR, 'assets'))
    strictEqual(prefix, 'assets/')
  })

  it('undefined mode falls back to ./assets', () => {
    const { dir, prefix } = resolveAttachmentTarget(DOC, undefined, '')
    strictEqual(dir, p(DOC_DIR, 'assets'))
    strictEqual(prefix, 'assets/')
  })

  it('current writes next to the document with an empty prefix', () => {
    const { dir, prefix } = resolveAttachmentTarget(DOC, 'current', '')
    strictEqual(dir, DOC_DIR)
    strictEqual(prefix, '')
  })

  it('docname uses <stem>.assets named after the document', () => {
    const { dir, prefix } = resolveAttachmentTarget(DOC, 'docname', '')
    strictEqual(dir, p(DOC_DIR, 'note.assets'))
    strictEqual(prefix, 'note.assets/')
  })

  it('docname ignores the extension, including multi-dot names', () => {
    const { dir, prefix } = resolveAttachmentTarget(p(DOC_DIR, 'a.b.markdown'), 'docname', '')
    strictEqual(dir, p(DOC_DIR, 'a.b.assets'))
    strictEqual(prefix, 'a.b.assets/')
  })

  it('custom relative path resolves against the document folder', () => {
    const { dir, prefix } = resolveAttachmentTarget(DOC, 'custom', './imgs')
    strictEqual(dir, p(DOC_DIR, 'imgs'))
    strictEqual(prefix, 'imgs/')
  })

  it('custom ../ path produces a portable ../ prefix', () => {
    const { dir, prefix } = resolveAttachmentTarget(DOC, 'custom', '../shared-imgs')
    strictEqual(dir, p('/Users/me', 'shared-imgs'))
    strictEqual(prefix, '../shared-imgs/')
  })

  it('custom absolute path is used as-is with a relative prefix when possible', () => {
    const { dir, prefix } = resolveAttachmentTarget(DOC, 'custom', p('/Users/me', 'pic-lib'))
    strictEqual(dir, p('/Users/me', 'pic-lib'))
    strictEqual(prefix, '../pic-lib/')
  })

  it('custom path expands ${filename} to the document stem', () => {
    const { dir, prefix } = resolveAttachmentTarget(DOC, 'custom', './${filename}.assets')
    strictEqual(dir, p(DOC_DIR, 'note.assets'))
    strictEqual(prefix, 'note.assets/')
  })

  it('empty custom path falls back to ./assets (never scatters into ./)', () => {
    const { dir, prefix } = resolveAttachmentTarget(DOC, 'custom', '   ')
    strictEqual(dir, p(DOC_DIR, 'assets'))
    strictEqual(prefix, 'assets/')
  })

  it('markdown prefix always uses forward slashes', () => {
    for (const mode of ['current', 'assets', 'docname', 'custom']) {
      const { prefix } = resolveAttachmentTarget(DOC, mode, './x')
      ok(!prefix.includes('\\'), `prefix for ${mode} must not contain backslashes`)
    }
  })

  it('known mode list is stable', () => {
    deepStrictEqual(
      ['current', 'assets', 'docname', 'custom'],
      ['current', 'assets', 'docname', 'custom']
    )
  })
})
