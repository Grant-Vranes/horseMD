# 图片路径常驻角标（editor-image-src-badge）设计

日期：2026-07-06　状态：已确认（方案 C）
版本目标：0.13.253 → 0.13.254

## 目标

在富文本编辑视图中，每张图片下方常驻显示其在 Markdown 源中的 `src` 路径，
方便用户查看/排查图片来源。受设置项控制，默认开启。

## 需求（已确认）

1. 显示原始 `src`（文档中写的样子）：相对路径原样、网络 URL 原样。
2. `data:` 内嵌图片显示固定文案「(内嵌图片)」，不展开 base64。
3. 超长路径中间 `…` 截断；悬停角标时原生 `title` 显示完整路径。
4. 块级 `image_block` 与行内 `image` 均显示。
5. 设置开关 `showImageSrcBadge`，默认 `true`；关闭后立即隐藏（编辑器重建或插件响应均可，以实现简单者为准）。
6. 角标纯展示层：不进入文档、不影响序列化/保存/复制/PDF 导出。

## 实现方案

### 新模块 `src/renderer/src/components/editor-image-src-badge.js`

- 导出 `createImageSrcBadgePlugin({ enabled })`：ProseMirror 插件，加入
  `editor-crepe-setup.js` 的 `prosePluginsCtx`（末尾追加）。
- 实现：遍历文档中的 `image_block` / `image` 节点，用 widget decoration
  （`side` 取负值使角标渲染在图片节点之后、下一段落之前，具体以实际 DOM
  效果为准：目标是视觉上出现在图片正下方）在节点后注入
  `<span class="hm-image-src-badge">`：
  - 文本 = 节点 attrs.src；`data:` 前缀 → `内嵌图片`；
  - 截断：中间省略，保留头尾各约 24 字符；`title` = 完整 src；
  - 已存在同名角标（如行内图多个）各自独立 widget。
- 状态：plugin state 存 `enabled`，导出 setter（通过 `tr.setMeta`）让设置
  切换时不重建编辑器即可生效。
- 遵循项目规范：通过 `prosePluginsCtx` 注册，不碰 `editorViewOptionsCtx.nodeViews`。

### 样式 `src/renderer/src/styles/`（跟随现有编辑器样式文件位置）

- `.hm-image-src-badge`：10–11px、主题弱化色（跟随暗/亮主题变量）、
  `user-select: none`、`pointer-events: none`（title 提示改由父级或保留
  pointer-events 以支持悬停 title——以可悬停为准，但不参与选区）。
- 块级图下加少量上边距；行内图角标 `margin-left: 4px`。

### 设置

- `src/renderer/src/settings.js`：`DEFAULTS` 增加 `showImageSrcBadge: true`，
  读取时归一化（非布尔回退默认）。
- `SettingsView.jsx`：在编辑器相关分组加一个开关行（复用现有 switch 样式），
  文案「显示图片路径」。

### Editor.jsx / Editor.jsx 周边接线

- `Editor.jsx` 读取 settings（已有 settings 订阅机制），将
  `showImageSrcBadge` 传给 `createConfiguredCrepe`；设置变化时通过插件
  meta 更新，不 remount Crepe。
- `editor-crepe-setup.js`：`createConfiguredCrepe` 新增可选参数
  `imageSrcBadge`（初始值 + 订阅变化回调），在 `prosePluginsCtx` 追加插件。

### 复制/导出隔离

- `editor-copy.js`（text/html 克隆链路）与 `normalizeWebPasteHtml` 出口处：
  移除 `.hm-image-src-badge` 节点（一行 `querySelectorAll(...).remove()`）。
- PDF 导出走 `getPdfSource()` 结构化 HTML，不经过编辑器 DOM，预期天然隔离；
  测试中确认。

## 边界与不变量

- 角标不进入 ProseMirror 文档 → 保存/序列化零影响。
- `markdownUpdated` 脏标记不受 decoration 影响。
- 只读模式：角标同样显示（信息展示与编辑无关）。
- 移动端共享渲染器，行为一致。

## 验证

- 新增 `scripts/test-image-src-badge-ui.mjs`（CDP，`launchBuiltElectron`
  背景模式，`human-input` 不涉及——纯展示）：
  1. 打开含 本地相对路径 / 网络 URL / data: 图片的文档 → 角标文本与截断正确、
     title 为完整路径、data: 显示「内嵌图片」；
  2. 编辑图片 src（右键/替换）→ 角标同步更新；
  3. 复制含图内容 → 剪贴板 text/html 不含 `.hm-image-src-badge`；
  4. 设置关闭开关 → 角标消失，重新打开 → 恢复；重启后记住状态；
  5. `npm run build` + 既有 `test:issue-98-ui`、PDF 相关 UI 测试不回归。
- 手测清单：暗/亮主题视觉、行内多图、大文档滚动无抖动（decoration 为零
  布局读取，仅挂载时计算）。

## 交付

- 版本 0.13.254，`CHANGELOG.md` 记录；`guide/` 用户指南「图片」页补充说明
  与开关位置；构建并安装到 `/Applications/HorseMD.app` 供手测。
