# talk — 异步对话

> A 发消息给 B，A 不等。对方处理完会在**以后**把结果以新消息形式发回（可能在本次任务内，也可能在另一个 Session）。

## 签名

```typescript
open(type=command, command=talk)
submit(form_id, {
  target: "bruce",
  message: "..."
})
// → { sent: true }
```

## 生命周期

```
A.thread: submit(talk, { target=B, message=... })
  ↓
消息写入 flows/{sid}/objects/B/threads/{b_tid}/thread.json 的 inbox
  ↓
A.thread 继续（不等）
  ↓
B 的 ScheduleLoop 某 tick 检测到 inbox 新消息
  ↓
B.thread 处理消息
  ↓
B.thread 如果决定回复 A：
  submit(talk, { target=A, message="回复" })
  或
  submit(return, summary)  // 如果 B 是子线程
```

## 目标解析

`target` 可以是：

| 格式 | 含义 |
|---|---|
| `"bruce"` | 对象名 → 找 Session 中该对象的 Flow，或自动创建 |
| `"super"` | 自己的 SuperFlow（特殊名字，由 `world.ts` 的 onTalk 特判路由到 `stones/{fromObject}/super/`） |
| `"supervisor"` | Session 的 Supervisor |

**注意**：target 是**对象名**，不是 thread_id。跨对象 talk 的"选择哪个 thread 接收"由 Engine 决定（通常是对方的根线程，或最近交互过的线程）。

## message 格式

`message` 通常是字符串：

```typescript
submit(form_id, { target, message: "你好，能帮我查一下 X 吗？" })
```

也可以是结构化对象（用于跨对象方法调用）：

```typescript
submit(form_id, {
  target: "filesystem",
  message: { method: "readFile", args: { path: "..." } }
})
```

这种结构化消息通过 `kernel/talkable/cross_object` 子 trait 的协议约定识别。

## 目标 thread 的选择

当 A talk 给 B 时，消息投递到 B 的哪个 thread？

### 如果 A 在 B 的某 thread 发起过对话

```
A.thread_1 previously talked with B.thread_X
  → 新消息进入 B.thread_X 的 inbox
  → B.thread_X 如果是 done，会自动复活
```

这是**线程作为"话题通道"**的体现——同一个话题的所有交互都在同一棵线程。

### 如果是首次 talk

- 如果 B 的 Flow 不存在 → 自动创建 + 创建根线程
- B 的根线程接收消息

## 消息携带发送方信息

每条 inbox 消息都含：

```json
{
  "id": "msg-uuid",
  "from": "A",
  "fromThread": "A.thread_1",
  "content": "...",
  "ts": "...",
  "marked": null,
  "remoteThreadId": null  // talk_sync 的回复才有
}
```

`from` 让 B 知道"这消息来自谁"，可以用于路由、权限判断。

## 错误场景

### 目标对象不存在

```
submit(form_id, { target: "nonexistent", message: "..." })
→ error: 对象 "nonexistent" 不存在
```

Engine 检查对象是否存在（通过 world.registry）。

### 目标对象无接收能力

OOC 里所有对象都能接收消息（inbox 是线程级的标配）。所以此错误场景不会出现。

## talk 与线程复活

如果 A talk 给 B，而 B.thread 目前是 `done`：

```
A.thread submit(talk, { target: B, ... })
  ↓
消息写入 B.thread.inbox
  ↓
系统检测 B.thread 是 done + inbox 有 unread
  ↓
B.thread 复活：done → running，revivalCount += 1
```

详见 [../../认知/线程树/线程复活.md](../../认知/线程树/线程复活.md)。

## 源码锚点

| 概念 | 实现 |
|---|---|
| talk 处理 | `kernel/src/thread/engine.ts` |
| 跨对象投递 | `kernel/src/thread/collaboration.ts` |
| 消息结构 | `kernel/src/types/thread.ts` → InboxMessage |
| 目标 thread 路由 | `kernel/src/thread/collaboration.ts` |

## 与基因的关联

- **G8**（Effect 与 Space）— talk 是最典型的 Effect
- **G6**（关系即网络）— talk 让社交网络"活跃"
