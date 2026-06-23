---
title: thread 去特权化 —— core 只认 seam、不认 thread 具体实现（umbrella）
status: draft
date: 2026-06-23
---

# thread 去特权化（umbrella）

## 背景 / 动机

最近几轮 thread↔core 边界工作（[[2026-06-23-thinkable-module-context-decoupling]] 把 context 构造搬出 core、
[[2026-06-23-thread-type-merge-pure-constructor]] 合并 ThreadContext + 纯构造器）后做 code review，发现一个
**贯穿性的设计病**：core 把 thread builtin 当**特例**对待——处处**具名 import 调 thread 的具体实现**
（`writeThread`/`readThread`、`reachableThreads`、context machinery 旧址…），而不是像对待其它 class 那样
**经 registry 泛型 seam 解析**。OOC 已经为每个维度建了 seam（`resolveThinkable`/`resolveReadable`/
`resolvePersistable`/`resolveUnactive`），但 thread 反复以"blessed import"绕开它们。

这导致两个连锁后果：(1) core 名义上"不依赖 thread builtin"，实则到处 value/type 依赖其具体实现（伪解耦）；
(2) thread 不能真正"自主"行使自己的维度能力（如持久化），而是被 core 反向操纵其底层函数。

## 判据（本 umbrella 的单一裁尺）

> **core 具名 import 调 thread builtin 的具体实现 = 牵绊。凡有泛型 seam，走 seam；thread 是 registry
> 后面的普通一类，core 不该认它的具体函数名/字段位置。**

附判据（state vs content，见病灶 0）：core 对 thread 的**状态依赖**是 intrinsic（驱动 thread 就要碰其控制态），
但应 typed against **core-owned 抽象**；core 对 thread 的**内容依赖**（contextWindows 等）应为 0。

## 四病灶（现状，锚代码）

### 病灶 1 —— 持久化：seam 在却被绕开（最清晰，**首期**）

- thread **已实现合规 save/load**：`builtins/agent/children/thread/persistable/index.ts:24-25`
  （`save: saveThread` / `load: loadThread`，`mode:"inline"`）；泛型派发器 `registry.resolvePersistable`
  （`core/runtime/object-registry.ts:238`）也在，**普通 object 已走它**（`core/persistable/object-data.ts:91`）。
- **唯独 thread 被 core 全程绕开**：`grep resolvePersistable` 在 core/thinkable + app/server/runtime = 0 命中；
  取而代之是 ~30 处具名调 `writeThread`/`readThread`——
  - 引擎层：`thinkable/thinkloop.ts:398,418`、`thinkable/scheduler.ts:99`、`runtime/window-persistence.ts:47`；
  - app 层：`app/server/runtime/{worker,resume,resume-orchestration,thread-query}.ts`、
    `app/server/modules/{runtime,flows}/service.ts`。
  - 连泛型回调 `reportContextEdit` 都被 `runtime/window-persistence.ts:44` **硬接到 writeThread**，
    而非 `resolvePersistable(thread.class).save`。
- **误读核心 7**：`thread/persistable/index.ts:10-13` 把"runtime 直接 import writeThread/readThread"写成设计、
  引"object-model 核心 7（持久化可自定义）"背书。但核心 7 恰恰**要求经 seam**（object 控制自己的序列化 = 走
  resolvePersistable），不是"core 可叫底层函数名"。豁免是把核心 7 读反了。

### 病灶 2 —— 生命周期：泛型 refcount 引擎懂 thread 树形

- `core/runtime/object-lifecycle.ts` 自称"泛型、零 thread 知识"，实则 `reachableThreads`（`:53-66`）沿
  `_parentThreadRef` / `childThreads` 走内存线程树、`countSessionReferences`（`:72`）读 `status`/`contextWindows`、
  dispatch self 解析（`:111`/`:145`）依赖 `reachableThreads`。refcount **机制**是泛型，**"可达对象集"计算**
  是 thread 特定——后者泄漏进了 core 泛型引擎。**无 seam**。

### 病灶 3 —— recovery：thread-event 语义在 core

