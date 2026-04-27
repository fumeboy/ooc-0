# wait — 等待子线程或消息

> 让当前线程进入 `waiting` 状态，释放调度权。当特定条件满足时自动唤醒。

## 签名

```typescript
wait({
  reason: "等待用户补充需求"
})
```

`wait` 现在只表示显式等待外部输入或事件。等待子线程请使用 `await` / `await_all`，或者在派生子线程时使用 `think(..., wait=true)`。

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
线程 A 在 wait 子线程 B
线程 B 在 wait 子线程 C
线程 C 在 wait 子线程 A  ← 循环依赖
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
open(title="等待搜索完成", command=await_all, description="等待三个搜索子线程完成", args={ thread_ids: [t1, t2, t3] })
submit({ title: "等待搜索完成", form_id })
// 三个子线程都 done，结果在各自的 return summary 里
```

### 接受异步消息

```typescript
// 发消息等对方处理
await talk("reviewer", { review: "please review PR #123" })
await wait({ reason: "等待 reviewer 回复" })
// reviewer 回复进入 inbox，wait 唤醒
```

## 超时处理

当前实现**没有 wait 超时**——线程会一直 waiting 直到条件满足。

如果需要超时，需要：
1. 配合 `think(context="fork")` 创建一个"定时器子线程"，到点 return
2. 主线程 wait 主任务 和 定时器子线程 其中任一完成（需要 wait_any 语义，目前未直接支持）

目前子线程等待只支持 `await_all` 语义（全部完成才唤醒）。如需 wait_any，用户自己通过 inbox + 轮询实现。

## 源码锚点

| 概念 | 实现 |
|---|---|
| wait tool 定义 | `kernel/src/thread/tools/wait.ts` |
| handleWait | `kernel/src/thread/engine.ts` |
| 唤醒检查 | `kernel/src/thread/scheduler.ts` → `checkAndWake()` |
| 死锁检测 | 同文件 |
