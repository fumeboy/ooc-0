---
title: 厘清 runtime↔thread 耦合边界：core 泛型机制 + thread 专属派发位 + compress-v2 policy 归位（slug 含 reconciler 为 legacy，已弃该词）
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

7 reviewer fan-out（6 受影响元素 + 1 完整性批评官）汇总：

**一致赞成（无异议）**：方向（scheduler 退潮内联读 thread 业务字段、policy 迁 thread builtin、对齐 `object-lifecycle.ts` 范本）；`wakeWaitingThreadsOnInbox` 留内核（只读结构字段，待裁决点 5 关闭）；本轮锁 level-triggered（待裁决点 4 关闭）；tool 原语恒 3 个守住。

**关键修正（对象模型 reviewer 主判，thread / collaborable×thinkable / 完整性批评官 用代码佐证）**：「onChildTerminal 是与 active/unactive **同构的生命周期钩子家族成员**」**不成立**——三处非同构：①触发轴（子线程终态 vs 自身引用计数 0↔1）②作用对象（父子双 target vs 单 `targetId`，`LifecycleContext` contract.ts:190 现仅单 target）③调用时机（active/unactive 是 close/open **边沿同步**派发 object-lifecycle.ts:110，被迁三段是**每 tick 轮询** scheduler.ts:211-213）。强纳入撑破核心 10「围绕引用计数的存亡三态」边界、并使「零 thread 特判」失真（遍历 childThreads 检测终态是 thread 拓扑语义，非泛型）。

**最深发现（thread reviewer）**：harvest ≠ notify，二者**触发键不同集**——harvest 真触发键 = 父窗 `inFlightCompress` + 每 tick 轮询子状态（scheduler.ts:160-163，含 orphan 分支：子不存在→无「子终态」可检测，靠 clamp floor 兜底）；notify 触发键 = 子→终态（scheduler.ts:75，skip isSummarizer）。「harvest 是 onChildTerminal 特例」过简化；硬塞进一个「子→终态」边沿钩子会让 orphan / force-wait floor 永不 fire → 父永久卡 `compress:` waiting（real-compress-v2 回归路径）。

**断言修正（完整性批评官）**：(A4) `object-lifecycle.ts` 注释原文是「零 thread **builtin** import」（不 import `@ooc/builtins/*` 业务符号），**非**「零 thread 类型」——它仍 import core 内部 `ThreadContext`/`isTalkLikeClass`/`isSelfThreadWindow`；范本标准是「不 import builtin 包的业务符号」。(A2) 退役符号清单漏 `autoCompressLevel`（failed 分支 scheduler.ts:183）。(A1) 物理路径带 `children/`（alias `@ooc/builtins/agent/thread/*` → `agent/children/thread/*`）。(S1) `events` 不该列「内核可读骨架」——内核 scheduler 调度决策**不读 events**（只读 inbox.length），events 是 thinkable 写、observable/visible 读。

**漏列元素（完整性批评官 + 各 reviewer）**：`## persistable`（钩子/policy body 内 writeThread 落盘时机从 tick 尾迁出，触动 inline mode 整窗落盘）；`## observable`（应明确：事件 schema 零变更、仅 producer 移位）；`## visible`（应确认：`context_compressed`/`inbox_message_arrived` 事件 kind 稳定→零回归，防 e2e 观测漂移）。核心 10 因「关键修正」反而**降级**（家族不扩容、不动）。

**落地硬约束（多 reviewer 交叉）**：onChildTerminal/harvest 是 `OocClass` 之外的 thread 专属派发位、**绝不进 `executable.methods`**（否则被 exec-by-name 命中→破 tool 原语 3 戒，executable reviewer 红线）；marker 去重归 thread policy body、**不复用无去重的 `appendInbox`**（collaborable reviewer）；`makeSystemMessage` 随逻辑迁入 thread builtin；钩子 body 须纯重入、幂等判据持久化；钩子 self=parent、child 经 args（inbox 归属正确性，collaborable×thinkable reviewer）；钩子派发须排在 wakeup 之前 / wakeup 保持 level 重扫兜时序缝隙。

## 裁决

采纳方向，按 review 修正提案。十条：