- `core/thinkable/recovery.ts` 读 `ProcessEvent` 的 kind 语义（`call_started` 后无 `llm_interaction` ⇒ 上轮未跑完）
  判"中断"。"我是否中断"是 thread 的事件语义；core recovery 只该负责"重新调度跑"。**无 seam**。

### 病灶 4 —— scheduler：树遍历原语

- `core/thinkable/scheduler.ts` 走线程树选下一个可跑 thread。**调度本身是 core 本职**（保留），但其"遍历线程树"
  原语与病灶 2 同源，可由 thread 提供共享。

**非病灶（合法，勿误治）**：core 读 thread **状态**（`status`×11、`events`×10…，见
[[2026-06-23-thread-type-merge-pure-constructor]] 验证数据）是驱动 thread 的 intrinsic 依赖；`ProcessEvent`/
`ThreadStatus` 留 core（events 是 state、core 产它）。理想态见方向③（typed against ThreadState）。

## 三方向（治理）

1. **seam 化既有 blessed import**：凡 seam 已存在的（病灶 1 持久化），把 core 的具名调改为泛型 seam 调用
   （`resolvePersistable(thread.class).save/load`；`reportContextEdit` 路由到它）。thread 真正自主持久化，
   core→thread builtin 的持久化 value import 归零。
2. **为无 seam 的补最小 seam**：病灶 2/3/4——给 thread 一个"可达对象集 / 树遍历"提供者 + "中断检测"钩子
   （归 thread 的 thinkable / lifecycle 模块），core 泛型引擎只调钩子、不懂 thread 树形与事件语义。
3. **core-owned `ThreadState` 抽象（状态/内容拆分）**：把 `ThreadContext` 拆成 `ThreadState`（控制态，core 拥有/
   驱动）⊕ `ContextContent`（contextWindows/_renderedWindows/_objectTable/会话窗指针，thinkable 拥有）；
   core 驱动引擎 typed against `ThreadState`（core-owned），内容归 thread。详见状态/内容判据。

## 分期（建议）

- **P1（方向①）✅ landed —— 两轮**：
  - **P1.0**（feat/thread-persist-seam，9cced43d，已合 main）：消 value 边——core seam 派发器
    `thread-container-io.ts`。但 review 指出**该派发器仍 thread-专属（THREAD_CLASS_ID hardcode、thread-命名、
    住 core）**，是 core 特殊对待 thread 的半步（同 ThreadContext 搬位置不算解耦）。
  - **P1.1 重做**（feat/thread-persist-generic-by-class，commit db2ce548）：用户裁决——**持久化触发是 object
    级统一机制，thread 只是一种 object；无文档要求每 tick 落盘**。改为**按 class 泛型派发**：① 运行时 thread
    加 `class` 字段（像 `OocObjectInstance{id,class,data}` 自带 class 标识）；② 新 `runtime-object-io.ts`
    （**泛型、零 thread 专属**）：`saveObject(obj)` 读 `obj.class` 派发、`loadObject(classId,ref,threadId)`
    按显式 class 派发 → `resolvePersistable(class).save/load` → 各 class 自己实现（thread → saveThread/
    loadThread，逻辑 100% 在 builtin）；③ 删 `thread-container-io.ts`（thread-专属，淘汰）；全部 writeThread/
    readThread → saveObject/loadObject(THREAD_CLASS_ID,…)；buildThread/loadThread/字面量恒置 class；测试补
    register-builtins/class（fail-loud 暴露的真实缺口）。**核心战果：core 无任何 thread-持久化专属代码，按 class
    泛型分派（thread 与 file/process 同路）。** 全门绿（tsc / core 652 / builtins 214 / storybook 64 + 4 检查门）。
