# wait — 等待外部消息或事件

> 让当前线程进入 `waiting` 状态，释放调度权。当特定条件满足时自动唤醒。

## 签名

```typescript
wait({
  reason: "等待用户补充需求"
})
```

`wait` 只表示显式等待外部输入或事件。等待自己派生的子线程，请在派生时使用 `think(..., wait=true)`；等待其他对象回复，请使用 `talk(..., wait=true)`。

## 等待外部消息

```typescript
wait({ reason: "等待用户确认方案" })
```

任意新 inbox 消息到达时，线程会被唤醒。

## 状态转换

```
running
  → wait({ reason })
  → status = waiting
  → waitingType = explicit_wait
  → 释放调度权

... 等待 ...

  → inbox 收到新消息
  → status = waiting → running
  → 下一轮 ThinkLoop 继续
```

## 为什么要显式 wait

其他 Agent 系统可能"自动等待"——遇到异步操作自动 suspend。OOC 让 wait **显式**是因为：

1. **明确性**：LLM 知道"我在等什么"，可以在注释或 thought 中说明
2. **可选择性**：LLM 可以决定"先不等，先做别的"——例如先 set_plan，再 wait
3. **调度公平**：显式 wait 让 scheduler 能立即切换到其他线程

## 死锁检测

如果所有线程都 waiting 且没有任何条件能满足，出现死锁：

```
线程 A 等待子线程 B
线程 B 等待子线程 C
线程 C 等待子线程 A  ← 循环依赖
```

ThreadScheduler 检测到全部 waiting 且无外部事件时，**强制唤醒**最靠前的线程并注入 `deadlock_notice`。

详见 [../../合作/基础/线程树调度.md](../../合作/基础/线程树调度.md)。

## talk(wait=true) 隐式 wait

旧的 `talk_sync` 已折叠为 `talk(..., wait=true)`：

```typescript
open({
  title: "请求 filesystem",
  type: "command",
  command: "talk",
  description: "需要对方回复后继续",
  args: { target: "filesystem", msg: {...}, context: "fork", wait: true }
})
submit({ title: "发送并等待回复", form_id })
```

engine 会把当前线程置为 `waitingType=talk_sync`，收到对方回复后自动唤醒。

## 典型用法

### 并行子线程后汇总

```typescript
open(title="搜索相关资料", type="command", command="think", description="开子线程搜索资料")
refine(title="填写搜索任务", form_id, args={
  context: "fork",
  wait: true,
  msg: "搜索与 X 相关的资料并 return 摘要"
})
submit(title="搜索并等待结果", form_id)
// 子线程 done 后，return summary 会进入父线程 inbox 并唤醒父线程
```

### 接受异步消息

```typescript
// 发消息等对方处理
open(title="请求 reviewer 审查", type="command", command="talk", description="请求 reviewer 回复")
refine(title="填写审查请求", form_id, args={ target: "reviewer", context: "fork", wait: true, msg: "please review PR #123" })
submit(title="发送并等待 reviewer", form_id)
// reviewer 回复进入 inbox，wait 唤醒
```

## 超时处理

当前实现**没有 wait 超时**——线程会一直 waiting 直到条件满足。

如果需要超时，需要：
1. 配合 `think(context="fork")` 创建一个"定时器子线程"，到点 return
2. 主线程 wait 主任务 和 定时器子线程 其中任一完成（需要 wait_any 语义，目前未直接支持）

目前内置的子线程等待是 `think(wait=true)` 的单子线程等待语义。多个子线程的汇总建议由父线程在收到各子线程 return summary 后继续判断；如需 wait_any，用户自己通过 inbox + 轮询实现。

## 源码锚点

| 概念 | 实现 |
|---|---|
| wait tool 定义 | `kernel/src/executable/tools/wait.ts` |
| handleWait | `kernel/src/thinkable/engine/engine.ts` |
| 唤醒检查 | `kernel/src/thinkable/engine/scheduler.ts` → `checkAndWake()` |
| 死锁检测 | 同文件 |
