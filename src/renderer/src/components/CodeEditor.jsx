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
import { useEffect, useRef } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState, Compartment } from '@codemirror/state'
import { indentUnit } from '@codemirror/language'
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { history, defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands'
import { searchKeymap } from '@codemirror/search'
import { oneDark } from '@codemirror/theme-one-dark'
import { basicSetup } from 'codemirror'

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

export default function CodeEditor({ tab, readOnly, onChange, registerApi, onRequestSave }) {
  const hostRef = useRef(null)
  const viewRef = useRef(null)
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
    // simply keep plain highlighting.
    let cancelled = false
    const desc = LanguageDescription.matchFilename(languages, filename)
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
      style={{ height: '100%', overflow: 'hidden' }}
    />
  )
}
