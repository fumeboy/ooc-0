---
name: renderProcess 重新设计
description: 基于简化认知栈设计重新实现 renderProcess，以及修复 exec() 返回值问题
type: design
---

# renderProcess 重新设计文档

## 背景

根据 `/Users/bytedance/x/ooc/简化认知栈设计.txt`，需要重新实现 `renderProcess` 函数，同时修复 `exec()` 返回值问题。

### 发现的问题

1. **`exec()` 返回值问题**：当前返回 `{ ok: true, data: { stdout, stderr, exitCode } }` 对象，LLM 调用 `print(exec("command"))` 时输出 `[object Object]`，造成困惑。

2. **`renderProcess` 渲染问题**：当前渲染格式不清晰，LLM 不理解：
   - actions 和子节点的执行顺序
   - 结构化遗忘的边界（聚焦路径 vs 非聚焦路径）
   - 数据流（artifacts 如何传递）

---

## 一、exec() 返回值修复

### 当前实现

```typescript
// kernel/traits/shell_exec/index.ts
export async function exec(
  ctx: any,
  command: string,
  options?: ExecOptions,
): Promise<ToolResult<ExecResult>> {
  // 返回: { ok: true; data: { stdout, stderr, exitCode, timedOut } }
  // 或: { ok: false; error: string }
}
```

### 新设计

```typescript
// kernel/traits/shell_exec/index.ts
export async function exec(
  ctx: any,
  command: string,
  options?: ExecOptions,
): Promise<string> {
  // 成功时直接返回 stdout 字符串
  // 失败时抛出异常，异常消息包含 stderr 和 exitCode
}
```

### 使用示例

**修复前**：
```javascript
const result = await exec("ls -la");
print(result); // 输出: [object Object] ❌

// 需要这样才能获得 stdout（但 LLM 不知道）
print(result.data.stdout);
```

**修复后**：
```javascript
// 成功时
const output = await exec("ls -la");
print(output); // 输出: ls -la 的实际输出 ✓

// 失败时（抛出异常）
try {
  await exec("invalid-command");
} catch (e) {
  print(e.message); // 输出: 执行失败 (exit code: 127)\nstderr: ...
}
```

### 错误处理设计

创建自定义错误类型 `ExecError`：

```typescript
class ExecError extends Error {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly timedOut: boolean;

  constructor(message: string, info: ExecResult) {
    // 错误消息格式: "执行失败 (exit code: {exitCode})\nstderr:\n{stderr}"
    super(`执行失败 (exit code: ${info.exitCode})\nstderr:\n${info.stderr || "(无)"}`);
    this.stdout = info.stdout;
    this.stderr = info.stderr;
    this.exitCode = info.exitCode;
    this.timedOut = info.timedOut;
  }
}
```

### 文档更新

更新 `kernel/traits/shell_exec/readme.md`：

```markdown
### exec(command, options?)

执行一条 Shell 命令，**直接返回 stdout 字符串**。

```javascript
// 简单命令
const output = await exec("echo hello");
print(output); // 输出: "hello\n"

// 自定义工作目录
const result = await exec("ls -la", { cwd: "/tmp" });

// 带超时
const result = await exec("long-running-task", { timeout: 5000 });

// 带环境变量
const result = await exec("echo $MY_VAR", { env: { MY_VAR: "hello" } });
```

**错误处理**：

命令执行失败（非零 exitCode）时会抛出异常：

```javascript
try {
  await exec("invalid-command");
} catch (e) {
  print(e.message); // 包含 exitCode 和 stderr
}
```

---

## 二、renderProcess 重新设计

### 核心原则（来自简化认知栈设计.txt）

1. **一维列表展示**：不需要缩进，聚焦路径上的 actions 拼接为列表顺序渲染
2. **段落格式一致**：保持和 LLM Output 相同的段落格式（`[thought]`、`[program]`、`[program/shell]`、`[action]`、`[inject]`）
3. **增加信息**：时间戳、`[program]`/`[action]` 的结果展示
4. **[push] 段落**：展示子栈帧的开始
5. **[pop] 不展示**：pop 后节点被 summary 并折叠
6. **[sub_stack_frame] 段落**：完成 pop 的节点以此格式展示，包含输入/输出（summary 和 artifacts）

### 聚焦路径模型

```
聚焦路径（Focus Path）：从根帧到当前帧的完整路径
  ↑ 详细展示 actions

非聚焦路径：不在聚焦路径上的节点
  ↑ 不展示（结构化遗忘）
```

### 新的渲染格式

```
══════════════════════════════════════════════════════════
【认知栈】当前帧: 获取文档内容 [* doing]
══════════════════════════════════════════════════════════

【聚焦路径】（按时间顺序排列）

[00:00:00] [thought]
用户需要分析飞书 wiki 文档...

[00:00:01] [program]
activateTrait("lark-wiki")

>>> 执行结果: OK

[00:00:05] [program]
local.wikiToken = "UbpdwX..."
local.wikiUrl = "https://..."

>>> 执行结果: OK

[00:00:10] [push] 激活飞书能力
进入子栈帧: 激活飞书能力

[00:00:11] [thought]
准备激活 lark-wiki trait...

[00:00:14] [program]
activateTrait("lark-wiki")

>>> 执行结果: OK

