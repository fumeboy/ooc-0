# OOC Agent 能力升级设计

> 目标：让 OOC 对象具备与 Claude Code 同等的通用任务执行能力。
> 策略：三阶段渐进式改造 — 工具 Trait 生态 → 结构化调用协议 → 内部思考优化。

<!--
@ref docs/哲学文档/gene.md — extends — G3(Trait自我立法) G4(Program输出) G8(Effect三方向)
@ref docs/meta.md — extends — Trait子树、ThinkLoop子树
-->

---

## 背景与动机

### 现状分析

OOC 与 Claude Code 的能力对照揭示了一个清晰的格局：

- **内部思考**：OOC 显著优于 Claude Code — 认知栈(G13)、多线程、经验沉淀(G12)、自我反思(ReflectFlow) 都是 Claude Code 没有的
- **外部行动**：Claude Code 远强于 OOC — 结构化文件编辑、高效搜索、Git 操作、HTTP 客户端、浏览器自动化

**核心问题：OOC 有很好的大脑，但缺少手脚。**

### 调研参考

对 5 个主流 Agent 系统的调研提炼出关键设计模式：

| 项目 | 关键洞察 |
|------|---------|
| **OpenCode** | 架构与 OOC 高度相似（Bun+TS+SSE），工具通过 Zod schema 定义，LSP 集成提供编辑后诊断反馈 |
| **Aider** | unified diff 格式比 search/replace 有效 3 倍；flexible patching 容忍 LLM 不完美输出 |
| **SWE-agent** | ACI 哲学：工具的信息呈现方式比工具本身更重要；控制信息密度 |
| **Cline** | MCP 协议标准化工具定义；streaming diff 实时展示变更 |
| **Goose** | MCP-native 架构；错误作为数据回传 LLM 而非中断执行 |

---

## 总体架构

```
Phase 1: 工具 Trait 生态          Phase 2: 结构化调用协议        Phase 3: 内部思考优化
┌─────────────────────┐    ┌──────────────────────┐    ┌─────────────────────┐
│ Kernel Traits:      │    │ [action/tool] 格式   │    │ 自动记忆管理        │
│  file_ops           │    │ MCP 协议对齐         │    │ 认知栈自动化        │
│  file_search        │    │ 参数校验 + 权限控制  │    │ 经验沉淀闭环        │
│  shell_exec         │    │ 外部 MCP Server 接入 │    │ Context 压缩优化    │
│                     │    │                      │    │                     │
│ Library Traits:     │    │ 修改:                │    │ 修改:               │
│  git_ops            │    │  thinkloop.ts        │    │  reflective trait   │
│  http_client        │    │  registry.ts         │    │  context/builder.ts │
│                     │    │  computable readme   │    │  flow.ts            │
│ Stones 配置优化     │    │                      │    │                     │
└─────────────────────┘    └──────────────────────┘    └─────────────────────┘
     不动 Kernel 底层            改 ThinkLoop 解析           优化现有机制
     纯增量 Trait 建设           新增输出格式                 提升自动化程度
```

---

## Phase 0：基础设施准备

Phase 1 开始前需要完成以下基础设施变更：

### 0.1 扩展 MethodContext

当前 `MethodContext`（`kernel/src/trait/registry.ts`）只提供 `data`, `getData`, `setData`, `print`, `sessionId`, `filesDir`。工具 Trait 需要额外字段：

```typescript
interface MethodContext {
  // 现有字段...
  data: Record<string, unknown>;
  getData(key: string): unknown;
  setData(key: string, value: unknown): void;
  print(...args: unknown[]): void;
  sessionId: string;
  filesDir: string;

  // 新增字段
  rootDir: string;      // world_dir（用户仓库根目录）
  selfDir: string;      // stones/{name}/（对象自身目录）
  stoneName: string;    // 对象名称（用于日志和审计）
}
```

### 0.2 创建 library/traits/ 目录

`library/traits/` 目录当前不存在，需要创建。`kernel/src/world/world.ts` 的 Trait 加载链路已支持从此目录加载，只需创建目录和 Trait 文件。

