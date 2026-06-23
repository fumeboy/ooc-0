---
title: ThreadContext/ThreadMessage 迁 thread builtin + 合并 Data + 纯构造器 + unactive(self)
status: verified
date: 2026-06-23
---

# ThreadContext 迁 builtin + Data 合并 + 纯构造器 + unactive(self)

## 背景 / 动机

接 [[2026-06-23-thinkable-module-context-decoupling]] 的「后续点（有意推迟）：创建期窗初始化收敛」。
thinkable-module issue 已把 thinkable **实现**搬出 core，但 `ThreadContext`/`ThreadMessage` **类型**仍留
`core/_shared/types/thread.ts`，且 thread 类的 `construct`/`unactive` 仍靠 `runningThread(ctx)`
（= `ctx.ownerThread`）反向掏运行 thread——构造器既返回 caller 侧轻量窗 data、又 side-create child 挂
父 childThreads，混淆「造新对象」与「mutate 父」。本 issue 续推 thread 与 core 解耦：把 thread 的**数据
形状收归 thread 自己**，并让构造器变成不掏运行 thread 的**纯工厂**。

> 源代码已落地（feat 分支 `feat/thread-type-merge-pure-constructor`，commit 964998e1；对象树 lifecycle.md
> commit b661f54）。本 issue 走设计调整工作流补**一致性回流**（self.md / index.md）+ 落地验收。

## 现状（锚 index.md）

- `## thread`（E 区）：「运行 thread 经 `ctx.ownerThread`（WindowManager 注入）供 thread 类载体方法
  （**construct/end/unactive**/readable）取——取代 point-1 的抛错占位」。
- `## thinkable`（B 区）：core 留 thinkloop/scheduler/recovery/llm + knowledge parser/activator +
  contract/resolve；未声明 `ThreadContext`/`ThreadMessage` 类型物理归属。
- `## OOC Class/Object Model`（A 区核心 10）：`unactive` 按引用计数触发；未表达钩子签名。
- `## executable`（B 区）：active/unactive 是 class 生命周期钩子；ObjectConstructor / ObjectLifecycleHook
  契约在 `executable/contract.ts`。
- `## runtime`（E 区）：`WindowManager.fromThread` 注入 `ownerThread` 供 thread 类载体方法取；object
  生命周期 dispatch（active/unactive）落点。
- `## collaborable`（B 区）：talk 创建 thread；fork/peer/say wiring。
- `## persistable`（B 区）：thread inline 落盘；restore。
- `## agent`（E 区）：agent 持 `talk`，执行即创建一条跑 thinkloop 的 thread。

## 改动提案（= 已落地事实）

1. **类型迁移 + 合并**：`ThreadContext` + `ThreadMessage` 从 `core/_shared/types/thread.ts` 迁入
   `builtins/agent/children/thread/types.ts`，与旧 `interface Data` **合并为一个统一类型**——会话窗指针
   字段 `target`/`targetThreadId`/`isForkWindow` 吸收为 `ThreadContext` 的 optional 字段，`Data`/`TalkData`
   成其别名；`ThreadWin` 保持分立（投影态）。core 经 `import type` 引用（运行时擦除、无环；先例
   `wait.ts` type-import `TalkData`）。`ProcessEvent`/`ThreadStatus`/flow-stone refs/路径函数留 core/_shared。
2. **纯构造器**：`talkConstructor` → `threadConstructor`；参数 `callerThreadId`/`callerObjectId`/
   `calleeObjectId`（删 `target`/`wait`）；**不掏 `runningThread(ctx)`**，返回一条新线程的完整
   `ThreadContext`（含初始 contextWindows）、不 mutate 父。集中出生函数 `buildThread`（threadConstructor +
   各创建路径共用）+ 窗初始化 helper `initThreadContextWindows`（self 门面 + 自我视角 thread 窗〔creator
   通道〕 + 全局单例工具成员）；删 `thinkable/context/init.ts`，peer 窗拆 `peer-windows.ts`（创建期 eager +
   buildInputItems reconcile）；砍 vestigial declared-members 磁盘读。
3. **caller-side wiring 归调用方**：`openForkChild`（fork 父挂子 / 投初始消息 / wait）；`agent.talk` 重写
   （fork→openForkChild + 父侧 fork 窗；peer→建会话窗 + `peerTargetExists` 守卫，懒建 callee 不变）；
   compress summarizer-fork / flows root / talk-delivery 懒建 callee / restore 各自调 buildThread。
