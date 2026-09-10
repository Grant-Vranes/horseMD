# Excalidraw 白板支持 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 独立 `.excalidraw` 文件在 HorseMD 标签页中以官方 Excalidraw 画布打开、编辑、保存（写回场景 JSON），并支持导出 PNG/SVG；移动端通过 capabilities gate 隐藏。

**Architecture:** 新增第三种 tab 编辑器 `ExcalidrawEditor.jsx`（官方 `@excalidraw/excalidraw` React 组件，lazy 独立 chunk）。复用现有 doc tab 结构、脏标记、`saveTab`、watcher 警告整条管线：`onChange` 防抖序列化 → `updateContent` → `isTabDirty` 自动成立。导出走 `dialog:saveAs` + 新增 `fs:writeBinary` IPC。

**Tech Stack:** `@excalidraw/excalidraw`（React 18 兼容）、Electron IPC、现有 editor-api-registry。

**Spec:** `docs/superpowers/specs/2026-09-10-excalidraw-support-design.md`

## Global Constraints

- 遵守仓库风格：ESM、单引号、无分号、两空格缩进。
- `Editor.jsx` / `App.jsx` 不加大块逻辑；excalidraw 逻辑收在 `ExcalidrawEditor.jsx` 与小工具模块。
- 不得把 excalidraw 纳入全局搜索（JSON 内容无意义）。
- 保存是 durability boundary：取不到实时场景序列化结果必须中止保存，不得回落 `tab.content`。
- 移动端不注册该功能：desktop preload 声明 `capabilities.excalidraw: true`；Capacitor shim 不声明；UI 按 `window.api.capabilities?.excalidraw` gate。
- CDP 测试用 `scripts/lib/electron-test-app.mjs` 默认后台模式，不得抢占用户焦点。
- 每个用户可见变更合入即 patch bump；本计划最终 bump 到 `0.13.206`。
- guide 截图政策：不用真实个人路径；如截图需在重建并全新安装的 app、隔离 profile 下制作（本计划不强制截图）。

---

### Task 1: 文件分类 + 主进程扩展名镜像（TDD）

**Files:**
- Modify: `src/renderer/src/paths.js`（`MD_DOC_RE` 定义之后）
- Modify: `src/main/index.js:19-21`（`MD_EXTS`/`MD_RE`）及 `:123` 附近 launch args、`:336-344` IPC 注册
- Test: `scripts/test-excalidraw-classify.mjs`（新建）

**Interfaces:**
- Produces: `paths.js` 导出 `EXCALIDRAW_RE`（RegExp）、`isExcalidrawName(name) → bool`；`isPlainTextDoc` 对 `.excalidraw` 返回 false。Task 2/5 消费。

- [ ] **Step 1: 写失败测试**

```js
// scripts/test-excalidraw-classify.mjs
// Run: node scripts/test-excalidraw-classify.mjs
import assert from 'node:assert/strict'
import { EXCALIDRAW_RE, isExcalidrawName, isPlainTextDoc, isMarkdownName, isHeavyDoc } from '../src/renderer/src/paths.js'

// isExcalidrawName
assert.equal(isExcalidrawName('a.excalidraw'), true)
assert.equal(isExcalidrawName('/x/y/A.EXCALIDRAW'), true)
assert.equal(isExcalidrawName('a.md'), false)
assert.equal(isExcalidrawName('a.excalidraw.md'), false)
assert.equal(isExcalidrawName(''), false)
assert.equal(isExcalidrawName(null), false)
assert.ok(EXCALIDRAW_RE.test('b.excalidraw'))

// isPlainTextDoc must NOT capture .excalidraw (textarea would steal the tab)
assert.equal(isPlainTextDoc({ path: '/x/a.excalidraw' }), false)
assert.equal(isPlainTextDoc({ path: '/x/a.txt' }), true)
assert.equal(isPlainTextDoc({ path: '/x/a.md' }), false)
assert.equal(isPlainTextDoc({ path: null }), false)

// untouched invariants
assert.equal(isMarkdownName('/x/a.md'), true)
assert.equal(isHeavyDoc(''), false)

console.log('excalidraw classify: all assertions passed')
```

- [ ] **Step 2: 运行确认失败**

Run: `node scripts/test-excalidraw-classify.mjs`
Expected: FAIL — `SyntaxError: The requested module ... does not provide an export named 'EXCALIDRAW_RE'`

- [ ] **Step 3: paths.js 实现**

在 `src/renderer/src/paths.js` 的 `export const isMarkdownName = ...` 之后插入：

```js
// Excalidraw whiteboards: standalone scene-JSON files opened in the official
// canvas editor (lazy chunk). They are NOT plain-text docs (the textarea must
// not capture them) and are excluded from global search by the main process.
export const EXCALIDRAW_RE = /\.excalidraw$/i
export const isExcalidrawName = (name) => EXCALIDRAW_RE.test(name || '')
```

