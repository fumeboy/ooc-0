# Flow 结构化重构实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 OOC Flow 运行时，引入多线程 Process Tree、栈帧语义 API、Hook 扩展、Supervisor 特权、对象自渲染 UI。

**Architecture:** 在现有 Process Tree 基础上，将单 focusId 升级为多命名线程（threads），每个线程独立推进 focus。新增 compress/throw/catch/signal/create_hook 操作。Supervisor 作为特权 stone 获得全局可见性。对象通过 `shared/ui/index.tsx` 自渲染 React 组件。

**Tech Stack:** TypeScript, Bun, React, Vite

**Spec:** `docs/superpowers/specs/2026-03-23-flow-restructure-design.md`

---

## File Structure

### Phase 0 — 文档
- Modify: `docs/哲学文档/meta.md` — 补充多线程、栈帧语义、hook 扩展、supervisor、自渲染 UI 概念

### Phase 1 — 栈帧语义 + Hook + compress
- Modify: `src/types/process.ts` — 新增 FrameHook, HookTime, HookType 类型，ProcessNode 增加 hooks 字段
- Modify: `src/process/tree.ts` — 新增 compressActions, 重命名导出别名
- Modify: `src/process/focus.ts` — yield 被动触发 when_yield hooks
- Modify: `src/process/cognitive-stack.ts` — 新增 frame hook 收集逻辑（when_stack_push/pop/yield/error）
- Modify: `src/process/render.ts` — 渲染 hooks 信息
- Modify: `src/process/index.ts` — 导出新函数
- Modify: `src/flow/thinkloop.ts` — 注入新 API（add_stack_frame, return, compress, throw, catch, summary, create_hook）
- Modify: `tests/process.test.ts` — 新增 hook、compress、throw/catch 测试

### Phase 2 — 多线程 Process Tree
- Modify: `src/types/process.ts` — 新增 ThreadState, Signal 类型，Process 增加 threads 字段
- Modify: `src/process/tree.ts` — createProcess 初始化双线程
- Modify: `src/process/focus.ts` — 多线程 focus 管理
- Modify: `src/process/cognitive-stack.ts` — 多线程 scope chain
- Modify: `src/process/render.ts` — 多线程渲染
- Modify: `src/flow/flow.ts` — recordAction 支持多线程 focus
- Modify: `src/flow/thinkloop.ts` — 注入 signal/ack_signal，多线程 context 构建
- Modify: `src/context/builder.ts` — 多线程 context 策略
- Modify: `tests/process.test.ts` — 多线程测试

### Phase 3 — Supervisor 特权
- Modify: `src/context/builder.ts` — _session_overview window 注入
- Modify: `src/server/server.ts` — 消息路由经过 supervisor
- Create: `.ooc/stones/supervisor/readme.md` — supervisor stone 定义（如不存在）

### Phase 4 — 对象自渲染 UI
- Create: `.ooc/web/src/features/DynamicStoneUI.tsx` — 动态加载 stone 的 ui/index.tsx
- Modify: `.ooc/web/src/features/ViewRouter.tsx` — 集成自渲染 UI 检测
- Create: `.ooc/web/src/types/stone-ui.ts` — StoneUIProps 类型定义

---

## Chunk 1: Phase 0 — meta.md 哲学文档补充

### Task 1: 补充 meta.md 认知子树 — 多线程与栈帧语义

**Files:**
- Modify: `docs/哲学文档/meta.md`

- [ ] **Step 1: 读取当前 meta.md 完整内容**

确认认知子树的位置和现有结构。

- [ ] **Step 2: 在认知子树中补充多线程 Process Tree 概念**

在 `认知 → ThinkLoop` 或 `行动 → 行为树` 相关位置补充：

```markdown
│       ├── 多线程（Thread）
│       │       Process Tree 支持多个命名的 focus cursor（线程）。
│       │       每个线程独立推进自己的执行栈。
│       │       默认两个线程：frontend（对外沟通）、backend（内部工作）。
│       │       线程间通过 signal 通信，signal 需要 ack + memo 确认。
│       │
│       ├── 栈帧语义
│       │       每个 ProcessNode = 一个栈帧。
│       │       操作：add_stack_frame（压栈）、return（弹栈）、go（跳转）、
│       │       throw/catch（异常）、compress（折叠）、summary（总结）。
│       │       yield 是被动事件：focus 离开 doing 节点时自动触发。
│       │       defer = create_hook("when_stack_pop", handler)。
```

- [ ] **Step 3: 补充 Hook 时机扩展**

```markdown
│       └── Hook 时机
│               when_stack_push — 新栈帧创建时
│               when_stack_pop — 栈帧 return 时（defer 统一为此）
│               when_yield — focus 离开 doing 节点时（被动）
│               when_error — throw 冒泡到当前帧时
│               Hook 类型：inject_message, create_todo
```

- [ ] **Step 4: 补充 Supervisor 角色定义**

在结构或行动子树中补充：

```markdown
├── Supervisor（全局代理）
│       Supervisor 是一个 stone，但拥有系统级特权：
│       1. 用户消息默认路由到 supervisor
│       2. 可访问 session 中所有 sub-flow 的状态（_session_overview）
│       3. 其他对象的 flow 事件自动通知 supervisor
│       Supervisor 通过自渲染 UI 展示任务看板。
```

- [ ] **Step 5: 补充 G11 自渲染 UI 工程路径**

在表达子树中补充：

```markdown
│   └── 自渲染（G11 实现）
│           对象在 shared/ui/index.tsx 中编写 React 组件。
│           前端通过 Vite 原生 import 加载，自动热更新。
│           无 ui/index.tsx 的对象使用通用视图。
```

- [ ] **Step 6: Commit**

```bash
git add docs/哲学文档/meta.md
git commit -m "docs: meta.md 补充多线程、栈帧语义、hook 扩展、supervisor、自渲染 UI 概念"
```

---

## Chunk 2: Phase 1 — 栈帧语义 API + Hook 扩展 + compress

### Task 2: 类型定义 — FrameHook, HookTime, HookType

**Files:**
- Modify: `src/types/process.ts`

- [ ] **Step 1: 写测试 — FrameHook 类型结构**

在 `tests/process.test.ts` 末尾添加：

```typescript
import type { FrameHook, HookTime, HookType } from "../src/types/process.js";

describe("FrameHook types", () => {
  test("FrameHook 结构正确", () => {
    const hook: FrameHook = {
      id: "hook_1",
      when: "when_stack_pop",
      type: "inject_message",
      handler: "请确认所有子任务已完成",
    };
    expect(hook.when).toBe("when_stack_pop");
    expect(hook.type).toBe("inject_message");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/process.test.ts`
