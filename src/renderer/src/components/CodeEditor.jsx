// CodeEditor — CodeMirror 6 editor for source-code / config files
// (.java .py .yml .xml .json .js .ts …). Replaces the bare <textarea> for these
// extensions so they get line numbers and language-aware syntax highlighting
// while keeping HorseMD's tab/save/caret-restore contracts:
//   - onChange → updateContent(tab.id, doc) — the same content channel as the
//     rich editor, so saving, dirty-state and external-reload all work.
//   - registerApi({ flushMarkdown, flushMarkdownSettled }) — getSettledMarkdownForTab
//     picks these up so Ctrl/Cmd+S persists the live CodeMirror document.
//   - restoreOffset/restoreScrollTop — the shared "reopen where you left off".
//   - Mod-S inside the editor triggers the app save (the global accelerator
//     handles it when the editor isn't focused).
// Language support comes from @codemirror/language-data (already shipped with
// Crepe/CodeMirror for fenced code blocks — no new dependency), which maps
// filenames to streaming-aware language packages loaded lazily.
import { useEffect, useRef, useState } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { indentUnit } from '@codemirror/language'
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { history, defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands'
import { searchKeymap } from '@codemirror/search'
import { oneDark } from '@codemirror/theme-one-dark'
import { basicSetup } from 'codemirror'
import { useI18n } from '../i18n.jsx'

// Best-effort JSON parsing for .json / .jsonc / .json5. Strict JSON first;
// comment-bearing variants get a conservative strip (strings preserved by
// tokenizing quotes so URLs like "http://…" are never mangled).
const isJsonFile = (filename) => /\.(json|jsonc|json5)$/i.test(filename || '')

function stripJsonComments(text) {
  let out = ''
  let i = 0
  let inString = false
  while (i < text.length) {
    const ch = text[i]
    if (inString) {
      out += ch
      if (ch === '\\') {
        out += text[i + 1] || ''
        i += 2
        continue
      }
      if (ch === '"') inString = false
      i += 1
      continue
    }
    if (ch === '"') {
      inString = true
      out += ch
      i += 1
      continue
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1
      continue
    }
    if (ch === '/' && text[i + 1] === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1
      i += 2
      continue
    }
    out += ch
    i += 1
  }
  return out.replace(/,\s*([\]}])/g, '$1')
}

function formatJsonText(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    try {
      parsed = JSON.parse(stripJsonComments(text))
    } catch {
      return null
    }
  }
  return JSON.stringify(parsed, null, 4) + '\n'
}

// App palette bridge: CodeMirror inherits the app's font/size via CSS on the
// host element; dark themes additionally get One Dark. Line numbers are always
// on (the update this component ships for).
const appTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '13.5px', backgroundColor: 'transparent' },
  '.cm-scroller': {
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, Menlo, monospace",
    lineHeight: '1.6'
  },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none', opacity: 0.75 },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' }
})

const isDarkTheme = () => document.body?.classList?.contains('dark') === true

