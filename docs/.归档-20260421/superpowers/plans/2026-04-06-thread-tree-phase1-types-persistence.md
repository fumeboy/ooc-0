# 线程树架构重构 — 阶段 1：类型与持久化

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 定义线程树的全部类型，实现 threads.json + thread.json 的持久化读写层

**Architecture:** 新建 `kernel/src/thread/` 模块，包含类型定义、持久化读写、内存树模型。不修改现有代码，纯增量。

**Tech Stack:** TypeScript, Bun runtime, bun:test

**Spec:** `docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md`

**阶段总览：**
- 阶段 1（本文件）：类型与持久化 ← 当前
- 阶段 2：线程树内存模型 + CRUD
- 阶段 3：ThinkLoop 重写 + Context 构建
- 阶段 4：Scheduler 重写
- 阶段 5：协作 API（talk / create_sub_thread_on_node / inbox / Issue）

---

## 文件结构

```
kernel/src/thread/           ← 新模块
├── types.ts                 ← 所有线程树相关类型定义（~120 行）
├── persistence.ts           ← threads.json + thread.json 的读写（~200 行）
└── index.ts                 ← 模块导出

kernel/tests/
└── thread-persistence.test.ts  ← 持久化层测试（~250 行）
```

---

### Task 1: 类型定义

**Files:**
- Create: `kernel/src/thread/types.ts`

- [ ] **Step 1: 写类型定义文件**

```typescript
/**
 * 线程树类型定义
 *
 * 核心概念：Node = Thread = 栈帧
 * 每个 ProcessNode 同时是行为树节点、独立线程、认知栈帧。
 *
 * 命名约定：所有新类型以 Thread 前缀命名，避免与旧类型（Action, TodoItem, FrameHook）冲突。
 * 旧类型在 kernel/src/types/ 中，重构完成后将被删除。过渡期间两套类型共存。
 *
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md#3
 */

/** 线程状态 */
export type ThreadStatus = "pending" | "running" | "waiting" | "done" | "failed";

/** 线程句柄（create_sub_thread 的返回值） */
export type ThreadHandle = string;

/** 线程树结构索引（threads.json） */
export interface ThreadsTreeFile {
  rootId: string;
  nodes: Record<string, ThreadsTreeNodeMeta>;
}

/** 线程树节点元数据（不含 actions，存储在 threads.json 中） */
export interface ThreadsTreeNodeMeta {
  id: string;
  title: string;
  description?: string;
  status: ThreadStatus;
  parentId?: string;
  childrenIds: string[];

  /** 认知栈：静态 traits（create_sub_thread 时指定） */
  traits?: string[];
  /** 认知栈：动态激活的 traits */
  activatedTraits?: string[];

  /** 输出契约 */
  outputs?: string[];
  outputDescription?: string;

  /** 完成摘要（结构化遗忘） */
  summary?: string;

  /** 正在等待的子线程 ID 列表 */
  awaitingChildren?: string[];

  /** 创建者线程 ID（用于失败通知路由） */
  creatorThreadId?: string;
  /** 创建者所属 Object（跨 Object 时） */
  creatorObjectName?: string;

  /** 跨 Object talk 关联（仅 talk 创建的处理节点有此字段） */
  linkedWaitingNodeId?: string;
  linkedWaitingObjectName?: string;

  createdAt: number;
  updatedAt: number;
}

/** 单个线程的运行时数据（thread.json） */
export interface ThreadDataFile {
  id: string;
  actions: ThreadAction[];
  locals?: Record<string, unknown>;
  plan?: string;
  inbox?: ThreadInboxMessage[];
  todos?: ThreadTodoItem[];
  hooks?: ThreadFrameHook[];
}

/**
 * 线程 Action（替代旧 Action 类型）
 *
 * 与旧 Action 的区别：
 * - 新增 create_thread / thread_return 类型
 * - 删除 pause / stack_push / stack_pop 类型（不再需要）
 */
export interface ThreadAction {
  id?: string;
  type:
    | "thought"
    | "program"
    | "action"
    | "message_in"
    | "message_out"
    | "inject"
    | "set_plan"
    | "create_thread"
    | "thread_return";
  timestamp: number;
  content: string;
  result?: string;
  success?: boolean;
}

/**
 * 线程 inbox 消息（新类型，旧系统无对应）
 */
export interface ThreadInboxMessage {
  id: string;
  from: string;
  content: string;
  timestamp: number;
  source: "talk" | "issue" | "thread_error" | "system";
  issueId?: string;
  status: "unread" | "marked";
  mark?: {
    type: "ack" | "ignore" | "todo";
    tip: string;
    markedAt: number;
  };
}

/**
 * 线程待办项（替代旧 TodoItem 类型）
 *
 * 与旧 TodoItem 的区别：
 * - 旧：{ nodeId, title, source } — 挂在 Process 上的全局 todo 队列
 * - 新：{ id, content, status, sourceMessageId } — 挂在节点上的局部 todo
 */
export interface ThreadTodoItem {
  id: string;
  content: string;
  sourceMessageId?: string;
  status: "pending" | "done";
  createdAt: number;
  doneAt?: number;
}

/**
 * 线程生命周期钩子（替代旧 FrameHook 类型）
 *
 * 与旧 FrameHook 的区别：
 * - 旧：{ id, when: HookTime, type: HookType, handler } — 复杂的 hook 系统
 * - 新：{ event, traitName, content, once } — 简化为纯文本 Context 注入
 */
export interface ThreadFrameHook {
  event: "before" | "after";
  traitName: string;
  content: string;
  once?: boolean;
}

/** 子线程的返回结果 */
export interface ThreadResult {
  summary: string;
  artifacts?: Record<string, unknown>;
  status: "done" | "failed";
}
```

