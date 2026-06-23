---
title: 新增 OocClass.thinkable 模块 —— context 管理出 core 归 thread builtin / loader 归 knowledge_base
status: verified
date: 2026-06-23
---

# 新增 `thinkable` 模块：thread/knowledge 与 core 解耦

## 背景 / 动机

OOC 朝 OOP 推进——系统能力以 builtin class 表达、core 出泛型机制、builtin 出 policy（范本 `object-lifecycle.ts`）。
但 **thinkable 这一维度的核心实现仍寄居 core**：`core/thinkable/` 把 **think 循环**（thinkloop/scheduler）与
**上下文管理**（buildContext / 渲染 / budget / 窗注入 / knowledge 加载）揉在一起；且 `thinkloop`/`scheduler`
直接 "blessed import" thread builtin 的 policy（compress / child-notify / writeThread）。这是 thread↔core 耦合最深的一块
（接续 [[2026-06-22-thread-core-boundary]]，该 issue 已把 ctx 去 thread 字段、self-proxy、say/reply 退潮，
但 `runningThread(ctx)` 仍是抛错 TODO ——本 issue 给它归宿）。

## 现状（锚 index.md）

- `## thinkable`（B 区）：LLM 看到一组 ContextWindow；thinkloop = 单 thread「构造 context→调 LLM→执行 tool→写事件」循环。实现整堆在 `core/thinkable/`。
- `## OOC Class/Object Model`（A 区核心 1）：class = readable/executable/visible/persistable 四件套——**thinkable 不在 OocClass 模块槽里**，故 thread 无法像注册 readable 那样注册自己的 thinkable 实现。
- `## thread`（E 区）：thread × thinkable = thinkloop 跑在 thread 上，但「跑」的 context 构造逻辑物理在 core，不在 thread builtin。
- `## knowledge_base / knowledge`（E 区）：knowledge 双源加载（loader）+ 继承链解析「归 thinkable 的 knowledge 子模块」——即在 core；knowledge_base.open_knowledge 反向 import core loader。
- `## executable × thinkable` / `## readable × thinkable` / `## persistable × thinkable` / `## collaborable × thinkable`（D 区）：均把 context 渲染/knowledge/inbox 归 thinkable，但未表达「thinkable 实现归谁」。
- 代码锚点：`core/thinkable/{thinkloop.ts,scheduler.ts,recovery.ts}` + `context/`（~15 文件，含 `renderers/xml.ts`）+ `knowledge/{loader,parser,activator,activator.expr}.ts` + `llm/`；`thinkloop.ts:5,7` / `scheduler.ts:4,6,7` 直 import thread builtin；`object-registry.ts` 的 `resolveReadable`/`resolvePersistable`（:227/:236）是模块解析范式。

## 改动提案

1. **新设计元素 `OocClass.thinkable`**（与 executable/readable/persistable 同构的第 N 个模块槽）。`core/thinkable/contract.ts` 定 `ThinkableModule` + `ThinkableContext`，**纯类型零 thread import**。
   - **签名约定 `(ctx, …)`**——与 `ObjectMethod.exec(ctx, self, args)` / `readable(ctx, self, win)` 对齐；**不拿裸 thread**。运行 thread 经 `ctx.thread` 取（thread 是「提供 thinkable 实现」的 class，正在跑的那条线程经 ctx 传入）。**这是 point-1 `runningThread(ctx)` 抛错 TODO 的归宿**。
   - 窄接口（纯 per-tick）：`buildInputItems(ctx)`（读：context→LLM 输入）/ `appendEvents(ctx, events)`（写：单一 ingest，core 每步产出的 ProcessEvent 折进 thread 历史，core 不再直接写 thread.events）/ `maybeAutoCompress(ctx, tokens)` / `maybeForceWaitForCompress(ctx, tokens)` / `onSchedulerTick(ctx)`（= harvest + child-notify 合一）。
