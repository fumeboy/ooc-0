# Engine — 单轮循环的详细实现

> Engine 是线程树执行引擎的核心。它驱动每个 running 线程的单轮思考-行动循环。

## 单轮循环详解

```
Engine.runThreadIteration(threadId):

1. 构建 Context
   context = await contextBuilder.buildContext(threadId)

2. 检查 pause 信号
   if pausing: writePauseFiles(context); setStatus(paused); return

3. 调用 LLM
   result = await llmClient.complete({
     context,
     tools: getAvailableTools(activatedTraits),
     thinking: true  // 启用 thinking mode
   })

4. 处理 thinking 输出
   if result.thinkingContent:
     recordAction({ type: "thought", content: result.thinkingContent })
     SSE.send("stream:thought", ...)

5. 处理正文输出
   if result.content:
     recordAction({ type: "text", content: result.content })

6. 处理 tool calls
   for each toolCall in result.toolCalls:
     handleToolCall(threadId, toolCall)
     recordAction({ type: "tool_use", tool: toolCall.name, args: ..., result: ... })

7. 处理 mark 参数（附加在任意 tool call 上）
   for each mark in extractMarks(toolCalls):
     markInbox(threadId, mark.id, mark.action)

8. 判断下一步状态
   if 有 return 指令: setStatus(done); notifyParent()
   elif 有 wait 指令: setStatus(waiting)
   else: setStatus(running)  // 下一轮继续

9. 持久化
   writeThread(threadId)
```

## Tool Call 处理

### open — 打开 form

```typescript
async function handleOpen(threadId, args) {
  const { type, command, name, description } = args;
  const formId = await formManager.begin(threadId, args);

  if (type === "command") {
    const traits = collectCommandTraits(command);
    for (const trait of traits) {
      activateTrait(trait, threadId);
    }
  } else if (type === "trait") {
    activateTrait(name, threadId);
  } else if (type === "skill") {
    loadSkill(name);
  }

  return { form_id: formId };
}
```

### submit — 执行指令

```typescript
async function handleSubmit(threadId, args) {
  const { form_id, ...commandArgs } = args;
  const form = formManager.get(form_id);

  if (form.type !== "command") throw new Error("...");

  // 根据 command 类型分派
  switch (form.command) {
    case "program":
      return await executeProgram(threadId, commandArgs.code);
    case "talk":
      return await handleTalk(threadId, commandArgs);
    case "return":
      return await handleReturn(threadId, commandArgs.summary);
    // ...
  }
}
```

### close — 关闭 form

```typescript
async function handleClose(threadId, args) {
  const { form_id } = args;
  const form = formManager.get(form_id);

  formManager.cancel(form_id);

  // 卸载关联 trait
  if (form.type === "command") {
    const traits = collectCommandTraits(form.command);
    for (const trait of traits) {
      deactivateTrait(trait, threadId);
    }
  } else if (form.type === "trait") {
    deactivateTrait(form.name, threadId);
  }
}
```

### wait — 等待

```typescript
async function handleWait(threadId, args) {
  const { thread_ids } = args;  // 可选
  thread.setStatus("waiting");
  thread.waitFor = thread_ids || null;  // null 表示等任何消息
}
```

## Thinking Mode 处理

当 `result.thinkingContent` 存在：

```typescript
// 1. 记录为 thought action
thread.actions.push({
  type: "thought",
  content: result.thinkingContent,
  ts: now()
});

// 2. SSE 推送（用于前端流式展示）
sse.send("stream:thought", { threadId, chunk: result.thinkingContent });
```

**thinking 不是协议**——它是 Provider 层直接返回的字段，Engine 只做语义映射。详见 [thinking-mode.md](thinking-mode.md)。

## 错误处理

### Tool Call 失败

```typescript
try {
  result = await handleToolCall(...)
} catch (error) {
  recordAction({ type: "tool_error", tool, error: error.message });
  // 触发 debuggable.when_error hook（如果已激活）
  if (activatedTraits.has("kernel/debuggable")) {
    injectDebugHint(threadId);
  }
  // 不自动 fail 线程——让 LLM 决定如何处理
}
```

### 严重错误（如 LLM 调用失败）

```typescript
try {
  result = await llmClient.complete(...)
} catch (error) {
  recordAction({ type: "error", message: error.message });
  thread.setStatus("failed");
  notifyParent(threadId, { error });
}
```

## TOML 兼容路径

如果 `result.toolCalls` 为空但 `result.content` 包含 TOML 格式，Engine 尝试 TOML 解析：

```typescript
if (!result.toolCalls.length && result.content.includes("[tool_call]")) {
  const parsed = parser.parseTOML(result.content);
  if (parsed.length) {
    result.toolCalls = parsed;  // 降级为 tool calls 统一处理
  }
}
```

此路径保留给不支持 tool calling 的模型。

## 源码锚点

| 概念 | 实现 |
|---|---|
| 主循环 | `kernel/src/thread/engine.ts` |
| Tool 处理 | 同文件 |
| LLM Provider | `kernel/src/thinkable/client.ts` |
| Context 构建 | `kernel/src/thread/context-builder.ts` |
| Form 管理 | `kernel/src/thread/form.ts` |
| Hooks 注入 | `kernel/src/thread/hooks.ts` |

## 与基因的关联

- **G4**（输出程序以行动）— Engine 是 G4 的核心实现
- **G13**（线程树即运行模型）— Engine 驱动线程树的每一步
