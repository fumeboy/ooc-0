---
title: 内核=泛型协调器 + thread 骨架可读规则 + onChildTerminal 钩子抽取（厘清 runtime↔thread 耦合边界）
status: in-review
date: 2026-06-21
---

# 内核=泛型协调器 + thread 骨架可读规则 + onChildTerminal 钩子抽取

## 背景 / 动机

OOC 朝 OOP 哲学推进——「Object 自己编程控制自己的 executable/readable/persistable/visible」，许多系统概念已以 builtin class/object 表示在 `packages/@ooc/builtins`。但 runtime（core）与 `thread` builtin 耦合得最深，导致 thread 没法干净地表示成一个 builtin object，这是「把系统概念 object 化」剩下的最大未拆解块。

盘清 thread 实际背负的职责后，难题被收敛得很小：thread 的耦合**不是散布的**，而是高度集中在 `core/thinkable/scheduler.ts` 的几段「事件传播」逻辑上，它们内联读了 thread 的业务字段。而 OOC 内部已经有一个**做对了**的范本（`core/runtime/object-lifecycle.ts`），只是 scheduler 没对齐它。本 issue 把这条边界规则立成正式设计，并抽取唯一的真漏点。

## 现状

**thread 的八簇职责**（按「谁现在读写它」分，代码已核实）：

- **① 调度记录**：`id` / `status` / `lastExecutedAt` / `inboxSnapshotAtWait` / `waitingOn` / 父子链（`parentThreadId`·`creatorThreadId`·`creatorObjectId`·`creatorSessionId`·`childThreadIds`·`childThreads`·`_parentThreadRef`）。读者：scheduler、thinkloop。**真内核（run-queue）**。
- **② 事件流 + 引用底座**：`events: ProcessEvent[]`、`contextWindows: OocObjectInstance[]`、`_renderedWindows`、`threadLocalData`、`llmTimeoutMs`。读者：thinkloop（几乎每步 `thread.events.push`）、context pipeline、observable、**以及 `object-lifecycle.ts` 的 refcount 引擎扫 `contextWindows` 当 GC roots**。`contextWindows` 是设计上不可私有化的内核可见字段（GC roots）。
- **③ 协作信箱**：`inbox`/`outbox: ThreadMessage[]`。读者：say method、collaborable delivery、**scheduler 直接读 `inbox.length` 判唤醒 + 直接写 child-end system message 进 inbox/events**。
- **④ 业务数据 / 终态**：`endReason`/`endSummary`（end method 写）/ `isSummarizer` / `statusReason`·`lastError`。读者：end/todo method，**但 scheduler harvest/notify 直接读 `endSummary`/`endReason`/`isSummarizer`**。
- **⑤ 投影行为（readable）**：三投影 class（thread/talk/reflect_request）、window method（set_transcript_window/compress/resize）、computeProjectionClass/compress-events。**但 scheduler harvest 直接读写 self 窗 `win.summarizedRanges`/`inFlightCompress`**。
- **⑥ 会话方法（executable）**：say/close/share、new_feat_branch/create_pr_and_invite_reviewers（`for_reflectable`）、end/todo。
- **⑦ 持久化（persistable）**：`mode:"inline"`、save/load；runtime 引擎直接 import `writeThread`/`readThread`——此条被对象模型**核心 7 明文授权**，非漂移。
- **⑧ 引用计数底座**：`contextWindows`（引用集）+ `status`（非终态才计数）被 `object-lifecycle.ts` 泛型扫描，归零派发 `unactive`、0→1 派发 `active`，self 门面窗不计。

**index.md 现状锚点**：
- `## thinkable`：scheduler「单 thread 一轮『构造 context→调 LLM→执行 tool→写事件』」「Thread Tree 可并行可恢复」。
- `## thread`（E 区）：「一身横跨四维」「× persistable：mode=inline」「生命周期：会话窗即引用、级联 canceled、引用计数停启见核心 10」。
- `## OOC Class/Object Model`（A 区核心 10）+ object self.md 核心 10：「core 提供泛型机制（引用计数 + active/unactive 派发，零 class 特判、不 import 任何具体 class）；各 class 提供钩子 body（policy）」。
- `## executable`：「tool 原语恒为 3 个（exec/close/wait）」「`active`/`unactive` 是 class 生命周期钩子、不是新原语——tool 原语恒定 3 个」。
- `## collaborable`：「每个 thread 持 inbox/outbox；say 写入自身 outbox 并派送到对端 thread 的 inbox」。

