---
title: session-level invalidate 设计（含 hot-reload + PR merge 双触发统一 + getSessionRegistry miss 语义）
status: in-review
date: 2026-06-25
splits_from: 2026-06-25-merge-feat-branch-unification.md
follows: 2026-06-25-inheritance-via-source-import-spread.md
---

# session-level invalidate 设计

## 背景 / 动机

母 issue `2026-06-25-merge-feat-branch-unification` 改动 3 想加 `WorldRuntime.invalidateSessionsByClass(classIds)`，作为前 issue `inheritance-spread` 裁决 D7「MVP 路径 = 清空整个 sessionRegistry」的实施。

**runtime reviewer 实测揭露重大设计前提错位**：

1. `sessionRegistries` 是 `packages/@ooc/core/runtime/object-registry.ts:232` 的 **module-level 进程级 `const` 单例**——**不在** WorldRuntime 实例上
   - `world-runtime.ts:22-29` 的 WorldRuntime interface 只暴露 `serialQueue / serverLoader / stoneRegistry`，**无** sessionRegistries 字段
   - 释放走 module-level `releaseSessionRegistry(sessionId)` (`:254`)
   - 跨所有 WorldRuntime 实例共享
   - 「per-WorldRuntime invalidate sessions」API 是**错位的**

2. 「清空 sessionRegistries」**实际后果不是「下次冷启重 hydrate」**——`getSessionRegistry(sid)` miss 时只 new 空 `ObjectInsRegistry` + `copyFrom(builtinClassRegistry)`，**没有自动 hydrate**：
   - `pr-deliver.ts:48` / `thread-runtime.ts:63` / `scheduler.ts:37` / `runtime-object-io.ts:107` 等 caller 先 `getSessionRegistry` 拿表
   - hit miss 时**没有人在自动 hydrate**——hydrate 只在 session 首启动时 `hydrateSession` 显式调（runtime-object-io.ts:123）
   - thinkloop tick 调 `getSessionRegistry(sid)` 拿到空表 → `registry.getObject(threadObjectId)` 返回 undefined → `dispatchActive/dispatchUnactive` 直接 early return（`if (!inst) return;`）
   - **thinkloop silent stuck**——不是崩溃、是静默卡死，直到 worker 重启 session 或显式调 hydrate

3. **persistable reviewer 同步指出**：「清空所有 sessionRegistries」**违反 flow-main 解耦铁律**——flow 是 main 的 fork、二者解耦
   - 其他 session 各自停在 fork 时刻的 main HEAD（一个历史点），main 推进不该牵连
   - 但发起本次 merge 的 session 自己的 registry 在 merge 后确实变 stale

母 issue 已拆走这部分，本 issue 接管「session-level invalidate 系统设计」——需先解决前提（sessionRegistries 归属 + miss 语义），再设计 invalidate API。

## 现状（锚 index.md 对应 `##` 节）

锚点：
- `## runtime`（E 区）—— ObjectInsRegistry / sessionRegistries / WorldRuntime / ServerLoader
- `## persistable`（B 区）—— stones / flows / pools 三层 + flow-main 解耦
- `## reflectable × persistable`（D 区）—— hot-reload 路径 A（PR merge）vs 路径 B（fs.watch dev）
- `## persistable × thinkable`（D 区）—— sessionRegistries 中实例 + thinkloop 调度
- 前 issue inheritance-spread 裁决 D7 —— MVP 路径承诺（本 issue 重做）

涉及文件：
- `packages/@ooc/core/runtime/object-registry.ts:219-271`（ObjectInsRegistry + sessionRegistries module 单例 + getSessionRegistry / releaseSessionRegistry）
- `packages/@ooc/core/runtime/world-runtime.ts:22-65`（WorldRuntime + hot-reload watcher 联动）
- `packages/@ooc/core/runtime/server-loader.ts:100-115`（invalidateStone class-cache 失效）
- `packages/@ooc/core/runtime/hot-reload.ts`（fs.watch 推模式）
- `packages/@ooc/core/runtime/stone-registry.ts` + `stone:changed` 事件
- `packages/@ooc/core/persistable/runtime-object-io.ts:107,123`（hydrateSession / hydrate 路径）
- `packages/@ooc/core/persistable/stone-versioning.ts:290-323`（mergeFeatBranch 末尾 invalidateStone 调用）
- thinkloop / scheduler caller 群

