# 消息 — 对象间一对一通信

> G8：消息是对象间通信的机制。消息是一种特殊的 Effect。

## 六个文档

| 文档 | 内容 |
|---|---|
| [talk.md](talk.md) | 异步对话：发送不等待 |
| [talk-sync.md](talk-sync.md) | 同步对话：发送等回复 |
| [return.md](return.md) | 完成当前线程，返回父线程 |
| [inbox.md](inbox.md) | 消息收件箱机制 |
| [跨对象协作.md](跨对象协作.md) | Session + 线程树联动 |

## 三个通信原语

```
talk(target, message)           ← 异步：A → B，A 不等
talk_sync(target, message)      ← 同步：A → B，A 等回复
return(summary)                 ← 结束线程，返回父/发起方
```

这三个动作覆盖了几乎所有对象间交互模式。

## inbox — 消息接收端

每个线程有自己的 inbox：

- 其他对象 talk 发来的消息
- 子线程 return 的结果（作为父线程的 inbox 消息）
- 系统通知

inbox 的消息可以是 `unread`（`marked=null`）或已标记（`ack`/`ignore`/`todo`）。

详见 [inbox.md](inbox.md)。

## 为什么 inbox 归合作而非认知

**实现层面**：inbox 字段在线程数据中，Context 构建时会读取。这让它看起来像"认知"的一部分。

**本质层面**：inbox 是**消息的接收端**——它是合作的一部分，和 talk（发送端）天然对应。

类比：电话"听筒"是通信设备，即使你的大脑通过听筒"感知"对方的话，听筒本身属于通信系统而非大脑。

## 消息的 G10：不可变

消息一旦发出：
- 不能撤回（对方 inbox 已收到）
- 不能改写（历史记录不可变）
- 只能通过发新消息"更正"

这与 Effect 的不可变性一致。

## 源码锚点

| 概念 | 实现 |
|---|---|
| talk / return 处理 | `kernel/src/thread/engine.ts` |
| 跨 Session 投递 | `kernel/src/thread/collaboration.ts` |
| inbox 管理 | `kernel/src/thread/tree.ts` / `inbox.ts` |
| ooc:// 前端拦截 | `kernel/web/src/components/MarkdownContent.tsx` |

## 与基因的关联

- **G8**（Effect 与 Space）— 消息是 Effect 的核心形式
- **G6**（关系即网络）— 消息让关系可用
