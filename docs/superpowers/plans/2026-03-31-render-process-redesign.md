# renderProcess 重新设计实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `exec()` 返回值问题，并完全重写 `renderProcess` 函数，使其符合简化认知栈设计

**Architecture:**
1. **Phase 1:** 修复 `exec()` 返回值（从返回对象改为直接返回 stdout 字符串，失败时抛出异常）
2. **Phase 2:** 完全重写 `renderProcess` 函数，采用一维列表展示
3. **Phase 3:** 更新文档和测试

**Tech Stack:** TypeScript, Bun

---

## 文件映射

| 文件路径 | 职责 |
|---------|------|
| `kernel/traits/shell_exec/index.ts` | Shell 命令执行（修改）|
| `kernel/traits/shell_exec/readme.md` | Shell 执行文档（修改）|
| `kernel/src/process/render.ts` | 行为树渲染（完全重写）|
| `kernel/tests/process.test.ts` | 行为树测试（修改/新增）|
| `kernel/tests/trait-shell-exec.test.ts` | Shell 执行测试（修改/新增）|

---

## Task 1: 修复 exec() 返回值 - 失败测试

**Files:**
- Modify: `kernel/tests/trait-shell-exec.test.ts`
- Test: `kernel/tests/trait-shell-exec.test.ts`

**当前状态检查：** 先查看现有测试结构

- [ ] **Step 1: 查看现有测试文件**

```typescript
// 读取现有测试文件
```

Run: `bun test kernel/tests/trait-shell-exec.test.ts --list`
Expected: 显示现有测试列表

- [ ] **Step 2: 为新行为编写失败测试**

在测试文件中添加新测试：

```typescript
// 测试 exec() 返回值应为字符串
test("exec() 成功时返回 stdout 字符串", async () => {
  // 模拟 exec() 调用
  const result = await exec("echo hello");
  expect(result).toBe("hello\n");
  expect(typeof result).toBe("string");
});

// 测试 exec() 失败时抛出异常
test("exec() 失败时抛出异常", async () => {
  let caughtError: Error | null = null;
  try {
    await exec("invalid-command-that-does-not-exist");
  } catch (e) {
    caughtError = e as Error;
  }
  expect(caughtError).not.toBeNull();
  expect(caughtError!.message).toContain("exit code");
  expect(caughtError!.message).toContain("stderr");
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `bun test kernel/tests/trait-shell-exec.test.ts`
Expected: 新测试失败（因为当前实现返回对象）

---

## Task 2: 实现 exec() 新行为

**Files:**
- Modify: `kernel/traits/shell_exec/index.ts`

- [ ] **Step 1: 查看当前实现**

```typescript
// 当前实现
export async function exec(
  ctx: any,
  command: string,
  options?: ExecOptions,
): Promise<ToolResult<ExecResult>> {
  // 返回: { ok: true; data: { stdout, stderr, exitCode, timedOut } }
}
```

- [ ] **Step 2: 定义 ExecError 类**

```typescript
/** Shell 执行错误 */
export class ExecError extends Error {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
  readonly timedOut: boolean;

  constructor(info: ExecResult) {
    const errorLines: string[] = [];
    errorLines.push(`执行失败 (exit code: ${info.exitCode})`);
    if (info.stderr) {
      errorLines.push(`stderr: ${info.stderr}`);
    }
    if (info.timedOut) {
      errorLines.push(`(执行超时)`);
    }
    super(errorLines.join("\n"));
    this.stdout = info.stdout;
    this.stderr = info.stderr;
    this.exitCode = info.exitCode;
    this.timedOut = info.timedOut;
  }
}
```

- [ ] **Step 3: 修改 exec() 函数返回类型**

```typescript
/**
 * 执行 Shell 命令
 * @param ctx - 执行上下文
 * @param command - Shell 命令
 * @param options - 可选参数
 * @returns 命令的 stdout 输出
 * @throws ExecError 当命令执行失败（非零 exitCode）时抛出
 */
