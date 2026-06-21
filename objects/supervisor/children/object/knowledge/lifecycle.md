---
title: 对象生命周期的程序实现（active / unactive / close / closable）
description: object self.md 核心 10「对象生命周期」的程序实现走查——core 泛型派发引擎 + builtin policy body + 触发 seam，逐处锚定源码。设计契约见 self.md 核心 10，本篇只讲「怎么实现的」。
activates_on:
  "object::root": "show_description"
---

# 对象生命周期的程序实现

> 本篇是 object self.md **核心 10「对象生命周期」**的实现走查（「怎么实现」）；契约（「是什么/为什么」）只在 self.md 核心 10，这里不复述。锚点对 `packages/@ooc/`（父仓 main），高漂移处锚函数名。
>
> 分层铁律：**core 提供泛型机制（引用计数 + active/unactive 派发），builtin 提供 policy body**——与 `construct` 同构。core 的派发引擎 `object-lifecycle.ts` **零 thread builtin import**；canceled/级联等是 thread 的 `unactive` body。

## 一、契约层（core 声明，零机制）

- **`ObjectLifecycleHook`**（`core/executable/contract.ts:206`）：`exec(ctx: LifecycleContext) => void | UnactiveResult | Promise<…>`。与 `construct` 签名不同——作用于**既有**对象、不产 Data；body 经 ctx 自解析目标。
- **`LifecycleContext`**（`contract.ts:190`）= `ConstructorContext` + `targetId`（refcount 变动的对象 id）。
- **`UnactiveResult`**（`contract.ts:196`）= `{ delete?: boolean }`；`delete:true` 仅 unactive 路径 honor（active 返回值忽略）。
- **`OocClass`** 槽（`core/runtime/ooc-class.ts:50-51`）：`active?` / `unactive?`（复用一个先前预留、从未实现的 dead 析构槽位）。
- **`OocObjectInstance.closable`**（`ooc-class.ts:87`）：缺省 undefined=可关；construct 标 `false`=结构窗、close 原语拒关。
- **registry 解析**（`core/runtime/object-registry.ts:170 resolveActive` / `:179 resolveUnactive`）：沿 `ooc.class` 链 `selfThenChain` 解析（与 `resolveConstructor` 同款 for 循环）。`register()` / `seedFrom()` 的 merge 块显式保留 `active`/`unactive` 槽（防增量 re-register 丢钩子）。

## 二、core 泛型派发引擎 —— `core/runtime/object-lifecycle.ts`

**`referencedObjectId(w)`**（`:31`）：窗 → 它引用、且生命周期由本窗持有的对象 id。**v1 仅解析 fork**：`isTalkLikeClass(w.class) && w.data.isForkWindow && w.data.targetThreadId && !isSelfThreadWindow(w.id)` → `targetThreadId`，其余 → `undefined`。（内存 `OocObjectInstance` **无** `_ref`/`refObjectId`——那只活在 `thread-context.json` 磁盘 entry、hydrate 时丢弃，故 v1 不读它。）

**`countSessionReferences(ctxThread, targetId)`**（`:64`）：session **内存线程树**（当前 + 沿 `_parentThreadRef` 到根 + 各 `childThreads` 递归、按 id 去重）里 status ∈ `{running, waiting, paused}` 线程中、`referencedObjectId(w)===targetId` 的外部引用窗数。退出态 `{done, failed, canceled}` 持有的窗**不计数**。自引用（self 门面窗）由 `referencedObjectId` 已排除。**v1 不盘扫**（fork 全在内存树内）。

**`dispatchUnactiveIfZero(ctxThread, targetId, targetClass, registry)`**（`export async function dispatchUnactiveIfZero`）：
1. `resolveUnactive(targetClass)` 无 → return（**fast-path**：refcount 成本只在被解引用对象 class 真声明 unactive 时付）。
2. `countSessionReferences > 0` → return。
3. `const r = await hook.exec({thread, targetId, runtime, args})`——单次调用，body 自解析。
4. `r?.delete === true` → `removeObjectFromSession`。

