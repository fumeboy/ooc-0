---
title: thread builtin 业务退出 core——compress 退潮 + onChildTerminal 退潮 + say 机制纠正
status: in-review
date: 2026-06-21
---

# thread builtin 业务退出 core

> 本 issue 由 `2026-06-21-thread-kernel-boundary-reconciler-hooks`（三轮 review 后判定载荷过重）**收敛重建**而来，聚焦三件同源的事：把寄居在 core 的 thread 业务逻辑退回 thread builtin。「thread 成为一等可引用 object」（peer-ref 投影 / unactive 通知模型 / refcount）拆为后续 [[2026-06-21-thread-as-referencable-object]]，本 issue 对其有依赖（见末）。原 issue 的三轮 review 记录作审计保留。

## 背景 / 动机

OOC 朝 OOP 推进，系统概念以 builtin class/object 表示在 `packages/@ooc/builtins`。但 thread builtin 的业务逻辑大量**寄居在 core**（`thinkable/scheduler.ts` + `thinkable/context/`），导致 thread 没法干净表示成 builtin。范本就在隔壁：`core/runtime/object-lifecycle.ts:8`「本模块泛型、零 thread builtin import……thread-specific policy 活在 thread builtin 的钩子 body」——core 出泛型机制、class 出 policy body。本 issue 把三处违反此范本的 thread 业务退回 builtin。

## 现状

**① compress-v2 四触碰点散在 core/thinkable（由 thinkloop / scheduler 调）：**
- 触发判定：`context/compress-trigger.ts` + `compress-fork.ts:115 maybeAutoCompress`（thinkloop hook）。
- spawn + force-wait + seed：`context/compress-fork.ts`（spawnSummarizerFork/maybeForceWaitForCompress/buildSummarizerSeed/`KEEP_TAIL_EVENTS`/loose 影子接口 `CompressV2Win`，注释自承「权威在 builtins ThreadWin」却在 core 直 mutate `summarizedRanges`/`inFlightCompress`/`compressIntent`/`autoCompressLevel`）。
- harvest：`scheduler.ts:151 harvestSummarizerForks`（读 child.endSummary→写父窗 summarizedRanges + 清 inFlightCompress + force-wait 唤醒）。
- 渲染折叠：`context/index.ts:356 snapRangesToToolPairs` + `:433-451`（读 summarizedRanges 折 events）。

**② scheduler 的事件传播寄生（内联读 thread 业务字段）：**
- `emitChildEndNotifications`（scheduler.ts:66）：读 child `endSummary`/`endReason`/`isSummarizer`，往父 inbox 写 child-end marker + push `inbox_message_arrived`。
- `harvestSummarizerForks`（同①）。
- 这两段寄生在 scheduler tick 顶部（god-loop）——本属 thread 对象行为却用内核特权内联。`wakeWaitingThreadsOnInbox`（scheduler.ts:106）只碰结构字段，合法留内核。

**③ say 双写镜像 + inline 写对端 status（偏离文档化设计）：**
- `talk-delivery.ts:198-199`：同时写 `callerThread.outbox += msg` **和** `calleeThread.inbox += msg`（两 thread 各存一份镜像）。
- `talk-delivery.ts:206` + `session-methods.ts:101-109`（fork 路径）：say 直写对端 `peer.status="running"`。
- 这违背 `## thread`「同一 thread 实例按视角投成三种 window class」+ `## collaborable`「inbox/outbox 与 caller/callee 身份无关」——文档本是单写投影语义，双写代码是偏离。

**index.md 锚点**：`## thinkable`（scheduler/thinkloop/compress）、`## thread`（E 区）、`## collaborable`（say/inbox/outbox）、`## executable`（tool 原语恒 3）。

## 改动提案

总原则（沿用 object-lifecycle 范本，扩到整个 core thinkable 框架）：

> **core thinkable 框架（scheduler + context builder）只读 thread 骨架结构字段 + 经接口/registry 调 thread policy；thread builtin 拥有自己的全部业务（compress loop / 子线程通知 / 会话消息）。**

**A. compress 退潮**