[00:00:16] [program]
local.wikiToken = "UbpdwX..."

>>> 执行结果: OK

[sub_stack_frame] 激活飞书能力 [✓ done]
输入: (无)
输出 summary: 已激活 lark-wiki trait，从 URL 提取 wiki token
输出 artifacts: wikiToken, wikiUrl (已合并到父帧)

[00:00:18] [push] 获取文档内容 [* current]
进入子栈帧: 获取文档内容

[00:00:19] [thought]
先查看 lark-cli 帮助...

[00:00:22] [program]
exec("lark-cli docs +fetch --help")

>>> 执行结果: ❌ 失败
>>> 输出: [object Object]

[00:00:25] [thought]
困惑：返回值不对...

[00:00:28] [program]
exec("lark-cli docs +fetch --help")

>>> 执行结果: ❌ 失败
>>> 输出: [object Object]

[00:00:30] [thought]
困惑中...

[00:00:33] [program/shell]
lark-cli docs +fetch --help

>>> 执行结果: ✓ 成功
>>> 输出: Fetch Lark document content...

[00:00:35] [thought]
原来要用 [program/shell] 格式...

══════════════════════════════════════════════════════════
【当前状态】
══════════════════════════════════════════════════════════

当前帧: 获取文档内容 [* doing]
激活 traits: lark-wiki, lark-doc
可访问变量名: wikiToken, wikiUrl

输出契约:
  outputs: docContent, docTitle
  输出描述: 文档内容和标题
```

### 内联子节点的渲染

内联子节点（`before`/`after`/`reflect`）的特殊格式：

```
[inline/before] trait hook before

[00:00:19] [inject]
[系统提示 — before]
...

[00:00:20] [thought]
阅读系统提示...

[inline/before 结束]
  summary: 已处理 before hook

[00:00:21] [thought]
开始执行任务...
```

### 事件类型映射

| Action 类型 | 渲染格式 |
|------------|---------|
| `type: "thought"` | `[thought]\n{content}` |
| `type: "program"` | `[program]\n{content}\n\n>>> 执行结果: OK/失败\n>>> 输出: {stdout/stderr}` |
| `type: "inject"` | `[inject]\n{content}` |

### 时间戳格式

- 相对时间戳，从任务开始计算
- 格式: `[HH:MM:SS]` 或 `[MM:SS]`
- 或使用绝对时间戳 `[HH:MM:SS]`（系统时间）

### 数据流展示

1. **`[sub_stack_frame]` 段落**：
   - `输入:` 该帧的输入（如果有）
   - `输出 summary:` 该帧完成时的 summary
   - `输出 artifacts:` 该帧产出的 artifacts 及其去向

2. **【当前状态】区域**：
   - `可访问变量名:` 列出当前可访问的 local 变量名（不展示值）
   - `输出契约:` 展示当前帧的 outputs 和 outputDescription

---

## 三、实施计划

### 阶段 1：修复 exec() 返回值

**文件修改**：

1. `kernel/traits/shell_exec/index.ts`
   - 修改 `exec()` 函数返回类型为 `Promise<string>`
   - 失败时抛出 `ExecError` 异常

2. `kernel/traits/shell_exec/readme.md`
   - 更新使用示例
   - 添加错误处理说明

**测试**：
- 运行 `bun test tests/trait-shell-exec.test.ts`

### 阶段 2：重写 renderProcess

**文件修改**：

1. `kernel/src/process/render.ts`
   - 完全重写 `renderProcess()` 函数
   - 添加辅助函数：
     - `collectFocusPathEvents()`: 收集聚焦路径上的所有事件（actions + push/pop）
     - `formatEvent()`: 格式化单个事件
     - `formatSubStackFrame()`: 格式化 `[sub_stack_frame]` 段落

**测试**：
- 编写新的测试用例
- 运行 `bun test tests/process.test.ts`

### 阶段 3：更新文档

**文件修改**：

1. `kernel/traits/computable/readme.md`
   - 确认认知栈相关描述与新设计一致

### 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| `exec()` 返回值变更影响现有代码 | 中 | 检查现有 traits 中使用 exec() 的地方，确保兼容 |
| `renderProcess()` 重写可能引入 bug | 中 | 编写充分的测试用例，覆盖各种边界情况 |

---

## 四、文件修改清单

| 文件路径 | 修改类型 | 说明 |
|---------|---------|------|
| `kernel/traits/shell_exec/index.ts` | 重写 | 修改 exec() 返回值和错误处理 |
| `kernel/traits/shell_exec/readme.md` | 更新 | 更新使用示例 |
| `kernel/src/process/render.ts` | 重写 | 完全重写 renderProcess |
| `kernel/tests/process.test.ts` | 更新 | 添加新的测试用例 |

---

## 五、验证要点

1. **exec() 行为验证**：
   - 成功执行命令时返回 stdout 字符串
   - 失败执行命令时抛出包含 stderr 的异常
   - `print(exec("echo hello"))` 输出正确内容

2. **renderProcess 行为验证**：
   - 聚焦路径上的 events 按时间顺序排列
   - `[push]` 段落正确展示
   - `[sub_stack_frame]` 段落正确展示已完成的子栈帧
   - `[pop]` 不展示
   - 非聚焦路径不展示（结构化遗忘）
   - 【当前状态】区域只展示变量名，不展示值
