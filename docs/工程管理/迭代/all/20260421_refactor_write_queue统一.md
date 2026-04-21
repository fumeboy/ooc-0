# Write Queue 统一抽象

> 类型：refactor
> 创建日期：2026-04-21
> 完成日期：2026-04-21
> 状态：finish
> 负责人：Alan Kay

## 背景 / 问题描述

目前多个模块各自实现 per-session / per-object 的串行化写入队列：

- `kernel/src/thread/queue.ts`：ThreadsTree 用的 `WriteQueue`（per-ThreadsTree 实例）
- `kernel/src/persistence/user-inbox.ts`：模块级 `Map<sessionId, Promise<void>>` Promise 链
- `kernel/src/thread/reflect.ts`：可能有类似需求（按需）

三处实现思路一致（Promise 链 + 按 key 聚合），但没有共享基础设施。将来如再写一个"per-stone 锁"或"全局单写者"又会再复制一遍。

## 目标

1. 抽取统一的 `SerialQueue<K>` 工具类到 `kernel/src/utils/serial-queue.ts`（或复用现有 utils 目录）
2. API：`enqueue(key: K, fn: () => Promise<T>): Promise<T>`
3. 三处现有实现替换为新工具；语义保持一致（错误隔离：一个 fn 抛错不污染其他 key 的队列）
4. 新增单元测试覆盖并发、错误隔离、按 key 独立

## 方案

1. 写 `kernel/src/utils/serial-queue.ts`：
   ```ts
   export class SerialQueue<K = string> {
     private chains = new Map<K, Promise<unknown>>();
     enqueue<T>(key: K, fn: () => Promise<T>): Promise<T> { ... }
   }
   ```
2. 写测试 `kernel/tests/serial-queue.test.ts`：
   - 同一 key 串行化
   - 不同 key 并行
   - 错误隔离（一个 fn reject，其他 key 不受影响，同 key 后续 fn 继续执行）
   - 大并发压力（100 fn × 10 keys）
3. 重构使用点：
   - `kernel/src/thread/queue.ts`：基于 SerialQueue 重写（或保持 facade 不变，内部用它）
   - `kernel/src/persistence/user-inbox.ts`：替换内部 Map
   - `kernel/src/thread/reflect.ts`：如有写入队列，同样替换
4. 跑全量测试确保 0 回归

## 影响范围

- 新增 `kernel/src/utils/serial-queue.ts` + 测试
- `kernel/src/thread/queue.ts` / `kernel/src/persistence/user-inbox.ts` / `kernel/src/thread/reflect.ts` 内部替换

## 验证标准

- 单元测试覆盖并发 / 错误隔离
- 全量 `bun test` 保持 550+ pass / 0 fail

## 执行记录

### 2026-04-21

**实现**：

- 新增 `kernel/src/utils/serial-queue.ts`：通用 `SerialQueue<K>` 工具
  - API：`enqueue<T>(key: K, fn: () => Promise<T>): Promise<T>`
  - 同 key FIFO 串行；不同 key 并行；错误隔离；返回值透传
- 新增 `kernel/tests/serial-queue.test.ts`（7 tests）覆盖：
  - 同 key 串行、不同 key 并行
  - 错误隔离（同 key 前后 / 跨 key）
  - 大并发（1000 fn × 10 keys）
  - 泛型返回值保持
  - 真正的最大并发 1（非表面）
- 三处重构：
  - `kernel/src/thread/queue.ts` 的 `WriteQueue`：改为 facade，内部委托给 SerialQueue（单 key Symbol）
  - `kernel/src/persistence/user-inbox.ts`：删除私有 `_writeChains` + `_enqueueWrite`，替换为模块级 `SerialQueue<string>`（sessionId 为 key）
  - `kernel/src/thread/reflect.ts`：删除私有 `REFLECT_LOCKS` + `withReflectLock` 内部实现，改为委托 SerialQueue（stoneDir 为 key），保留原函数名兼容
- 注意时序：WriteQueue facade 改为**非 async** 直接返回 `inner.enqueue`，避免额外 await 层破坏测试里"fn 失败时外部 .catch 先执行"的微任务顺序

**测试基线**：553 pass → **560 pass**（+7 新 SerialQueue 测试），0 fail，6 skip

**影响**：
- 未来再写 per-stone / per-object / per-session 锁时直接用 SerialQueue，不再复制 Promise 链代码
- 语义已统一：错误隔离、返回值透传、GC 逻辑等用户只看一个地方
- 为迭代 #4 User Inbox read-state 持久化奠基（复用 `_userInboxQueue`）
