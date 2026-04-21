# inbox — 消息收件箱

> 每个线程都有自己的 inbox，是消息的接收端。

## 数据结构

```typescript
interface InboxMessage {
  id: string;                    // 消息唯一 ID（UUID）
  from: string;                  // 发送方对象名
  fromThread?: string;           // 发送方的 thread_id
  content: string | object;      // 消息内容
  ts: string;                    // 时间戳
  marked: "ack" | "ignore" | "todo" | null;  // 标记状态
  remoteThreadId?: string;       // talk_sync 回复用
}
```

存储在 `thread.json.inbox` 数组。

## 消息的三种来源

| 来源 | 示例 |
|---|---|
| **talk / talk_sync** | 其他对象发来的消息 |
| **system** | 系统通知（如线程错误、Session 事件） |
| **thread_error** | 其他线程的失败通知（如果设置了监听） |

## 消息状态

```
marked: null      ← 未读（new）
marked: "ack"     ← 已确认
marked: "ignore"  ← 忽略
marked: "todo"    ← 待办
```

## 如何标记

通过任意 tool call 的 `mark` 参数：

```typescript
submit(form_id, {
  ...args,
  mark: { id: "msg-123", action: "ack" }
})
```

详见 [../../认知/指令系统/mark.md](../../认知/指令系统/mark.md)。

## Context 中 inbox 展示

Context 构建时，inbox 被展示如下：

```
未读消息（3 条）：
  - msg-100 [new] from user: "..."
  - msg-101 [new] from bruce: "..."
  - msg-102 [new] from system: "..."

已处理消息（保留供上下文）：
  - msg-099 [ack] from supervisor: "..."
  - msg-098 [ignore] from system: "..."
```

**关键**：已标记消息**不被过滤**，仍在 Context 中可见。只是加了标签，让 LLM 区分新 vs 已处理。

## 溢出保护

如果 unread 消息数量超过阈值（默认 20）：
- 最早的 unread 被系统自动 mark 为 `ignore`
- 对象的"注意力"不会被无限堆积的消息淹没

这是防御式机制——对象应该主动标记，但万一没及时标记，系统兜底。

## 线程复活触发

每次有新消息**写入** inbox，系统检查该线程状态：
- 如果是 `done` → 复活为 `running`（revivalCount++）
- 如果是 `waiting` → 唤醒为 `running`（下一 tick）
- 如果是 `running` → 不变（消息会在下一轮 Context 中被看到）

详见 [../../认知/线程树/线程复活.md](../../认知/线程树/线程复活.md)。

## inbox 是线程级的

每个线程有独立的 inbox——不是对象级，不是 Flow 级。这意味着：

- 同一个对象的不同线程，inbox 完全独立
- A 对象有 thread_1 和 thread_2，B 的 talk 要路由到具体的某个 thread
- 路由规则：优先回到"之前对话过的 thread"，否则根线程（详见 [talk.md](talk.md)）

## inbox 的并发安全

跨对象写 inbox 可能并发。通过：

- `session.serializedWrite(path, fn)` 保证单文件串行写
- 同一 thread 的 inbox 写入串行化

保证 append 操作不会丢失。

## 源码锚点

| 概念 | 实现 |
|---|---|
| inbox 数据类型 | `kernel/src/types/thread.ts` → InboxMessage |
| inbox 读写 | `kernel/src/thread/inbox.ts` |
| 消息投递 | `kernel/src/thread/collaboration.ts` |
| Context 展示 | `kernel/src/thread/context-builder.ts` → buildInbox |
| 复活检测 | `kernel/src/thread/tree.ts` |

## 与基因的关联

- **G8**（Effect 与 Space）— inbox 是消息 Effect 的接收端
- **G5**（Context 即世界）— inbox 是 Context 的重要组成
- **G13**（线程树即运行模型）— inbox 是线程的字段