**`dispatchActiveIfFirst(ctxThread, targetId, targetClass, registry)`**（`export async function dispatchActiveIfFirst`）：对称——`resolveActive` 无 → fast-path return；`countSessionReferences !== 1`（刚加的窗须是第一个引用 ⇒ 0→1）→ return；否则 `hook.exec(ctx)`。**active 不消费返回值**。

**`removeObjectFromSession(ctxThread, targetId)`**（`:139`，private）：`rm(objectDir(ref), {recursive,force})` + 从 `ctxThread.contextWindows` 过滤掉引用 targetId 的窗。**仅覆盖缺省 objectDir 布局**；自定义持久化布局删不净（→ `PersistableModule.delete?` phase-2，见 persistable self.md 扩展点）。

## 三、触发 seam（机制接哪）

- **unactive — close 原语**（`core/executable/tools/close.ts`）：`handleCloseTool` 取窗后先查 `existing.closable === false`（`:62`）→ 拒关报错；否则 `mgr.close` + `thread.contextWindows = mgr.toData()` 同步后，对该窗 `referencedObjectId` 非空则 `dispatchUnactiveIfZero(...)`（`:74`）。
- **active — `WindowManager.instantiate`**（`core/runtime/window-manager.ts:164`）：建窗 push 后，先 sync `threadRef.contextWindows = this.toData()`（让 refcount 看见新窗），再 `referencedObjectId(instance)` 非空则 `dispatchActiveIfFirst(...)`。v1 仅 fork 窗触发；thread 无 active body → fast-path no-op。**扩展点**：phase-2 把 `referencedObjectId` 扩到 member/peer 时，init 注入路径（`initContextWindows`/`injectMember`/`injectPeer`，不经 instantiate）须补本调用。
- **closable 标记 — construct/init**（`core/thinkable/context/init.ts:152` / `:194`）：`initContextWindows` 建 thread/creator self 门面窗时设 `closable: false`（结构窗、恒在通道）；fork/peer/member 窗保持可关。

## 四、thread 的 policy body —— builtin 侧

**`thread.unactive`**（`packages/@ooc/builtins/agent/children/thread/index.ts:231`）：`exec` 调 `cancelSubtree(ctx.thread, ctx.targetId, new Set())`，返回 void（不 delete——canceled 线程保留在盘，同 done/failed）。

**`cancelSubtree(scope, targetId, visited)`**（`thread/index.ts:210`，async）：
- `findChild(scope, targetId)` 定位子线程；终态（done/failed/canceled）或不存在则 return。
- 切 `t.status = "canceled"`；`visited` 去重防环。
- **即时落盘**：`if (t.persistence) await writeThread(t)`（`:216`）——fork 子跑过 ≥1 tick 后有独立 `thread.json`（scheduler 写为 running），只改内存不刷盘则 bootstrap 的 `enqueueRunningThreadsAtBootstrap`（扫盘上 running/waiting）会把 canceled 子当 orphan 复活；故每节点即时 writeThread。
- 级联：遍历 `t.contextWindows`，对每个 `referencedObjectId(w)` 若 `countSessionReferences(t, child) === 0` 则递归 `cancelSubtree`（t 已 canceled→其窗不计数→只被 t 引用的孙归零→级联）。

**canceled 终态接入**：
- `ThreadStatus`（`core/_shared/types/thread.ts:398`）加 `"canceled"`（6 态）。
- `scheduler.emitChildEndNotifications`（`core/thinkable/scheduler.ts:73`）把 `done/failed` 终态判定纳入 `canceled`——canceled 子线程给父发 child-end marker（唤醒等待父 + 让父看见子含级联被取消），与 done/failed 一致、复用同一可见性通道（不另造 cancel event）。
- worker 跨对象 end-sync（`core/app/server/runtime/worker.ts`）亦纳 canceled 为终态。

## 五、session 对象表（B→A 正确分解）—— `core/runtime/session-object-table.ts`

`OocObjectInstance=对象 / OocObjectRef=窗(纯 ref)` 的运行态落点（issue 裁决修正 II + split2）：