export async function exec(
  ctx: any,
  command: string,
  options?: ExecOptions,
): Promise<string> {
  const cwd = options?.cwd ?? ctx.rootDir ?? process.cwd();
  const timeout = Math.min(options?.timeout ?? 120_000, 600_000);
  const env = options?.env
    ? { ...process.env, ...options.env }
    : process.env;

  try {
    const proc = Bun.spawn(["sh", "-c", command], {
      cwd,
      env,
      stdout: "pipe",
      stderr: "pipe",
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, timeout);

    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    clearTimeout(timer);

    const result: ExecResult = {
      stdout,
      stderr,
      exitCode,
      timedOut,
    };

    // 非零 exitCode 视为失败
    if (exitCode !== 0) {
      throw new ExecError(result);
    }

    // 成功时返回 stdout
    return stdout;
  } catch (err: any) {
    if (err instanceof ExecError) {
      throw err;
    }
    // 其他错误（如 spawn 失败）
    throw new ExecError({
      stdout: "",
      stderr: err?.message ?? String(err),
      exitCode: -1,
      timedOut: false,
    });
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test kernel/tests/trait-shell-exec.test.ts`
Expected: 所有测试通过

- [ ] **Step 5: 提交**

Run:
```bash
git add kernel/traits/shell_exec/index.ts kernel/tests/trait-shell-exec.test.ts
git commit -m "refactor: exec() 返回值改为字符串，失败时抛出异常"
```

---

## Task 3: 更新 shell_exec 文档

**Files:**
- Modify: `kernel/traits/shell_exec/readme.md`

- [ ] **Step 1: 查看当前文档内容**

Current content from earlier read:
```markdown
### exec(command, options?)

执行一条 Shell 命令，返回 stdout、stderr、exitCode 和超时标志。

- `command` — 要执行的 Shell 命令字符串
- `options.cwd` — 工作目录（默认为对象的 rootDir）
- `options.timeout` — 超时毫秒数（默认 120000，最大 600000）
- `options.env` — 额外环境变量

// 简单命令
const result = await exec("echo hello");
// result.data = { stdout: "hello\n", stderr: "", exitCode: 0, timedOut: false }
```

- [ ] **Step 2: 更新文档以反映新行为**

```markdown
### exec(command, options?)

执行一条 Shell 命令，**直接返回 stdout 字符串**。

- `command` — 要执行的 Shell 命令字符串
- `options.cwd` — 工作目录（默认为对象的 rootDir）
- `options.timeout` — 超时毫秒数（默认 120000，最大 600000）
- `options.env` — 额外环境变量

**返回值：**
- 成功时返回 stdout 字符串
- 失败时抛出异常，异常消息包含 exitCode 和 stderr

#### 简单命令

```javascript
// 成功时直接返回 stdout
const output = await exec("echo hello");
print(output); // 输出: "hello\n"

// 自定义工作目录
const result = await exec("ls -la", { cwd: "/tmp" });

// 带超时
const result = await exec("long-running-task", { timeout: 5000 });
```

#### 错误处理

命令执行失败（非零 exitCode）时会抛出异常：

```javascript
try {
  const output = await exec("invalid-command");
  print(output);
} catch (e) {
  print("执行失败:", e.message);
  // e.message 包含 exitCode 和 stderr
  // 还可以访问: e.stdout, e.stderr, e.exitCode, e.timedOut
}
```
```

- [ ] **Step 3: 提交**

Run:
```bash
git add kernel/traits/shell_exec/readme.md
git commit -m "docs: 更新 shell_exec 文档，反映新的返回值行为"
```

---

## Task 4: renderProcess 重写 - 理解当前实现

**Files:**
- Read: `kernel/src/process/render.ts`

- [ ] **Step 1: 完整读取当前实现**

```typescript
// 已在之前读取，主要内容:
// - renderProcess() 主函数
// - renderNode() 递归渲染节点
// - renderTodo() 渲染待办队列

// 当前渲染格式:
// [*] 节点标题 [traits: ...] ← focus
//   说明: ...
//   | action.type: ...
//     [✓] 子节点 1 (summary)
//     [ ] 子节点 2
```

- [ ] **Step 2: 查看相关类型定义**

需要理解：
- `ProcessNode` 结构
- `Action` 结构
- 时间戳如何存储

---

## Task 5: 设计新的 renderProcess 数据结构

**Files:**
- Design: 新的数据结构

- [ ] **Step 1: 定义事件类型**

```typescript
// 事件类型（用于构建时间线）
type TimelineEvent =
  | { type: "action"; action: Action; nodeId: string; nodeTitle: string }
  | { type: "push"; nodeId: string; nodeTitle: string }
  | { type: "pop"; nodeId: string; nodeTitle: string; summary?: string; artifacts?: Record<string, unknown> }
  | { type: "inline_start"; kind: "before" | "after" | "reflect" }
  | { type: "inline_end"; kind: "before" | "after" | "reflect"; summary?: string };

// 完成的子栈帧信息
interface CompletedStackFrame {
  nodeId: string;
  title: string;
  status: "done";
  summary?: string;
  outputs?: string[];
  artifacts?: Record<string, unknown>;
  input?: string; // 输入描述
}
```

- [ ] **Step 2: 确定如何收集聚焦路径上的事件**

需要遍历：
1. 从根节点到当前 focus 节点的路径（聚焦路径）
2. 收集路径上每个节点的 actions
3. 识别节点之间的 push/pop 边界

---

## Task 6: 实现辅助函数

**Files:**
- Modify: `kernel/src/process/render.ts`

- [ ] **Step 1: 添加获取聚焦路径函数**

```typescript
/**
 * 从根节点到 focus 节点的完整路径（聚焦路径）
 */
function getFocusPath(root: ProcessNode, focusId: string): ProcessNode[] {
  // 使用现有函数 getPathToNode
  return getPathToNode(root, focusId);
}
```

- [ ] **Step 2: 实现时间线事件收集函数**

```typescript
/**
 * 收集聚焦路径上的所有事件
 * 按时间戳排序
 */
function collectTimelineEvents(path: ProcessNode[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // 遍历路径上的每个节点
  for (let i = 0; i < path.length; i++) {
    const node = path[i]!;
    const prevNode = i > 0 ? path[i - 1] : null;

    // push 事件（除了根节点）
    if (i > 0 && prevNode) {
      events.push({
        type: "push",
        nodeId: node.id,
        nodeTitle: node.title,
      });
    }

    // 该节点的所有 actions
    for (const action of node.actions) {
      events.push({
        type: "action",
        action,
        nodeId: node.id,
        nodeTitle: node.title,
      });
    }

    // pop 事件（如果不是当前 focus 节点）
    // 注意：需要判断该节点是否已完成（status === "done"）
    // 如果是 done 状态，说明已经 pop
    if (node.status === "done" && i < path.length - 1) {
      events.push({
        type: "pop",
        nodeId: node.id,
        nodeTitle: node.title,
        summary: node.summary,
        artifacts: node.locals,
      });
    }
  }

  // 按时间戳排序
  // 注意：需要为 push/pop 事件分配合理的时间戳
  // push: 使用该节点第一个 action 的时间戳 - 1
  // pop: 使用该节点最后一个 action 的时间戳 + 1

  return sortEvents(events);
}
```

---

## Task 7: 实现事件格式化函数

**Files:**
- Modify: `kernel/src/process/render.ts`

- [ ] **Step 1: 实现事件格式化**

```typescript
/**
 * 格式化单个事件为字符串
 */
function formatEvent(event: TimelineEvent): string[] {
  const lines: string[] = [];

  switch (event.type) {
    case "push":
      lines.push(`[push] ${event.nodeTitle}`);
      lines.push(`进入子栈帧: ${event.nodeTitle}`);
      lines.push("");
      break;

    case "pop":
      lines.push(`[sub_stack_frame] ${event.nodeTitle} [✓ done]`);
      if (event.input) {
        lines.push(`输入: ${event.input}`);
      }
      if (event.summary) {
        lines.push(`输出 summary: ${event.summary}`);
      }
      if (event.artifacts && Object.keys(event.artifacts).length > 0) {
        const artifactKeys = Object.keys(event.artifacts).join(", ");
        lines.push(`输出 artifacts: ${artifactKeys} (已合并到父帧)`);
      }
      lines.push("");
      break;

    case "action":
      const ts = formatTimestamp(event.action.timestamp);
      const action = event.action;

      if (action.type === "thought") {
        lines.push(`[${ts}] [thought]`);
        lines.push(action.content);
        lines.push("");
      } else if (action.type === "program") {
        lines.push(`[${ts}] [program]`);
        lines.push(action.content);
        lines.push("");
        // 执行结果
        if (action.success) {
          lines.push(`>>> 执行结果: ✓ 成功`);
        } else {
          lines.push(`>>> 执行结果: ❌ 失败`);
        }
        // result 或 error
        if (action.result) {
          lines.push(`>>> 输出: ${action.result}`);
        }
        if (action.error) {
          lines.push(`>>> 错误: ${action.error}`);
        }
        lines.push("");
      } else if (action.type === "inject") {
        lines.push(`[${ts}] [inject]`);
        lines.push(action.content);
        lines.push("");
      } else if (action.type === "thought") {
        lines.push(`[${ts}] [thought]`);
        lines.push(action.content);
        lines.push("");
      }
      break;

    case "inline_start":
      lines.push(`[inline/${event.kind}] trait hook ${event.kind}`);
      lines.push("");
      break;

    case "inline_end":
      lines.push(`[inline/${event.kind} 结束]`);
      if (event.summary) {
        lines.push(`  summary: ${event.summary}`);
      }
      lines.push("");
      break;
  }

  return lines;
}

/**
 * 格式化时间戳为 HH:MM:SS
 */
function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}
```

---

## Task 8: 实现当前状态区域

**Files:**
- Modify: `kernel/src/process/render.ts`

- [ ] **Step 1: 实现当前状态格式化**

```typescript
/**
 * 格式化【当前状态】区域
 */
function formatCurrentStatus(node: ProcessNode, path: ProcessNode[]): string[] {
  const lines: string[] = [];

  // 分隔线
  lines.push("══════════════════════════════════════════════════════════");
  lines.push("【当前状态】");
  lines.push("══════════════════════════════════════════════════════════");
  lines.push("");

  // 当前帧信息
  lines.push(`当前帧: ${node.title} [${formatStatus(node.status)}]`);
  lines.push("");

  // 激活的 traits
  const allTraits = [
    ...(node.traits ?? []),
    ...(node.activatedTraits ?? []),
  ];
  if (allTraits.length > 0) {
    lines.push(`激活 traits: ${allTraits.join(", ")}`);
    lines.push("");
  }

  // 可访问变量名（收集聚焦路径上所有节点的 locals keys）
  const localKeys: Set<string> = new Set();
  for (const n of path) {
    if (n.locals) {
      for (const key of Object.keys(n.locals)) {
        localKeys.add(key);
      }
    }
  }
  if (localKeys.size > 0) {
    lines.push(`可访问变量名: ${Array.from(localKeys).join(", ")}`);
    lines.push("");
  }

  // 输出契约
  if (node.outputs && node.outputs.length > 0) {
    lines.push("输出契约:");
    lines.push(`  outputs: ${node.outputs.join(", ")}`);
    if (node.outputDescription) {
      lines.push(`  输出描述: ${node.outputDescription}`);
    }
    lines.push("");
  }

  return lines;
}

function formatStatus(status: string): string {
  switch (status) {
    case "doing": return "* doing";
    case "done": return "✓ done";
    case "todo": return "todo";
    default: return status;
  }
}
```

---

## Task 9: 组装完整的 renderProcess 函数

**Files:**
- Modify: `kernel/src/process/render.ts`

- [ ] **Step 1: 实现新的 renderProcess 函数**

```typescript
/**
 * 重新实现的 renderProcess（符合简化认知栈设计）
 *
 * 关键特性:
 * 1. 一维列表展示，不需要缩进
 * 2. 聚焦路径上的 actions 按时间顺序排列
 * 3. 保持与 LLM Output 相同的段落格式
 * 4. 增加时间戳、执行结果展示
 * 5. [push] 段落展示子栈帧开始
 * 6. [pop] 不展示，改用 [sub_stack_frame] 段落
 * 7. 【当前状态】只展示变量名，不展示值
 */
export function renderProcess(process: Process): string {
  if (!process.root) return "(无行为树)";

  const lines: string[] = [];

  // 头部：认知栈标题
  lines.push("══════════════════════════════════════════════════════════");
  const focusNode = findNode(process.root, process.focusId);
  if (focusNode) {
    lines.push(`【认知栈】当前帧: ${focusNode.title} [${formatStatus(focusNode.status)}]`);
  }
  lines.push("══════════════════════════════════════════════════════════");
  lines.push("");

  // 聚焦路径
  lines.push("【聚焦路径】（按时间顺序排列）");
  lines.push("");

  // 获取聚焦路径
  const focusPath = getPathToNode(process.root, process.focusId);

  // 收集并格式化事件
  const events = collectTimelineEvents(focusPath);
  for (const event of events) {
    const eventLines = formatEvent(event);
    lines.push(...eventLines);
  }

  // 当前状态区域
  if (focusNode) {
    const statusLines = formatCurrentStatus(focusNode, focusPath);
    lines.push(...statusLines);
  }

  return lines.join("\n");
}
```

---

## Task 10: 编写 renderProcess 测试

**Files:**
- Modify: `kernel/tests/process.test.ts`

- [ ] **Step 1: 添加新的测试用例**

```typescript
// 测试新的 renderProcess 格式
test("renderProcess 按时间顺序排列 events", () => {
  // 创建一个简单的行为树
  const process = createProcess("测试任务");

  // TODO: 添加测试逻辑

  // 渲染
  const result = renderProcess(process);

  // 验证格式
  expect(result).toContain("【认知栈】");
  expect(result).toContain("【聚焦路径】");
  expect(result).toContain("【当前状态】");
});
```

- [ ] **Step 2: 运行所有测试**

Run: `bun test kernel/tests/process.test.ts`
Expected: 所有测试通过

---

## Task 11: 更新 computable trait 文档

**Files:**
- Check: `kernel/traits/computable/readme.md`

- [ ] **Step 1: 检查是否需要更新**

由于 renderProcess 的变化可能影响认知栈相关描述，需要检查 computable trait 文档是否需要更新。

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| renderProcess 重写可能破坏现有 UI | 中 | 运行所有测试，特别是关注 FlowView 和 MessageSidebar |
| exec() 返回值变更影响现有代码 | 中 | 检查所有使用 exec() 的 traits |
| 时间戳格式化问题 | 低 | 确保时间戳转换正确 |

---

## 执行选项

Plan complete and saved to `docs/superpowers/plans/2026-03-31-render-process-redesign.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?

**If Subagent-Driven chosen:**
- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development
- Fresh subagent per task + two-stage review

**If Inline Execution chosen:**
- **REQUIRED SUB-SKILL:** Use superpowers:executing-plans
- Batch execution with checkpoints for review
