# OOC 可观测性框架设计

> 日期：2026-04-11
> 状态：Draft
> 作者：Alan Kay + Claude

## 1. 背景与动机

OOC 系统当前的可观测性能力有限：
- consola 文本日志（无结构化）
- SSE 实时事件（面向前端，非 debug 用途）
- 暂停时生成 llm.input.txt / llm.output.txt（仅暂停时可用，恢复后删除）

当系统出现问题时（LLM 输出异常、Context 过大、trait 未激活、性能瓶颈），
缺乏快速定位手段。需要一个完整的可观测性框架。

## 2. 设计目标

1. **ThinkLoop 输入输出持久化** — 每轮完整记录 LLM 的输入 Context 和输出
2. **LLM 调用性能指标** — 延迟、token 使用量、模型名称
3. **Context 窗口统计** — 各区域大小、占比
4. **Trait/Skill 激活记录** — 当前 Context 中加载了哪些 trait 和 skill
5. **HTTP API 动态开关** — 运行时开启/关闭，不需要重启服务器

## 3. Debug 模式开关

### 3.1 HTTP API

```
POST /api/debug/enable   → 开启 debug 模式
POST /api/debug/disable  → 关闭 debug 模式
GET  /api/debug/status   → 查询当前状态
```

响应格式：

```json
{ "success": true, "data": { "debugEnabled": true } }
```

### 3.2 实现方式

World 层维护 `_debugEnabled: boolean` 标志（默认 false），通过 EngineConfig 传入 engine。
Engine 在每轮 ThinkLoop 中检查此标志，决定是否记录 debug 数据。

开启后对所有对象、所有 session 生效。关闭后立即停止记录（已写入的文件保留）。

## 4. Debug 数据持久化

### 4.1 文件结构

每轮 ThinkLoop 生成文件，写入线程目录下的 `debug/` 子目录：

```
flows/{sessionId}/objects/{objectName}/threads/{threadId}/debug/
├── loop_001.input.txt       # 发送给 LLM 的完整 Messages
├── loop_001.output.txt      # LLM 原始输出文本
├── loop_001.thinking.txt    # LLM thinking 输出（如有）
├── loop_001.meta.json       # 结构化元数据
├── loop_002.input.txt
├── loop_002.output.txt
├── loop_002.meta.json
└── ...
```

### 4.2 input.txt 格式

与现有暂停机制一致：

```
--- system ---
# 你是 bruce
...（whoAmI + instructions + knowledge）

--- user ---
## 任务
...（parentExpectation + process + inbox + todos + directory）
```

### 4.3 output.txt 格式

LLM 返回的原始文本，包含 `[thought]`、`[program]`、`[use_skill]` 等 TOML 指令。

### 4.4 thinking.txt

仅当 LLM 返回 thinking 内容时生成。包含 provider 原生的推理过程。

### 4.5 meta.json 结构

```json
{
  "loop": 1,
  "timestamp": 1712345678000,
  "threadId": "th_xxx",
  "objectName": "bruce",
  "source": "llm",
  "llm": {
    "model": "gpt-4o",
    "latencyMs": 3200,
    "promptTokens": 4500,
    "completionTokens": 800,
    "totalTokens": 5300
  },
  "context": {
    "totalChars": 18000,
    "totalMessageChars": 19500,
    "sections": {
      "whoAmI": 500,
      "instructions": 6000,
      "knowledge": 3000,
      "process": 5000,
      "plan": 200,
      "inbox": 200,
      "todos": 100,
      "childrenSummary": 300,
      "ancestorSummary": 150,
      "siblingSummary": 0,
      "directory": 300,
      "locals": 50
    }
  },
  "activeTraits": ["kernel/computable", "kernel/talkable", "kernel/file_ops"],
  "activeSkills": ["commit"],
  "parsedDirectives": ["thought", "program"]
}
```

字段说明：

