---
title: Excalidraw 白板
description: 在 HorseMD 中新建、编辑和保存 .excalidraw 白板，并导出为 PNG 或 SVG 图片。
---

# Excalidraw 白板

<span class="version-badge">适用于 HorseMD v0.13.206</span>

HorseMD 支持直接打开和编辑 [Excalidraw](https://excalidraw.com) 格式的手绘白板文件（`.excalidraw`）。白板以独立标签页打开，使用 Excalidraw 官方画布编辑器，保存时仍是标准的 `.excalidraw` JSON 文件，可以继续在 Excalidraw 或其他兼容工具中打开。

## 新建白板

点击左侧边栏顶部工具行的**白板图标**（新建文件按钮旁边），会创建一个 `untitled.excalidraw` 文件并打开空白画布；输入文件名后回车确认。该按钮仅在桌面版可用。

## 编辑要点

白板画布与 Excalidraw 官方编辑器一致：

- **选择工具**：框选、点选、移动、缩放图形
- **手绘画笔**：自由绘制线条
- **图形**：矩形、圆形、菱形、箭头、连线
- **文本**：双击画布任意位置输入文字
- **橡皮擦**：擦除不需要的元素

画布底部有 Excalidraw 自带的工具栏和缩放控件，可以按 Excalidraw 的习惯操作。

## 保存

白板与其他文档使用相同的保存模型：编辑后标签页出现未保存标记，`Cmd/Ctrl+S` 保存到磁盘。没有修改时保存不会产生多余写入。

如果文件在 HorseMD 之外被修改，重新聚焦时会按普通文档的规则提示外部修改。

## 导出 PNG / SVG

三种入口都可以把当前白板导出为图片：

- **文件菜单**：`文件 → Export as PNG…` / `Export as SVG…`
- **标签页右键菜单**：在白板标签页上右键选择导出格式
- **命令面板**（`Cmd/Ctrl+P`）：搜索"导出 PNG"或"导出 SVG"

选择保存位置后，HorseMD 会把整个画布（含背景）渲染为 PNG 位图或 SVG 矢量图写入所选路径。

## 移动端

Excalidraw 白板编辑目前仅桌面版支持。移动端打开 `.excalidraw` 文件会显示占位提示，侧边栏也不显示新建白板按钮。