Expected: FAIL — FrameHook 类型不存在

- [ ] **Step 3: 在 src/types/process.ts 中添加类型**

在文件末尾（Process 接口之后）添加：

```typescript
/** Hook 触发时机 */
export type HookTime = "when_stack_push" | "when_stack_pop" | "when_yield" | "when_error";

/** Hook 类型 */
export type HookType = "inject_message" | "create_todo";

/** 栈帧级 Hook（运行时注册） */
export interface FrameHook {
  /** Hook 唯一 ID */
  id: string;
  /** 触发时机 */
  when: HookTime;
  /** Hook 类型 */
  type: HookType;
  /** 处理器描述文本 */
  handler: string;
}
```

在 ProcessNode 接口中添加 hooks 字段：

```typescript
  /** 栈帧级 hooks（运行时注册，create_hook 添加） */
  hooks?: FrameHook[];
```

- [ ] **Step 4: 确保 types/index.ts 导出新类型**

检查 `src/types/index.ts` 是否 re-export process.ts 的所有类型。如果是 `export * from "./process.js"` 则无需修改。

- [ ] **Step 5: 运行测试确认通过**

Run: `bun test tests/process.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/types/process.ts tests/process.test.ts
git commit -m "feat: 新增 FrameHook, HookTime, HookType 类型定义"
```

### Task 3: tree.ts — compressActions + 初始 hooks 注册

**Files:**
- Modify: `src/process/tree.ts`
- Modify: `src/process/index.ts`

- [ ] **Step 1: 写测试 — compressActions**

在 `tests/process.test.ts` 添加：

```typescript
import { compressActions } from "../src/process/tree.js";

describe("compressActions", () => {
  test("将指定 actions 移到新子节点", () => {
    const p = createProcess("任务");
    appendAction(p, p.root.id, { type: "thought", content: "思考1" });
    appendAction(p, p.root.id, { type: "thought", content: "思考2" });
    appendAction(p, p.root.id, { type: "program", content: "code1", success: true, result: "ok" });
    appendAction(p, p.root.id, { type: "thought", content: "思考3" });

    const actionIds = [p.root.actions[0]!.id, p.root.actions[1]!.id];
    const childId = compressActions(p, p.root.id, actionIds);

    expect(childId).not.toBeNull();
    expect(p.root.actions.length).toBe(2);
    const child = findNode(p.root, childId!);
    expect(child!.actions.length).toBe(2);
    expect(child!.status).toBe("done");
    expect(child!.summary).toBeTruthy();
  });

  test("不能 compress 不存在的 actionIds", () => {
    const p = createProcess("任务");
    appendAction(p, p.root.id, { type: "thought", content: "思考1" });
    const childId = compressActions(p, p.root.id, ["nonexistent"]);
    expect(childId).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/process.test.ts`
Expected: FAIL — compressActions 不存在

- [ ] **Step 3: 实现 compressActions**

在 `src/process/tree.ts` 中添加：

```typescript
/**
 * 压缩指定 actions 到新子节点
 *
 * @param process - 行为树
 * @param nodeId - 当前节点 ID
 * @param actionIds - 要压缩的 action ID 列表
 * @returns 新子节点 ID，失败返回 null
 */
export function compressActions(
  process: Process,
  nodeId: string,
  actionIds: string[],
): string | null {
  const node = findNode(process.root, nodeId);
  if (!node) return null;

  const actionMap = new Map(node.actions.map(a => [a.id, a]));
  const toMove: Action[] = [];
  for (const id of actionIds) {
    const action = actionMap.get(id);
    if (!action) return null;
    toMove.push(action);
  }

  const brief = toMove.slice(0, 2).map(a => a.content.slice(0, 20)).join(", ");
  const childId = addNode(process, nodeId, `[compressed] ${brief}`);
  if (!childId) return null;

  const child = findNode(process.root, childId)!;
  child.actions = toMove;
  child.hooks = []; // 归档节点不需要 hooks
  node.actions = node.actions.filter(a => !actionIds.includes(a.id));

  const summaryParts = toMove.slice(0, 3).map(a => {
    if (a.type === "thought") return a.content.slice(0, 40);
    if (a.type === "program") return a.success ? "程序成功" : "程序失败";
    return a.type;
  });
  child.summary = summaryParts.join("; ").slice(0, 120);
  child.status = "done";

  return childId;
}
```

- [ ] **Step 4: 在 addNode 中注册初始 hooks**

修改 `addNode` 函数，在创建新节点时自动注册初始 hooks。添加 `generateHookId` 辅助函数和 `FrameHook` import。在 `newNode` 定义中添加 `hooks: initialHooks`。

```typescript
function generateHookId(): string {
  return `hook_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// 在 addNode 中，newNode 创建前：
const initialHooks: FrameHook[] = [
  { id: generateHookId(), when: "when_stack_pop", type: "inject_message", handler: "summary" },
  { id: generateHookId(), when: "when_yield", type: "inject_message", handler: "summary" },
  { id: generateHookId(), when: "when_yield", type: "inject_message", handler: "declare_running_processes" },
];
// newNode 中添加: hooks: initialHooks,
```

- [ ] **Step 5: 导出 compressActions**

在 `src/process/index.ts` 的 tree.js 导出中添加 `compressActions`。

- [ ] **Step 6: 运行测试确认通过**

Run: `bun test tests/process.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/process/tree.ts src/process/index.ts tests/process.test.ts
git commit -m "feat: compressActions 操作 + 栈帧初始 hooks 注册"
```

### Task 4: tree.ts — createFrameHook 运行时注册

**Files:**
- Modify: `src/process/tree.ts`
- Modify: `src/process/index.ts`

- [ ] **Step 1: 写测试 — createFrameHook**

```typescript
import { createFrameHook } from "../src/process/tree.js";

