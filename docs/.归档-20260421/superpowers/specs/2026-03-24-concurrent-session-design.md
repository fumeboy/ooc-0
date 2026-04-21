# 并发 Session 支持设计

> 修复 Bruce 体验测试发现的 CRITICAL #1（talk API null 错误）和 CRITICAL #2（孤儿 session）。
> 根因：`World` 类用单例 `this._session` 管理运行时状态，`notifySupervisor` 的 fire-and-forget 模式导致并发 session 互相覆盖。

<!--
@ref kernel/src/world/world.ts — fixes — session 竞态条件
@ref kernel/src/world/router.ts — fixes — Routable 接口扩展
@ref docs/哲学文档/gene.md#G8 — references — 对象协作消息机制
-->

---

## 1. 问题分析

### 时序还原

```
1. 用户 POST /api/talk/objectX
2. await world.talk("objectX", msg, "human")
   → this._session = new Session(A)    // session A
   → scheduler.run()                        // 运行中...
   → this._session = null                   // 清理
3. notifySupervisor(world, "objectX", msg, flowId)  // fire-and-forget, 不 await
   → world.talk("supervisor", notification, "human")
   → this._session = new Session(B)    // session B 开始
4. 用户快速发送第二条消息 POST /api/talk/objectY
   → await world.talk("objectY", msg, "human")
   → this._session = new Session(C)    // 覆盖 session B !!!
5. session B 的 deliverMessage 访问 this._session → 拿到 session C → 错乱
   或 session B 完成后 this._session = null → session C 的 allFlows() 崩溃
```

### 根因

`World` 类用 4 个实例字段管理运行时状态，同一时间只能有一个 session：
- `this._session: Session | null`
- `this._scheduler: Scheduler | null`
- `this._roundCounter: SharedRoundCounter | null`
- `this._traitsCache: Map<string, LoadedTrait[]>`

`notifySupervisor` 的 fire-and-forget 模式（不 await）使得多个 `world.talk()` 可以并发执行，互相覆盖这些字段。

---

## 2. 设计方案

### 核心思路

将 session 相关的 4 个字段打包为 `SessionContext`，用 `Map<string, SessionContext>` 替代单例，支持多个 session 并发。

### 数据结构

```typescript
/** 一次 talk 调用的完整运行时上下文 */
interface SessionContext {
  session: Session;
  scheduler: Scheduler;
  roundCounter: SharedRoundCounter;
  traitsCache: Map<string, LoadedTrait[]>;
}
```

### 字段变更（world.ts）

```
// 删除
- private _session: Session | null = null;
- private _scheduler: Scheduler | null = null;
- private _roundCounter: SharedRoundCounter | null = null;
- private _traitsCache: Map<string, LoadedTrait[]> = new Map();

// 新增
+ private _activeSessions: Map<string, SessionContext> = new Map();
```

### Routable 接口变更（router.ts）

`deliverMessage` 和 `deliverFromSelfMeta` 需要知道自己属于哪个 session。通过闭包解决，不改接口签名：

```typescript
// router.ts — createCollaborationAPI 新增 sessionId 参数
export function createCollaborationAPI(
  world: Routable,
  currentObjectName: string,
  currentObjectDir: string,
  roundCounter?: SharedRoundCounter,
  currentFlowTaskId?: string,
+ sessionId?: string,          // 新增：所属 session 的 ID
): CollaborationAPI { ... }
```

`talk()` 闭包内调用 `world.deliverMessage` 时传入 `sessionId`：
```typescript
world.deliverMessage(target, message, currentObjectName, replyTo, sessionId);
```

### Routable 接口扩展

```typescript
export interface Routable {
  deliverMessage: (
    targetName: string,
    message: string,
    from: string,
    replyTo?: string,
+   sessionId?: string,        // 新增
  ) => void;

  getObjectDir: (name: string) => string | null;

  deliverToSelfMeta: (stoneName: string, message: string, fromTaskId: string) => string;

  deliverFromSelfMeta: (
    stoneName: string,
    targetTaskId: string,
    message: string,
+   sessionId?: string,        // 新增
  ) => string;
}
```