1. **方向确认**：退潮 scheduler 内联读 thread 业务字段；harvest/notify policy 迁 thread builtin；scheduler 对齐「core 出泛型机制 + thread 出 policy body」分层（沿用 `object-lifecycle.ts` 范式，但**借鉴≠同构**）。
2. **撤回「生命周期钩子家族成员」**：onChildTerminal / harvest 是 **thread class 专属派发位**，不进通用 `OocClass` 钩子接口、不与 active/unactive 并列。**核心 10 不动**（家族仍 construct/active/unactive）、object self.md 核心 10 不提它；设计归 `## thread`（E 区）。
3. **harvest ≠ notify，拆两个 thread-builtin policy**：notify（子→终态→写父 inbox child-end marker）+ harvest（父窗 inFlightCompress 轮询→折 summarizer 摘要 / failed 关 autoCompress / orphan 兜底 / 清 inFlightCompress + force-wait 唤醒）。二者均由 kernel **每 tick level-triggered** 派发到 thread-builtin policy body；policy 内读自己业务字段（thread 读自己 facet，allowed）。
4. **触发模型锁 level-triggered**（非建议，是 continue-重启多次唤醒 + 崩溃重扫恢复的**前提条件**）。wakeup 留内核 level-triggered。
5. **派发 ctx**：self=parent、child 经 args；**不污染** `LifecycleContext`（thread 专属派发位用自己的 ctx 形状）。
6. **内核可读边界规则（归 `## thinkable`/`## thread`，非核心 10）**：内核泛型派发只读骨架结构字段——逐字段白名单 `id`/`status`/父子链/`lastExecutedAt`/`inboxSnapshotAtWait`/`contextWindows`（按字段非按簇，挡住 `_renderedWindows`/`llmTimeoutMs` 搭便车）；**删 `events`**（无内核读者）；绝不读业务字段 `endSummary`/`endReason`/`isSummarizer`/`summarizedRanges`/`inFlightCompress`/`autoCompressLevel`。**可检查 = 落 check 规则**扫 `scheduler.ts` 禁 import/读这些业务符号（对齐 check:doc-drift FORBIDDEN_PATTERNS 机制），非编译期拆 type。
7. **术语收敛**：弃「GC roots」（OOC 是 refcount 非 tracing GC）→「引用计数的引用集」；弃「协调器/reconciler」「runtime frame」（带外部框架黑话）→ 复用核心 10「泛型机制 / 泛型派发」+「骨架」。
8. **补受影响元素**：`## persistable`（writeThread 落盘时机：harvest 折父窗 summarizedRanges 后谁刷盘——确认仍由 thread mode=inline 整窗落盘、时机不破契约）；`## observable`（事件 schema 零变更、仅 producer 移位）；`## visible`（事件 kind 稳定→零回归）。
9. **退役清单补全**：harvest/notify 迁出后删 `emitChildEndNotifications`/`harvestSummarizerForks`/`iterateThreads`/`makeSystemMessage` + import（`isSelfThreadWindow`/`addSummarizedRange`/`SummarizedRange`）；`autoCompressLevel` 处理随 harvest 迁入；retain `collectRunningThreads`/`selectNextThread`/`writeThread`/`wakeWaitingThreadsOnInbox` 留内核。
10. **物理拆 `ThreadContext` type 暂不做**（本轮靠规则 6 的 check 规则自律；漂移复发再立 type-split issue）。

**幂等/恢复硬验收（落地验收 step 4 用）**：real-compress-v2 e2e 仍绿（orphan/force-wait floor 不丢）；新增「child 终态期父 inbox child-end 计数=1」断言；新增「tick 中途崩溃重扫」恢复测试（证 marker/snapshot 恢复语义不丢）。

**一致性回流清单（landed 前必成对回流）**：
- `## thread`（index.md）+ thread self.md：骨架（结构字段）vs 业务字段边界一句话；onChildTerminal/harvest 两 policy 派发位；补既存 doc-drift（contextWindows=内核可读引用集 + summarizer fork/isSummarizer 在 thread 元素的位置）。
- `## thinkable` self.md（self.md:28 当前设计 + self.md:59 ProcessEvent）：调度=泛型机制 + thread policy 派发；events 写权归属（thinkloop + thread policy）+ 登记 builtin→thinkable 事件类型依赖方向。
- `## collaborable` self.md：补「thread policy 派发是 say 之外第二条 inbox 写入路径」。
- `## executable`（index.md L78）：单短语追加（非原语、不进 methods）；executable self.md 不动。
- 核心 10 / object self.md：**不动**（确认家族不扩容）。
- `## persistable` / `## observable` / `## visible`：按裁决 8 各补确认句。

