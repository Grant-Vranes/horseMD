// Drawio diagram tab editor — embeds the locally-vendored diagrams.net webapp
// (resources/drawio, served over drawio-local://editor) inside an iframe.
// Imported ONLY via lazy() from EditorArea so the app shell and the Milkdown
// editor chunk never evaluate it.
//
// Contract with EditorArea/App:
//   props.tab          doc tab whose `content` is .drawio XML text
//   props.onChange     (xml) => void — debounced save-message feed into
//                      updateContent (dirty marking is tab-state's job)
//   props.registerApi  (api|null) => void — exposes getXml/exportPng/exportSvg
//                      to the save/export pipelines via editorApis
//   props.onRequestSave () => void — user-invoked save inside the canvas
//                      (File > Save / Cmd+S) must trigger the host save flow
//
// Embed protocol (drawio ?embed=1&proto=json), JSON-stringified messages:
//   iframe -> host: {event: 'init'}                     editor ready
//   host   -> iframe: {action: 'load', xml, autosave: 1}
//   iframe -> host: {event: 'autosave', xml}            content changed
//   iframe -> host: {event: 'save', xml}                explicit user save
//   host   -> iframe: {action: 'export', format}        export request
//   iframe -> host: {event: 'export', format, data}     data URL response
import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n.jsx'
import { isValidDrawioXml } from '../lib/drawio-file.js'

const CHANGE_DEBOUNCE_MS = 500
const EXPORT_TIMEOUT_MS = 20000
const INIT_TIMEOUT_MS = 30000
const FRAME_ORIGIN = 'drawio-local://editor'