describe("createFrameHook", () => {
  test("在指定节点注册 hook", () => {
    const p = createProcess("任务");
    const ok = createFrameHook(p, p.root.id, "when_stack_pop", "inject_message", "请确认子任务完成");
    expect(ok).toBe(true);
    expect(p.root.hooks!.length).toBe(4); // 3 initial + 1 new
    expect(p.root.hooks![3]!.handler).toBe("请确认子任务完成");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/process.test.ts`
Expected: FAIL

- [ ] **Step 3: 实现 createFrameHook**

```typescript
export function createFrameHook(
  process: Process,
  nodeId: string,
  when: HookTime,
  type: HookType,
  handler: string,
): boolean {
  const node = findNode(process.root, nodeId);
  if (!node) return false;
  if (!node.hooks) node.hooks = [];
  node.hooks.push({ id: generateHookId(), when, type, handler });
  return true;
}
```

- [ ] **Step 4: 导出并运行测试**

Run: `bun test tests/process.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/process/tree.ts src/process/index.ts tests/process.test.ts
git commit -m "feat: createFrameHook 运行时 hook 注册"
```

### Task 5: cognitive-stack.ts — collectFrameNodeHooks

**Files:**
- Modify: `src/process/cognitive-stack.ts`
- Modify: `src/process/index.ts`

- [ ] **Step 1: 写测试 — collectFrameNodeHooks**

```typescript
import { collectFrameNodeHooks } from "../src/process/cognitive-stack.js";

describe("collectFrameNodeHooks", () => {
  test("收集 when_yield hooks (FIFO)", () => {
    const p = createProcess("任务");
    const hooks = collectFrameNodeHooks(p.root, "when_yield");
    expect(hooks.length).toBe(2);
  });

  test("收集 when_stack_pop hooks (LIFO)", () => {
    const p = createProcess("任务");
    createFrameHook(p, p.root.id, "when_stack_pop", "inject_message", "自定义 defer");
    const hooks = collectFrameNodeHooks(p.root, "when_stack_pop");
    expect(hooks.length).toBe(2);
    expect(hooks[0]!.handler).toBe("自定义 defer"); // LIFO: 后注册先执行
  });
});
```

- [ ] **Step 2: 实现 collectFrameNodeHooks**

```typescript
import type { ProcessNode, FrameHook, HookTime } from "../types/index.js";

export function collectFrameNodeHooks(node: ProcessNode, when: HookTime): FrameHook[] {
  if (!node.hooks) return [];
  const matched = node.hooks.filter(h => h.when === when);
  return when === "when_stack_pop" ? [...matched].reverse() : matched;
}
```

- [ ] **Step 3: 导出并运行测试**

Run: `bun test tests/process.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/process/cognitive-stack.ts src/process/index.ts tests/process.test.ts
git commit -m "feat: collectFrameNodeHooks 栈帧级 hook 收集"
```

### Task 6: focus.ts — moveFocus/advanceFocus 返回 yield 信息

**Files:**
- Modify: `src/process/focus.ts`
- Modify: `src/flow/thinkloop.ts` (调用方更新)

- [ ] **Step 1: 写测试 — moveFocus 返回 yield 信息**

```typescript
describe("moveFocus yield", () => {
  test("离开 doing 节点返回 yieldedNodeId", () => {
    const p = createProcess("任务");
    const childId = addNode(p, p.root.id, "子任务")!;
    const result = moveFocus(p, childId);
    expect(result.success).toBe(true);
    expect(result.yieldedNodeId).toBe(p.root.id);
  });

  test("移到同一节点不触发 yield", () => {
    const p = createProcess("任务");
    const result = moveFocus(p, p.root.id);
    expect(result.success).toBe(true);
    expect(result.yieldedNodeId).toBeUndefined();
  });
});
```

- [ ] **Step 2: 修改 moveFocus 返回类型**

将 `moveFocus` 返回值从 `boolean` 改为 `MoveFocusResult`：

```typescript
export interface MoveFocusResult {
  success: boolean;
  yieldedNodeId?: string;
}

export function moveFocus(process: Process, targetId: string): MoveFocusResult {
  const node = findNode(process.root, targetId);
  if (!node) return { success: false };

  let yieldedNodeId: string | undefined;
  const oldNode = findNode(process.root, process.focusId);
  if (oldNode && oldNode.id !== targetId && oldNode.status === "doing") {
    if (!oldNode.summary) oldNode.summary = autoSummarize(oldNode);
    yieldedNodeId = oldNode.id;
  }

  process.focusId = targetId;
  if (node.status === "todo") node.status = "doing";
  return { success: true, yieldedNodeId };
}
```

- [ ] **Step 3: 修改 advanceFocus 返回类型**

```typescript
export interface AdvanceFocusResult {
  focusId: string | null;
  yieldedNodeId?: string;
}
```

在 advanceFocus 中，当离开 doing 节点时记录 yieldedNodeId。

- [ ] **Step 4: 更新 thinkloop.ts 调用方**

搜索 thinkloop.ts 中所有 `moveProcessFocus` 和 `advanceFocus` 调用，更新为解构返回值。

- [ ] **Step 5: 更新现有测试**

现有 `moveFocus` 测试期望返回 `boolean`，需要更新为 `result.success`。

- [ ] **Step 6: 运行全部测试**

Run: `bun test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/process/focus.ts src/flow/thinkloop.ts tests/process.test.ts
git commit -m "feat: moveFocus/advanceFocus 返回 yield 信息"
```

### Task 7: thinkloop.ts — 注入栈帧语义 API

**Files:**
- Modify: `src/flow/thinkloop.ts`

**API 重命名策略：** 旧 API 名（`create_plan_node`, `finish_plan_node`, `moveFocus`）保留不删除，新 API 名（`add_stack_frame`, `return`, `go`）作为新增注册。两套名字指向同一实现。这样现有 Flow 的 LLM 输出不会 break。未来逐步在 trait readme 中引导 LLM 使用新名字。

- [ ] **Step 1: 添加 add_stack_frame 别名**

在认知栈 API 区域，复制 `create_plan_node` 的注册，改名为 `add_stack_frame`（同一个 fn）。保留原 `create_plan_node` 不删除。

- [ ] **Step 2: 添加 return API（含 when_stack_pop hook 执行）**

```typescript
{
  name: "return",
  fn: (summary?: string) => {
    const process = flow.process;
    if (!process) return false;
    const focusNode = getFocusNode(process);
    if (!focusNode) return false;

    // 执行 when_stack_pop hooks (LIFO)
    const hooks = collectFrameNodeHooks(focusNode, "when_stack_pop");
    for (const hook of hooks) {
      try {
        if (hook.type === "inject_message") {
          flow.recordAction({ type: "inject", content: `[when_stack_pop] ${hook.handler}` });
        } else if (hook.type === "create_todo") {
          addProcessTodo(process, focusNode.id, hook.handler, "manual");
        }
      } catch (e) {
        // Hook 失败不阻塞主流程，记录错误
        flow.recordAction({ type: "inject", content: `[hook_error] ${hook.id}: ${String(e)}` });
      }
    }

    const ok = completeProcessNode(process, process.focusId, summary ?? "");
    if (ok) {
      advanceFocus(process);
      flow.setProcess({ ...process });
    }
    return ok;
  },
  effect: (args, result) => `return("${args[0] ?? ""}") → ${result ? "OK" : "失败"}`,
},
```

保留原 `finish_plan_node` 不删除。

- [ ] **Step 3: 添加 go API（含 when_yield hook 执行）**

```typescript
{
  name: "go",
  fn: (nodeId: string) => {
    const process = flow.process;
    if (!process) return false;
    const result = moveProcessFocus(process, nodeId);
    if (result.success && result.yieldedNodeId) {
      const yieldedNode = findNode(process.root, result.yieldedNodeId);
      if (yieldedNode) {
        const hooks = collectFrameNodeHooks(yieldedNode, "when_yield");
        for (const hook of hooks) {
          try {
            if (hook.type === "inject_message") {
              flow.recordAction({ type: "inject", content: `[when_yield] ${hook.handler}` });
            } else if (hook.type === "create_todo") {
              addProcessTodo(process, yieldedNode.id, hook.handler, "manual");
            }
          } catch (e) {
            flow.recordAction({ type: "inject", content: `[hook_error] ${hook.id}: ${String(e)}` });
          }
        }
      }
    }
    flow.setProcess({ ...process });
    return result.success;
  },
  effect: (args, result) => `go("${args[0]}") → ${result ? "OK" : "失败"}`,
},
```

保留原 `moveFocus` 不删除。

- [ ] **Step 4: 添加 throw API（异常冒泡 + when_error hook）**

```typescript
{
  name: "throw",
  fn: (error: string) => {
    const process = flow.process;
    if (!process) return false;
    const focusNode = getFocusNode(process);
    if (!focusNode) return false;

    // 标记当前节点失败
    focusNode.status = "done";
    focusNode.summary = `[ERROR] ${error}`;

    // 向上冒泡：逐层查找 when_error hook
    let current = focusNode;
    let caught = false;
    while (true) {
      const parent = getParentNode(process.root, current.id);
      if (!parent) break; // 到达根节点，未被 catch

      const errorHooks = collectFrameNodeHooks(parent, "when_error");
      if (errorHooks.length > 0) {
        // 有 catch handler，执行并停止冒泡
        for (const hook of errorHooks) {
          try {
            if (hook.type === "inject_message") {
              flow.recordAction({ type: "inject", content: `[when_error caught] ${hook.handler}: ${error}` });
            } else if (hook.type === "create_todo") {
              addProcessTodo(process, parent.id, `[ERROR] ${hook.handler}: ${error}`, "manual");
            }
          } catch (e) {
            flow.recordAction({ type: "inject", content: `[hook_error] ${hook.id}: ${String(e)}` });
          }
        }
        // focus 移到 catch 所在的父节点
        process.focusId = parent.id;
        caught = true;
        break;
      }

      // 无 handler，标记父节点异常摘要，继续冒泡
      if (!parent.summary) {
        parent.summary = `[ERROR propagated] ${error}`;
      }
      current = parent;
    }

    if (!caught) {
      // 未被 catch，记录到根节点
      flow.recordAction({ type: "inject", content: `[uncaught_error] ${error}` });
      process.focusId = process.root.id;
    }

    flow.setProcess({ ...process });
    return true;
  },
  effect: (args) => `throw("${args[0]}")`,
},
```

- [ ] **Step 5: 添加 catch API（注册 when_error hook）**

```typescript
{
  name: "catch",
  fn: (handler: string) => {
    const process = flow.process;
    if (!process) return false;
    return createFrameHook(process, process.focusId, "when_error", "inject_message", handler);
  },
  effect: (args) => `catch("${args[0]}")`,
},
```

- [ ] **Step 6: 添加 compress, summary, create_hook API**

```typescript
{
  name: "compress",
  fn: (actionIds: string[]) => {
    const process = flow.process;
    if (!process) return null;
    const childId = compressActions(process, process.focusId, actionIds);
    if (childId) flow.setProcess({ ...process });
    return childId;
  },
  effect: (args, result) => `compress(${(args[0] as string[]).length} actions) → ${result ?? "失败"}`,
},
{
  name: "summary",
  fn: (text: string) => {
    const process = flow.process;
    if (!process) return false;
    const focusNode = getFocusNode(process);
    if (!focusNode) return false;
    focusNode.summary = text;
    flow.setProcess({ ...process });
    return true;
  },
  effect: (args) => `summary("${(args[0] as string).slice(0, 40)}...")`,
},
{
  name: "create_hook",
  fn: (when: string, type: string, handler: string) => {
    const process = flow.process;
    if (!process) return false;
    return createFrameHook(process, process.focusId, when as HookTime, type as HookType, handler);
  },
  effect: (args) => `create_hook("${args[0]}", "${args[1]}", "${(args[2] as string).slice(0, 30)}")`,
},
```

- [ ] **Step 7: 更新 imports**

添加 `compressActions`, `createFrameHook`, `collectFrameNodeHooks` 到 thinkloop.ts 的 import from `"../process/index.js"`。添加 `HookTime`, `HookType` 到 types import。

- [ ] **Step 8: 运行全部测试**

Run: `bun test`
Expected: PASS（旧 API 名保留，不 break 现有代码）

- [ ] **Step 9: Commit**

```bash
git add src/flow/thinkloop.ts
git commit -m "feat: 注入栈帧语义 API (return, go, compress, throw, catch, summary, create_hook)"
```

---

## Chunk 3: Phase 2 — 多线程 Process Tree

### Task 8: 类型定义 — ThreadState, Signal

**Files:**
- Modify: `src/types/process.ts`

- [ ] **Step 1: 写测试 — ThreadState 和 Signal 类型**

在 `tests/process.test.ts` 添加：

```typescript
import type { ThreadState, Signal } from "../src/types/process.js";

describe("ThreadState types", () => {
  test("ThreadState 结构正确", () => {
    const thread: ThreadState = {
      name: "backend",
      focusId: "node_1",
      status: "running",
      signals: [],
    };
    expect(thread.status).toBe("running");
  });

  test("Signal 结构正确", () => {
    const sig: Signal = {
      id: "sig_1",
      from: "frontend",
      content: "用户发来新消息",
      timestamp: Date.now(),
      acked: false,
    };
    expect(sig.acked).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `bun test tests/process.test.ts`
Expected: FAIL

- [ ] **Step 3: 添加类型定义**

在 `src/types/process.ts` 中添加：

```typescript
/** 线程间信号 */
export interface Signal {
  id: string;
  /** 发送方线程名 */
  from: string;
  /** 消息内容 */
  content: string;
  timestamp: number;
  /** 是否已读 */
  acked: boolean;
  /** 已读时附加的记忆信息 */
  ackMemo?: string;
}

/** 线程状态 */
export interface ThreadState {
  /** 线程名称，唯一标识 */
  name: string;
  /** 当前聚焦的节点 ID */
  focusId: string;
  /** 线程状态 */
  status: "running" | "yielded" | "finished";
  /** 待处理的 signal 队列 */
  signals: Signal[];
}
```

修改 Process 接口，添加 `threads` 字段（保留 `focusId` 用于向后兼容迁移）：

```typescript
export interface Process {
  root: ProcessNode;
  /** @deprecated 由 threads 替代，保留用于数据迁移 */
  focusId: string;
  /** 多线程 focus cursor */
  threads?: Record<string, ThreadState>;
  todo?: TodoItem[];
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `bun test tests/process.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/process.ts tests/process.test.ts
git commit -m "feat: 新增 ThreadState, Signal 类型定义"
```

### Task 9: tree.ts — createProcess 初始化双线程

**Files:**
- Modify: `src/process/tree.ts`

- [ ] **Step 1: 写测试 — createProcess 包含 threads**

```typescript
describe("createProcess with threads", () => {
  test("创建时初始化 frontend/backend 双线程", () => {
    const p = createProcess("任务");
    expect(p.threads).toBeDefined();
    expect(p.threads!["frontend"]).toBeDefined();
    expect(p.threads!["backend"]).toBeDefined();
    expect(p.threads!["backend"]!.focusId).toBe(p.root.id);
    expect(p.threads!["backend"]!.status).toBe("running");
  });
});
```

- [ ] **Step 2: 修改 createProcess**

```typescript
export function createProcess(title: string, description?: string): Process {
  const rootId = generateNodeId();

  // 创建 frontend 和 backend 子节点
  const frontendId = generateNodeId();
  const backendId = generateNodeId();

  const frontendNode: ProcessNode = {
    id: frontendId,
    title: "frontend",
    status: "doing",
    children: [],
    actions: [],
    hooks: [], // frontend 根节点不需要初始 hooks
  };

  const backendNode: ProcessNode = {
    id: backendId,
    title: "backend",
    status: "doing",
    children: [],
    actions: [],
    hooks: [], // backend 根节点不需要初始 hooks
  };

  return {
    root: {
      id: rootId,
      title,
      ...(description ? { description } : {}),
      status: "doing",
      children: [frontendNode, backendNode],
      actions: [],
    },
    focusId: backendId, // 向后兼容：默认 focus 指向 backend
    threads: {
      frontend: { name: "frontend", focusId: frontendId, status: "running", signals: [] },
      backend: { name: "backend", focusId: backendId, status: "running", signals: [] },
    },
  };
}
```

- [ ] **Step 3: 更新现有测试**

现有测试期望 `p.root.children` 为空，需要更新。`p.root.children.length` 现在是 2（frontend + backend）。

- [ ] **Step 4: 运行全部测试**

Run: `bun test`
Expected: PASS（更新后）

- [ ] **Step 5: Commit**

```bash
git add src/process/tree.ts tests/process.test.ts
git commit -m "feat: createProcess 初始化 frontend/backend 双线程"
```

### Task 10: tree.ts — signal 和 ack_signal 操作

**Files:**
- Modify: `src/process/tree.ts`
- Modify: `src/process/index.ts`

- [ ] **Step 1: 写测试 — sendSignal 和 ackSignal**

```typescript
import { sendSignal, ackSignal } from "../src/process/tree.js";

describe("signal", () => {
  test("向目标线程发送 signal", () => {
    const p = createProcess("任务");
    const sigId = sendSignal(p, "frontend", "backend", "用户发来消息");
    expect(sigId).not.toBeNull();
    expect(p.threads!["backend"]!.signals.length).toBe(1);
    expect(p.threads!["backend"]!.signals[0]!.acked).toBe(false);
  });

  test("ack signal 并附加 memo", () => {
    const p = createProcess("任务");
    const sigId = sendSignal(p, "frontend", "backend", "用户发来消息")!;
    const ok = ackSignal(p, "backend", sigId, "已处理，回复已发送");
    expect(ok).toBe(true);
    expect(p.threads!["backend"]!.signals[0]!.acked).toBe(true);
    expect(p.threads!["backend"]!.signals[0]!.ackMemo).toBe("已处理，回复已发送");
  });

  test("向不存在的线程发 signal 返回 null", () => {
    const p = createProcess("任务");
    const sigId = sendSignal(p, "frontend", "nonexistent", "test");
    expect(sigId).toBeNull();
  });

  test("向 finished 线程发 signal 返回 null", () => {
    const p = createProcess("任务");
    p.threads!["backend"]!.status = "finished";
    const sigId = sendSignal(p, "frontend", "backend", "test");
    expect(sigId).toBeNull();
  });
});
```

- [ ] **Step 2: 实现 sendSignal 和 ackSignal**

```typescript
function generateSignalId(): string {
  return `sig_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function sendSignal(
  process: Process,
  from: string,
  toThread: string,
  content: string,
): string | null {
  if (!process.threads) return null;
  const target = process.threads[toThread];
  if (!target) return null;
  if (target.status === "finished") return null;

  const id = generateSignalId();
  target.signals.push({
    id,
    from,
    content,
    timestamp: Date.now(),
    acked: false,
  });
  return id;
}

export function ackSignal(
  process: Process,
  threadName: string,
  signalId: string,
  memo: string,
): boolean {
  if (!process.threads) return false;
  const thread = process.threads[threadName];
  if (!thread) return false;
  const signal = thread.signals.find(s => s.id === signalId);
  if (!signal) return false;
  signal.acked = true;
  signal.ackMemo = memo;
  return true;
}
```

- [ ] **Step 3: 导出并运行测试**

Run: `bun test tests/process.test.ts`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/process/tree.ts src/process/index.ts tests/process.test.ts
git commit -m "feat: sendSignal/ackSignal 线程间通信"
```

### Task 11: focus.ts — 多线程 focus 管理

**Files:**
- Modify: `src/process/focus.ts`

- [ ] **Step 1: 添加 moveThreadFocus 函数**

```typescript
/**
 * 移动指定线程的 focus
 *
 * 如果离开 doing 节点，返回 yieldedNodeId。
 * 同时更新 process.focusId（向后兼容）。
 */
export function moveThreadFocus(
  process: Process,
  threadName: string,
  targetId: string,
): MoveFocusResult {
  if (!process.threads) return { success: false };
  const thread = process.threads[threadName];
  if (!thread) return { success: false };

  const node = findNode(process.root, targetId);
  if (!node) return { success: false };

  let yieldedNodeId: string | undefined;
  const oldNode = findNode(process.root, thread.focusId);
  if (oldNode && oldNode.id !== targetId && oldNode.status === "doing") {
    if (!oldNode.summary) oldNode.summary = autoSummarize(oldNode);
    yieldedNodeId = oldNode.id;
    thread.status = "yielded";
  }

  thread.focusId = targetId;
  thread.status = "running";
  if (node.status === "todo") node.status = "doing";

  // 向后兼容
  process.focusId = targetId;

  return { success: true, yieldedNodeId };
}
```

- [ ] **Step 2: 添加 computeThreadScopeChain**

在 `src/process/cognitive-stack.ts` 中添加多线程版本：

```typescript
export function computeThreadScopeChain(process: Process, threadName: string): string[] {
  if (!process.threads) return computeScopeChain(process);
  const thread = process.threads[threadName];
  if (!thread) return [];
  const path = getPathToNode(process.root, thread.focusId);
  const seen = new Set<string>();
  for (const node of path) {
    if (node.traits) for (const t of node.traits) seen.add(t);
    if (node.activatedTraits) for (const t of node.activatedTraits) seen.add(t);
  }
  return Array.from(seen);
}
```

- [ ] **Step 3: 导出新函数并运行测试**

Run: `bun test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/process/focus.ts src/process/cognitive-stack.ts src/process/index.ts
git commit -m "feat: moveThreadFocus + computeThreadScopeChain 多线程支持"
```

### Task 12: render.ts — 多线程渲染

**Files:**
- Modify: `src/process/render.ts`

- [ ] **Step 1: 更新 renderProcess 支持多线程**

修改 `renderProcess` 函数，当 `process.threads` 存在时，渲染每个线程的 focus 状态：

```typescript
export function renderProcess(process: Process): string {
  if (!process.root) return "(无行为树)";

  // 收集所有线程的 focus 路径
  const allFocusPaths = new Set<string>();
  const allFocusIds = new Set<string>();

  if (process.threads) {
    for (const thread of Object.values(process.threads)) {
      allFocusIds.add(thread.focusId);
      const path = getPathToNode(process.root, thread.focusId);
      for (const n of path) allFocusPaths.add(n.id);
    }
  } else {
    allFocusIds.add(process.focusId);
    const path = getPathToNode(process.root, process.focusId);
    for (const n of path) allFocusPaths.add(n.id);
  }

  // 渲染时标注每个 focus 属于哪个线程
  // ... 更新 renderNode 以接受 threadFocusMap
}
```

- [ ] **Step 2: 在 focus 标记中显示线程名**

例如：`[*] 接收用户消息 ← focus(frontend)` 和 `[*] 执行任务 ← focus(backend)`

- [ ] **Step 3: 渲染线程状态摘要**

在树渲染末尾添加线程状态：

```
线程状态:
  frontend: running (focus: 接收用户消息)
  backend: yielded (focus: 执行任务)
```

- [ ] **Step 4: 运行测试**

Run: `bun test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/process/render.ts
git commit -m "feat: renderProcess 多线程渲染支持"
```

### Task 13: builder.ts — 多线程 context 构建策略

**Files:**
- Modify: `src/context/builder.ts`

- [ ] **Step 1: 更新 buildContext 支持多线程**

修改 `buildContext` 函数，当 `flow.process.threads` 存在时：
- 为每个 running 线程计算独立的 scope chain
- 合并所有线程的 active traits
- 当前线程的 focus 节点展示完整 actions
- 其他线程的 focus 节点只展示 summary + 最近 1 条 action

- [ ] **Step 2: 添加 signal 信息到 context**

在 context 中添加未 ack 的 signals 展示：

```
[待处理信号]
来自 frontend: "用户发来新消息" (未读)
```

- [ ] **Step 3: 运行测试**

Run: `bun test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/context/builder.ts
git commit -m "feat: buildContext 多线程 context 构建策略"
```

### Task 14: thinkloop.ts — 注入 signal/ack_signal + 多线程循环

**Files:**
- Modify: `src/flow/thinkloop.ts`

- [ ] **Step 1: 注入 signal 和 ack_signal API**

```typescript
{
  name: "signal",
  fn: (threadName: string, message: string) => {
    const process = flow.process;
    if (!process) return null;
    // 确定当前线程名（从 context 中获取）
    const currentThread = getCurrentThreadName(process);
    const sigId = sendSignal(process, currentThread, threadName, message);
    if (sigId) flow.setProcess({ ...process });
    return sigId;
  },
},
{
  name: "ack_signal",
  fn: (signalId: string, memo: string) => {
    const process = flow.process;
    if (!process) return false;
    const currentThread = getCurrentThreadName(process);
    const ok = ackSignal(process, currentThread, signalId, memo);
    if (ok) flow.setProcess({ ...process });
    return ok;
  },
},
```

- [ ] **Step 2: 更新 go API 支持跨线程**

修改 `go` API 的 fn，第一个参数变为 `threadName`：

```typescript
{
  name: "go",
  fn: (threadName: string, nodeId: string) => {
    const process = flow.process;
    if (!process) return false;
    const result = moveThreadFocus(process, threadName, nodeId);
    // ... yield hook 执行逻辑
    flow.setProcess({ ...process });
    return result.success;
  },
},
```

- [ ] **Step 3: 更新 ThinkLoop 主循环遍历多线程**

**多线程调度策略：**

ThinkLoop 不是并行调用多个 LLM，而是在单轮迭代中顺序处理所有 running 线程。每轮迭代的流程：

1. 收集所有 `status === "running"` 的线程
2. 按固定优先级排序：`backend` 优先于 `frontend`（内部工作优先于对外沟通）
3. 对每个 running 线程：
   a. 以该线程的 focusId 为主 focus 构建 context（其他线程的 focus 只展示 summary）
   b. 调用 LLM 获取输出
   c. 解析并执行程序
   d. 记录 actions 到该线程的 focus 节点
4. 如果某线程在执行中被 yield（go 到其他线程），跳过该线程的后续处理

**实现方式：** 在 `runThinkLoop` 的主 while 循环中，添加线程遍历：

```typescript
// 在主循环中：
const process = flow.process;
const threads = process.threads;
if (threads) {
  // 收集 running 线程，按优先级排序
  const runningThreads = Object.values(threads)
    .filter(t => t.status === "running")
    .sort((a, b) => {
      // backend 优先
      if (a.name === "backend") return -1;
      if (b.name === "backend") return 1;
      return 0;
    });

  // 记录当前活跃线程名，供 API 使用
  for (const thread of runningThreads) {
    // 设置当前线程上下文（供 signal/recordAction 等 API 使用）
    flow.setFlowData("_currentThread", thread.name);

    // 以该线程的 focusId 为主 focus 构建 context
    // 临时设置 process.focusId 为该线程的 focusId（向后兼容 buildContext）
    process.focusId = thread.focusId;

    // ... 现有的 buildContext → LLM → parse → execute 逻辑 ...

    // 如果线程在执行中被 yield，跳过
    if (thread.status !== "running") continue;
  }
} else {
  // 向后兼容：无 threads 时走原有单 focus 逻辑
  // ... 现有逻辑不变 ...
}
```

**getCurrentThreadName 辅助函数：**

```typescript
function getCurrentThreadName(process: Process): string {
  // 从 flow.data._currentThread 获取，默认 "backend"
  return (flow.toJSON().data?._currentThread as string) ?? "backend";
}
```

- [ ] **Step 4: 更新 flow.ts recordAction 支持多线程**

`recordAction` 需要知道当前是哪个线程在执行，将 action 记录到对应线程的 focus 节点。

修改 `Flow.recordAction`：

```typescript
recordAction(action: Omit<Action, "timestamp" | "id">): void {
  const fullAction: Action = {
    id: generateActionId(),
    ...action,
    timestamp: Date.now(),
  };

  // 多线程：使用当前线程的 focusId
  const currentThread = this._data.data?._currentThread as string | undefined;
  let focusId = this._data.process.focusId;
  if (currentThread && this._data.process.threads?.[currentThread]) {
    focusId = this._data.process.threads[currentThread]!.focusId;
  }

  appendAction(this._data.process, focusId, fullAction);
  this._data = { ...this._data, updatedAt: Date.now() };
  emitSSE({ type: "flow:action", objectName: this.stoneName, sessionId: this.sessionId, action: fullAction });
}
```

- [ ] **Step 5: 数据迁移**

在 `Flow.load` 中添加迁移逻辑：如果加载的数据没有 `threads` 字段，自动创建：

```typescript
if (!data.process.threads) {
  data.process.threads = {
    backend: { name: "backend", focusId: data.process.focusId, status: "running", signals: [] },
  };
}
```

- [ ] **Step 6: 运行全部测试**

Run: `bun test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/flow/thinkloop.ts src/flow/flow.ts
git commit -m "feat: 多线程 ThinkLoop + signal/ack_signal + 数据迁移"
```

---

## Chunk 4: Phase 3 — Supervisor 系统级特权

### Task 15: builder.ts — _session_overview window

**Files:**
- Modify: `src/context/builder.ts`

- [ ] **Step 1: 添加 buildSessionOverview 函数**

```typescript
/**
 * 构建 session 概览（仅 supervisor 使用）
 *
 * 排除 supervisor 自身的 flow 信息。
 */
function buildSessionOverview(
  sessionDir: string,
  supervisorName: string,
): string | null {
  // 读取 session 下所有 sub-flow 的 process.json
  // 排除 supervisorName
  // 返回格式化的概览文本
}
```

- [ ] **Step 2: 在 buildContext 中注入 _session_overview**

当 `stone.name === "supervisor"` 时，调用 `buildSessionOverview` 并作为 extra window 注入。

- [ ] **Step 3: 运行测试**

Run: `bun test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/context/builder.ts
git commit -m "feat: supervisor _session_overview window 注入"
```

### Task 16: server.ts — 消息路由经过 supervisor

**Files:**
- Modify: `src/server/server.ts`
- Modify: `src/world/router.ts`（如需要）

**Supervisor 初始化策略：** Supervisor 是一个普通 stone，但在 session 创建时自动获得一个 sub-flow。当用户发第一条消息时，如果 session 中没有 supervisor flow，系统自动创建。Supervisor flow 的生命周期与 session 一致。

- [ ] **Step 1: 添加 ensureSupervisorFlow 辅助函数**

在 `src/server/server.ts` 或 `src/world/router.ts` 中添加：

```typescript
/**
 * 确保 session 中有 supervisor flow
 *
 * 如果不存在则创建。Supervisor flow 在 session 生命周期内常驻。
 */
function ensureSupervisorFlow(world: World, sessionDir: string): Flow | null {
  const supervisorDir = join(sessionDir, "flows", "supervisor");
  const existing = Flow.load(supervisorDir);
  if (existing) return existing;

  // 检查 supervisor stone 是否存在
  const supervisorStone = world.getStone("supervisor");
  if (!supervisorStone) return null;

  // 创建 supervisor sub-flow
  return Flow.createSubFlow(sessionDir, "supervisor", "", "system", "system");
}
```

- [ ] **Step 2: 修改 POST /api/talk/:objectName 路由**

```typescript
// 在 talkMatch 处理逻辑中：
const objectName = talkMatch[1]!;
const body = (await req.json()) as Record<string, unknown>;
const message = body.message as string;

// 确保 supervisor flow 存在
const sessionDir = /* 从当前 session 获取 */;
const supervisorFlow = ensureSupervisorFlow(world, sessionDir);

if (objectName !== "supervisor" && supervisorFlow) {
  // 通知 supervisor：用户直接与其他对象对话
  supervisorFlow.deliverMessage(
    "system",
    `[session_event] 用户直接与 ${objectName} 对话: "${message.slice(0, 80)}"`,
  );
  supervisorFlow.save();
}

// 继续原有的消息投递逻辑...
```

- [ ] **Step 3: 添加默认路由到 supervisor 的选项**

在 server 配置中添加可选的 `defaultTarget` 参数。当设置为 `"supervisor"` 时，`POST /api/talk/:objectName` 中如果 objectName 是通用入口（如 `"chat"`），则路由到 supervisor：

```typescript
// 可选：默认路由
if (objectName === "chat" || objectName === "default") {
  // 重定向到 supervisor
  const supervisorFlow = ensureSupervisorFlow(world, sessionDir);
  if (supervisorFlow) {
    supervisorFlow.deliverMessage("human", message);
    supervisorFlow.save();
    return json({ success: true, target: "supervisor" });
  }
}
```

- [ ] **Step 4: 防止循环通知**

确保 supervisor 自己发出的 `talk`/`delegate` 不会再次触发通知回 supervisor。检查 `from` 字段：

```typescript
// 只在用户直接对话时通知，不在对象间协作时通知
if (objectName !== "supervisor" && from === "human" && supervisorFlow) {
  // ... 通知逻辑
}
```

- [ ] **Step 5: 运行测试**

Run: `bun test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/server/server.ts
git commit -m "feat: 消息路由经过 supervisor + session 级自动通知"
```

### Task 17: supervisor stone 定义

**Files:**
- Create: `.ooc/stones/supervisor/readme.md`（如不存在）

- [ ] **Step 1: 检查 supervisor stone 是否已存在**

Run: `ls .ooc/stones/supervisor/ 2>/dev/null`

- [ ] **Step 2: 创建或更新 supervisor readme**

```markdown
---
name: supervisor
who_am_i: |
  我是 Supervisor，系统的全局协调者。
  我的职责：
  1. 接收用户消息，决定自己处理还是委派给其他对象
  2. 监控所有对象的工作状态
  3. 汇总进度，向用户报告
  4. 协调多对象协作
---

# Supervisor

全局任务管理与协调代理。
```

- [ ] **Step 3: Commit**

```bash
git add .ooc/stones/supervisor/readme.md
git commit -m "feat: supervisor stone 定义"
```

---

## Chunk 5: Phase 4 — 对象自渲染 TSX UI

### Task 18: StoneUIProps 类型定义

**Files:**
- Create: `.ooc/web/src/types/stone-ui.ts`

- [ ] **Step 1: 创建类型文件**

```typescript
// .ooc/web/src/types/stone-ui.ts

export interface StoneUIProps {
  /** 对象的静态数据 */
  stone: {
    name: string;
    whoAmI: string;
    data: Record<string, unknown>;
  };
  /** 当前活跃的 flow（如果有） */
  flow?: {
    sessionId: string;
    status: string;
    process: unknown;
    messages: unknown[];
  };
  /** 当前 session ID */
  sessionId?: string;
  /** 向该对象发消息 */
  sendMessage: (msg: string) => void;
}
```

- [ ] **Step 2: Commit**

```bash
git add .ooc/web/src/types/stone-ui.ts
git commit -m "feat: StoneUIProps 类型定义"
```

### Task 19: DynamicStoneUI 组件

**Files:**
- Create: `.ooc/web/src/features/DynamicStoneUI.tsx`

- [ ] **Step 1: 实现动态加载组件**

```tsx
// .ooc/web/src/features/DynamicStoneUI.tsx
import { useState, useEffect, Component, type ComponentType, type ReactNode } from "react";
import type { StoneUIProps } from "../types/stone-ui";

/** ErrorBoundary for catching render errors in custom stone UI */
class StoneUIErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean; error?: Error }
> {
  state = { hasError: false, error: undefined as Error | undefined };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 text-sm text-red-500">
          自渲染 UI 渲染失败: {this.state.error?.message}
        </div>
      );
    }
    return this.props.children;
  }
}

interface DynamicStoneUIProps {
  objectName: string;
  stoneUIProps: StoneUIProps;
}

export function DynamicStoneUI({ objectName, stoneUIProps }: DynamicStoneUIProps) {
  const [Component, setComponent] = useState<ComponentType<StoneUIProps> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Vite 动态 import：路径约定
    const importPath = `../../../stones/${objectName}/shared/ui/index.tsx`;
    import(/* @vite-ignore */ importPath)
      .then((mod) => setComponent(() => mod.default))
      .catch((e) => setError(e.message));
  }, [objectName]);

  if (error) {
    return (
      <div className="p-4 text-sm text-red-500">
        自渲染 UI 加载失败: {error}
      </div>
    );
  }

  if (!Component) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm text-[var(--muted-foreground)]">加载自渲染 UI...</p>
      </div>
    );
  }

  return (
    <StoneUIErrorBoundary
      fallback={<div className="p-4 text-sm text-red-500">自渲染 UI 渲染失败</div>}
    >
      <Component {...stoneUIProps} />
    </StoneUIErrorBoundary>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add .ooc/web/src/features/DynamicStoneUI.tsx
git commit -m "feat: DynamicStoneUI 动态加载组件"
```

### Task 20: ViewRouter 集成自渲染 UI

**Files:**
- Modify: `.ooc/web/src/features/ViewRouter.tsx`

- [ ] **Step 1: 在 stone 路由中检测 ui/index.tsx**

修改 ViewRouter 的 stone 路由分支：

```tsx
if (route.type === "stone" && route.objectName) {
  return <StoneViewWithCustomUI objectName={route.objectName} />;
}
```

新增 `StoneViewWithCustomUI` 组件：

```tsx
function StoneViewWithCustomUI({ objectName }: { objectName: string }) {
  const [hasCustomUI, setHasCustomUI] = useState<boolean | null>(null);

  useEffect(() => {
    // 检查 ui/index.tsx 是否存在
    fetchFileContent(`stones/${objectName}/shared/ui/index.tsx`)
      .then(() => setHasCustomUI(true))
      .catch(() => setHasCustomUI(false));
  }, [objectName]);

  if (hasCustomUI === null) {
    return <ObjectDetail objectName={objectName} />;
  }

  if (hasCustomUI) {
    return (
      <DynamicStoneUI
        objectName={objectName}
        stoneUIProps={{
          stone: { name: objectName, whoAmI: "", data: {} },
          sendMessage: (msg) => {
            // 调用 POST /api/talk/:objectName
            fetch(`/api/talk/${objectName}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: msg }),
            });
          },
        }}
      />
    );
  }

  return <ObjectDetail objectName={objectName} />;
}
```

- [ ] **Step 2: 添加 DynamicStoneUI import**

```typescript
import { DynamicStoneUI } from "./DynamicStoneUI";
```

- [ ] **Step 3: 运行前端 dev server 验证**

手动验证：创建一个测试 stone 的 `shared/ui/index.tsx`，确认 Vite 能加载。

- [ ] **Step 4: Commit**

```bash
git add .ooc/web/src/features/ViewRouter.tsx
git commit -m "feat: ViewRouter 集成自渲染 UI 检测与加载"
```

### Task 21: Vite 配置 — 允许 import .ooc/stones 路径

**Files:**
- Modify: `.ooc/web/vite.config.ts`

- [ ] **Step 1: 检查 Vite 配置**

确认 Vite 的 `server.fs.allow` 包含 `.ooc/stones/` 路径，否则 Vite 会拒绝加载项目根目录外的文件。

```typescript
// vite.config.ts
export default defineConfig({
  server: {
    fs: {
      allow: [
        // 允许访问 stones 目录下的 UI 文件
        "../stones",
        ".",
      ],
    },
  },
});
```

- [ ] **Step 2: 运行前端确认无报错**

Run: 手动启动 `cd .ooc/web && bun run dev`，访问一个有 `ui/index.tsx` 的 stone。

- [ ] **Step 3: Commit**

```bash
git add .ooc/web/vite.config.ts
git commit -m "feat: Vite 配置允许 import stones UI 文件"
```