**源代码变更**（`packages/@ooc/core/thinkable/scheduler.ts` + thread builtin executable/readable/persistable）落地时在源码仓 `.worktree/thread-kernel-boundary` 新建 worktree 分支隔离开发；中间增量坏测试只登记账本、全改完统一修跑绿（对齐 [[feedback_refactor_defer_test_fixes]]）。

## 范围扩展（用户裁定 A，2026-06-21）—— compress-v2 整体 core/builtin 归位

第一轮裁决落地前的核查发现：**scheduler 的 harvest 只是 compress-v2 机制的 1/4 个触碰 thread 业务字段的点**，其余三点散在 `core/thinkable/context/`（由 thinkloop 调，非 scheduler）。把 harvest 单拎出来改、其余留 core 是人为割裂同一机制。用户裁定 **A：扩本 issue 为「thread compress-v2 业务整体归 thread builtin，core thinkable 只留框架」**。

**compress-v2 的四个 thread-业务触碰点（harvest 是其一）**：

| # | 动作 | 位置 | 谁调 | 性质 |
|---|---|---|---|---|
| 1 | 触发判定（autoCompressLevel→未总结 transcript token 阈值） | `context/compress-trigger.ts`、`compress-fork.ts:115 maybeAutoCompress` | thinkloop（buildInputItems 后、LLM call 前） | thread policy 寄居 core |
| 2 | spawn summarizer fork + 算待折区段 + 写 `inFlightCompress`/清 `compressIntent` + force-wait | `context/compress-fork.ts`（spawnSummarizerFork/maybeAutoCompress/maybeForceWaitForCompress/buildSummarizerSeed/KEEP_TAIL_EVENTS） | thinkloop（`thinkloop.ts:6` import） | thread policy 寄居 core |
| 3 | harvest 摘要→写 `summarizedRanges` + 清 inFlightCompress + force-wait 唤醒 | `scheduler.ts:151 harvestSummarizerForks` | scheduler tick | thread policy 寄居 core（第一轮裁决已覆盖） |
| 4 | 渲染期折叠（读 summarizedRanges 折 events 成 summary 占位） | `context/index.ts:356 snapRangesToToolPairs`、`:429-439` | context builder（buildInputItems） | thread readable 投影寄居 core **且重复** |

**两处确凿指纹**：
- `compress-fork.ts:22-28` —— core 留了个 loose 本地接口 `CompressV2Win`，注释自承「**权威定义在 builtins ThreadWin**」，却在 core 直接 mutate `summarizedRanges`/`inFlightCompress`/`compressIntent`/`autoCompressLevel`。这是「core 拿 thread win 的影子结构改 thread 业务态」的典型漏点。
- `context/index.ts:356` 自定义 `snapRangesToToolPairs` 折叠投影，**未复用** thread builtin readable 已有的 `projectSummarizedRanges`（`compress-events.ts`）——同一份折叠投影逻辑劈在 core context builder 与 thread builtin readable 两处。

**已对的一半（不要误伤）**：fork **构造**已经走对——`compress-fork.ts:9-10/76-80` 经 `builtinRegistry` + `WindowManager.instantiate(THREAD_CLASS_ID)` 桥接，**无 core→builtins 直接 import**（registry 解析）。`writeThread` import 是核心 7 授权（sched/compress-fork 同模式）。这些是**框架**、留 core。

**扩展后的边界原则（比第一轮更宽）**：
> core thinkable **框架**（scheduler + context builder 两者）只读 thread **骨架**结构字段 + 经接口/registry 调 thread 的 **compress policy**；**thread builtin 拥有整条 compress loop 的业务**（触发判定 / spawn 区段算法 / seed 构造 / harvest 折叠 / 渲染折叠投影 / force-wait 语义 / `CompressV2Win` 权威字段）。core 留下的 compress 框架仅：token 计数（`budget.ts`）、fork 原语（`WindowManager.instantiate`，已 registry 桥接）、thinkloop/scheduler 里**调用 thread policy 的 hook 点**（不内联 thread 业务字段读写）。