### 0.3 工具 Trait 激活策略

核心工具 Trait（file_ops, file_search, shell_exec）使用 `when: always`，所有对象都能看到这些工具。

**为什么不做按对象的精细控制**：OOC 的哲学是"LLM 做判断，代码做记账"。sophia 不会调用 `editFile`，不是因为系统禁止她，而是因为她的 readme 写了"绝不修改代码"。对象的行为边界由身份（readme/bias）控制，不需要系统层面强制隔离。这与 Claude Code 的 advisory 安全模型一致。

Library Trait（git_ops, http_client）通过对象 `data.json` 中的 `_traits_ref` 字段引用：

```json
{
  "_traits_ref": ["git_ops", "http_client"],
  "_relations": []
}
```

`_traits_ref` 中列出的 trait 名称指向 `library/traits/{name}/`，加载时与对象自身 `traits/` 目录下的 trait 合并生效。加载优先级：kernel/traits/ → library/traits/（_traits_ref 引用的）→ stones/{name}/traits/（同名后者覆盖前者，与现有三层加载链路一致）。

这需要修改 `kernel/src/trait/loader.ts`，在加载对象 trait 时读取 `data.json._traits_ref`，将引用的 library trait 加入加载链路。

### 0.4 统一错误返回格式

所有工具 Trait 方法使用统一的返回信封：

```typescript
type ToolResult<T> = {
  ok: true;
  data: T;
} | {
  ok: false;
  error: string;
  context?: string;  // 帮助 LLM 修正的上下文信息
}
```

### 0.5 方法可见性控制

当前 `MethodRegistry.buildSandboxMethods()` 注入所有已注册方法，不区分 Trait 是否激活。需要增加过滤逻辑：只注入已激活 Trait 的方法到沙箱。

修改 `kernel/src/trait/registry.ts` 的 `buildSandboxMethods()`，接受 `activatedTraits: string[]` 参数，只注入这些 Trait 的方法。

---

## Phase 1：工具 Trait 生态建设

### 设计原则

1. **高层 API，不暴露底层** — LLM 调用 `editFile(path, old, new)` 而非自己写 `Bun.write()`
2. **控制信息密度**（ACI 哲学）— readFile 默认 200 行，grep 精简输出
3. **容错优先**（Aider 启示）— editFile 支持 flexible matching，容忍空白差异
4. **错误作为数据**（Goose 启示）— 失败返回 `{ ok: false, error }` 结构，不中断 ThinkLoop
5. **示例驱动**（OOC 决策原则 #5）— 每个 Trait readme 包含丰富的调用示例

### Trait 分层放置

```
kernel/traits/              ← Kernel 层（基础能力）
├── file_ops/               ← when: always（所有对象可用）
│   ├── readme.md           ← API 文档 + 使用示例
│   └── index.ts            ← 方法实现
├── file_search/            ← when: always
│   ├── readme.md
│   └── index.ts
└── shell_exec/             ← when: always
    ├── readme.md
    └── index.ts

library/traits/             ← Library 层（高级能力，按需引用）
├── git_ops/                ← 需要创建 library/traits/ 目录
│   ├── readme.md
│   └── index.ts
└── http_client/
    ├── readme.md
    └── index.ts
```

激活策略：
- Kernel 工具 Trait 用 `when: always` — 所有对象都能看到和调用
- 对象是否使用这些工具，由对象自身的 readme/bias 决定（advisory 控制）
- Library Trait 需要对象在自己的 `traits/` 目录中创建引用文件才能使用

### Trait 1: file_ops（文件操作）

**层级**：Kernel Trait（`kernel/traits/file_ops/`）

**方法定义**：