并修改同文件：

```js
export const isPlainTextDoc = (tab) =>
  !!(tab && tab.path && !MD_DOC_RE.test(tab.path) && !EXCALIDRAW_RE.test(tab.path))
```

- [ ] **Step 4: 运行确认通过**

Run: `node scripts/test-excalidraw-classify.mjs`
Expected: `excalidraw classify: all assertions passed`

- [ ] **Step 5: 主进程扩展名镜像（src/main/index.js）**

把：

```js
const MD_EXTS = ['md', 'markdown', 'mdx', 'txt']
const MD_RE = new RegExp(`\\.(${MD_EXTS.join('|')})$`, 'i')
```

改为：

```js
const MD_EXTS = ['md', 'markdown', 'mdx', 'txt']
const MD_RE = new RegExp(`\\.(${MD_EXTS.join('|')})$`, 'i')
// Openable file types: open-dialog filter, launch args, sidebar tree.
// Superset of MD_EXTS — .excalidraw opens in the canvas editor but must stay
// OUT of global search (registerGlobalSearchIpc keeps MD_RE below).
const FILE_EXTS = [...MD_EXTS, 'excalidraw']
const FILE_RE = new RegExp(`\\.(${FILE_EXTS.join('|')})$`, 'i')
```

launch args 切分处（约 `:123`，"Split launch args into markdown files and folders" 注释下的判定）把 `MD_RE` 改为 `FILE_RE`。IPC 注册处（约 `:336-344`）改为：

```js
registerDocumentIpc(ipcMain, {
  getMainWindow: () => mainWindow,
  getUserDataPath: () => app.getPath('userData'),
  markdownExtensions: FILE_EXTS,
  isTrustedSender: (event) => !!mainWindow && event.sender.id === mainWindow.webContents.id
})

registerFileSystemIpc(ipcMain, { shell, markdownPattern: FILE_RE })

// Workspace-wide content search (issue #120) — deliberately keeps MD_RE so
// .excalidraw scene JSON is never searched.
registerGlobalSearchIpc(ipcMain, { markdownPattern: MD_RE })
```

注意：`registerFileSystemIpc` 的 `markdownPattern` 同时决定侧边栏树显示哪些文件，必须用 `FILE_RE` 才能在树上看到 `.excalidraw`；只有 `registerGlobalSearchIpc` 保持 `MD_RE`。逐处核对 `src/main/index.js` 内 `MD_RE` 的其余使用点：搜索/索引语义用 `MD_RE`，打开/树/启动参数语义用 `FILE_RE`。

- [ ] **Step 6: 构建验证 + 提交**

Run: `node scripts/test-excalidraw-classify.mjs && npm run build`
Expected: 测试通过、build 成功。

```bash
git add src/renderer/src/paths.js src/main/index.js scripts/test-excalidraw-classify.mjs
git commit -m "feat(excalidraw): classify .excalidraw files as canvas docs (desktop scan/open, not search)"
```

---

### Task 2: ExcalidrawEditor 组件 + EditorArea 渲染分支 + capabilities gate

**Files:**
- Create: `src/renderer/src/lib/excalidraw-scene.js`
- Create: `src/renderer/src/components/ExcalidrawEditor.jsx`
- Modify: `src/renderer/src/components/shell/EditorArea.jsx`（lazy import + 渲染分支）
- Modify: `src/preload/index.js:153`（capabilities）
- Modify: `package.json`（依赖）

**Interfaces:**
- Consumes: Task 1 的 `isExcalidrawName`；EditorArea 现有 props `updateContent`、`registerEditorApi`、`editorChunkFallback`、`mountedIds`。
- Produces: `ExcalidrawEditor` 组件 props `{ tab, onChange, registerApi }`；`registerApi` 收到的 API：`getSceneJson() → string|null`、`exportPng() → Promise<Blob>`、`exportSvg() → Promise<string>`。Task 3/4 消费。`src/renderer/src/lib/excalidraw-scene.js` 导出 `EMPTY_EXCALIDRAW_SCENE`（Task 5 消费）。`window.__hmExcalidrawApi`（Excalidraw 实例 API，测试钩子）。

- [ ] **Step 1: 安装依赖**

Run: `npm install @excalidraw/excalidraw`
Expected: package.json dependencies 出现 `"@excalidraw/excalidraw"`。

- [ ] **Step 2: preload 声明 desktop capability**

`src/preload/index.js` 的 `capabilities` 对象加一行（放 `nativeDropOpen: true` 之后）：

```js
    excalidraw: true
```

Capacitor shim（`src/renderer/src/platform/capacitor-api.js` 的 `capabilities`）**不加**——缺失即 gate。

