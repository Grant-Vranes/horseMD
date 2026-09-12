# Draw.io 本地集成设计（.drawio 标签页编辑）

日期：2026-09-12
状态：设计已获用户批准，待实现

## 目标

让 HorseMD 支持打开、编辑、保存 `.drawio` 文件（diagrams.net / drawio 格式），交互模式与现有 Excalidraw 白板一致：常驻标签页编辑器、基线防脏标记、走现有保存管线。首版仅桌面（capabilities 门控），编辑器资源**本地打包**，完全离线可用。

非目标（二期候选）：

- Markdown 文档内嵌 `.drawio` 引用渲染预览
- 移动端（Capacitor）支持
- `.drawio.png` / `.vsdx` 等衍生格式
- drawio 资源裁剪（语言包/模板瘦身）

## 背景与关键事实（已从 drawio dev 源码核实）

- drawio 无官方 npm React 组件；官方嵌入方式是 iframe + JSON postMessage 协议
  （`?embed=1&proto=json`）。
- `configure` 无需单独发送；在 `load` 消息上直接携带 `autosave: 1`
  （`diagramly/EditorUi.js` 的 `action == 'load'` 分支）。启用后 drawio 在编辑
  变化后按 `autosaveDelay`（默认约 1500–2000ms）主动向宿主发
  `{event: 'save', xml}`，**编辑器不退出**——正好映射 HorseMD 的
  "用户编辑 → 脏标记 → 保存管线"。
- 不设 `saveAndExit=1` 时，Ctrl+S 与 Save 按钮均为普通 save 消息，不退出；
  Exit 按钮可用 `noExitBtn=1` 隐藏。
- drawio embed 消息为扁平 JSON：宿主→iframe 用 `{action: 'load', xml,
  autosave: 1}` / `{action: 'export', format}`；iframe→宿主用
  `{event: 'init'}` / `{event: 'save', xml}` / `{event: 'export', format, data}`。
- `.drawio` 文件是 XML：`<mxfile>` 含多个 `<diagram>`（多页），可能
  deflate+base64 压缩或未压缩。XML 原样进出，由 drawio 自身管理，宿主不解析语义。

## 架构

### 1. 资源打包与加载

- 固定 pin 一个 drawio release 版本，将其 webapp 静态构建（`index.html`、
  `js/app.min.js`、stencils、`resources/` 等）放入 `resources/drawio/`，
  随 electron-builder 打包。
- 主进程注册自定义协议 `drawio-local://`（standard + secure + supportFetchAPI），
  映射到该目录。**不用 file:// iframe**：dev 模式 renderer 跑在 localhost，
  file:// iframe 会被拦截；统一协议让 dev/prod 行为一致。
- renderer 通过 IPC `window.api.drawio.getEditorUrl()` 获取 iframe 地址：
  `drawio-local://index.html?embed=1&proto=json&configure=1&autosave=1&ui=min&noExitBtn=1&spin=1&lang=<zh|en>`
  （lang 跟随应用 i18n 语言）。
- 预期 `resources/drawio/` 原始体积约 54MB（官方 draw.war 解包后），安装包
  经压缩后增量更小；`resources/drawio/` 不入库，由获取脚本按 pin 版本下载。

### 2. 组件与数据流（复刻 Excalidraw 模式）

- `src/renderer/src/components/DrawioEditor.jsx`：仅由 `EditorArea` 经 `lazy()`
  挂载的独立 chunk（组件 + iframe + postMessage 通道），主编辑器 chunk 不评估它。
- 生命周期：iframe 发 `init` → 宿主发 `configure {autosave: 1}` → 宿主发
  `load {xml: tab.content}`。
- 收 `save {xml}` → `onChange(xml)`。照搬 Excalidraw 的基线防脏标记：
  首次收到的序列化结果为基线（reopen / 视口变化不脏），其后与基线不同的
  save 才是用户编辑；dirty 判定仍由 tab-state 负责。
- `src/renderer/src/lib/drawio-file.js`：
  - 空图模板（标准未压缩 `<mxfile>` + 单 `<diagram>`）
  - 有效性校验：内容含 `<mxfile` 或 `<mxGraphModel` 才视为有效 drawio XML
  - 损坏文件 → 空白画布 + 一次性提示（同 Excalidraw 的 corrupt 规则）
- 多页 XML 原样进出。
- `EditorArea.jsx`：`isDrawioName(tab.path)` 判定 → `richEligible=false`、
  不进 source/rich split；capabilities `drawio` 为 false 时显示降级提示
  （同 Excalidraw 的 disabled 分支）。

### 3. 主进程与 capabilities

- `src/main/index.js`：`FILE_EXTS` 增加 `'drawio'`（保持 MD_RE 不变，
  全局搜索继续排除 `.drawio`）。
- `src/preload/index.js` capabilities 增加 `drawio: true`；
  `capacitor-api.js` 增加 `drawio: false`。
- IPC：`drawio:getEditorUrl` 返回 iframe URL；导出沿用 Excalidraw 的二进制
  IPC 保存对话框管线（`excalidraw-export` 同款消息/通道命名风格）。
- 会话恢复、未保存 scratch 标签页行为继承现有 tab 体系（content 为文本，天然兼容）。

### 4. 入口

- 侧边栏新建菜单/右键菜单增加"新建绘图"（`window.api?.capabilities?.drawio` 门控），
  默认名 `untitled.drawio`，落盘空模板（同 `Sidebar.jsx` 的 excalidraw 分支）。
- 文件管理器双击 / 拖入 / 启动参数打开 `.drawio`（`FILE_EXTS` 覆盖）。

### 5. 导出

- `DrawioEditor` 经 `registerApi` 暴露 `getXml / exportPng / exportSvg`。
- PNG/SVG 通过 drawio `export` 消息（format + 返回 data URL）获取，
  走现有保存对话框 + 二进制 IPC 写盘；drawio 不可用或超时时报错失败，
  不静默成功。

## 错误处理

- drawio 资源缺失 / 协议注册失败：标签页显示内联错误提示（同 Excalidraw
  export-unavailable 的降级文案风格），不影响其他标签页。
- save 消息的 XML 为空或校验失败：忽略该次 save 并保留基线，避免空写盘。
- 损坏 `.drawio`：空白画布 + 一次性 notice（corrupt 标志）。
- iframe 加载超时（如资源损坏）：显示重试按钮。

## 测试与交付

- CDP UI 回归脚本 `scripts/test-drawio-ui.mjs`：打开→编辑→save 消息→脏标记
  →保存→重开保真；损坏文件回退；capabilities 门控；导出触发。
- `npm run build` + `npm run build:mobile` 通过。
- `guide/` 新增 Drawio 使用页；`CHANGELOG.md`、`docs/manual-test-checklist.md`
  更新；patch 版本号照例递增。

## 风险

- drawio webapp 静态资源版本与协议字段随上游演进：pin 固定版本并在
  `resources/drawio/VERSION` 记录来源，升级为显式人工动作。
- iframe 消息需校验 `event.source`/origin 指向 `drawio-local://`，防止伪造消息。
- 包体增长属预期；如需瘦身二期处理。