### deliverMessage 改造

```typescript
deliverMessage(targetName: string, message: string, from: string, replyTo?: string, sessionId?: string): void {
  // 通过 sessionId 定位 session，而非 this._session
  const ctx = sessionId ? this._activeSessions.get(sessionId) : null;
  const session = ctx?.session ?? null;

  if (targetName === "human" || targetName === "user") {
    if (!session) return;
    // ... 其余逻辑不变
  }

  if (!session) {
    throw new Error("[World] 没有活跃的 Session");
  }
  // ... 其余逻辑不变，用 session 替代 this._session
  // scheduler 也从 ctx 获取
}
```

### 三个主方法改造模式

`_createAndRunFlow`、`_resumeAndRunFlow`、`_resumePausedFlow` 都遵循相同模式：

```typescript
private async _createAndRunFlow(...): Promise<Flow> {
  // ... 创建 flow ...

  // 创建 SessionContext
  const session = new Session(mainFlow.sessionId, mainFlow.sessionDir);
  const roundCounter = createSharedRoundCounter();
  const traitsCache = new Map<string, LoadedTrait[]>();
  const sessionId = mainFlow.sessionId;

  // 注册到 activeSessions
  const ctx: SessionContext = { session, scheduler: null!, roundCounter, traitsCache };
  this._activeSessions.set(sessionId, ctx);

  try {
    // ... 注册 flow、加载 traits、创建 scheduler ...
    ctx.scheduler = scheduler;

    // 运行
    const updatedData = await scheduler.run(objectName);

    // 同步数据
    for (const { stoneName } of session.allFlows()) {
      const s = this._registry.get(stoneName);
      if (s) s.save();
    }
    // ...
  } finally {
    // 清理：从 Map 中移除
    this._activeSessions.delete(sessionId);
  }

  return ...;
}
```

### 内部方法改造

`_loadExistingSubFlows` 和 `_ensureReflectFlow` 改为接收 `session` 参数：

```typescript
// 之前
private _loadExistingSubFlows(sessionDir: string, excludeName?: string): void {
  // ... this._session?.hasFlow(...)
}

// 之后
private _loadExistingSubFlows(session: Session, sessionDir: string, excludeName?: string): void {
  // ... session.hasFlow(...)
}
```

同理 `_ensureReflectFlow`：
```typescript
private _ensureReflectFlow(stone: Stone, session: Session): Flow {
  // ... session.hasFlow(...) / session.register(...)
}
```

---

## 3. 改动文件清单

| 文件 | 改动 |
|------|------|
| `kernel/src/world/world.ts` | 4 个单例字段 → `_activeSessions` Map；三个主方法改造；`deliverMessage`/`deliverFromSelfMeta` 加 sessionId；`_loadExistingSubFlows`/`_ensureReflectFlow` 加 session 参数 |
| `kernel/src/world/router.ts` | `Routable` 接口加 sessionId；`createCollaborationAPI` 加 sessionId 参数并闭包传递 |

**不改的文件**：
- `kernel/src/server/server.ts` — notifySupervisor 的 fire-and-forget 模式不再有问题
- `kernel/src/flow/flow.ts` — Flow 类不变
- `kernel/src/scheduler/` — Scheduler 类不变
- `kernel/tests/` — 现有测试可能需要适配（如果直接访问了 `_session`）

---

## 4. 验证计划

1. `bun test` — 确保现有测试全部通过
2. 启动服务器，重复 Bruce 的测试场景：
   - 快速连续发送两条消息
   - 向非 supervisor 对象发消息（触发 notifySupervisor）
   - 检查是否还有 null 错误或孤儿 session
3. 验证跨对象协作链仍然正常（supervisor → sophia → supervisor → user）
