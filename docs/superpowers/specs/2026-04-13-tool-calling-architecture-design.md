# Tool Calling 架构设计（替代 TOML 输出格式）

> 日期：2026-04-13
> 状态：Draft
> 分支：feat/tool-calling
> 作者：Alan Kay + Claude

## 1. 背景与动机

当前 OOC 对象通过 TOML 文本格式输出指令，存在严重问题：
- LLM 频繁输出格式错误（纯文本前缀、```toml 包裹、幻觉标签）
- 需要复杂的 parser 容错和格式重试机制
- begin/submit 两步 form 模型增加了轮次消耗
- TOML 嵌套结构（`[talk.begin]` → `{ talk: { begin: {} } }`）容易混淆

LLM 原生支持 tool_use / function_calling，这是更可靠的结构化输出方式。

## 2. 设计目标

1. 用 LLM 的 tool_use 替代 TOML 文本输出
2. 每个指令定义为一个 tool（JSON Schema 参数）
3. LLM 的非 tool 文本输出自动记录为 thought
4. 保留 form 模型的 trait 按需加载能力
5. 兼容 OpenAI 兼容协议（tools + tool_choice）

## 3. Tool 定义

每个指令拆为 `xxx_begin` 和 `xxx_submit` 两个 tool，保留渐进式 trait 加载。
另有 `form_cancel` 通用取消 tool。

### 3.1 Begin Tools（声明意图，触发 trait 加载）

```typescript
const BEGIN_TOOLS = [
  {
    type: "function",
    function: {
      name: "program_begin",
      description: "声明要执行代码。系统加载 computable 相关知识。",
      parameters: {
        type: "object",
        properties: {
          description: { type: "string", description: "要做什么" },
        },
        required: ["description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "talk_begin",
      description: "声明要发送消息。系统加载 talkable 相关知识。",
      parameters: {
        type: "object",
        properties: {
          description: { type: "string", description: "要做什么" },
        },
        required: ["description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "return_begin",
      description: "声明要返回结果。系统加载 talkable + reflective + verifiable 知识。",
      parameters: {
        type: "object",
        properties: {
          description: { type: "string", description: "要做什么" },
        },
        required: ["description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_sub_thread_begin",
      description: "声明要创建子线程。系统加载 plannable 知识。",
      parameters: {
        type: "object",
        properties: {
          description: { type: "string", description: "要做什么" },
        },
        required: ["description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "call_function_begin",
      description: "声明要调用 trait 方法。系统加载目标 trait。",
      parameters: {
        type: "object",
        properties: {
          description: { type: "string", description: "要做什么" },
          trait: { type: "string", description: "trait 完整路径" },
          function_name: { type: "string", description: "方法名" },
        },
        required: ["description", "trait", "function_name"],
      },
    },
  },
  // use_skill_begin, set_plan_begin, await_begin, await_all_begin 等类似
];
```

### 3.2 Submit Tools（提交参数，执行指令）

begin 后系统返回 form_id，LLM 在后续轮次调用 submit：

```typescript
const SUBMIT_TOOLS = [
  {
    type: "function",
    function: {
      name: "program_submit",
      description: "提交代码执行",
      parameters: {
        type: "object",
        properties: {
          form_id: { type: "string" },
          code: { type: "string", description: "JavaScript 代码" },
          lang: { type: "string", enum: ["javascript", "shell"], default: "javascript" },
        },
        required: ["form_id", "code"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "talk_submit",
      description: "提交消息发送",
      parameters: {
        type: "object",
        properties: {
          form_id: { type: "string" },
          target: { type: "string" },
          message: { type: "string" },
        },
        required: ["form_id", "target", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "return_submit",
      description: "提交返回结果",
      parameters: {
        type: "object",
        properties: {
          form_id: { type: "string" },
          summary: { type: "string" },
        },
        required: ["form_id", "summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_sub_thread_submit",
      description: "提交子线程创建",
      parameters: {
        type: "object",
        properties: {
          form_id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          traits: { type: "array", items: { type: "string" } },
        },
        required: ["form_id", "title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "call_function_submit",
      description: "提交 trait 方法调用",
      parameters: {
        type: "object",
        properties: {
          form_id: { type: "string" },
          args: { type: "object", description: "方法参数" },
        },
        required: ["form_id"],
      },
    },
  },
  // use_skill_submit, set_plan_submit, await_submit 等类似
];
```

### 3.3 通用 Cancel Tool

```typescript
{
  type: "function",
  function: {
    name: "form_cancel",
    description: "取消一个已开启的 form",
    parameters: {
      type: "object",
      properties: {
        form_id: { type: "string" },
      },
      required: ["form_id"],
    },
  },
}
```

### 3.4 动态 Tools 列表

Engine 根据当前 form 状态动态调整可用 tools：

- **空闲态**：只提供 begin tools（program_begin, talk_begin, return_begin 等）
- **有活跃 form 时**：提供对应的 submit tool + form_cancel + 其他 begin tools

## 4. LLM Client 变更

### 4.1 Message 类型扩展

```typescript
/** 聊天消息（扩展支持 tool_calls 和 tool 结果） */
export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** assistant 消息中的 tool calls */
  tool_calls?: ToolCall[];
  /** tool 消息中的 tool_call_id */
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}
```

### 4.2 chat() 扩展

```typescript
interface LLMClient {
  chat(messages: Message[], options?: {
    tools?: ToolDefinition[];
  }): Promise<LLMResponse>;
}
```

`LLMResponse` 新增 `toolCalls` 字段：

```typescript
interface LLMResponse extends LLMResult {
  content: string;
  /** tool calls（如果 LLM 选择调用工具） */
  toolCalls?: ToolCall[];
}
```

### 4.3 buildChatPayload 变更

```typescript
function buildChatPayload(config, messages, options?) {
  const payload = { ... };
  if (options?.tools?.length) {
    payload.tools = options.tools;
  }
  return payload;
}
```

### 4.4 normalizeResult 变更

从响应中提取 `tool_calls`：

```typescript
function normalizeResult(data, fallbackModel) {
  const msg = choices[0]?.message;
  // ... 现有逻辑 ...

  // 新增：提取 tool_calls
  const toolCalls = Array.isArray(msg?.tool_calls) ? msg.tool_calls : undefined;

  return { ...result, toolCalls };
}
```

## 5. Engine 变更

### 5.1 核心流程变化

```
现在：
  buildContext → contextToMessages → llm.chat(messages) → TOML parser → thinkloop → engine

改为：
  buildContext → contextToMessages → llm.chat(messages, { tools }) → 直接从 toolCalls 提取指令 → engine 执行
```

不再需要 TOML parser 和 thinkloop 的指令透传。

### 5.2 Tool 结果反馈

Tool calling 协议要求：LLM 输出 tool_call → 系统执行 → 将结果作为 `role: "tool"` 消息反馈 → LLM 继续。

这意味着一轮 ThinkLoop 内部可能有多次 LLM 调用（tool call → result → 继续）。

```
LLM 输出: tool_call(program, { code: "readFile(...)" })
    ↓
Engine 执行 program，得到结果
    ↓
追加 tool result message: { role: "tool", content: result, tool_call_id: "..." }
    ↓
再次调用 LLM（带 tool result）
    ↓
LLM 可能输出更多 tool_calls 或纯文本（thought）或 return_result
```

### 5.3 非 tool 输出处理

当 LLM 输出纯文本（没有 tool_calls）时：
- `content` 自动记录为 thought action
- 继续下一轮 ThinkLoop（LLM 可能在思考后决定调用工具）

### 5.4 Trait 按需加载

不再需要 form 的 begin/submit 两步。Tool calling 天然支持按需加载：

- Engine 维护一个 tool registry，根据当前激活的 traits 动态生成 tools 列表
- 基础 tools（program、talk、return_result 等）始终可用
- call_function 始终可用（通过它调用任何 trait 方法）
- 当 trait 被激活时，其方法也可以作为独立 tool 注册

## 6. 简化点

tool calling 模式下可以简化的东西：

1. **删除 TOML parser**（parser.ts 中的 safeParseToml、三层容错逻辑）
2. **删除格式重试机制**（isEmptyIterResult + retry loop）— tool call 不会有格式错误
3. **简化 thinkloop**（不再需要从 TOML 提取指令，tool_calls 已经是结构化的）
4. **简化 base trait**（不再需要 TOML 格式说明，tool schema 就是格式定义）
5. **删除 output_format trait**（tool schema 替代了 TOML 格式规范）

**保留**：
- **FormManager**（begin/submit/cancel + 引用计数 + trait 加载/卸载）
- **commandBinding**（trait 声明关联的指令）
- **collectCommandTraits**（收集需要加载的 trait）
- **渐进式 trait 加载**（begin 时加载，submit/cancel 时卸载）

## 7. 模块改动

| 文件 | 改动 |
|------|------|
| `thinkable/client.ts` | Message 扩展 tool_calls/tool_call_id；chat() 支持 tools 参数；normalizeResult 提取 toolCalls |
| `thread/engine.ts` | 用 tool_calls 替代 TOML 解析；tool result 反馈循环；动态 tools 列表 |
| `thread/tools.ts` | 新建：OOC_TOOLS 定义 + tool registry |
| `thread/context-builder.ts` | 简化：不再需要 TOML 格式说明 |
| `traits/base/TRAIT.md` | 简化：移除 TOML/form 规则，改为描述可用工具 |

## 8. 迁移策略

在 `feat/tool-calling` 分支上开发，不影响 main。分阶段：

1. **Phase 1**：扩展 LLMClient 支持 tools
2. **Phase 2**：新建 tools.ts 定义 OOC tools
3. **Phase 3**：改造 engine 使用 tool_calls
4. **Phase 4**：简化/删除 TOML parser、form、thinkloop 指令透传
5. **Phase 5**：更新 traits 文档