```typescript
/**
 * 读取文件内容
 * - 默认返回前 200 行（ACI: 控制信息密度）
 * - 支持行号范围读取
 * - 返回带行号的内容（方便后续 editFile 定位）
 */
readFile(path: string, options?: {
  offset?: number,    // 起始行号（从 1 开始）
  limit?: number,     // 读取行数（默认 200）
}): { content: string, totalLines: number, truncated: boolean }

/**
 * 精确编辑文件
 * - 主模式：search/replace（精确字符串匹配）
 * - 容错：忽略前后空白差异、自动处理缩进偏移
 * - 失败时返回上下文帮助 LLM 修正
 */
editFile(path: string, oldStr: string, newStr: string, options?: {
  replaceAll?: boolean,   // 替换所有匹配（默认 false）
  fuzzyWhitespace?: boolean,  // 容忍空白差异（默认 true）
}): { success: boolean, matchCount: number, error?: string, context?: string }

/**
 * 创建或覆写文件
 * - 自动创建父目录
 */
writeFile(path: string, content: string): { success: boolean, bytesWritten: number }

/**
 * 列出目录内容
 * - 返回结构化条目列表
 * - 默认不递归，不显示隐藏文件
 */
listDir(path: string, options?: {
  recursive?: boolean,
  includeHidden?: boolean,
  limit?: number,         // 最大条目数（默认 100）
}): { entries: Array<{ name: string, type: "file"|"dir", size: number }> }

/**
 * 检查路径是否存在
 */
fileExists(path: string): boolean

/**
 * 删除文件或目录
 */
deleteFile(path: string, options?: {
  recursive?: boolean,    // 递归删除目录（默认 false）
}): { success: boolean }
```

**路径解析规则**：
- 相对路径：相对于 `world_dir`（用户仓库根目录），与现有 `self_dir`、`world_dir` 等沙箱变量一致
- 绝对路径：直接使用
- 注意：不引入新的路径协议。对象访问自身目录使用沙箱变量 `self_dir`（如 `self_dir + "/files/report.md"`），跨对象引用使用 `world_dir + "/stones/{name}/..."`。这与现有 computable trait 的约定一致。

**editFile 容错机制**（参考 Aider 的 flexible patching，Phase 1 简化版）：

Phase 1 只实现前两级容错，避免过度复杂：
1. 先尝试精确匹配
2. 失败后尝试 trim 前后空白再匹配
3. 全部失败时返回 `{ ok: false, error: "未找到匹配", context: "...文件中最相似的片段..." }`
4. context 字段帮助 LLM 在下一轮修正

后续可根据实际使用中的失败模式，渐进增加缩进容错、行尾差异容错等。遵循"最小改动"原则。

### Trait 2: file_search（文件搜索）

**层级**：Kernel Trait（`kernel/traits/file_search/`）

**方法定义**：

```typescript
/**
 * 按模式匹配文件名
 * - 支持 glob 语法（**/*.ts, src/**/*.test.ts）
 * - 返回按修改时间排序的路径列表
 */
glob(pattern: string, options?: {
  basePath?: string,      // 搜索根目录（默认 world_dir）
  limit?: number,         // 最大返回数（默认 50）
  ignore?: string[],      // 忽略模式（默认忽略 node_modules, .git）
}): string[]

/**
 * 按内容搜索文件
 * - 支持正则表达式
 * - 返回精简格式（ACI: 控制信息密度）
 */
grep(pattern: string, options?: {
  path?: string,          // 搜索目录或文件（默认 world_dir）
  glob?: string,          // 文件名过滤（如 "*.ts"）
  context?: number,       // 上下文行数（默认 0）
  maxResults?: number,    // 最大结果数（默认 30）
  ignoreCase?: boolean,
}): Array<{ file: string, line: number, content: string, context?: string[] }>
```

**输出格式设计**（ACI 哲学）：

grep 返回精简格式，每条结果一行：
```
kernel/src/flow/thinkloop.ts:42: const result = await llm.invoke(context);
kernel/src/flow/thinkloop.ts:87: const result = await llm.invoke(newContext);
```

而非返回大段上下文。LLM 需要详细内容时用 `readFile` 定点读取。

### Trait 3: shell_exec（Shell 增强）

**层级**：Kernel Trait（`kernel/traits/shell_exec/`）