- **P1.5（方向①续，elegance，未做）**：调用点审计结论——18 个显式 `saveObject` 点多为**合理的状态变更/hydrate
  点**（恢复锚点 / 状态 durability / 跨线程投递 / reportContextEdit 窗变触发），不是冗余；真正的 smell 是
  **「手动 persist now」的脆弱模式**（漏一处即丢数据）。最优雅 = **edit 触发**（appendEvents 单一 ingest +
  reportContextEdit 自动落盘），把 18 显式点收敛成几个。但这改的是**何时落盘的行为**（durability 时序 + 恢复锚点
  敏感、LLM-gated 不可确定性验证），故作独立增量、不在 P1 盲改。立项见 acceptance：先补确定性单测覆盖
  appendEvents→persist 时序，再收敛显式点。
- **P2（中期）**：方向②——reachableThreads/recovery/树遍历补 seam。改 object-lifecycle / recovery / scheduler
  调 thread 提供的钩子；core 泛型引擎去 thread 树形/事件语义知识。须确定性单测覆盖 refcount + recovery。
- **P3（类型层，较大）**：方向③——ThreadState/ContextContent 拆分。轻量版（core 定 `ThreadState`、builtin
  `ThreadContext extends ThreadState`、core 驱动 typed against ThreadState）vs 内容挪出 struct（contextWindows
  从 thread struct 迁入 thinkable 自管存储、彻底零内容依赖）——成本对比另立子 issue。注：`thread.class`（P1.1 加）
  是 P3 ThreadState 的前置——object 自带 class 标识。
- **P2（中期）**：方向②——reachableThreads/recovery/树遍历补 seam。改 object-lifecycle / recovery / scheduler
  调 thread 提供的钩子；core 泛型引擎去 thread 树形/事件语义知识。须确定性单测覆盖 refcount + recovery。
- **P3（类型层，较大）**：方向③——ThreadState/ContextContent 拆分。轻量版（core 定 `ThreadState`、builtin
  `ThreadContext extends ThreadState`、core 驱动 typed against ThreadState）vs 内容挪出 struct（contextWindows
  从 thread struct 迁入 thinkable 自管存储、彻底零内容依赖）——成本对比另立子 issue。

## 受影响设计元素

- `## persistable`（B 区）—— thread 持久化经 seam 而非 blessed import；核心 7 表述澄清。
- `## runtime`（E 区）—— resolvePersistable 用于 thread；lifecycle dispatch 的 reachableThreads/self 解析。
- `## thread`（E 区）—— 去特权化总纲；ThreadState/content；blessed import 退役。
- `## thinkable`（B 区）—— ThreadState vs ContextContent；recovery/中断检测钩子归属。
- `## OOC Class/Object Model`（A 区核心 7 持久化可自定义 = 强制走 seam；核心 10 生命周期）。
- `## persistable × thinkable`（D 区）—— thread inline 落盘经 seam 的边界。

## 风险与权衡

1. P1 ~30 处调用点改造面广，但纯接线（seam 已存在 + thread.save/load 已实现），行为不变、确定性可测——低风险。
   注意 call-site 形状差异（`writeThread(thread)` vs `readThread(ref, threadId)` vs `save(ctx,data)`/`load(ctx)`）
   需统一经 PersistableContext 收口。
2. P2 补 seam 触及 refcount/recovery 正确性——须先有确定性单测兜底再改（现有 fork-unactive.test 是起点）。
3. P3 内容挪出 struct 牵动 thread-context.json inline 持久化 / restore / 对象表——较大，建议轻量版先行。
4. 整体勿过度抽象：thread 是**唯一**会话载体注册 class，方向②/③的 seam/抽象不是为多态，而是为**关注点分离 +
   一致性**（thread = seam 后普通一类）。判据是"一致性 + core 不认具体实现"，不是"越抽象越好"。

## 待裁决点

- P1 是否独立先落（建议：是，低风险高一致性收益）。
- 方向② recovery「中断检测」钩子归 thinkable 还是 lifecycle/persistable。
- 方向③ 走轻量版（interface extends）还是彻底版（内容挪出 struct）——P3 子 issue 决。
- 病灶 4 scheduler 树遍历是否值得抽（调度本职 vs 遍历原语共享）。

## review 记录 / 裁决 / 落地验收
（umbrella：各期落地时各自走 issue → review → 裁决 → 验收；本文记录主题、判据与分期，子期落地回填链接。）
