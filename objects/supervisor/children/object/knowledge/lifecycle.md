---
title: 对象生命周期的程序实现（active / unactive / close / closable）
description: object self.md 核心 10「对象生命周期」的程序实现走查——核心契约 + ThreadRuntime 派发引擎 + builtin policy body + 触发 seam，逐处锚定源码。设计契约见 self.md 核心 10，本篇只讲「怎么实现的」。
activates_on:
  "object::root": "show_description"
---

# 对象生命周期的程序实现

> 本篇是 object self.md **核心 10「对象生命周期」**的实现走查（「怎么实现」）；契约（「是什么/为什么」）只在 self.md 核心 10，这里不复述。锚点对 `packages/@ooc/`（父仓 main），高漂移处锚函数名。
>
> 分层铁律：**core 提供泛型契约 + class 注册表 seam（`resolveActive` / `resolveUnactive`），thread builtin 提供 refcount 算法 + 派发引擎 + policy body**——派发引擎实现在 `ThreadRuntime`（`packages/@ooc/builtins/agent/children/thread/runtime/thread-runtime.ts`）。这不是 core 通用机制：refcount = "扫本 session 全部 thread 看 contextWindows 引用此 object 的个数"，**只有 thread 形状对象 contributes refcount**，故 ThreadRuntime 是 thread builtin 的私有运行时（见 thread-runtime.ts:13-16 的归属说明）。

## 一、契约层（core 声明，零机制）

- **`ObjectLifecycleHook`**（`packages/@ooc/core/types/executable.ts:174`）：`exec(ctx: LifecycleContext, self: Data) => void | UnactiveResult | Promise<…>`。与 `construct` 签名不同——作用于**既有**对象、不产 Data；`self` = runtime 据 `ctx.targetId` 解析注入的**目标对象 data**（钩子 body 直接操作 self、不必从 ctx 自解析目标；无目标 data 时 self 为 undefined）。
- **`LifecycleContext`**（`packages/@ooc/core/types/executable.ts:156`）= `ConstructorContext` + `targetId`（refcount 变动的对象 id） + `reportDataEdit`。
- **`UnactiveResult`**（`packages/@ooc/core/types/executable.ts:163`）= `{ delete?: boolean }`；`delete:true` 仅 unactive 路径 honor（active 返回值忽略）。
- **`OocClass`** 槽（`packages/@ooc/core/runtime/ooc-class.ts:60`）：`active?` / `unactive?`（复用一个先前预留、从未实现的 dead 析构槽位）。
- **`OocObjectRef.closable`**（`packages/@ooc/core/runtime/ooc-class.ts:97`）：缺省 undefined=可关；construct 显式置 `false`=结构窗、close 原语拒关。
- **registry 解析**（`packages/@ooc/core/runtime/object-registry.ts` `ClassRegistry.resolveActive`/`resolveUnactive`，:113/:118）：**本类直查**（与 `resolveConstructor` 等其它 resolveXxx 一致）——OOC Class 协议层不内建继承 dispatch（对象模型核心 2），子类要复用父类的 active/unactive，经源码 import + spread 在子的 index.ts 显式拼父模块。

## 二、refcount 与派发引擎 —— `ThreadRuntime`

派发引擎以 `ThreadRuntime` 私有方法形式实现（`packages/@ooc/builtins/agent/children/thread/runtime/thread-runtime.ts`），由 `close` / `instantiate` 原语在 refcount 变动时调用。

**`ThreadRuntime#refcountInSession(objectId)`**（`thread-runtime.ts:239`，private）：扫本 session 全部已注册 thread 实例（经 `iterateSessionObjectTable(sessionId, …)` + class 过滤 `inst.class !== THREAD_CLASS_ID` 跳过）→ 数 `t.contextWindows` 中 `w.id === objectId` 的窗个数。**注意**：当前实现对**所有**契约窗等价计数（含 self 门面窗、structural builtin 窗等），不再区分 fork 窗 / peer 窗 / 自引用——此前 `referencedObjectId(w)` 单出 fork 窗的特化逻辑（`isForkWindow` / `targetThreadId` / `isSelfThreadWindow` 排除）**已退役**，与当前 thread construct 平铺生成 self 门面窗 + builtin 窗的模型一致。session 维度由 `iterateSessionObjectTable` 限定，**不走 `_parentThreadRef` 线程树**（旧线程树指针模型已退役，见 `packages/@ooc/builtins/agent/children/thread/thinkable/scheduler.ts:12`）。

