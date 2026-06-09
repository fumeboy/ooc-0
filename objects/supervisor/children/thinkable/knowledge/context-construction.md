---
title: context 构造协议（buildInputItems 每轮合成什么）
description: thinkable 如何把 ThreadContext 合成为 LLM 输入 items，及稳定层/事件层的分界与预算现状
activates_on:
  "object::root": "show_content"
---

# context 构造：每轮 LLM 输入怎么来

Object 不知道 context 之外的任何事——内存/文件系统里再多状态，没进当前 thread 的 context 就不存在。这是 thinkable 的关键约束。

## 两层结构（不能混用）

- **稳定状态层（system prompt / XML）**：表达「我现在拥有什么」——身份、知识、窗口、任务、环境。
- **过程事件层（LLM messages / input items）**：表达「我之前经历了什么」——历史 ProcessEvent 流。

## ThreadContext 主要字段（内存态，`packages/@ooc/core/thinkable/context/index.ts`）

- `status`：调度状态（running / waiting / done / failed / paused）
- `inbox` / `outbox`：当前 thread 的协作消息
- `contextWindows`：当前打开的信息/行动窗口（统一抽象 = Object in context）。注意这是**内存态**字段——落盘时不进 thread.json，而是单写 `flows/<sid>/objects/<id>/threads/<tid>/` 的 thread-context.json（persistable §6/§10，thread.json 已退役 contextWindows，由 persistable 负责）。
- `events`：历史 ProcessEvent 流（字段名 events，类型 `ProcessEvent[]`）
- `threadLocalData`：程序窗口等运行时共享的线程局部数据
- `parentThreadId` / `creatorThreadId` / `childThreadIds` 等：Thread Tree 拓扑
- `persistence`：持久化锚点（缺失则只在内存运行）
- `_renderedWindows`：transient 观测镜像，记录 pipeline 实际渲染出的窗口集（base + derived），永不持久化

## 每轮合成进 LLM 输入的几块（非 ThreadContext 直接字段）

入口 `buildInputItems()`（`context/index.ts:337`）：

1. **稳定窗口快照**：`createDefaultPipeline().run(thread)` 产出 snapshot，`XmlRenderer` 渲成一条 system message；其中 knowledge / protocol / peer 等 derived 窗口由 pipeline 内的 processor 合成（含已 reconcile 回 context 的 peer 窗口）。
2. **self / instructions**：`loadSelfInstructions()`（`context/index.ts:434`）经 `resolveStoneIdentityRef(..,"read")` 解析 stone/worktree 路径读 `self.md`，注入 `LlmGenerateParams.instructions`。
3. **[ooc:paths]**：`buildPathsItem()`（`context/index.ts:400`）合成环境路径 system message（world_root / object_id / object_stone_dir / object_flow_dir / session_id / current_thread_id / current_thread_dir）；business session 命中已建 worktree 时 object_stone_dir 显示 `flows/<sid>/objects/<id>/`，否则 main。
4. **历史事件流**：`thread.events` 经 `processEventToItems` 展开为 transcript input items（`_foldedBy` 折叠的事件跳过）。

## 渲染管线与预算

- `createDefaultPipeline()`（`context/pipeline.ts:97`）串接 activator / protocol / peer / knowledge 等 processor 产出 derived 窗口。
- 预算 `loadBudgetThresholds()`（`context/budget.ts:47`）只保留软/硬阈值；**自动衰减 / emergency guard 已退役**，预算改由 `BudgetManager.allocate` 排序纳入/排除窗口实施，compressLevel 仅由显式 compress/expand 与渲染器消费（`context/budget.ts:8`）。

## 当前债

derived 窗口不写回 `thread.contextWindows`，靠 transient `_renderedWindows` 兜底观测（`context/index.ts:360`）——mock 路径与真实渲染存在两套读取分支，长期应收敛为一套。