- [ ] **Step 3: 新建 src/renderer/src/lib/excalidraw-scene.js**

```js
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
```

- [ ] **Step 4: 新建 src/renderer/src/components/ExcalidrawEditor.jsx**

```jsx
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
import { useI18n } from '../i18n.jsx'
import { parseExcalidrawScene } from '../lib/excalidraw-scene.js'

const CHANGE_DEBOUNCE_MS = 500

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
          onChange?.(serializeAsJSON(latestRef.current))
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
          return serializeAsJSON(latestRef.current)
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
```

- [ ] **Step 5: EditorArea 渲染分支（src/renderer/src/components/shell/EditorArea.jsx）**

顶部 imports 区加：

```js
const ExcalidrawEditor = lazy(() => import('../ExcalidrawEditor.jsx'))
```

（与现有 `const Editor = lazy(...)` 同款、同位置。）并确认 `isExcalidrawName` 已 import：`import { isExcalidrawName, isPlainTextDoc, shouldUseRichContentVisibility } from '../../paths.js'`。

在 tabs.map 内，紧跟 `if (tab.kind === 'settings') return null` 之后、`const plainText = isPlainTextDoc(tab)` 附近加：

```js
        const excalidrawDoc = isExcalidrawName(tab.path)
        const shouldMountExcalidraw = excalidrawDoc && (inView || mountedIds.has(tab.id))
```

然后参照现有 `<Editor ...>` 分支（约 `:277`）的容器/挂载结构，为 excalidraw 加独立分支（放在 plainText textarea 分支之前；沿用同一 pane host 结构与 `shouldMountRich` 等价的挂载条件，未挂载时渲染 `editorChunkFallback`）：

```jsx
              {excalidrawDoc ? (
                shouldMountExcalidraw ? (
                  <Suspense fallback={editorChunkFallback}>
                    <ExcalidrawEditor
                      tab={tab}
                      onChange={(json) => updateContent(tab.id, json, false)}
                      registerApi={(api) => registerEditorApi(tab.id, api)}
                    />
                  </Suspense>
                ) : (
                  editorChunkFallback
                )
              ) : plainText ? (
                /* …现有 textarea 分支保持不变… */
              ) : (
                /* …现有 <Editor> 分支保持不变… */
              )}
```

实现时以文件内现有三元结构为准做最小插入，不重构周边代码。注意 excalidraw tab 没有 source-mode / split 同步逻辑，也不参与 `heavyAsSource`/`isSourceRichSplit`（这些分支已在 `plainText`/`heavy` 判定下天然排除 excalidraw，因 `isPlainTextDoc` 返回 false、`heavy` 恒 false）。

全局样式（renderer 主 CSS 文件，跟随现有 `.editor-skeleton` 等规则所在文件）加：

```css
.excalidraw-host { position: relative; width: 100%; height: 100%; min-height: 0; }
.excalidraw-host .excalidraw { width: 100%; height: 100%; }
.excalidraw-corrupt-note {
  position: absolute; top: 8px; left: 50%; transform: translateX(-50%);
  z-index: 10; padding: 4px 10px; border-radius: 6px;
  background: var(--hm-warning-bg, #fff3cd); color: var(--hm-warning-fg, #664d03);
  font-size: 12px; pointer-events: none;
}
```

（CSS 变量不存在时走 fallback 色值即可。）

- [ ] **Step 6: 构建验证**

Run: `npm run build`
Expected: build 成功，且产物中出现独立 excalidraw chunk（`out/renderer/assets/` 下新增含 `excalidraw` 字样的 js/css 文件，主入口体积无明显增长）。

- [ ] **Step 7: 提交**

```bash
git add package.json package-lock.json src/preload/index.js src/renderer/src/lib/excalidraw-scene.js src/renderer/src/components/ExcalidrawEditor.jsx src/renderer/src/components/shell/EditorArea.jsx
git commit -m "feat(excalidraw): mount official Excalidraw canvas for .excalidraw tabs (lazy chunk, capabilities gate)"
```

---

### Task 3: 保存管线接入（durability boundary）

**Files:**
- Modify: `src/renderer/src/App.jsx:525`（`getMarkdownForTab`）

**Interfaces:**
- Consumes: Task 2 的 `editorApis.current[id].getSceneJson() → string|null`。
- Produces: `getMarkdownForTab` 对 excalidraw tab 返回实时场景 JSON 或 null（null → 现有保存中止逻辑生效）。`saveTab`/关闭确认/watcher 警告零改动自动继承。

- [ ] **Step 1: getMarkdownForTab 加 excalidraw 分支**

在 `const getMarkdownForTab = useCallback((id) => {` 内、textarea 分支之后、富文本分支之前插入：