| 留 core 框架 | 迁 thread builtin compress policy / readable |
|---|---|
| token 计数 `budget.ts` / fork 原语 `WindowManager.instantiate`（registry 桥接）/ `isSummarizer` thinkloop 执行特化（无工具·单轮·首文本→endSummary，thinkloop.ts:396/441）/ `snapRangesToToolPairs`（LLM tool-pair transport 安全）/ `projectSummarizedRanges`（`_shared` 共享折叠 helper）/ 纯阈值判定 `shouldAutoCompress`·`autoCompressThreshold` / thinkloop·scheduler hook 点 | 触发判定（maybeAutoCompress 读 win 那段）/ spawn 区段算法 / `buildSummarizerSeed`（events→文本，归 readable）/ harvest 折叠写入 / force-wait **意图**（返意图、不切 status）/ `CompressV2Win`→ builtins `ThreadWin` 权威字段 |

- thinkloop↔compress policy 调用契约：框架算 `transcriptTokens` 喂 policy；`policy.maybeCompress(thread,tok)` 改自己业务字段；`policy.compressWaitIntent(thread,tok)→{forkId}|null` 纯查询，框架据此切 status（status 写入留框架）。
- **compress.md 单一权威不拆**：compress 是跨三类 window class 协议，设计权威单一留 compress.md（thinkable）；thread builtin 只承「自我主历史窗类 policy 实施」、锚回不复制；compress.md 核心设计补一句边界声明。

**B. onChildTerminal 退潮**

- scheduler 的 harvest + notify 抽出 → thread builtin policy。child→终态由 scheduler 每 tick **level-triggered** 检测（只看 ①status，泛型），派发 thread 的 `onChildTerminal` policy。
- **统一为「调度重投影、零消息副本」**：child→终态 → 调度 creator（不写 inbox marker 副本）→ creator 下一轮**重投影**子线程（经 fork-ref，object-lifecycle.ts:34 已支持）看见其终态/endSummary。
- **幂等不全删**：保留**瘦身持久消费游标**（tail/bool，无消息内容）做边沿去重——level-triggered 崩溃恢复每 tick 重扫会重发现「子终态+creator waiting」，无游标会 busy-loop / do_window.continue 二次终态不可区分。
- `onChildTerminal` 是 **thread 专属派发位**（可选 `OocClass` 槽 + registry 泛型 resolve，零 builtin import / 零 thread 特判），**不进通用生命周期钩子家族**（核心 10 不动）。
- harvest 作独立 thread policy（触发键=父窗 inFlightCompress，与 onChildTerminal 的子终态触发键不同集，不并）。

**C. say 机制纠正**

- **单写**：一场对话存 callee thread 一份（inbox=caller→callee / outbox=callee→caller），**删 caller 侧 outbox 副本**。
- **唤醒归框架**：删两条 say 路径的 inline 写 peer.status（talk-delivery.ts:206 + session-methods.ts:101-109），status 写入归框架（与 compress force-wait「policy 返意图、框架切 status」对称）。
- **1 写律 + 2 唤醒律**：写一份 on callee thread；say→**对话对端**（talkWindow 解析；peer callee 非 caller 的 child）、onChildTerminal→**树 creator**（creatorThreadId），共用 `enqueueThread` 原语但**目标解析分两套**。
- **`enqueueThread` 归 runtime**：泛化/复用已有 `notifyThreadActivated`（从 thread builtin talk-delivery 上提 runtime），同 session=内存唤醒 / 跨 session=持久调度信号（调度元数据、非消息副本）；保留终态复活语义（waiting/done/failed caller→running，否则回报石沉大海）；scheduler（thinkable）的 inbox-增长泛型 wakeup 是同 session 消费方、留内核。
- **依赖**：caller 单写后经 **peer-ref 投影** callee thread（读侧）由 [[2026-06-21-thread-as-referencable-object]] 交付（`referencedObjectId` 现对 peer 窗返 undefined）；本 issue 的 say 写侧 + 唤醒可设计，**完整落地须 substrate issue 的 peer-ref 先到**（落地顺序：substrate 先/并行）。

**D. 内核可读边界规则（可检查）**