2. **registry 解析**：`object-registry.ts` 加 `resolveThinkable(classId)`（镜像 resolveReadable 走 selfThenChain）+ register/seedFrom merge；新 `core/thinkable/resolve.ts#thinkableOf(thread)`（按 thread.class，无注册 **fail-loud 抛错**）。core thinkloop/scheduler 改 call-time 解析、删 blessed import。
3. **创建期窗初始化收敛进 thread `construct`**（不进 thinkable）：`initContextWindows` + `injectPeerWindows`（兄弟+一级子→peer 会话窗）+ `injectMemberWindows`（单例工具+声明成员→member 工具窗）从 core 退役、并入 thread 类 construct（construct = 完整出生：产 Data + 铺初始窗）；restore（reload 非 construct）走可复用 helper。（peer 每轮重 reconcile 仍在 buildInputItems，属 thinkable。）
4. **物理搬迁**：`core/thinkable/context/` 整树 → `builtins/agent/children/thread/thinkable/`；`core/thinkable/knowledge/loader.ts` → `builtins/knowledge_base/loader.ts`。parser/activator/activator.expr/类型 **留 core**（parser 还被 `app/stones/service.ts` + `skill_index/scan.ts` 用）。
5. **终态**：`core/thinkable/` 只剩 `thinkloop`/`scheduler`/`recovery`/`llm/` + `knowledge/{parser,activator}` + 新 `contract`/`resolve`。core 不再 import thread builtin、不再管 context 构造/更新。
6. **留 core 不进 thinkable**：`writeThread`（persistable 维度，保留 blessed import 或后续 resolvePersistable）；`getAvailableTools`（executable 泛型原语）；`thread.isSummarizer`/`status`/`endSummary`/`statusReason`/`lastError`（ThreadContext 数据/控制字段，core 当数据读写、scheduler 调度用）。

## 受影响设计元素

- `## thinkable`（B 区）—— 维度核心：实现出 core 归 thread builtin；thinkable 升为 OocClass 模块。
- `## OOC Class/Object Model`（A 区核心 1）—— class 模块四件套 → 加 thinkable 第五槽；construct 收敛创建期窗初始化（核心 10 生命周期）。
- `## thread`（E 区）—— thread 注册 thinkable、construct 铺初始窗、appendEvents 折历史。
- `## knowledge_base / knowledge`（E 区）—— loader 归 knowledge_base；knowledge 双源加载「归 thinkable 子模块」表述需改。
- `## executable × thinkable`（D 区）—— thinkloop 调 LLM + tool dispatch（留 core）vs context 构造（归 thinkable）的新分界。
- `## readable × thinkable`（D 区）—— readable 投影被 thinkable(builtin) 的 renderer 消费；consumedMessageIds 协作跨 builtin。
- `## persistable × thinkable`（D 区）—— knowledge 路径/self.md 读取的跨维；writeThread 边界。
- `## collaborable × thinkable`（D 区）—— peer 窗注入收进 construct；inbox/outbox × buildInputItems。
- `## persistable`（B 区）—— writeThread 留 persistable 的边界确认。
- `## runtime`（E 区）—— object-registry 加 resolveThinkable + merge。
- `## app`（B 区，**fan-out 补列**）—— flows/service.ts 现调 initContextWindows/injectPeer/injectMember + import runScheduler/createLlmClient/ThreadContext；窗初始化收进 construct 后，app 这些调用点改走 thread builtin / construct，import 方向需整理。
- `## observable`（潜在波及）—— `_renderedWindows` 数据字段通道：renderer 搬进 builtin 后 observable 仅**读** thread._renderedWindows（数据流、非类型流），勿 import 搬走的 renderer。
- `## reflectable`（潜在波及）—— compress harvest / super flow 经 thinkable 钩子（onSchedulerTick/maybeAutoCompress），须保持完整。
- `## skill_index` / `## method_exec_form`（fan-out 提及，**核定不受影响**）—— skill_index 用 parseKnowledgeFile（留 core，不动）；method_exec_form 经 route intents 激活，buildInputItems 内部签名变化不影响其契约。