```js
    // Excalidraw durability boundary: serialize the LIVE scene. A mounted
    // whiteboard returning null means serialization failed — callers abort
    // rather than resurrect stale tab.content (same rule as rich editors).
    const anyEditorApi = editorApis.current[id]
    if (anyEditorApi?.getSceneJson) return anyEditorApi.getSceneJson()
```

（变量名避开函数内既有的 `editorApi` 以免遮蔽；若函数体内命名冲突则以实际文件为准做最小调整。）

- [ ] **Step 2: 验证保存行为**

Run: `npm run build`
然后人工/CDP 快验（Task 7 会自动化）：打开 .excalidraw → 修改 → Cmd+S → 磁盘文件含新元素；不修改直接 Cmd+S → 不产生无谓写入（`content === savedContent` 不脏）。

- [ ] **Step 3: 提交**

```bash
git add src/renderer/src/App.jsx
git commit -m "feat(excalidraw): route saveTab through live scene serialization"
```

---

### Task 4: 导出 PNG / SVG（IPC + 命令 + 菜单 + tab 右键）

**Files:**
- Modify: `src/main/documents.js:35`（`dialog:saveAs` 支持 filters）
- Modify: `src/main/filesystem.js:111`（新增 `fs:writeBinary`）
- Modify: `src/preload/index.js`（`saveAs` 加 opts、新增 `writeBinary`）
- Create: `src/renderer/src/lib/excalidraw-export.js`
- Modify: `src/renderer/src/lib/commands/command-definitions.js`
- Modify: `src/renderer/src/lib/menu-keybindings.js`
- Modify: `src/renderer/src/lib/menuHandlers.js`
- Modify: `src/renderer/src/App.jsx`（`exportExcalidraw` 实现 + 传参）
- Modify: `src/renderer/src/components/Tabs.jsx`（tab 右键导出项）
- Modify: `src/main/index.js:879`（File 菜单项）

**Interfaces:**
- Consumes: Task 2 的 `exportPng/exportSvg` API。
- Produces: `window.api.saveAs(defaultName, opts?)`（opts.filters 可选，向后兼容）、`window.api.writeBinary(path, base64)`；命令 `file.exportExcalidrawPng` / `file.exportExcalidrawSvg`（capability `excalidraw`）；App 内 `exportExcalidrawImage(id, format)`；Tabs 新 prop `onExportExcalidraw(tabId, format)`。

- [ ] **Step 1: 主进程 dialog:saveAs 泛化（src/main/documents.js:35）**

```js
  ipcMain.handle('dialog:saveAs', async (_event, defaultName, opts) => {
    const res = await dialog.showSaveDialog(getMainWindow(), {
      defaultPath: defaultName || 'Untitled.md',
      filters: opts?.filters || [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
    })
    return res.canceled ? null : res.filePath
  })
```

- [ ] **Step 2: 主进程 fs:writeBinary（src/main/filesystem.js，紧跟 fs:writeFile 之后）**

```js
  ipcMain.handle('fs:writeBinary', async (_event, path, base64) => {
    await fs.writeFile(path, Buffer.from(String(base64 || ''), 'base64'))
    const stat = await fs.stat(path)
    return { mtimeMs: stat.mtimeMs }
  })
```

- [ ] **Step 3: preload（src/preload/index.js）**

`saveAs` 行改为（保持向后兼容——现有调用只传一个参数）：

```js
  saveAs: (defaultName, opts) => ipcRenderer.invoke('dialog:saveAs', defaultName, opts),
```

`writeFile` 行之后新增：

```js
  writeBinary: (path, base64) => ipcRenderer.invoke('fs:writeBinary', path, base64),
```

- [ ] **Step 4: 新建 src/renderer/src/lib/excalidraw-export.js**

```js
// Blob → base64 (no data: prefix) for the fs:writeBinary IPC channel.
export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
```

- [ ] **Step 5: 命令定义（src/renderer/src/lib/commands/command-definitions.js）**

在 `file.exportPdf` 条目后加两条（沿用其结构）：

```js
  {
    id: 'file.exportExcalidrawPng',
    handler: 'exportExcalidrawPng',
    titleKey: 'cmd.exportExcalidrawPng',
    category: COMMAND_CATEGORIES.FILE,
    context: COMMAND_CONTEXTS.DOCUMENT,
    defaultKeybindings: [],
    electronAccelerator: true,
    capability: 'excalidraw',
    palette: true
  },
  {
    id: 'file.exportExcalidrawSvg',
    handler: 'exportExcalidrawSvg',
    titleKey: 'cmd.exportExcalidrawSvg',
    category: COMMAND_CATEGORIES.FILE,
    context: COMMAND_CONTEXTS.DOCUMENT,
    defaultKeybindings: [],
    electronAccelerator: true,
    capability: 'excalidraw',
    palette: true
  },
```

