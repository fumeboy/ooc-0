---
title: 划清 core ↔ builtin class 边界——thread 强耦合逐点退潮（增量 issue）
status: draft
date: 2026-06-22
---

# 划清 core ↔ builtin class 边界（thread 案例）

> **增量 issue**：目标是把 OOC core 与 builtin class 的边界划分清楚——core 出泛型机制、builtin 出 policy/业务（范本 `core/runtime/object-lifecycle.ts:8`「本模块泛型、零 thread builtin import……policy 活在 thread builtin 的钩子 body」）。本轮聚焦 **thread** 这个跨维度最密、与 core 耦合最深的 builtin。
>
> 工作方式：用户**逐点**提出要拆的耦合处，Supervisor 逐点更新本 issue「改动提案」→ 视不可逆性拉 review → 在 worktree 分支 `feat/thread-core-boundary` 落地。每点落地后回流一致性。

## 背景 / 动机

OOC 朝 OOP 哲学推进——系统概念以 builtin class/object 表示在 `packages/@ooc/builtins`。但部分 builtin（尤以 thread）的逻辑仍**寄居 core**，core 反过来内联读 builtin 的业务字段，边界糊成一团。范本（object-lifecycle.ts）证明正确分层可行：core 泛型协调器只读骨架结构字段、经 registry/接口调 class policy，零 builtin import。本 issue 把 thread 剩余的越界处逐一退潮。

## 现状（thread ↔ core 耦合的已了与未了）

**已退潮并合入 main**（[[2026-06-21-thread-builtin-business-retreat]]，verified）：
- **A. compress 退潮**：compress policy（触发/spawn/seed/force-wait/harvest）搬入 thread builtin `compress.ts`，`CompressV2Win`→`ThreadWin`；core 留框架（budget/WindowManager/compress-trigger/snapRangesToToolPairs）经 blessed import 调。
- **B. onChildTerminal 退潮（relocate 形态）**：`emitChildEndNotifications`（含 endSummary/endReason/isSummarizer 业务字段读）搬入 thread builtin `child-notify.ts`，core scheduler 经 blessed import 只调、零业务字段读；保留 marker→inbox→wake 既有唤醒。
- **E. unactive 改通知 + canceled 退役**：thread.unactive non-terminal→发自身 inbox「无订阅者」通知、不 cancel/不级联；退役 `canceled` 全树 + `cancelSubtree`；refcount 保持统一计数。

**尚未退潮**（前序 draft [[2026-06-21-thread-as-referencable-object]] 持有，本 issue 为 thread-only clean restart、与该 draft 并存，落点冲突时本 issue 优先并回收该 draft 相关条目）：
- **peer-ref 投影**：`referencedObjectId`（object-lifecycle.ts:43）对 peer 会话窗返 undefined；caller 会话窗还不是对 callee thread 的 ref。
- **say 单写（读侧）**：caller/callee 双写镜像（talk-delivery.ts:198-199）未收敛为单写 + caller 经 ref 投影。
- **say inline 写对端 status**：talk-delivery.ts:206-210 + session-methods.ts:104-109 仍内联写 peer.status，未归框架调度。
- **`enqueueThread`（runtime，泛化 notifyThreadActivated）+ 终态复活**。
- **onChildTerminal 零副本重投影 + 消费游标**：B 落地为 relocate（保留 marker），未改「调度 creator + 重投影」。
- **D check 规则**：扫 scheduler/compress 禁读 thread 业务字段（retreat 已使 scheduler 零业务读，未钉成 enforceable check）。

**index.md 锚点**：`## thinkable` / `## thread`（E 区）/ `## collaborable` / `## executable` / `## OOC Class/Object Model` 核心 10。

## 改动提案

> 逐点填充——用户每提一处耦合，在此追加一节（`### 点 N · <标题>`：现状锚点 / 改法 / 受影响元素 / 是否需 fan-out）。

### 点 1 · object↔core 泛型契约去 thread 字段/参数