## 风险与权衡

1. `renderers/xml.ts` 运行时耦合最深（session-object-table/registry/self-proxy/persistable/readable）——搬迁后相对→alias 漏改即破 tsc；最后搬、隔离编译。
2. `parser.ts` 被 app/skill_index 共用——**只搬 loader、parser 留 core**，否则 app/skill_index 反依赖 knowledge_base。
3. 创建期收 construct 的 **restore 缺口**：reload 不走 construct——init(self/peer/member) 须抽可复用 helper，否则 reload 丢初始窗；P1 须同改 4 创建路径（root/peer/fork/restore）。
4. `observable._renderedWindows` 是 ThreadContext 数据通道——搬后仍走数据、勿让 observable import 搬走的 renderer。
5. 循环依赖：registry 间接化打断唯一运行时环（thinkloop/scheduler 不再静态 import builtin）；须核 core 内**无 value import** 指向搬走的 `thinkable/context`（已核实仅 thinkloop:382 一处 value，其余全 type-only ThreadContext，改指 `_shared/types/thread.js`）。
6. doc/anchor 漂移面大（多处 `core/thinkable/context/...` 锚点位移）——P4 统一扫 check:doc-drift。

## 待裁决点

- **【crux】construct/unactive 的「运行 thread」获取**：point-1 已从泛型 ConstructorContext/LifecycleContext 删 `thread`，故 thread 类的 `construct`（fork 需父 thread，`index.ts:144`）与 `unactive`（需 scope thread，`index.ts:208`）现 `runningThread(ctx)` **抛 TODO**（15 条 deferred-red 根因）。thinkable ctx 解决了 thinkable 函数的运行 thread 获取，但 construct/unactive 是 ObjectConstructor/LifecycleHook（非 thinkable 函数）。裁决方向候选：①泛型 ctx 重加 thread（回退 point-1，污染所有 class）；②runtime 经 thread-builtin 专属通道把 owner thread 传入（如 `ctx.runtime.ownerThread()`，但 RuntimeHandle 泛型）；③construct/unactive 也收 ThinkableContext-风格 ctx（runtime 操作 thread 类时携带 owner thread）。须依 OOC/OOP 哲学定——倾向「thread 是 thinkable 载体，运行 thread 属 thinkable ctx，construct/unactive 作为 thread 生命周期操作经同一 ctx 拿 owner thread」，**允许破坏 point-1 的泛型形状以求干净**。
- **ThinkableContext 形状**：仅 `{thread}` 起步、按需扩 runtime/persistence？还是一开始就带 runtime 句柄？
- **窄 vs 宽接口**：appendEvents 单一 ingest（已定）；是否还需把 status 等控制写也纳入 thinkable？（提案：不纳，留 core 控制。）
- **创建期收 construct 的 restore 路径**：construct 内部 helper 复用 vs 独立 restore 函数。
- **fail-loud fallback**：thinkableOf 无注册抛错（提案）vs no-op。
- **writeThread 边界**：留 persistable blessed import（提案）vs 升 resolvePersistable。
- **knowledge_base 反向依赖**：loader 进 knowledge_base 后，thread builtin 的 context(activator-windows/protocol) import knowledge_base loader —— builtin→builtin 边，确认可接受。

## review 记录

fan-out 10 reviewer（按受影响元素）+ 完整性批评官，**全部 endorse-with-changes，无 design-killing block**。汇总要点：

