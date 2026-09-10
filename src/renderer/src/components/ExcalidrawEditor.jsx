// Excalidraw whiteboard tab editor — wraps the official @excalidraw/excalidraw
// React component. Imported ONLY via lazy() from EditorArea so the component,
// its fonts and its CSS live in their own chunk; the app shell and the
// Milkdown editor chunk never evaluate it.
//
// Contract with EditorArea/App:
//   props.tab          doc tab whose `content` is scene JSON text
//   props.onChange     (json) => void — debounced serialization feeding
//                      updateContent (dirty marking is tab-state's job)
//   props.registerApi  (api|null) => void — exposes getSceneJson/exportPng/
//                      exportSvg to the save/export pipelines via editorApis
import { useCallback, useEffect, useRef, useState } from 'react'
import { Excalidraw, exportToBlob, exportToSvg, serializeAsJSON } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { useI18n } from '../i18n.jsx'
import { parseExcalidrawScene } from '../lib/excalidraw-scene.js'

const CHANGE_DEBOUNCE_MS = 500

const serializeScene = ({ elements, appState, files }) =>
  serializeAsJSON(elements, appState, files, 'local')

export default function ExcalidrawEditor({ tab, onChange, registerApi }) {
  const { t } = useI18n()
  // Parse exactly once per mount; tab.content changes only through our own
  // onChange/save cycle, and initialData must not reset while editing.
  const [initial] = useState(() => parseExcalidrawScene(tab.content))
  const [corrupt] = useState(() => initial === null && !!(tab.content || '').trim())
  const latestRef = useRef(initial || { elements: [], appState: {}, files: {} })
  const timerRef = useRef(null)

  // Debounced onChange → parent. serializeAsJSON output is stable for an
  // untouched scene, so reopening a saved file does not spuriously mark dirty.
  const handleSceneChange = useCallback(
    (elements, appState, files) => {
      latestRef.current = { elements, appState, files }
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        timerRef.current = null
        try {
          onChange?.(serializeScene(latestRef.current))
        } catch {
          // A serialization hiccup must not crash the canvas; the next
          // interaction retries.
        }
      }, CHANGE_DEBOUNCE_MS)
    },
    [onChange]
  )

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  // Save/export pipeline API. getSceneJson serializes the LIVE scene — null
  // only when serialization genuinely fails (callers must then abort saving).
  useEffect(() => {
    const api = {
      getSceneJson: () => {
        try {
          return serializeScene(latestRef.current)
        } catch {
          return null
        }
      },
      exportPng: async () => {
        const { elements, appState, files } = latestRef.current
        return await exportToBlob({ elements, appState, files, mimeType: 'image/png' })
      },
      exportSvg: async () => {
        const { elements, appState, files } = latestRef.current
        const svg = await exportToSvg({ elements, appState, files })
        return new XMLSerializer().serializeToString(svg)
      }
    }
    registerApi?.(api)
    return () => registerApi?.(null)
  }, [registerApi])

  // Test hook (CDP scripts drive scene changes programmatically instead of
  // simulating hand-drawn strokes). Read-only reference to the official API.
  const [excalidrawApi, setExcalidrawApi] = useState(null)
  useEffect(() => {
    window.__hmExcalidrawApi = excalidrawApi
    return () => { delete window.__hmExcalidrawApi }
  }, [excalidrawApi])

  return (
    <div className="excalidraw-host">
      {corrupt && <div className="excalidraw-corrupt-note">{t('excalidraw.corruptNote')}</div>}
      <Excalidraw
        initialData={initial || undefined}
        onChange={handleSceneChange}
        excalidrawAPI={setExcalidrawApi}
      />
    </div>
  )
}