**新增受影响设计元素**（在第一轮基础上追加，驱动第二轮 review fan-out）：
- `## readable`（B 区）—— 折叠投影（snapRangesToToolPairs）归属与 `projectSummarizedRanges` 去重；折叠是否纯 readable 投影、该不该整段移进 thread builtin readable。
- `## thinkable`（B 区，深化）—— 第一轮只审了 scheduler；本轮深入 context builder 的 compress 机制（compress-fork/compress-trigger 由 thinkloop 调）：哪些是框架（token 计数 / fork 原语 / hook 点）、哪些是 thread policy 该迁出。
- `## readable × thinkable`（D 区）—— 折叠投影被 context pipeline 消费的契约（thread readable 出折叠投影、thinkable 渲染管线消费）。
- `## thread`（E 区，深化）—— `CompressV2Win` 权威字段 + 整条 compress loop policy 收归 thread builtin。

**第一轮裁决的 10 条对 scheduler 端仍成立**，但 #1 方向、#6 边界规则、#9 退役清单的**主语从「scheduler」扩为「core thinkable 框架（含 context builder）」**；#3 的「harvest/notify 两 policy」扩为「compress loop 全套 policy（触发/spawn/harvest/折叠/force-wait）+ notify」。最终裁决待第二轮 review 后重定。

## review 记录（第二轮 —— 扩展面）

4 reviewer fan-out（readable / thinkable-context-builder / readable×thinkable / 完整性批评官）。**最重要的结果是证伪了扩展节的核心论据。**

**【证伪 · 指纹 #2 事实错误】**（readable / readable×thinkable / 完整性批评官 三方独立 grep 确认）：`projectSummarizedRanges` 活在 `core/_shared/utils/summarized-ranges.ts`（跨维共享 helper），**不在** thread builtin `compress-events.ts`（后者只导出 `threadCompress`/`threadResize` 两个 window method）。`context/index.ts:436` **已经在复用** 这个共享 helper，peer 视角 `conversation-render.ts:63` 也调同一个——**折叠投影本体单一来源、两视角共用，零重复**。`snapRangesToToolPairs`（index.ts:356）是职责完全不同的函数（LLM function_call/output **tool-pair 对齐安全**，self 视角专用），不是折叠投影的第二实现。**「折叠投影劈两处该去重」前提塌陷，#4 渲染折叠侧无漏点可迁。**

**【红线】snapRangesToToolPairs 必须留 thinkable**（thinkable / readable×thinkable）：它修的是 claude-transport 不 sanitize 孤儿 tool 块的 provider 协议约束，是 thinkable↔llm transport 适配，非 thread 投影。搬进 thread builtin 会让 thread 反向 import thinkable 的 events→LlmInputItem 转换模型（processEventToItems）+ tool-pair 概念——逆向耦合，比现状更糟。

**【真漏点收窄】** 真正寄居 core 的 thread compress 业务只在 **WRITE/POLICY 侧**：指纹 #1（`compress-fork.ts:22 CompressV2Win` loose 影子接口 + core 直 mutate `summarizedRanges`/`inFlightCompress`/`compressIntent`/`autoCompressLevel`；harvest 端 scheduler.ts 还散了第三份行内影子）。READ/渲染侧（#4）已对。

**【thinkable 切分细化】**（thinkable reviewer）：
- `isSummarizer` 的 thinkloop **执行特化**（无工具 thinkloop.ts:396 / 单轮 / 首文本即 endSummary :441-446）= thinkable 框架，**别随 spawn 搬走**。
- `buildSummarizerSeed`（events→文本）= readable 投影，归 thread builtin readable（非 thinkable 框架）。
- **force-wait 切 `thread.status` 属调度**：policy 只返「需 force-wait + forkId」意图，由 thinkloop 框架翻译成 `status="waiting"` 三件套写入（与第一轮「wakeup 留内核 / status 是调度态」对称）。
- thinkloop↔thread policy 调用契约草案：框架算 `transcriptTokens`(budget.ts) 喂 policy → `policy.maybeCompress(thread, tok)`（spawn/置 inFlight/清 intent，改自己业务字段）+ `policy.compressWaitIntent(thread, tok)→{forkId}|null`（纯查询）→ 框架据意图切 waiting 并 return 本轮。
- 纯阈值判定 `shouldAutoCompress`/`autoCompressThreshold`（compress-trigger.ts）不碰业务字段、是纯函数，留 core 框架。