- **thinkable**：窄接口认可；要求澄清 appendEvents 是「推原始 ProcessEvent」还是「转流 item」（→ 裁决：推原始 event，转流在 buildInputItems 读侧）；onSchedulerTick 合并 harvest+child-notify 被质疑「两正交逻辑混一钩子」（→ 裁决：保持合并，order 属 thread 内部、core 不应知）。
- **OOC Class/Object Model**：construct 收窗与「核心 10 出生」自洽，但 injectPeer/injectMember 是 async——construct（ObjectConstructor.exec）本就 async-capable，无碍；要求核心 1「四件套」→ 含 thinkable。要求显式规范「thinkable 仅 agent 类生效 / 任意类可声明但仅 agent 触发」。
- **thread**：两 blocking——①construct 必须完整覆盖 restore（否则跨 reload 丢窗）；②appendEvents 必须覆盖全部 ~17 处 push（否则破坏单一 ingest）。指出 runningThread(ctx) 仍抛桩、construct/fork 取不到 parent（**crux**）。
- **knowledge_base**：无 block；loader 搬入后 thread thinkable→knowledge_base loader 是 builtin→builtin（knowledge_base 不反 import thread，安全）；loader→core parser 是 builtin→core（安全）。
- **executable×/readable×thinkable**：无 block；确认 getAvailableTools 是 executable 契约（留 core 合法）；ThinkableModule 契约属 core（core/thinkable/contract.ts），thread 是 impl（镜像 ReadableModule 契约 + builtin impl）；consumedMessageIds 单向 readable→renderer，renderer 搬 builtin 后仍调 core resolveReadable/session-object-table（builtin→core 合法）。
- **persistable**：无 block；writeThread 留 core blessed import 合理（thread save/load 是「会话容器整 blob」二级寻址、非泛型 Object.save）；knowledge 路径 stoneKnowledgeDir/poolKnowledgeDir 留 persistable。
- **collaborable**：无 block；要求 peer 窗生命周期自洽——initial+per-round reconcile 都在 buildInputItems（环境发现、惰性），不强求进 construct。
- **runtime**：两 blocking——①resolveThinkable 必须走 selfThenChain + fail-loud（与四维度对称）；②appendEvents（context 更新）vs writeThread（落盘）边界须明确不撕裂。建议提取 resolveByChain 公共 helper。
- **observable+reflectable**：无 block；observable 只读 _renderedWindows（数据流）；确认 budget/compress-trigger/transcript-clamp 等 context 子模块的去向（→ 裁决：随 context 树搬进 thread thinkable，compress.ts 改 import 新址）。
- **完整性批评官**：补列 `## app` 受影响（已加）；指出「member 窗已在 construct（index.ts:100）」故「收进 construct」是**完成/形式化**而非从零搬；澄清「删 blessed import」实为「call-time resolveThinkable 替代 top-level import」。

## 裁决

逐条拍板（OOC/OOP 哲学 + 用户授权破坏性变更求干净态）：

