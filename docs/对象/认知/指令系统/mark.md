# mark — 标记 inbox 消息

> 任意 tool call 都可以附带 `mark` 参数，同时处理一条 inbox 消息。

## 为什么是附加参数而非独立指令

如果"标记消息"是一个独立指令（如 `mark_inbox`），LLM 每处理一条消息都要：

```
open(title="标记消息", command=mark_inbox, description="标记 inbox 消息") → submit → 处理完这条消息
open(title="执行查询", command=program, description="真正要做的事") → submit → 真正要做的事
```

每处理一条消息多两轮 tool call，浪费 token。

**解法**：把 mark 做成**任意 tool call 的附加参数**——一次 tool call 既处理当前动作，也顺带标记消息。

## 签名

```typescript
// 在任何 tool 上附加
open({
  title: "查询 X",
  type: "command",
  command: "program",
  description: "...",
  mark: [
    { messageId: "msg-123", type: "ack", tip: "已处理" }
  ]
})

submit({
  form_id: "f_001",
  title: "执行查询",
  mark: [
    { messageId: "msg-123", type: "ack", tip: "已处理" },
    { messageId: "msg-456", type: "ignore", tip: "与当前任务无关" }
  ]
})
```

## 三种 type

| type | 含义 | 效果 |
|---|---|---|
| `ack` | 已确认（常规处理） | 消息 marked=ack，减少下一轮 inbox 干扰 |
| `ignore` | 忽略 | 消息 marked=ignore，前端会淡化 |
| `todo` | 待办 | 消息 marked=todo，降低优先级但保留显眼 |

**注意**：mark 不删除消息。消息保留在 thread.inbox 数组里，可追溯。

## Context 中 inbox 不过滤 marked

一个重要设计：**inbox 展示时不过滤 marked 消息**——即使 ack 过的消息，下一轮 Context 中仍可见。

理由：
- 上下文完整性（LLM 知道"我之前看过这条，但已 ack"）
- 避免信息丢失

但 marked 消息会在展示时**加标签**，让 LLM 区分新 vs 已处理：

```
Inbox:
  - [new] msg-789: 用户发了新问题
  - [ack] msg-123: 之前的系统通知
  - [todo] msg-456: 待办提醒
```

## 溢出处理

如果 inbox unread 数量超过上限（如 20 条），系统**自动** mark(ignore) 最早的 unread 消息——保证 Context 不爆。

这是"软溢出"保护，对象应该尽量及时 mark 重要消息，避免被系统自动 ignore。

## 典型用法

### 场景 1：对话中回复用户问题

```
Inbox 有：
  - [new] msg-100: 用户问 "X 是什么？"

LLM:
  open(type=command, command=program, title="查询 X", description="查询 X 的定义",
       mark=[{messageId: "msg-100", type: "ack", tip: "已理解问题"}])
  // 同时确认已看到消息，并开启 program 来查询
```

### 场景 2：一次处理多条消息

```
Inbox 有：
  - [new] msg-100: 问题 A
  - [new] msg-101: 问题 B（相关）
  - [new] msg-102: 系统通知（无关）

LLM:
  submit({
    title: "提交回复",
    form_id,
    mark: [
      {messageId: "msg-100", type: "ack", tip: "已回答"},
      {messageId: "msg-101", type: "ack", tip: "已回答"},
      {messageId: "msg-102", type: "ignore", tip: "无关通知"}
    ]
  })
```

一次搞定三条消息的标记 + 一次回复。

## 不标记的情况

如果 LLM 没标记，消息保持 `marked: null` 状态，下一轮仍以 `[new]` 出现在 inbox。这让对象"未读"状态显眼——没处理的消息不会被遗忘。

## 源码锚点

| 概念 | 实现 |
|---|---|
| mark 参数定义 | `kernel/src/thread/tools/schema.ts` (每个 tool 复用) |
| mark 处理 | `kernel/src/thread/engine.ts` → `extractMarks` |
| markInbox | `kernel/src/thread/tree.ts` / `inbox.ts` |

## 与基因的关联

- **G5**（Context 即世界）— mark 是 Context 管理的重要工具
- **G8**（消息 / Effect）— inbox 标记是消息生命周期的一部分
