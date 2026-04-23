# OOC 水平扩展设计

<!--
@ref docs/哲学/genes/g07-目录即存在.md — extends — 持久化目录从本地文件系统扩展到分布式存储
@ref docs/哲学/genes/g08-effect-与-space.md — extends — Effect 路由从单机扩展到跨节点
@ref src/world/world.ts — references — 当前单机 World 实现
@ref src/world/scheduler.ts — references — 当前单机 Scheduler 实现
@ref src/world/router.ts — references — 当前单机 Router 实现
@ref src/world/registry.ts — references — 当前单机 Registry 实现
-->

## 现状分析

当前 OOC 是单机架构，所有组件运行在同一进程中：

```
┌─────────────────────────────────────────┐
│              HTTP Server                │
│                  │                      │
│              World (单例)               │
│           ┌──────┼──────┐              │
│       Registry  Router  Scheduler      │
│           │      │         │           │
│       Stone[]   talk()   Flow[]        │
│           │                │           │
│     .ooc/objects/     LLMClient(单例)  │
└─────────────────────────────────────────┘
```

瓶颈在三处：
1. **LLM 调用** — 单客户端串行请求，Scheduler 轮询时每次只跑一个 Flow
2. **文件 I/O** — 所有对象读写同一磁盘，高并发时成为瓶颈
3. **单进程** — 一个 World 实例承载所有对象，无法利用多核/多机

## 扩展架构概览

```
                    ┌──────────────┐
                    │  API Gateway │  (负载均衡)
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐ ┌───▼─────┐ ┌───▼─────┐
        │  Node A   │ │ Node B  │ │ Node C  │
        │ World实例 │ │ World实例│ │ World实例│
        │ 对象分片  │ │ 对象分片 │ │ 对象分片 │
        └─────┬─────┘ └────┬────┘ └────┬────┘
              │            │            │
        ┌─────▼────────────▼────────────▼─────┐
        │          消息总线 (Message Bus)       │
        └─────────────────┬───────────────────┘
                          │
        ┌─────────────────▼───────────────────┐
        │        共享存储层 (Object Store)      │
        └─────────────────────────────────────┘
```

核心思路：**每个节点是一个完整的 World 实例，负责一组对象的调度和执行。节点间通过消息总线通信。**

## 各层扩展策略

### 1. 存储层

**现状**：`Registry.loadAll()` 扫描本地 `.ooc/objects/` 目录，`Stone.load()` 读本地文件。

**扩展方案**：引入 `StorageBackend` 接口，替换直接的 `fs` 调用。

```typescript
/** 存储后端抽象 */
interface StorageBackend {
  listObjects(): string[];
  readFile(objectName: string, path: string): string | null;
  writeFile(objectName: string, path: string, content: string): void;
  exists(objectName: string, path: string): boolean;
}
```

- Phase 1: `LocalStorageBackend` — 包装现有 fs 调用，行为不变
- Phase 2: `S3StorageBackend` / `RedisStorageBackend` — 对象目录存储在远程

**对象分片策略**：按对象名哈希分配到节点。每个节点只加载自己负责的对象。

```
Node A: sophia, kernel     (hash % 3 == 0)
Node B: iris, nexus        (hash % 3 == 1)
Node C: user, 自定义对象    (hash % 3 == 2)
```

**与 G7 的一致性**：G7 说「目录存在，对象就存在」。在分布式场景下，这个「目录」从本地路径变成逻辑路径。StorageBackend 保证对象仍然可以通过路径访问，只是物理位置透明化了。人类仍然可以通过挂载远程存储来直接编辑对象——G7 的「人类可编辑」特性不丢失。

### 2. 调度层

**现状**：单个 `Scheduler` 轮询所有 Flow，串行执行 `runThinkLoop`。

**扩展方案**：

- **节点内并行**：Scheduler 改为并发执行多个 Flow 的 ThinkLoop（当前是 `for...of` 串行，改为 `Promise.all` 并发，受 LLM 并发数限制）
- **节点间独立**：每个节点有自己的 Scheduler，只调度本节点的 Flow

```typescript
// 当前：串行
for (const name of readyFlows) {
  await runThinkLoop(entry.flow, ...);
}

// Phase 1：节点内并发（最小改动，最大收益）
const tasks = readyFlows.map(name => runThinkLoop(...));
await Promise.allSettled(tasks);
```

这是投入产出比最高的改动——不需要分布式，只需要并发。

### 3. 路由层

**现状**：`Router.talk()` 直接调用 `world.deliverMessage()`，同进程内投递。

**扩展方案**：当目标对象不在本节点时，通过消息总线转发。

```typescript
// 扩展后的 deliverMessage
deliverMessage(target: string, message: string, from: string): void {
  if (this._registry.has(target)) {
    // 本地投递（现有逻辑）
    this._deliverLocal(target, message, from);
  } else {
    // 远程投递
    this._messageBus.publish({
      type: "deliver_message",
      target, message, from,
      sourceNode: this._nodeId,
    });
  }
}
```