1. **thinkable = OocClass 第五模块槽**（与 executable/readable/persistable/visibleServer 并列）。`ThinkableModule` 契约属 **core**（core/thinkable/contract.ts），thread 是其 **impl**（镜像 ReadableModule 契约 + builtin readable impl 的关系）。object-model 核心 1「四件套」→ 文案含 thinkable（agent 维度）。
2. **thinkable 适用面**：任意 class 可声明 thinkable，但**仅跑 thinkloop 的 thread 类实际注册/被调**；`thinkableOf(thread)` 无注册 **fail-loud 抛错**（错误信息附 thread.class）——不是优雅降级，是配置错误。不在 registry 注册期强制「仅 agent」，保持机制泛型、约束靠 fail-loud 自然成立。
3. **ThinkableContext = `{ thread: ThreadContext }`**（最小）。额外 per-tick 参数（transcriptTokens）走函数形参，不塞 ctx。registry 是单例（builtinRegistry，builtin 直接 import）、persistence 在 thread.persistence——故无需进 ctx。thread.status 等控制字段对 thinkable **只读**（写归 core scheduler/thinkloop）。
4. **appendEvents = 推原始 ProcessEvent**（`appendEvents(ctx, events: ProcessEvent[])`）：折进 thread.events（+ 未来投影记账）。event→LlmInputItem 转流（processEventToItems）+ consumedMessageIds 去重 **留 buildInputItems 读侧**（搬进 thread thinkable）。core thinkloop ~17 处 `thread.events.push` **全部**改走 appendEvents（thread blocking①兑现）；status/endSummary/statusReason/lastError 等控制写留 core。
5. **appendEvents vs writeThread 不撕裂**：appendEvents = 内存 thread.events 变更（context 历史）；writeThread = 整 thread blob 落盘。两层正交——thinkloop 先 appendEvents（内存）后 writeThread（盘）。writeThread 留 persistable blessed import（thread save/load 是会话容器二级寻址、非泛型）。
6. **onSchedulerTick 合并**（= harvest + child-notify，thread 内部按序）：core scheduler 调一个钩子、不知两子步顺序——**更解耦**（core blind to internals）。保留合并。
7. **【crux】runningThread for construct/unactive**：根因 = point-1 删了 ctx 上的运行 thread。裁决——`ConstructorContext`/`LifecycleContext` 增 `ownerThread?: ThreadContext`（在其 runtime 中运行的那条线程），由 **WindowManager.fromThread 注入**；`runningThread(ctx)` 返 `ctx.ownerThread`、缺则 fail-loud。这是对 point-1 泛型形状的**有意、受控的部分反转**——运行 thread 是 thread-class 生命周期/construct 的运行时环境（ThreadContext 物理在 core/_shared、非 builtin 类型）；非 thread 类的 construct 忽略它，零回归。**此裁决顺带清掉 point-1 遗留的 15 条 deferred-red**（fork/unactive/finalizer 链恢复）。
8. **创建期窗初始化**：helper（initContextWindows/injectSelf/injectPeer/injectMember）随 context 树搬进 thread thinkable，**全部幂等**；construct（出生）调一次铺初始窗；buildInputItems **每轮**幂等重铺（self/member）+ peer reconcile——**自动覆盖 restore**（reload→thinkloop→buildInputItems 重铺），无需独立 restore 函数。flows-service/talk-delivery/thread-persist 的外部 init 调用退役/改走 construct+buildInputItems。
9. **knowledge**：loader（+测试）→ knowledge_base builtin；parser/activator/activator.expr/类型留 core。方向核定：thread thinkable→knowledge_base loader（builtin→builtin）、knowledge_base loader→core parser/persistable 路径函数（builtin→core）、thread thinkable→core activator（builtin→core）——皆合法，knowledge_base 不反 import thread。
10. **物理搬迁顺序**：renderers/xml.ts 最后搬、隔离编译（最深耦合）；budget/compress-trigger/transcript-clamp 随 context 树搬（compress.ts import 改新址）。
11. **registry**：`resolveThinkable` 走 selfThenChain + register/seedFrom merge `thinkable` 字段（与四维度对称）；可提取 `resolveByChain` 公共 helper 去重（可选优化）。

**落地分期** = 计划 P0-P4（见 plan 文件）；**P1 把 crux#7 的 ownerThread 一并落**（解锁 construct + 清 15 deferred-red）。源码仓特化：worktree 无 node_modules → 在主工作区 **feat 分支** `feat/thinkable-module` 落地（非 `.worktree/`，与本 session 既有 thread-core-boundary 点同模式），每阶段门全绿后合 main。

## 一致性回流清单（落地时成对改）

- index.md：A 区核心 1（+thinkable 槽）/ B 区 ## thinkable（实现去向）/ D 区 executable×・readable×・persistable×・collaborable× thinkable（新分界）/ E 区 ## thread（注册 thinkable+construct 铺窗+appendEvents）・## runtime（resolveThinkable）・## knowledge_base（loader 归属）/ ## observable（_renderedWindows 数据流）。
- self.md：object（核心 1/9/10）/ thinkable（新「thinkable 模块」节 + context 改「context 构造与渲染」）/ thread / knowledge_base / persistable（knowledge 路径 + thread 二级寻址）/ collaborable（peer 窗生命周期）/ runtime（resolveThinkable）/ observable（_renderedWindows）。
- ooc-class.ts OocClass interface 注释（+thinkable 槽，注「仅 thread 类实际注册」）；example.md（若示模块槽）。