**【compress.md 单一权威不拆】**（thinkable / 完整性批评官）：compress 是跨三类 window class 的协议（内容窗 / 自我主历史窗 / 派生会话视图），**设计权威单一留 compress.md（thinkable）**；thread builtin 只承「**自我主历史窗类**的 compress policy 实施」、锚回 compress.md、**不复制设计**。否则违 compress.md 单一权威 + 设计-实施越界。compress.md「核心设计」补一句边界声明（policy 在 thread builtin、框架在 thinkable）。

**【补元素 / 确认句 / 降级】**（完整性批评官 + readable）：
- 补 `## persistable × thinkable`（`compress-fork.ts:105` spawn-时 writeThread = thinkable 框架调 persistable，落盘时机拥有者迁移）。
- 确认句：`## readable × visible`（折叠产物是 LLM-input-only `events_summary` system message，不触 visible 镜像→零波及）；`## observable` 确认范围从「事件 kind 稳定」扩到「status 转换观测点稳定」。
- `## readable` 从「主受影响元素」**降级**为「× thinkable 边界澄清一句」（折叠投影本体零迁、win 书写权威已在 thread builtin readable 的 window method）。
- `## readable × thinkable` 补「双通道」边界：① 窗投影经 `ReadableProjection`（含 peer-messages 折叠）；② self 视角 transcript 经 thinkable events→LlmInputItem 通道（读 win `summarizedRanges` 折叠、tool-pair snap 属 transport），与 `ReadableProjection` 平行。**events 折叠迁移对 `ReadableProjection` 三字段契约零影响。**

**【与第一轮裁决须重定的张力】**（完整性批评官）：
- 裁决 #6 的 check 规则扫描文件清单须从 `scheduler.ts` 扩到 `context/compress-fork.ts` + `compress-trigger.ts` + `context/index.ts`，否则退潮闸门漏 3/4 触碰点。
- force-wait 唤醒拆分：内核留 **inbox-增长泛型 wakeup**（wakeWaitingThreadsOnInbox，结构字段）；compress 的 `waitingOn` `compress:` 前缀唤醒（scheduler.ts:195）是 compress policy 一部分、随 harvest 迁出。第一轮「wakeup 留内核」不可读成「所有 waiting→running 留内核」。

**【断言修正】**：「无 core→builtins 直接 import」仅对 fork **构造**成立；`compress-fork.ts:16 writeThread` 是核心 7 授权的直 import（文件级仍有直 import）。

## 裁决（第二轮 —— 重定为最终）

**先撤回**：扩展节指纹 #2（折叠投影劈两处）证伪作废；#4 渲染折叠侧无漏点。真漏点收窄到 compress 的 **WRITE/POLICY 侧 + CompressV2Win 影子结构**。

**最终「框架 vs thread compress policy」切分：**

| 留 core thinkable 框架 | 迁 thread builtin（compress policy / readable） |
|---|---|
| token 计数 `budget.ts` | 触发判定（`maybeAutoCompress` 读 win 业务字段那段） |
| fork 原语 `WindowManager.instantiate`（registry 桥接） | spawn 区段算法（fromIdx/toIdx/`KEEP_TAIL_EVENTS`） |
| `isSummarizer` thinkloop 执行特化（无工具·单轮·首文本→endSummary） | `buildSummarizerSeed`（events→文本，归 thread readable） |
| `snapRangesToToolPairs`（LLM tool-pair transport 安全） | harvest 折叠写入（写 `summarizedRanges`/清 inFlightCompress） |
| `projectSummarizedRanges`（`_shared` 共享折叠 helper） | force-wait **意图**（返回 {forkId}，不自己切 status） |
| status 写入（切 waiting/running 都框架做） | `CompressV2Win` 权威字段（改用 builtins `ThreadWin`，删 core 影子） |
| 纯阈值判定 `shouldAutoCompress`/`autoCompressThreshold` | compress 的 `waitingOn` `compress:` 唤醒（随 harvest） |
| thinkloop/scheduler 的 hook 点 | |

**thinkloop↔thread policy 调用契约**（采纳 thinkable reviewer 草案）：框架算 `transcriptTokens` 喂 policy；`policy.maybeCompress(thread, tok)` 改自己业务字段；`policy.compressWaitIntent(thread, tok)→{forkId}|null` 纯查询；框架据意图切 status（status 写入留框架，与 wakeup 留内核对称）。