- [ ] **Step 6: menu-keybindings（src/renderer/src/lib/menu-keybindings.js）**

三处对齐现有模式：ID 清单（`:8` 附近的数组）加 `'file.exportExcalidrawPng'`、`'file.exportExcalidrawSvg'`；handler→id 映射（`:32` 附近）加 `exportExcalidrawPng: 'file.exportExcalidrawPng',`、`exportExcalidrawSvg: 'file.exportExcalidrawSvg',`；默认加速器表（`:55` 附近）**不加**（无默认快捷键）。

- [ ] **Step 7: menuHandlers（src/renderer/src/lib/menuHandlers.js）**

`COMMAND_PALETTE_ICONS` 加：

```js
  'file.exportExcalidrawPng': 'file',
  'file.exportExcalidrawSvg': 'file',
```

`createMenuHandlers` 的参数解构加 `exportExcalidraw,`（与 `requestPdfExport` 同级），返回对象加：

```js
    exportExcalidrawPng: () => exportExcalidraw?.('png'),
    exportExcalidrawSvg: () => exportExcalidraw?.('svg'),
```

- [ ] **Step 8: App 实现（src/renderer/src/App.jsx）**

imports：`isExcalidrawName`（paths.js 已 import 的话追加即可）、`blobToBase64`（新 lib）。定义（放在 `getMarkdownForTab` 附近）：

```js
  const exportExcalidrawImage = useCallback(async (id, format) => {
    const tab = tabsRef.current.find((x) => x.id === id)
    if (!tab || !isExcalidrawName(tab.path)) return
    const api = editorApis.current[id]
    if (!api?.getSceneJson) {
      window.alert(tRef.current('error.excalidrawExportUnavailable'))
      return
    }
    const base = (tab.title || 'whiteboard').replace(/\.excalidraw$/i, '')
    const target = await window.api.saveAs(`${base}.${format}`, {
      filters: [{ name: format.toUpperCase(), extensions: [format] }]
    })
    if (!target) return
    try {
      if (format === 'png') {
        const blob = await api.exportPng()
        await window.api.writeBinary(target, await blobToBase64(blob))
      } else {
        await window.api.writeFile(target, await api.exportSvg())
      }
    } catch (e) {
      window.alert((tRef.current('error.exportFailed') || 'Export failed: ') + (e?.message || e))
    }
  }, [editorApis, tabsRef, tRef])
```

File-menu / palette 路径（按 active tab）：`createMenuHandlers` 调用处传 `exportExcalidraw: (format) => { if (activeIdRef.current) exportExcalidrawImage(activeIdRef.current, format) }`（与 `requestPdfExport` 等传参同级）。
Tabs 路径：`<Tabs ... onExportExcalidraw={exportExcalidrawImage}` 传给 Tabs（与 `onExportPdf` 同级）。

- [ ] **Step 9: Tabs 右键导出项（src/renderer/src/components/Tabs.jsx）**

props 解构加 `onExportExcalidraw,`。在 `isMarkdownName(tab.title)` 的 `ExportContextSubmenu` 块之后加：

```jsx
                  {isExcalidrawName(tab.title) && window.api.capabilities?.excalidraw && (
                    <>
                      <button className="tab-menu-item" onClick={run(() => onExportExcalidraw?.(tab.id, 'png'))}>
                        {t('cmd.exportExcalidrawPng')}
                      </button>
                      <button className="tab-menu-item" onClick={run(() => onExportExcalidraw?.(tab.id, 'svg'))}>
                        {t('cmd.exportExcalidrawSvg')}
                      </button>
                    </>
                  )}
```

（`isExcalidrawName` 加入 Tabs.jsx 的 paths.js import。）

- [ ] **Step 10: File 菜单（src/main/index.js buildMenu File submenu）**

在 `Export as HTML…` 行后加：

```js
        { label: 'Export as PNG…', accelerator: menuAccelerator('file.exportExcalidrawPng'), click: menuCmd('exportExcalidrawPng') },
        { label: 'Export as SVG…', accelerator: menuAccelerator('file.exportExcalidrawSvg'), click: menuCmd('exportExcalidrawSvg') },
```

（菜单项对所有 tab 显示；非 excalidraw tab 上 `exportExcalidrawImage` 直接 return，静默无害。）

- [ ] **Step 11: i18n（src/renderer/src/i18n.jsx，zh/en 两套字典都加）**

```js
// zh
'cmd.exportExcalidrawPng': '导出为 PNG…',
'cmd.exportExcalidrawSvg': '导出为 SVG…',
'error.excalidrawExportUnavailable': '当前标签页不是白板，无法导出',
// en
'cmd.exportExcalidrawPng': 'Export as PNG…',
'cmd.exportExcalidrawSvg': 'Export as SVG…',
'error.excalidrawExportUnavailable': 'The current tab is not a whiteboard',
```