**`ThreadRuntime#dispatchUnactive(objectId)`**（`thread-runtime.ts:271`，private）：
1. `registry.getObject(objectId)` 解析对象实例；无 → return（已被先前删除）。
2. `registry.resolveUnactive(inst.class)` 无 hook → return（**fast-path**：refcount 成本只在被解引用对象 class 真声明 unactive 时付）。
3. `await hook.exec(ctx, inst.data)`（`thread-runtime.ts:276`）——core 把 `inst.data` 作为 `self` 直接注入，钩子 body 不需自解析目标。`ctx` 含 `targetId` / `sessionId` / `worldDir` / `reportDataEdit`。
4. 返回值 `{delete:true}` → `registry.removeObject(objectId)`（`thread-runtime.ts:290`）从 session 表移除实例镜像。`{delete:true}` 当前 dormant（无 builtin 真返回）。

**`ThreadRuntime#dispatchActive(objectId)`**（`thread-runtime.ts:251`，private）：对称——`resolveActive` 无 → fast-path return；否则同样从 registry 取 `inst.data` 注入 `self`、`hook.exec`（`thread-runtime.ts:256`）。**active 不消费返回值**。

> 退役说明：先前文档描述的独立 export `referencedObjectId(w)` / `countSessionReferences(...)` / `dispatchUnactiveIfZero(...)` / `dispatchActiveIfFirst(...)` / `removeObjectFromSession(...)` / 独立 `core/runtime/object-lifecycle.ts` 文件**均已不存在**——派发引擎随 thread runtime facade 重构合并进 `ThreadRuntime` 私有方法；对象实例从 session 表移除（核心 10 末-ref-evict 语义）由 `ObjectInsRegistry.removeObject(id)`（`packages/@ooc/core/runtime/object-registry.ts:209`）承担，**仅删 registry 镜像**——磁盘 objectDir 自定义持久化布局的物理删除尚未接通（→ `PersistableModule.delete?` phase-2，见 persistable self.md 扩展点）。

## 三、触发 seam（机制接哪）

- **unactive — close 原语**（`packages/@ooc/builtins/agent/children/thread/runtime/thread-runtime.ts:140` `ThreadRuntime#close`）：
  - 取窗（`findWindow`），未找到报错。
  - `ref.closable === false`（`thread-runtime.ts:143`）→ 拒关报错。
  - 从 `thread.contextWindows` 过滤掉本窗（`thread-runtime.ts:147`）。
  - `refcountInSession(objectId) === 0`（`thread-runtime.ts:148`）→ `dispatchUnactive(objectId)`。
  - 该原语由 LLM 协议层 `close` tool 经 `dispatch.ts:33-37`（`packages/@ooc/builtins/agent/children/thread/thinkable/tools/dispatch.ts`）路由触发；schema 见 `thinkable/tools/schema.ts:24`。
- **active — `ThreadRuntime#instantiate`**（`thread-runtime.ts:168`）：
  - 经 `resolveConstructor` + `ctor.exec` 建初始 data；建 `OocObjectInstance` 后**先**算 `firstReference = refcountInSession(id) === 0`（`thread-runtime.ts:189`，登记 + 挂窗**之前**采样）。
  - `registry.setObject(instance)` 登记 session 表（`thread-runtime.ts:190`）。
  - push 新 ref 进 `thread.contextWindows`（`thread-runtime.ts:192`）。
  - `firstReference === true` → `dispatchActive(id)`（`thread-runtime.ts:193`）。
  - **扩展点**：phase-2 把 active body 接到 hydrate / peer 注入路径（非 `instantiate` 唯一入口）时须补本调用。
- **closable 标记 — thread `construct.exec`**（`packages/@ooc/builtins/agent/children/thread/index.ts:39-46`）：建 self 门面窗 + 6 个 builtin 窗（filesystem / terminal / interpreter / knowledge_base / runtime / agent/skill_index）时全部内联设 `closable: false`（结构窗、恒在通道）。close 原语 `ref.closable === false` 分支即拒关这类窗。
  - 退役说明：先前由独立 `init-windows.ts` / `WindowManager` 集中建结构窗的旧路径**已不存在**——窗内联在 thread `construct.exec` 一处生成。

## 四、thread 的 policy body —— builtin 侧

**`thread.unactive`**（`packages/@ooc/builtins/agent/children/thread/index.ts:53` `const unactive: ObjectLifecycleHook<ThreadContext>`）：thread 是持久身份、OOC 无强制 destruct——refcount 归 0 不强杀、不级联，改**通知**该线程「失去最后订阅者」，由其自决：

