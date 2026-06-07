---
title: context 构造协议（buildInputItems 每轮合成什么）
description: thinkable 如何把 ThreadContext 合成为 LLM 输入 items，及稳定层/事件层的分界与预算现状
activates_on:
  "window::root": "show_content"
---

# context 构造：每轮 LLM 输入怎么来

Object 不知道 context 之外的任何事——内存/文件系统里再多状态，没进当前 thread 的 context 就不存在。这是 thinkable 的关键约束。

## 两层结构（不能混用）

- **稳定状态层（system prompt / XML）**：表达「我现在拥有什么」——身份、知识、窗口、任务、环境。
- **过程事件层（LLM messages / input items）**：表达「我之前经历了什么」——历史 ProcessEvent 流。

## ThreadContext 主要字段（`packages/@ooc/core/thinkable/context/index.ts`）

- `status`：调度状态（running / waiting / done / failed / paused）
- `inbox` / `outbox`：当前 thread 的协作消息
- `contextWindows`：当前打开的信息/行动窗口（统一抽象 = Object in context）
- `events`：历史 ProcessEvent 流（字段名 events，类型 `ProcessEvent[]`）
- `threadLocalData`：程序窗口等运行时共享的线程局部数据
- `parentThreadId` / `creatorThreadId` / `childThreadIds` 等：Thread Tree 拓扑
- `persistence`：持久化锚点（缺失则只在内存运行）

## 每轮合成进 LLM 输入的三块（非 ThreadContext 字段）

入口 `buildInputItems()`（`context/index.ts:273`）：

1. **self / instructions**：`loadSelfInstructions()`（`context/index.ts:361`）由 persistence 派生 stone 路径读 `self.md`，注入 `LlmGenerateParams.instructions`。
2. **knowledge**：`collectExecutableKnowledgeEntries(thread.contextWindows, thread)` 从窗口状态派生 knowledge_window 集合。
3. **[ooc:paths]**：`buildPathsItem()`（`context/index.ts:327`）合成环境路径 system message（world_root / object_id / object_stone_dir / object_flow_dir / session_id / current_thread_id / current_thread_dir）。

## 渲染管线与预算

- `createDefaultPipeline()`（`context/pipeline.ts:97`）串接 activator / protocol / peer / knowledge 等 processor 产出 derived 窗口。
- 预算 `loadBudgetThresholds()`（`context/budget.ts:47`）只保留软/硬阈值；**自动衰减 / emergency guard 已退役**，compressLevel 仅由显式 compress/expand 与渲染器消费（`context/budget.ts:14`）。

## 当前债

derived 窗口此前不写回 `thread.contextWindows`，靠 transient `_renderedWindows` 兜底观测（`context/index.ts:287`）——mock 路径与真实渲染存在两套读取分支，长期应收敛为一套。
