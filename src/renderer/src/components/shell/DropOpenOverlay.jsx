import { Icon } from '../icons.jsx'

export default function DropOpenOverlay({ t }) {
  return (
    <div className="hm-drop-open-overlay" aria-hidden="true">
      <span className="hm-drop-open-icon"><Icon name="upload" size={16} /></span>
      <strong>{t('dropOpen.title')}</strong>
      <span>{t('dropOpen.hint')}</span>
    </div>
  )
}