## 改动提案

### 改动 1：sessionRegistries 归属重设计

**两选项**（待裁决 1）：

**选项 A · 保持 module-level 单例**：
- pros: 跨 WorldRuntime 共享、释放经 module-level `releaseSessionRegistry`；改动量小
- cons: 「invalidate」API 不能挂 WorldRuntime；多 WorldRuntime 同进程时（如测试）相互影响
- API 形态：在 `object-registry.ts` export module-level `invalidateSessionByClass(sid, classIds)` 与 `invalidateAllSessionsByClass(classIds)`

**选项 B · 移到 per-WorldRuntime**：
- pros: 「session 状态归属 WorldRuntime」语义干净；API 自然挂 WorldRuntime
- cons: 改动大（caller 群全部要拿到 worldRuntime ref）；现有 module-level release 路径要改
- API 形态：`WorldRuntime.invalidateSessionByClass(sid, classIds)`

倾向 **选项 A**——母 issue 改动 3 错位前提已暴露问题，但本 issue 大手术 module-level → per-WorldRuntime 风险高；A 选项最小代价解决错位 + 不破现有 release 机制。

### 改动 2：getSessionRegistry miss 语义重设计

**问题**：miss 时返回空表导致 thinkloop silent 卡死。

**选项**（待裁决 2）：

**选项 A · 加自动 hydrate fall-back**：
- `getSessionRegistry(sid)` miss → 触发 `hydrateSession(sid)`（从盘读回）→ 重新拿
- 需 baseDir / hydrate 配置入参——`getSessionRegistry` 当前签名只有 sid，新增 baseDir 入参或经 module-level config 注入
- pros: 任何 invalidate 之后下次 caller 调 getSessionRegistry 自然冷启重读
- cons: caller 群（4+ 处）的签名变化或全局配置注入；hydrate 失败时如何回退

**选项 B · 显式 invalidate API 含 re-hydrate**：
- `invalidateSessionByClass(sid, classIds)` 内部调 `hydrateSession`
- caller 群不变
- pros: 关注点集中在 invalidate 处；不动 getSessionRegistry 签名
- cons: hydrate 是 async 操作—— invalidate API 变 async；caller 必须 await（mergeFeatBranch 末尾 OK，fs.watch handler 也 OK）

**选项 C · invalidate 只标记 stale，下次 getSessionRegistry 检查标记**：
- 加 invalidation-mark map
- getSessionRegistry 检 mark，命中则 hydrate
- 折中
- cons: 状态多一层、易漂移

倾向 **选项 B**——关注点最集中、不动 caller 群签名、await 合规（mergeFeatBranch 已 async；hot-reload handler 已支持 async）。

### 改动 3：精准 invalidate vs 全清

按 persistable reviewer 强约束：**只清发起本次推进的 session 自己的 registry**——

**正确语义**：
- `invalidateSessionByClass(initiatingSid, classIds)`——签名带 sid，仅清发起方
- 不动其他 session 的 fork（它们各自维持独立时间线）
- caller（mergeFeatBranch / hot-reload handler）必须能拿到 initiatingSid

**caller 取 sid 路径**：
- mergeFeatBranch caller 是 `approval-flow.ts:mergeFinalizer`（reflectable-pipeline-wiring issue 改动 4）——它知道 author thread 的 sid
- fs.watch hot-reload handler 不知道 sid——它是文件变化触发、不属任何 session
- **二分**：PR merge 路径走精准 invalidate；fs.watch 路径走「class-level invalidate only，不动 session」（保持 D7 路径 B 现状）

### 改动 4：mergeFeatBranch API 增 sid 参数

按改动 3，async `mergeFeatBranch(baseDir, branch, paths, reason)` → `mergeFeatBranch(baseDir, branch, paths, reason, initiatingSid?)`：

- `initiatingSid` optional，提供则 ff-merge 后调 `invalidateSessionByClass(sid, classIds)`
- 不提供则只调 `invalidateStone`（class cache，与现状一致）
- 测试侧（母 issue happy-path）不传 sid，行为不变
- 真 PR 闸 caller（reflectable-pipeline-wiring）传 sid

