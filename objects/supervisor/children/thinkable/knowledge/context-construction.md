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

## context_windows 的六个来源（合成 ≠ 持久化）

`thread.contextWindows` 只是持久化那一份；每轮渲染前 synthesizer（`knowledge/synthesizer.ts:collectExecutableKnowledgeEntries`）把它和多组**合成窗口**拼成最终 window 列表。六大来源：

1. **持久化窗口**（thread-context.json）：LLM/user 主动 open 的 root/talk/do/todo/plan/program/file/explicit-knowledge/search/method_exec/自定义 object。
2. **protocol knowledge**（source=`protocol`）：每轮按条件注入的框架常量窗口——`internal/basic`（机制说明）、`internal/root/basic`（root method 清单）、`internal/windows/<type>/basic`（该 type 出现时）、`internal/reflectable/*`（super session）、creator-reply（含 isCreatorWindow do/talk 时）、end-reflection-reminder（业务 thread 开 end form 时）。
3. **activator knowledge**（source=`activator`）：seed+sediment 双源按 `activates_on` trigger 激活，上限 20 篇，与显式 open_knowledge 同 path 时 activator 让位。
4. **skill_index**：扫 external/branch/object 三层 skills 目录，合并去重非空则注入一个 window（object > branch > external 覆盖同名）。
5. **peer / children object 自动注入**（Phase 6 取代 relation_window）：peer Object **本身**作为 window 进 context，`id=peerId`、`type=peerId`（故渲染走 peer 自己的 readable）。来源=已交互过的 talk peer + stone 层级自动发现的 sibling/一级 children。渲染前 `derivePeerObjectWindows` 从 stone 动态加载 def 并 idempotent 注册到 registry，避免 "type not registered"。
6. **enrichment 字段**（运行时派生、不持久化）：`effectiveVisibleType`（沿 parentClass 继承链回退到前端能渲染的首个 type）、method_exec 的 `methodKnowledgePaths`；落盘前由 `stripVolatileForPersist` 剥离。

## 渲染管线与预算

- `createDefaultPipeline()`（`context/pipeline.ts:97`）串接 activator / protocol / peer / knowledge 等 processor 产出 derived 窗口。
- 预算 `loadBudgetThresholds()`（`context/budget.ts:47`）只保留软/硬阈值；**自动衰减 / emergency guard 已退役（P6, 2026-06-03 删除 applyNaturalDecay/applyEmergencyGuard/estimateThreadTokens）**。新模型是 **BudgetManager**（`context/budget.ts:8`）：`score(window)` 由 provenance/priority/recency/signal 算 0.0–1.0 相关度，`allocate(windows, totalBudget)` 按相关度排序，在 token 预算内返回 `{visible, overflow}`——预算靠**纳入/排除**实施，不再靠自动降级。compressLevel 仍被 compress/expand 命令与渲染器消费，但级别不再被系统自动推进。
  - 设计取舍：旧的「自然衰减按轮数计数 + emergency guard 强制降级」是时间驱动的隐式压缩，行为难预测、易和 LLM 显式 compress 打架；改成相关度排序的显式纳入更可解释、和「LLM 自己决定压什么」不冲突。
  - 注：源文档 `object-context-composition.md §6` 仍按旧 decay/guard 模型描述——已 drift，信代码与本节。

## 关键不变量

- **silent-swallow ban**：任何 context 变化（压缩、审批拒绝、inject、inbox 到达、scheduler 让出）必须以 ProcessEvent / system message 形式对 LLM 可见，绝不静默吞掉。
- **state ≠ context 分离**：Object 自身跨 thread 共享的状态存 `flows/<sid>/<oid>/state.json`；thread 视角存 thread-context.json，对独立 flow object 只存轻量 ref `{id,type,_ref:true,refObjectId}`，hydrate 时另读 state.json。内置特性（talk/do/todo/method_exec 无独立 state）则完整 inline。
- **Context = 视角（point-of-view）而非归属（belongs-to）**：同一 Object（如一场跨 Agent 的 talk）可同时出现在多个 thread 的 context 里，每个 thread 持自己的视角参数（compressLevel/sharing snapshot），Object 状态只存一份。thread-context.json 就是 OOC 的「指针表」——`_ref` 的引用语义对应 OO 世界对象的指针。
- **call_started / thinking 不进 transcript**：call_started 仅作 crash recovery 磁盘锚点；thinking 只记录不回灌（见 thread-and-thinkloop.md 的 reasoning 不复喂）。

## 当前债

derived 窗口不写回 `thread.contextWindows`，靠 transient `_renderedWindows` 兜底观测（`context/index.ts:360`）——mock 路径与真实渲染存在两套读取分支，长期应收敛为一套。
