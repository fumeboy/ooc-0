# ThinkLoop — 思考引擎

> G4：对象的思考引擎。每一轮：**感知 → 思考 → 行动 → 循环**。

## 单轮流程

```
感知   ──  构建 Context（context-builder.ts）
  ↓
思考   ──  LLM 基于 Context + tools 生成输出
  ↓
行动   ──  Engine 处理 tool call（open/submit/close/wait）
  ↓
记录   ──  thought + actions 写入 thread.json
  ↓
循环   ──  进入下一轮（或切换状态）
```

## 三个子文档

| 文档 | 内容 |
|---|---|
| [engine.md](engine.md) | Engine 单轮循环的详细实现 |
| [thinking-mode.md](thinking-mode.md) | Provider 能力层 + 语义映射：thinking 的双通道架构 |
| (reflect-flow 挪到 [../../成长/反思机制/reflect-flow.md](../../成长/反思机制/reflect-flow.md)) | — |

**为什么 ReflectFlow 不在这里**：ReflectFlow 是**跨轮次的成长机制**——它的本质是驱动 G12 沉淀循环，而非驱动单轮思考。所以它归属 `成长/` 而非 `认知/`。详见 [../../成长/反思机制/](../../成长/反思机制/)。

## 两条执行路径

Engine 同时支持两条 LLM 输出解析路径：

### 主路径：Tool Calling

LLM 返回 `toolCalls` 时走此路径。由 Engine 直接处理 `open/submit/close/wait`。

**优点**：
- 强类型（每个 tool 有明确的 JSON schema）
- 无需解析文本
- 多数 LLM 都原生支持

### 兼容路径：TOML 解析

LLM 未返回 toolCalls 时（某些模型不支持 tool calling），走旧的 TOML 解析路径：

```
[tool_call]
tool = "open"
type = "command"
command = "program"
```

由 `parser.ts` 解析文本，生成 tool calls 后交给 Engine 相同的处理逻辑。

**作用**：保留对不支持 tool calling 的模型的兼容。实际上随着 LLM 普及 tool calling，这条路径使用率越来越低。

## Thinking Mode — 双通道架构

OOC 将 LLM 的 **thinking 输出** 与 **action 输出** 分开处理：

```
Provider（GLM、Claude 等）
  → LLMResult = {
      content,            // 对话正文
      thinkingContent,    // thinking 过程
      toolCalls,          // tool calls
      usage
    }
  → Engine 语义映射：
    - content → text action
    - thinkingContent → thought action
    - toolCalls → tool_use action
```

**thinkingContent 的语义**：从"输出协议"（LLM 输出格式的一部分）升级为"Provider 能力层产生的运行时语义"——thought 不再需要被 parser 解析，而是直接从 Provider 读取。

详见 [thinking-mode.md](thinking-mode.md)。

## 源码锚点

| 概念 | 实现 |
|---|---|
| Engine 主循环 | `kernel/src/thread/engine.ts` |
| Provider 接口 | `kernel/src/thinkable/client.ts` |
| TOML 解析 | `kernel/src/thread/parser.ts` |
| Tool 定义 | `kernel/src/thread/tools.ts` |
| Context 构建 | `kernel/src/thread/context-builder.ts` |

## 与基因的关联

- **G4**（输出程序以行动）— 本目录核心
- **G13**（线程树即运行模型）— 每轮循环都是线程树某一节点的一步
