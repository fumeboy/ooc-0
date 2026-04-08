# 线程树架构重构 — 阶段 3：ThinkLoop 重写 + Context 构建

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为每个线程实现独立的 ThinkLoop 执行循环和 Context 构建器，支持 create_sub_thread / return / await / mark / addTodo / set_plan 等新 API。

**Architecture:** 新建 `kernel/src/thread/thinkloop.ts` 和 `kernel/src/thread/context-builder.ts`，不修改现有 `kernel/src/flow/thinkloop.ts` 和 `kernel/src/context/builder.ts`。纯增量，两套系统共存直到迁移完成。

**Tech Stack:** TypeScript, Bun runtime, bun:test

**Spec:** `docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md`

**依赖：**
- 阶段 1（类型 + 持久化）：`kernel/src/thread/types.ts`, `kernel/src/thread/persistence.ts`
- 阶段 2（ThreadsTree CRUD）：`kernel/src/thread/tree.ts`（内存树模型，提供 createNode / completeNode / getNode / getAncestorPath / getScopeChain 等方法）

**阶段总览：**
- 阶段 1：类型与持久化 ✅
- 阶段 2：线程树内存模型 + CRUD
- 阶段 3（本文件）：ThinkLoop 重写 + Context 构建 ← 当前
- 阶段 4：Scheduler 重写
- 阶段 5：协作 API（talk / create_sub_thread_on_node / inbox / Issue）

---

## 文件结构

```
kernel/src/thread/                    ← 已有模块，新增文件
├── types.ts                          ← 阶段 1（已有）
├── persistence.ts                    ← 阶段 1（已有）
├── tree.ts                           ← 阶段 2（已有）
├── context-builder.ts                ← 新建：线程 Context 构建器（~350 行）
├── thinkloop.ts                      ← 新建：线程 ThinkLoop（~500 行）
├── parser.ts                         ← 新建：新指令解析器（~200 行）
├── hooks.ts                          ← 新建：before/after hook 收集与注入（~120 行）
└── index.ts                          ← 更新：新增导出

kernel/tests/
├── thread-context-builder.test.ts    ← 新建：Context 构建器测试（~400 行）
├── thread-thinkloop.test.ts          ← 新建：ThinkLoop 测试（~500 行）
├── thread-parser.test.ts             ← 新建：指令解析器测试（~250 行）
└── thread-hooks.test.ts              ← 新建：Hook 注入测试（~200 行）
```

---

### Task 1: 新指令解析器

**Files:**
- Create: `kernel/src/thread/parser.ts`
- Create: `kernel/tests/thread-parser.test.ts`

**设计说明：**
新 ThinkLoop 需要解析的指令集与旧系统不同。旧系统使用 `cognize_stack_frame_push/pop`，新系统使用 `create_sub_thread / return / await / mark / addTodo / set_plan`。复用旧 parser 的 TOML 解析基础设施（`kernel/src/toml/parser.ts`），但新增指令提取逻辑。

- [ ] **Step 1: 写测试文件**

Create: `kernel/tests/thread-parser.test.ts`

```typescript
/**
 * 线程指令解析器测试
 *
 * 验证从 LLM 输出中提取新线程 API 指令的能力。
 *
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md#4
 */
import { describe, test, expect } from "bun:test";
import {
  parseThreadOutput,
  type ThreadParsedOutput,
} from "../src/thread/parser.js";

describe("parseThreadOutput", () => {
  test("解析 create_sub_thread 指令", () => {
    const input = `
[thought]
content = "需要并行搜索两个主题"

[create_sub_thread]
title = "搜索 AI Safety"
description = "搜索 AI Safety 相关论文"
traits = ["academic_writing"]
`;
    const result = parseThreadOutput(input);
    expect(result.thought).toBe("需要并行搜索两个主题");
    expect(result.createSubThread).not.toBeNull();
    expect(result.createSubThread!.title).toBe("搜索 AI Safety");
    expect(result.createSubThread!.description).toBe("搜索 AI Safety 相关论文");
    expect(result.createSubThread!.traits).toEqual(["academic_writing"]);
  });

  test("解析 return 指令", () => {
    const input = `
[thought]
content = "任务完成，返回结果"

[return]
summary = "找到 3 篇相关论文"

[return.artifacts]
papers = ["paper1.pdf", "paper2.pdf", "paper3.pdf"]
count = 3
`;
    const result = parseThreadOutput(input);
    expect(result.threadReturn).not.toBeNull();
    expect(result.threadReturn!.summary).toBe("找到 3 篇相关论文");
    expect(result.threadReturn!.artifacts).toBeDefined();
    expect(result.threadReturn!.artifacts!.count).toBe(3);
  });

  test("解析 await 指令（单个）", () => {
    const input = `
[await]
thread_id = "thread_abc123"
`;
    const result = parseThreadOutput(input);
    expect(result.awaitThreads).toEqual(["thread_abc123"]);
  });

  test("解析 await_all 指令（多个）", () => {
    const input = `
[await_all]
thread_ids = ["thread_a", "thread_b", "thread_c"]
`;
    const result = parseThreadOutput(input);
    expect(result.awaitThreads).toEqual(["thread_a", "thread_b", "thread_c"]);
  });

  test("解析 mark 指令", () => {
    const input = `
[mark]
message_id = "msg_001"
type = "todo"
tip = "需要后续跟进"
`;
    const result = parseThreadOutput(input);
    expect(result.mark).not.toBeNull();
    expect(result.mark!.messageId).toBe("msg_001");
    expect(result.mark!.type).toBe("todo");
    expect(result.mark!.tip).toBe("需要后续跟进");
  });

  test("解析 addTodo 指令", () => {
    const input = `
[addTodo]
content = "回复 A 的消息"
source_message_id = "msg_002"
`;
    const result = parseThreadOutput(input);
    expect(result.addTodo).not.toBeNull();
    expect(result.addTodo!.content).toBe("回复 A 的消息");
    expect(result.addTodo!.sourceMessageId).toBe("msg_002");
  });

  test("解析 set_plan 指令", () => {
    const input = `
[set_plan]
text = "1. 搜索论文 2. 整理摘要 3. 返回结果"
`;
    const result = parseThreadOutput(input);
    expect(result.setPlan).toBe("1. 搜索论文 2. 整理摘要 3. 返回结果");
  });

  test("解析 program 段（复用旧逻辑）", () => {
    const input = `
[program]
code = """
const result = await search("AI Safety");
print(result);
"""
`;
    const result = parseThreadOutput(input);
    expect(result.program).not.toBeNull();
    expect(result.program!.code).toContain("search");
  });

  test("解析 talk 段（复用旧逻辑）", () => {
    const input = `
[talk]
target = "researcher"
message = "请帮我搜索 AI Safety 论文"
`;
    const result = parseThreadOutput(input);
    expect(result.talk).not.toBeNull();
    expect(result.talk!.target).toBe("researcher");
    expect(result.talk!.message).toContain("AI Safety");
  });

  test("无有效指令时返回空结果", () => {
    const input = "这是一段普通文本，没有任何指令。";
    const result = parseThreadOutput(input);
    expect(result.thought).toBeUndefined();
    expect(result.program).toBeUndefined();
    expect(result.createSubThread).toBeNull();
    expect(result.threadReturn).toBeNull();
    expect(result.awaitThreads).toBeNull();
  });

  test("同时包含 thought + program + create_sub_thread", () => {
    const input = `
[thought]
content = "先执行搜索，再创建子线程分析"

[program]
code = "const data = await fetch('/api');"

[create_sub_thread]
title = "分析数据"
`;
    const result = parseThreadOutput(input);
    expect(result.thought).toBeDefined();
    expect(result.program).not.toBeNull();
    expect(result.createSubThread).not.toBeNull();
    expect(result.createSubThread!.title).toBe("分析数据");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-parser.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现指令解析器**

Create: `kernel/src/thread/parser.ts`

```typescript
/**
 * 线程指令解析器
 *
 * 从 LLM 输出中提取线程树 API 指令。
 * 复用旧 TOML 解析基础设施，新增 create_sub_thread / return / await 等指令。
 *
 * 与旧 parser 的区别：
 * - 删除：cognize_stack_frame_push/pop, reflect_stack_frame_push/pop, finish, wait, break
 * - 新增：create_sub_thread, return, await, await_all, mark, addTodo
 * - 保留：thought, program, talk, set_plan, action
 *
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md#4
 */

import type { ProgramSection, TalkSection, ActionSection } from "../toml/parser.js";
import { parse as parseToml } from "smol-toml";

/** create_sub_thread 指令 */
export interface CreateSubThreadDirective {
  title: string;
  description?: string;
  traits?: string[];
}

/** return 指令 */
export interface ThreadReturnDirective {
  summary: string;
  artifacts?: Record<string, unknown>;
}

/** mark 指令 */
export interface MarkDirective {
  messageId: string;
  type: "ack" | "ignore" | "todo";
  tip: string;
}

/** addTodo 指令 */
export interface AddTodoDirective {
  content: string;
  sourceMessageId?: string;
}