## 落地记录（feat/thinkable-module，主工作区分支）

按裁决分期落地，每阶段门全绿（tsc / core+builtin bun:test / storybook 64 / silent-swallow / deprecated-symbols / doc-drift）：

- **P0**（commit c760cf8b）：声明 seam——OocClass 加 thinkable 槽 + registry merge/resolveThinkable + contract.ts/resolve.ts + ExecutableContext/ConstructorContext/ReadableContext 加 ownerThread + core 内 type-only ThreadContext import 重指 _shared。纯加法零行为变化。
- **P1a**（bd253553）：runningThread(ctx)=ctx.ownerThread（WindowManager.fromThread + object-lifecycle + renderer 注入）。**清掉全部 17 条 deferred-red**（point-1 遗留 fork/unactive/finalizer/create_object/write-hint/session-aware/flows-worktree 全转绿），零回归。
- **P1b/c**（051dee2c）：thread 注册 thinkable（buildInputItems/appendEvents/maybeAutoCompress/maybeForceWaitForCompress/onSchedulerTick）；thinkloop/scheduler 删 context/compress/child-notify blessed import 改 thinkableOf 解析；~17 处 thread.events.push 收成 appendEvents 单一 ingest。
- **P2**（ea037bbb）：`core/thinkable/context/` 整树 git mv → `builtins/agent/children/thread/thinkable/context/`；删 context.ts shim；全仓 import 分流（类型→_shared / 值→builtin）。
- **P3**（7f8e6aa9）：`knowledge/loader.ts` git mv → `builtins/knowledge_base/loader.ts`（parser/activator/类型留 core）；消费者重指。

**终态达成**：`core/thinkable/` 只剩 thinkloop / scheduler / recovery / llm + knowledge(parser/activator) + contract/resolve；core 不再 import thread builtin（唯一例外 writeThread = persistable 维度 blessed import，裁决 #5）。

**P4 文档回流**：成对回流 index.md（A 核心 1 / B thinkable / D ×thinkable / E thread·runtime·knowledge_base / observable）+ 各 self.md + ooc-class.ts 注释。

**有意推迟（裁决 #8 的 construct 收敛部分）**：创建期窗 init helper（initContextWindows/injectPeer/injectMember）已物理搬入 thread builtin（P2），但**调用点收敛进 construct + 移除 flows-service/talk-delivery/thread-persist 外部调用**推迟为后续点——根 thread 非 talk-construct（construct 收敛有真实缺口）、且窗初始化时机变更属行为变更而 integration/e2e 为 LLM-gated 不可在本轮完全验证。当前外部 init 调用经 core→builtin import（同 writeThread 既有模式）成立、行为不变。归后续 issue。

## 落地验收（verified）

并发派 3 验收 reviewer（code / doc-reflow / retreat-drift）对照本 issue 核**实际落地**（非重审设计）：

- **code reviewer — as-promised（0 gap）**：终态 core/thinkable 仅 thinkloop/scheduler/recovery/llm + knowledge(parser/activator) + contract/resolve；context 整树 + loader 已搬出 core、shim 已删；core 不 import thread builtin 除 writeThread；OocClass.thinkable 槽 + register/seedFrom/resolveThinkable(selfThenChain) + thread 注册 thinkable + ctx.ownerThread 注入(WindowManager/lifecycle/renderer) + runningThread fail-loud/降级 + appendEvents 单一 ingest——全核实。
- **retreat reviewer — as-promised（0 gap）**：无残留旧路径 import；deferred-red 抽查（evolve-self/create-object/fs-search ctx 桩已 ownerThread）；P1d 推迟诚实标记、理由充分；无提案外破坏；parser/activator 正确留 core。
- **doc reviewer — gaps-found → 已修**：index.md + thinkable/object self.md 回流到位；查出 4 处旧址残留 self.md/knowledge.md（object/knowledge/lifecycle.md、readable/self.md、readable/knowledge/two-faces-of-readable.md、thinkable/knowledge/tests.md）+ 行号漂移 → **本轮全修**（路径重指 builtins 新址 + lifecycle init.ts:153/196 + xml.ts resolveProjection 重锚 :285）。collaborable/persistable/observable self.md 经核无旧址残留。