- **两类型**：`OocObjectInstance<Data>={id,class,data}`（对象本身，活对象表）；`OocObjectRef<Win>={id(=objectId),class(缓存),title,status,createdAt,parentWindowId?,win?,closable?,objectRef?}`（context window，**不持 data**）。`ContextWindow=OocObjectRef`。
- **表**：`getSessionObjectTable(thread)` 走 `_parentThreadRef` 到内存线程树根、惰性建 `root._objectTable: Map<objectId, OocObjectInstance>`（runtime-only；`stripVolatileForPersist` 剥 `_objectTable`/`_renderedWindows`/`_parentThreadRef` 不入 thread.json，`instanceof Map` 守卫兜旧盘误持久；随 job 释放、**非永生全局表**）。
- **登记/解析**：`setSessionObject(thread, instance)`（hydrate/instantiate 登记对象）/ `getSessionObject(thread, id)`（dispatch/渲染取对象）/ `materializeWindow(thread, {id,class,data,...视角态})`（建窗 + 登记对象一处搞定，构造站点通用）/ `evictObjectFromTable`。`objectDataOf(ref, table)` **2 参**经表按 `ref.id` 解析 data；`classOf(ref)=ref.class`（缓存免查表）。
- **接线点**：`WindowManager.fromThread`（只装窗 ref）/ `instantiate`（setSessionObject + 建 ref）/ dispatch（self 从表取）；`object-lifecycle.referencedObjectId(w,table)` / `removeObjectFromSession`（末-ref-evict，核心 10 无悬空引用）；`thread-persist`（hydrate 拆=setSessionObject+ref / buildEntries 合=`{...窗, data: objectDataOf(表)}`，**磁盘平铺格式不变**）；`observable/window-hash`（hash 含表中 data 保内容敏感 + buildWindowsSnapshot 收 table）；`service.ts getThread`（响应预 hydrate：窗+data 平铺下发前端，前端无对象表）。
- **回归网**：`session-object-table.test.ts`（同 objectId 多窗解析同一对象 / live-ref / 不误共享 / evict）+ 跨 reload e2e。
- **现状诚实**：独立对象每 open 新 id、门面窗 data 空 → 真实跨窗 data 共享稀有（表多 1:1）；本期钉结构 + 解析层，是后续「稳定/去重 objectId」让共享真正生效的地基。active init seam 仍 dormant（无 facade class 有 active body）。
- **token 计量**：按**窗**各计其渲染产物（核心 9 多视角不同文本各占预算），**非按 object 去重**——A 的红利是 data 存一份、不等于 token 计一次。

## 六、边界与现状（v1）

- **v1 仅 fork**：`referencedObjectId` 只认 fork 子线程窗；peer/self/独立成员/root → undefined、不派发。peer 跨对象 canceled / 成员对象 unactive 推 phase-2。
- **`active` 已接线但零 body**：无 builtin 声明 active（thread 不需要）；fast-path 零成本。装好待用，首个 active body 出现时即生效（届时按上方扩展点补 init seam）。
- **`{delete:true}` dormant**：无 builtin 返回 delete；路径经合成 class 单测覆盖（`core/runtime/__tests__/object-lifecycle.test.ts`），非死槽。
- **测试**：`object-lifecycle.test.ts`（referencedObjectId/refcount/dispatch/active/delete 单测）+ `thread/__tests__/fork-unactive.test.ts`（关 fork 窗→canceled、嵌套级联、跨 reload 不复活）。
- **phase-2 清单**（dormant，无当前触发）：session 盘扫 refcount / 成员对象 unactive（referencedObjectId 扩 member 窗 + init seam）/ peer 跨对象 canceled / `PersistableModule.delete?` / thread→`done` 释放引用（与 `thinkable/knowledge` context.md core-11「thread 终止钩子」重叠须合并）/ re-entrancy 守卫（仅当某 unactive body 自己关窗才需）。
- **退役**：旧 thread `close` object method、其 fork 子线程归档 helper、以及先前预留的 dead 析构接口槽——均已删，并入 source/doc 双门禁的 FORBIDDEN_PATTERNS 防回潮（精确符号见 `check-no-deprecated-symbols.sh` / `check-doc-deprecated-drift.sh`）。

> 设计落地经「系统设计调整工作流」issue `docs/issues/2026-06-21-object-activation-lifecycle.md`（landed）。