**消息总线选型**：
- Phase 2: Redis Pub/Sub（简单，够用）
- Phase 3: NATS / Kafka（如果需要持久化和回放）

**与 G8 的一致性**：G8 定义了三种 Effect 方向。`talk()` 是「我→它」的消息方式。跨节点路由只是改变了投递的物理路径，语义不变——发送方仍然是 fire-and-forget，接收方仍然自主决定如何回应。主体性完全保留。

### 4. LLM 层

**现状**：单个 `OpenAICompatibleClient` 实例，所有 Flow 共享。

**扩展方案**：

```typescript
/** LLM 资源池 */
interface LLMPool {
  /** 获取一个可用的 LLM 客户端（可能阻塞等待） */
  acquire(): Promise<LLMClient>;
  /** 归还客户端 */
  release(client: LLMClient): void;
}
```

- 支持多个 API Key 轮转（绕过单 Key 的 RPM 限制）
- 支持多个 Provider 混合（OpenAI + Anthropic + 本地模型）
- 按对象优先级分配：核心对象（sophia/kernel）优先获取高质量模型

这是最容易实现的扩展点，因为 `LLMClient` 接口已经抽象好了。

### 5. API 层

**现状**：单个 Bun HTTP server 在 8080 端口。

**扩展方案**：
- 无状态 API Gateway 做负载均衡
- 请求按目标对象路由到对应节点
- SSE 连接需要粘性会话（sticky session）或通过消息总线广播

## 渐进式迁移路径

### Phase 1: 单机并发（最小改动，最大收益）

**目标**：不引入分布式复杂度，最大化单机性能。

改动点：
1. Scheduler 并发执行多个 Flow（`Promise.allSettled`）
2. LLM 连接池（多个并发请求）
3. 抽取 `StorageBackend` 接口（为 Phase 2 做准备，但实现仍是本地 fs）

预期收益：ThinkLoop 吞吐量提升 3-5x（受 LLM API 并发限制）。

**风险**：并发写同一个 Stone 的 data.json 可能冲突。需要加对象级锁。

### Phase 2: 多进程 + 消息总线

**目标**：同一台机器上运行多个 World 进程，对象分片。

改动点：
1. 对象分片（按名称哈希）
2. Redis Pub/Sub 做消息总线
3. `deliverMessage` 支持远程投递
4. Registry 只加载本分片的对象

预期收益：突破单进程内存限制，支持数百个对象。

### Phase 3: 多机部署

**目标**：World 实例分布在多台机器上。

改动点：
1. StorageBackend 切换到远程存储（S3 / NFS）
2. API Gateway 做请求路由
3. 节点发现与健康检查
4. 对象迁移（rebalance）

这个阶段只在对象数量达到数千、LLM 调用量达到每秒数十次时才需要。

## 与 OOC 哲学的一致性

| 基因 | 扩展设计如何遵守 |
|------|-----------------|
| G1 万物皆对象 | 节点本身可以建模为 OOC 对象（NodeObject），拥有 readme/data/traits |
| G7 目录即存在 | StorageBackend 保持路径语义，逻辑目录 = 物理存在 |
| G8 Effect | 跨节点 talk 只改变物理路径，语义和主体性不变 |
| G5 遗忘 | 分布式环境下遗忘更自然——节点重启时只加载活跃对象 |
| G4 ThinkLoop | ThinkLoop 完全在节点内运行，不跨节点拆分 |

关键原则：**ThinkLoop 是原子单位，不可跨节点拆分。** 一个 Flow 的所有 ThinkLoop 迭代必须在同一节点上执行。跨节点只发生在消息投递层面。

## 开放问题

1. **对象迁移**：当对象从 Node A 迁移到 Node B 时，正在执行的 Flow 怎么办？最简单的方案是等 Flow 结束再迁移。

2. **共享文件跨节点访问**：`readShared(targetName, filename)` 如果目标在另一个节点，需要远程读取。是走消息总线还是直接访问共享存储？后者更简单但引入存储层耦合。

3. **全局通讯录**：当前 `Registry.directory()` 返回所有对象列表。分布式后需要一个全局通讯录服务，或者每个节点缓存全量通讯录。

4. **Scheduler 跨节点协调**：当 A（Node 1）talk B（Node 2），B 的 Flow 由 Node 2 的 Scheduler 调度。但 A 的 Scheduler 需要知道 B 何时完成。是否需要跨节点的 Flow 状态同步？

5. **一致性模型**：OOC 的消息是 fire-and-forget，天然适合最终一致性。但 `readShared` 需要读到最新数据，可能需要更强的一致性保证。

6. **成本**：分布式带来的运维复杂度是否值得？在 LLM 调用成本远高于计算成本的当下，也许 Phase 1（单机并发）就够用很长时间。

---

> 建议：先做 Phase 1。Scheduler 并发 + LLM 连接池的改动量小（约 100 行代码），但能把吞吐量提升数倍。只有当单机资源真正成为瓶颈时，才推进 Phase 2。