**现状锚点（thread 类型漏进泛型契约）**：泛型 object↔core 接口直接携带 thread builtin 的数据类型 `ThreadContext`（`core/_shared/types/thread.ts:411`）——
- `ExecutableContext.thread?: ThreadContext`（`core/executable/contract.ts:75`）+ `ConstructorContext.thread?`（:98）+ `LifecycleContext`（继承 ConstructorContext，:188）。
- `ReadableContext.thread?: ThreadContext`（`core/readable/contract.ts:22`）。
- `PersistableContext.threadId?`（`core/persistable/contract.ts:23`）——thread blob 二级寻址漏进通用持久化契约。
- `ObjectMethod.exec/route`、`WindowMethod.exec`、`PersistableModule.save/load` 签名本身不命名 thread，但 thread 全经上述 ctx 字段漏入。

**证伪闸门（已 grep 全 51 处 `ctx.thread`，方向有利）**：非 thread builtin **不需要完整 ThreadContext**——13 个非 thread 文件（filesystem/interpreter/terminal/knowledge/runtime/search/pr/skill_index/feishu_doc）只读 `ctx.thread.persistence`（11 处）+ 1 处 `file.write_file` 往 `ctx.thread.events` push worktree 标记。重度用 ThreadContext（events/status/contextWindows/endSummary/creatorSessionId/对象表）的全在 **thread builtin 自己的方法**（end/say/session-methods/talk-delivery/construct/unactive/readable）。`ReadableContext` 已有 `persistence?:{baseDir,sessionId}`；`ExecutableContext` 已有 `ownerThreadRef`/`ownerFlowObjectRef`（持久化 ref，非 ThreadContext）。

**改法（用户裁定：先完成接口修正，缺失路径留 TODO）**：
1. 从 `ExecutableContext` / `ConstructorContext` / `ReadableContext` 删 `thread?: ThreadContext` 字段 + 删 `ThreadContext` import；`PersistableContext` 删 `threadId?`。
2. 非 thread 消费者的 `ctx.thread.persistence` 改读**中立** `ctx.persistence`（ReadableContext 已有；ExecutableContext 补中立 persistence 字段或复用 ownerThreadRef）。
3. thread builtin 自己的方法/persistable 真正需要「正在跑的那条 thread T」/ threadId 处，**留 `TODO("获取 caller")` 占位**（形式 `let thread = TODO(...)`），不在本点解决 T 的获取——T 怎么拿留作后续点（say 单写 / peer-ref substrate 一并定）。
4. `tsc` 枚举全部断点作为精确工作清单。

**fan-out 重量判定**：本点是**退潮**（删 thread 类型漏点，grep + tsc 可验回归），按 design-workflow「fan-out 给新增、不给删除」→ 轻流程：接口修正 + tsc 自验，落地后过一轮验收。引入的中立 `ctx.persistence` 是小 additive，随验收核。

**落地（worktree `feat/thread-core-boundary`，tsc 零新增错误）**：
- 三契约删 thread：`ExecutableContext`/`ConstructorContext`/`LifecycleContext` 删 `thread?: ThreadContext`、`ReadableContext` 删 `thread?`、`PersistableContext` 删 `threadId?`；各补/复用中立 `persistence?: ThreadPersistenceRef`（ReadableContext 原 `{baseDir,sessionId?}` 升为全 ref）。
- 非 thread builtin（runtime/search/knowledge/skill_index/pr/feishu_doc/file/terminal/interpreter）全改读 `ctx.persistence`；`resolveSessionPath`/`resolveStoneWorktreeTarget`/`runBashExec`/`runInterpreterExec` 签名 thread→persistence。
- **附带退役（用户追加指令）**：interpreter 删 `getThreadLocal`/`setThreadLocal`（跨 exec 共享态）+ core `ThreadContext.threadLocalData` 字段——interpreter 彻底脱离 thread 依赖（self.ts 不再 import ThreadContext）。
- core ctx 构造点（window-manager/object-lifecycle/exec/xml renderer）填 `persistence: thread.persistence`。
- thread builtin 自己的载体方法（say/end/new_feat_branch/create_pr/fork construct/unactive/readable）经新 helper `running-thread.ts#runningThread(ctx)` 取「运行 thread T」——**当前为 `TODO(...)` 占位**（抛清晰错误），T 的真获取路径留后续点（say 单写读侧 / peer-ref substrate / enqueueThread）。
- thread persistable 的 `threadId` 二级寻址下沉为 thread builtin 自有 `ThreadPersistableContext = PersistableContext & {threadId?}`。
- 新增 `_shared/utils/todo.ts#TODO(reason): never`（编译期合法、运行期炸的退潮占位）。