- 钩子**接收 `self`**（= 被解引用的目标线程 `ThreadContext` 本身，由 runtime `dispatchUnactive` 经 `targetId` 解析后注入；与 `ObjectMethod` 的 `(ctx, self)` 签名对齐）；`self.status === "done" || self.status === "failed"`（`index.ts:57`）则 return（terminal 已退出、仅停用、无需通知）。
- **non-terminal（running/waiting/paused）**：往该线程 `messages` 追加一条 `from="caller"` 通知「`[系统] caller 已关闭对话窗口，当前 thread 已无消息订阅者；可自行决定是否 end。`」（`index.ts:58-66`）。**不切终态、不级联**——线程下一轮 thinkloop 自决是否优雅 `end`；waiting 线程因 messages 增长被 scheduler 自然唤醒。
- 调 `ctx.reportDataEdit()`（`index.ts:67`）通知 thinkloop 持久化挂钩刷盘——通知须随盘存活，否则 reload 丢失。
- 返回 void（不 delete）：thread 身份留存。
- ~~曾经的 `appendInbox` + `inbox_message_arrived` 事件 + 直写 `writeThread(t)` 落盘路径已退役~~：现在直接 push 到 `self.messages` + 经 `reportDataEdit` 走统一持久化通道。inbox/outbox 子模型与 `appendInbox`/`scheduler.wakeWaitingThreadsOnInbox` API 在此重构窗口期不存在；通知靠 `messages` 数组承载，scheduler 唤醒走当前 thinkloop 调度路径。

**`canceled` 状态 + `cancelSubtree` 已全树退役**：改通知模型后 `canceled` 无产生者，从 `ThreadStatus`（`packages/@ooc/builtins/agent/children/thread/types.ts:242`，现 5 态 running/waiting/done/failed/paused）/ scheduler / worker 全树删除；`cancelSubtree` 函数已删。thread 终结一律走 `end`→done。（实现期裁决：不加 `canceled` 进 `check-no-deprecated-symbols`——词太通用易长期误报，靠 `ThreadStatus` 类型 5 态封闭防回归。）

## 五、session 对象表 —— `ObjectInsRegistry`

`OocObjectInstance=对象 / OocObjectRef=窗(纯 ref)` 的运行态落点，现以 `ObjectInsRegistry`（`packages/@ooc/core/runtime/object-registry.ts:185` `extends ClassRegistry`）实现，**按 sessionId 索引、不再经线程树根惰性建表**：

- **两类型**：`OocObjectInstance<Data>={id,class,data}`（对象本身，活对象表）；`OocObjectRef<WinData>={id(=objectId),class,title?,createdAt,closable?,...}`（context window，**不持 data**）。`ContextWindow = OocObjectRef`。
- **表归属**：`getSessionRegistry(sessionId)`（`object-registry.ts:248`）惰性建 `sessionId → ObjectInsRegistry`；进程级 `sessionRegistries: Map<string, ObjectInsRegistry>` 持有；job 退出由调用方 `releaseSessionRegistry(sessionId)` 释放。**非永生全局表**，**也不再寄居 thread 根上**——`stripVolatileForPersist` / `_objectTable` / `_renderedWindows` / `_parentThreadRef` 旧机制全部退役（旧文档锚 `core/runtime/session-object-table.ts` 文件**不存在**）。
- **登记/解析**：`ObjectInsRegistry.setObject(instance)`（`object-registry.ts:198`）/ `getObject(id)`（`object-registry.ts:193`）/ `removeObject(id)`（`object-registry.ts:209`）/ `iterObjects(cb)`（`object-registry.ts:215`）；进程级 helper `iterateSessionObjectTable(sessionId, cb)`（`object-registry.ts:264`）。
- **接线点**：
  - `ThreadRuntime#instantiate`（`thread-runtime.ts:168`）：`registry.setObject(instance)` + push ref 到 `thread.contextWindows`，构造站点通用。
  - `ThreadRuntime#execObjectMethod` / `execWindowMethod`（`thread-runtime.ts:101` / `:125`）：经 `registry.getObject(ref.id)?.data` 取业务 data 注入 `self` 代理（`makeSelfProxy` / `makeReadonlySelfProxy`）。
  - `ThreadRuntime#refcountInSession`（`thread-runtime.ts:239`）：经 `iterateSessionObjectTable` 扫 session 内 thread 实例。
  - scheduler（`packages/@ooc/builtins/agent/children/thread/thinkable/scheduler.ts:16`/`:41`）：同样经 `iterateSessionObjectTable` 扫 thread 调度。
  - 控制面 server runtime（`packages/@ooc/core/app/server/modules/runtime/index.ts:15`/`:65`）：响应预 hydrate 平铺下发前端。
  - PR-Issue deliver（`packages/@ooc/core/persistable/pr-deliver.ts:15`/`:54`）：跨 session 路由经 reviewer.sessionId 取对端表。