- [ ] **Step 2: 确认类型文件无语法错误**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bunx tsc --noEmit src/thread/types.ts`
Expected: 无错误输出

- [ ] **Step 3: Commit**

```bash
git add kernel/src/thread/types.ts
git commit -m "feat: 线程树类型定义（ThreadsTreeFile, ThreadDataFile, InboxMessage, TodoItem）"
```

---

### Task 2: 持久化读写

**Files:**
- Create: `kernel/src/thread/persistence.ts`

- [ ] **Step 1: 写测试文件（包含所有测试用例）**

Create: `kernel/tests/thread-persistence.test.ts`

```typescript
/**
 * 线程树持久化层测试
 *
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md#10
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  readThreadsTree,
  writeThreadsTree,
  readThreadData,
  writeThreadData,
  getThreadDir,
  ensureThreadDir,
  getAncestorPath,
} from "../src/thread/persistence.js";
import type { ThreadsTreeFile, ThreadDataFile } from "../src/thread/types.js";

const TEST_DIR = join(import.meta.dir, ".tmp_thread_persist_test");

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("threads.json 读写", () => {
  test("写入并读取 threads.json", () => {
    const tree: ThreadsTreeFile = {
      rootId: "root_001",
      nodes: {
        root_001: {
          id: "root_001",
          title: "Root",
          status: "running",
          childrenIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      },
    };
    writeThreadsTree(TEST_DIR, tree);
    const loaded = readThreadsTree(TEST_DIR);
    expect(loaded).not.toBeNull();
    expect(loaded!.rootId).toBe("root_001");
    expect(loaded!.nodes["root_001"]!.title).toBe("Root");
  });

  test("不存在时返回 null", () => {
    const loaded = readThreadsTree(join(TEST_DIR, "nonexistent"));
    expect(loaded).toBeNull();
  });

  test("多节点树结构", () => {
    const now = Date.now();
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: {
        r: { id: "r", title: "Root", status: "running", childrenIds: ["a", "b"], createdAt: now, updatedAt: now },
        a: { id: "a", title: "A", status: "done", parentId: "r", childrenIds: [], summary: "A 完成", createdAt: now, updatedAt: now },
        b: { id: "b", title: "B", status: "pending", parentId: "r", childrenIds: [], createdAt: now, updatedAt: now },
      },
    };
    writeThreadsTree(TEST_DIR, tree);
    const loaded = readThreadsTree(TEST_DIR)!;
    expect(Object.keys(loaded.nodes)).toHaveLength(3);
    expect(loaded.nodes["a"]!.summary).toBe("A 完成");
    expect(loaded.nodes["b"]!.parentId).toBe("r");
  });
});

describe("thread.json 读写", () => {
  test("写入并读取 thread.json", () => {
    const threadDir = join(TEST_DIR, "threads", "root_001");
    mkdirSync(threadDir, { recursive: true });

    const data: ThreadDataFile = {
      id: "root_001",
      actions: [
        { type: "thought", content: "开始思考", timestamp: Date.now() },
      ],
      plan: "写论文",
    };
    writeThreadData(threadDir, data);
    const loaded = readThreadData(threadDir);
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe("root_001");
    expect(loaded!.actions).toHaveLength(1);
    expect(loaded!.plan).toBe("写论文");
  });

  test("不存在时返回 null", () => {
    const loaded = readThreadData(join(TEST_DIR, "nonexistent"));
    expect(loaded).toBeNull();
  });

  test("包含 inbox 和 todos", () => {
    const threadDir = join(TEST_DIR, "threads", "t1");
    mkdirSync(threadDir, { recursive: true });

    const data: ThreadDataFile = {
      id: "t1",
      actions: [],
      inbox: [
        { id: "msg1", from: "A", content: "你好", timestamp: Date.now(), source: "talk", status: "unread" },
      ],
      todos: [
        { id: "todo1", content: "回复 A", status: "pending", createdAt: Date.now() },
      ],
    };
    writeThreadData(threadDir, data);
    const loaded = readThreadData(threadDir)!;
    expect(loaded.inbox).toHaveLength(1);
    expect(loaded.inbox![0]!.status).toBe("unread");
    expect(loaded.todos).toHaveLength(1);
    expect(loaded.todos![0]!.content).toBe("回复 A");
  });
});

describe("目录路径计算", () => {
  test("Root 线程路径", () => {
    const dir = getThreadDir(TEST_DIR, ["root_001"]);
    expect(dir).toBe(join(TEST_DIR, "threads", "root_001"));
  });

  test("嵌套线程路径", () => {
    const dir = getThreadDir(TEST_DIR, ["root_001", "child_a", "grandchild_x"]);
    expect(dir).toBe(join(TEST_DIR, "threads", "root_001", "child_a", "grandchild_x"));
  });

  test("ensureThreadDir 创建嵌套目录", () => {
    const dir = ensureThreadDir(TEST_DIR, ["r", "a", "b"]);
    expect(existsSync(dir)).toBe(true);
    expect(dir).toBe(join(TEST_DIR, "threads", "r", "a", "b"));
  });
});

describe("getAncestorPath", () => {
  test("Root 节点返回 [rootId]", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: {
        r: { id: "r", title: "Root", status: "running", childrenIds: [], createdAt: 0, updatedAt: 0 },
      },
    };
    expect(getAncestorPath(tree, "r")).toEqual(["r"]);
  });

  test("三层嵌套返回完整路径", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: {
        r: { id: "r", title: "Root", status: "running", childrenIds: ["a"], createdAt: 0, updatedAt: 0 },
        a: { id: "a", title: "A", status: "running", parentId: "r", childrenIds: ["b"], createdAt: 0, updatedAt: 0 },
        b: { id: "b", title: "B", status: "running", parentId: "a", childrenIds: [], createdAt: 0, updatedAt: 0 },
      },
    };
    expect(getAncestorPath(tree, "b")).toEqual(["r", "a", "b"]);
  });

  test("不存在的节点返回 [nodeId]", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: {
        r: { id: "r", title: "Root", status: "running", childrenIds: [], createdAt: 0, updatedAt: 0 },
      },
    };
    expect(getAncestorPath(tree, "nonexistent")).toEqual(["nonexistent"]);
  });

  test("写入 → 读取 → getAncestorPath 端到端", () => {
    const tree: ThreadsTreeFile = {
      rootId: "r",
      nodes: {
        r: { id: "r", title: "Root", status: "running", childrenIds: ["a"], createdAt: 0, updatedAt: 0 },
        a: { id: "a", title: "A", status: "done", parentId: "r", childrenIds: ["b"], createdAt: 0, updatedAt: 0 },
        b: { id: "b", title: "B", status: "running", parentId: "a", childrenIds: [], createdAt: 0, updatedAt: 0 },
      },
    };
    writeThreadsTree(TEST_DIR, tree);
    const loaded = readThreadsTree(TEST_DIR)!;
    expect(getAncestorPath(loaded, "b")).toEqual(["r", "a", "b"]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-persistence.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现持久化层**

Create: `kernel/src/thread/persistence.ts`

```typescript
/**
 * 线程树持久化层
 *
 * 负责 threads.json（树索引）和 thread.json（线程数据）的读写。
 *
 * 写入规则：
 * - thread.json：线程独占写入（无冲突）
 * - threads.json：通过外部串行化队列写入（本模块不负责并发控制）
 *
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md#10
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ThreadsTreeFile, ThreadDataFile } from "./types.js";

const THREADS_TREE_FILENAME = "threads.json";
const THREAD_DATA_FILENAME = "thread.json";
const THREADS_DIR = "threads";

/* ========== threads.json 读写 ========== */