4. **unactive 接收 self**：`ObjectLifecycleHook.exec` 签名 `(ctx, self)`；runtime `dispatchUnactiveIfZero`/
   `dispatchActiveIfFirst` 经 `targetId` 解析目标对象 data（object 表兜不到则内存线程树）作 `self` 传入；
   thread `unactive(_ctx, self)` 直接用 self、不再 `runningThread`/`findChild`。

## 受影响设计元素

- `## thread`（E 区）—— **ownerThread 供 construct/unactive 取已失效**（construct 纯用 args、unactive 收
  self；仅 end/readable 仍用 ownerThread）；ThreadContext 类型归 thread；buildThread/openForkChild。
- `## thinkable`（B 区）—— `ThreadContext`/`ThreadMessage` 类型物理归 thread builtin（core 经 import type）。
- `## OOC Class/Object Model`（A 区核心 10）—— `unactive` 钩子接收 self（语义：作用于既有对象 = 目标对象）。
- `## executable`（B 区）—— `ObjectLifecycleHook.exec(ctx, self)` 契约；`ObjectConstructor` 仍 (ctx,args)→Data
  不变（纯工厂是 thread 实现选择、非契约变更）。
- `## runtime`（E 区）—— ownerThread 注入面收窄（end/readable）；dispatch active/unactive 解析 self 注入。
- `## collaborable`（B 区）—— talk 创建 thread 的 wiring 移至 caller-side（agent.talk/openForkChild）；
  peerTargetExists 守卫；contract 不变（talk 创建 thread、say outbox→inbox）。
- `## persistable`（B 区）—— restore 经 initThreadContextWindows 幂等重铺窗；ThreadContext 类型位置。
- `## agent`（E 区）—— agent.talk 实现重写（契约不变）。
- **完整性批评官** —— 扫全树查漏（is/object/thread-as-referencable-object 等相邻 issue、builtin md、
  内部自洽、术语漂移、设计-实施越界）。

## 风险与权衡

1. core→builtin 出现 ~26 处 type-only import（指向 thread builtin）——与 thinkable-module「core 不再 import
   thread builtin」措辞张力；但那针对 **value import**，type-only 是另一根轴（运行时擦除、无环），且更诚实
   （core thinkloop/scheduler 本就是 thread 形状）。
2. fork/peer/super-alias 端到端（agent.talk 重写、peer 懒建、openForkChild）只能 live-LLM 验证，确定性门
   测不到——回流验收只覆盖文档与确定性门。
3. 「thread-as-object 经 generic instantiate 统一放置 + 对象表调度」这层最深 deferred 未做（保留 childThreads
   内存树调度）——本 issue 不动调度，留 thread-as-referencable-object 那轮。

## 待裁决点

- 无 design-killing 分叉（裁决已随用户指令落定）。回流细节由 fan-out reviewer 补具体评论后 Supervisor 汇总。

## review 记录

fan-out 4 受影响元素 reviewer（thread+runtime / thinkable / executable+object / collaborable+persistable）+ 1 完整性批评官。汇总：

- **thread+runtime**：确认 `## thread`「ownerThread 供 construct/end/unactive/readable 取」漂移（construct 纯工厂用 args、unactive 收 self，仅 end/readable/talk 用 ownerThread）；`## runtime` 同根漂移 + 缺 dispatch self 解析；建议 `## thread` 补类型归位。
- **thinkable**：**零漂移**——thinkable 设计文档从不声明 ThreadContext/ThreadMessage 物理位置、从不锚 init.ts/member-window 符号，故类型迁移 + init 拆分在 thinkable 文档无过期断言。
- **executable+object**：`object/self.md:80` 钩子签名 `exec(ctx)` → 须 `exec(ctx, self)`；`index.md` `## executable`/核心 10 在签名细节层之上、无漂移。**裁定 ObjectConstructor「纯工厂」不升通用约定**（契约 `(ctx,args)→Data` 未变，纯工厂是 thread 实现选择；升级=冗余新名词 + 越界，违「克制熵增」）。
- **collaborable+persistable**：**零漂移**——本次是「实现位置搬迁 + 类型迁包」，未触动这两元素设计契约（talk 创建 thread / say outbox→inbox / inline 落盘均守恒）；二者 self.md 不含任何受影响实现符号。
- **完整性批评官**（关键补漏）：抓到 `object/knowledge/lifecycle.md` **「半修」**——前次只回流第四节（thread.unactive），契约层行 16/32/35/42/43 仍是旧 `exec(ctx)` 签名 + 已删 `context/init.ts` 锚点 + 退役符号 `injectMember/injectSelf`，与同文件行 49 自相矛盾；并查出 `ThreadStatus` 锚点越界（:394→:362）、`contract.ts` 锚点偏移（:206/:190/:196→:221/:204/:210）、两处 off-by-2（thinkable/self.md:26、readable/self.md:56）。指出本 issue 应声明 supersede thinkable-module issue 的退役符号断言。

