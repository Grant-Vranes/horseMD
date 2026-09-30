# 源码同步警告降扰设计（deferred warning）

日期：2026-10-01
状态：已与用户确认方向（方案 A 为主，C 为后续跟进）

## 问题

富文本编辑中，当事务→源码的映射器无法证明候选 Markdown 与 ProseMirror
文档等价时，`Editor.jsx` 的 `reportSourceSyncFailure()` 会在**失败瞬间**
立即弹出 sticky toast（`save.sourceSyncMismatch`）。

但现有同步管线本身已有自动恢复机制：失败后不提交，下一次
`markdownUpdated` 回调或强制 flush 会拿累计增量对同一 canonical 基线
重试，多数情况下几百毫秒内即恢复。用户却在恢复前已经看到一个需要手动
关闭的警告。引用块（blockquote）内 Enter / 删除 / 空格编辑是高频触发
场景（对应 `blockquote-{paragraph,split,join,exit}` 四个事务 owner 的
rejection）。

## 目标

1. 短暂、可自愈的同步失败**不再打扰用户**（不弹或自动消失）。
2. 持久失败仍然提示，且**不降低 fail-closed 安全性**（该不提交的照旧
   不提交，dirty 状态照旧保留）。
3. 失败与恢复情况写入现有 trace，为后续修根因（方案 C）留数据。

## 非目标

- 不修改任何 mapper / owner 的校验逻辑（fail-closed 语义原样保留）。
- 不改动保存路径（`saveTab` / `commitAllLive`）的复核逻辑。
- 不处理文案翻译以外的 i18n 变更（新增 trace 事件无需翻译）。

## 设计

全部改动集中在 `src/renderer/src/components/Editor.jsx` 的 warning
路径附近，新增一个模块级小的「pending warning 管理器」（约 60–100
行，就地实现或提为 `editor-source-sync-warning.js` 小模块，视
Editor.jsx 局部耦合度决定）。

### 1. 延迟确认

`reportSourceSyncFailure(reason)` 改为：

- 不再立即 `fireToast`。
- 登记 pending 警告 `{ signature, reason, at }`（同签名 1.5s 内重复
  失败沿用现有去重节流，不重复登记）。
- 启动一个 **600ms 观察窗口**（setTimeout；重复登记重置计时器）。

### 2. 恢复取消

在所有「源码发布成功」的路径上调用新增的
`noteSourceSyncRecovery(site)`：

- `sourceSyncBridge.publishPrepared(...)` 返回 `ok === true` 的各处
  （`Editor.jsx` 约 2488 / 3244 / 3283 等，以及
  `publishPendingStructuralTransactionImpl` 的成功返回）。
- scratch canonical fallback 成功处同样调用。

`noteSourceSyncRecovery` 若存在 pending 警告：取消窗口、清除登记，
并 trace 一条 `source-sync-recovered`（含 reason 与耗时），**不弹任何
toast**。

### 3. 窗口到期提示（降级）

观察窗口结束时 pending 警告仍存在：

- 首次失败 → `fireToast(t('save.sourceSyncMismatch'), { duration: 6000 })`
  （非 sticky，自动消失；`useAppLifecycle` 中非 sticky toast 默认
  1600ms，`duration` 优先，文案较长故给 6000ms）。
- **升级为 sticky 的条件**：同签名在 3s 内第二次到达窗口到期（即连续
  两次未恢复），此时回到现状 `{ sticky: true }`。升级计数按签名在
  3s 滑动窗口内统计。

### 4. Trace

- 失败仍走现有 `traceEditorEvent('source-sync-integrity-failure')` 与
  evidence-dump（不变）。
- 新增 `traceEditorEvent('source-sync-warning-deferred', { reason })`
  （登记时）与 `traceEditorEvent('source-sync-recovered', { reason,
  ms })`（恢复时），便于统计真实自愈率，指导方案 C 的优先级。

### 5. 边界情况

- **强制 flush / 保存时**：`commitAllLive` / 强制 flush 若在观察窗口内
  发生且失败路径再次触发 `reportSourceSyncFailure`，按同一套延迟逻辑
  处理；但**保存时的同步失败**（`useFileOps.js` `save.sourceSyncFailed`
  等独立路径）不在本设计范围，保持原样。
- **标签页销毁 / 编辑器重建**：观察窗口计时器必须在编辑器 destroy 清理
  中清除（避免对已卸载编辑器 fireToast）。
- **sticky 一次后**：sticky toast 已显示时，若随后恢复，不撤回已显示
  的 toast（用户可能已看到）；只清除 pending。
- **多签名并发**：pending 登记按签名各持一条，窗口各自计时；任一恢复
  事件只取消对应签名。
- **交替签名的失败**（如 a,b,a,b…）：各自独立计时，永不升级 sticky——
  每个签名仍会在各自窗口到期时提示，记为已知限制，方案 C 阶段再评估。
- **升级计数不扣除中间的恢复事件**：3s 内两次到期即升级，即使中间发生
  过恢复（两次提示在 3s 内本身就足够吵，保持该行为）。

## 测试

- 现有全部 `scripts/test-*-ui.mjs` 中断言 warningPattern 的用例是按
  「窗口结束后 toast 存在」语义写的，需确认其在 600ms 窗口后仍能捕获
  toast（这些用例轮询窗口通常 > 1s，预期不破坏；若有用例失败，调整
  用例等待而非放宽断言）。
- 新增 `scripts/test-source-sync-deferred-warning-ui.mjs`（真实
  Electron CDP 会话）：
  1. **自愈路径**：构造一个已知会瞬时失败随后恢复的操作（以
     blockquote 内 Enter + 立即继续输入为候选，实际以复现为准），
     断言整个会话**不出现** `save.sourceSyncMismatch` toast。
  2. **持久失败路径**：直接在测试页注入调用
     `reportSourceSyncFailure('test-reason')` 且期间无恢复事件，断言
     ~600ms 后出现**非 sticky** toast 并在 ~6s 后消失。
  3. **升级路径**：3s 内注入两次同签名失败且无恢复，断言第二次为
     sticky。
- 单元层（如管理器提为独立模块）：Node 直测计时/取消/升级状态机。

## 后续（方案 C，不在本 spec 范围）

依据 `source-sync-recovered` / `source-sync-integrity-failure` 的
trace 统计，对高频 rejection reason 逐个修 blockquote mapper 根因。