### 改动 5：PR record schema 加 originSid

- `PrRecord { ..., authorThreadId, authorSessionId }` —— `authorSessionId` 是发起 PR 的 author thread 所属 session id
- `mergeFinalizer` 调 mergeFeatBranch 时把 `record.authorSessionId` 传作 initiatingSid

### 改动 6：lifecycle 与 invalidate 分离铁律入文档

- 清 sessionRegistries 时**不应**触发 dispatchUnactive
- 原因：业务侧 cleanup 跑、但下次 hydrate 重建不会回滚 → 状态不自洽
- 正确语义：silent replace class entry（hot-reload 路径 A 已经如此）
- **写入 persistable self.md** 作为铁律

### 改动 7：hot-reload + PR merge 双触发统一

- 母 issue D7 描述「路径 A = PR merge → invalidateStone；路径 B = fs.watch hot-reload → invalidateStone」——两条路径**都只清 class cache、不动 session**
- 本 issue 改动 4 让 PR merge 路径**额外**清精准 session
- fs.watch 路径**不**清 session（无 sid 可定位）
- **二者分流明确**：写入 reflectable × persistable 设计契约

### 改动 8：并发安全注意

merge 期间另一 session 正在 hot-reload 同一 class 时的 race：
- `mergeFeatBranch` 在 `enqueueSessionWrite` queue 内（mergeFeatBranch issue D5）
- 加 invalidate hook 后是否仍 race？需 review queue 是否覆盖整个 mergeFeatBranch 调用链
- 倾向：invalidate hook 在 queue 内、与 ff-merge 同事务

### 改动 9：测试覆盖

新增 `tests/session-invalidate.test.ts`：
- happy path：mergeFeatBranch(sid=A) → session A 中相应 class entry 清；session B 中**不**清（**正负双断言**）
- miss 自动 hydrate：清完后下次 `getSessionRegistry(sid=A)` 触发 hydrate 重读盘
- lifecycle 隔离：invalidate 不触发 dispatchUnactive 钩

## 受影响设计元素

A 区
- 无（不动对象模型）

B 区
- `## persistable` —— flow-main 解耦铁律 + invalidate 与 lifecycle 分离铁律入 self.md
- `## reflectable` —— PR merge 链路精准 invalidate（路径 A 落地完整）
- `## runtime` ⚠️ —— **核心改造**（sessionRegistries 归属 / getSessionRegistry miss 语义 / invalidate API）

D 区
- `## reflectable × persistable` —— 双触发分流明确入设计文档
- `## persistable × thinkable` —— invalidate 与 lifecycle 分离铁律

E 区
- `## thread` —— thread-runtime.ts dispatchActive/Unactive caller 在 invalidate 后行为：silent replace、不触发钩

未受影响：
- A 区核心 / B 区 thinkable executable readable visible collaborable observable app / 其他 D 区交叉 / C 区 builtins

## 风险与权衡

1. **改动 1 / 2 是 runtime 核心数据结构调整**——风险高，需 grep 全部 caller 群、跑全套 e2e
2. **选项 A 保 module 单例**：测试隔离（多 WorldRuntime 同进程）会有干扰——但本仓测试一直如此，未爆问题，可接受
3. **改动 4 `initiatingSid` optional**：保守兼容；但需 lint 防忘传——真 PR caller 必须传，加 type 守卫或 lint rule
4. **改动 5 PR record 加字段**：影响 PR-Issue schema（reflectable-pipeline-wiring issue 改动 3 落 PR-Issue 持久化）——本 issue 与 reflectable-pipeline-wiring issue **强耦合，需同期实施或显式约定先后**
5. **改动 9 测试**：「session B 不清」断言需要测试 setup 多 session，复杂度上升

## 待裁决点

