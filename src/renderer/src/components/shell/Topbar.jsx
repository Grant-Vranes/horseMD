// Top bar: mobile menu button, tab strip, new/split/image-host/palette buttons,
// and the Windows window controls. Extracted verbatim in behavior from App.jsx
// (phase-2 refactor, US-7).
import Tabs from '../Tabs.jsx'
import { Icon } from '../icons.jsx'
import ImageHostButton from '../ImageHostButton.jsx'
import NewFileButton from './NewFileButton.jsx'
import OpenFilesButton from './OpenFilesButton.jsx'
import WindowControls from '../WindowControls.jsx'
import { labelWithShortcut } from '../../lib/commands/shortcut-labels.js'

export default function Topbar({
  isMobile,
  readOnly,
  t,
  tabs,
  activeId,
  splitId,
  focusedPane,
  split,
  imageUploadCommand,
  effectiveKeybindings,
  onActivate,
  onClose,
  onNew,
  onNewTyped,
  onCloseOthers,
  onOpenRight,
  onRename,
  onDuplicate,
  onDelete,
  onExportPdf,
  onExportHtml,
  onExportPandoc,
  onExportExcalidraw,
  onExportDrawio,
  onReorder,
  onToggleSidebar,
  onToggleReadOnly,
  onToggleSplit,
  onImageHostChange,
  onOpenPalette
}) {
  return (
    <div className="topbar">
      {isMobile && (
        <button
          className="icon-btn drag-no hm-menu-btn"
          title={t('cmd.files')}
          onClick={onToggleSidebar}
        >
          <Icon name="menu" size={20} />
        </button>
      )}
      <Tabs
        tabs={tabs}
        activeId={activeId}
        splitId={splitId}
        focusedPane={focusedPane}
        onActivate={onActivate}
        onClose={onClose}
        onNew={onNew}
        onCloseOthers={onCloseOthers}
        onOpenRight={onOpenRight}
        onRename={onRename}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onExportPdf={onExportPdf}
        onExportHtml={onExportHtml}
        onExportPandoc={onExportPandoc}
        onExportExcalidraw={onExportExcalidraw}
        onExportDrawio={onExportDrawio}
        onReorder={onReorder}
        effectiveKeybindings={effectiveKeybindings}
      />
      <div className="topbar-spacer" />
      {isMobile && (
        <button
          className={`icon-btn drag-no hm-readonly-btn${readOnly ? ' active' : ''}`}
          title={readOnly ? t('mobile.readOnlyOff') : t('mobile.readOnlyOn')}
          aria-pressed={readOnly}
          onClick={onToggleReadOnly}
        >
          <Icon name={readOnly ? 'lock' : 'unlock'} size={18} />
        </button>
      )}
      <OpenFilesButton
        tabs={tabs}
        activeId={activeId}
        t={t}
        onActivate={onActivate}
        onClose={onClose}
      />
      <NewFileButton
        isMobile={isMobile}
        t={t}
        effectiveKeybindings={effectiveKeybindings}
        onNewTyped={onNewTyped}
      />
      {!isMobile && (
        <button
          className={`icon-btn drag-no${split ? ' active' : ''}`}
          title={split ? t('split.close') : t('split.toggle')}
          onClick={onToggleSplit}
        >
          <Icon name="columns" size={16} />
        </button>
      )}
      {!isMobile && (
        <ImageHostButton
          t={t}
          command={imageUploadCommand}
          onChange={onImageHostChange}
        />
      )}
      <button
        className="icon-btn drag-no"
        title={labelWithShortcut(t('cmd.palette'), 'view.commandPalette', effectiveKeybindings)}
        onClick={onOpenPalette}
      >
        <Icon name="command" size={16} />
      </button>
      {(window.api.platform === 'win32' || window.api.platform === 'linux') && <WindowControls t={t} />}
    </div>
  )
}
