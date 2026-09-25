// Generic right-click "Inspect Element" support. Custom context menus (editor,
// sidebar, tab bar, etc.) call preventDefault on their own; this handler only
// fires when nothing claimed the event, so it never stacks a menu on top of
// theirs. Desktop-only, gated by the inspectElement capability.
export function installInspectElementContextMenu() {
  const api = typeof window !== 'undefined' ? window.api : null
  if (!api?.capabilities?.inspectElement || !api.windowInspectElement) return

  window.addEventListener(
    'contextmenu',
    (event) => {
      if (event.defaultPrevented) return
      // Only plain left-button-free clicks on non-editable content fall through
      // here; let the main process open DevTools pointed at this element.
      api.windowInspectElement(event.clientX, event.clientY)
    },
    false
  )
}
