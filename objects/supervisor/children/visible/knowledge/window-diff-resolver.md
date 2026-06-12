---
title: window diff 渲染 — object 经 visible/diff.tsx 掌控「变化的展示」
description: loop diff 视图按 window 解析到所属 object 自有 diff 组件，resolveWindowDiff 四档回退
activates_on:
  "object::root": "show_description"
---

# window diff 渲染解析层

Object 完整掌控自己作为 window 的呈现，分三条对称的线（readable↔visible 镜像权威见 readable 维度 `readable-vs-visible`）：

- **visible/index.tsx**（visible）：当前的*展示* —— `resolveWindowVisible`。
- **windowMethods + window.state**（readable）：变化的*控制* —— `set_viewport` 等。
- **visible/diff.tsx**（visible）：变化的*展示* —— `resolveWindowDiff`（本篇）。

thread context 的 loop diff 视图（`LoopDiffView`，比对相邻两轮 thinkloop 同 id window 的快照）展开某 window 时，统一「按 window 解析到它所属 object 自己的 diff 组件渲染」，**无 per-type switch、无 web 包硬编码注册表**。

## 约定

object 的 `visible/diff.tsx` **default export** 一个 `({previous, current}: WindowDiffProps) => JSX` 组件（对称 `visible/index.tsx` 的 `({window})`）。`previous`/`current` 是相邻两 loop 的同 id window 快照；added → previous 缺省，removed → current 缺省。类型为 `unknown`（实际可能是精简 `WindowSnapshotEntry` 或 fetch 来的完整 window，组件按需防御性 probe）。

## resolveWindowDiff 四档回退

`packages/@ooc/web/src/domains/sessions/components/window-diff/resolveWindowDiff.tsx` 的 `resolveWindowDiffKind` 按 `current?.type ?? previous?.type` 解析：

1. **builtin 静态** —— `BUILTIN_DIFF[type]` 命中 → builtin 自己的 diff 组件。有 builtin 目录的 file/knowledge/search/program/plan 在 `@ooc/builtins/<type>/visible/diff`；无 builtin 目录的 talk/do/method_exec 在 web 本地（`builtin-diff-registry.tsx:29-31`）；`relation` 型当前未注册、走 dynamic-diff → before-after 降级。
2. **dynamic-diff（user-defined）** —— object 写了自己的 `visible/diff.tsx` → 动态加载（`clientSourceUrl` 带 `?file=diff` 白名单寻址 `visible/diff.tsx`，无 legacy 回退；缺失干净 404）。
3. **before-after（回退）** —— object 没写 diff.tsx → 用 `WindowVisible` 并列渲 previous + current（复用线 A 动态加载，让未写 diff 的 object 也有比裸 JSON 好的降级）。
4. **JSON 兜底** —— `FallbackJsonDiff`。

`WindowDiff` 渲染入口：dynamic-diff 走 Suspense + ErrorBoundary，notFound / 加载失败回退 before-after。

## 数据来源不对称（与 visible 的关键差异）

diff 需要 `previous` + `current` 两份快照，内容级 diff 还可能依赖**后端附挂的 payload**：

- **file**：`current.fileDiff = {previousContent, currentContent, path}` 由后端预算并挂在 snapshot entry 上 → `LoopDiffView` 走 entry 直传、免 fetch。
- **其它所有 type**：精简 `WindowSnapshotEntry` 没有 content/transcript，`LoopDiffView` 必须 fetch 当前 + 上一 loop 的 `input.json`、`extractWindowFromInput` 取完整 window 对象再喂 `WindowDiff`（精简 entry 绝不直传非 file 路径，否则空壳静默退化）。

## 边界

visible 只管「按 window 解析到 diff 组件 + 渲染回退链」；各 builtin diff 组件内部的语义级 diff 逻辑（file 行级 CodeMirror merge / talk 消息级 / plan step 级 …）随组件搬迁、行为不变。`client-source-url` 的 `?file=diff` 寻址见 [[visible-entry]]。
