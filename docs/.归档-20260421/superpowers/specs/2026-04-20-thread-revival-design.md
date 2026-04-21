# Thread Revival — 已完成线程的消息驱动复活

> 日期：2026-04-20
> 状态：设计完成
> 关联：线程树架构 `kernel/src/thread/`

## 1. 动机

当前线程 return 后状态变为 done，成为不可变的历史记录。但在实际场景中，一个已完成的线程可能需要被重新激活：

- 用户对已完成任务追加新要求
- 其他对象 talk 到一个已完成的处理线程
- Issue 讨论中 @一个已有 issue thread 的对象
- `continue_sub_thread` 向已完成子线程追加消息

核心思想：**线程不是一次性执行单元，而是可反复唤醒的认知通道**。完成后信息退场（G5），但通道保留，新消息可以重新激活它。

## 2. 设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| 触发来源 | 任何 inbox 消息 | 统一语义：给 done 线程发消息 = 要求它继续工作 |
| 状态模型 | done → running | 不新增状态，复用现有状态机 |
| Context 提示 | 注入 `<revival_notice>` | LLM 需要知道自己曾完成过，现在被要求继续 |
| 父线程影响 | 无 | 复活是独立的，不改变父线程的 awaitingChildren |
| 实现位置 | writeInbox 内置唤醒 + 回调 | 集中式，所有 inbox 来源自动生效 |

## 3. 数据模型变更

### 3.1 ThreadsTreeNodeMeta 新增字段

```typescript
/** 复活次数（每次从 done → running 时 +1） */
revivalCount?: number;
```

### 3.2 ThreadStatus / ThreadDataFile

不变。actions 历史完整保留，inbox 消息正常追加。

### 3.3 ThreadsTree 新增回调

```typescript
/** 线程复活回调（writeInbox 触发 done → running 时调用） */
private _onRevival?: (nodeId: string) => void;

/** 注入复活回调 */
setRevivalCallback(cb: (nodeId: string) => void): void;
```

## 4. writeInbox 唤醒逻辑

在 `tree.ts` 的 `writeInbox` 方法末尾，写入消息后检查目标线程状态：

```
if node.status === "done":
  1. node.status = "running"
  2. node.revivalCount += 1
  3. node.updatedAt = now
  4. flush threads.json
  5. 调用 _onRevival(nodeId)
```

writeInbox 保持同步方法。状态变更是原子的（先改内存再 flush）。

## 5. Scheduler 集成

Engine 初始化时注入回调：

```typescript
tree.setRevivalCallback((nodeId) => {
  scheduler.onThreadCreated(nodeId, objectName);
});
```

`scheduler.onThreadCreated` 已能处理"运行时动态出现的 running 线程"，复活线程直接复用此路径。

## 6. Context 注入

`context-builder.ts` 构建 Context 时，检查 `revivalCount > 0`：

```xml
<revival_notice>
你之前已经完成过此线程（第 N 次复活）。
你的上一次完成摘要：「...」。
现在你的 inbox 中有新消息需要处理。请阅读新消息并继续工作。
</revival_notice>
```

注入位置：parentExpectation 区域之后。

## 7. continue_sub_thread 简化

engine.ts 中已有的 `continue_sub_thread` 唤醒逻辑（手动 setNodeStatus + onThreadCreated）可以移除，因为 writeInbox 内部已自动处理。`continue_sub_thread` 只需调用 `writeInbox`。

## 8. 影响范围

| 文件 | 变更 |
|------|------|
| `kernel/src/thread/types.ts` | `ThreadsTreeNodeMeta` 新增 `revivalCount` 字段 |
| `kernel/src/thread/tree.ts` | writeInbox 唤醒逻辑 + setRevivalCallback |
| `kernel/src/thread/context-builder.ts` | revival_notice 注入 |
| `kernel/src/thread/engine.ts` | 注入 revivalCallback + 简化 continue_sub_thread |
| `kernel/tests/thread/` | 新增复活相关测试 |

## 9. 边界情况

- **failed 线程**：不复活。failed 表示异常终止，需要人工介入。
- **多条消息同时到达**：第一条触发复活，后续消息正常追加到 inbox（线程已 running）。
- **迭代上限**：复活后的线程共享原有的迭代计数（Scheduler tracker 中 iterations 累积），防止无限复活绕过上限。
- **summary 保留**：复活不清除 summary，作为历史记录保留在 meta 中。再次 return 时 summary 被覆盖。