**方法定义**：

```typescript
/**
 * 执行 Shell 命令
 * - 增强版 [program/shell]，支持自定义超时和工作目录
 */
exec(command: string, options?: {
  cwd?: string,           // 工作目录（默认 world_dir）
  timeout?: number,       // 超时毫秒（默认 120000，最大 600000）
  env?: Record<string, string>,
}): { stdout: string, stderr: string, exitCode: number, timedOut: boolean }
```

**安全约束**：
- 默认工作目录为 `world_dir`
- 安全边界是 advisory 的（通过 Trait readme 警告 LLM），不做系统级沙箱（如 chroot）
- 这与 Claude Code 的模型一致：依赖 LLM 的判断 + 用户审批，而非技术强制隔离
- Trait readme 中明确列出危险命令示例（`rm -rf`、`sudo`、`git push --force`），引导 LLM 避免

### Trait 4: git_ops（Git 操作）

**层级**：Library Trait（`library/traits/git_ops/`）

**方法定义**：

```typescript
/**
 * 获取工作区状态
 */
gitStatus(): {
  staged: string[],
  unstaged: string[],
  untracked: string[],
  branch: string,
  ahead: number,
  behind: number,
}

/**
 * 查看差异
 */
gitDiff(options?: {
  staged?: boolean,
  file?: string,
  base?: string,          // 对比基准（如 "main"）
}): string

/**
 * 查看提交历史
 */
gitLog(options?: {
  limit?: number,         // 默认 10
  oneline?: boolean,      // 默认 true
  file?: string,
}): Array<{ hash: string, message: string, author: string, date: string }>

/**
 * 暂存文件
 */
gitAdd(files: string | string[]): { success: boolean }

/**
 * 创建提交
 */
gitCommit(message: string): { success: boolean, hash: string }

/**
 * 分支操作
 */
gitBranch(name: string, options?: { checkout?: boolean }): { success: boolean }
gitCheckout(branch: string): { success: boolean }

/**
 * 远程操作
 */
gitPush(options?: { force?: boolean, upstream?: string }): { success: boolean }
gitPull(options?: { rebase?: boolean }): { success: boolean }
```

### Trait 5: http_client（HTTP 客户端）

**层级**：Library Trait（`library/traits/http_client/`）

**方法定义**：

```typescript
/**
 * GET 请求
 */
httpGet(url: string, options?: {
  headers?: Record<string, string>,
  timeout?: number,       // 默认 30000
}): { status: number, headers: Record<string, string>, body: string }

/**
 * POST 请求
 */
httpPost(url: string, body: string | object, options?: {
  headers?: Record<string, string>,
  timeout?: number,
  contentType?: string,   // 默认 "application/json"
}): { status: number, headers: Record<string, string>, body: string }

/**
 * 通用请求
 */
httpRequest(method: string, url: string, options?: {
  headers?: Record<string, string>,
  body?: string | object,
  timeout?: number,
}): { status: number, headers: Record<string, string>, body: string }
```

### Stones 配置优化

**原则**：所有对象共享 Kernel 工具 Trait（always-on），但对象是否使用由 readme/bias 控制。Library Trait 通过 `data.json._traits_ref` 引用。

| Stone | `_traits_ref` | readme 行为指导 |
|-------|--------------|----------------|
| **supervisor** | `["git_ops", "http_client"]` | 增加"简单任务自己做"，增加工具使用示例 |
| **kernel** | `["git_ops"]` | 已有工程能力，增加结构化工具使用示例 |
| **iris** | `[]` | 增加前端文件操作示例 |
| **nexus** | `["http_client"]` | 增加扩展开发工具使用示例 |
| **sophia** | `[]` | 保持"绝不修改代码"的 bias，不需要改动 |
| **bruce** | `[]` | 保持"绝不修改任何代码"的 bias，可用 file_search 验证 |
| **debugger** | `[]` | 保持"只诊断不动手术"的 bias，可用 file_search 分析 |
| **user** | `[]` | 人类用户不经过 ThinkLoop，无需改动 |