/** 线程输出解析结果 */
export interface ThreadParsedOutput {
  /** 思考内容 */
  thought?: string;
  /** 程序执行 */
  program: ProgramSection | null;
  /** 对话 */
  talk: TalkSection | null;
  /** 工具调用 */
  actions: ActionSection[];
  /** 创建子线程 */
  createSubThread: CreateSubThreadDirective | null;
  /** 线程返回 */
  threadReturn: ThreadReturnDirective | null;
  /** 等待子线程（单个或多个） */
  awaitThreads: string[] | null;
  /** 处理 inbox 消息 */
  mark: MarkDirective | null;
  /** 创建待办 */
  addTodo: AddTodoDirective | null;
  /** 更新计划 */
  setPlan: string | null;
}

/**
 * 解析线程 LLM 输出
 *
 * 单次 TOML 解析，从同一个解析结果中提取旧指令（thought/program/talk）和新指令
 * （create_sub_thread/return/await 等）。避免双重解析的性能浪费。
 *
 * @param output - LLM 原始输出文本
 * @returns 结构化的线程指令
 */
export function parseThreadOutput(output: string): ThreadParsedOutput {
  const result: ThreadParsedOutput = {
    thought: undefined,
    program: null,
    talk: null,
    actions: [],
    createSubThread: null,
    threadReturn: null,
    awaitThreads: null,
    mark: null,
    addTodo: null,
    setPlan: null,
  };

  /* 单次 TOML 解析 */
  const parsed = safeParseToml(output);
  if (!parsed) return result;

  /* === 旧指令（复用旧 parser 的提取逻辑，但从同一个解析结果中读取） === */

  /* thought */
  if (parsed.thought && typeof parsed.thought === "object") {
    const t = parsed.thought as Record<string, unknown>;
    if (typeof t.content === "string") result.thought = t.content;
  }

  /* program */
  if (parsed.program && typeof parsed.program === "object") {
    const p = parsed.program as Record<string, unknown>;
    result.program = { code: typeof p.code === "string" ? p.code : "" } as ProgramSection;
  }

  /* talk */
  if (parsed.talk && typeof parsed.talk === "object") {
    const t = parsed.talk as Record<string, unknown>;
    result.talk = {
      target: typeof t.target === "string" ? t.target : "",
      message: typeof t.message === "string" ? t.message : "",
    } as TalkSection;
  }

  /* set_plan */
  if (parsed.set_plan && typeof parsed.set_plan === "object") {
    const sp = parsed.set_plan as Record<string, unknown>;
    if (typeof sp.text === "string") result.setPlan = sp.text;
  }

  /* === 新指令 === */

  /* create_sub_thread */
  if (parsed.create_sub_thread && typeof parsed.create_sub_thread === "object") {
    const cst = parsed.create_sub_thread as Record<string, unknown>;
    result.createSubThread = {
      title: typeof cst.title === "string" ? cst.title : "",
    };
    if (typeof cst.description === "string") {
      result.createSubThread.description = cst.description;
    }
    if (Array.isArray(cst.traits)) {
      result.createSubThread.traits = cst.traits as string[];
    }
  }

  /* return */
  if (parsed.return && typeof parsed.return === "object") {
    const ret = parsed.return as Record<string, unknown>;
    result.threadReturn = {
      summary: typeof ret.summary === "string" ? ret.summary : "",
    };
    if (typeof ret.artifacts === "object" && ret.artifacts !== null) {
      result.threadReturn.artifacts = ret.artifacts as Record<string, unknown>;
    }
  }

  /* await（单个） */
  if (parsed.await && typeof parsed.await === "object") {
    const aw = parsed.await as Record<string, unknown>;
    if (typeof aw.thread_id === "string") {
      result.awaitThreads = [aw.thread_id];
    }
  }

  /* await_all（多个） */
  if (parsed.await_all && typeof parsed.await_all === "object") {
    const awa = parsed.await_all as Record<string, unknown>;
    if (Array.isArray(awa.thread_ids)) {
      result.awaitThreads = awa.thread_ids as string[];
    }
  }

  /* mark */
  if (parsed.mark && typeof parsed.mark === "object") {
    const m = parsed.mark as Record<string, unknown>;
    result.mark = {
      messageId: typeof m.message_id === "string" ? m.message_id : "",
      type: (typeof m.type === "string" ? m.type : "ack") as "ack" | "ignore" | "todo",
      tip: typeof m.tip === "string" ? m.tip : "",
    };
  }

  /* addTodo */
  if (parsed.addTodo && typeof parsed.addTodo === "object") {
    const td = parsed.addTodo as Record<string, unknown>;
    result.addTodo = {
      content: typeof td.content === "string" ? td.content : "",
    };
    if (typeof td.source_message_id === "string") {
      result.addTodo.sourceMessageId = td.source_message_id;
    }
  }

  return result;
}

/**
 * 安全解析 TOML（失败返回 null）
 */
