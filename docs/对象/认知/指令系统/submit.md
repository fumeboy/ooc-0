# submit — 提交执行

> 对 command 类型 form，submit 执行具体指令。trait / skill 类型**不需要** submit。

## 签名

```typescript
submit({
  form_id: "f_001",
  ...commandSpecificArgs
})
// → 指令执行结果
```

## 按 command 分派

submit 的 `commandSpecificArgs` 根据 form 的 command 不同：

### program

```typescript
submit({ form_id, code: "await writeFile('path', '...')" })
// → { stdout: "...", result: ..., error: null }
```

执行 JavaScript 代码。返回 print 的输出和/或沙箱结果。

### talk / talk_sync

```typescript
// 异步
submit({ form_id, target: "bruce", message: "..." })
// → { sent: true }

// 同步
submit({ form_id, target: "filesystem", message: { method: "readFile", args: {...} } })
// → 对方的回复（talk_sync 会阻塞直到收到）
```

### return

```typescript
submit({ form_id, summary: "任务完成：找到 3 份相关文档，详见 ..." })
// → 线程 done
```

### create_sub_thread

```typescript
submit({ form_id, title: "...", description: "...", inherit_scope: true })
// → { thread_id: "th_xxx" }
```

### continue_sub_thread

```typescript
submit({ form_id, thread_id: "th_xxx", message: "继续：..." })
// → { sent: true }
```

### set_plan

```typescript
submit({ form_id, plan: [ { step: 1, title: "...", status: "pending" }, ... ] })
// → { saved: true }
```

## 语义上 submit 完成即 form 结束

submit 后：

1. form 的 status 从 `open` → `submitted`
2. 关联的 trait 开始 deactivate（refcount--）
3. 如果 refcount 归零，trait 真正卸载

**注意**：`close` 和 `submit` 的差别：
- `submit` = 执行并结束 form
- `close` = **取消**（未执行）form

submit 执行后不需要再 close——Form 已经完成生命周期。

## 错误处理

submit 可能失败。错误作为 action 记录：

```json
{
  "type": "tool_use",
  "tool": "submit",
  "args": { "form_id": "f_001", "code": "..." },
  "result": null,
  "error": "SyntaxError: unexpected token",
  "ts": "..."
}
```

LLM 下一轮看到错误，决定如何处理：
- 重试（修正代码后再 open + submit）
- 放弃（close 相关 form）
- 向用户/父线程报告

**失败不会自动让线程 failed**——LLM 决定。

## 附加参数

### mark（详见 mark.md）

```typescript
submit({ form_id, ..., mark: { id: "msg-123", action: "ack" } })
```

同时标记一条 inbox 消息。

## 源码锚点

| 概念 | 实现 |
|---|---|
| submit tool 定义 | `kernel/src/thread/tools.ts` |
| handleSubmit | `kernel/src/thread/engine.ts` |
| 命令分派 | 同文件的 switch(form.command) |
| FormManager.submit | `kernel/src/thread/form.ts` |