**问题诊断**：`scheduler.ts` 是「一个极小的真内核（collectRunningThreads + selectNextThread + think + writeThread）」+「一个寄生的轮询事件传播器」焊在一起。寄生的三段——
- `harvestSummarizerForks`（`scheduler.ts:151`）：读 ④`endSummary`/`status` + ⑤`win.summarizedRanges`/`inFlightCompress`，折子摘要进父窗；
- `emitChildEndNotifications`（`scheduler.ts:66`）：读 ④`endSummary`/`endReason`/`isSummarizer`，写 ③`inbox` + ②`events`；
- `wakeWaitingThreadsOnInbox`（`scheduler.ts:106`）：读 ③`inbox.length` 对比 ①`inboxSnapshotAtWait`，写 ①`status`。

它们寄生在 tick 里，只因 tick 是每轮重扫整棵树的天然轮询点（god-loop）。`object-lifecycle.ts:8` 已证明正确模式：「本模块泛型、零 thread builtin import……thread-specific policy 活在 thread builtin 的钩子 body」——它检测 refcount 转换（泛型，只读 ①status + ② `OocObjectInstance[]` 核心类型）→ 派发 class 钩子。scheduler 三段是**同一模式做错了**：检测转换后内联读了 thread 业务字段（④⑤）。

## 改动提案

立三条设计、抽一个钩子：

**1. 把「OOC 内核 = 一组泛型协调器」立为正式设计。** 内核 = 两个泛型协调器（run-queue 调度 + refcount 生命周期）遍历 thread 骨架 + thinkloop 单轮原语 + registry。builtin 经 class 钩子出 policy。`object-lifecycle.ts` 是范本，scheduler 应对齐它。

**2. 立「内核可读骨架」规则（可检查）：**
> 内核协调器**可以**读 thread 的骨架——`id`/`status`/父子链/调度时间戳/`contextWindows` 引用集/`events` 事件日志（scheduler + lifecycle 都需、核心类型的结构字段），检测其上的**泛型转换**（status→终态、refcount→0/1、inbox 增长）。
> 内核协调器**绝不**读语义由 thread builtin 定义的字段（`endSummary`/`endReason`/`isSummarizer`/`summarizedRanges`/`inFlightCompress`）——一律经 class 钩子触达。

**3. 抽取 `onChildTerminal` 钩子（与 active/unactive 同构的生命周期钩子家族成员）。** harvest + notify 触发条件完全相同（child→终态），塌成一个 thread-class 钩子：
> kernel 检测某子线程跨进终态（泛型，只看 ①status）→ 派发 `onChildTerminal(parent, child)`；钩子里 thread 自己决定：若 child 是自己的 summarizer fork → 折摘要进父窗（原 harvest）；否则 → 往自己 inbox 写 child-end marker（原 notify）。harvest 是 onChildTerminal 的特例。
>
> 它是 **class 钩子、不是 tool 原语**——tool 原语恒守 3 个（exec/close/wait），与 active/unactive 同列入「生命周期钩子家族」。

**4. `wakeWaitingThreadsOnInbox` 留在内核**——它只碰结构字段（inbox.length/snapshot/status），本就是泛型规则，无需迁出。

落地后 scheduler import 零个 thread 业务符号，结构上与 `object-lifecycle.ts` 一致。

**5. 命名（可选 enforcement，非 load-bearing）**：概念上区分「thread runtime frame（骨架 ①+②，内核遍历）」与「thread object（builtin，③-⑦ facet/data + 钩子）」。物理拆 `ThreadContext` type 是防漂移卫生——lifecycle 没物理拆、靠自律只读结构字段就做到诚实。**建议先做钩子抽取（3），漂移复发再拆 type。**

## 受影响设计元素

对照 `knowledge/index.md` 的 `##` 元素清单：