function safeParseToml(text: string): Record<string, unknown> | null {
  try {
    /* 去掉 toml fence */
    const trimmed = text.trim();
    const match = trimmed.match(/^```(?:toml)?\s*\n([\s\S]*?)\n```$/i);
    const raw = match?.[1] ?? text;

    return parseToml(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-parser.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add kernel/src/thread/parser.ts kernel/tests/thread-parser.test.ts
git commit -m "feat: 线程指令解析器（create_sub_thread / return / await / mark / addTodo）"
```

---

### Task 2: before/after Hook 收集与注入

**Files:**
- Create: `kernel/src/thread/hooks.ts`
- Create: `kernel/tests/thread-hooks.test.ts`

**设计说明：**
新 hook 系统比旧系统大幅简化。旧系统有 `when_stack_push/pop/finish/wait/error` 等多种时机，新系统只有 `before`（create_sub_thread 时注入子线程首轮）和 `after`（return 时注入创建者线程下一轮）。Hook 内容是纯文本 Context 注入，不是可执行代码，天然非递归。

与旧 `collectFrameHooks`（`kernel/src/process/cognitive-stack.ts`）的区别：
- 旧：从 TraitDefinition.hooks 中按 event 收集，per-node once 语义
- 新：从 ThreadFrameHook[]（thread.json 中的 hooks 字段）收集，per-thread once 语义
- 新：额外支持从 scope chain 上的 TraitDefinition.hooks 收集（兼容 trait 级 hook）

- [ ] **Step 1: 写测试文件**

Create: `kernel/tests/thread-hooks.test.ts`

```typescript
/**
 * 线程 Hook 收集与注入测试
 *
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md#7
 */
import { describe, test, expect } from "bun:test";
import {
  collectBeforeHooks,
  collectAfterHooks,
} from "../src/thread/hooks.js";
import type { ThreadFrameHook } from "../src/thread/types.js";
import type { TraitDefinition } from "../src/types/index.js";

/** 构造测试用 trait */
function makeTrait(name: string, hooks?: { before?: string; after?: string }): TraitDefinition {
  const t: TraitDefinition = {
    name,
    type: "how_to_think",
    description: "",
    namespace: "",
    readme: "",
    when: "always",
    deps: [],
    methods: [],
  };
  if (hooks) {
    t.hooks = {};
    if (hooks.before) t.hooks.before = { inject: hooks.before, once: true };
    if (hooks.after) t.hooks.after = { inject: hooks.after, once: true };
  }
  return t;
}

describe("collectBeforeHooks", () => {
  test("从 scope chain traits 收集 before hooks", () => {
    const traits = [
      makeTrait("kernel/verifiable", { before: "开始前，先明确验证标准。" }),
      makeTrait("kernel/computable"),
      makeTrait("academic_writing", { before: "请使用学术写作风格。" }),
    ];
    const scopeChain = ["kernel/verifiable", "kernel/computable", "academic_writing"];
    const firedHooks = new Set<string>();

    const result = collectBeforeHooks(traits, scopeChain, firedHooks);
    expect(result).not.toBeNull();
    expect(result).toContain("验证标准");
    expect(result).toContain("学术写作");
    expect(firedHooks.size).toBe(2);
  });

  test("once hook 不重复触发", () => {
    const traits = [
      makeTrait("kernel/verifiable", { before: "验证标准" }),
    ];
    const scopeChain = ["kernel/verifiable"];
    const firedHooks = new Set<string>(["kernel/verifiable:before"]);

    const result = collectBeforeHooks(traits, scopeChain, firedHooks);
    expect(result).toBeNull();
  });

  test("从 ThreadFrameHook 收集 before hooks", () => {
    const threadHooks: ThreadFrameHook[] = [
      { event: "before", traitName: "custom", content: "自定义 before 提示", once: true },
      { event: "after", traitName: "custom", content: "这是 after，不应出现" },
    ];
    const firedHooks = new Set<string>();

    const result = collectBeforeHooks([], [], firedHooks, threadHooks);
    expect(result).not.toBeNull();
    expect(result).toContain("自定义 before 提示");
    expect(result).not.toContain("after");
  });

  test("scope chain 为空时返回 null", () => {
    const traits = [
      makeTrait("kernel/verifiable", { before: "验证标准" }),
    ];
    const result = collectBeforeHooks(traits, [], new Set());
    expect(result).toBeNull();
  });
});

describe("collectAfterHooks", () => {
  test("从 scope chain traits 收集 after hooks", () => {
    const traits = [
      makeTrait("kernel/reflective", { after: "子任务完成了，有什么值得沉淀的经验？" }),
    ];
    const scopeChain = ["kernel/reflective"];
    const firedHooks = new Set<string>();

    const result = collectAfterHooks(traits, scopeChain, firedHooks);
    expect(result).not.toBeNull();
    expect(result).toContain("经验");
    expect(firedHooks.has("kernel/reflective:after")).toBe(true);
  });

  test("合并 trait hooks 和 thread hooks", () => {
    const traits = [
      makeTrait("kernel/reflective", { after: "反思经验" }),
    ];
    const threadHooks: ThreadFrameHook[] = [
      { event: "after", traitName: "custom", content: "检查输出质量" },
    ];
    const scopeChain = ["kernel/reflective"];
    const firedHooks = new Set<string>();

    const result = collectAfterHooks(traits, scopeChain, firedHooks, threadHooks);
    expect(result).not.toBeNull();
    expect(result).toContain("反思经验");
    expect(result).toContain("检查输出质量");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-hooks.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 Hook 收集器**

Create: `kernel/src/thread/hooks.ts`

```typescript
/**
 * 线程生命周期 Hook 收集与注入
 *
 * 简化版 hook 系统：只有 before 和 after 两种事件。
 * - before：create_sub_thread 时注入子线程首轮 Context
 * - after：return 时注入创建者线程下一轮 Context
 *
 * Hook 内容是纯文本，不是可执行代码，天然非递归。
 *
 * 收集来源：
 * 1. scope chain 上的 TraitDefinition.hooks（trait 级 hook）
 * 2. ThreadFrameHook[]（thread.json 中的 hooks 字段，节点级 hook）
 *
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md#7
 */

import type { TraitDefinition } from "../types/index.js";
import type { ThreadFrameHook } from "./types.js";
import { traitId } from "../trait/activator.js";

/**
 * 收集 before hooks（create_sub_thread 时调用）
 *
 * @param traits - 所有已加载的 trait 定义
 * @param scopeChain - 当前线程的 scope chain（trait 名称列表）
 * @param firedHooks - 已触发的 hook ID 集合（会被修改）
 * @param threadHooks - 线程级 hooks（来自 thread.json）
 * @returns 合并后的注入文本，无 hook 时返回 null
 */
export function collectBeforeHooks(
  traits: TraitDefinition[],
  scopeChain: string[],
  firedHooks: Set<string>,
  threadHooks?: ThreadFrameHook[],
): string | null {
  return collectHooksByEvent("before", traits, scopeChain, firedHooks, threadHooks);
}

/**
 * 收集 after hooks（return 时调用）
 *
 * @param traits - 所有已加载的 trait 定义
 * @param scopeChain - 创建者线程的 scope chain
 * @param firedHooks - 已触发的 hook ID 集合（会被修改）
 * @param threadHooks - 线程级 hooks
 * @returns 合并后的注入文本，无 hook 时返回 null
 */
export function collectAfterHooks(
  traits: TraitDefinition[],
  scopeChain: string[],
  firedHooks: Set<string>,
  threadHooks?: ThreadFrameHook[],
): string | null {
  return collectHooksByEvent("after", traits, scopeChain, firedHooks, threadHooks);
}

/**
 * 按事件类型收集 hooks（内部实现）
 */
function collectHooksByEvent(
  event: "before" | "after",
  traits: TraitDefinition[],
  scopeChain: string[],
  firedHooks: Set<string>,
  threadHooks?: ThreadFrameHook[],
): string | null {
  const injections: string[] = [];
  const scopeSet = new Set(scopeChain);

  /* 1. 从 scope chain 上的 traits 收集 */
  for (const trait of traits) {
    const id = traitId(trait);
    /* 只收集 scope chain 中的 traits 或 always 激活的 traits */
    if (trait.when !== "always" && !scopeSet.has(id)) continue;
    if (!trait.hooks) continue;

    const hook = trait.hooks[event];
    if (!hook) continue;

    const hookId = `${id}:${event}`;
    /* once hook 不重复触发 */
    if (hook.once !== false && firedHooks.has(hookId)) continue;

    injections.push(hook.inject);
    firedHooks.add(hookId);
  }

  /* 2. 从 thread.json 的 hooks 字段收集 */
  if (threadHooks) {
    for (const hook of threadHooks) {
      if (hook.event !== event) continue;

      const hookId = `thread:${hook.traitName}:${event}`;
      if (hook.once !== false && firedHooks.has(hookId)) continue;

      injections.push(hook.content);
      firedHooks.add(hookId);
    }
  }

  if (injections.length === 0) return null;
  return `>>> [系统提示 — ${event}]\n${injections.join("\n\n")}`;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-hooks.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add kernel/src/thread/hooks.ts kernel/tests/thread-hooks.test.ts
git commit -m "feat: 线程 before/after hook 收集与注入"
```

---

### Task 3: 线程 Context 构建器

**Files:**
- Create: `kernel/src/thread/context-builder.ts`
- Create: `kernel/tests/thread-context-builder.test.ts`

**设计说明：**

新 Context 构建器与旧 `kernel/src/context/builder.ts` 完全独立。核心区别：

| 维度 | 旧 builder | 新 builder |
|------|-----------|-----------|
| 输入 | StoneData + FlowData | StoneData + ThreadsTree + ThreadDataFile |
| process | renderProcess(行为树) | 线程自己的 actions 时间线 |
| 结构化遗忘 | focus 路径上的 actions | 当前线程 actions + 其他节点摘要 |
| scope chain | computeScopeChain(process) | 沿祖先链合并 traits |
| 规划视角 | 无 | children 摘要 + inbox + todos |
| 三种创建方式 | 无区分 | create_sub_thread / create_sub_thread_on_node / talk 各有不同初始 process |

新 Context 结构（双视角）：

```
ThreadContext {
  /* === 执行视角 === */
  name: string;                    // Object 名称
  whoAmI: string;                  // 身份描述
  parentExpectation: string;       // 父线程的 title + description
  plan: string;                    // 当前计划（set_plan 设置）
  process: string;                 // actions 时间线（渲染后的文本）
  locals: Record<string, unknown>; // 局部变量
  instructions: ContextWindow[];   // kernel trait readme
  knowledge: ContextWindow[];      // user trait readme + 动态 windows

  /* === 规划视角 === */
  childrenSummary: string;         // 子节点摘要（title + status + summary）
  inbox: ThreadInboxMessage[];     // unread 消息
  todos: ThreadTodoItem[];         // pending 待办
  directory: DirectoryEntry[];     // 通讯录

  /* === 元信息 === */
  scopeChain: string[];            // 激活的 traits
  paths: Record<string, string>;   // 沙箱路径
  status: ThreadStatus;            // 线程状态
}
```

- [ ] **Step 1: 写测试文件**

Create: `kernel/tests/thread-context-builder.test.ts`

```typescript
/**
 * 线程 Context 构建器测试
 *
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md#5
 */
import { describe, test, expect } from "bun:test";
import {
  buildThreadContext,
  renderThreadProcess,
  renderChildrenSummary,
  renderAncestorSummary,
  renderSiblingSummary,
  computeThreadScopeChain,
  type ThreadContextInput,
} from "../src/thread/context-builder.js";
import type {
  ThreadsTreeFile,
  ThreadsTreeNodeMeta,
  ThreadDataFile,
  ThreadAction,
  ThreadInboxMessage,
  ThreadTodoItem,
} from "../src/thread/types.js";

/** 辅助：创建节点元数据 */
function makeNode(id: string, overrides?: Partial<ThreadsTreeNodeMeta>): ThreadsTreeNodeMeta {
  return {
    id,
    title: overrides?.title ?? id,
    status: overrides?.status ?? "running",
    childrenIds: overrides?.childrenIds ?? [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

/** 辅助：创建线程数据 */
function makeThreadData(id: string, actions?: ThreadAction[]): ThreadDataFile {
  return {
    id,
    actions: actions ?? [],
  };
}

describe("computeThreadScopeChain", () => {
  test("Root 节点的 scope chain = Root 自身的 traits", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: {
        r: makeNode("r", { traits: ["kernel/computable", "kernel/talkable"] }),
      },
    };
    const chain = computeThreadScopeChain(tree, "r");
    expect(chain).toEqual(["kernel/computable", "kernel/talkable"]);
  });

  test("三层嵌套：scope chain 沿祖先链合并", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: {
        r: makeNode("r", {
          traits: ["kernel/computable", "kernel/talkable"],
          childrenIds: ["a"],
        }),
        a: makeNode("a", {
          parentId: "r",
          traits: ["academic_writing"],
          childrenIds: ["b"],
        }),
        b: makeNode("b", {
          parentId: "a",
          traits: ["domain/ai_safety"],
          activatedTraits: ["kernel/web_search"],
        }),
      },
    };
    const chain = computeThreadScopeChain(tree, "b");
    expect(chain).toContain("kernel/computable");
    expect(chain).toContain("kernel/talkable");
    expect(chain).toContain("academic_writing");
    expect(chain).toContain("domain/ai_safety");
    expect(chain).toContain("kernel/web_search");
  });

  test("去重：相同 trait 不重复", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: {
        r: makeNode("r", { traits: ["kernel/computable"], childrenIds: ["a"] }),
        a: makeNode("a", { parentId: "r", traits: ["kernel/computable"] }),
      },
    };
    const chain = computeThreadScopeChain(tree, "a");
    const computableCount = chain.filter(t => t === "kernel/computable").length;
    expect(computableCount).toBe(1);
  });
});

describe("renderChildrenSummary", () => {
  test("渲染子节点摘要", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: {
        r: makeNode("r", { childrenIds: ["a", "b"] }),
        a: makeNode("a", { parentId: "r", status: "done", title: "搜索 X", summary: "找到 3 篇论文" }),
        b: makeNode("b", { parentId: "r", status: "running", title: "搜索 Y" }),
      },
    };
    const summary = renderChildrenSummary(tree, "r");
    expect(summary).toContain("搜索 X");
    expect(summary).toContain("done");
    expect(summary).toContain("找到 3 篇论文");
    expect(summary).toContain("搜索 Y");
    expect(summary).toContain("running");
  });

  test("无子节点时返回空字符串", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: { r: makeNode("r") },
    };
    const summary = renderChildrenSummary(tree, "r");
    expect(summary).toBe("");
  });
});

describe("renderAncestorSummary", () => {
  test("渲染祖先节点摘要（Root → 父节点）", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: {
        r: makeNode("r", { title: "Root 任务", status: "running", childrenIds: ["a"] }),
        a: makeNode("a", { parentId: "r", title: "写论文", status: "running", summary: "进行中", childrenIds: ["b"] }),
        b: makeNode("b", { parentId: "a", title: "第二章", status: "running" }),
      },
    };
    const summary = renderAncestorSummary(tree, "b");
    expect(summary).toContain("Root 任务");
    expect(summary).toContain("写论文");
    expect(summary).toContain("进行中");
    expect(summary).not.toContain("第二章"); /* 不含自身 */
  });

  test("Root 节点无祖先，返回空字符串", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: { r: makeNode("r") },
    };
    const summary = renderAncestorSummary(tree, "r");
    expect(summary).toBe("");
  });
});

describe("renderSiblingSummary", () => {
  test("渲染兄弟节点摘要", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: {
        r: makeNode("r", { childrenIds: ["a", "b", "c"] }),
        a: makeNode("a", { parentId: "r", title: "搜索 X", status: "done", summary: "找到 3 篇" }),
        b: makeNode("b", { parentId: "r", title: "搜索 Y", status: "running" }),
        c: makeNode("c", { parentId: "r", title: "搜索 Z", status: "pending" }),
      },
    };
    const summary = renderSiblingSummary(tree, "b");
    expect(summary).toContain("搜索 X");
    expect(summary).toContain("done");
    expect(summary).toContain("找到 3 篇");
    expect(summary).toContain("搜索 Z");
    expect(summary).toContain("pending");
    expect(summary).not.toContain("搜索 Y"); /* 不含自身 */
  });

  test("无兄弟节点时返回空字符串", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: {
        r: makeNode("r", { childrenIds: ["a"] }),
        a: makeNode("a", { parentId: "r" }),
      },
    };
    const summary = renderSiblingSummary(tree, "a");
    expect(summary).toBe("");
  });

  test("Root 节点无兄弟，返回空字符串", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: { r: makeNode("r") },
    };
    const summary = renderSiblingSummary(tree, "r");
    expect(summary).toBe("");
  });
});

describe("renderThreadProcess", () => {
  test("渲染 actions 时间线", () => {
    const actions: ThreadAction[] = [
      { type: "thought", content: "开始思考", timestamp: 1000 },
      { type: "program", content: "search('AI')", result: "found 3", success: true, timestamp: 2000 },
      { type: "inject", content: "=== 父线程上下文 ===", timestamp: 500 },
    ];
    const rendered = renderThreadProcess(actions);
    expect(rendered).toContain("thought");
    expect(rendered).toContain("开始思考");
    expect(rendered).toContain("program");
    expect(rendered).toContain("search");
    expect(rendered).toContain("inject");
  });

  test("空 actions 返回提示文本", () => {
    const rendered = renderThreadProcess([]);
    expect(rendered).toContain("(无历史)");
  });
});

describe("buildThreadContext", () => {
  test("create_sub_thread 方式：初始 process 包含父线程快照", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: {
        r: makeNode("r", { traits: ["kernel/computable"], childrenIds: ["a"] }),
        a: makeNode("a", {
          parentId: "r",
          title: "搜索论文",
          description: "搜索 AI Safety 相关论文",
        }),
      },
    };
    const threadData: ThreadDataFile = {
      id: "a",
      actions: [
        { type: "inject", content: "=== 父线程上下文 ===\n之前讨论了...", timestamp: 1000 },
        { type: "thought", content: "开始搜索", timestamp: 2000 },
      ],
      plan: "1. 搜索 2. 整理",
    };
    const input: ThreadContextInput = {
      tree,
      threadId: "a",
      threadData,
      stone: { name: "researcher", thinkable: { whoAmI: "我是研究员" } } as any,
      directory: [],
      traits: [],
    };
    const ctx = buildThreadContext(input);
    expect(ctx.name).toBe("researcher");
    expect(ctx.whoAmI).toContain("研究员");
    expect(ctx.parentExpectation).toContain("搜索论文");
    expect(ctx.parentExpectation).toContain("AI Safety");
    expect(ctx.plan).toBe("1. 搜索 2. 整理");
    expect(ctx.process).toContain("父线程上下文");
    expect(ctx.process).toContain("开始搜索");
  });

  test("talk 方式：初始 process 为空", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: {
        r: makeNode("r", { childrenIds: ["h"] }),
        h: makeNode("h", {
          parentId: "r",
          title: "处理 A 的请求",
          creatorObjectName: "A",
        }),
      },
    };
    const threadData: ThreadDataFile = {
      id: "h",
      actions: [],
      inbox: [
        { id: "msg1", from: "A", content: "请搜索论文", timestamp: 1000, source: "talk", status: "unread" },
      ],
    };
    const input: ThreadContextInput = {
      tree,
      threadId: "h",
      threadData,
      stone: { name: "B", thinkable: { whoAmI: "我是 B" } } as any,
      directory: [],
      traits: [],
    };
    const ctx = buildThreadContext(input);
    expect(ctx.inbox).toHaveLength(1);
    expect(ctx.inbox[0]!.content).toContain("搜索论文");
  });

  test("规划视角：children + inbox + todos", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: {
        r: makeNode("r", { childrenIds: ["a", "b"] }),
        a: makeNode("a", { parentId: "r", status: "done", title: "子任务 A", summary: "完成" }),
        b: makeNode("b", { parentId: "r", status: "running", title: "子任务 B" }),
      },
    };
    const threadData: ThreadDataFile = {
      id: "r",
      actions: [{ type: "thought", content: "规划中", timestamp: 1000 }],
      inbox: [
        { id: "msg1", from: "X", content: "通知", timestamp: 2000, source: "system", status: "unread" },
      ],
      todos: [
        { id: "todo1", content: "回复 X", status: "pending", createdAt: 3000 },
      ],
    };
    const input: ThreadContextInput = {
      tree,
      threadId: "r",
      threadData,
      stone: { name: "obj", thinkable: { whoAmI: "我是 obj" } } as any,
      directory: [],
      traits: [],
    };
    const ctx = buildThreadContext(input);
    expect(ctx.childrenSummary).toContain("子任务 A");
    expect(ctx.childrenSummary).toContain("done");
    expect(ctx.childrenSummary).toContain("完成");
    expect(ctx.childrenSummary).toContain("子任务 B");
    expect(ctx.inbox).toHaveLength(1);
    expect(ctx.todos).toHaveLength(1);
  });

  test("Root 节点无 parentExpectation", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: { r: makeNode("r", { title: "Root" }) },
    };
    const threadData: ThreadDataFile = { id: "r", actions: [] };
    const input: ThreadContextInput = {
      tree,
      threadId: "r",
      threadData,
      stone: { name: "obj", thinkable: { whoAmI: "我是 obj" } } as any,
      directory: [],
      traits: [],
    };
    const ctx = buildThreadContext(input);
    expect(ctx.parentExpectation).toBe("");
  });

  test("create_sub_thread_on_node 方式：Context 包含目标节点完整历史（Phase 5 完善）", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: {
        r: makeNode("r", { childrenIds: ["c"] }),
        c: makeNode("c", {
          parentId: "r",
          status: "done",
          title: "已完成的任务",
          summary: "产出了文档",
          childrenIds: ["sub"],
        }),
        sub: makeNode("sub", {
          parentId: "c",
          title: "回忆子线程",
          description: "你产出的文档路径在哪？",
        }),
      },
    };
    const targetNodeData: ThreadDataFile = {
      id: "c",
      actions: [
        { type: "thought", content: "我在写文档", timestamp: 1000 },
        { type: "program", content: "writeFile('doc.md')", result: "ok", success: true, timestamp: 2000 },
      ],
    };
    const threadData: ThreadDataFile = { id: "sub", actions: [] };
    const input: ThreadContextInput = {
      tree,
      threadId: "sub",
      threadData,
      stone: { name: "obj", thinkable: { whoAmI: "我是 obj" } } as any,
      directory: [],
      traits: [],
      targetNodeData,
    };
    const ctx = buildThreadContext(input);
    /* Phase 5 完善：验证 targetNodeData 的 actions 被渲染到 Context 中 */
    expect(ctx.parentExpectation).toContain("已完成的任务");
    expect(ctx.parentExpectation).toContain("你产出的文档路径在哪？");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-context-builder.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 Context 构建器**

Create: `kernel/src/thread/context-builder.ts`

```typescript
/**
 * 线程 Context 构建器
 *
 * 为每个线程构建独立的 Context，包含执行视角和规划视角。
 * 与旧 builder（kernel/src/context/builder.ts）完全独立。
 *
 * 执行视角：whoAmI + parentExpectation + plan + process + locals + windows
 * 规划视角：children 摘要 + inbox + todos + directory
 *
 * 三种创建方式的 Context 差异：
 * - create_sub_thread：初始 process = 父线程渲染快照（inject action）
 * - create_sub_thread_on_node：初始 process = 空白 + 目标节点完整历史
 * - talk：初始 process = 空白
 *
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md#5
 */

import type { StoneData, DirectoryEntry, ContextWindow, TraitDefinition } from "../types/index.js";
import type {
  ThreadsTreeFile,
  ThreadsTreeNodeMeta,
  ThreadDataFile,
  ThreadAction,
  ThreadInboxMessage,
  ThreadTodoItem,
  ThreadStatus,
} from "./types.js";
import { getAncestorPath } from "./persistence.js";
import { getActiveTraits, traitId } from "../trait/activator.js";

/** 线程 Context（双视角） */
export interface ThreadContext {
  /* === 执行视角 === */
  /** Object 名称 */
  name: string;
  /** 身份描述 */
  whoAmI: string;
  /** 父线程的期望（title + description） */
  parentExpectation: string;
  /** 当前计划 */
  plan: string;
  /** actions 时间线（渲染后的文本） */
  process: string;
  /** 局部变量 */
  locals: Record<string, unknown>;
  /** 系统指令窗口（kernel trait readme） */
  instructions: ContextWindow[];
  /** 知识窗口（user trait readme + 动态 windows） */
  knowledge: ContextWindow[];

  /* === 规划视角 === */
  /** 子节点摘要 */
  childrenSummary: string;
  /** 祖先节点摘要（Root → 父节点，不含自身） */
  ancestorSummary: string;
  /** 兄弟节点摘要（同一父节点下的其他子节点） */
  siblingSummary: string;
  /** unread inbox 消息 */
  inbox: ThreadInboxMessage[];
  /** pending 待办 */
  todos: ThreadTodoItem[];
  /** 通讯录 */
  directory: DirectoryEntry[];

  /* === 元信息 === */
  /** 激活的 traits（scope chain） */
  scopeChain: string[];
  /** 沙箱路径 */
  paths?: Record<string, string>;
  /** 线程状态 */
  status: ThreadStatus;
}

/** buildThreadContext 的输入参数 */
export interface ThreadContextInput {
  /** 线程树 */
  tree: ThreadsTreeFile;
  /** 当前线程 ID */
  threadId: string;
  /** 当前线程数据 */
  threadData: ThreadDataFile;
  /** Stone 数据 */
  stone: StoneData;
  /** 通讯录 */
  directory: DirectoryEntry[];
  /** 所有已加载的 traits */
  traits: TraitDefinition[];
  /** 额外知识窗口 */
  extraWindows?: ContextWindow[];
  /** 沙箱路径 */
  paths?: Record<string, string>;
  /**
   * 目标节点数据（仅 create_sub_thread_on_node 场景使用）
   *
   * 当通过 create_sub_thread_on_node 创建子线程时，需要将目标节点的
   * 完整 actions 历史展示在 Context 中。Phase 5 完善具体渲染逻辑。
   */
  targetNodeData?: ThreadDataFile;
}

/**
 * 构建线程 Context
 *
 * @param input - 构建参数
 * @returns 完整的线程 Context
 */
export function buildThreadContext(input: ThreadContextInput): ThreadContext {
  const { tree, threadId, threadData, stone, directory, traits, extraWindows, paths } = input;
  const nodeMeta = tree.nodes[threadId];
  if (!nodeMeta) {
    throw new Error(`[buildThreadContext] 节点不存在: ${threadId}`);
  }

  /* 1. scope chain：沿祖先链合并 traits */
  const scopeChain = computeThreadScopeChain(tree, threadId);

  /* 2. 激活 traits */
  const activeTraits = getActiveTraits(traits, scopeChain);
  const KERNEL_TRAIT_IDS = new Set([
    "kernel/computable", "kernel/talkable", "kernel/object_creation",
    "kernel/verifiable", "kernel/debuggable", "kernel/plannable",
    "kernel/reflective", "kernel/web_search", "kernel/testable", "kernel/reviewable",
  ]);

  const instructions: ContextWindow[] = activeTraits
    .filter(t => t.readme && KERNEL_TRAIT_IDS.has(traitId(t)))
    .map(t => ({ name: traitId(t), content: t.readme }));

  const knowledge: ContextWindow[] = activeTraits
    .filter(t => t.readme && !KERNEL_TRAIT_IDS.has(traitId(t)))
    .map(t => ({ name: traitId(t), content: t.readme }));

  if (extraWindows) knowledge.push(...extraWindows);

  /* 3. parentExpectation
   *
   * 语义：用当前节点的 title + description 构成"父线程对我的期望"。
   * 为什么用当前节点的 description 而不是父节点的？
   * 因为 description 是父线程在 create_sub_thread 时指定的，
   * 描述的是"你被要求做什么"，属于当前节点的元数据，
   * 而父节点的 title/description 描述的是父线程自身的任务。
   * parentExpectation = 父节点的 title（提供上级任务名称）
   *                   + 当前节点的 description（提供具体要求）
   */
  let parentExpectation = "";
  if (nodeMeta.parentId) {
    const parent = tree.nodes[nodeMeta.parentId];
    if (parent) {
      parentExpectation = parent.title;
      if (nodeMeta.description) {
        parentExpectation += `\n${nodeMeta.description}`;
      }
    }
  }

  /* 4. process：渲染 actions 时间线 */
  const process = renderThreadProcess(threadData.actions);

  /* 5. 规划视角 */
  const childrenSummary = renderChildrenSummary(tree, threadId);
  const ancestorSummary = renderAncestorSummary(tree, threadId);
  const siblingSummary = renderSiblingSummary(tree, threadId);
  const inbox = (threadData.inbox ?? []).filter(m => m.status === "unread");
  const todos = (threadData.todos ?? []).filter(t => t.status === "pending");

  /* 6. locals：沿祖先链合并 */
  const locals: Record<string, unknown> = {};
  if (threadData.locals) Object.assign(locals, threadData.locals);

  return {
    name: stone.name,
    whoAmI: stone.thinkable.whoAmI,
    parentExpectation,
    plan: threadData.plan ?? "",
    process,
    locals,
    instructions,
    knowledge,
    childrenSummary,
    ancestorSummary,
    siblingSummary,
    inbox,
    todos,
    directory: directory.filter(d => d.name !== stone.name),
    scopeChain,
    paths,
    status: nodeMeta.status,
  };
}

/**
 * 沿祖先链计算 scope chain（合并所有 traits + activatedTraits）
 *
 * 复用阶段 1 的 getAncestorPath（返回 Root → leaf 顺序），
 * 保证 scope chain 的遍历顺序与 spec Section 5.3 一致：
 * Root 的 traits 在前，leaf 的 traits 在后。
 *
 * @param tree - 线程树
 * @param nodeId - 目标节点 ID
 * @returns 去重后的 trait 名称列表（Root → leaf 顺序）
 */
export function computeThreadScopeChain(tree: ThreadsTreeFile, nodeId: string): string[] {
  const path = getAncestorPath(tree, nodeId); /* Root → leaf 顺序 */
  const seen = new Set<string>();
  const result: string[] = [];

  for (const id of path) {
    const node = tree.nodes[id];
    if (!node) continue;

    if (node.traits) {
      for (const t of node.traits) {
        if (!seen.has(t)) { seen.add(t); result.push(t); }
      }
    }
    if (node.activatedTraits) {
      for (const t of node.activatedTraits) {
        if (!seen.has(t)) { seen.add(t); result.push(t); }
      }
    }
  }

  return result;
}

/**
 * 渲染子节点摘要（规划视角）
 *
 * 格式：每个子节点一行，包含 title + status + summary（如有）
 *
 * @param tree - 线程树
 * @param nodeId - 父节点 ID
 * @returns 渲染后的摘要文本，无子节点时返回空字符串
 */
export function renderChildrenSummary(tree: ThreadsTreeFile, nodeId: string): string {
  const node = tree.nodes[nodeId];
  if (!node || node.childrenIds.length === 0) return "";

  const lines: string[] = [];
  for (const childId of node.childrenIds) {
    const child = tree.nodes[childId];
    if (!child) continue;

    let line = `- [${child.status}] ${child.title}`;
    if (child.summary) {
      line += ` — ${child.summary}`;
    }
    lines.push(line);
  }

  return lines.join("\n");
}

/**
 * 渲染祖先节点摘要（从 Root 到父节点，不含自身）
 *
 * 格式：每个祖先节点一行，包含 title + status + summary（如有），
 * 用缩进表示层级关系。
 *
 * @param tree - 线程树
 * @param nodeId - 当前节点 ID
 * @returns 渲染后的摘要文本，Root 节点返回空字符串
 */
export function renderAncestorSummary(tree: ThreadsTreeFile, nodeId: string): string {
  const path = getAncestorPath(tree, nodeId); /* Root → ... → nodeId */
  /* 去掉自身，只保留祖先 */
  const ancestors = path.slice(0, -1);
  if (ancestors.length === 0) return "";

  const lines: string[] = [];
  for (let i = 0; i < ancestors.length; i++) {
    const node = tree.nodes[ancestors[i]!];
    if (!node) continue;

    const indent = "  ".repeat(i);
    let line = `${indent}- [${node.status}] ${node.title}`;
    if (node.summary) {
      line += ` — ${node.summary}`;
    }
    lines.push(line);
  }

  return lines.join("\n");
}

/**
 * 渲染兄弟节点摘要（同一父节点下的其他子节点）
 *
 * @param tree - 线程树
 * @param nodeId - 当前节点 ID
 * @returns 渲染后的摘要文本，无兄弟时返回空字符串
 */
export function renderSiblingSummary(tree: ThreadsTreeFile, nodeId: string): string {
  const node = tree.nodes[nodeId];
  if (!node || !node.parentId) return "";

  const parent = tree.nodes[node.parentId];
  if (!parent) return "";

  const siblings = parent.childrenIds.filter(id => id !== nodeId);
  if (siblings.length === 0) return "";

  const lines: string[] = [];
  for (const sibId of siblings) {
    const sib = tree.nodes[sibId];
    if (!sib) continue;

    let line = `- [${sib.status}] ${sib.title}`;
    if (sib.summary) {
      line += ` — ${sib.summary}`;
    }
    lines.push(line);
  }

  return lines.join("\n");
}

/**
 * 渲染线程 actions 时间线（执行视角的 process）
 *
 * 按时间戳排序，格式化为 LLM 可读的文本。
 * 与旧 renderProcess 的区别：不需要行为树结构，直接渲染 actions 列表。
 *
 * @param actions - 线程的 actions 列表
 * @returns 渲染后的文本
 */
export function renderThreadProcess(actions: ThreadAction[]): string {
  if (actions.length === 0) return "(无历史)";

  /* 按时间戳排序 */
  const sorted = [...actions].sort((a, b) => a.timestamp - b.timestamp);

  const lines: string[] = [];
  for (const action of sorted) {
    const ts = formatTimestamp(action.timestamp);

    switch (action.type) {
      case "thought":
        lines.push(`[${ts}] [thought]`);
        lines.push(action.content);
        lines.push("");
        break;

      case "program":
        lines.push(`[${ts}] [program]`);
        lines.push(action.content);
        if (action.success !== undefined) {
          lines.push(`>>> ${action.success ? "成功" : "失败"}: ${action.result ?? "(无输出)"}`);
        }
        lines.push("");
        break;

      case "inject":
        lines.push(`[${ts}] [inject]`);
        lines.push(action.content);
        lines.push("");
        break;

      case "message_in":
        lines.push(`[${ts}] [message_in]`);
        lines.push(action.content);
        lines.push("");
        break;

      case "message_out":
        lines.push(`[${ts}] [message_out]`);
        lines.push(action.content);
        lines.push("");
        break;

      case "create_thread":
        lines.push(`[${ts}] [create_thread] ${action.content}`);
        lines.push("");
        break;

      case "thread_return":
        lines.push(`[${ts}] [thread_return] ${action.content}`);
        lines.push("");
        break;

      case "set_plan":
        lines.push(`[${ts}] [set_plan] ${action.content}`);
        lines.push("");
        break;

      case "action":
        lines.push(`[${ts}] [action]`);
        lines.push(action.content);
        if (action.result) {
          const statusTag = action.success === false ? "❌" : "✓";
          lines.push(`>>> ${statusTag} ${action.result}`);
        }
        lines.push("");
        break;

      default:
        lines.push(`[${ts}] [${action.type}] ${action.content}`);
        lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * 格式化时间戳为 HH:MM:SS
 */
function formatTimestamp(timestamp: number): string {
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-context-builder.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: 运行全量测试确认无回归**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test`
Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add kernel/src/thread/context-builder.ts kernel/tests/thread-context-builder.test.ts
git commit -m "feat: 线程 Context 构建器（双视角：执行 + 规划，scope chain 沿祖先链继承）"
```

---

### Task 4: 线程 ThinkLoop

**Files:**
- Create: `kernel/src/thread/thinkloop.ts`
- Create: `kernel/tests/thread-thinkloop.test.ts`

**设计说明：**

新 ThinkLoop 是每个线程独立的执行循环。与旧 ThinkLoop（`kernel/src/flow/thinkloop.ts`，2172 行）相比，新版大幅简化：

| 维度 | 旧 ThinkLoop | 新 ThinkLoop |
|------|-------------|-------------|
| 行数 | ~2172 行 | ~500 行 |
| 状态管理 | Flow 级别（单线程） | 线程级别（独立） |
| 栈帧操作 | push/pop + inline_before/after | create_sub_thread / return |
| 终止条件 | finish / wait / break | return（done）/ await（waiting）/ error（failed） |
| Hook 系统 | 6 种时机 | 2 种（before / after） |
| 暂停恢复 | _pendingOutput 机制 | 不需要（Scheduler 控制） |
| 并发线程 | threadId hack | 天然独立 |

核心循环（单轮迭代）：
```
1. 构建 ThreadContext（调用 buildThreadContext）
2. 格式化为 system prompt + messages（复用旧 formatter）
3. 调用 LLM
4. 解析输出（调用 parseThreadOutput）
5. 执行 actions：
   a. thought → recordAction
   b. program → CodeExecutor 执行 → recordAction
   c. talk → collaboration.talk() → recordAction
   d. action → MethodRegistry 执行 → recordAction
   e. create_sub_thread → 创建子节点 + 注入 before hooks → recordAction
   f. return → 完成节点 + 注入 after hooks → 线程状态 → done
   g. await/await_all → 设置 awaitingChildren → 线程状态 → waiting
   h. mark → 更新 inbox 消息状态
   i. addTodo → 创建待办项
   j. set_plan → 更新计划文本
6. 保存 thread.json
7. 检查终止条件（status !== running → 退出循环）
```

- [ ] **Step 1: 写测试文件**

Create: `kernel/tests/thread-thinkloop.test.ts`

```typescript
/**
 * 线程 ThinkLoop 测试
 *
 * 使用 mock LLM 验证 ThinkLoop 的核心循环逻辑。
 * 不测试真实 LLM 调用，只测试指令解析 → 状态变更的正确性。
 *
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md#6
 */
import { describe, test, expect, beforeEach } from "bun:test";
import {
  runThreadIteration,
  type ThreadIterationInput,
  type ThreadIterationResult,
} from "../src/thread/thinkloop.js";
import type {
  ThreadsTreeFile,
  ThreadsTreeNodeMeta,
  ThreadDataFile,
  ThreadAction,
} from "../src/thread/types.js";

/** 辅助：创建节点元数据 */
function makeNode(id: string, overrides?: Partial<ThreadsTreeNodeMeta>): ThreadsTreeNodeMeta {
  return {
    id,
    title: overrides?.title ?? id,
    status: overrides?.status ?? "running",
    childrenIds: overrides?.childrenIds ?? [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe("runThreadIteration — create_sub_thread", () => {
  test("解析 create_sub_thread 后创建子节点并记录 action", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: {
        r: makeNode("r", { traits: ["kernel/computable"] }),
      },
    };
    const threadData: ThreadDataFile = { id: "r", actions: [] };

    const llmOutput = `
[thought]
content = "需要创建子线程搜索"

[create_sub_thread]
title = "搜索 AI Safety"
description = "搜索相关论文"
traits = ["academic_writing"]
`;

    const input: ThreadIterationInput = {
      tree,
      threadId: "r",
      threadData,
      llmOutput,
      stone: { name: "obj", thinkable: { whoAmI: "test" } } as any,
      traits: [],
    };

    const result = runThreadIteration(input);

    /* 验证子节点被创建 */
    expect(result.newChildNode).not.toBeNull();
    expect(result.newChildNode!.title).toBe("搜索 AI Safety");
    expect(result.newChildNode!.traits).toEqual(["academic_writing"]);
    expect(result.newChildNode!.status).toBe("pending");

    /* 验证 action 被记录 */
    const createAction = result.newActions.find(a => a.type === "create_thread");
    expect(createAction).toBeDefined();
    expect(createAction!.content).toContain("搜索 AI Safety");

    /* 线程状态不变（继续 running） */
    expect(result.statusChange).toBeNull();
  });
});

describe("runThreadIteration — return", () => {
  test("解析 return 后线程状态变为 done", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: {
        r: makeNode("r", { childrenIds: ["a"] }),
        a: makeNode("a", { parentId: "r", title: "子任务" }),
      },
    };
    const threadData: ThreadDataFile = { id: "a", actions: [] };

    const llmOutput = `
[return]
summary = "任务完成，找到 3 篇论文"

[return.artifacts]
count = 3
`;

    const input: ThreadIterationInput = {
      tree,
      threadId: "a",
      threadData,
      llmOutput,
      stone: { name: "obj", thinkable: { whoAmI: "test" } } as any,
      traits: [],
    };

    const result = runThreadIteration(input);

    expect(result.statusChange).toBe("done");
    expect(result.returnResult).not.toBeNull();
    expect(result.returnResult!.summary).toBe("任务完成，找到 3 篇论文");
    expect(result.returnResult!.artifacts).toEqual({ count: 3 });

    /* 验证 thread_return action 被记录 */
    const returnAction = result.newActions.find(a => a.type === "thread_return");
    expect(returnAction).toBeDefined();
  });
});

describe("runThreadIteration — await", () => {
  test("解析 await 后线程状态变为 waiting", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: {
        r: makeNode("r", { childrenIds: ["a"] }),
        a: makeNode("a", { parentId: "r", status: "running" }),
      },
    };
    const threadData: ThreadDataFile = { id: "r", actions: [] };

    const llmOutput = `
[await]
thread_id = "a"
`;

    const input: ThreadIterationInput = {
      tree,
      threadId: "r",
      threadData,
      llmOutput,
      stone: { name: "obj", thinkable: { whoAmI: "test" } } as any,
      traits: [],
    };

    const result = runThreadIteration(input);

    expect(result.statusChange).toBe("waiting");
    expect(result.awaitingChildren).toEqual(["a"]);
  });

  test("解析 await_all 后设置多个等待目标", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: {
        r: makeNode("r", { childrenIds: ["a", "b"] }),
        a: makeNode("a", { parentId: "r" }),
        b: makeNode("b", { parentId: "r" }),
      },
    };
    const threadData: ThreadDataFile = { id: "r", actions: [] };

    const llmOutput = `
[await_all]
thread_ids = ["a", "b"]
`;

    const input: ThreadIterationInput = {
      tree,
      threadId: "r",
      threadData,
      llmOutput,
      stone: { name: "obj", thinkable: { whoAmI: "test" } } as any,
      traits: [],
    };

    const result = runThreadIteration(input);

    expect(result.statusChange).toBe("waiting");
    expect(result.awaitingChildren).toEqual(["a", "b"]);
  });
});

describe("runThreadIteration — mark + addTodo", () => {
  test("mark 更新 inbox 消息状态", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: { r: makeNode("r") },
    };
    const threadData: ThreadDataFile = {
      id: "r",
      actions: [],
      inbox: [
        { id: "msg1", from: "A", content: "你好", timestamp: 1000, source: "talk", status: "unread" },
      ],
    };

    const llmOutput = `
[mark]
message_id = "msg1"
type = "ack"
tip = "已收到"
`;

    const input: ThreadIterationInput = {
      tree,
      threadId: "r",
      threadData,
      llmOutput,
      stone: { name: "obj", thinkable: { whoAmI: "test" } } as any,
      traits: [],
    };

    const result = runThreadIteration(input);

    /* 验证 inbox 消息被标记 */
    expect(result.inboxUpdates).toHaveLength(1);
    expect(result.inboxUpdates[0]!.messageId).toBe("msg1");
    expect(result.inboxUpdates[0]!.mark.type).toBe("ack");
  });

  test("addTodo 创建待办项", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: { r: makeNode("r") },
    };
    const threadData: ThreadDataFile = { id: "r", actions: [] };

    const llmOutput = `
[addTodo]
content = "回复 A 的消息"
source_message_id = "msg1"
`;

    const input: ThreadIterationInput = {
      tree,
      threadId: "r",
      threadData,
      llmOutput,
      stone: { name: "obj", thinkable: { whoAmI: "test" } } as any,
      traits: [],
    };

    const result = runThreadIteration(input);

    expect(result.newTodos).toHaveLength(1);
    expect(result.newTodos[0]!.content).toBe("回复 A 的消息");
    expect(result.newTodos[0]!.sourceMessageId).toBe("msg1");
  });
});

describe("runThreadIteration — set_plan", () => {
  test("set_plan 更新计划文本", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: { r: makeNode("r") },
    };
    const threadData: ThreadDataFile = { id: "r", actions: [] };

    const llmOutput = `
[set_plan]
text = "1. 搜索 2. 分析 3. 总结"
`;

    const input: ThreadIterationInput = {
      tree,
      threadId: "r",
      threadData,
      llmOutput,
      stone: { name: "obj", thinkable: { whoAmI: "test" } } as any,
      traits: [],
    };

    const result = runThreadIteration(input);

    expect(result.planUpdate).toBe("1. 搜索 2. 分析 3. 总结");
  });
});

describe("runThreadIteration — thought only", () => {
  test("纯思考输出：记录 thought action，状态不变", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: { r: makeNode("r") },
    };
    const threadData: ThreadDataFile = { id: "r", actions: [] };

    const llmOutput = `
[thought]
content = "让我想想下一步该做什么..."
`;

    const input: ThreadIterationInput = {
      tree,
      threadId: "r",
      threadData,
      llmOutput,
      stone: { name: "obj", thinkable: { whoAmI: "test" } } as any,
      traits: [],
    };

    const result = runThreadIteration(input);

    expect(result.statusChange).toBeNull();
    const thoughtAction = result.newActions.find(a => a.type === "thought");
    expect(thoughtAction).toBeDefined();
    expect(thoughtAction!.content).toContain("让我想想");
  });
});

describe("runThreadIteration — before hooks", () => {
  test("create_sub_thread 时收集 before hooks 注入子线程", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: {
        r: makeNode("r", { traits: ["kernel/verifiable"] }),
      },
    };
    const threadData: ThreadDataFile = { id: "r", actions: [] };

    const llmOutput = `
[create_sub_thread]
title = "验证结果"
`;

    const traits = [{
      name: "kernel/verifiable",
      type: "how_to_think" as const,
      description: "",
      namespace: "kernel",
      readme: "",
      when: "always" as const,
      deps: [],
      methods: [],
      hooks: {
        before: { inject: "开始前，先明确验证标准。", once: true },
      },
    }];

    const input: ThreadIterationInput = {
      tree,
      threadId: "r",
      threadData,
      llmOutput,
      stone: { name: "obj", thinkable: { whoAmI: "test" } } as any,
      traits,
    };

    const result = runThreadIteration(input);

    expect(result.newChildNode).not.toBeNull();
    expect(result.beforeHookInjection).not.toBeNull();
    expect(result.beforeHookInjection).toContain("验证标准");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-thinkloop.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 ThinkLoop**

Create: `kernel/src/thread/thinkloop.ts`

```typescript
/**
 * 线程 ThinkLoop —— 每个线程独立的执行循环
 *
 * 核心循环：构建 Context → 调用 LLM → 解析输出 → 执行 actions → 记录 → 检查终止条件
 *
 * 与旧 ThinkLoop（kernel/src/flow/thinkloop.ts）的区别：
 * - 每个线程独立执行，不共享 Flow 状态
 * - 使用 create_sub_thread / return 替代 push / pop
 * - 使用 await / await_all 替代 wait
 * - 终止条件：return → done, await → waiting, error → failed
 * - 不需要暂停恢复机制（Scheduler 控制）
 *
 * 本模块只实现「单轮迭代」的纯函数 runThreadIteration。
 * 完整的 async loop 由阶段 4 的 Scheduler 驱动。
 *
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md#6
 */

import type { StoneData, TraitDefinition } from "../types/index.js";
import type {
  ThreadsTreeFile,
  ThreadsTreeNodeMeta,
  ThreadDataFile,
  ThreadAction,
  ThreadResult,
  ThreadInboxMessage,
  ThreadTodoItem,
  ThreadStatus,
} from "./types.js";
import { parseThreadOutput } from "./parser.js";
import type { ProgramSection, TalkSection } from "../toml/parser.js";
import { collectBeforeHooks, collectAfterHooks } from "./hooks.js";
import { computeThreadScopeChain } from "./context-builder.js";

/** 单轮迭代的输入 */
export interface ThreadIterationInput {
  /** 线程树（只读，本函数不修改） */
  tree: ThreadsTreeFile;
  /** 当前线程 ID */
  threadId: string;
  /** 当前线程数据（只读，本函数不修改） */
  threadData: ThreadDataFile;
  /** LLM 输出文本（由调用方负责调用 LLM） */
  llmOutput: string;
  /** Stone 数据 */
  stone: StoneData;
  /** 所有已加载的 traits */
  traits: TraitDefinition[];
  /** 已触发的 hooks（可选，跨轮次传递） */
  firedHooks?: Set<string>;
}

/** inbox 消息更新 */
export interface InboxUpdate {
  messageId: string;
  mark: {
    type: "ack" | "ignore" | "todo";
    tip: string;
    markedAt: number;
  };
}

/** 新创建的子节点信息 */
export interface NewChildNode {
  /** 子节点 ID（由本函数生成） */
  id: string;
  title: string;
  description?: string;
  traits?: string[];
  status: ThreadStatus;
  parentId: string;
  /** 创建者线程 ID */
  creatorThreadId: string;
}

/** 单轮迭代的输出（纯数据，不含副作用） */
export interface ThreadIterationResult {
  /** 新增的 actions（需要追加到 threadData.actions） */
  newActions: ThreadAction[];
  /** 线程状态变更（null = 不变，继续 running） */
  statusChange: ThreadStatus | null;
  /** return 结果（仅当 statusChange === "done" 时有值） */
  returnResult: ThreadResult | null;
  /** 等待的子线程 ID 列表（仅当 statusChange === "waiting" 时有值） */
  awaitingChildren: string[] | null;
  /** 新创建的子节点（需要写入 threads.json） */
  newChildNode: NewChildNode | null;
  /** before hook 注入文本（需要写入子线程的首条 inject action） */
  beforeHookInjection: string | null;
  /** after hook 注入文本（需要写入创建者线程的下一轮 inject action） */
  afterHookInjection: string | null;
  /** inbox 消息更新 */
  inboxUpdates: InboxUpdate[];
  /** 新增的待办项 */
  newTodos: ThreadTodoItem[];
  /** 计划更新（null = 不变） */
  planUpdate: string | null;
  /**
   * 解析出的 program 段（需要 Scheduler 异步执行 CodeExecutor）
   * 本函数不执行 program，只传递解析结果给调用方。
   */
  program: ProgramSection | null;
  /**
   * 解析出的 talk 段（需要 Scheduler 异步执行 collaboration.talk()）
   * 本函数不执行 talk，只传递解析结果给调用方。
   */
  talks: TalkSection | null;
}

/**
 * 执行单轮迭代（纯函数，不产生副作用）
 *
 * 调用方（Scheduler）负责：
 * 1. 调用 LLM 获取 llmOutput
 * 2. 调用本函数获取 result
 * 3. 根据 result 更新 threadData / tree / 持久化
 *
 * @param input - 迭代输入
 * @returns 迭代结果
 */
export function runThreadIteration(input: ThreadIterationInput): ThreadIterationResult {
  const { tree, threadId, threadData, llmOutput, stone, traits } = input;
  const firedHooks = input.firedHooks ?? new Set<string>();

  const result: ThreadIterationResult = {
    newActions: [],
    statusChange: null,
    returnResult: null,
    awaitingChildren: null,
    newChildNode: null,
    beforeHookInjection: null,
    afterHookInjection: null,
    inboxUpdates: [],
    newTodos: [],
    planUpdate: null,
    program: null,
    talks: null,
  };

  /* 1. 解析 LLM 输出 */
  const parsed = parseThreadOutput(llmOutput);

  /* 2. 记录 thought */
  if (parsed.thought) {
    result.newActions.push({
      type: "thought",
      content: parsed.thought,
      timestamp: Date.now(),
    });
  }

  /* 3. 处理 set_plan */
  if (parsed.setPlan) {
    result.planUpdate = parsed.setPlan;
    result.newActions.push({
      type: "set_plan",
      content: parsed.setPlan,
      timestamp: Date.now(),
    });
  }

  /* 4. 处理 mark */
  if (parsed.mark) {
    result.inboxUpdates.push({
      messageId: parsed.mark.messageId,
      mark: {
        type: parsed.mark.type,
        tip: parsed.mark.tip,
        markedAt: Date.now(),
      },
    });
  }

  /* 5. 处理 addTodo */
  if (parsed.addTodo) {
    result.newTodos.push({
      id: `todo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      content: parsed.addTodo.content,
      sourceMessageId: parsed.addTodo.sourceMessageId,
      status: "pending",
      createdAt: Date.now(),
    });
  }

  /* 6. 处理 create_sub_thread */
  if (parsed.createSubThread) {
    const childId = `thread_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const cst = parsed.createSubThread;

    result.newChildNode = {
      id: childId,
      title: cst.title,
      description: cst.description,
      traits: cst.traits,
      status: "pending",
      parentId: threadId,
      creatorThreadId: threadId,
    };

    result.newActions.push({
      type: "create_thread",
      content: `[create_sub_thread] ${cst.title} → ${childId}`,
      timestamp: Date.now(),
    });

    /* 收集 before hooks（注入子线程首轮 Context） */
    const scopeChain = computeThreadScopeChain(tree, threadId);
    /* 子线程的 scope chain = 父 scope chain + 子线程自身 traits */
    const childScopeChain = [...scopeChain, ...(cst.traits ?? [])];
    const beforeInjection = collectBeforeHooks(traits, childScopeChain, firedHooks);
    if (beforeInjection) {
      result.beforeHookInjection = beforeInjection;
    }
  }

  /* 7. 处理 return */
  if (parsed.threadReturn) {
    const ret = parsed.threadReturn;
    result.statusChange = "done";
    result.returnResult = {
      summary: ret.summary,
      artifacts: ret.artifacts,
      status: "done",
    };

    result.newActions.push({
      type: "thread_return",
      content: `[return] ${ret.summary}`,
      timestamp: Date.now(),
    });

    /* 收集 after hooks（注入创建者线程下一轮 Context） */
    const nodeMeta = tree.nodes[threadId];
    if (nodeMeta?.creatorThreadId) {
      const creatorScopeChain = computeThreadScopeChain(tree, nodeMeta.creatorThreadId);
      const afterInjection = collectAfterHooks(traits, creatorScopeChain, firedHooks);
      if (afterInjection) {
        result.afterHookInjection = afterInjection;
      }
    }

    return result; /* return 后立即退出，不再处理其他指令 */
  }

  /* 8. 处理 await / await_all */
  if (parsed.awaitThreads && parsed.awaitThreads.length > 0) {
    result.statusChange = "waiting";
    result.awaitingChildren = parsed.awaitThreads;
    return result; /* await 后立即退出 */
  }

  /* 9. 传递 program 和 talk 给调用方（Scheduler）
   *    本函数不执行它们（需要异步 IO），只标记解析结果。
   *    Scheduler 的 runOneIteration 负责调用 CodeExecutor / collaboration.talk()，
   *    并在执行后生成对应的 recordAction。
   */
  if (parsed.program) result.program = parsed.program;
  if (parsed.talk) result.talks = parsed.talk;

  return result;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-thinkloop.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add kernel/src/thread/thinkloop.ts kernel/tests/thread-thinkloop.test.ts
git commit -m "feat: 线程 ThinkLoop 单轮迭代（纯函数，create_sub_thread / return / await / mark / addTodo）"
```

---

### Task 5: 模块导出更新 + 全量测试

**Files:**
- Update: `kernel/src/thread/index.ts`

- [ ] **Step 1: 更新模块导出**

Update: `kernel/src/thread/index.ts`

```typescript
/**
 * 线程树模块
 *
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md
 */

/* 阶段 1: 类型 + 持久化 */
export * from "./types.js";
export * from "./persistence.js";

/* 阶段 2: 内存树模型 */
export * from "./tree.js";

/* 阶段 3: ThinkLoop + Context 构建 */
export * from "./parser.js";
export * from "./hooks.js";
export * from "./context-builder.js";
export * from "./thinkloop.js";
```

- [ ] **Step 2: 运行全量测试确认无回归**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test`
Expected: 全部 PASS（新模块不影响现有代码）

- [ ] **Step 3: Commit**

```bash
git add kernel/src/thread/index.ts
git commit -m "feat: 线程树模块导出更新（阶段 3 完成）"
```

---

## 阶段 3 完成标准

- [ ] `kernel/src/thread/parser.ts` — 线程指令解析器（create_sub_thread / return / await / mark / addTodo / set_plan）
- [ ] `kernel/src/thread/hooks.ts` — before/after hook 收集与注入
- [ ] `kernel/src/thread/context-builder.ts` — 线程 Context 构建器（双视角 + scope chain + 三种创建方式差异）
- [ ] `kernel/src/thread/thinkloop.ts` — 线程 ThinkLoop 单轮迭代（纯函数）
- [ ] `kernel/src/thread/index.ts` — 模块导出更新
- [ ] `kernel/tests/thread-parser.test.ts` — 全部测试通过
- [ ] `kernel/tests/thread-hooks.test.ts` — 全部测试通过
- [ ] `kernel/tests/thread-context-builder.test.ts` — 全部测试通过
- [ ] `kernel/tests/thread-thinkloop.test.ts` — 全部测试通过
- [ ] `bun test` 全量测试无回归

## 阶段 3 → 阶段 4 的衔接

阶段 3 产出的是「单轮迭代」的纯函数。阶段 4（Scheduler 重写）需要：

1. **驱动循环**：`while (status === "running") { buildContext → callLLM → runThreadIteration → applyResult }`
2. **program 执行**：在 `runThreadIteration` 返回后，检查 `result.program`，调用 `CodeExecutor` 执行
3. **talk 执行**：在 `runThreadIteration` 返回后，检查 `result.talks`，调用 `collaboration.talk()`
4. **状态同步**：将 `ThreadIterationResult` 的各字段写入 `threadData`（actions / inbox / todos / plan）和 `tree`（新子节点 / 状态变更）
5. **持久化**：每轮迭代后 flush `thread.json` 和 `threads.json`
6. **唤醒机制**：子线程 done 时检查父线程的 `awaitingChildren`，全部完成则唤醒
7. **firedHooks 持久化**：`runThreadIteration` 接受 `firedHooks: Set<string>` 参数，用于跨轮次追踪已触发的 once hook。Scheduler 需要：
   - 在线程首次启动时创建空 `Set<string>`
   - 每轮迭代传入同一个 `firedHooks` 实例（`runThreadIteration` 会修改它）
   - 线程挂起（waiting）时，将 `firedHooks` 序列化为 `string[]` 保存到 `thread.json`（新增 `firedHooks` 字段）
   - 线程唤醒时，从 `thread.json` 反序列化恢复 `Set<string>`
   - 这保证 once hook 在线程生命周期内只触发一次，即使跨越 waiting/running 状态转换