/**
 * 读取线程树索引
 * @param objectFlowDir - Object 的 Flow 目录（如 flows/{sessionId}/objects/{name}/）
 * @returns ThreadsTreeFile 或 null（不存在时）
 */
export function readThreadsTree(objectFlowDir: string): ThreadsTreeFile | null {
  const filePath = join(objectFlowDir, THREADS_TREE_FILENAME);
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as ThreadsTreeFile;
  } catch {
    return null;
  }
}

/**
 * 写入线程树索引
 * @param objectFlowDir - Object 的 Flow 目录
 * @param tree - 线程树数据
 */
export function writeThreadsTree(objectFlowDir: string, tree: ThreadsTreeFile): void {
  mkdirSync(objectFlowDir, { recursive: true });
  const filePath = join(objectFlowDir, THREADS_TREE_FILENAME);
  writeFileSync(filePath, JSON.stringify(tree, null, 2), "utf-8");
}

/* ========== thread.json 读写 ========== */

/**
 * 读取单个线程的运行时数据
 * @param threadDir - 线程目录（如 threads/{rootId}/{childId}/）
 * @returns ThreadDataFile 或 null（不存在时）
 */
export function readThreadData(threadDir: string): ThreadDataFile | null {
  const filePath = join(threadDir, THREAD_DATA_FILENAME);
  if (!existsSync(filePath)) return null;
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as ThreadDataFile;
  } catch {
    return null;
  }
}