Kernel 工具 Trait（file_ops, file_search, shell_exec）对所有对象可见，但 sophia/bruce/debugger 的 readme 已经明确了"不操作文件/代码"的行为边界，LLM 会自觉遵守。

**supervisor readme 修订要点**：
- 增加"简单任务自己做"的行为指导
- 增加工具使用示例（读文件、编辑代码、执行命令）
- 保留委派机制用于复杂的跨部门任务

---

## Phase 2：结构化工具调用协议

### 动机

Phase 1 的工具通过 `[program]` 中的函数调用使用：
```
[program]
const result = editFile("src/config.ts", "port: 3000", "port: 8080");
print(result);
```

这有几个问题：
1. LLM 可能写错函数名或参数
2. 无法在执行前做参数校验
3. 无法做细粒度权限控制
4. 无法统计工具使用频率

### 设计：`[action]` 输出格式

新增 `[action/工具名]` 段落，LLM 输出 JSON 参数（不用 YAML，因为代码内容常含冒号、缩进等 YAML 特殊字符）：

```
[thought]
我需要把配置文件中的端口从 3000 改成 8080。

[action/editFile]
{"path": "kernel/src/server/config.ts", "old": "port: 3000", "new": "port: 8080"}
```

**为什么用 JSON 而非 YAML**：editFile 的 `old`/`new` 参数经常包含代码片段，代码中的冒号、缩进、引号在 YAML 中需要复杂的转义。JSON 虽然略冗长，但解析确定性更高，LLM 也更熟悉 JSON 格式。

ThinkLoop 解析流程：
1. 识别 `[action/xxx]` 段落（新增 parser 状态，与 `[talk/xxx]` 类似的正则模式）
2. 从 MethodRegistry 查找 `xxx` 方法
3. `JSON.parse` 解析参数，校验必填字段
4. 执行方法，捕获结果（成功或错误都作为 action 记录）
5. 结果写入 actions 历史，下一轮 context 可见

**解析失败处理**：JSON 解析失败时，将错误信息作为 action output 返回给 LLM，不中断 ThinkLoop。

### 与 `[program]` 和 `[talk]` 的关系

- `[action]` 用于单步工具调用 — 可靠、可审计、可权限控制
- `[program]` 保留用于复杂逻辑 — 循环、条件、多步组合
- `[action]` 和 `[program]` 互斥（同一轮输出中不能同时使用）
- `[action]` 和 `[talk]` 可以共存（先调用工具，再把结果告诉别人）
- 同一轮输出中可以有多个 `[action]`，按顺序执行，任一失败不阻塞后续（错误记录到 output）

### MCP 协议对齐

Trait method 的定义可以映射为 MCP tool schema：

```typescript
// Trait method 定义
{
  name: "editFile",
  description: "精确编辑文件，替换指定字符串",
  params: {
    path: { type: "string", description: "文件路径" },
    old: { type: "string", description: "要替换的字符串" },
    new: { type: "string", description: "替换后的字符串" },
  },
  fn: async (ctx, { path, old, new: newStr }) => { ... }
}
```

映射为 MCP tool：
```json
{
  "name": "editFile",
  "description": "精确编辑文件，替换指定字符串",
  "inputSchema": {
    "type": "object",
    "properties": {
      "path": { "type": "string", "description": "文件路径" },
      "old": { "type": "string", "description": "要替换的字符串" },
      "new": { "type": "string", "description": "替换后的字符串" }
    },
    "required": ["path", "old", "new"]
  }
}
```

这意味着：
- OOC 对象可以调用内部 Trait method
- 也可以调用外部 MCP Server 提供的工具
- 统一的工具发现和调用协议

### 需要修改的文件

- `kernel/src/flow/thinkloop.ts` — 解析 `[action/xxx]` 段落
- `kernel/src/trait/registry.ts` — 提供工具列表和参数 schema
- `kernel/src/context/builder.ts` — 在 context 中注入可用工具列表
- `kernel/traits/computable/readme.md` — 文档更新，增加 `[action]` 格式说明

