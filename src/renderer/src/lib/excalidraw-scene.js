// Shared excalidraw scene helpers: the minimal valid scene used when creating
// a new whiteboard, and the parse/fallback rule for loaded files.
export const EMPTY_EXCALIDRAW_SCENE = JSON.stringify(
  { type: 'excalidraw', version: 2, source: 'horsemd', elements: [], appState: {}, files: {} },
  null,
  2
)

// Parse scene JSON. Returns null when the file is not a valid excalidraw
// scene; callers treat null as "blank canvas" (plus a one-shot notice if the
// file actually had content — that means it was corrupted).
export function parseExcalidrawScene(text) {
  try {
    const parsed = JSON.parse(text)
    if (parsed && parsed.type === 'excalidraw') {
      return { elements: parsed.elements || [], appState: parsed.appState || {}, files: parsed.files || {} }
    }
  } catch {
    // fall through
  }
  return null
}