**承前（第一轮裁决仍有效，主语扩展）**：
- #2 撤回「生命周期钩子家族成员」仍立 —— onChildTerminal/harvest/compress policy 都是 thread 专属派发位，不进通用 `OocClass` 钩子接口，核心 10 不动。
- #6 内核/框架可读边界规则扩为「core thinkable 框架（scheduler + context builder）只读骨架结构字段（逐字段白名单）、不读/不 mutate thread 业务字段」；**check 规则 FORBIDDEN_PATTERNS 扫描文件清单 = `scheduler.ts` + `context/compress-fork.ts` + `context/compress-trigger.ts` + `context/index.ts`**，禁业务符号 `endSummary`/`endReason`/`isSummarizer`/`summarizedRanges`/`inFlightCompress`/`autoCompressLevel`/`compressIntent`。
- 触发模型锁 level-triggered；inbox-增长 wakeup 留内核；compress force-wait 唤醒随 harvest policy 迁出（两个 wakeup 拆开）。

**compress.md 单一权威不拆**：设计权威单一留 compress.md（跨三类窗协议）；thread builtin 只承「自我主历史窗类 compress policy 实施」、锚回不复制；compress.md 核心设计补边界声明句。

**最终受影响元素全集**：第一轮 thread / thinkable / executable / collaborable / OOC Class-Object Model（确认不动）/ collaborable×thinkable ＋ persistable / observable / visible ＋第二轮 readable（降级为边界澄清）/ readable×thinkable / **persistable×thinkable（新补）**。正确排除：agent / method_exec_form。

**断言修正纳入**：「无 core→builtins 直接 import」仅 fork 构造成立（writeThread 核心 7 授权直 import）；snapRangesToToolPairs 留 thinkable。

**一致性回流清单（在第一轮基础上增补）**：
- `## thinkable` self.md（self.md:16 compress 节 + self.md:27 预算节）+ compress.md 核心设计：补「compress policy 在 thread builtin、框架（token 计数/fork 原语/isSummarizer 执行/tool-pair snap/hook 点/status 写入）在 thinkable」边界声明；compress.md 不拆、只追认 policy 实施归属。
- `## readable × thinkable`（index.md:137-139）：补「双通道」分流句。
- `## persistable × thinkable`（index.md:141）：补 compress spawn-时 writeThread 落盘时机的拥有者。
- `## readable`（index.md L82 / self.md）：**不动核心**，至多「× thinkable 边界澄清一句」（折叠投影本体零迁）。
- `## thread`（E 区）+ thread builtin md：CompressV2Win 权威字段（builtins ThreadWin）+ compress loop policy 收归 + 锚回 compress.md。

**退役**：删 `CompressV2Win` core 影子接口（权威 ThreadWin）；compress-fork.ts 内容迁 thread builtin 后 core 零残留；title 收敛弃「reconciler」（对齐第一轮裁决 #7，slug 文件名 legacy 保留）。

**幂等/恢复硬验收（承前增补）**：real-compress-v2 e2e 绿（orphan/force-wait floor 不丢）；新增「child 终态期父 inbox child-end 计数=1」+「tick 中途崩溃重扫」恢复测试；**MEMORY `feedback_e2e_observation_drift` 警示**：迁 producer 时 visible/observation helper 读死 event kind 极易静默漂移，列入落地验收硬约束。

## thread 模型澄清（say 单写 + 调度重投影统一模型）—— 2026-06-21（用户拍板）

第二轮裁决后，用户陈述了期望的 say 交互模型，核查发现它**正是 `## thread` / `## collaborable` 已文档化设计的忠实实现，而当前代码是偏离**。它还反向改进了已裁决的 onChildTerminal。

**模型（单一真相源）**：一场对话 = **一个 thread 实例**（callee 的 thread）。它同时持 `inbox`（caller→callee）+ `outbox`（callee→caller）。caller **不留自己的副本**——caller 通过一个指向 callee thread 的会话窗（**ref**，`referencedObjectId`）在构造 context 时**投影**它（peer-POV，翻转 in/out：callee.inbox=「我发出的」、callee.outbox=「我收到的」）。这正是 `## thread`「同一 thread 实例按视角投成三种 window class」+ `## collaborable`「window class POV 轴 × 消息方向轴正交」的兑现。

**当前代码的偏离（双写）**：`talk-delivery.ts:198-199` 同时写 `callerThread.outbox += msg` **和** `calleeThread.inbox += msg`——两个 thread 各存一份镜像。本模型删 caller 侧副本，回到单一真相源。