**顺带修掉的 pre-existing（非本 issue 引入）**：builtins `pr-window.test` 的 `deliverPrWindowToReviewers` 1 fail —— 经 stash 核验 main 同款 pre-existing，根因实为 **PR class 漏声明 `persistable:{mode:"inline"}`**（注释称 inline 但落系统默认 data.json，而 deliverPr 只 writeThread 不写 data.json → PrData round-trip 丢失）。已补声明修复（独立 commit 57d70bfd）。**全 repo 转全绿：core 652 / builtins 214 / storybook 64，0 fail。**

全部 should-fix 缺口已闭，无 blocker → **verified**。

## 后续点（有意推迟）：创建期窗初始化收敛 —— 详细顾虑

> 裁决 #8 后半「移除 flows-service/talk-delivery/thread-persist 的外部 init 调用、收敛到 construct」**有意推迟为独立 follow-up**。
> 下面把推迟的顾虑逐条 grounding（5-probe fan-out 实证，带 file:line），供 follow-up 立项时直接用。
> **当前态自洽**：init helper 已物理搬入 thread builtin（P2），外部 init 调用经 core→builtin import（同 writeThread blessed 模式）、行为与重构前**逐字节不变**、全 repo 全绿。推迟的是「调用点收敛」这层**纯结构 cleanup**，不是任何功能缺口。

### 现状事实（grounding）

**A. 四条创建路径各自 eager 调 init helper**（创建期同步铺窗，非 thinkloop 内）：
- root / session 入口：`core/app/server/modules/flows/service.ts:636-640`（init→injectPeer→injectMember），创建后**不立即读** contextWindows（仅 create+persist+notify，writeThread:641）。
- peer callee：`builtins/agent/children/thread/executable/talk-delivery.ts:162-167`（init→injectPeer→injectMember），**创建后立即读** `calleeThread.contextWindows`（`:178` resolveCalleeReplyToWindowId 按窗 data 的 targetThreadId/target 过滤）。
- fork 子线程：`builtins/agent/children/thread/index.ts:101`（仅 injectMember；creatorThreadId 自 parent 继承），不立即读。
- reload 恢复：`builtins/agent/children/thread/persistable/thread-persist.ts:278-284`（init→injectPeer→injectMember），本处不读。

**B. root thread 不走 construct**（关键结构事实）：root / flow-object root thread 由 `flows/service.ts:430-438`(seedSession) 与 `:628-634`(createFlowObject) **直接对象字面量构造 ThreadContext**，不经 `runtime.instantiate`/talkConstructor。thread 类的 talkConstructor（`thread/index.ts:133-187`）**仅**用于 fork（execFork）/ peer（跨对象 talk）子线程。
→ **「construct 收敛初始窗」无法覆盖 root**——root 没有 construct。真正干净的归宿不是「construct 拥有 init」，而是 **buildInputItems（每轮、对每条 thread 都跑）幂等 ensure 全部结构窗**，root/talk/fork/restored 统一。

**C. buildInputItems 当前只 reconcile peer 窗**（`thinkable/context/index.ts:303-321` reconcilePeerWindowsIntoContext，谓词 `:290-294` id===class 且非 builtin）：它**不**调 initContextWindows/injectSelf/injectMember。pipeline 三 processor（`pipeline.ts:32-54`）产的是 **derived 窗**（protocol/activator 知识 + peer object），非 self/thread/member 结构窗的重注入。
→ 要让 buildInputItems 成为「所有 thread 初始窗的统一幂等兜底」，须**扩 reconcile 覆盖 self 门面窗 / self-view thread 过程窗 / member 工具窗**（三者皆 transient 重注入，`context-window.ts:145-160` isNonPersistedWindow 剔除不落盘）——非平凡扩展。