**遗留 TODO 债（落地验收须清零）**：① thread 载体方法的 `runningThread(ctx)`（6 文件）；② file write_file/edit 的 worktree 提示注入（原经 `ctx.thread.events`，construct ctx 无 events 流）。二者同属「运行 thread T 获取」缺口，与本 issue 后续点（say/peer-ref）同根。

## 受影响设计元素

> 随每点改动提案在此累积；对照 `knowledge/index.md` 的 `##` 元素清单逐一列出。

**点 1**：
- `## executable`（B 区）—— ExecutableContext / ObjectMethod / ConstructorContext / LifecycleContext 去 thread 字段；object method 签名契约。
- `## readable`（B 区）—— ReadableContext / WindowMethod 去 thread 字段；persistence 中立化。
- `## persistable`（B 区）—— PersistableContext 去 threadId；PersistableModule save/load 契约。
- `## OOC Class/Object Model`（A 区核心 5/6）—— object method (ctx,self,args) / window method (ctx,self,before_win,args) 的 ctx 形状是对象模型契约。
- `## thread`（E 区）—— thread 自己的方法/persistable 改从中立契约取「运行 thread」（本点留 TODO）。
- `## executable × readable`（D 区）—— 两维共用 exec-by-name 入口的 ctx 形状对称去 thread。
- 潜在波及（验收核）：`## persistable × thinkable`（threadId 二级寻址迁出后 thread persistable 怎么拿 threadId）。

### 点 2 · self 入参从裸 Object Data 改为 self-proxy（data/methods 分离）

**现状锚点**：object↔core 的 `self` 入参 = 裸 Object Data——
- `ObjectMethod.exec/route` 的 `self: Data`（`core/executable/contract.ts`）。
- `WindowMethod.exec` 的 `self: Data`、`ReadableModule.readable` 的 `self: Data`（`core/readable/contract.ts`）。
- core 产 self：`getSessionObject(thread,objectId)?.data ?? {}`（window-manager execObjectMethod/execWindowMethod）、`objectDataOf(inst,table)`（xml renderer readable / exec.ts route）。

**改法（用户裁定：分离 self.data / self.methods）**：新增 `core/runtime/self-proxy.ts`，两个 proxy：
- **读写 + 可调方法**（给 ObjectMethod）：`SelfProxy<Data> = { data: Data（读写）; methods: SelfMethods（调对象自己的 executable method，self.methods.foo(args) → runtime.callMethod(selfId, "foo", args)）}`。
- **只读**（给 Executable 以外：WindowMethod / ReadableModule.readable）：`ReadonlySelfProxy<Data> = { data: Readonly<Data>（Proxy set 抛错）}`，无 methods。
- 三签名 `self` 类型：ObjectMethod→SelfProxy、WindowMethod/readable→ReadonlySelfProxy。
- 4 个 core 产 self 点改建 proxy。
- builtin 全量 `self.<field>` → `self.data.<field>`（约 245 处 / 50 文件，tsc 枚举逐一迁）。

**fan-out 重量判定**：本点**新增机制**（self-proxy + 自调方法通道）+ 动对象模型核心 5/6 的 self 契约 → 属「加机制」，理应 fan-out；但本轮按用户指令先落地实现（接口 + 全量迁移 + tsc 绿），设计 review 在落地后补（与点 1 一并过验收/ 必要时补设计 review）。

**受影响设计元素（点 2）**：
- `## OOC Class/Object Model`（核心 5/6）—— object method / window method 的 self 语义（裸 data → proxy）。
- `## executable`（B 区）—— ObjectMethod self 形状 + self.methods 自调通道（exec-by-name 的自指）。
- `## readable`（B 区）—— WindowMethod / readable 的 self 收窄为只读 proxy。
- `## executable × readable`（D 区）—— 两维 self 入参对称改造（rw vs ro proxy 分流）。