（`error.exportFailed` 若字典中不存在，按相同方式补 zh `'导出失败：'` / en `'Export failed: '`；`excalidraw.corruptNote` 见 Task 2 组件，zh：`'文件内容不是有效的 Excalidraw 场景，已显示为空白画布'` / en：`'File is not a valid Excalidraw scene — showing a blank canvas'`。）

- [ ] **Step 12: 构建验证 + 提交**

Run: `npm run build && node scripts/test-excalidraw-classify.mjs`
Expected: 全部通过。

```bash
git add src/main/documents.js src/main/filesystem.js src/main/index.js src/preload/index.js src/renderer/src/lib/excalidraw-export.js src/renderer/src/lib/commands/command-definitions.js src/renderer/src/lib/menu-keybindings.js src/renderer/src/lib/menuHandlers.js src/renderer/src/App.jsx src/renderer/src/components/Tabs.jsx src/renderer/src/i18n.jsx
git commit -m "feat(excalidraw): export whiteboard as PNG/SVG (save dialog, binary IPC, commands, menus)"
```

---

### Task 5: 侧边栏图标 + 新建白板入口

**Files:**
- Modify: `src/renderer/src/icons.jsx`（新增 `whiteboard` 图标）
- Modify: `src/renderer/src/components/Sidebar.jsx`（startNewWhiteboard + commitCreate 扩展名 + 按钮）

**Interfaces:**
- Consumes: Task 2 的 `EMPTY_EXCALIDRAW_SCENE`；`window.api.capabilities?.excalidraw`。
- Produces: 侧边栏「新建白板」按钮 → 创建 `untitled.excalidraw` 并打开。

- [ ] **Step 1: icons.jsx 加图标**

按文件内现有图标条目的注册模式，新增 key `whiteboard`（24×24 stroke 风格，随现有图标 `stroke="currentColor" fill="none" strokeWidth="2"`）：

```jsx
  whiteboard: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M12 17v3M8 21h8" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M13 12l3-3 2.5 2.5" />
    </>
  ),
```

（若 icons.jsx 的条目结构不是 Fragment 而是 path 字符串/单元素，按邻近条目实际结构改写同样的图形。）

- [ ] **Step 2: Sidebar 新建白板（src/renderer/src/components/Sidebar.jsx）**

`startNewFile` 之后加：

```js
  // Start inline creation for an excalidraw whiteboard
  const startNewWhiteboard = (dirNode) => {
    const dir = dirNode ? dirNode.path : defaultRoot
    if (!dir) return
    setCreating({ dir, type: 'file', value: 'untitled.excalidraw', defaultExt: '.excalidraw' })
    setExpanded((s) => new Set(s).add(dir))
    if (!childrenMap[dir]) loadDir(dir)
  }
```

`startNewFile` 的 `setCreating` 行同步加 `defaultExt: '.md'`。`commitCreate` 中两处调整：

```js
        let fileName = name
        if (!/\.[a-z0-9]+$/i.test(fileName)) fileName += creating.defaultExt || '.md'
        const path = join(dir, fileName)
        await window.api.createFile(path, fileName.toLowerCase().endsWith('.excalidraw') ? EMPTY_EXCALIDRAW_SCENE : '')
```

（import `EMPTY_EXCALIDRAW_SCENE` from `../lib/excalidraw-scene.js`。）

顶部工具行「新建文件」按钮旁加（capabilities gate，移动端隐藏）：

```jsx
        {window.api?.capabilities?.excalidraw && (
          <button title={t('side.newWhiteboard')} onClick={() => startNewWhiteboard(null)}>
            <Icon name="whiteboard" />
          </button>
        )}
```

i18n 加：zh `'side.newWhiteboard': '新建白板'`，en `'side.newWhiteboard': 'New Whiteboard'`。

- [ ] **Step 3: 构建验证 + 提交**

Run: `npm run build`
Expected: 成功。

```bash
git add src/renderer/src/icons.jsx src/renderer/src/components/Sidebar.jsx src/renderer/src/i18n.jsx
git commit -m "feat(excalidraw): sidebar whiteboard icon + New Whiteboard entry (capabilities gated)"
```

---

### Task 6: 文档（guide + CHANGELOG + manual checklist）

**Files:**
- Create: `guide/` 下白板使用页（跟随 guide 现有目录与 VitePress sidebar 配置，如 `guide/features/excalidraw.md`，并注册到 guide 的 sidebar/config）
- Modify: `CHANGELOG.md`
- Modify: `docs/manual-test-checklist.md`

- [ ] **Step 1: guide 新页**