| 字段 | 说明 |
|------|------|
| `loop` | 轮次编号，从 1 开始 |
| `timestamp` | 本轮开始时间戳 |
| `threadId` / `objectName` | 线程和对象标识 |
| `source` | 数据来源：`"llm"` 表示真实 LLM 调用，`"cached"` 表示使用暂停缓存的输出（resume 场景） |
| `llm.model` | 使用的 LLM 模型名称 |
| `llm.latencyMs` | LLM 调用耗时（毫秒），cached 时为 0 |
| `llm.promptTokens` / `completionTokens` / `totalTokens` | token 使用量（与现有 `TokenUsage` 类型一致，provider 未返回时为 0） |
| `context.totalChars` | ThreadContext 原始字段的总字符数（各 section 之和） |
| `context.totalMessageChars` | contextToMessages() 拼接后实际发送给 LLM 的总字符数 |
| `context.sections` | ThreadContext 各字段的字符数，完整列表见上方示例 |
| `activeTraits` | 当前激活的 trait 列表（从 ThreadContext.scopeChain 获取） |
| `activeSkills` | 当前可用的 skill 列表（从 ThreadContextInput.skills 提取 name） |
| `parsedDirectives` | 本轮 LLM 输出中解析出的指令类型（从 iterResult 中提取非 null 字段名） |

### 4.6 文件命名规则

- loop 编号三位数补零：`001`、`002`、...、`999`
- 文件名格式：`loop_{NNN}.{type}.{ext}`
- thinking.txt 仅在有内容时生成

### 4.7 loopIndex 获取方式

在 engine 的 `runOneIteration` 回调外部维护一个闭包计数器（`let loopCounter = 0`），
每次进入回调时 `loopCounter++`。resume 场景下，通过扫描 `debug/` 目录下已有文件数量
来初始化计数器（`loopCounter = existingFileCount`），确保编号连续。

### 4.8 Resume 路径处理

engine 中有两处 LLM 调用路径：
- `runWithThreadTree()` — 正常路径，真实 LLM 调用
- `resumeWithThreadTree()` — 恢复路径，可能使用缓存输出

当使用缓存输出时（`threadData._pendingOutput` 存在）：
- 仍然记录 debug 数据（input/output/meta）
- `meta.json` 中 `source` 设为 `"cached"`
- `llm.latencyMs` 设为 0，token 统计设为 0
- 这样可以完整追踪每一轮的执行，包括 resume 后的首轮

### 4.9 文件清理策略

Debug 文件随 session 一起管理，不单独清理。删除 session 目录时 debug 文件一并删除。
当前阶段不实现自动清理或 TTL 机制。

## 5. 模块划分

### 5.1 新增文件

```
kernel/src/thread/debug.ts   — Debug 记录器
```

导出函数：

```typescript
/** 记录一轮 ThinkLoop 的 debug 数据 */
export function writeDebugLoop(params: {
  debugDir: string;
  loopIndex: number;
  messages: Message[];
  llmOutput: string;
  thinkingContent?: string;
  source: "llm" | "cached";
  llmMeta: {
    model: string;
    latencyMs: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  contextStats: { totalChars: number; totalMessageChars: number; sections: Record<string, number> };
  activeTraits: string[];
  activeSkills: string[];
  parsedDirectives: string[];
  threadId: string;
  objectName: string;
}): void

/** 从 ThreadContext 计算各区域字符数统计 */
export function computeContextStats(ctx: ThreadContext): { totalChars: number; sections: Record<string, number> }

/**
 * 从 ThreadIterationResult 提取解析出的指令类型
 * 遍历 iterResult 的关键字段，收集非 null 的字段名
 */
export function extractDirectiveTypes(iterResult: ThreadIterationResult): string[]

/**
 * 获取 debug 目录下已有的 loop 数量（用于 resume 场景初始化计数器）
 */
export function getExistingLoopCount(debugDir: string): number
```

### 5.2 修改文件

| 文件 | 改动内容 |
|------|---------|
| `thread/engine.ts` | EngineConfig 加 `debugEnabled?: boolean`；两处 runOneIteration 回调（runWithThreadTree + resumeWithThreadTree）中：LLM 调用前后计时，调用 writeDebugLoop()；维护 loopCounter 闭包计数器 |
| `world/world.ts` | 新增 `_debugEnabled` 标志；3 处 EngineConfig 传递 debugEnabled；新增 enableDebug() / disableDebug() / isDebugEnabled() 方法 |
| `server/server.ts` | 新增 3 个 API 路由：POST /api/debug/enable、POST /api/debug/disable、GET /api/debug/status |

