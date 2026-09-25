import { useState } from 'react'

// Developer tools section: one-click open/toggle DevTools for debugging the
// packaged app. Desktop-only (gated by the devtools capability).
export default function DevtoolsSettings({ t }) {
  const [busy, setBusy] = useState(false)
  const api = typeof window !== 'undefined' ? window.api : null
  if (!api?.capabilities?.devtools) return null

  const toggleDevTools = async () => {
    setBusy(true)
    try {
      if (typeof api.windowOpenDevTools === 'function') await api.windowOpenDevTools()
      else await api.windowToggleDevTools()
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="settings-block">
      <h2 className="settings-block-title">{t('settings.devtools')}</h2>
      <div className="settings-row">
        <div className="settings-row-text">
          <div className="settings-row-label">{t('settings.devtoolsDesc')}</div>
        </div>
        <div className="settings-row-control">
          <button type="button" className="settings-link-btn" onClick={toggleDevTools} disabled={busy}>
            {t('settings.devtoolsToggle')}
          </button>
        </div>
      </div>
    </section>
  )
}