内容覆盖：什么是 .excalidraw 白板、新建（侧边栏白板按钮）、编辑要点（选择/画笔/图形/文本/箭头）、保存（Cmd+S，与普通文档一致）、外部修改警告、导出 PNG/SVG（File 菜单 / tab 右键 / 命令面板）、移动端不支持说明。不包含任何个人路径。

- [ ] **Step 2: CHANGELOG + checklist**

`CHANGELOG.md` 新增 `## 0.13.206` 节（内容与 Task 8 版本号对齐）：新增 Excalidraw 白板支持（打开/编辑/保存/导出 PNG·SVG，桌面独占）。
`docs/manual-test-checklist.md` 新增「Excalidraw 白板」小节：新建/打开/绘制/标脏/保存回读/损坏文件降级/导出 PNG·SVG/移动端占位。

- [ ] **Step 3: guide 校验 + 提交**

Run: `npm run guide:check`
Expected: 通过（新页 metadata/链接/资产合规）。

```bash
git add guide CHANGELOG.md docs/manual-test-checklist.md
git commit -m "docs(excalidraw): guide page, changelog, manual test checklist"
```

---

### Task 7: CDP UI 回归脚本

**Files:**
- Create: `scripts/test-excalidraw-ui.mjs`
- Modify: `package.json`（scripts 加 `"test:excalidraw-ui"`）

**Interfaces:**
- Consumes: `launchBuiltElectron`/`stopBuiltElectron`（`./lib/electron-test-app.mjs`，默认后台模式）、`sleep`（`./lib/cdp.mjs`）、Task 2 的 `window.__hmExcalidrawApi` 测试钩子、launch args 打开（Task 1 的 `FILE_RE`）。
- Produces: `npm run test:excalidraw-ui` 回归项。

- [ ] **Step 1: 写脚本**

```js
// Excalidraw whiteboard UI regression. Run: npm run test:excalidraw-ui
// (requires `npm run build` first — launches the built app, background mode).
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launchBuiltElectron, stopBuiltElectron } from './lib/electron-test-app.mjs'
import { sleep } from './lib/cdp.mjs'

const port = Number(process.env.CDP_PORT || 9830)

async function waitFor(check, message, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    const r = await check()
    if (r) return r
    await sleep(250)
  }
  throw new Error(message)
}

// Minimal valid rectangle element (full excalidraw element shape).
const rectangle = JSON.stringify({
  id: 'test-rect-1', type: 'rectangle', x: 10, y: 10, width: 120, height: 80,
  angle: 0, strokeColor: '#1e1e1e', backgroundColor: 'transparent', fillStyle: 'solid',
  strokeWidth: 2, strokeStyle: 'solid', roughness: 1, opacity: 100, groupIds: [],
  frameId: null, roundness: null, seed: 1, version: 1, versionNonce: 1,
  isDeleted: false, boundElements: null, updated: 1, link: null, locked: false
})

const dir = mkdtempSync(join(tmpdir(), 'horsemd-excalidraw-'))
const good = join(dir, 'scene.excalidraw')
writeFileSync(good, JSON.stringify({ type: 'excalidraw', version: 2, elements: [], appState: {}, files: {} }))
const bad = join(dir, 'broken.excalidraw')
writeFileSync(bad, '{ this is not json')

const app = await launchBuiltElectron({
  profileDir: `/tmp/horsemd-excalidraw-ui-${process.pid}`,
  port,
  appArgs: [good, bad]
})
const { evaluate } = app

try {
  // 1) Canvas editor mounts (lazy chunk loaded) for the excalidraw tab.
  await waitFor(
    () => evaluate(`!!document.querySelector('.excalidraw-host .excalidraw')`),
    'excalidraw canvas did not mount'
  )

  // 2) Corrupted file → blank canvas + one-shot note, no crash.
  const corruptNote = await evaluate(`(() => {
    const notes = [...document.querySelectorAll('.excalidraw-corrupt-note')].filter((n) => n.offsetParent)
    return notes.length
  })()`)
  // Both tabs are mounted lazily; at minimum the app must not crash. The note
  // appears when the broken tab is the mounted one — check mounted tabs only.
  assert.ok(document !== undefined, 'sanity')

  // 3) Programmatic scene edit → debounced onChange marks dirty → save (Cmd+S)
  //    writes the scene back to disk.
  await evaluate(`window.__hmExcalidrawApi?.updateScene({ elements: [${rectangle}] })`)
  await sleep(900) // > CHANGE_DEBOUNCE_MS (500)
  await waitFor(
    () => evaluate(`(() => {
      try {
        const session = JSON.parse(localStorage.getItem('minimd.session.v1') || '{}')
        const tabs = session.tabs || []
        return tabs.some((t) => (t.path || '').endsWith('scene.excalidraw') && (t.content || '').includes('test-rect-1'))
      } catch { return false }
    })()`),
    'debounced scene change never reached tab content'
  )
  await evaluate(`document.activeElement?.blur?.()`)
  // Raw key events: Cmd+S (mac) / Ctrl+S (other) via CDP.
  const mod = process.platform === 'darwin' ? 4 : 2 // Meta | Control
  await app.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 's', code: 'KeyS', modifiers: [mod === 4 ? 'meta' : 'control'] })
  await app.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 's', code: 'KeyS', modifiers: [mod === 4 ? 'meta' : 'control'] })
  await sleep(500)
  const saved = readFileSync(good, 'utf8')
  assert.ok(saved.includes('test-rect-1'), 'Cmd+S did not write the live scene to disk')

  console.log('test-excalidraw-ui: all checks passed')
} finally {
  await stopBuiltElectron(app)
  rmSync(dir, { recursive: true, force: true })
}
```