**落地（worktree `feat/thread-core-boundary`）**：
- 新增 `_shared/types/self-proxy.ts`（类型 `SelfProxy`/`ReadonlySelfProxy`/`SelfMethods`）+ `runtime/self-proxy.ts`（工厂 `makeSelfProxy`/`makeReadonlySelfProxy`）。读写 proxy `self.data` 写活引用、`self.methods.x()`→`runtime.callMethod` 自指；只读 proxy set-trap 拒写。
- 三签名 self 改 proxy 类型；4 个 core 产 self 点（window-manager execObjectMethod/execWindowMethod、xml renderer readable、exec.ts route）改建 proxy。
- 全量 builtin `self.<field>`→`self.data.<field>`（~50 文件，含 example/filesystem/agent 家族/feishu/interpreter/terminal/knowledge_base + 各 test/story call site 经工厂包裹）。tsc 零新增错误。

## 落地测试状态（点 1+2 合并落地，worktree `feat/thread-core-boundary`）

**绿**：`check:tsc`（零新增，仅 6 条 baseline 环境 dep 错=main 同款）/ `check:silent-swallow` / `check:deprecated-symbols` / `check:doc-drift`。

**core 测试 694 pass / 17 fail**——分两类，均非 self-proxy 回归：
- **2 条 pre-existing**（main 同样红）：interpreter sandbox `injects self with stone dir` / `getData/setData`——tmp exec .mjs 模块解析的环境问题，与本轮无关。
- **15 条 TODO-deferred**：全部源于点 1 的 `runningThread(ctx)` 占位（运行 thread T 获取路径未接入）——reflectable finalizer 链（new_feat_branch/create_pr）×6、create_object(d) super(foo) 链 ×1、write-through 提示 event 注入 ×2（construct ctx 无 events 流）、buildContext/attention 的 transcript 归属路由 ×4（readable 缺 viewing thread 降级、不再把 creator 消息收进 transcript）、session-aware create_object+talk ×1、flows-worktree ×1。这些是「say 单写读侧 / peer-ref substrate / enqueueThread」后续点交付前的**预期红**，已在 [[feedback_thread_core_boundary_deferred_tests]] 登记。
- readable 投影特意用 `runningThreadForRender`（返 undefined 降级、不抛）而非 `runningThread`（抛），保证 **main render 不崩**——仅 transcript 归属暂缺，整条 context 仍可渲染。

**storybook 63 pass / 1 fail**：`visible: 无 FAIL` pre-existing（main 同款）。

## 风险与权衡

- **触发模型锁 level-triggered**（continue-重启唤醒 + 崩溃重扫恢复的前提），不改 edge-triggered。
- **观测漂移**（[[feedback_e2e_observation_drift]]）：删/改事件 producer，visible/observation helper 读死 event kind 易静默漂移——列入落地验收硬约束。
- **大重构延后修测试**（[[feedback_refactor_defer_test_fixes]]）：中间增量坏测试只登账本、全改完统一跑绿。
- **与前序 draft 的范围交叠**：本 issue thread-only clean restart，须显式声明哪些条目从 [[2026-06-21-thread-as-referencable-object]] 回收，避免两 issue 双头落地。

## 待裁决点

- 与 [[2026-06-21-thread-as-referencable-object]] draft 的收口：本 issue 推进的 thread 条目落地后，该 draft 是否标 superseded。
- 各点 fan-out 重量：按「删/退役/可逆/grep 可验回归 → 轻流程；加机制/动核心 loop/不可逆 → fan-out」逐点判。

## review 记录

（逐点 fan-out 后由 Supervisor 汇总。）

## 裁决

（逐点裁决 + 落地与一致性回流清单；worktree 分支 `.worktree/thread-core-boundary`〔`feat/thread-core-boundary`〕。）

## 落地验收

（`landed` 后由 Supervisor 汇总验收 reviewer 意见。）