export default function DrawioEditor({ tab, onChange, registerApi, onRequestSave }) {
  const { t, language } = useI18n()
  // Parse exactly once per mount; tab.content changes only through our own
  // onChange/save cycle, and the load message must not reset while editing.
  const [initialXml] = useState(() => {
    const raw = tab.content || ''
    return isValidDrawioXml(raw) ? raw : ''
  })
  const [corrupt] = useState(() => initialXml === '' && !!(tab.content || '').trim())
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [frameUrl, setFrameUrl] = useState(null)
  const [frameNonce, setFrameNonce] = useState(0)
  const frameRef = useRef(null)
  const latestXmlRef = useRef(initialXml)
  // Excalidraw-style baseline: the first observed save is a baseline, not an
  // edit — drawio re-serializes XML in its own canonical (often compressed)
  // form on load, and init churn must never mark the tab dirty.
  const lastBaselineRef = useRef(null)
  const timerRef = useRef(null)
  // Pending {action:'export'} requests keyed by format.
  const exportWaitersRef = useRef(new Map())
  // Test-only: after simulateChange the host side deliberately diverges from
  // the iframe (the test drives content without the canvas). While held,
  // iframe autosave messages must not clobber latestXmlRef with the stale
  // pre-test content — otherwise a save racing the next autosave tick writes
  // the OLD xml back to disk.
  const holdIframeSavesRef = useRef(false)
  const readyRef = useRef(false)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  // Explicit in-canvas save (File > Save / Cmd+S inside the iframe) hands off
  // to the host save flow — the iframe swallows Cmd+S, so the host keybinding
  // never sees it.
  const onRequestSaveRef = useRef(onRequestSave)
  onRequestSaveRef.current = onRequestSave

  const publishChange = useCallback((xml) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      if (xml === lastBaselineRef.current) return
      lastBaselineRef.current = xml
      onChangeRef.current?.(xml)
    }, CHANGE_DEBOUNCE_MS)
  }, [])

  const postToFrame = useCallback((payload) => {
    frameRef.current?.contentWindow?.postMessage(JSON.stringify(payload), FRAME_ORIGIN)
  }, [])

  const handleFrameMessage = useCallback((event) => {
    // Only accept messages from OUR iframe — never from stray windows.
    if (event.source !== frameRef.current?.contentWindow) return
    if (event.origin !== FRAME_ORIGIN) return
    let msg = null
    try {
      msg = JSON.parse(typeof event.data === 'string' ? event.data : '')
    } catch {
      return
    }
    if (!msg || typeof msg !== 'object') return
    if (msg.event === 'init') {
      readyRef.current = true
      setReady(true)
      setLoadError(false)
      // xml omitted for a blank canvas — drawio substitutes its empty diagram.
      postToFrame({ action: 'load', xml: initialXml || undefined, autosave: 1 })
      return
    }
    // The vendored webapp posts TWO distinct change events: debounced
    // {event:'autosave', xml} on every model edit, and {event:'save', xml}
    // only for explicit user saves (File > Save / Cmd+S inside the iframe).
    // Both must refresh latestXmlRef; 'autosave' drives dirty marking and
    // 'save' additionally triggers the host save flow.
    if (
      (msg.event === 'autosave' || msg.event === 'save') &&
      typeof msg.xml === 'string' &&
      msg.xml.length > 0
    ) {
      if (holdIframeSavesRef.current) return
      latestXmlRef.current = msg.xml
      if (lastBaselineRef.current === null) {
        // First observation after mount: baseline, not an edit.
        lastBaselineRef.current = msg.xml
      } else if (msg.xml !== lastBaselineRef.current) {
        if (msg.event === 'save') {
          // Explicit save flushes the debounce immediately so the tab state
          // and getXml() carry the exact xml the user asked to save.
          if (timerRef.current) {
            clearTimeout(timerRef.current)
            timerRef.current = null
          }
          onChangeRef.current?.(msg.xml)
          lastBaselineRef.current = msg.xml
        } else {
          publishChange(msg.xml)
        }
      }
      if (msg.event === 'save') onRequestSaveRef.current?.()
      return
    }
    if (msg.event === 'export' && typeof msg.data === 'string') {
      const waiter = exportWaitersRef.current.get(msg.format)
      if (waiter) {
        exportWaitersRef.current.delete(msg.format)
        waiter.resolve(msg.data)
      }
    }
    // 'exit'/'openLink'/'resize'/'draft' are ignored — the tab owns the
    // document lifecycle and noExitBtn=1 hides the exit affordance.
  }, [initialXml, postToFrame, publishChange])

  useEffect(() => {
    let cancelled = false
    window.addEventListener('message', handleFrameMessage)
    // Resolve the packaged editor URL through the main process (dev/prod
    // resource locations differ). Missing desktop API = capability off.
    Promise.resolve(window.api?.drawio?.getEditorUrl?.(language))
      .then((url) => {
        if (cancelled) return
        if (!url) {
          setLoadError(true)
          return
        }
        setFrameUrl(url)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
    return () => {
      cancelled = true
      window.removeEventListener('message', handleFrameMessage)
    }
  }, [handleFrameMessage, language])

  // Frame loaded but never sent init (broken vendored build, protocol
  // failure): surface the retry affordance.
  useEffect(() => {
    if (!frameUrl || ready) return
    const timer = setTimeout(() => {
      if (!readyRef.current) setLoadError(true)
    }, INIT_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [frameUrl, ready, frameNonce])

  // A pending debounce means the last edit never reached the parent. Flush it
  // synchronously so closing/switching cannot lose it (same rule as
  // ExcalidrawEditor's unmount flush).
  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
        const xml = latestXmlRef.current
        if (xml && xml !== lastBaselineRef.current) {
          lastBaselineRef.current = xml
          onChangeRef.current?.(xml)
        }
      }
    },
    []
  )

  const retry = useCallback(() => {
    setLoadError(false)
    setReady(false)
    readyRef.current = false
    lastBaselineRef.current = null
    setFrameNonce((n) => n + 1)
  }, [])

  // Save/export pipeline API. getXml returns the LIVE xml — null only when we
  // have nothing usable (callers must then abort saving, same as the rich
  // editor null path). Export posts {action:'export'} and waits for the
  // matching {event:'export'} data URL.
  const registerApiRef = useRef(registerApi)
  registerApiRef.current = registerApi
  useEffect(() => {
    if (!ready) return
    const requestExport = (format) =>
      new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          exportWaitersRef.current.delete(format)
          reject(new Error('drawio export timed out'))
        }, EXPORT_TIMEOUT_MS)
        exportWaitersRef.current.set(format, {
          resolve: (data) => {
            clearTimeout(timeout)
            resolve(data)
          },
          reject
        })
        postToFrame({ action: 'export', format })
      })
    const api = {
      getXml: () => {
        const xml = latestXmlRef.current
        return isValidDrawioXml(xml) ? xml : null
      },
      exportPng: () => requestExport('png'),
      exportSvg: () => requestExport('svg')
    }
    registerApiRef.current?.(api)
    return () => registerApiRef.current?.(null)
  }, [ready, postToFrame])

  // Test hook (CDP scripts drive content changes programmatically — real
  // cross-origin canvas interaction is not automatable from the host page).
  useEffect(() => {
    window.__hmDrawioApi = {
      simulateChange: (xml) => {
        latestXmlRef.current = xml
        holdIframeSavesRef.current = true
        if (lastBaselineRef.current === null) {
          // No real drawio save observed yet (test-only path): the untouched
          // initial content is the baseline so this change registers as an
          // edit instead of being swallowed as a first-observation baseline.
          lastBaselineRef.current = initialXml
        }
        publishChange(xml)
      },
      isReady: () => ready
    }
    return () => {
      delete window.__hmDrawioApi
    }
  }, [ready, publishChange])

  return (
    <div className={`drawio-host${ready ? ' drawio-ready' : ''}`} data-ready={ready ? 'true' : 'false'}>
      {corrupt && <div className="drawio-corrupt-note">{t('drawio.corruptNote')}</div>}
      {loadError && (
        <div className="drawio-load-error" role="status">
          {t('drawio.loadError')}
          <button onClick={retry}>{t('drawio.retry')}</button>
        </div>
      )}
      {frameUrl && !loadError && (
        <iframe
          key={frameNonce}
          ref={frameRef}
          className="drawio-frame"
          title="drawio"
          sandbox="allow-scripts allow-same-origin allow-popups allow-downloads allow-forms"
          src={frameUrl}
        />
      )}
    </div>
  )
}