**统一规则（say 与 onChildTerminal 收敛成一条）**：

> **callee/child 产出（say outbox / end summary）或终态 → 调度 creator → creator 下一轮重投影它引用的 thread，零副本。**

- **say 单写**：写 callee thread 的 inbox（caller→callee）或 outbox（callee→caller）一份 + 触发对端调度。**删 caller 侧 outbox 副本** + **删第二轮遗留的「say inline 写 peer.status」**（改「调度」，status 写入归框架，与 compress force-wait 裁决对齐）。
- **onChildTerminal 改写**：从第一/二轮的「往父 inbox 写 child-end marker（副本 + marker 幂等）」改为「**只调度 creator + creator 重投影子 thread**（自然看见其终态 + endSummary/outbox）」。**零副本 → 无 marker 幂等负担**，简化第一轮裁决。

**唤醒机制（两源并存）**：
- **callee 方向**：caller→callee 写 callee.inbox → callee 自身 inbox 增长 → 框架泛型 `wakeWaitingThreadsOnInbox` 唤醒（第一轮裁决「留内核」，不变）。
- **caller 方向**：callee→caller 写 callee.outbox，**caller 自身 inbox 不增长** → 泛型唤醒不触发 → 需**显式「调度 creator」**：callee thread 持 `creatorThreadId`/`creatorSessionId`，据此 enqueue caller（跨 session 经 creatorSessionId）。这是框架新增的调度能力（「enqueue 某 thread」），取代「往 creator inbox 写副本再靠 inbox-增长唤醒」。

**依赖耦合**：caller 的会话窗须是**纯 ref**（`referencedObjectId` → callee thread，投影期渲染）——即 [[2026-06-21-object-contextwindow-split]] 的 **P0（inline vs ref）**。本 issue 的单写模型落地**依赖该 split**；两 issue 须协调推进（建议：object-contextwindow-split P0 先行/并行，本 issue 的 say 单写在其 referencedObjectId 落地后接入）。

**跨 session（de-risk）**：默认 callee thread 派进 **caller 自身 session**（`talk-delivery.ts:100,115`）→ 同 session 本地投影读，无跨 session 成本；仅 super-alias / reflectable 跨 session 回报需经 `creatorSessionId` 路由（已特殊处理）。

### 落地接口规格（三表 —— landing spec）

**表 A · core 表露的 API（框架）**

| 类别 | API | 备注 |
|---|---|---|
| 派发面（registry，零 builtin import） | `resolveReadable`/`resolveObjectMethod(s)`/`resolveWindowMethod`/`resolveWindowClass`/`resolveConstructor`/`resolveActive`/`resolveUnactive`/`resolvePersistable`/`isInlinePersist` ＋新增 `resolveOnChildTerminal`/`resolveCompressPolicy`（同机制：可选槽，缺槽 fast-path 跳） | 沿继承链解析 |
| 思考框架 | `think(thread,llm)` / `getAvailableTools`(恒 3 原语) / `dispatchToolCall`(exec-by-name) / `isSummarizer` 执行特化(无工具·单轮·首文本→endSummary) | |
| context 框架 | `buildInputItems` / `processEventToItems` / `snapRangesToToolPairs`(tool-pair transport,**留框架**) / `projectSummarizedRanges`(`_shared` 共享) / `budget` / pipeline processors(protocol/activator/peer/member 注入) | thread 出投影、框架消费 |
| 知识框架 | `computeActivations`/`loadKnowledgeIndex`/`evaluateTrigger`(纯函数,读 thread 结构态) | 不碰业务字段 |
| 实例化/引用框架 | `WindowManager.instantiate`(造任意 class,registry→construct,**talk/compress 共用**) / `countSessionReferences`+`dispatchActive/UnactiveIfZero`(refcount→生命周期) / `close` 原语 | |
| 调度框架 | `collectRunningThreads`/`selectNextThread` / `wakeWaitingThreadsOnInbox`(inbox-增长泛型唤醒) / **`enqueueThread`(新增：显式调度某 thread，caller-wake + onChildTerminal 共用，跨 session 经 creatorSessionId)** | compress 的 `compress:` 唤醒随 harvest policy |
| 持久化框架 | `writeThread`/`readThread`(核心 7 授权) / persistable `save`/`load` / inline mode | |

