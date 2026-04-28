# talk(wait=true) — 同步等待

> A 发消息给 B 并**等待回复**。A 的线程进入 waiting，B 回复后 A 恢复 running。
>
> `talk_sync` 是历史名称；当前实现中不再存在独立 `talk_sync` command，使用 `talk` 的 `wait: true` 参数表达同一语义。

## 签名

```typescript
open({
  title: "请求 filesystem",
  type: "command",
  command: "talk",
  description: "读取文件并等待结果",
  args: {
    wait: true,
    context: "fork",
    target: "filesystem",
    msg: { method: "readFile", args: { path: "/..." } }
  }
})
submit({
  title: "发送并等待结果",
  form_id
})
```

也可以分步填写：

```typescript
open(title="请求 filesystem", type=command, command=talk, description="读取文件并等待结果")
refine(form_id, {
  wait: true,
  context: "fork",
  target: "filesystem",
  msg: { method: "readFile", args: { path: "/..." } }
})
submit(title="发送并等待结果", form_id)
```

## 与 talk 的区别

| 维度 | talk(wait=false) | talk(wait=true) |
|---|---|---|
| 发送后 | A 继续 | A waiting |
| 回复形式 | 作为新 inbox 消息 | 回复到达后唤醒当前线程 |
| 典型场景 | 通知、异步任务 | 函数调用、需要结果的查询 |

## 内部实现

`talk(wait=true)` 本质 = talk + wait：

```
refine(talk form, args={ target, msg, wait: true }) → submit(talk form)
  ↓
1. 消息写入对方 inbox（含 replyTo 字段）
2. 当前线程 status = waiting，waitingType = talk_sync
3. 对方回复时当前线程被唤醒
```

对方处理后：
- 如果通过 `return(summary)` 结束子线程 → summary 作为回复
- 如果通过 `talk(A, reply)` → reply 作为回复（需要协议约定）

OOC 的同步等待协议默认采用前者（对方创建子线程处理，return 即回复）。

## 返回值

对方回复会唤醒当前线程，并出现在后续 context / inbox 中：

```typescript
open(title="列出文件", command=talk, description="调用 filesystem 的 listDir", args={
  target: "filesystem",
  msg: { method: "listDir", args: { path: "/docs" } },
  context: "fork",
  wait: true
})
submit(title="列出文件", form_id)
```

这让 `talk(wait=true)` 看起来像**跨对象函数调用**。

## 错误处理

### 对方抛出错误

```typescript
try {
  // talk(wait=true)
} catch (error) {
  // 对方如果 return { error: "..." }，这里收到 error
}
```

约定：对方在失败时返回 `{ error: "..." }` 而非抛出（让调用方决定是否拒绝）。

### 对方长时间不回

当前无超时机制。A 会一直 waiting。如需超时，调用方需要用 `do(context="fork")` 创建定时器子线程。

### 对方线程 failed

A 的等待会被唤醒，并看到对方失败信息。

## 典型场景

### 1. 跨对象函数调用

```typescript
// 调用 filesystem 的 listDir
open(title="请求列目录", command=talk, description="调用 filesystem 的 listDir", args={
  target: "filesystem",
  msg: { method: "listDir", args: { path: "/docs" } },
  context: "fork",
  wait: true
})
```

### 2. 征求 Supervisor 意见

```typescript
open(title="征求 supervisor 意见", command=talk, description="询问是否需要先开 Issue", args={
  target: "supervisor",
  msg: "我准备改动 X 文件，是否需要先开 Issue？",
  context: "fork",
  wait: true
})
```

### 3. 请求审查

```typescript
open(title="请求审查", command=talk, description="请求 reviewer 审查内容", args={
  target: "reviewer",
  msg: { code: "...", context: "..." },
  context: "fork",
  wait: true
})
```

## 避免死锁

如果 A `talk(wait=true)` B，而 B 在当前任务里需要等 A 完成才能回答 → **死锁**。

防御：
- 尽量避免"循环等待"（A 等 B，B 等 A）
- 如果需要双向协作，一方用 talk（异步），另一方用 `talk(wait=true)`

调度器的死锁检测会兜底强制唤醒，但设计上应避免。

## 源码锚点

| 概念 | 实现 |
|---|---|
| `talk(wait=true)` 处理 | `kernel/src/thread/engine.ts` |
| wait + 消息路由 | `kernel/src/thread/collaboration.ts` |
| 协议约定 | `kernel/traits/talkable/cross_object/TRAIT.md` |

## 与基因的关联

- **G8**（Effect 与 Space）— `talk(wait=true)` 把异步 Effect 包装成同步等待
- **G6**（关系即网络）— 协作的典型用法