## 裁决

逐条采纳 reviewer 意见落地一致性回流（**已落地**）：

- **index.md**：`## thread`——ownerThread 收窄到 end/readable/talk + construct 纯工厂/unactive 收 self 单列 + 补「× 类型归位」（ThreadContext/ThreadMessage 归 thread builtin、Data 合并、core import type）；`## runtime`——ownerThread 句收窄 + 补 dispatch 经 targetId 解析 self 传入 `ObjectLifecycleHook.exec(ctx, self)`。
- **object/self.md:80**：钩子签名 `exec(ctx)` → `exec(ctx, self)` + self 来源说明。
- **object/knowledge/lifecycle.md**：契约层成对补全——行 16（签名 + 锚点 :221 + 删「body 自解析」）/ 32（解析 self + `hook.exec(ctx, self)`）/ 35（active 同补 self）/ 42（init 符号 → `initThreadContextWindows`/`injectPeerWindowsIfObjectThread`）/ 43（`context/init.ts:153/:196` → `init-windows.ts:91/:119` + 符号）/ ThreadStatus 锚点 :362；行 17/18 锚点 :204/:210。
- **off-by-2 锚点**：thinkable/self.md:26（:406→:404）、readable/self.md:56（:20→:22）。
- **零漂移确认**：thinkable / collaborable / persistable self.md + index.md `## executable`·核心 10 无须改（reviewer 核实）。

**supersession 声明**：本 issue supersede `[[2026-06-23-thinkable-module-context-decoupling]]`（status: verified）中以下已退役断言——`talkConstructor`（→ `threadConstructor` 纯工厂）、`injectMemberWindows`/`injectSelfWindow`/`injectMember`（→ 并入 `initThreadContextWindows`）、`thinkable/context/init.ts`（→ 拆 `init-windows.ts` + `peer-windows.ts`）、「root thread 直接对象字面量构造、不走 construct」（→ `buildThread` 集中出生）。该 verified issue 作历史记录不回改，读时以本 issue 为准。

## 落地验收（verified）

派 1 验收 reviewer 对照裁决清单独立核对（非重审设计）：

- **文档验收 — as-promised（0 gap）**：index.md `## thread`（ownerThread 收窄 + construct 纯工厂/unactive 收 self 单列 + × 类型归位）/ `## runtime`（ownerThread 收窄 + dispatch self）/ object self.md:80（`exec(ctx, self)`）/ lifecycle.md 契约层「半修」全补齐（同文件不再自相矛盾，行 16/17/18/32/35/42/43 + ThreadStatus 锚 :362）/ 两 off-by-2 锚点——全核实落地。
- **退潮验收 — 0 残留**：全树 grep（排除 docs/issues）`talkConstructor`/`context/init.ts`/裸 `initContextWindows`/`injectMemberWindowsIfObjectThread`/`injectSelfWindowIfObjectThread`/旧 `exec(ctx)=>`/「ThreadContext 在 core/_shared」断言——全 0 命中；源码 `core/_shared/types/thread.ts` 已无 ThreadContext/ThreadMessage 定义。
- **锚点抽查 — 11 处 10 准**：查出唯一 off-by-1（lifecycle.md:52 `index.ts:99`→`:98`）——**本轮已补**。无提案外漂移。

全缺口已闭 + 文档门（doc-drift / anchor-drift）全绿 → **verified**。

> 仍 LLM-gated 未覆盖：fork/peer/super-alias 端到端（源码侧，非本回流 issue 范围）——见风险 #2，留 live-LLM 验证。