1. **改动 1**：sessionRegistries 归属 module 单例（A）vs per-WorldRuntime（B）？倾向 A
2. **改动 2**：getSessionRegistry miss 语义——自动 hydrate（A）vs invalidate API 含 re-hydrate（B）vs stale 标记（C）？倾向 B
3. **改动 5 PR record originSid 字段**：与 reflectable-pipeline-wiring issue 同期实施还是分阶段？需要协调
4. **改动 4 `initiatingSid` optional 还是 required**？optional 兼容性好但忘传成本高；required 安全但破坏现有 caller
5. **MVP scope**：本 issue 全做（改动 1-9）还是先 MVP（改动 2 + 4 + 5）后续扩 1/6/7？倾向 MVP 优先

## review 记录

按 design-workflow 步骤 2，2 维度 reviewer + 1 完整性批评官 fan-out。三方实测结果**全部支持**两个前提错位真实存在；但 **接口边界达成新共识**：本 issue 应大幅收窄、把不属于 runtime/persistable 协议层的改动剥到 reflectable-pipeline-wiring issue。

### E · runtime —— 大幅收窄（**取消 改动 4 与 改动 5**）

**实测全部验证 issue 三大前提错位**：
- ✅ `sessionRegistries` 是 `object-registry.ts:232` module-level const 单例
- ✅ WorldRuntime interface 不暴露 sessionRegistries
- ✅ `getSessionRegistry` miss 时不 hydrate（new 空表 + copyFrom builtinClassRegistry）
- ✅ caller 群实测 7 处（issue 写"4+ 处"漏了 `app/server/modules/runtime/index.ts` 3 处）
- ✅ thinkloop silent stuck 风险真实（`dispatchActive/Unactive` 在 `if (!inst) return` 静默卡死）

**待裁决倾向**：
1. **改动 1 sessionRegistries 归属** → **选 A**（保持 module-level）+ module-level export `invalidateSessionByStoneIds(baseDir, sid, stoneObjectIds)`
2. **改动 2 miss 语义** → **选 B**（invalidate API 含 re-hydrate）+ 必须澄清「miss 在 invalidate API 内、不在 getSessionRegistry 内」
3. **改动 5 MVP scope** → **改为：改动 2 + 改动 6 + 改动 9 部分**（happy + miss + lifecycle）+ runtime self.md 文档化 invalidate API

**接口边界一问 → 大幅修正**（runtime 视角强烈反对改动 4、改动 5）：

- **改动 4（mergeFeatBranch 增 sid 参数）= 越界**——`mergeFeatBranch` 是 stone-versioning 的纯 git 机制（注释 `:264-272` 明示「queue-naive、纯 git 机制」），它**不该感知 session 概念**。
- **改动 5（PR record originSid）= 越界**——`PrRecord` 是 reflectable 数据结构，不归 runtime 协议；本 issue 不应持。
- **正解**：session-level invalidate 由 mergeFinalizer caller（reflectable-pipeline-wiring 改动 4）在自己作用域内调 `invalidateSessionByStoneIds(baseDir, authorSessionId, stoneObjectIds)`。runtime 协议层只暴露原语，**调用谁/传谁的 sid 是 caller 的事，零耦合**。
- 改动 4 + 改动 5 → **剥到 reflectable-pipeline-wiring issue 实施落地时挂**

**API 名建议**：`invalidateSessionByClass(sid, classIds)` → `invalidateSessionByStoneIds(baseDir, sid, stoneObjectIds)`：
- `stoneObjectIds` 而非 `classIds`——OOC 核心区分 class（定义）vs object（实例），sessionRegistry 持的是 `OocObjectInstance(id=objectId)`，清的是 objectId 集合的 entry
- 加 `baseDir`——因为内部需要调 `hydrateSession(baseDir, sid)`

**实测发现的隐含问题**（不在 issue 中，建议落地时关注）：

- **N1（已存在的 bug）**：mergeFeatBranch 调 `defaultServerLoader.invalidateStone`（module-level），但 hot-reload listener 调 `serverLoader.invalidateStone`（per-WorldRuntime instance）—— **两条路径打不同的缓存**。这独立于本 issue 但需顺手记一笔。
- **N2（API 名义）**：见上 API 名建议。
- **N3（并发安全）**：实测 `mergeFeatBranch` 本身 queue-naive，queue 由 caller 持。invalidate hook 应在 `enqueueSessionWrite("hydrate:" + sid, ...)` 串行化避免并发 hydrate 撞 race。
- **N4（hydrate 幂等）**：实测 `hydrateSession` 当前 setObject 是 Map.set 末写赢——可接受，但有读 race；invalidate API 内需用 enqueue 串行化。