---

## Phase 3：内部思考机制优化

### 3.1 自动记忆管理

**现状**：对象需要主动调用 `updateMemory()` 维护记忆，大多数对象不会主动做。

**优化**：

不增加额外的 LLM 调用（成本太高），而是通过 hook 注入提示，让 LLM 在现有思考轮次中完成记忆整理：

```
[wait] 或 [finish] 触发 reflective trait 的 when_finish hook：
  → 注入提示："在结束前，回顾本次任务的关键发现，用 updateMemory() 更新会话记忆"
  → LLM 在下一轮（最后一轮）自行决定是否更新记忆
  → 不强制，不额外调用 LLM

任务完成（[finish]）时：
  → 自动向 ReflectFlow 发送 reflect 消息（代码层面，不需要 LLM 参与）
  → ReflectFlow 在后台异步执行，审视本次任务的 actions 历史
  → ReflectFlow 的 LLM 调用是独立的，不影响主 Flow 的延迟
```

这个设计遵循"LLM 做判断，代码做记账"原则 — 代码负责触发时机，LLM 负责判断什么值得记住。

### 3.2 认知栈自动化

**现状**：对象需要手动 `createPlan()` 创建认知栈，很多时候 LLM 不会主动规划。

**优化**：

在 `cognitive-style` Kernel Trait 的 bias 中增强引导：
- 当任务描述超过 N 个字符时，提示"这是一个复杂任务，建议先创建计划"
- 当对象连续 3 轮没有明显进展时，提示"考虑拆分当前任务"

这不是代码层面的自动化，而是通过 Trait bias 引导 LLM 行为 — 符合 OOC 的"LLM 做判断，代码做记账"原则。

### 3.3 经验沉淀闭环

**现状**：G12 机制存在但自动化程度低，ReflectFlow 需要手动触发。

**优化**：

```
任务完成（[finish]）时：
  → 自动向 ReflectFlow 发送 reflect 消息
  → ReflectFlow 分析本次任务：
    - 成功模式：哪些策略有效？
    - 失败模式：哪些错误重复出现？
    - 工具使用：哪些工具组合最常用？
  → 输出：
    - 更新 memory.md（知识层）
    - 建议创建/更新 Trait（能力层）
    - 标记高频模式为 always-on bias（直觉层）
```

### 3.4 Context 压缩优化

**现状**：基于 focus 的结构化遗忘 + autoSummarize。

**优化**（参考 OpenCode 的 compaction 机制）：

- 基于 token 计数触发压缩（而非固定轮次）
- 保留关键 actions（错误、决策点、工具调用结果）
- 压缩重复性操作（连续的 readFile 只保留最后一次）
- 压缩后保留 summary + 关键 artifacts

---

## 实施优先级

```
Phase 0（1 周）— 基础设施准备
├── MethodContext 扩展（rootDir, selfDir, stoneName）
├── library/traits/ 目录创建
├── loader.ts 增强（支持 data.json._traits_ref 引用 library trait）
├── MethodRegistry 方法可见性过滤（只注入已激活 Trait 的方法）
└── 统一错误返回类型 ToolResult<T>

Phase 1（3-4 周）— 工具 Trait 生态
├── Week 1-2: file_ops Trait（含 editFile 容错）+ file_search Trait + 单元测试
├── Week 3: shell_exec + git_ops + http_client Trait + 单元测试
└── Week 4: Stones 配置优化（readme 更新 + default_traits）+ 集成测试 + Bruce 体验验证

Phase 2（2-3 周）— 结构化调用协议
├── Week 5: parser 扩展（[action/xxx] 格式）+ MethodRegistry schema 导出
├── Week 6: computable readme 更新 + 集成测试
└── Week 7: MCP 协议对齐 + 外部 MCP Server 接入（可选，视需求）

Phase 3（2 周）— 内部思考优化
├── Week 8: 自动记忆管理（reflective hook）+ 认知栈引导优化
└── Week 9: 经验沉淀闭环（自动 reflect 触发）+ Context 压缩优化
```

