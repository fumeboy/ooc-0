# submit — 提交执行

> 对 command 类型 form，submit 执行具体指令。trait / skill 类型**不需要** submit。

## 签名（2026-04-26 更新）

```typescript
submit({
  form_id: "f_001",
  title: "一句话说明本次行动",  // 必填
  mark?: { id: string; action: "ack" | "ignore" | "todo" }
})
// → 指令执行结果
```

**注意**：`submit` 不再直接接受指令参数（`commandSpecificArgs`）。所有 args 通过 `refine` 工具在 submit 之前累积。`open(action, args?)` 中的可选 `args` 等价于 open + 一次 refine。

## 按 command 分派

submit 触发后，engine 从 FormManager 读取之前通过 `refine` 累积的 args，按 form 的 command 类型分派：

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

### think(context="fork")（替代 create_sub_thread）

```typescript
open({ type: "command", command: "think", description: "派生子线程分析 X" })
submit({ form_id, title: "分析 X", context: "fork", msg: "请分析 X 模块的 API" })
// → 创建子线程，返回 thread_id = "th_xxx"
```

`title` 同时是新子线程的名字。
`threadId` 省略时：fork 当前线程；填写时：fork 指定线程。

### think(context="continue")（替代 continue_sub_thread）

```typescript
open({ type: "command", command: "think", description: "补充信息给子线程" })
submit({ form_id, title: "补充上下文", context: "continue", threadId: "th_xxx", msg: "忘了告诉你：X 在 Y 目录" })
// → 向 th_xxx 的 inbox 投递消息，唤醒该线程
```

continue 模式下 `threadId` 必填（engine 会校验）。

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
