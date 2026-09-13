import Toggle from '../ui/Toggle.jsx'
import DocumentToolsSettings from './DocumentToolsSettings.jsx'

// Typora-style attachment-folder choices for locally-copied images. The image
// host command (configured below) still takes priority when set; these only
// decide where files land on disk in the plain-local path.
const IMAGE_INSERT_MODES = ['current', 'assets', 'docname', 'custom']

export default function FilesSettings({ settings, onUpdateSettings, t }) {
  const mode = settings.imageInsertMode || 'assets'
  return (
    <>
      <section className="settings-block">
        <h2 className="settings-block-title">{t('settings.files')}</h2>
        <div className="settings-row">
          <div className="settings-row-text">
            <div className="settings-row-label">{t('settings.showHiddenFiles')}</div>
            <div className="settings-row-desc">{t('settings.showHiddenFilesDesc')}</div>
          </div>
          <Toggle
            checked={!!settings.showHiddenFiles}
            onChange={(v) => onUpdateSettings({ showHiddenFiles: v })}
            label={t('settings.showHiddenFiles')}
          />
        </div>
      </section>
      {window.api.saveImage && (
        <section className="settings-block">
          <h2 className="settings-block-title">{t('settings.attachmentFolder')}</h2>
          <p className="settings-block-desc">{t('settings.attachmentFolderDesc')}</p>
          <div className="settings-row">
            <div className="settings-row-text">
              <div className="settings-row-label">{t('settings.insertImage')}</div>
            </div>
          </div>
          <div className="settings-radio-list" role="radiogroup" aria-label={t('settings.insertImage')}>
            {IMAGE_INSERT_MODES.map((m) => (
              <label key={m} className="settings-radio-item">
                <input
                  type="radio"
                  name="image-insert-mode"
                  checked={mode === m}
                  onChange={() => onUpdateSettings({ imageInsertMode: m })}
                />
                <span>{t(`settings.imageInsert.${m}`)}</span>
              </label>
            ))}
          </div>
          {mode === 'custom' && (
            <>
              <input
                className="settings-input" type="text" spellCheck={false}
                placeholder={t('settings.imageInsertCustomPlaceholder')}
                value={settings.imageInsertCustomPath || ''}
                onChange={(e) => onUpdateSettings({ imageInsertCustomPath: e.target.value })}
              />
              <p className="settings-block-desc settings-block-hint">{t('settings.imageInsertCustomHint')}</p>
            </>
          )}
        </section>
      )}
      <section className="settings-block">
        <h2 className="settings-block-title">{t('settings.imageHost')}</h2>
        <p className="settings-block-desc">{t('settings.imageHostDesc')}</p>
        <input
          className="settings-input" type="text" spellCheck={false}
          placeholder={t('settings.imageHostPlaceholder')}
          value={settings.imageUploadCommand || ''}
          onChange={(e) => onUpdateSettings({ imageUploadCommand: e.target.value })}
        />
      </section>
      {window.api.capabilities?.pandocExport && <DocumentToolsSettings t={t} />}
    </>
  )
}