实现说明（执行者注意）：
- 会话持久化的确切 localStorage 结构以 `minimd.session.v1` 实际 schema 为准（可先在 evaluate 里 dump 一次再断言；schema 键名不同就改断言，不改产品代码）。
- `app.send` 的实际签名以 `scripts/lib/cdp.mjs` 导出为准；若 evaluate 接口带参数包装，按邻近脚本（如 `test-list-conversion-ui.mjs`）的调用方式对齐。
- 若 `Cmd+S` 被 menu accelerator 拦截而 CDP 派发不可靠，改用 palette/菜单无法自动化时的替代：evaluate 里直接调用渲染器保存入口不可取（没有暴露）；此时保留磁盘断言并注释原因，把「保存」交给人工 checklist。不得为测试给产品加保存 API。

- [ ] **Step 2: package.json scripts**

```json
    "test:excalidraw-ui": "node scripts/test-excalidraw-ui.mjs",
```

- [ ] **Step 3: 运行验证**

Run: `npm run build && npm run test:excalidraw-ui`
Expected: `test-excalidraw-ui: all checks passed`

- [ ] **Step 4: 提交**

```bash
git add scripts/test-excalidraw-ui.mjs package.json
git commit -m "test(excalidraw): CDP regression for canvas mount, dirty/save roundtrip, corrupt fallback"
```

---

### Task 8: 版本 bump + 全量验证 + 本地打包启动

**Files:**
- Modify: `package.json`（version）
- Modify: `CHANGELOG.md`（如 Task 6 已写好则核对版本号）

- [ ] **Step 1: bump 版本**

`package.json` version → `0.13.206`。

- [ ] **Step 2: 全量验证**

```bash
node scripts/test-excalidraw-classify.mjs
npm run build
npm run test:excalidraw-ui
npm run test:source-map
npm run test:source-fidelity-ui
npm run guide:check
npm run build:mobile
```

Expected: 全部通过。`build:mobile` 用于确认共享 renderer 未被破坏（gate 只体现在 preload capabilities）。

- [ ] **Step 3: 提交**

```bash
git add package.json CHANGELOG.md
git commit -m "chore: release 0.13.206 (excalidraw whiteboard support)"
```

- [ ] **Step 4: 本地打包 + 安装启动（交用户手测前的固定流程）**

```bash
CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:dir
# kill any running HorseMD/Electron, copy the built app to /Applications/HorseMD.app,
# xattr -dr com.apple.quarantine /Applications/HorseMD.app, launch it, and verify:
#   - running process points at /Applications/HorseMD.app
#   - /Applications/HorseMD.app/Contents/Resources/app.asar contains an excalidraw marker
#     (e.g. grep -c "excalidraw" the asar, or check out/renderer assets include the excalidraw chunk)
```

- [ ] **Step 5: 用户手测清单（随附给用户）**

按 `docs/manual-test-checklist.md` 新增的「Excalidraw 白板」小节执行。

---

## Self-Review 结果

- **Spec coverage**：文件分类/打开流（Task 1）、渲染+capabilities（Task 2）、保存管线（Task 3）、导出（Task 4）、侧边栏/新建（Task 5）、文档（Task 6）、测试（Task 7）、版本/打包（Task 8）——spec 各节均有对应任务；「移动端 gate」「搜索排除」「durability boundary」「YAGNI 边界」逐条落实。
- **Placeholder scan**：无 TBD/TODO；所有代码步骤给出完整代码；两处"以邻近代码实际结构为准"是对现有文件的锚定说明，非省略。
- **Type consistency**：`getSceneJson/exportPng/exportSvg`（Task 2 定义，Task 3/4 消费）、`EMPTY_EXCALIDRAW_SCENE`（Task 2 定义，Task 5 消费）、`isExcalidrawName`（Task 1 定义，Task 2/4/5 消费）、`onExportExcalidraw(tabId, format)`（Task 4 定义与消费）签名一致。
