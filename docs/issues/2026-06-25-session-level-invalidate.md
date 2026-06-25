---
title: session-level invalidate 设计（含 hot-reload + PR merge 双触发统一 + getSessionRegistry miss 语义）
status: draft
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

（待 fan-out）

## 裁决

（待裁决后填）

## 落地验收

（待 landed 后填）