- **回归网**：`packages/@ooc/tests/registry.test.ts:11`/`:52` 覆盖 `iterateSessionObjectTable` 行为；其它生命周期单测目前由 thread-runtime 自身测试承载（旧 `core/runtime/__tests__/object-lifecycle.test.ts` / `thread/__tests__/fork-unactive.test.ts` 在重构窗口期不存在，待 phase-2 重建）。
- **token 计量**：按**窗**各计其渲染产物（核心 9 多视角不同文本各占预算），**非按 object 去重**——session 表的红利是 data 存一份、不等于 token 计一次。

## 六、边界与现状（当前重构窗口）

- **refcount 当前不区分窗类型**：`refcountInSession` 统一计 `w.id === objectId`，含 self 门面窗 / structural builtin 窗 / fork 子线程窗等。先前「v1 仅 fork」的窗类型特化逻辑（`referencedObjectId(w)` 经 `isForkWindow` / `isSelfThreadWindow` 单出 fork）**已退役**——当前模型下 structural 窗 `closable: false` 永不退出 thread 生命周期，self 门面窗与 builtin 窗的 closable: false 自然兜底，refcount 行为对 thread 类型对象等价于"它被多少 thread 引用"。peer/member 窗 unactive 通知 phase-2 再细化。
- **`active` 已接线但零 body**：无 builtin 声明 `active`（thread 不需要）；fast-path 零成本。装好待用，首个 active body 出现时即生效（届时按上方扩展点补 hydrate / peer 注入路径）。
- **`{delete:true}` dormant**：无 builtin 返回 delete；唯一通路 `dispatchUnactive → registry.removeObject` 已接，但物理删 objectDir 待 `PersistableModule.delete?` phase-2 接通。
- **测试**：当前生命周期路径主要靠 `packages/@ooc/tests/thread-runtime.test.ts` 覆盖（structural window closable / close 拒关 / instantiate 注册 / 等）；`packages/@ooc/tests/registry.test.ts` 覆盖 session 表迭代。专项 `object-lifecycle.test.ts` / `fork-unactive.test.ts` 在窗口期未重建。
- **phase-2 清单**（dormant，无当前触发）：
  - 成员对象 unactive（refcount 扩窗类型识别 + 对应 init seam）。
  - peer 跨对象 unactive 通知（refcount 跨对象类型行为分化）。
  - `PersistableModule.delete?`（物理删 objectDir / 自定义布局）。
  - thread→`done` 释放引用（与 `thinkable/knowledge` context.md core-11「thread 终止钩子」重叠须合并）。
  - re-entrancy 守卫（仅当某 unactive body 自己关窗才需）。
  - hydrate / 注入路径 active 触发（当前仅 `instantiate` 路径接通 active dispatch）。
- **退役（防回潮）**：旧 thread `close` object method、其 fork 子线程归档 helper、先前预留的 dead 析构接口槽、`canceled` 状态 / `cancelSubtree` 函数、`_parentThreadRef` 线程树指针 / `_objectTable` 惰性表 / `stripVolatileForPersist`、独立 `core/runtime/object-lifecycle.ts` 与 `core/runtime/session-object-table.ts` 文件、独立 `referencedObjectId` / `countSessionReferences` / `dispatchActiveIfFirst` / `dispatchUnactiveIfZero` / `removeObjectFromSession` exports、`init-windows.ts` / `WindowManager` 集中建窗路径、`appendInbox` + `inbox_message_arrived` + `wakeWaitingThreadsOnInbox` 路径——均已删除或并入 thread runtime / construct，并入 source/doc 双门禁的 FORBIDDEN_PATTERNS 防回潮（精确符号见 `check-no-deprecated-symbols.sh` / `check-doc-deprecated-drift.sh`）。

> 设计落地经「系统设计调整工作流」issue `docs/issues/2026-06-21-object-activation-lifecycle.md`（landed）。本篇 2026-06-25 一次锚漂修订，将派发引擎描述对齐 ThreadRuntime facade 重构后的现实（非设计调整）。