**D. 时序变更会触及 6+ 个 eager 读取点**（窗初始化从「创建期 eager」改「首轮 buildInputItems lazy」的风险面）：
- `flows/service.ts` listThreads（extractTalkPeers 读 contextWindows 提 talkPeers 摘要，readThread 直后、任何 buildInputItems 前）、getThread（`:795` hydrate）、continueThread（`:840` 读 userThread.contextWindows 找 talk_window）。
- worker `syncCrossObjectCalleeEnds`（`worker.ts:274` 读 caller.contextWindows 遍历 talk_windows）。
- observable 快照（`debug-file.ts:43`、`window-hash.ts:183`）。
- **In-path 立即读**：talk-delivery `:178`——callee 建好**当场**读其 contextWindows。此路径若改全 lazy，须同步重写 resolveCalleeReplyToWindowId。
→ 这些消费者会在「thread 刚建、尚未首 think」时读 contextWindows；改 lazy 后它们看到的窗不完整（缺 peer/member，甚至缺 self/thread），UI/摘要/hash 与首轮 think 后不一致。这正是 init **当前 eager 的原因**。

**E. 无确定性测试覆盖该时序**：14 个 integration 全 `describe.skipIf(!hasLlmEnv)`（`tests/integration/_fixture.ts:11-13`）、22 个 e2e 由 `RUN_*_E2E` + hasLlmEnv 双门。**没有任何确定性测试**覆盖「thread 创建 → runScheduler tick0 → 首轮 buildInputItems → 窗就位」全链路。
→ 「lazy-ensure」行为变更**只能靠 live-LLM 跑验证**，或新写一条专门 mock scheduler+init+buildInputItems 时序的确定性单测。本轮（无 live backend、确定性门为准）无法对它给出与 P0-P3 同等强度的回归保证。

### 推迟判断（OOC 哲学）

裁决 #8 字面是「收进 construct」，但事实 B 证伪了它能覆盖 root——**正确的干净目标是「buildInputItems 统一幂等 ensure」**，而该目标牵出事实 C（扩 reconcile）+ D（重排 6+ eager 读取的时序契约 + 重写 talk-delivery in-path 读）+ E（确定性不可验、须 live-LLM）。这是一次**有真实行为变更、且本轮工具链无法充分验证**的改动；headline 解耦已 verified+全绿，再为这层纯结构 cleanup 冒「破坏 eager 读取语义 + 不可回归验证」的险不划算（呼应「交付干净已验证的增量、勿过度机制化、退潮不破坏在跑的东西」）。故**推迟**，当前 eager init（经 core→builtin import）保留为正确自洽态。

### follow-up 立项要点（acceptance）

1. 目标改述为 **buildInputItems 幂等 ensure 全结构窗**（self/thread/member + 既有 peer reconcile），覆盖 root/talk/fork/restored 四路；扩 `reconcilePeerWindowsIntoContext` 或并列加 `ensureStructuralWindows`。
2. 决定 eager 读取契约：listThreads/getThread/continueThread/worker/observable 读「未首 think」thread 时——要么保留创建期 eager init（仅移除**冗余**、不改时序），要么让这些读取点容忍/触发 ensure。**talk-delivery:178 in-path 读**必须保留可用（eager 或 ensure-then-read）。
3. 先补一条**确定性单测**：thread 创建 → 模拟 tick0 buildInputItems → 断言 self/thread/member/peer 窗就位（脱离 LLM）；再以 live-LLM integration 兜底端到端。
4. 退潮：四创建路径的外部 init 调用按上述决定收敛/移除，doc 成对回流（object/self.md 核心 10 生命周期 + thread/collaborable self.md 的「窗何时铺」）。