export default function CodeEditor({ tab, readOnly, onChange, registerApi, onRequestSave, plain }) {
  const hostRef = useRef(null)
  const viewRef = useRef(null)
  const [jsonError, setJsonError] = useState(false)
  const [hasRestore, setHasRestore] = useState(false)
  const preFormatDocRef = useRef(null)
  const { t } = useI18n()
  const canFormatJson = !plain && isJsonFile(tab.path || '')

  const formatJson = () => {
    const view = viewRef.current
    if (!view || readOnly) return
    const before = view.state.doc.toString()
    const formatted = formatJsonText(before)
    if (formatted == null) {
      setJsonError(true)
      window.setTimeout(() => setJsonError(false), 1800)
      return
    }
    if (formatted === before) return
    preFormatDocRef.current = before
    setHasRestore(true)
    const scrollTop = view.scrollDOM.scrollTop
    view.dispatch({
      changes: { from: 0, to: before.length, insert: formatted }
    })
    view.scrollDOM.scrollTop = scrollTop
  }

  // Restore the exact pre-format content. Also undoable via Mod-Z, but a
  // one-click restore is more discoverable for large reformats.
  const restorePreFormat = () => {
    const view = viewRef.current
    if (!view || readOnly || preFormatDocRef.current == null) return
    const before = preFormatDocRef.current
    preFormatDocRef.current = null
    setHasRestore(false)
    const scrollTop = view.scrollDOM.scrollTop
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: before }
    })
    view.scrollDOM.scrollTop = scrollTop
  }
  const langCompartment = useRef(new Compartment())
  const readOnlyCompartment = useRef(new Compartment())
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!hostRef.current) return undefined
    const filename = tab.path || ''

    const extensions = [
      // basicSetup already includes line numbers, history, bracket matching,
      // highlight-active-line and the search panel (Ctrl/Cmd-F) keymaps.
      basicSetup,
      history(),
      keymap.of([...searchKeymap, ...historyKeymap, indentWithTab, ...defaultKeymap]),
      indentUnit.of('    '),
      appTheme,
      langCompartment.current.of([]),
      readOnlyCompartment.current.of(EditorState.readOnly.of(!!readOnly)),
      EditorView.updateListener.of((u) => {
        if (u.docChanged) onChangeRef.current?.(u.state.doc.toString())
      }),
      // Let the global Mod-S accelerator win when it exists; CodeMirror never
      // swallows it (defaultKeymap has no save binding).
      EditorView.domEventHandlers({
        keydown: (event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
            event.preventDefault()
            onRequestSave?.()
            return true
          }
          return false
        }
      })
    ]
    if (isDarkTheme()) extensions.push(oneDark)

    const state = EditorState.create({ doc: tab.content || '', extensions })
    const view = new EditorView({ state, parent: hostRef.current })
    viewRef.current = view

    // Restore the saved caret/viewport (shared per-tab contract, issue #111).
    try {
      if (tab.restoreOffset != null) {
        const off = Math.max(0, Math.min(tab.restoreOffset, view.state.doc.length))
        view.dispatch({ selection: { anchor: off }, scrollIntoView: true })
        if (tab.restoreScrollTop) view.scrollDOM.scrollTop = tab.restoreScrollTop
      }
    } catch {
      // A stale offset just leaves the caret at the default spot.
    }

    // Resolve the language by filename, then load it lazily (language packages
    // are dynamic imports in @codemirror/language-data). Unknown extensions
    // simply keep plain highlighting. Huge docs pass plain: parsing/highlighting
    // a multi-MB document buys nothing and delays first paint.
    let cancelled = false
    const desc = plain ? null : LanguageDescription.matchFilename(languages, filename)
    if (desc) {
      desc.load().then((support) => {
        if (!cancelled && viewRef.current) {
          viewRef.current.dispatch({
            effects: langCompartment.current.reconfigure(support)
          })
        }
      }).catch(() => {
        // Language load failure must never break editing — fall back to plain.
      })
    }

    // Save API for getSettledMarkdownForTab (Ctrl/Cmd+S path in useFileOps).
    registerApi?.({
      flushMarkdown: () => view.state.doc.toString(),
      flushMarkdownSettled: async () => view.state.doc.toString(),
      getRecoveryMarkdown: () => view.state.doc.toString()
    })

    return () => {
      cancelled = true
      viewRef.current = null
      view.destroy()
    }
    // Mount once per tab reload (key in EditorArea includes reloadNonce).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id, tab.reloadNonce])

  // Keep readOnly live without remounting.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(EditorState.readOnly.of(!!readOnly))
    })
  }, [readOnly])

  return (
    <div
      ref={hostRef}
      className="code-editor-host"
      style={{ height: '100%', overflow: 'hidden', position: 'relative' }}
    >
      {canFormatJson && hasRestore && (
        <button
          type="button"
          className="icon-btn json-format-btn json-restore-btn"
          title={t('code.restoreJson')}
          onClick={restorePreFormat}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
          </svg>
        </button>
      )}
      {canFormatJson && (
        <button
          type="button"
          className={`icon-btn json-format-btn${jsonError ? ' json-format-error' : ''}`}
          title={jsonError ? t('code.formatJsonError') : t('code.formatJson')}
          onClick={formatJson}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1" />
            <path d="M16 21h1a2 2 0 0 0 2-2v-4a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" />
          </svg>
        </button>
      )}
    </div>
  )
}