/**
 * 写入单个线程的运行时数据
 * @param threadDir - 线程目录
 * @param data - 线程数据
 */
export function writeThreadData(threadDir: string, data: ThreadDataFile): void {
  mkdirSync(threadDir, { recursive: true });
  const filePath = join(threadDir, THREAD_DATA_FILENAME);
  writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/* ========== 目录路径计算 ========== */

/**
 * 计算线程的目录路径（目录嵌套 = 父子关系）
 * @param objectFlowDir - Object 的 Flow 目录
 * @param ancestorPath - 从 Root 到目标节点的 ID 路径（如 ["root", "child_a", "grandchild_x"]）
 * @returns 线程目录的绝对路径
 */
export function getThreadDir(objectFlowDir: string, ancestorPath: string[]): string {
  return join(objectFlowDir, THREADS_DIR, ...ancestorPath);
}

/**
 * 确保线程目录存在（递归创建）
 * @param objectFlowDir - Object 的 Flow 目录
 * @param ancestorPath - 从 Root 到目标节点的 ID 路径
 * @returns 线程目录的绝对路径
 */
export function ensureThreadDir(objectFlowDir: string, ancestorPath: string[]): string {
  const dir = getThreadDir(objectFlowDir, ancestorPath);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * 根据 threads.json 计算某个节点的祖先路径
 * @param tree - 线程树索引
 * @param nodeId - 目标节点 ID
 * @returns 从 Root 到目标节点的 ID 数组，如 ["root", "a", "b"]
 */
export function getAncestorPath(tree: ThreadsTreeFile, nodeId: string): string[] {
  const path: string[] = [];
  let current = nodeId;
  while (current) {
    path.unshift(current);
    const node = tree.nodes[current];
    if (!node || !node.parentId) break;
    current = node.parentId;
  }
  return path;
}
```

- [ ] **Step 4: 创建模块导出文件**

Create: `kernel/src/thread/index.ts`

```typescript
/**
 * 线程树模块
 *
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md
 */

export * from "./types.js";
export * from "./persistence.js";
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-persistence.test.ts`
Expected: 全部 PASS

- [ ] **Step 6: 运行全量测试确认无回归**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test`
Expected: 全部 PASS（新模块不影响现有代码）

- [ ] **Step 7: Commit**

```bash
git add kernel/src/thread/ kernel/tests/thread-persistence.test.ts
git commit -m "feat: 线程树持久化层（types + threads.json/thread.json 读写 + 目录嵌套）"
```

---

## 阶段 1 完成标准

- [ ] `kernel/src/thread/types.ts` — 所有类型定义完整（Thread 前缀避免命名冲突）
- [ ] `kernel/src/thread/persistence.ts` — threads.json + thread.json 读写 + 目录路径计算 + getAncestorPath
- [ ] `kernel/src/thread/index.ts` — 模块导出
- [ ] `kernel/tests/thread-persistence.test.ts` — 全部测试通过（含 getAncestorPath + 端到端测试）
- [ ] `bun test` 全量测试无回归