### 5.3 不改动的文件

- `thread/thinkloop.ts` — 纯函数，不涉及 IO
- `thread/parser.ts` — 不涉及
- `thread/context-builder.ts` — 不涉及（stats 由 debug.ts 从 ThreadContext 计算）
- `thinkable/client.ts` — 不需要改动，`LLMResponse` 已包含 `usage: TokenUsage`（promptTokens / completionTokens / totalTokens）

## 6. 数据流

```
Engine runOneIteration:
  ↓
  buildThreadContext() → ctx
  ↓
  contextToMessages(ctx) → messages
  ↓
  [debug] computeContextStats(ctx) → contextStats
  [debug] totalMessageChars = messages.map(m => m.content.length).reduce(sum)
  [debug] activeTraits = ctx.scopeChain
  [debug] activeSkills = config.skills?.map(s => s.name) ?? []
  ↓
  startTime = Date.now()
  llm.chat(messages) → { content, thinkingContent, usage }
  latencyMs = Date.now() - startTime
  ↓
  runThreadIteration() → iterResult
  ↓
  [debug] parsedDirectives = extractDirectiveTypes(iterResult)
  [debug] if (config.debugEnabled) writeDebugLoop({
    messages, llmOutput: content, thinkingContent,
    source: "llm",
    llmMeta: { model, latencyMs, promptTokens, completionTokens, totalTokens },
    contextStats: { ...contextStats, totalMessageChars },
    activeTraits, activeSkills, parsedDirectives,
    threadId, objectName,
  })
  ↓
  applyIterationResult() + program/talk/useSkill 处理
```

注意：`writeDebugLoop` 在 `runThreadIteration()` 之后调用，因为需要从 `iterResult` 提取 `parsedDirectives`。

Resume 路径（使用缓存输出时）：同样的流程，但 `source: "cached"`，`latencyMs: 0`，token 统计为 0。

## 7. 测试计划

| 测试文件 | 覆盖内容 |
|---------|---------|
| `kernel/tests/thread-debug.test.ts` | writeDebugLoop 文件生成验证、meta.json 结构验证、computeContextStats 计算、extractDirectiveTypes 提取、loop 编号补零、thinking.txt 条件生成、getExistingLoopCount、source="cached" 场景 |

## 8. 设计决策记录

| 决策 | 选择 | 理由 |
|------|------|------|
| 实现方案 | Engine 层拦截 + 独立 debug 模块 | Engine 是唯一同时拥有 Context、LLM 结果、trait/skill 信息的位置 |
| 开关方式 | HTTP API 动态开关 | 运行时切换，不需要重启服务器 |
| 存储位置 | 线程目录下 debug/ 子目录 | 和线程数据放在一起，方便关联查看 |
| 文件格式 | txt + json | input/output 用 txt 方便直接阅读，meta 用 json 方便程序解析 |
| loop 编号 | 三位数补零 | 文件排序友好，支持到 999 轮 |
| thinkloop 不改动 | 保持纯函数 | debug IO 由 engine 负责，不破坏三层架构 |
| client.ts 不改动 | 已有 TokenUsage | LLMResponse 已包含 usage 字段，直接使用 |
| token 字段命名 | promptTokens / completionTokens | 与现有 TokenUsage 类型一致 |
| contextStats 统计层 | ThreadContext 原始字段 + 额外记录 totalMessageChars | 原始字段更有诊断价值（能看各区域占比），totalMessageChars 记录实际发送量 |
| resume 缓存输出 | 仍记录 debug，source="cached" | 完整追踪每一轮执行，不遗漏 |
| loopIndex 获取 | 闭包计数器 + resume 时扫描已有文件 | 简单可靠，支持 resume 场景编号连续 |
| 文件清理 | 随 session 一起管理 | 当前阶段不实现自动清理 |