**测试建议（改动 9 加强）**：
- 已列：happy / miss / lifecycle 三条
- 加：fs.watch 与 PR merge 并发 race 测试
- 加：多 WorldRuntime 同进程隔离断言（或诚实标注"不隔离、靠 sid 唯一化"）

### B · persistable —— 同意精神、反对越界（**强烈反对改动 6 入 persistable self.md**）

**结论**：persistable 维度对本 issue 真正承诺的是两件事——
1. **flow-main 解耦语义**（隐式存在，需显式化）—— self.md 核心 2/5/7 隐含，但**真正缺失的语义**「main 推进不隐式向所有 flow 广播」从未明说。**应入 self.md**：

   > main 推进（无论经人类 PUT /stones 还是 reflectable feat-branch 合入）不向其他 flow 广播，各 flow 各自停在 fork 时刻 main HEAD；flow 自决何时（或是否）与 main 同步——通过显式 rebase / 重 hydrate，而非 main 推进的副作用。

2. **PR record schema 是否含 `authorSessionId`**——归 builtin pr class data 域，**不归 persistable 协议**（self.md 核心 4 只管"data 怎么落盘"、不管"data 里写什么字段"）。

**改动逐条点评**：

- **改动 1（归属）/ 改动 2（miss 语义）/ 改动 7（双触发分流）** → **不归 persistable 管**，由 runtime 视角裁决
- **改动 3（精准只清发起方）** → **persistable 强烈支持**，这正是 self.md 核心 2/7 的语义投影
- **改动 4（mergeFeatBranch 增 sid 参数）** → **接受语义但建议重设计**——把 invalidate hook 上移到 caller（与 runtime reviewer 一致）保 git 原语纯净
- **改动 5（PR record originSid）** → **不归 persistable 管**（pr class data 域），归 reflectable-pipeline-wiring issue
- **改动 6（lifecycle 与 invalidate 分离铁律入 persistable self.md）** → **强烈反对**——这是 runtime 维度对**对象生命周期钩子**的实现规则，**与持久层无关**；持久层从不"触发 dispatchUnactive"。**正确归属**：`## runtime` 段 + `invalidate API JSDoc`，或 `## persistable × thinkable` 交叉契约段。**不进 persistable self.md**。
- **改动 8（enqueue 覆盖）** → **支持，但理由要改**——从"git race"改为"merge → invalidate 原子可见性"
- **改动 9（测试）** → 不直接归 persistable，无意见

**新增担忧**：
- **hydrate 幂等性**（咬选项 B）：`runtime-object-io.ts:117` 重读盘 setObject 直覆盖——若旧 inst 在表里、新 inst 来自盘、简单覆盖会丢运行态字段（如 thread inbox 增量）。**改动 2 选 B 的隐含前置工作**。
- **pool 数据在 invalidate 路径中如何**：issue 全文未提 pool——「pool 是运行时事实、直写即生效」（self.md 核心 2），不进 git、与 invalidate 无关。请显式声明：`invalidateSessionByStoneIds` 只触 class & stone object，**不触 pool sediment**。
- **inline 持久化（self.md 核心 4 第三态）与 invalidate 交互**：thread 等运行态自有窗 `mode="inline"`，数据随 thread-context.json 落盘——re-hydrate 时 inline 窗如何重建？

**接口边界一问 → 关键判据**：
- 「磁盘真相 → 内存镜像同步**时机**」= persistable 协议
- 「具体怎么清、清哪个、清完触不触发钩」= runtime 实现自由

**MVP 范围调整建议**：
- MVP = 改动 2（重设计）+ 改动 4（重设计：mergeFeatBranch 不动、caller 自挂）+ **新增 flow-main 铁律入 self.md**
- 改动 5 移走、改动 6 删、改动 1/7/8 留 runtime 视角讨论

### 完整性批评官 —— 漏列 thinkable + thread 深化

**漏列受影响元素**：

