## G8: Effect 与 Space —— 对象如何影响世界

<!--
@referenced-by kernel/src/world/router.ts — implemented-by — talk/readShared/writeShared
@referenced-by kernel/src/world/scheduler.ts — implemented-by — 多 Flow 调度与错误传播
@referenced-by kernel/src/flow/flow.ts — implemented-by — deliverMessage 异步消息投递
@referenced-by kernel/src/flow/thinkloop.ts — implemented-by — 协作 API 注入
@referenced-by kernel/src/types/flow.ts — implemented-by — PendingMessage
@referenced-by kernel/src/executable/effects.ts — referenced-by — Effect 概念
@referenced-by kernel/src/world/session.ts — referenced-by — sub-flow 机制
@referenced-by kernel/web/src/features/EffectsTab.tsx — rendered-by
@referenced-by docs/设计/async-messaging.md — extended-by
-->

OOC 中一切变化都是**影响（Effect）**。
Effect 有三种方向，它们共同定义了对象与世界的关系：

### 三种 Effect

**我→我（Self-Modification）**

对象的 Flow 在自己的持久化目录中行动，修改自己的 traits/、data.json。
产生影响的是我，受到影响的也是我。这就是**元编程**——对象改变自身。

**它→我（Receiving Influence）**

其他对象如何影响我。按主体性保留程度从高到低：

| 方式 | 机制 | 主体性 |
|------|------|--------|
| 消息（talk） | 信息写入我的 messages | 完全保有——我决定如何回应 |
| 公开方法调用 | 触发我设计的接口 | 预先行使——我定义了接口行为 |
| 共享环境变化 | 我感知到 shared/ 中的文件变化 | 感知保有——我决定如何解读 |

**我→它（Exerting Influence）**

我如何影响其他对象。三种方式：
1. **消息**：talk(target, message) — 最尊重对方主体性
2. **方法调用**：target.method(args) — 使用对方预定义的接口
3. **共享文件**：写入 shared/ 目录 — 间接影响

### Effects 目录

每个任务的 Flow 在 `effects/{task_id}/` 下拥有一个 `shared/` 目录，
作为该任务范围内的共享文件区。只有 main flow 拥有 shared/，sub-flow 复用它。

---

