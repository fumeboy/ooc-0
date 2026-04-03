# 认知栈 API 重新设计实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (\`- [ ]\`) syntax for tracking.

**Goal:** 删除旧的函数调用式认知栈 API，改用段落标记式 API（与 [talk]、[action] 格式一致），支持多段落属性配置

**Architecture:**
1. **Phase 1:** 类型扩展 - 新增 NodeType、ProcessNode.type、ProcessNode.plan、HookTime.reflect
2. **Phase 2:** 解析器扩展 - 新增段落标记检测和属性收集
3. **Phase 3:** Hook 触发机制改造 - stack push/pop 时检查 hooks，创建内联节点
4. **Phase 4:** 执行器修改 - 移除旧 API 注册，新增新标记执行逻辑
5. **Phase 5:** 渲染器调整 - 支持内联子节点特殊格式和 plan 字段展示
6. **Phase 6:** 文档更新 - 更新 trait 文档

**Tech Stack:** TypeScript, Bun

---

## 确认的删除范围

### 删除的 API（从 thinkloop.ts 移除）

| API 名称 | 替代方案 |
|---------|---------|
| \`createPlan\` | \`[cognize_stack_frame_push]\` |
| \`create_plan_node\` | \`[cognize_stack_frame_push]\` |
| \`finish_plan_node\` | \`[cognize_stack_frame_pop]\` |
| \`add_stack_frame\` | \`[cognize_stack_frame_push]\` |
| \`stack_return\` | \`[cognize_stack_frame_pop]\` |
| \`addStep\` | 无替代（已废弃）|
| \`completeStep\` | 无替代（已废弃）|
| \`go\` | 无替代 |
| \`compress\` | 无替代 |
| \`isPlanComplete\` | 无替代 |
| \`removeStep\` | 无替代 |
| \`editStep\` | 无替代 |
| \`stack_catch\` | 用 \`create_hook("when_error", ...)\` 替代 |

### 保留的 API

| API 名称 | 用途 |
|---------|------|
| \`moveFocus\` | 手动移动注意力 |
| \`stack_throw\` | 抛出异常，触发 when_error hook |
| \`summary\` | 设置当前节点摘要 |
| \`create_hook\` | 注册栈帧级 hook（替代 stack_catch）|
| 多线程 API | \`create_thread\`、\`go_thread\`、\`send_signal\`、\`ack_signal\`、\`fork_threads\`、\`join_threads\`、\`finish_thread\` |
| TodoList API | \`addTodo\`、\`insertTodo\`、\`removeTodo\`、\`getTodo\` |
| Trait 元编程 API | \`createTrait\`、\`readTrait\`、\`editTrait\`、\`listTraits\`、\`activateTrait\` |

---

## 文件映射

| 文件路径 | 职责 | 修改类型 |
|---------|------|---------|
| \`kernel/src/types/process.ts\` | 进程类型定义 | 扩展：新增 NodeType、ProcessNode.type、ProcessNode.plan、HookTime.reflect |
| \`kernel/src/flow/parser.ts\` | LLM 输出解析器 | 修改：新增段落标记检测、属性收集、解析结果类型 |
| \`kernel/src/flow/thinkloop.ts\` | 思考循环核心 | 修改：移除旧 API 注册、新增新标记执行逻辑、改造 hook 触发机制 |
| \`kernel/src/process/render.ts\` | 行为树渲染 | 修改：支持内联子节点特殊格式、新增 plan 字段展示 |
| \`kernel/traits/computable/readme.md\` | 程序执行能力文档 | 更新：移除旧 API 描述、新增段落标记 API |
| \`kernel/traits/cognitive-style/readme.md\` | 认知风格文档 | 更新：移除旧 API 描述、更新示例 |
| \`kernel/traits/plannable/readme.md\` | 规划能力文档 | 更新：移除旧 API 描述、更新为新标记格式 |
| \`kernel/tests/parser.test.ts\` | 解析器测试 | 新增：认知栈 API 解析测试 |
| \`kernel/tests/cognitive-stack.test.ts\` | 认知栈测试 | 修改：更新为新 API 格式 |

---

## Task 1: 类型扩展

**Files:**
- Modify: \`kernel/src/types/process.ts\`

**当前状态（已读取）：**
- \`HookTime\` 定义在第 125 行：\`"when_stack_push" | "when_stack_pop" | "when_yield" | "when_error"\`
- \`ProcessNode\` 没有 \`type\` 和 \`plan\` 字段

- [ ] **Step 1: 新增 NodeType 类型**

在 \`kernel/src/types/process.ts\` 中添加：

\`\`\`typescript
/** 节点类型（区分普通子栈帧和内联子节点） */
export type NodeType =
  | "frame"           // 普通子栈帧（默认）
  | "inline_before"   // before 内联子节点（hook 自动触发）
  | "inline_after"    // after 内联子节点（hook 自动触发）
  | "inline_reflect"; // reflect 内联子节点（主动触发）
\`\`\`

- [ ] **Step 2: 扩展 ProcessNode 接口**

在 \`ProcessNode\` 接口中添加字段（在 \`hooks?: FrameHook[];\` 之前）：

\`\`\`typescript
export interface ProcessNode {
  // ... 现有字段 ...

  /** 节点类型（区分普通子栈帧和内联子节点） */
  type?: NodeType;

  /** plan 文本（当前节点的计划/目标，set_plan 写入） */
  plan?: string;

  /** 栈帧级 Hook（运行时注册，触发时机由 HookTime 决定） */
  hooks?: FrameHook[];
}
\`\`\`

- [ ] **Step 3: 扩展 HookTime 类型**

修改 \`HookTime\` 类型（第 125 行）：

\`\`\`typescript
/** Hook 触发时机 */
export type HookTime =
  | "when_stack_push"
  | "when_stack_pop"
  | "when_yield"
  | "when_error"
  | "reflect";  // 新增：reflect 内联子节点 hook
\`\`\`

- [ ] **Step 4: 验证类型编译**

Run: \`bun tsc --noEmit\`
Expected: 无类型错误

- [ ] **Step 5: 提交**

Run:
\`\`\`bash
git add kernel/src/types/process.ts
git commit -m "feat: 扩展 ProcessNode 类型，新增 NodeType、type、plan 字段"
\`\`\`

---

## Task 2: 解析器扩展 - 新增类型定义

**Files:**
- Modify: \`kernel/src/flow/parser.ts\`

**当前状态（已读取）：**
- \`ParsedOutput\` 定义在第 42-55 行
- 现有正则：\`SECTION_TAG_RE\`、\`TALK_OPEN_RE\`、\`TALK_CLOSE_RE\`、\`ACTION_OPEN_RE\`、\`ACTION_CLOSE_RE\`

- [ ] **Step 1: 新增提取结果类型**

在 \`kernel/src/flow/parser.ts\` 中添加（在 \`ExtractedAction\` 之后）：

\`\`\`typescript
/** 栈帧 push 操作提取结果 */
export interface ExtractedStackFramePush {
  type: "cognize_stack_frame_push" | "reflect_stack_frame_push";
  title: string;
  description?: string;
  traits?: string[];
  outputs?: string[];
  outputDescription?: string;
}

/** 栈帧 pop 操作提取结果 */
export interface ExtractedStackFramePop {
  type: "cognize_stack_frame_pop" | "reflect_stack_frame_pop";
  summary?: string;
  artifacts?: Record<string, unknown>;
}

/** set_plan 操作提取结果 */
export interface ExtractedSetPlan {
  type: "set_plan";
  content: string;
}
\`\`\`

- [ ] **Step 2: 扩展 ParsedOutput 接口**

修改 \`ParsedOutput\` 接口，添加 \`stackFrameOperations\` 字段：

\`\`\`typescript
/** 结构化解析结果 */
export interface ParsedOutput {
  /** 思考内容（[thought] 段落） */
  thought: string;
  /** 可执行程序列表（[program] 段落） */
  programs: ExtractedProgram[];
  /** talk 消息列表（[talk/目标] 段落） */
  talks: ExtractedTalk[];
  /** action 工具调用列表（[action/工具名] 段落） */
  actions: ExtractedAction[];
  /** 栈帧操作列表（新增） */
  stackFrameOperations: Array<
    ExtractedStackFramePush |
    ExtractedStackFramePop |
    ExtractedSetPlan
  >;
  /** 指令 */
  directives: { finish: boolean; wait: boolean; break_: boolean };
  /** 是否使用了结构化格式 */
  isStructured: boolean;
}
\`\`\`

- [ ] **Step 3: 提交类型定义**

Run:
\`\`\`bash
git add kernel/src/flow/parser.ts
git commit -m "feat: 新增栈帧操作提取类型"
\`\`\`

---

## Task 3: 解析器扩展 - 新增正则表达式

**Files:**
- Modify: \`kernel/src/flow/parser.ts\`

- [ ] **Step 1: 新增正则表达式**

在现有正则表达式之后添加（在 \`STRUCTURED_ACTION_RE\` 之后）：

\`\`\`typescript
/**
 * 认知栈操作标记正则
 */
// 开始标记
const COGNIZE_PUSH_RE = /^\\s*\\[cognize_stack_frame_push\\]\\s*$/;
const COGNIZE_POP_RE = /^\\s*\\[cognize_stack_frame_pop\\]\\s*$/;
const REFLECT_PUSH_RE = /^\\s*\\[reflect_stack_frame_push\\]\\s*$/;
const REFLECT_POP_RE = /^\\s*\\[reflect_stack_frame_pop\\]\\s*$/;
const SET_PLAN_RE = /^\\s*\\[set_plan\\]\\s*$/;

// 结束标记
const COGNIZE_PUSH_CLOSE_RE = /^\\s*\\[\\/cognize_stack_frame_push\\]\\s*$/;
const COGNIZE_POP_CLOSE_RE = /^\\s*\\[\\/cognize_stack_frame_pop\\]\\s*$/;
const REFLECT_PUSH_CLOSE_RE = /^\\s*\\[\\/reflect_stack_frame_push\\]\\s*$/;
const REFLECT_POP_CLOSE_RE = /^\\s*\\[\\/reflect_stack_frame_pop\\]\\s*$/;
const SET_PLAN_CLOSE_RE = /^\\s*\\[\\/set_plan\\]\\s*$/;

// 属性段落标记
const COGNIZE_PUSH_ATTR_RE = /^\\s*\\[cognize_stack_frame_push\\.(title|description|traits|outputs|outputDescription)\\]\\s*$/;
const COGNIZE_POP_ATTR_RE = /^\\s*\\[cognize_stack_frame_pop\\.(summary|artifacts)\\]\\s*$/;
const REFLECT_PUSH_ATTR_RE = /^\\s*\\[reflect_stack_frame_push\\.(title|description|traits|outputs|outputDescription)\\]\\s*$/;
const REFLECT_POP_ATTR_RE = /^\\s*\\[reflect_stack_frame_pop\\.(summary|artifacts)\\]\\s*$/;
\`\`\`

- [ ] **Step 2: 验证编译**

Run: \`cd /Users/bytedance/x/ooc/ooc-1/kernel && bun tsc --noEmit\`
Expected: 无类型错误

- [ ] **Step 3: 提交**

Run:
\`\`\`bash
git add kernel/src/flow/parser.ts
git commit -m "feat: 新增认知栈操作正则表达式"
\`\`\`

---

## Task 4: 解析器扩展 - 解析状态机

**Files:**
- Modify: \`kernel/src/flow/parser.ts\`

- [ ] **Step 1: 新增栈帧解析状态类型**

在 \`parseStructured\` 函数之前添加：

\`\`\`typescript
/** 栈帧解析状态 */
type StackFrameParseState = {
  // 当前正在解析的操作类型
  currentOp: "cognize_push" | "cognize_pop" | "reflect_push" | "reflect_pop" | "set_plan" | null;
  // 当前正在解析的属性名
  currentAttr: string | null;
  // 属性内容收集
  attrContent: string[];
  // 已收集的属性
  collected: Record<string, string>;
};

/** 初始化栈帧解析状态 */
function initStackFrameState(): StackFrameParseState {
  return {
    currentOp: null,
    currentAttr: null,
    attrContent: [],
    collected: {},
  };
}
\`\`\`

- [ ] **Step 2: 辅助函数 - flush 属性**

\`\`\`typescript
/** 刷新当前属性内容到 collected */
function flushAttr(state: StackFrameParseState): void {
  if (state.currentAttr && state.attrContent.length > 0) {
    const text = state.attrContent.join("\\n").trim();
    if (text) {
      state.collected[state.currentAttr] = text;
    }
  }
  state.currentAttr = null;
  state.attrContent = [];
}
\`\`\`

- [ ] **Step 3: 辅助函数 - 构建操作对象**

\`\`\`typescript
/** 从 collected 属性构建操作对象 */
function buildStackFrameOp(
  state: StackFrameParseState
): ExtractedStackFramePush | ExtractedStackFramePop | ExtractedSetPlan | null {
  const { currentOp, collected } = state;

  if (currentOp === "set_plan") {
    return {
      type: "set_plan",
      content: collected.content ?? "",
    };
  }

  if (currentOp === "cognize_push" || currentOp === "reflect_push") {
    // title 是必填项
    if (!collected.title) {
      return null; // 解析失败
    }
    const result: ExtractedStackFramePush = {
      type: currentOp === "cognize_push" ? "cognize_stack_frame_push" : "reflect_stack_frame_push",
      title: collected.title,
    };
    if (collected.description) result.description = collected.description;
    if (collected.traits) {
      result.traits = collected.traits.split(",").map((s) => s.trim()).filter((s) => s);
    }
    if (collected.outputs) {
      result.outputs = collected.outputs.split(",").map((s) => s.trim()).filter((s) => s);
    }
    if (collected.outputDescription) result.outputDescription = collected.outputDescription;
    return result;
  }

  if (currentOp === "cognize_pop" || currentOp === "reflect_pop") {
    const result: ExtractedStackFramePop = {
      type: currentOp === "cognize_pop" ? "cognize_stack_frame_pop" : "reflect_stack_frame_pop",
    };
    if (collected.summary) result.summary = collected.summary;
    if (collected.artifacts) {
      try {
        result.artifacts = JSON.parse(collected.artifacts);
      } catch {
        // JSON 解析失败，忽略 artifacts
        return null;
      }
    }
    return result;
  }

  return null;
}
\`\`\`

- [ ] **Step 4: 修改 parseStructured 函数状态管理**

在 \`parseStructured\` 函数中，在现有变量声明后添加：

\`\`\`typescript
// 栈帧操作解析状态
const stackFrameState = initStackFrameState();
const stackFrameOperations: Array<
  ExtractedStackFramePush |
  ExtractedStackFramePop |
  ExtractedSetPlan
> = [];
\`\`\`

- [ ] **Step 5: 修改 flushSection 函数**

修改 \`flushSection\` 函数，在刷新段落前检查是否需要处理栈帧操作：

\`\`\`typescript
const flushSection = (lineIndex: number) => {
  // 先处理栈帧属性
  if (stackFrameState.currentOp !== null) {
    flushAttr(stackFrameState);
  }

  // ... 原有逻辑保持不变 ...
};
\`\`\`

- [ ] **Step 6: 在循环中添加栈帧标记检测**

在 \`parseStructured\` 的 for 循环中，在现有检测逻辑（talk/action/SECTION_TAG_RE）之后添加栈帧标记检测：

\`\`\`typescript
// 检测栈帧操作开始标记
const isCognizePush = COGNIZE_PUSH_RE.test(line);
const isCognizePop = COGNIZE_POP_RE.test(line);
const isReflectPush = REFLECT_PUSH_RE.test(line);
const isReflectPop = REFLECT_POP_RE.test(line);
const isSetPlan = SET_PLAN_RE.test(line);

// 检测栈帧操作结束标记
const isCognizePushClose = COGNIZE_PUSH_CLOSE_RE.test(line);
const isCognizePopClose = COGNIZE_POP_CLOSE_RE.test(line);
const isReflectPushClose = REFLECT_PUSH_CLOSE_RE.test(line);
const isReflectPopClose = REFLECT_POP_CLOSE_RE.test(line);
const isSetPlanClose = SET_PLAN_CLOSE_RE.test(line);

// 检测栈帧属性标记
const cognizePushAttrMatch = COGNIZE_PUSH_ATTR_RE.exec(line);
const cognizePopAttrMatch = COGNIZE_POP_ATTR_RE.exec(line);
const reflectPushAttrMatch = REFLECT_PUSH_ATTR_RE.exec(line);
const reflectPopAttrMatch = REFLECT_POP_ATTR_RE.exec(line);

// 处理栈帧操作结束标记
if (
  (isCognizePushClose && stackFrameState.currentOp === "cognize_push") ||
  (isCognizePopClose && stackFrameState.currentOp === "cognize_pop") ||
  (isReflectPushClose && stackFrameState.currentOp === "reflect_push") ||
  (isReflectPopClose && stackFrameState.currentOp === "reflect_pop") ||
  (isSetPlanClose && stackFrameState.currentOp === "set_plan")
) {
  flushAttr(stackFrameState);
  const op = buildStackFrameOp(stackFrameState);
  if (op) {
    stackFrameOperations.push(op);
  }
  // 重置状态
  stackFrameState.currentOp = null;
  stackFrameState.collected = {};
  seenTag = true;
  continue;
}

// 处理 set_plan 开始标记（内容直接收集，不需要属性段落）
if (isSetPlan) {
  flushSection(i);
  seenTag = true;
  stackFrameState.currentOp = "set_plan";
  stackFrameState.currentAttr = "content";
  stackFrameState.attrContent = [];
  continue;
}

// 处理栈帧操作开始标记
if (isCognizePush || isCognizePop || isReflectPush || isReflectPop) {
  flushSection(i);
  seenTag = true;
  if (isCognizePush) stackFrameState.currentOp = "cognize_push";
  else if (isCognizePop) stackFrameState.currentOp = "cognize_pop";
  else if (isReflectPush) stackFrameState.currentOp = "reflect_push";
  else if (isReflectPop) stackFrameState.currentOp = "reflect_pop";
  stackFrameState.collected = {};
  continue;
}

// 处理栈帧属性段落开始标记
if (cognizePushAttrMatch || cognizePopAttrMatch || reflectPushAttrMatch || reflectPopAttrMatch) {
  flushAttr(stackFrameState);
  seenTag = true;
  let attrName: string | null = null;
  if (cognizePushAttrMatch) attrName = cognizePushAttrMatch[1]!;
  else if (cognizePopAttrMatch) attrName = cognizePopAttrMatch[1]!;
  else if (reflectPushAttrMatch) attrName = reflectPushAttrMatch[1]!;
  else if (reflectPopAttrMatch) attrName = reflectPopAttrMatch[1]!;
  if (attrName) {
    stackFrameState.currentAttr = attrName;
    stackFrameState.attrContent = [];
  }
  continue;
}

// 如果正在解析栈帧操作，收集内容到当前属性
if (stackFrameState.currentOp !== null && stackFrameState.currentAttr !== null) {
  stackFrameState.attrContent.push(line);
  continue;
}
\`\`\`

- [ ] **Step 7: 修改返回值**

在 \`parseStructured\` 函数的返回语句中，添加 \`stackFrameOperations\`：

\`\`\`typescript
return {
  thought: thoughtParts.join("\\n"),
  programs: nonEmptyPrograms,
  talks: finalTalks,
  actions: finalActions,
  stackFrameOperations,  // 新增
  directives: { finish, wait, break_ },
  isStructured: true,
};
\`\`\`

- [ ] **Step 8: 修改 parseLegacy 函数**

在 \`parseLegacy\` 函数的返回值中添加空的 \`stackFrameOperations\`：

\`\`\`typescript
return {
  thought,
  programs,
  talks: [],
  actions: [],
  stackFrameOperations: [],  // 新增
  directives,
  isStructured: false,
};
\`\`\`

- [ ] **Step 9: 验证编译**

Run: \`cd /Users/bytedance/x/ooc/ooc-1/kernel && bun tsc --noEmit\`
Expected: 无类型错误

- [ ] **Step 10: 提交**

Run:
\`\`\`bash
git add kernel/src/flow/parser.ts
git commit -m "feat: 新增认知栈段落标记解析逻辑"
\`\`\`

---

## Task 5: 编写解析器单元测试

**Files:**
- Create/Modify: \`kernel/tests/parser.test.ts\`

- [ ] **Step 1: 检查是否有现有测试文件**

Run: \`ls -la /Users/bytedance/x/ooc/ooc-1/kernel/tests/\`
Expected: 查看现有测试文件

- [ ] **Step 2: 编写解析测试**

如果测试文件不存在，创建它。添加以下测试：

\`\`\`typescript
import { describe, test, expect } from "bun:test";
import { parseLLMOutput } from "../src/flow/parser";

describe("认知栈 API 解析", () => {
  test("解析 [cognize_stack_frame_push] 基本格式", () => {
    const input = \`
[cognize_stack_frame_push.title]
获取文档内容
[/cognize_stack_frame_push.title]

[cognize_stack_frame_push.description]
从飞书知识库获取指定文档的完整内容
[/cognize_stack_frame_push.description]

[/cognize_stack_frame_push]
\`;
    const result = parseLLMOutput(input);
    expect(result.stackFrameOperations.length).toBe(1);
    const op = result.stackFrameOperations[0]!;
    expect(op.type).toBe("cognize_stack_frame_push");
    if ("title" in op) {
      expect(op.title).toBe("获取文档内容");
      expect(op.description).toBe("从飞书知识库获取指定文档的完整内容");
    }
  });

  test("解析 [cognize_stack_frame_push] 完整属性", () => {
    const input = \`
[cognize_stack_frame_push.title]
获取文档
[/cognize_stack_frame_push.title]

[cognize_stack_frame_push.traits]
lark-wiki
[/cognize_stack_frame_push.traits]

[cognize_stack_frame_push.outputs]
docContent, docTitle
[/cognize_stack_frame_push.outputs]

[cognize_stack_frame_push.outputDescription]
文档内容和元数据
[/cognize_stack_frame_push.outputDescription]

[/cognize_stack_frame_push]
\`;
    const result = parseLLMOutput(input);
    expect(result.stackFrameOperations.length).toBe(1);
    const op = result.stackFrameOperations[0]!;
    expect(op.type).toBe("cognize_stack_frame_push");
    if ("title" in op) {
      expect(op.title).toBe("获取文档");
      expect(op.traits).toEqual(["lark-wiki"]);
      expect(op.outputs).toEqual(["docContent", "docTitle"]);
      expect(op.outputDescription).toBe("文档内容和元数据");
    }
  });

  test("解析 [cognize_stack_frame_pop] 带 artifacts", () => {
    const input = \`
[cognize_stack_frame_pop.summary]
已成功获取文档内容
[/cognize_stack_frame_pop.summary]

[cognize_stack_frame_pop.artifacts]
{
  "docContent": "文档完整内容...",
  "docTitle": "飞书产品设计文档"
}
[/cognize_stack_frame_pop.artifacts]

[/cognize_stack_frame_pop]
\`;
    const result = parseLLMOutput(input);
    expect(result.stackFrameOperations.length).toBe(1);
    const op = result.stackFrameOperations[0]!;
    expect(op.type).toBe("cognize_stack_frame_pop");
    if ("summary" in op) {
      expect(op.summary).toBe("已成功获取文档内容");
      expect(op.artifacts).toEqual({
        docContent: "文档完整内容...",
        docTitle: "飞书产品设计文档",
      });
    }
  });

  test("解析 [reflect_stack_frame_push]", () => {
    const input = \`
[reflect_stack_frame_push.title]
审视与调整
[/reflect_stack_frame_push.title]

[reflect_stack_frame_push.description]
重新审视当前计划
[/reflect_stack_frame_push.description]

[/reflect_stack_frame_push]
\`;
    const result = parseLLMOutput(input);
    expect(result.stackFrameOperations.length).toBe(1);
    const op = result.stackFrameOperations[0]!;
    expect(op.type).toBe("reflect_stack_frame_push");
  });

  test("解析 [set_plan]", () => {
    const input = \`
[set_plan]
重新规划当前任务：
1. 先激活 lark-wiki trait
2. 调用 wiki API 获取文档内容
[/set_plan]
\`;
    const result = parseLLMOutput(input);
    expect(result.stackFrameOperations.length).toBe(1);
    const op = result.stackFrameOperations[0]!;
    expect(op.type).toBe("set_plan");
    if ("content" in op) {
      expect(op.content).toContain("重新规划当前任务");
      expect(op.content).toContain("先激活 lark-wiki trait");
    }
  });

  test("title 缺失时解析失败", () => {
    const input = \`
[cognize_stack_frame_push.description]
没有 title
[/cognize_stack_frame_push.description]

[/cognize_stack_frame_push]
\`;
    const result = parseLLMOutput(input);
    expect(result.stackFrameOperations.length).toBe(0);
  });

  test("artifacts JSON 无效时解析失败", () => {
    const input = \`
[cognize_stack_frame_pop.artifacts]
这不是有效的 JSON
[/cognize_stack_frame_pop.artifacts]

[/cognize_stack_frame_pop]
\`;
    const result = parseLLMOutput(input);
    expect(result.stackFrameOperations.length).toBe(0);
  });
});
\`\`\`

- [ ] **Step 3: 运行测试**

Run: \`cd /Users/bytedance/x/ooc/ooc-1/kernel && bun test tests/parser.test.ts\`
Expected: 所有测试通过

- [ ] **Step 4: 提交**

Run:
\`\`\`bash
git add kernel/tests/parser.test.ts
git commit -m "test: 新增认知栈 API 解析测试"
\`\`\`

---

## Task 6: Hook 触发机制改造 - 新增内联节点创建逻辑

**Files:**
- Modify: \`kernel/src/flow/thinkloop.ts\`

**当前设计：**
- stack_push 时：检查是否有 before hooks，有则创建 \`inline_before\` 节点
- stack_pop 时：检查是否有 after hooks，有则创建 \`inline_after\` 节点
- hooks 执行结果记录到内联子节点中

- [ ] **Step 1: 查看现有 addNode 函数**

先确认 \`addNode\` 函数的签名（在 \`src/process/tree.ts\` 中）。

- [ ] **Step 2: 扩展 addNode 函数支持 type 参数**

需要修改 \`addNode\` 函数以支持传入节点类型。查看当前实现：

**注意：** 这一步可能需要先修改 \`src/process/tree.ts\` 中的 \`addNode\` 函数。

让我先检查 \`tree.ts\`：

让我先查看 \`tree.ts\` 中的 \`addNode\` 函数：

**注意：** 在继续之前，需要先确认 \`addNode\` 是否需要修改以支持 \`type\` 参数。

假设 \`addNode\` 已支持或我们需要扩展它，继续。

- [ ] **Step 3: 在 thinkloop.ts 中新增 before/after hook 触发函数**

新增一个函数来处理 stack push/pop 时的 hook 触发和内联节点创建：

\`\`\`typescript
/**
 * 触发指定事件的 hooks，如有需要创建内联节点
 *
 * @param traits - 所有 traits
 * @param flow - Flow 实例
 * @param event - hook 事件类型
 * @param nodeType - 内联节点类型（inline_before / inline_after）
 * @param firedHooks - 已触发的 hooks 集合
 * @returns 是否创建了内联节点
 */
function fireHooksWithInlineNode(
  traits: TraitDefinition[],
  flow: Flow,
  event: "before" | "after",
  nodeType: "inline_before" | "inline_after",
  firedHooks: Set<string>,
): boolean {
  // 收集需要触发的 hooks
  const scopeChain = computeScopeChain(flow.process);
  const activeTraits = getActiveTraits(traits, scopeChain);
  const focusNodeId = flow.process.focusId;

  const injections: string[] = [];
  const collectedTitles: string[] = [];
  const hooksToFire: { traitName: string; hook: any }[] = [];

  for (const trait of activeTraits) {
    if (!trait.hooks) continue;
    const hook = trait.hooks[event];
    if (!hook) continue;

    const hookId = \`\${trait.name}:\${event}:\${focusNodeId}\`;
    if (hook.once !== false && firedHooks.has(hookId)) continue;

    hooksToFire.push({ traitName: trait.name, hook });
    injections.push(hook.inject);
    if (hook.inject_title) {
      collectedTitles.push(hook.inject_title);
    }
    firedHooks.add(hookId);
  }

  if (injections.length === 0) {
    return false; // 没有 hooks 需要触发
  }

  // 持久化 firedHooks
  flow.setFlowData("_firedHooks", Array.from(firedHooks));

  // 构建注入内容
  const titlePart = injections.length === 1 && collectedTitles.length === 1
    ? \` | \${collectedTitles[0]}\`
    : "";
  const content = \`>>> [系统提示 — \${event}\${titlePart}]\\n\${injections.join("\\n\\n")}\`;

  // 创建内联节点
  const process = flow.process;
  const currentFocusId = process.focusId;

  // 内联节点标题
  const inlineTitle = collectedTitles.length > 0
    ? collectedTitles.join(", ")
    : \`\${event} hook\`;

  // 添加内联子节点
  // 注意：需要扩展 addNode 以支持 type 参数
  // 假设 addNode 已支持或我们需要传入额外参数

  // 临时方案：直接操作节点结构
  const focusNode = findNode(process.root, currentFocusId);
  if (!focusNode) return false;

  // 创建内联节点
  const inlineNodeId = \`node_\${Date.now()}_\${Math.random().toString(36).slice(2, 6)}\`;
  const inlineNode: ProcessNode = {
    id: inlineNodeId,
    title: inlineTitle,
    status: "doing",
    type: nodeType,
    children: [],
    actions: [],
  };

  // 记录 inject action 到内联节点
  inlineNode.actions.push({
    type: "inject",
    content,
    timestamp: Date.now(),
  });

  // 将内联节点插入到 focus 节点的 children 中
  focusNode.children.push(inlineNode);

  // 将 focus 移动到内联节点
  moveProcessFocus(process, inlineNodeId);

  flow.setProcess({ ...process });
  return true;
}
\`\`\`

**注意：** 上面的实现需要确认 \`addNode\` 是否支持 \`type\` 参数。如果不支持，需要先修改 \`tree.ts\`。

---

## Task 7: 查看并扩展 addNode 函数

**Files:**
- Read: \`kernel/src/process/tree.ts\`

- [ ] **Step 1: 读取 tree.ts 了解 addNode 签名**

Run: \`cat /Users/bytedance/x/ooc/ooc-1/kernel/src/process/tree.ts\`

- [ ] **Step 2: 根据需要修改 addNode**

如果 \`addNode\` 不支持 \`type\` 参数，需要扩展它。

---

## Task 8: 执行器修改 - 移除旧 API 注册

**Files:**
- Modify: \`kernel/src/flow/thinkloop.ts\`

**需要删除的 API（在 \`tracker.register(context, [ ... ])\` 中）：**

1. \`createPlan\`
2. \`create_plan_node\`
3. \`finish_plan_node\`
4. \`addStep\`
5. \`completeStep\`
6. \`isPlanComplete\`
7. \`removeStep\`
8. \`editStep\`
9. \`add_stack_frame\`
10. \`stack_return\`
11. \`go\`
12. \`compress\`
13. \`stack_catch\`

**保留的 API：**
- \`moveFocus\`
- \`stack_throw\`
- \`summary\`
- \`create_hook\`
- 多线程 API
- TodoList API

- [ ] **Step 1: 定位要删除的代码段**

在 thinkloop.ts 中，找到以下 API 注册并删除：

\`\`\`typescript
// 认知栈 API 部分（从第 1075 行左右开始）
{
  name: "createPlan",
  fn: ...
},
{
  name: "create_plan_node",
  fn: ...
},
{
  name: "finish_plan_node",
  fn: ...
},
{
  name: "addStep",
  fn: ...
},
{
  name: "completeStep",
  fn: ...
},
{
  name: "isPlanComplete",
  fn: ...
},
{
  name: "removeStep",
  fn: ...
},
{
  name: "editStep",
  fn: ...
},
// 栈帧语义 API
{
  name: "add_stack_frame",
  fn: ...
},
{
  name: "stack_return",
  fn: ...
},
{
  name: "go",
  fn: ...
},
{
  name: "compress",
  fn: ...
},
{
  name: "stack_catch",
  fn: ...
},
\`\`\`

- [ ] **Step 2: 验证编译**

Run: \`bun tsc --noEmit\`
Expected: 无类型错误

- [ ] **Step 3: 提交**

Run:
\`\`\`bash
git add kernel/src/flow/thinkloop.ts
git commit -m "refactor: 移除旧的函数调用式认知栈 API"
\`\`\`

---

## Task 9: 执行器修改 - 新增新标记执行逻辑

**Files:**
- Modify: \`kernel/src/flow/thinkloop.ts\`

需要在 \`parseLLMOutput\` 之后添加执行 \`stackFrameOperations\` 的逻辑。

- [ ] **Step 1: 在适当位置添加执行逻辑**

在 \`parseLLMOutput\` 调用之后，找到处理 \`talks\`、\`actions\`、\`programs\` 的位置，在之前添加栈帧操作执行：

\`\`\`typescript
/* 3. 解析 LLM 输出 */
const parsed = parseLLMOutput(llmOutput);
const { programs, talks, actions, directives, stackFrameOperations } = parsed;

/* 3.5 执行栈帧操作 */
for (const op of stackFrameOperations) {
  if (op.type === "cognize_stack_frame_push") {
    // 创建普通子栈帧
    const process = flow.process;
    const parentId = process.focusId;
    const nodeId = addNode(
      process,
      parentId,
      op.title,
      undefined,
      op.description,
      op.traits,
      op.outputs,
      op.outputDescription
    );
    if (nodeId) {
      addProcessTodo(process, nodeId, op.title, "plan");
      moveProcessFocus(process, nodeId);
      flow.setProcess({ ...process });
    }
  } else if (op.type === "reflect_stack_frame_push") {
    // 创建 reflect 内联子节点
    const process = flow.process;
    const parentId = process.focusId;
    const parent = findNode(process.root, parentId);
    if (parent) {
      const nodeId = \`node_\${Date.now()}_\${Math.random().toString(36).slice(2, 6)}\`;
      const inlineNode: ProcessNode = {
        id: nodeId,
        title: op.title,
        description: op.description,
        status: "doing",
        type: "inline_reflect",
        children: [],
        actions: [],
        traits: op.traits,
        outputs: op.outputs,
        outputDescription: op.outputDescription,
      };
      parent.children.push(inlineNode);
      moveProcessFocus(process, nodeId);
      flow.setProcess({ ...process });
    }
  } else if (op.type === "cognize_stack_frame_pop" || op.type === "reflect_stack_frame_pop") {
    // 完成并弹出当前栈帧
    const process = flow.process;
    const currentId = process.focusId;
    const currentNode = findNode(process.root, currentId);
    
    if (currentNode && currentId !== process.root.id) {
      // 处理 artifacts
      if (op.artifacts && typeof op.artifacts === "object") {
        if (!currentNode.locals) currentNode.locals = {};
        Object.assign(currentNode.locals, op.artifacts);
        // 合并到父节点 locals
        const parent = getParentNode(process.root, currentId);
        if (parent) {
          if (!parent.locals) parent.locals = {};
          Object.assign(parent.locals, op.artifacts);
        }
      }

      // 完成节点
      const ok = completeProcessNode(process, currentId, op.summary ?? "");
      if (ok) {
        // 检查是否是内联节点
        const isInline = currentNode.type?.startsWith("inline_");
        if (isInline) {
          // 内联节点完成后，focus 自动回到父节点
          advanceFocus(process);
        } else {
          // 普通节点：检查 todo 队列
          const todo = process.todo ?? [];
          const idx = todo.findIndex((t) => t.nodeId === currentId);
          if (idx >= 0) removeProcessTodo(process, idx);
          const nextTodo = (process.todo ?? [])[0];
          if (nextTodo) {
            moveProcessFocus(process, nextTodo.nodeId);
          } else {
            advanceFocus(process);
          }
        }
        flow.setProcess({ ...process });
      }
    }
  } else if (op.type === "set_plan") {
    // 更新当前节点的 plan 字段
    const process = flow.process;
    const currentNode = findNode(process.root, process.focusId);
    if (currentNode) {
      currentNode.plan = op.content;
      flow.setProcess({ ...process });
    }
  }
}
\`\`\`

- [ ] **Step 2: 验证编译**

Run: \`cd /Users/bytedance/x/ooc/ooc-1/kernel && bun tsc --noEmit\`
Expected: 无类型错误

- [ ] **Step 3: 提交**

Run:
\`\`\`bash
git add kernel/src/flow/thinkloop.ts
git commit -m "feat: 新增认知栈段落标记执行逻辑"
\`\`\`

---

## Task 10: 渲染器调整 - 内联节点格式

**Files:**
- Modify: \`kernel/src/process/render.ts\`

需要在 render 中支持内联节点的特殊格式：
- \`[inline/{type}_start]\` ... \`[inline/{type}_end]\`
- 增加 plan 字段展示

- [ ] **Step 1: 修改 generateEventsForNode 函数**

在生成事件时，区分内联节点类型：

\`\`\`typescript
// 在内联节点的 push/pop 事件中添加类型标记
type TimelineEvent =
  | { type: "action"; action: Action; nodeId: string; nodeTitle: string }
  | { type: "push"; nodeId: string; nodeTitle: string; timestamp: number; nodeType?: NodeType }
  | {
      type: "pop";
      nodeId: string;
      nodeTitle: string;
      timestamp: number;
      nodeType?: NodeType;
      summary?: string;
      description?: string;
      artifacts?: Record<string, unknown>;
    };
\`\`\`

- [ ] **Step 2: 修改 formatEvent 函数**

在内联节点 push 时显示 \`[inline/{type}_start]\`，pop 时显示 \`[inline/{type}_end]\`：

\`\`\`typescript
if (event.type === "push") {
  // 检查是否是内联节点
  if (event.nodeType === "inline_before") {
    lines.push(\`[inline/before_start]\`);
    lines.push("");
  } else if (event.nodeType === "inline_after") {
    lines.push(\`[inline/after_start]\`);
    lines.push("");
  } else if (event.nodeType === "inline_reflect") {
    lines.push(\`[inline/reflect_start]\`);
    lines.push("");
  } else {
    // 普通子栈帧
    lines.push(\`[push] \${event.nodeTitle}\`);
    lines.push(\`进入子栈帧: \${event.nodeTitle}\`);
    lines.push("");
  }
} else if (event.type === "pop") {
  // 检查是否是内联节点
  if (event.nodeType === "inline_before") {
    lines.push(\`[inline/before_end]\`);
    if (event.summary) {
      lines.push(\`  summary: \${event.summary}\`);
    }
    lines.push("");
  } else if (event.nodeType === "inline_after") {
    lines.push(\`[inline/after_end]\`);
    if (event.summary) {
      lines.push(\`  summary: \${event.summary}\`);
    }
    lines.push("");
  } else if (event.nodeType === "inline_reflect") {
    lines.push(\`[inline/reflect_end]\`);
    if (event.summary) {
      lines.push(\`  summary: \${event.summary}\`);
    }
    lines.push("");
  } else {
    // 普通子栈帧 - 已完成
    lines.push(\`[sub_stack_frame] \${event.nodeTitle} [✓ done]\`);
    const input = event.description || "(无)";
    lines.push(\`输入: \${input}\`);
    lines.push(\`输出 summary: \${event.summary || "(无)"}\`);
    const artifactKeys = event.artifacts
      ? Object.keys(event.artifacts).join(", ")
      : "";
    if (artifactKeys) {
      lines.push(\`输出 artifacts: \${artifactKeys} (已合并到父帧)\`);
    } else {
      lines.push("输出 artifacts: (无)");
    }
    lines.push("");
  }
}
\`\`\`

- [ ] **Step 3: 新增 plan 字段展示**

在 \`formatCurrentStatus\` 函数中或头部区域添加 plan 展示：

\`\`\`typescript
// 在头部区域，如果当前节点有 plan，展示【当前计划】
const focusNode = findNode(process.root, process.focusId);
if (focusNode?.plan) {
  output.push("");
  output.push("【当前计划】");
  output.push(focusNode.plan);
  output.push("");
}
\`\`\`

- [ ] **Step 4: 验证编译**

Run: \`cd /Users/bytedance/x/ooc/ooc-1/kernel && bun tsc --noEmit\`
Expected: 无类型错误

- [ ] **Step 5: 提交**

Run:
\`\`\`bash
git add kernel/src/process/render.ts
git commit -m "feat: render 支持内联节点特殊格式和 plan 字段展示"
\`\`\`

---

## Task 11: 文档更新 - computable trait

**Files:**
- Modify: \`kernel/traits/computable/readme.md\`

需要移除旧 API 描述，新增段落标记 API。

- [ ] **Step 1: 移除旧的认知栈 API 描述**

删除以下部分：
- \`createPlan\`、\`create_plan_node\`、\`finish_plan_node\` 的描述
- \`add_stack_frame\`、\`stack_return\` 的描述
- \`go\`、\`compress\`、\`stack_catch\` 的描述
- \`isPlanComplete\`、\`removeStep\`、\`editStep\` 的描述

- [ ] **Step 2: 新增段落标记 API 说明**

添加新的认知栈操作说明：

\`\`\`markdown
### 认知栈操作（段落标记格式）

使用段落标记格式管理认知栈，与 \`[talk]\`、\`[action]\` 格式一致。

#### [cognize_stack_frame_push] - 创建普通子栈帧

压入一个新的普通子栈帧：

\`\`\`
[cognize_stack_frame_push.title]
获取文档内容
[/cognize_stack_frame_push.title]

[cognize_stack_frame_push.description]
从飞书知识库获取指定文档的完整内容
[/cognize_stack_frame_push.description]

[cognize_stack_frame_push.traits]
lark-wiki
[/cognize_stack_frame_push.traits]

[cognize_stack_frame_push.outputs]
docContent, docTitle
[/cognize_stack_frame_push.outputs]

[cognize_stack_frame_push.outputDescription]
文档内容（字符串）和元数据（对象）
[/cognize_stack_frame_push.outputDescription]

[/cognize_stack_frame_push]
\`\`\`

**属性段落：**

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| \`title\` | string | 是 | 子栈帧标题 |
| \`description\` | string | 否 | 详细描述 |
| \`traits\` | string | 否 | trait 名称列表，逗号分隔 |
| \`outputs\` | string | 否 | 输出 key 列表，逗号分隔 |
| \`outputDescription\` | string | 否 | 输出描述 |

#### [cognize_stack_frame_pop] - 完成并退出当前子栈帧

\`\`\`
[cognize_stack_frame_pop.summary]
已成功获取文档内容，共 15000 字
[/cognize_stack_frame_pop.summary]

[cognize_stack_frame_pop.artifacts]
{
  "docContent": "文档完整内容...",
  "docTitle": "飞书产品设计文档"
}
[/cognize_stack_frame_pop.artifacts]

[/cognize_stack_frame_pop]
\`\`\`

**属性段落：**

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| \`summary\` | string | 否 | 完成摘要 |
| \`artifacts\` | string | 否 | JSON 格式的输出数据（合并到父节点 locals）|

#### [reflect_stack_frame_push] - 进入 reflect 内联子栈帧

用于主动调整 plan、traits 或审视上文：

\`\`\`
[reflect_stack_frame_push.title]
审视与调整
[/reflect_stack_frame_push.title]

[reflect_stack_frame_push.description]
重新审视当前计划，判断是否需要调整
[/reflect_stack_frame_push.description]

[/reflect_stack_frame_push]
\`\`\`

在 reflect 环节可以使用 \`create_hook\` 注册 \`when_error\` hook：

\`\`\`
[program]
create_hook("when_error", "inject_message", "分析错误原因并尝试修复")
[/program]
\`\`\`

#### [reflect_stack_frame_pop] - 退出 reflect 内联子栈帧

与 \`[cognize_stack_frame_pop]\` 格式相同。

#### [set_plan] - 更新当前节点的 plan 文本

\`\`\`
[set_plan]
重新规划当前任务：
1. 先激活 lark-wiki trait 获取访问能力
2. 调用 wiki API 获取文档内容
3. 解析文档结构并提取关键信息
4. 整理成结构化的分析报告
5. 通过 talk 回复用户
[/set_plan]
\`\`\`

#### 保留的 API

以下 API 仍可在 \`[program]\` 段落中使用：

| API | 说明 |
|-----|------|
| \`moveFocus(nodeId)\` | 手动移动注意力到指定节点 |
| \`stack_throw(error)\` | 抛出异常，沿栈向上冒泡，触发 \`when_error\` hook |
| \`summary(text)\` | 设置当前节点的摘要文本 |
| \`create_hook(when, type, handler)\` | 注册栈帧级 hook（替代 \`stack_catch\`）|

\`\`\`

- [ ] **Step 2: 提交**

Run:
\`\`\`bash
git add kernel/traits/computable/readme.md
git commit -m "docs: 更新 computable trait 文档，使用新的段落标记格式"
\`\`\`

---

## Task 12: 文档更新 - plannable trait

**Files:**
- Modify: \`kernel/traits/plannable/readme.md\`

- [ ] **Step 1: 移除旧 API 示例**

删除所有使用 \`createPlan\`、\`create_plan_node\`、\`finish_plan_node\`、\`add_stack_frame\`、\`stack_return\` 的示例。

- [ ] **Step 2: 新增段落标记格式示例**

将旧的 JavaScript API 示例替换为新的段落标记格式：

**旧格式（删除）：**
\`\`\`javascript
const root = createPlan("任务名称", "任务的具体目标描述");
create_plan_node(root, "收集信息", "从 3 个来源收集数据", ["web_search"]);
\`\`\`

**新格式（添加）：**
\`\`\`
[cognize_stack_frame_push.title]
收集信息
[/cognize_stack_frame_push.title]

[cognize_stack_frame_push.description]
从 3 个来源收集数据
[/cognize_stack_frame_push.description]

[cognize_stack_frame_push.traits]
web_search
[/cognize_stack_frame_push.traits]

[/cognize_stack_frame_push]
\`\`\`

- [ ] **Step 3: 提交**

Run:
\`\`\`bash
git add kernel/traits/plannable/readme.md
git commit -m "docs: 更新 plannable trait 文档，使用新的段落标记格式"
\`\`\`

---

## Task 13: 文档更新 - cognitive-style trait

**Files:**
- Check/Modify: \`kernel/traits/cognitive-style/readme.md\`

- [ ] **Step 1: 检查是否有旧 API 引用**

Run: \`cat /Users/bytedance/x/ooc/ooc-1/kernel/traits/cognitive-style/readme.md\`

- [ ] **Step 2: 如有需要，更新示例**

移除旧 API 示例，更新为新格式。

- [ ] **Step 3: 提交**

Run:
\`\`\`bash
git add kernel/traits/cognitive-style/readme.md
git commit -m "docs: 更新 cognitive-style trait 文档"
\`\`\`

---

## Task 14: 运行所有测试

**Files:**
- Test: \`kernel/tests/*.test.ts\`

- [ ] **Step 1: 运行所有测试**

Run: \`cd /Users/bytedance/x/ooc/ooc-1/kernel && bun test\`
Expected: 所有测试通过

- [ ] **Step 2: 如失败，修复问题**

---

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 删除旧 API 可能破坏现有会话 | 中 | 只影响新创建的会话，现有会话已记录的 actions 不依赖 API 注册 |
| 解析器逻辑复杂，可能有边界情况 | 中 | 充分的单元测试覆盖各种边界情况 |
| render 格式变化影响 Context | 中 | 验证 renderProcess 输出格式与 LLM 期望一致 |
| 内联节点创建逻辑复杂 | 高 | 分步实现，先实现基本功能，再逐步完善 |

---

## 执行选项

Plan complete and saved to \`docs/superpowers/plans/2026-03-31-cognitive-stack-api-redesign.md\`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?

**If Subagent-Driven chosen:**
- **REQUIRED SUB-SKILL:** Use superpowers:subagent-driven-development
- Fresh subagent per task + two-stage review

**If Inline Execution chosen:**
- **REQUIRED SUB-SKILL:** Use superpowers:executing-plans
- Batch execution with checkpoints for review
