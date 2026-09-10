# Excalidraw 白板支持 — 设计文档

日期：2026-09-10
状态：已获用户批准的设计，待实施计划

## 背景与目标

HorseMD 需要支持 Excalidraw（https://github.com/excalidraw/excalidraw）文件的显示与编辑：独立 `.excalidraw` 文件在标签页中打开为完整 Excalidraw 画布，可编辑、可保存（写回场景 JSON），并支持导出 PNG/SVG。

用户已确认的需求边界：

- 形态：独立 `.excalidraw` 文件（不做 Obsidian 风格 `.excalidraw.md` 内嵌格式）
- 平台：桌面先行；移动端通过 `window.api.capabilities` gate 隐藏
- 导出：JSON 保存 + 右键/菜单导出 PNG、SVG（不做"导出并自动插入 md"）
- 保存模型：完全沿用现有脏标记 / Cmd+S / 关闭确认 / watcher 警告管线，不做自动保存

实现选型（已批准）：方案一 —— 官方 `@excalidraw/excalidraw` React 组件以 lazy chunk 内嵌 tab。否决方案二（iframe + postMessage 桥接，桥接成本高于隔离收益）与只读预览（不满足编辑需求）。

已核实的可行性约束：

- 项目 renderer 已使用 React 18.3.1，与官方组件兼容
- `EditorArea.jsx` 已有成熟 lazy-chunk + Suspense 骨架模式，excalidraw 走同款路径
- `.excalidraw` 文件本质是场景 JSON（`{ type: "excalidraw", version: 2, elements, appState, files }`），纯文本、可 watcher、可 diff
- 官方提供 `serializeAsJSON`、`exportToBlob`、`exportToSvg` 等 API

## 设计

### 1. 文件类型与打开流

- `src/renderer/src/paths.js` 新增 `EXCALIDRAW_RE = /\.excalidraw$/i` 与 `isExcalidrawName()`；`isPlainTextDoc` 需排除 `.excalidraw`（否则落入 textarea 分支）。
- `src/main/index.js` 在 `MD_EXTS` 旁新增 excalidraw 扩展名镜像（启动参数打开、文件过滤器）。全局搜索**排除** `.excalidraw`：JSON 内容搜出来无意义。
- `useFileOps.js` 的 `openPaths`：读文件后按 `isExcalidrawName` 标记 tab（沿用现有 `doc` tab 结构，`content` 存 JSON 文本，`heavy` 恒为 false）。
- Session 恢复、最近文件、watcher 外部修改警告零改动——excalidraw tab 就是普通 doc tab。

### 2. Tab 渲染

- `EditorArea.jsx`：`isExcalidrawName(tab.path)` → 渲染 `lazy(() => import('../ExcalidrawEditor.jsx'))`，复用现有 Suspense 骨架。excalidraw chunk 仅在首个 excalidraw tab 激活时加载，不影响主包与 editor chunk 启动性能。
- `ExcalidrawEditor.jsx` 挂官方 `<Excalidraw>`：`initialData = JSON.parse(tab.content)`；损坏/空 JSON → 空白画布 + 状态栏一次性错误提示，不弹窗打断。
- 通过现有 `editorApis` 注册机制暴露最小 API：`getSceneJson()`、`isDirty()`。

### 3. 保存与数据流

- `onChange(elements, appState, files)` → 500ms 防抖 → `serializeAsJSON({ elements, appState, files })` → 更新 `tab.content` 并标脏（复用现有标脏路径）。
- `saveTab` 对 excalidraw tab：`getMarkdownForTab` 分支返回编辑器 API 的 `getSceneJson()`——对齐既有 durability boundary 规则（必须取实时序列化结果，不许回落到可能过期的 `tab.content`；取不到实时结果时中止保存而非复活旧数据）。
- 未保存关闭确认、Cmd+S、rename、外部修改警告全部自动继承。

### 4. 导出 PNG / SVG

- 不在画布内塞自定义按钮；入口放 tab 右键菜单 + 文件菜单：「导出为 PNG…」「导出为 SVG…」。
- 实现：`exportToBlob` / `exportToSvg`（用当前 `elements/appState/files`）→ 复用现有导出文件对话框 IPC 写盘，默认文件名 = tab 名。

### 5. 侧边栏与新建

- 文件树中 `.excalidraw` 显示专用图标（icons.jsx 模式），点击走 `openPaths`。
- 新建菜单增加「新建白板」→ 生成 `untitled.excalidraw`，内容为最小合法场景 `{"type":"excalidraw","version":2,"elements":[],"appState":{},"files":{}}`。

### 6. 移动端 gate

- 收敛为一处：`EditorArea` 渲染分支前查 `window.api.capabilities`（移动 shim 不声明 `excalidraw: true`）→ 显示"桌面版支持白板编辑"占位卡片；侧边栏「新建白板」入口同样按 capabilities 隐藏。符合"新能力双端同步或 gate"的跨平台契约。

### 7. 错误处理

- 损坏 JSON：空白画布 + 一次性提示；保存仍写回当前画布状态（用户显式保存才覆盖磁盘）。
- 取不到实时序列化结果：保存中止（不写旧数据），与富文本保存边界行为一致。
- 官方组件加载失败（chunk 错误）：Suspense error boundary 显示重试占位。

## 明确不做（YAGNI）

`.excalidraw.md` 内嵌格式、导出后自动插图到 md、自动保存、实时协作、自定义图形库。

## 测试与验证

- 新增 `scripts/test-excalidraw-ui.mjs`（CDP 后台模式，`launchBuiltElectron` 默认隐藏窗口）：打开/程序化添加图形（dispatch 场景而非模拟手绘拖拽）/标脏/保存回读/损坏 JSON 降级/导出菜单存在性。
- `npm run build` 必过。
- guide 新增白板使用页；`CHANGELOG.md` 记录；`docs/manual-test-checklist.md` 增补一节。
- 合入即 patch version bump（项目惯例）。

## 涉及文件清单

| 文件 | 变更 |
| --- | --- |
| `package.json` | 新增 `@excalidraw/excalidraw` 依赖 |
| `src/renderer/src/paths.js` | `EXCALIDRAW_RE` / `isExcalidrawName` / `isPlainTextDoc` 排除 |
| `src/main/index.js` | 扩展名镜像、文件过滤器、全局搜索排除 |
| `src/renderer/src/hooks/useFileOps.js` | openPaths 标记 excalidraw tab |
| `src/renderer/src/components/shell/EditorArea.jsx` | 渲染分支 + capabilities gate |
| `src/renderer/src/components/ExcalidrawEditor.jsx` | 新文件：官方组件封装 |
| `src/renderer/src/App.jsx` | `getMarkdownForTab` 分支、导出菜单动作 |
| `src/renderer/src/lib/menuHandlers.js` / `Sidebar.jsx` / `icons.jsx` | 新建白板入口、树图标、导出菜单 |
| `src/renderer/src/platform/capacitor-api.js` | capabilities 不声明 excalidraw（隐式 gate） |
| `scripts/test-excalidraw-ui.mjs` | 新增 CDP 回归脚本 |
| `guide/`、`CHANGELOG.md`、`docs/manual-test-checklist.md` | 文档与清单 |