- `## thread`（E 区）—— **主元素**：骨架（①+②）vs 业务（③-⑦）边界；新增 onChildTerminal 钩子；harvest/notify 语义迁入 thread builtin。
- `## thinkable`（B 区）—— scheduler god-loop 拆分为「泛型协调器 + 钩子派发」；thinkloop end 路径与终态钩子的衔接。
- `## executable`（B 区）—— 守「tool 原语恒 3 个」；明确 onChildTerminal 是 class 钩子非第 4 原语（对齐 active/unactive 已有口径）。
- `## collaborable`（B 区）—— child-end 通知（写对端 inbox）的语义归属：从 scheduler 内联迁为 thread 钩子内的协作动作。
- `## OOC Class/Object Model`（A 区核心 10）+ object self.md 核心 10 —— 生命周期钩子家族新增 onChildTerminal（与 active/unactive 同构：core 泛型检测转换 + class 出 policy body）。
- `## collaborable × thinkable`（D 区）—— thread tree child→终态→唤醒 creator 的链路改由钩子驱动。

潜在波及（待完整性批评官确认是否需各派 reviewer）：
- `## observable`（events 写入：context_compressed / inbox_message_arrived 事件改由钩子 push）。
- `## persistable × thinkable`（scheduler import `writeThread` 的方向——核心 7 已授权，预期不动，需确认钩子抽取不改此契约）。
- `## reflectable × persistable`（summarizer fork / compress v2 与 super flow 沉淀无交叉，需确认）。

## 风险与权衡

- **触发模型正交风险（重点）**：现三段是 level-triggered（每 tick 重扫全树、marker/snapshot 幂等），与 K8s reconciliation loop 同权衡——对崩溃/漏事件鲁棒，跨 session/worker 时父线程可能在别进程，轮询重扫内存树更稳。亦可改 edge-triggered（end() 那刻直接 fire）。**建议本 issue 不动触发模型**：只做「检测泛型转换 → 派发钩子」的分层修复，保持 level-triggered。把触发模型变更与分层修复捆绑会同时引入两类风险。
- **钩子签名跨父子**：lifecycle 钩子是单 target 派发（作用于被解引用对象）；onChildTerminal 是父子跨线程（父读子终态、写父 inbox/窗）。需确认钩子 ctx 能同时拿到 parent + child，且不引入新的循环引用（`_parentThreadRef` 已是 transient strip 字段）。
- **幂等性迁移**：notify 的 `[child:id:status@tail]` marker 幂等、harvest 的 `inFlightCompress` 清除——迁入钩子后须保持「每 tick 可重入、只生效一次」的幂等，否则 level-triggered 下会重复写 inbox / 重复折叠。
- **退役遗留**：harvest/notify 迁出后 `scheduler.ts` 应删 `emitChildEndNotifications`/`harvestSummarizerForks`/`iterateThreads`（若不再被内核需要）+ 相关 import（`isSelfThreadWindow`/`addSummarizedRange`/`SummarizedRange`）——退潮须清干净，接 check:doc-drift / check-no-deprecated-symbols。
- **compress v2 刚落地**：harvest 是 compress v2 的 C2/auto-fold 核心（见 [[project_events_compress_landed]]），迁移须保 real-compress-v2 e2e 仍绿，summarizer fork done/failed/orphan 三分支语义不丢。

## 待裁决点

1. **钩子粒度**：onChildTerminal 一个钩子涵盖 harvest+notify，还是拆成两个（onChildTerminal 只管通知 / 另有 compress-harvest 专钩）？倾向单钩子（harvest 是特例），但 summarizer fork 的 `isSummarizer` 分流是否够干净由 reviewer 评。
2. **②contextWindows 是否需经钩子读**：lifecycle 现直接读 `contextWindows`（核心类型、泛型）。是否进一步要求经 `enumerateRefs` 钩子间接读以彻底私有化？倾向**不**（那是 ceremony，contextWindows 是核心类型非 thread 业务字段）——但需明确写进「骨架可读规则」边界。
3. **命名/物理拆 type**：本轮只做钩子抽取（不拆 `ThreadContext` type），还是同步拆「runtime frame vs thread object」两 type？倾向先抽钩子。
4. **触发模型**：确认本轮保持 level-triggered（不改 edge-triggered）。
5. **wakeup 去留**：确认 `wakeWaitingThreadsOnInbox` 留内核（已是泛型）——是否有 reviewer 认为它也该进钩子。

## review 记录

（fan-out 后由 Supervisor 汇总各 reviewer + 完整性批评官意见）

## 裁决

（最终方案 + 落地与一致性回流清单；涉及源代码变更——`packages/@ooc/core/thinkable/scheduler.ts` + thread builtin executable/readable——落地时在源码仓 `.worktree/thread-kernel-boundary` 新建 worktree 分支隔离开发）

## 落地验收

（`landed` 后由 Supervisor 汇总验收 reviewer 意见）