- 框架只读骨架结构字段：`id`/`status`/父子链/`lastExecutedAt`/`inboxSnapshotAtWait`/`waitingOn`/`contextWindows`(引用集)/`events`/`inbox`·`outbox`/**`isSummarizer`(框架执行-模式标记)**。
- 绝不读业务字段：`endSummary`/`endReason`/`summarizedRanges`/`inFlightCompress`/`autoCompressLevel`/`compressIntent`。
- check 规则 FORBIDDEN_PATTERNS 扫 `scheduler.ts` + `context/compress-fork.ts` + `context/compress-trigger.ts` + `context/index.ts` 禁读/import 上述业务符号。
- 新增 `resolveOnChildTerminal`/`resolveCompressPolicy` 槽照抄 active/unactive 已验证模式，落地须同步 `register`/`seedFrom` 两处显式 merge（object-registry.ts:115-122/296-303）。

## 受影响设计元素

- `## thread`（E 区）：compress loop policy + onChildTerminal + say 单写收归 thread builtin；CompressV2Win→ThreadWin。
- `## thinkable`：scheduler god-loop 拆分（泛型检测 + thread policy 派发）；compress 框架/policy 边界；thinkloop 不感知 policy。
- `## executable`：守 tool 原语恒 3 个，onChildTerminal/compress policy 非原语、非 object method（不进 `executable.methods`）。
- `## collaborable`：say 单写（核心条 6 改写：双写镜像→单写一份 + caller 经 ref 投影不留副本）；唤醒两源。
- `## collaborable × thinkable`：child→终态 / callee→caller 回报统一「调度 creator/对端 + 重投影」，取代 marker 唤醒；1 写律 + 2 唤醒律。
- `## readable` / `## readable × thinkable`：折叠投影本体（projectSummarizedRanges）`_shared` 单一来源零迁、snapRangesToToolPairs 留 thinkable transport；双通道边界（ReadableProjection vs self transcript 通道）。
- `## persistable` / `## persistable × thinkable`：compress spawn-时 writeThread 落盘时机；say 单写改 caller 落盘形态；outbox 单 writer（见待裁决 R5）。
- `## observable`：onChildTerminal 删 marker → 不再 push `inbox_message_arrived`（事件产出删除，非 producer 移位）——见待裁决 R1。
- `## visible` / `## runtime`：会话窗渲染源；`enqueueThread` 归 runtime。

正确排除：`## OOC Class/Object Model` 核心 10 / `agent` / `method_exec_form`（onChildTerminal 非生命周期家族成员，核心 10 不动）。**core 10 + lifecycle 的改动（unactive 通知 / refcount / canceled 退役）全部归 substrate issue。**

## 风险与权衡

- **触发模型锁 level-triggered**（非建议、是 continue-重启唤醒 + 崩溃重扫恢复的前提）；不改 edge-triggered。
- **幂等转移**：marker 写入去重消失（零副本），但「终态消费去重」转移到调度边沿，须瘦身持久游标，不可全删。
- **compress v2 刚落地**：迁移须保 real-compress-v2 e2e 绿、orphan/force-wait floor 不丢、done/failed/orphan 三分支语义全。
- **观测漂移**（[[feedback_e2e_observation_drift]]）：删/改事件 producer，visible/observation helper 读死 event kind 易静默漂移——列入落地验收硬约束。
- **大重构延后修测试**（[[feedback_refactor_defer_test_fixes]]）：中间增量坏测试只登账本、全改完统一跑绿；源码仓 `.worktree/thread-builtin-retreat` 隔离开发。

## 待裁决点

- **R1 observable**：删 `inbox_message_arrived` 后，调度点是否补轻量 `context_change` 观测事件让 loop_timeline 不盲？（派 observable reviewer）
- **R5 persistable outbox**：确认 outbox 单 writer（则 spec 改：inbox=per-message 多 writer 防御 / outbox=随 thread.json 单 writer）？（派 persistable reviewer）
- （R2 enqueueThread 归属已定=runtime + 复用 notifyThreadActivated；R3/R4 拆 substrate issue。）

## 退役清单

`emitChildEndNotifications` / `harvestSummarizerForks` / `iterateThreads` / `makeSystemMessage`（scheduler.ts:44/66/151）+ import（isSelfThreadWindow/addSummarizedRange/SummarizedRange）+ `CompressV2Win` core 影子接口 + `worker.ts:263-348 syncCrossObjectCalleeEnds`（第三处 marker 写入）+ 两条 say inline-status 路径。retain `collectRunningThreads`/`selectNextThread`/`writeThread`/`wakeWaitingThreadsOnInbox`。

## review 记录

（fan-out 后由 Supervisor 汇总）

## 裁决

（review 后收口）

## 落地验收

（`landed` 后核对）