1. **`## thinkable`（B 区）应列为受影响** ⚠️——scheduler 调 `getSessionRegistry(sessionId)`（`builtins/agent/children/thread/thinkable/scheduler.ts:37,71`）将 registry 传给 think()。invalidate 后 miss → 空表 → tick 既找不到 thread 又拿不到 instances，**这是 thinkable 调度的直接行为变更**。issue 自己背景说「thinkloop silent stuck」却把 thinkable 列「未受影响」——违反 design-workflow 准则。

2. **`## thread`（E 区）描述偏轻** ⚠️——`thread-runtime.ts:63` 经 `new ThreadRuntime(thread, getSessionRegistry(sid), opts)` 把 registry **冻结成 ThreadRuntime 实例字段**——invalidate 后已构造的 ThreadRuntime 仍持旧 registry 引用！**陈旧引用泄漏**风险。`dispatchActive/Unactive` 经 `this.registry.getObject(objectId)` 直查捕获时的 registry 而非最新 `sessionRegistries.get(sid)`。**改动 2 选 B 自动 re-hydrate 后，旧 ThreadRuntime 仍指向被 delete 的 stale Map entry**——需追加待裁决：invalidate 后已存在的 ThreadRuntime 实例如何处理？要么 `releaseSessionRegistry` 改不删 Map、只清内容（保身份），要么 ThreadRuntime 不冻结 registry、每次现取。

3. **`## executable`（B 区）边缘受影响**——method exec ctx 经 `ThreadRuntime.objectDataOf`（`thread-runtime.ts:73,106`）取 data——同上由 captured registry 解析。

**内部自洽问题**：
- 改动 2 选 B「不动 getSessionRegistry 签名」与「miss → 触发 hydrateSession」自相矛盾——澄清 hydrate 触发点**在 invalidate API 内**而非 getSessionRegistry 内。「miss 自动 hydrate」描述误导，**首启 stuck（worker 重启）不修，由 hydrateSession 显式调兜底**——本 issue 修 invalidate 后续 stuck。

**术语漂移**：
- `invalidateSessionByClass` 名字含 Class，但实际清的是 object 实例 entry——**改名 `invalidateSessionByStoneIds`** 与 OOC 核心区分对齐（A 区核心 1：class=定义、object=实例）
- `initiatingSid` / `originSid` / `authorSessionId` 三名一物——**统一为 `authorSessionId`**（与 `authorThreadId` 同构）
- `scheduler.ts` 物理位置错引 `core/`——**实际在 `builtins/agent/children/thread/thinkable/scheduler.ts`**

**与 reflectable-pipeline-wiring 耦合点（强约束）**：
1. **PR record schema**：本 issue 改动 5 加 `authorSessionId` ⇄ pipeline-wiring 改动 3（新建 pr-issue.ts）**先后约束明确**——pipeline-wiring 改动 3 是 schema 落地的第一刻，**必须依本 issue 改动 5 同期加 `authorSessionId`**，否则 schema migration 成本骤升
2. **mergeFinalizer 调 mergeFeatBranch**：本 issue 改动 4 ⇄ pipeline-wiring 改动 4——若改动 4 sid required，强制传，强约束保 invalidate 链路真生效；若 optional 需 lint 守护
3. **enqueue queue 边界**：本 issue 改动 8 ⇄ pipeline-wiring 改动 4 mergeFinalizer 包 enqueueSessionWrite——一致

**先后约束建议**：
- **先**：本 issue 改动 1 / 2（底层 + miss 语义修复）—— 独立于 PR 流程
- **同期**：本 issue 改动 4 + 5 与 pipeline-wiring 改动 3 + 4（schema 与 caller 同生）
- 改动 6 / 7 / 8（文档铁律）随时可落

**总评**：本 issue 揭露的两个前提错位（sessionRegistries 进程级 / miss 静默卡死）**确实存在**且确实是 runtime 协议层的事。但 issue 提议的多项改造越过 runtime/persistable 协议层边界——把「精准 sid invalidate」和「PR record originSid」当作 runtime 协议字段，实际是 reflectable PR 闸的实现细节。**裁决前建议补漏 thinkable + thread 深化 + 修术语 + 决 4 选 5**，本 issue 即可进入步骤 3 裁决。

## 裁决

（待裁决后填）

## 落地验收

（待 landed 后填）
