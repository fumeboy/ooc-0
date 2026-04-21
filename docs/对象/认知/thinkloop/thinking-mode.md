# Thinking Mode — 双通道架构

> thought 从"**输出协议**"升级为"**Provider 能力层产生的运行时语义**"。

## 历史背景

### 早期：文本协议

早期 OOC 让 LLM 用特定格式输出"思考过程"：

```
<thinking>
我应该先搜索 X，然后再判断...
</thinking>

<tool_call>
open(command=program)
</tool_call>
```

Engine 需要写 parser 拆分 `<thinking>` 和 `<tool_call>` 段。这种方式：
- 容易出错（LLM 偶尔忘记闭合标签）
- 需要用 prompt 不断强调格式
- 占用模型的"输出带宽"

### 当前：Provider 能力层

现代 LLM 原生支持 thinking（Claude、Anthropic、GLM 等都有）。Provider 返回：

```typescript
interface LLMResult {
  content: string;              // 对话正文（给用户的话）
  thinkingContent: string;      // LLM 的思考过程
  toolCalls: ToolCall[];        // 结构化 tool 调用
  usage: TokenUsage;
}
```

thinking 和 content 通过**不同字段**返回，天然分开。不需要 parser。

## 双通道架构

```
┌─────────────────────────────────────────┐
│        Provider 能力层                   │
│  - 开启 thinking                         │
│  - 读取 thinking 输出                    │
│  - 适配为 LLMResult 统一结构             │
└───────────────┬─────────────────────────┘
                │
                ↓
┌─────────────────────────────────────────┐
│        Engine 语义映射层                 │
│  - thinkingContent → thought action     │
│  - content → text action                │
│  - toolCalls → tool_use action          │
│  - 全部持久化到 thread.json             │
└───────────────┬─────────────────────────┘
                │
                ↓
┌─────────────────────────────────────────┐
│        SSE 推送层                        │
│  - stream:thought                       │
│  - stream:action                        │
│  - stream:program                       │
└─────────────────────────────────────────┘
```

## 三种 action 类型

| action type | 来源 | 用途 |
|---|---|---|
| `thought` | thinkingContent | LLM 的推理过程（对开发者可见，帮助调试） |
| `text` | content | LLM 对用户的直接回复 |
| `tool_use` | toolCalls | 具体的工具调用 + 参数 + 返回 |

### thought action

```json
{
  "type": "thought",
  "content": "用户问 X，我需要先查 Y 的文档再回答...",
  "ts": "2026-04-21T10:00:00Z"
}
```

**thought 不进入下一轮 Context**——它是过程记录，不是结果。避免"思考套娃"。

### text action

```json
{
  "type": "text",
  "content": "我找到了 Y 的文档，答案是 ...",
  "ts": "..."
}
```

进入 Context 的 `process` 字段。

### tool_use action

```json
{
  "type": "tool_use",
  "tool": "open",
  "args": { "type": "command", "command": "program", "description": "..." },
  "result": { "form_id": "f_123" },
  "ts": "..."
}
```

进入 Context 的 `process` 字段。

## SSE 推送

### stream:thought

```json
{ "type": "stream:thought", "threadId": "...", "chunk": "用户问 X..." }
```

用于前端**实时**显示 LLM 的思考流（像 ChatGPT 的 thinking 指示器）。

### stream:action / stream:program

用于显示 tool call 的执行流（如 program 的代码执行输出）。

## Provider 抽象

`kernel/src/thinkable/client.ts` 提供统一接口：

```typescript
interface LLMClient {
  complete(params: {
    context: ContextData;
    tools: ToolDef[];
    thinking?: boolean;
  }): Promise<LLMResult>;
}
```

不同 provider（GLM、Claude、OpenAI 等）实现这个接口。Engine 只依赖接口，不关心具体 provider。

## 为什么不让 thinking 进入 Context

有开发者会问：既然 LLM 已经思考了，下一轮让它看到自己之前的 thinking 不是更好吗？

答：**不好**。原因：
1. **套娃风险**：LLM 看到自己之前的 thinking，可能开始 meta-thinking（思考自己的思考），失控
2. **Context 爆炸**：thinking 通常比 content 长 2-5 倍，注入会急速耗 token
3. **价值低**：thinking 是"本轮的推理过程"——过了就过了。有价值的结论应该通过 content / tool_use 显式表达

所以 thought 只是**记录**（写入 thread.json 供回看），**不**进入下一轮 Context。

## 源码锚点

| 概念 | 实现 |
|---|---|
| LLMClient 接口 | `kernel/src/thinkable/client.ts` |
| Provider 实现 | `kernel/src/thinkable/*.ts` |
| Engine 语义映射 | `kernel/src/thread/engine.ts` |
| SSE 推送 | `kernel/src/server/sse.ts`（或 server/*.ts） |

## 与基因的关联

- **G4**（输出程序以行动）— thought 是"思考的记录"，action 是"行动的轨迹"
- **G10**（行动记录不可变）— 所有 action 类型都追加到 actions，从不改写
