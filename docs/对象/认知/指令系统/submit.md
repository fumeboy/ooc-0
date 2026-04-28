# submit — 提交执行

> 对 command 类型 form，submit 执行具体指令。trait / skill 类型**不需要** submit。

## 签名（2026-04-26 更新）

```typescript
submit({
  form_id: "f_001",
  title: "一句话说明本次行动",  // 必填
  mark?: [{ messageId: string; type: "ack" | "ignore" | "todo"; tip: string }]
})
// → 指令执行结果
```

**注意**：`submit` 不再直接接受指令参数（`commandSpecificArgs`）。所有 args 通过 `refine` 工具在 submit 之前累积。`open(action, args?)` 中的可选 `args` 等价于 open + 一次 refine。

## 按 command 分派

submit 触发后，engine 从 FormManager 读取之前通过 `refine` 累积的 args，按 form 的 command 类型分派：

### program

```typescript
open({
  title: "执行脚本",
  type: "command",
  command: "program",
  description: "写入文件",
  args: { code: "await writeFile('path', '...')" }
})
submit({ title: "写入文件", form_id })
// → { stdout: "...", result: ..., error: null }
```

执行 JavaScript 代码。返回 print 的输出和/或沙箱结果。

### talk

```typescript
// 异步
open({
  title: "通知 bruce",
  type: "command",
  command: "talk",
  description: "请 bruce 验证",
  args: { target: "bruce", msg: "...", context: "fork" }
})
submit({ title: "发送给 bruce", form_id })
// → { sent: true }

// 等待回复（旧 talk_sync 语义）
open({
  title: "请求 filesystem 读取文件",
  type: "command",
  command: "talk",
  description: "需要对方返回结果",
  args: {
    target: "filesystem",
    msg: { method: "readFile", args: {...} },
    context: "fork",
    wait: true
  }
})
submit({ title: "发送并等待回复", form_id })
// → 当前线程进入 waiting，收到回复后继续
```

### return

```typescript
open({
  title: "准备结束",
  type: "command",
  command: "return",
  description: "返回任务结果",
  args: { summary: "任务完成：找到 3 份相关文档，详见 ..." }
})
submit({ title: "返回结果", form_id })
// → 线程 done
```

### do(context="fork")（替代 create_sub_thread）

```typescript
open({
  title: "分析 X",
  type: "command",
  command: "do",
  description: "派生子线程分析 X",
  args: { context: "fork", msg: "请分析 X 模块的 API" }
})
submit({ title: "分析 X", form_id })
// → 创建子线程，返回 thread_id = "th_xxx"
```

`title` 同时是新子线程的名字。
`threadId` 省略时：fork 当前线程；填写时：fork 指定线程。

### do(context="continue")（替代 continue_sub_thread）

```typescript
open({
  title: "补充上下文",
  type: "command",
  command: "do",
  description: "补充信息给子线程",
  args: { context: "continue", threadId: "th_xxx", msg: "忘了告诉你：X 在 Y 目录" }
})
submit({ title: "补充上下文", form_id })
// → 向 th_xxx 的 inbox 投递消息，唤醒该线程
```

continue 模式下 `threadId` 必填（engine 会校验）。

### plan

```typescript
open({
  title: "更新计划",
  type: "command",
  command: "plan",
  description: "记录执行计划",
  args: { plan: [ { step: 1, title: "...", status: "pending" }, ... ] }
})
submit({ title: "保存计划", form_id })
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
  "args": { "title": "写入文件", "form_id": "f_001" },
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
submit({ form_id, title: "提交", mark: [{ messageId: "msg-123", type: "ack", tip: "已处理" }] })
```

同时标记一条 inbox 消息。

## 源码锚点

| 概念 | 实现 |
|---|---|
| submit tool 定义 | `kernel/src/thread/tools/submit.ts` |
| handleSubmit | `kernel/src/thread/engine.ts` |
| 命令分派 | 同文件的 switch(form.command) |
| FormManager.submit | `kernel/src/thread/form.ts` |
