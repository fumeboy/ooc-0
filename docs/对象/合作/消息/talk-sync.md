# talk_sync — 同步对话

> A 发消息给 B 并**等待回复**。A 的线程进入 waiting，B 回复后 A 恢复 running。

## 签名

```typescript
open(type=command, command=talk_sync)
submit(form_id, {
  target: "filesystem",
  message: { method: "readFile", args: { path: "/..." } }
})
// → 对方的回复（作为 submit 的返回值）
```

## 与 talk 的区别

| 维度 | talk | talk_sync |
|---|---|---|
| 发送后 | A 继续 | A waiting |
| 回复形式 | 作为新 inbox 消息 | 作为 submit 返回值 |
| 典型场景 | 通知、异步任务 | 函数调用、需要结果的查询 |

## 内部实现

talk_sync 本质 = talk + wait：

```
submit(talk_sync, { target, message })
  ↓
1. 消息写入对方 inbox（含 replyTo 字段）
2. 当前线程 status = waiting
3. 返回 Promise（在对方回复时 resolve）
```

对方处理后：
- 如果通过 `return(summary)` 结束子线程 → summary 作为回复
- 如果通过 `talk(A, reply)` → reply 作为回复（需要协议约定）

OOC 的 talk_sync 协议默认采用前者（对方创建子线程处理，return 即回复）。

## 返回值

talk_sync 的 submit 返回**对方的 return summary**：

```typescript
const result = await talk_sync({
  form_id,
  target: "filesystem",
  message: { method: "listDir", args: { path: "/docs" } }
});
// result = { files: ["a.md", "b.md", ...] }  （对方 return 的内容）
```

这让 talk_sync 看起来像**跨对象函数调用**。

## 错误处理

### 对方抛出错误

```typescript
try {
  const result = await talk_sync(...);
} catch (error) {
  // 对方如果 return { error: "..." }，这里收到 error
}
```

约定：对方在失败时返回 `{ error: "..." }` 而非抛出（让调用方决定是否拒绝）。

### 对方长时间不回

当前无超时机制。A 会一直 waiting。如需超时，调用方需要用 `create_sub_thread` 创建定时器子线程。

### 对方线程 failed

A 的 talk_sync 会 reject，error 包含对方失败信息。

## 典型场景

### 1. 跨对象函数调用

```typescript
// 调用 filesystem 的 listDir
const files = await talk_sync({
  form_id,
  target: "filesystem",
  message: { method: "listDir", args: { path: "/docs" } }
});
```

### 2. 征求 Supervisor 意见

```typescript
const decision = await talk_sync({
  form_id,
  target: "supervisor",
  message: "我准备改动 X 文件，是否需要先开 Issue？"
});
```

### 3. 请求审查

```typescript
const review = await talk_sync({
  form_id,
  target: "reviewer",
  message: { code: "...", context: "..." }
});
```

## 避免死锁

如果 A talk_sync B，而 B 在当前任务里需要等 A 完成才能回答 → **死锁**。

防御：
- 尽量避免"循环等待"（A 等 B，B 等 A）
- 如果需要双向协作，一方用 talk（异步），另一方用 talk_sync

调度器的死锁检测会兜底强制唤醒，但设计上应避免。

## 源码锚点

| 概念 | 实现 |
|---|---|
| talk_sync 处理 | `kernel/src/thread/engine.ts` |
| wait + 消息路由 | `kernel/src/thread/collaboration.ts` |
| 协议约定 | `kernel/traits/talkable/cross_object/TRAIT.md` |

## 与基因的关联

- **G8**（Effect 与 Space）— talk_sync 把异步 Effect 包装成同步 API
- **G6**（关系即网络）— 协作的典型用法