**表 B · thread builtin 注册的 hook**

| 槽 | thread 实现 | 类型 |
|---|---|---|
| `construct` | `talkConstructor`：target=自己→`execFork`；target=别的/`user`→peer 会话（校验 target stone） | 标准 OocClass |
| `readable` | `readable(ctx,data,win)→ReadableProjection{class,content,consumedMessageIds}`：POV 投 thread/talk/reflect_request；`window[]`（含 window method `set_transcript_window`/`threadCompress`/`threadResize`） | 标准 |
| `executable` | `methods[]`：`say`(单写 callee thread + 触发对端调度) / `close` / `share` / `new_feat_branch` / `create_pr_and_invite_reviewers` / `end` / `todo` | 标准 |
| `persistable` | `mode:"inline"` + `save=saveThread`/`load=loadThread`；inbox/outbox append-only 存储 | 标准 |
| `unactive` | `cancelSubtree`(refcount→0：级联子线程 canceled) | 标准 |
| `onChildTerminal` | child→终态 → **调度 creator**（不写副本）；creator 重投影子 thread 见终态/endSummary | 新·thread 专属派发位 |
| `compress.maybeCompress(thread,tok)` | 触发判定 + spawn 区段算法 + 经 `WindowManager.instantiate` spawn summarizer fork + 置 inFlightCompress/清 compressIntent | 新 |
| `compress.compressWaitIntent(thread,tok)→{forkId}\|null` | force-wait **纯查询**（返意图，不切 status；框架据此 enterWaiting） | 新 |
| `compress.harvest(parent,child)` | 读 child.endSummary → 写父窗 summarizedRanges + 清 inFlightCompress + 发 compress 唤醒意图；done/failed/orphan 三分支 | 新 |
| `buildSummarizerSeed`（归 readable） | events→文本 seed 投影 | 新 |

权威字段：`CompressV2Win` core 影子删 → 用 builtins `ThreadWin`。派发机制：新 hook 走可选槽 + registry 泛型 resolve（零 builtin import / 零 thread 特判），**语义上不进生命周期钩子家族**（核心 10 不动）。

**表 C · core 框架「只读骨架」契约**

| 可读（结构/调度/执行-模式字段） | 绝不读（thread 业务，经 hook） |
|---|---|
| `id`/`status`/父子链/`lastExecutedAt`/`inboxSnapshotAtWait`/`waitingOn`/`contextWindows`(引用计数的引用集)/`events`(thinkloop 写·activator+builder 读)/`inbox`·`outbox`/**`isSummarizer`(框架执行-模式标记)** | `endSummary`/`endReason`/`summarizedRanges`/`inFlightCompress`/`autoCompressLevel`/`compressIntent` |

**⚠️ 修正第一/二轮裁决**：`isSummarizer` 应从「禁读业务符号」移到「框架可读」——`thinkloop.ts:120/396` 合法读它定执行模式（它是「这是一条框架 spawn 的 summarizer run」的标记，非 compress 业务语义）。FORBIDDEN_PATTERNS **不含** `isSummarizer`；只含 endSummary/endReason/summarizedRanges/inFlightCompress/autoCompressLevel/compressIntent。

### 受影响元素增补（第三轮）

- `## collaborable`（**升为核心**）：say 单写模型（一份消息存 callee thread + 调度对端，删 caller 副本 + 删 inline 写 peer.status）。
- `## collaborable × thinkable`（**改写**）：child→终态 / callee→caller 回报统一为「调度 creator + 重投影」，取代第一轮的「写 marker 唤醒」链。
- `## thread`（E 区）：对话=一个 thread 实例双 POV 投影、单写 inbox/outbox、onChildTerminal 改调度重投影。
- `## OOC Class/Object Model` × [[2026-06-21-object-contextwindow-split]]：caller 会话窗=纯 ref（referencedObjectId），依赖 P0 inline-vs-ref split——**跨 issue 耦合，须协调**。

## review 记录（第三轮 —— thread 模型）

（对 collaborable / collaborable×thinkable / thread×object-contextwindow-split 耦合 fan-out 后由 Supervisor 汇总）

## 裁决（第三轮 —— 最终收口）

（第三轮 review 后收口最终方案 + 一致性回流清单）

## 落地验收

（`landed` 后由 Supervisor 汇总验收 reviewer 意见）