---

## 验证标准

### Phase 1 验证场景

1. **文件编辑任务**：让 supervisor 修改 `kernel/src/server/config.ts` 中的端口号
   - 预期：supervisor 用 `readFile` 读取 → `editFile` 修改 → `readFile` 验证
   - 成功标准：一次成功，无需人工干预

2. **代码搜索任务**：让 supervisor 找到所有使用 `ThinkLoop` 的文件
   - 预期：supervisor 用 `grep("ThinkLoop", { glob: "*.ts" })` 搜索
   - 成功标准：返回完整的文件列表

3. **Git 工作流**：让 kernel 创建分支、修改代码、提交
   - 预期：`gitBranch` → `editFile` → `gitAdd` → `gitCommit`
   - 成功标准：git log 中可见新提交

4. **复合任务**：让 supervisor 完成"给 OOC 添加一个新的 Trait"
   - 预期：supervisor 自主规划（创建认知栈）→ 创建文件 → 编写代码 → 测试 → 提交
   - 成功标准：新 Trait 可用，测试通过

### Phase 2 验证场景

5. **结构化调用**：让对象用 `[action/editFile]` 格式编辑文件
   - 成功标准：参数校验通过，执行成功，结果可见

6. **MCP 集成**：接入一个外部 MCP Server（如 filesystem server）
   - 成功标准：对象可以发现并调用外部工具

### Phase 3 验证场景

7. **自动记忆**：完成一个任务后，检查 memory.md 是否自动更新
8. **经验沉淀**：重复执行类似任务，检查第二次是否比第一次更快

---

## 风险与缓解

| 风险 | 严重度 | 缓解措施 |
|------|--------|---------|
| LLM 不会正确调用新 Trait 方法 | HIGH | Trait readme 中提供丰富示例（决策原则 #5）；Phase 2 的 [action] 格式进一步降低出错率 |
| editFile 的 flexible matching 误匹配 | MEDIUM | 默认 replaceAll=false，多匹配时报错而非猜测；Phase 1 只实现两级容错 |
| [action] 格式增加 ThinkLoop 复杂度 | MEDIUM | 充分测试；[program] 作为 fallback 始终可用；JSON 解析失败不中断执行 |
| 自动记忆写入噪音信息 | LOW | 通过 hook 提示而非强制写入，LLM 自行判断；ReflectFlow 定期清理 |
| 工具能力让对象做出危险操作 | MEDIUM | Trait readme 明确警告；安全边界是 advisory 的（与 Claude Code 一致） |
| 方法注册全局可见导致未授权对象调用工具 | HIGH | Phase 0.5 实现方法可见性过滤，只注入已激活 Trait 的方法 |
| 文件操作无 undo 机制 | LOW | 依赖 git_ops 做版本控制恢复；editFile 返回 context 帮助手动修正 |

---

## Spec Review 记录

本 spec 经过自动化 review，以下问题已修复：

- **C1**（CRITICAL）：`when: conditional` 改为 `when: always`，行为边界由对象 readme/bias 控制（advisory），删除 `default_traits` 机制
- **C2**（CRITICAL）：明确 `library/traits/` 需要创建，列入 Phase 0
- **H1**（HIGH）：`[action]` 参数格式从 YAML 改为 JSON，明确与 `[talk]` 的共存规则
- **H2**（HIGH）：新增 Phase 0.5 方法可见性过滤
- **H3**（HIGH）：新增 Phase 0.1 MethodContext 扩展
- **M1**（MEDIUM）：移除 `self://` 协议，使用现有 `self_dir` 沙箱变量
- **M2**（MEDIUM）：editFile 容错简化为两级，遵循最小改动原则
- **M3**（MEDIUM）：自动记忆改为 hook 提示 + 异步 ReflectFlow，不增加额外 LLM 调用
- **M5**（MEDIUM）：`[action]` 参数格式从 YAML 改为 JSON
