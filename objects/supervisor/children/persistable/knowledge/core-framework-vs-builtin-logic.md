---
title: core 框架 / builtin 逻辑 边界（持久化）
description: persistable 维度的「core 只提供框架+API、builtin object 自己的序列化逻辑归 builtin」边界与判据；thread 容器持久化下沉、pr-issue/git/stone 为何留 core；接缝=registry dispatch
activates_on: {"object::root": "show_description"}
---

# core 框架 / builtin 逻辑 边界（持久化）

> 用户拍板的原则：**builtin object 的持久化逻辑归 builtin；core 只提供框架与 API，不干涉 builtin object 逻辑**（object-model 核心 7「object 经自定义 persistable 控制自己的序列化目录/方式；未自定义走系统默认」的落地纪律）。本篇定边界 + 判据 + 接缝，避免 builtin 序列化逻辑再淤积进 core。

## 一、判据：什么归 core 框架、什么归 builtin 逻辑

把 `core/persistable/` 里的东西按一条线切开：

**core 框架 / API（留 core）——「任何 object 都用、或多 actor 共享」的机制：**
1. **持久化契约 + dispatch**：`PersistableModule {mode, save, load}`（`contract.ts`；`PersistableContext` 含可选 `threadId` 供 thread 二级寻址）、registry 的 `resolvePersistable` / `isInlinePersisted`（按 class 自声明解析，不硬编码）。
2. **通用单对象 data IO**：`object-data.ts` 的 `saveObjectData` / `loadObjectData`——「class 自定义 persistable.save/load，否则系统默认 state.json」的通用编织点，适用于 file/search/process/plan/… 任何独立 object。
3. **存储原语**：路径计算（`common.ts` threadDir/objectDir/stoneDir）、串行写（`serial-queue`）、默认 state.json IO（`flow-runtime-object.ts`）、thread-context.json 文件原语（`flow-thread-context.ts` 的 threadContextFile/writeThreadContext/readThreadContext）、inbox per-message append store（`inbox-store.ts`）、`toJson`。
4. **跨 actor 共享子系统**：git versioning（`stone-*`）、stone/pool 三分布局、**PR-Issue 治理账本**（`pr-issue.ts`）。这些不是「某一个 builtin 实例的 data」，而是多个 actor 共同驱动的协议/基础设施（见三）。

**builtin 逻辑（归 builtin 自己的 `persistable/`）——「这个 object 实例怎么序列化自己」：**
- 一个 object 的 **own data / 运行态**怎么落盘/读回的**具体形态与流程**——record 的 strip 规则、嵌入 vs 引用决策、hydrate 重建。
- 例：thread 的 thread.json/thread-context/inbox/hydrate（见二）；example 的 data.json 样板；agent 的 self.md（`data.self` ↔ self.md）。

**一句判据**：序列化的是「**这一个实例自己的肉身**」→ builtin 逻辑；是「**任何实例都要的机制**」或「**多 actor 共享的协议/基础设施**」→ core 框架。

## 二、已落地：thread 容器持久化下沉到 thread builtin（标准 save/load，无专属 container）

thread 是 builtin object（`_builtin/agent/thread`），它的会话运行态是它自己的肉身，故其持久化**逻辑**归 thread builtin。落字关键：thread 用 **object-model 标准 `persistable.save/load`**，**不**发明专属 `container` 契约（曾有过 `PersistableModule.container = {write, read, writeSnapshot}`，是为实现偶然性套命名，已退役）。

归属原则（窗持引用、对象持数据）：**context window 只持窗状态（信封 + win + 指向对象的引用），不持被指对象的数据**；thread 的消息/events/status 是 thread 对象自身数据（thread 层），渲染时才投影进窗。

- **逻辑在 builtin**：`builtins/agent/thread/persistable/thread-persist.ts` 的 `saveThread(ctx,thread)` / `loadThread(ctx)`——thread.json strip（thread 自身数据）、thread-context.json 的窗状态 entry（inline class 整窗 vs 独立对象 `_ref`，被指对象数据各自落 state.json，不内联）、inbox per-message 落盘、hydrate 冷恢复全在这里。经 `persistable/index.ts` 的 `{mode:"inline", save, load}` 注册（同 `example/persistable` 一套契约）。
- **框架在 core**：`writeThread`/`readThread`（`thread-json.ts`）是 thread 作用域**薄 API**（threads/{threadId} 二级寻址），经 registry 解析 `save`/`load` 并用 thread 作用域 ctx（含 `threadId`）**委托**；manager 的 persist hook（`window-persistence.ts` 的 `reportContextEdit`）把 live 实例 map 同步进 `thread.contextWindows` 后整份 `writeThread`（取代旧的 `container.writeSnapshot`）。thread 调用的原语（object-data / 文件原语 / inbox / 串行写）仍是 core 框架。
- **fail-loud**：`writeThread`/`readThread` 要求 thread builtin 的 `save`/`load` 已注册；缺失 throw（旧码空 registry 静默降级，已纠正为响亮）。

## 三、为何 pr-issue / git versioning / stone 留 core（不下沉到 builtin）

判据落到「多 actor 共享子系统 → core 框架」：

- **PR-Issue（`pr-issue.ts`）= 跨 actor 治理账本，非 pr 窗的实例 data**：它由 `stone-versioning`（core）在跨域合入时**创建**、由 control-plane HTTP API（approve/resolve/list/get）**读写**、由 pr 窗（`_builtin/agent/pr`，reviewer face）**驱动 approve/reject**。三方共同驱动同一份 super-session 账本——它是治理**协议的存储**，与 git versioning 同属「窗只渲染/驱动的存储层」。把它搬进 pr 这一个 face 是范畴错误（等于把数据库塞进它的某个视图），且会让治理依赖某个窗类注册。故 **pr-issue 留 core 框架**；pr 窗（渲染 + approve/reject 方法）已在 builtin、是正确的 face。
- **git versioning / stone-pool-flow 布局**：天然是 World 级基础设施，所有 object 共用，留 core。

> 对比 thread：thread 的序列化没有「别的 actor 拥有」——一条 thread 的肉身只属它自己，故下沉。pr-issue 有多个 actor 共同拥有，故留框架。**「实例独占 vs 多 actor 共享」是这条边界的核心判据。**

## 四、接缝：registry dispatch（破依赖倒置）

core 不能 import builtin（分层），故 core 调 builtin 逻辑一律**经 registry**（`resolvePersistable(classId).save/load`），不直接 import——thread 与任何 class 自定义持久化走同一机制（不再有 thread 专属 `container` 通道）。builtin 反向 import core 框架原语（builtin→core，正确方向）。这避免了 persistable↔runtime 静态环，也让「core=框架、builtin=逻辑」在编译期成立。

## 五、未决（需 object-model 设计，未盲改）

- **治理特权仍以 `"supervisor"` 字面量硬编码**：`SUPERVISOR_OBJECT_ID`（`stone-versioning.ts` / `stone-feat-branch.ts` 重复定义）、`SUPER_ACTOR_FALLBACK`（`super-actor.ts`）、reviewer 集恒含 supervisor（`stone-feat-branch.ts`）、`BUILTIN_OBJECT_IDS`（`_shared/types/thread.ts`）。这是「core 硬编码某个具体 builtin」的真实违例，但要消除须先由对象模型表达「谁是**根 parent / 治理权威**」（见对象关系三轴：Supervisor=最顶层 parent object），再由 core 据此**推导**而非写死。属 class/object 维度的设计决策，留待设计后落地，不在持久化重构内盲改。
