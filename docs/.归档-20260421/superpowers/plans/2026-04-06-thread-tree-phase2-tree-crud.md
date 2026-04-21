# 线程树架构重构 — 阶段 2：线程树内存模型 + CRUD 操作

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 ThreadsTree 内存模型类，管理整棵线程树的内存状态，提供所有 CRUD 操作（创建/完成/等待/inbox/todo），并通过串行化写入队列保证 threads.json 的并发安全。

**Architecture:** 在 `kernel/src/thread/` 模块中新增 `tree.ts`（内存模型）和 `queue.ts`（串行化写入队列）。不修改现有代码，纯增量。

**Tech Stack:** TypeScript, Bun runtime, bun:test

**Spec:** `docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md`

**依赖：** 阶段 1 的类型和持久化层（`kernel/src/thread/types.ts`, `kernel/src/thread/persistence.ts`）

**阶段总览：**
- 阶段 1：类型与持久化 ✅
- 阶段 2（本文件）：线程树内存模型 + CRUD ← 当前
- 阶段 3：ThinkLoop 重写 + Context 构建
- 阶段 4：Scheduler 重写
- 阶段 5：协作 API（talk / create_sub_thread_on_node / inbox / Issue）

---

## 文件结构

```
kernel/src/thread/
├── types.ts                 ← 阶段 1（已完成）
├── persistence.ts           ← 阶段 1（已完成）
├── queue.ts                 ← 串行化写入队列（~40 行）
├── tree.ts                  ← ThreadsTree 内存模型（~450 行）
└── index.ts                 ← 更新导出

kernel/tests/
├── thread-persistence.test.ts  ← 阶段 1（已完成）
├── thread-queue.test.ts        ← 串行化队列测试（~80 行）
└── thread-tree.test.ts         ← 内存模型测试（~500 行）
```

---

### Task 1: 串行化写入队列

**Files:**
- Create: `kernel/src/thread/queue.ts`
- Create: `kernel/tests/thread-queue.test.ts`

- [ ] **Step 1: 写测试文件**

Create: `kernel/tests/thread-queue.test.ts`

```typescript
/**
 * 串行化写入队列测试
 *
 * 验证并发写入操作被正确串行化执行。
 *
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md#10.2
 */
import { describe, test, expect } from "bun:test";
import { WriteQueue } from "../src/thread/queue.js";

describe("WriteQueue", () => {
  test("顺序执行写入操作", async () => {
    const queue = new WriteQueue();
    const order: number[] = [];

    await queue.enqueue(async () => { order.push(1); });
    await queue.enqueue(async () => { order.push(2); });
    await queue.enqueue(async () => { order.push(3); });

    expect(order).toEqual([1, 2, 3]);
  });

  test("并发提交时保证串行执行", async () => {
    const queue = new WriteQueue();
    const order: number[] = [];

    const p1 = queue.enqueue(async () => {
      await new Promise(r => setTimeout(r, 30));
      order.push(1);
    });
    const p2 = queue.enqueue(async () => {
      await new Promise(r => setTimeout(r, 10));
      order.push(2);
    });
    const p3 = queue.enqueue(async () => {
      order.push(3);
    });

    await Promise.all([p1, p2, p3]);
    expect(order).toEqual([1, 2, 3]);
  });

  test("前一个操作失败不阻塞后续操作", async () => {
    const queue = new WriteQueue();
    const order: number[] = [];

    const p1 = queue.enqueue(async () => {
      throw new Error("写入失败");
    }).catch(() => { order.push(-1); });

    const p2 = queue.enqueue(async () => {
      order.push(2);
    });

    await Promise.all([p1, p2]);
    expect(order).toEqual([-1, 2]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-queue.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现串行化写入队列**

Create: `kernel/src/thread/queue.ts`

```typescript
/**
 * 串行化写入队列
 *
 * 保证对 threads.json 的并发写入操作按 FIFO 顺序串行执行。
 * 每个 Object 的 ThreadsTree 持有一个 WriteQueue 实例。
 *
 * 实现原理：维护一个 Promise 链，每次 enqueue 将新操作追加到链尾。
 * 与 Session.serializedWrite 原理相同，但独立于 Session 生命周期。
 *
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md#10.2
 */

export class WriteQueue {
  /** Promise 链尾部 */
  private _tail: Promise<void> = Promise.resolve();

  /**
   * 将写入操作加入队列，等待前序操作完成后执行
   *
   * @param fn - 异步写入操作
   * @returns 操作完成的 Promise
   */
  async enqueue(fn: () => Promise<void>): Promise<void> {
    const prev = this._tail;
    let resolve!: () => void;
    let reject!: (err: unknown) => void;
    const next = new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this._tail = next.catch(() => {});
    await prev.catch(() => {});
    try {
      await fn();
      resolve();
    } catch (err) {
      reject(err);
      throw err;
    }
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-queue.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add kernel/src/thread/queue.ts kernel/tests/thread-queue.test.ts
git commit -m "feat: 线程树串行化写入队列（WriteQueue）"
```

---

### Task 2: ThreadsTree 内存模型 — 核心骨架 + createRoot

**Files:**
- Create: `kernel/src/thread/tree.ts`
- Create: `kernel/tests/thread-tree.test.ts`

- [ ] **Step 1: 写测试文件（核心骨架 + createRoot）**

Create: `kernel/tests/thread-tree.test.ts`

```typescript
/**
 * ThreadsTree 内存模型测试
 *
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md
 */
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ThreadsTree } from "../src/thread/tree.js";
import { readThreadsTree, readThreadData } from "../src/thread/persistence.js";

const TEST_DIR = join(import.meta.dir, ".tmp_thread_tree_test");

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

/* ========== 构造与 createRoot ========== */

describe("ThreadsTree 构造", () => {
  test("create 创建新树并持久化", async () => {
    const tree = await ThreadsTree.create(TEST_DIR, "研究任务");

    expect(tree.rootId).toBeTruthy();
    expect(tree.getNode(tree.rootId)!.title).toBe("研究任务");
    expect(tree.getNode(tree.rootId)!.status).toBe("running");
    expect(tree.getNode(tree.rootId)!.childrenIds).toEqual([]);

    // 验证 threads.json 已写入
    const persisted = readThreadsTree(TEST_DIR);
    expect(persisted).not.toBeNull();
    expect(persisted!.rootId).toBe(tree.rootId);

    // 验证 root 的 thread.json 已写入
    const threadData = readThreadData(join(TEST_DIR, "threads", tree.rootId));
    expect(threadData).not.toBeNull();
    expect(threadData!.id).toBe(tree.rootId);
    expect(threadData!.actions).toEqual([]);
  });

  test("load 从磁盘加载已有树", async () => {
    const tree1 = await ThreadsTree.create(TEST_DIR, "任务 A");
    const tree2 = ThreadsTree.load(TEST_DIR);

    expect(tree2).not.toBeNull();
    expect(tree2!.rootId).toBe(tree1.rootId);
    expect(tree2!.getNode(tree1.rootId)!.title).toBe("任务 A");
  });

  test("load 不存在时返回 null", () => {
    const tree = ThreadsTree.load(join(TEST_DIR, "nonexistent"));
    expect(tree).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-tree.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 ThreadsTree 骨架 + createRoot**

Create: `kernel/src/thread/tree.ts`

```typescript
/**
 * ThreadsTree — 线程树内存模型
 *
 * 管理整棵线程树的内存状态，提供所有 CRUD 操作。
 * 每个 Object 在 Flow 中持有一个 ThreadsTree 实例。
 *
 * 读写规则：
 * - 读：直接读内存（无 IO），始终是最新状态
 * - 写：通过 WriteQueue 串行执行，每次写入后 flush 到 threads.json
 *
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md#2
 */

import type {
  ThreadsTreeFile,
  ThreadsTreeNodeMeta,
  ThreadDataFile,
  ThreadStatus,
  ThreadHandle,
  ThreadResult,
  ThreadAction,
  ThreadInboxMessage,
  ThreadTodoItem,
  ThreadFrameHook,
} from "./types.js";
import {
  readThreadsTree,
  writeThreadsTree,
  readThreadData,
  writeThreadData,
  getThreadDir,
  ensureThreadDir,
  getAncestorPath,
} from "./persistence.js";
import { WriteQueue } from "./queue.js";

/** 生成唯一节点 ID */
function generateNodeId(): string {
  return `th_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 最大树深度（G9 约束） */
const MAX_DEPTH = 20;

export class ThreadsTree {
  /** Object 的 Flow 目录 */
  private readonly _dir: string;
  /** 内存中的树索引 */
  private _tree: ThreadsTreeFile;
  /** 串行化写入队列 */
  private readonly _writeQueue = new WriteQueue();

  private constructor(dir: string, tree: ThreadsTreeFile) {
    this._dir = dir;
    this._tree = tree;
  }

  /* ========== 静态工厂方法 ========== */

  /**
   * 创建新的线程树（含 Root 节点）
   *
   * @param objectFlowDir - Object 的 Flow 目录
   * @param title - Root 节点标题
   * @param description - Root 节点描述
   * @returns ThreadsTree 实例
   */
  static async create(
    objectFlowDir: string,
    title: string,
    description?: string,
  ): Promise<ThreadsTree> {
    const rootId = generateNodeId();
    const now = Date.now();

    const rootMeta: ThreadsTreeNodeMeta = {
      id: rootId,
      title,
      description,
      status: "running",
      childrenIds: [],
      createdAt: now,
      updatedAt: now,
    };

    const tree: ThreadsTreeFile = {
      rootId,
      nodes: { [rootId]: rootMeta },
    };

    /* 写入 threads.json */
    writeThreadsTree(objectFlowDir, tree);

    /* 创建 Root 的 thread.json */
    const rootThreadDir = ensureThreadDir(objectFlowDir, [rootId]);
    const rootData: ThreadDataFile = {
      id: rootId,
      actions: [],
    };
    writeThreadData(rootThreadDir, rootData);

    return new ThreadsTree(objectFlowDir, tree);
  }

  /**
   * 从磁盘加载已有线程树
   *
   * @param objectFlowDir - Object 的 Flow 目录
   * @returns ThreadsTree 实例，不存在时返回 null
   */
  static load(objectFlowDir: string): ThreadsTree | null {
    const tree = readThreadsTree(objectFlowDir);
    if (!tree) return null;
    return new ThreadsTree(objectFlowDir, tree);
  }

  /* ========== 只读属性 ========== */

  /** Root 节点 ID */
  get rootId(): string {
    return this._tree.rootId;
  }

  /** 获取所有节点 ID */
  get nodeIds(): string[] {
    return Object.keys(this._tree.nodes);
  }

  /** 获取节点元数据（直接读内存） */
  getNode(nodeId: string): ThreadsTreeNodeMeta | null {
    return this._tree.nodes[nodeId] ?? null;
  }

  /** 获取节点的子节点列表 */
  getChildren(nodeId: string): ThreadsTreeNodeMeta[] {
    const node = this._tree.nodes[nodeId];
    if (!node) return [];
    return node.childrenIds
      .map(id => this._tree.nodes[id])
      .filter((n): n is ThreadsTreeNodeMeta => n != null);
  }

  /** 获取从 Root 到指定节点的祖先路径 */
  getAncestorPath(nodeId: string): string[] {
    return getAncestorPath(this._tree, nodeId);
  }

  /** 计算节点深度（Root = 0） */
  getDepth(nodeId: string): number {
    return this.getAncestorPath(nodeId).length - 1;
  }

  /**
   * 计算 scope chain（从 Root 到指定节点路径上所有 traits 合并）
   *
   * @param nodeId - 目标节点 ID
   * @returns 去重后的 trait 名称列表
   */
  computeScopeChain(nodeId: string): string[] {
    const path = this.getAncestorPath(nodeId);
    const seen = new Set<string>();
    for (const id of path) {
      const node = this._tree.nodes[id];
      if (!node) continue;
      if (node.traits) {
        for (const t of node.traits) seen.add(t);
      }
      if (node.activatedTraits) {
        for (const t of node.activatedTraits) seen.add(t);
      }
    }
    return Array.from(seen);
  }

  /** 读取指定线程的运行时数据（thread.json） */
  readThreadData(nodeId: string): ThreadDataFile | null {
    const path = this.getAncestorPath(nodeId);
    const dir = getThreadDir(this._dir, path);
    return readThreadData(dir);
  }

  /** 写入指定线程的运行时数据（thread.json，线程独占，无需队列） */
  writeThreadData(nodeId: string, data: ThreadDataFile): void {
    const path = this.getAncestorPath(nodeId);
    const dir = ensureThreadDir(this._dir, path);
    writeThreadData(dir, data);
  }

  /* ========== 内部：串行化写入 ========== */

  /**
   * 串行化修改树索引并 flush 到磁盘
   *
   * 所有对 this._tree 的写操作必须通过此方法，保证并发安全。
   */
  private async _mutate(fn: (tree: ThreadsTreeFile) => void): Promise<void> {
    await this._writeQueue.enqueue(async () => {
      fn(this._tree);
      writeThreadsTree(this._dir, this._tree);
    });
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-tree.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add kernel/src/thread/tree.ts kernel/tests/thread-tree.test.ts
git commit -m "feat: ThreadsTree 骨架 + createRoot + load"
```

---

### Task 3: create_sub_thread

**Files:**
- Edit: `kernel/src/thread/tree.ts`
- Edit: `kernel/tests/thread-tree.test.ts`

- [ ] **Step 1: 追加测试用例**

Append to `kernel/tests/thread-tree.test.ts`:

```typescript
/* ========== create_sub_thread ========== */

describe("createSubThread", () => {
  test("创建子线程，父子关系正确", async () => {
    const tree = await ThreadsTree.create(TEST_DIR, "Root");
    const childId = await tree.createSubThread(tree.rootId, "子任务 A");

    expect(childId).toBeTruthy();

    // 子节点元数据
    const child = tree.getNode(childId)!;
    expect(child.title).toBe("子任务 A");
    expect(child.status).toBe("pending");
    expect(child.parentId).toBe(tree.rootId);
    expect(child.creatorThreadId).toBe(tree.rootId);

    // 父节点 childrenIds 更新
    const root = tree.getNode(tree.rootId)!;
    expect(root.childrenIds).toContain(childId);

    // 子线程的 thread.json 已创建
    const threadData = tree.readThreadData(childId);
    expect(threadData).not.toBeNull();
    expect(threadData!.id).toBe(childId);
  });

  test("创建子线程时可指定 traits 和 description", async () => {
    const tree = await ThreadsTree.create(TEST_DIR, "Root");
    const childId = await tree.createSubThread(tree.rootId, "搜索", {
      traits: ["web_search"],
      description: "搜索 AI safety 相关论文",
    });

    const child = tree.getNode(childId)!;
    expect(child.traits).toEqual(["web_search"]);
    expect(child.description).toBe("搜索 AI safety 相关论文");
  });

  test("创建多个并行子线程", async () => {
    const tree = await ThreadsTree.create(TEST_DIR, "Root");

    const [id1, id2, id3] = await Promise.all([
      tree.createSubThread(tree.rootId, "搜索 X"),
      tree.createSubThread(tree.rootId, "搜索 Y"),
      tree.createSubThread(tree.rootId, "搜索 Z"),
    ]);

    const root = tree.getNode(tree.rootId)!;
    expect(root.childrenIds).toHaveLength(3);
    expect(root.childrenIds).toContain(id1);
    expect(root.childrenIds).toContain(id2);
    expect(root.childrenIds).toContain(id3);
  });

  test("超过最大深度时返回 null", async () => {
    const tree = await ThreadsTree.create(TEST_DIR, "Root");

    // 构建 20 层深的链
    let parentId = tree.rootId;
    for (let i = 0; i < 19; i++) {
      parentId = await tree.createSubThread(parentId, `层 ${i + 1}`);
    }

    // 第 21 层应该失败（Root 是第 0 层，已有 20 层）
    const tooDeep = await tree.createSubThread(parentId, "太深了");
    expect(tooDeep).toBeNull();
  });

  test("父节点不存在时返回 null", async () => {
    const tree = await ThreadsTree.create(TEST_DIR, "Root");
    const result = await tree.createSubThread("nonexistent", "子任务");
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-tree.test.ts`
Expected: FAIL（createSubThread 不存在）

- [ ] **Step 3: 实现 createSubThread**

在 `kernel/src/thread/tree.ts` 的 `ThreadsTree` 类中追加：

```typescript
  /* ========== 线程管理 ========== */

  /**
   * 创建子线程
   *
   * 在指定父节点下创建子节点，初始状态为 pending。
   * 同时创建子线程的 thread.json（空 actions）。
   *
   * @param parentId - 父节点 ID
   * @param title - 子线程标题
   * @param options - 可选参数（traits, description, outputs, outputDescription）
   * @returns 子线程 ID（ThreadHandle），父节点不存在或超深度时返回 null
   */
  async createSubThread(
    parentId: string,
    title: string,
    options?: {
      traits?: string[];
      description?: string;
      outputs?: string[];
      outputDescription?: string;
      creatorThreadId?: string;
      creatorObjectName?: string;
    },
  ): Promise<ThreadHandle | null> {
    const parent = this._tree.nodes[parentId];
    if (!parent) return null;

    /* 检查深度限制 */
    const depth = this.getDepth(parentId);
    if (depth >= MAX_DEPTH - 1) return null;

    const childId = generateNodeId();
    const now = Date.now();

    const childMeta: ThreadsTreeNodeMeta = {
      id: childId,
      title,
      description: options?.description,
      status: "pending",
      parentId,
      childrenIds: [],
      traits: options?.traits,
      outputs: options?.outputs,
      outputDescription: options?.outputDescription,
      creatorThreadId: options?.creatorThreadId ?? parentId,
      creatorObjectName: options?.creatorObjectName,
      createdAt: now,
      updatedAt: now,
    };

    /* 串行化写入树索引 */
    await this._mutate((tree) => {
      tree.nodes[childId] = childMeta;
      tree.nodes[parentId]!.childrenIds.push(childId);
      tree.nodes[parentId]!.updatedAt = now;
    });

    /* 创建子线程的 thread.json（独占写入，无需队列） */
    const ancestorPath = this.getAncestorPath(childId);
    const threadDir = ensureThreadDir(this._dir, ancestorPath);
    const threadData: ThreadDataFile = {
      id: childId,
      actions: [],
    };
    writeThreadData(threadDir, threadData);

    return childId;
  }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-tree.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add kernel/src/thread/tree.ts kernel/tests/thread-tree.test.ts
git commit -m "feat: ThreadsTree.createSubThread（创建子线程 + 深度限制 + 并发安全）"
```

---

### Task 4: return（完成线程）

**Files:**
- Edit: `kernel/src/thread/tree.ts`
- Edit: `kernel/tests/thread-tree.test.ts`

- [ ] **Step 1: 追加测试用例**

Append to `kernel/tests/thread-tree.test.ts`:

```typescript
/* ========== return ========== */

describe("returnThread", () => {
  test("完成线程，写入 summary", async () => {
    const tree = await ThreadsTree.create(TEST_DIR, "Root");
    const childId = await tree.createSubThread(tree.rootId, "子任务");

    await tree.setNodeStatus(childId, "running");
    await tree.returnThread(childId, "任务完成，产出了报告");

    const child = tree.getNode(childId)!;
    expect(child.status).toBe("done");
    expect(child.summary).toBe("任务完成，产出了报告");
  });

  test("完成线程，artifacts 写入创建者的 locals", async () => {
    const tree = await ThreadsTree.create(TEST_DIR, "Root");
    const childId = await tree.createSubThread(tree.rootId, "获取数据");

    await tree.setNodeStatus(childId, "running");
    await tree.returnThread(childId, "获取成功", {
      docContent: "文档内容...",
      docMeta: { title: "论文" },
    });

    // 验证 artifacts 写入创建者（Root）的 thread.json locals
    const rootData = tree.readThreadData(tree.rootId);
    expect(rootData).not.toBeNull();
    expect(rootData!.locals).toBeDefined();
    expect(rootData!.locals!["docContent"]).toBe("文档内容...");
    expect((rootData!.locals!["docMeta"] as any).title).toBe("论文");
  });

  test("完成线程，summary 写入创建者的 inbox", async () => {
    const tree = await ThreadsTree.create(TEST_DIR, "Root");
    const childId = await tree.createSubThread(tree.rootId, "子任务 B");

    await tree.setNodeStatus(childId, "running");
    await tree.returnThread(childId, "B 完成了");

    const rootData = tree.readThreadData(tree.rootId);
    expect(rootData!.inbox).toBeDefined();
    expect(rootData!.inbox!.length).toBeGreaterThanOrEqual(1);
    const msg = rootData!.inbox!.find(m => m.source === "system" && m.content.includes("B 完成了"));
    expect(msg).toBeDefined();
  });

  test("Root 节点不存在创建者，不写 inbox/locals", async () => {
    const tree = await ThreadsTree.create(TEST_DIR, "Root");

    // Root 自己 return 不应报错
    await tree.returnThread(tree.rootId, "全部完成");

    const root = tree.getNode(tree.rootId)!;
    expect(root.status).toBe("done");
    expect(root.summary).toBe("全部完成");
  });

  test("节点不存在时静默返回", async () => {
    const tree = await ThreadsTree.create(TEST_DIR, "Root");
    // 不应抛异常
    await tree.returnThread("nonexistent", "无效");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-tree.test.ts`
Expected: FAIL（returnThread 不存在）

- [ ] **Step 3: 实现 returnThread + setNodeStatus**

在 `kernel/src/thread/tree.ts` 的 `ThreadsTree` 类中追加：

```typescript
  /**
   * 更新节点状态
   *
   * @param nodeId - 节点 ID
   * @param status - 新状态
   */
  async setNodeStatus(nodeId: string, status: ThreadStatus): Promise<void> {
    if (!this._tree.nodes[nodeId]) return;
    await this._mutate((tree) => {
      const node = tree.nodes[nodeId];
      if (node) {
        node.status = status;
        node.updatedAt = Date.now();
      }
    });
  }

  /**
   * 完成线程（return）
   *
   * 1. 设置节点 status = "done"，写入 summary
   * 2. 将 artifacts 合并到创建者线程的 locals
   * 3. 将 summary 写入创建者线程的 inbox（source: "system"）
   *
   * @param nodeId - 要完成的节点 ID
   * @param summary - 完成摘要
   * @param artifacts - 产出数据（合并到创建者的 locals）
   */
  async returnThread(
    nodeId: string,
    summary: string,
    artifacts?: Record<string, unknown>,
  ): Promise<void> {
    const node = this._tree.nodes[nodeId];
    if (!node) return;

    /* 1. 更新节点状态和摘要 */
    await this._mutate((tree) => {
      const n = tree.nodes[nodeId];
      if (n) {
        n.status = "done";
        n.summary = summary;
        n.updatedAt = Date.now();
      }
    });

    /* 2. 将 artifacts 和 summary 写入创建者线程 */
    const creatorId = node.creatorThreadId;
    if (creatorId && this._tree.nodes[creatorId]) {
      const creatorData = this.readThreadData(creatorId);
      if (creatorData) {
        /* 合并 artifacts 到 locals */
        if (artifacts) {
          creatorData.locals = { ...(creatorData.locals ?? {}), ...artifacts };
        }

        /* 写入 inbox 通知 */
        if (!creatorData.inbox) creatorData.inbox = [];
        creatorData.inbox.push({
          id: `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          from: node.title,
          content: `子线程「${node.title}」已完成: ${summary}`,
          timestamp: Date.now(),
          source: "system",
          status: "unread",
        });

        this.writeThreadData(creatorId, creatorData);
      }
    }
  }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-tree.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add kernel/src/thread/tree.ts kernel/tests/thread-tree.test.ts
git commit -m "feat: ThreadsTree.returnThread（完成线程 + summary + artifacts 路由）"
```

---

### Task 5: await / await_all（等待子线程）

**Files:**
- Edit: `kernel/src/thread/tree.ts`
- Edit: `kernel/tests/thread-tree.test.ts`

- [ ] **Step 1: 追加测试用例**

Append to `kernel/tests/thread-tree.test.ts`:

```typescript
/* ========== await / await_all ========== */

describe("awaitThreads", () => {
  test("await 单个子线程：设置 awaitingChildren + 状态变 waiting", async () => {
    const tree = await ThreadsTree.create(TEST_DIR, "Root");
    const childId = await tree.createSubThread(tree.rootId, "子任务");
    await tree.setNodeStatus(childId, "running");

    await tree.awaitThreads(tree.rootId, [childId]);

    const root = tree.getNode(tree.rootId)!;
    expect(root.status).toBe("waiting");
    expect(root.awaitingChildren).toEqual([childId]);
  });

  test("await_all 多个子线程", async () => {
    const tree = await ThreadsTree.create(TEST_DIR, "Root");
    const id1 = await tree.createSubThread(tree.rootId, "A");
    const id2 = await tree.createSubThread(tree.rootId, "B");
    const id3 = await tree.createSubThread(tree.rootId, "C");

    await tree.awaitThreads(tree.rootId, [id1, id2, id3]);

    const root = tree.getNode(tree.rootId)!;
    expect(root.status).toBe("waiting");
    expect(root.awaitingChildren).toEqual([id1, id2, id3]);
  });

  test("子线程全部 done 后，checkAndWake 唤醒父线程", async () => {
    const tree = await ThreadsTree.create(TEST_DIR, "Root");
    const childId = await tree.createSubThread(tree.rootId, "子任务");
    await tree.setNodeStatus(childId, "running");
    await tree.awaitThreads(tree.rootId, [childId]);

    // 子线程完成
    await tree.returnThread(childId, "完成");

    // 检查并唤醒
    const woken = await tree.checkAndWake(tree.rootId);
    expect(woken).toBe(true);

    const root = tree.getNode(tree.rootId)!;
    expect(root.status).toBe("running");
    expect(root.awaitingChildren).toBeUndefined();
  });

  test("部分子线程未完成时，checkAndWake 不唤醒", async () => {
    const tree = await ThreadsTree.create(TEST_DIR, "Root");
    const id1 = await tree.createSubThread(tree.rootId, "A");
    const id2 = await tree.createSubThread(tree.rootId, "B");
    await tree.setNodeStatus(id1, "running");
    await tree.setNodeStatus(id2, "running");
    await tree.awaitThreads(tree.rootId, [id1, id2]);

    // 只完成一个
    await tree.returnThread(id1, "A 完成");

    const woken = await tree.checkAndWake(tree.rootId);
    expect(woken).toBe(false);

    const root = tree.getNode(tree.rootId)!;
    expect(root.status).toBe("waiting");
  });

  test("子线程 failed 也算完成，可以唤醒父线程", async () => {
    const tree = await ThreadsTree.create(TEST_DIR, "Root");
    const childId = await tree.createSubThread(tree.rootId, "子任务");
    await tree.setNodeStatus(childId, "running");
    await tree.awaitThreads(tree.rootId, [childId]);

    // 子线程失败
    await tree.setNodeStatus(childId, "failed");

    const woken = await tree.checkAndWake(tree.rootId);
    expect(woken).toBe(true);

    const root = tree.getNode(tree.rootId)!;
    expect(root.status).toBe("running");
  });

  test("findWaitingParents 找到所有等待指定子线程的父节点", async () => {
    const tree = await ThreadsTree.create(TEST_DIR, "Root");
    const childId = await tree.createSubThread(tree.rootId, "子任务");
    await tree.setNodeStatus(childId, "running");
    await tree.awaitThreads(tree.rootId, [childId]);

    const waiters = tree.findWaitingParents(childId);
    expect(waiters).toHaveLength(1);
    expect(waiters[0]).toBe(tree.rootId);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-tree.test.ts`
Expected: FAIL（awaitThreads 不存在）

- [ ] **Step 3: 实现 awaitThreads + checkAndWake + findWaitingParents**

在 `kernel/src/thread/tree.ts` 的 `ThreadsTree` 类中追加：

```typescript
  /**
   * 等待子线程（await / await_all）
   *
   * 设置当前节点的 awaitingChildren，状态变为 waiting。
   * 不是 JS 层面的 await，而是线程状态转换。
   * Scheduler 检测到 status !== "running" 后退出该线程的循环。
   *
   * @param nodeId - 当前节点 ID（等待者）
   * @param childIds - 要等待的子线程 ID 列表
   */
  async awaitThreads(nodeId: string, childIds: string[]): Promise<void> {
    if (!this._tree.nodes[nodeId]) return;
    await this._mutate((tree) => {
      const node = tree.nodes[nodeId];
      if (node) {
        node.awaitingChildren = childIds;
        node.status = "waiting";
        node.updatedAt = Date.now();
      }
    });
  }

  /**
   * 检查等待条件是否满足，满足则唤醒
   *
   * 如果 awaitingChildren 中的所有子线程都已 done 或 failed，
   * 则清除 awaitingChildren，状态变为 running。
   *
   * @param nodeId - 等待中的节点 ID
   * @returns 是否被唤醒
   */
  async checkAndWake(nodeId: string): Promise<boolean> {
    const node = this._tree.nodes[nodeId];
    if (!node || node.status !== "waiting" || !node.awaitingChildren) return false;

    const allDone = node.awaitingChildren.every(childId => {
      const child = this._tree.nodes[childId];
      return child && (child.status === "done" || child.status === "failed");
    });

    if (!allDone) return false;

    await this._mutate((tree) => {
      const n = tree.nodes[nodeId];
      if (n) {
        n.awaitingChildren = undefined;
        n.status = "running";
        n.updatedAt = Date.now();
      }
    });

    return true;
  }

  /**
   * 查找所有正在等待指定子线程的父节点
   *
   * Scheduler 在子线程完成时调用，找到需要检查唤醒的节点。
   *
   * @param childId - 已完成的子线程 ID
   * @returns 等待该子线程的节点 ID 列表
   */
  findWaitingParents(childId: string): string[] {
    const result: string[] = [];
    for (const node of Object.values(this._tree.nodes)) {
      if (
        node.status === "waiting" &&
        node.awaitingChildren &&
        node.awaitingChildren.includes(childId)
      ) {
        result.push(node.id);
      }
    }
    return result;
  }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-tree.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add kernel/src/thread/tree.ts kernel/tests/thread-tree.test.ts
git commit -m "feat: ThreadsTree.awaitThreads + checkAndWake（等待子线程 + 唤醒机制）"
```

---

### Task 6: inbox 操作

**Files:**
- Edit: `kernel/src/thread/tree.ts`
- Edit: `kernel/tests/thread-tree.test.ts`

- [ ] **Step 1: 追加测试用例**

Append to `kernel/tests/thread-tree.test.ts`:

```typescript
/* ========== inbox 操作 ========== */

describe("inbox", () => {
  test("writeInbox 写入消息到指定线程", async () => {
    const tree = await ThreadsTree.create(TEST_DIR, "Root");

    tree.writeInbox(tree.rootId, {
      from: "helper",
      content: "搜索结果已准备好",
      source: "talk",
    });

    const data = tree.readThreadData(tree.rootId)!;
    expect(data.inbox).toHaveLength(1);
    expect(data.inbox![0]!.from).toBe("helper");
    expect(data.inbox![0]!.status).toBe("unread");
    expect(data.inbox![0]!.source).toBe("talk");
  });

  test("markInbox 标记消息", async () => {
    const tree = await ThreadsTree.create(TEST_DIR, "Root");

    tree.writeInbox(tree.rootId, {
      from: "A",
      content: "你好",
      source: "talk",
    });

    const data1 = tree.readThreadData(tree.rootId)!;
    const msgId = data1.inbox![0]!.id;

    tree.markInbox(tree.rootId, msgId, "ack", "已收到");

    const data2 = tree.readThreadData(tree.rootId)!;
    const msg = data2.inbox![0]!;
    expect(msg.status).toBe("marked");
    expect(msg.mark!.type).toBe("ack");
    expect(msg.mark!.tip).toBe("已收到");
  });

  test("markInbox todo 类型", async () => {
    const tree = await ThreadsTree.create(TEST_DIR, "Root");

    tree.writeInbox(tree.rootId, {
      from: "B",
      content: "请处理这个问题",
      source: "issue",
    });

    const data1 = tree.readThreadData(tree.rootId)!;
    const msgId = data1.inbox![0]!.id;

    tree.markInbox(tree.rootId, msgId, "todo", "需要处理");

    const data2 = tree.readThreadData(tree.rootId)!;
    expect(data2.inbox![0]!.mark!.type).toBe("todo");
  });

  test("inbox 溢出自动忽略最早消息（上限 50 条 unread）", async () => {
    const tree = await ThreadsTree.create(TEST_DIR, "Root");

    // 写入 51 条消息
    for (let i = 0; i < 51; i++) {
      tree.writeInbox(tree.rootId, {
        from: "sender",
        content: `消息 ${i}`,
        source: "system",
      });
    }

    const data = tree.readThreadData(tree.rootId)!;
    const unread = data.inbox!.filter(m => m.status === "unread");
    expect(unread.length).toBeLessThanOrEqual(50);

    // 最早的消息应该被自动 mark(ignore)
    const ignored = data.inbox!.filter(
      m => m.status === "marked" && m.mark?.type === "ignore"
    );
    expect(ignored.length).toBeGreaterThanOrEqual(1);
  });

  test("marked 消息超过 200 条时自动清理", async () => {
    const tree = await ThreadsTree.create(TEST_DIR, "Root");

    // 写入 210 条消息并全部 mark
    for (let i = 0; i < 210; i++) {
      tree.writeInbox(tree.rootId, {
        from: "sender",
        content: `消息 ${i}`,
        source: "system",
      });
    }

    const data1 = tree.readThreadData(tree.rootId)!;
    // mark 所有消息
    for (const msg of data1.inbox!) {
      tree.markInbox(tree.rootId, msg.id, "ack", "ok");
    }

    // 触发清理（下次 writeInbox 时检查）
    tree.writeInbox(tree.rootId, {
      from: "trigger",
      content: "触发清理",
      source: "system",
    });

    const data2 = tree.readThreadData(tree.rootId)!;
    const marked = data2.inbox!.filter(m => m.status === "marked");
    expect(marked.length).toBeLessThanOrEqual(100);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-tree.test.ts`
Expected: FAIL（writeInbox 不存在）

- [ ] **Step 3: 实现 writeInbox + markInbox**

在 `kernel/src/thread/tree.ts` 的 `ThreadsTree` 类中追加：

```typescript
  /* ========== inbox 操作 ========== */

  /** unread 消息上限 */
  private static readonly INBOX_UNREAD_LIMIT = 50;
  /** marked 消息保留上限 */
  private static readonly INBOX_MARKED_LIMIT = 200;
  /** marked 消息清理后保留数量 */
  private static readonly INBOX_MARKED_KEEP = 100;

  /**
   * 向指定线程的 inbox 写入消息
   *
   * 自动处理溢出：unread 超过 50 条时自动 mark(ignore) 最早的消息。
   * marked 超过 200 条时自动清理最早的 marked 消息（保留最近 100 条）。
   *
   * @param nodeId - 目标线程 ID
   * @param msg - 消息内容（不含 id, timestamp, status）
   */
  writeInbox(
    nodeId: string,
    msg: {
      from: string;
      content: string;
      source: ThreadInboxMessage["source"];
      issueId?: string;
    },
  ): void {
    const data = this.readThreadData(nodeId);
    if (!data) return;

    if (!data.inbox) data.inbox = [];

    /* 写入新消息 */
    const newMsg: ThreadInboxMessage = {
      id: `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      from: msg.from,
      content: msg.content,
      timestamp: Date.now(),
      source: msg.source,
      issueId: msg.issueId,
      status: "unread",
    };
    data.inbox.push(newMsg);

    /* unread 溢出处理：超过上限时自动 mark(ignore) 最早的 unread */
    const unread = data.inbox.filter(m => m.status === "unread");
    if (unread.length > ThreadsTree.INBOX_UNREAD_LIMIT) {
      const overflow = unread.length - ThreadsTree.INBOX_UNREAD_LIMIT;
      let count = 0;
      for (const m of data.inbox) {
        if (m.status === "unread" && count < overflow) {
          m.status = "marked";
          m.mark = { type: "ignore", tip: "inbox 溢出", markedAt: Date.now() };
          count++;
        }
      }
    }

    /* marked 清理：超过上限时清理最早的 marked 消息 */
    const marked = data.inbox.filter(m => m.status === "marked");
    if (marked.length > ThreadsTree.INBOX_MARKED_LIMIT) {
      const markedIds = new Set(
        marked
          .sort((a, b) => a.timestamp - b.timestamp)
          .slice(0, marked.length - ThreadsTree.INBOX_MARKED_KEEP)
          .map(m => m.id)
      );
      data.inbox = data.inbox.filter(m => !(m.status === "marked" && markedIds.has(m.id)));
    }

    this.writeThreadData(nodeId, data);
  }

  /**
   * 标记 inbox 消息
   *
   * @param nodeId - 线程 ID
   * @param messageId - 消息 ID
   * @param type - 标记类型（ack / ignore / todo）
   * @param tip - 标记说明
   */
  markInbox(
    nodeId: string,
    messageId: string,
    type: "ack" | "ignore" | "todo",
    tip: string,
  ): void {
    const data = this.readThreadData(nodeId);
    if (!data || !data.inbox) return;

    const msg = data.inbox.find(m => m.id === messageId);
    if (!msg) return;

    msg.status = "marked";
    msg.mark = { type, tip, markedAt: Date.now() };

    this.writeThreadData(nodeId, data);
  }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-tree.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add kernel/src/thread/tree.ts kernel/tests/thread-tree.test.ts
git commit -m "feat: ThreadsTree inbox 操作（writeInbox + markInbox + 溢出清理）"
```

---

### Task 7: todo 操作

**Files:**
- Edit: `kernel/src/thread/tree.ts`
- Edit: `kernel/tests/thread-tree.test.ts`

- [ ] **Step 1: 追加测试用例**

Append to `kernel/tests/thread-tree.test.ts`:

```typescript
/* ========== todo 操作 ========== */

describe("todo", () => {
  test("addTodo 创建 pending todo", async () => {
    const tree = await ThreadsTree.create(TEST_DIR, "Root");

    tree.addTodo(tree.rootId, "回复 A 的消息");

    const data = tree.readThreadData(tree.rootId)!;
    expect(data.todos).toHaveLength(1);
    expect(data.todos![0]!.content).toBe("回复 A 的消息");
    expect(data.todos![0]!.status).toBe("pending");
  });

  test("addTodo 关联 sourceMessageId", async () => {
    const tree = await ThreadsTree.create(TEST_DIR, "Root");

    tree.addTodo(tree.rootId, "处理问题", "msg_abc");

    const data = tree.readThreadData(tree.rootId)!;
    expect(data.todos![0]!.sourceMessageId).toBe("msg_abc");
  });

  test("completeTodo 标记 todo 完成", async () => {
    const tree = await ThreadsTree.create(TEST_DIR, "Root");

    tree.addTodo(tree.rootId, "任务 1");
    const data1 = tree.readThreadData(tree.rootId)!;
    const todoId = data1.todos![0]!.id;

    tree.completeTodo(tree.rootId, todoId);

    const data2 = tree.readThreadData(tree.rootId)!;
    expect(data2.todos![0]!.status).toBe("done");
    expect(data2.todos![0]!.doneAt).toBeDefined();
  });

  test("hasPendingTodos 检测未完成待办", async () => {
    const tree = await ThreadsTree.create(TEST_DIR, "Root");

    expect(tree.hasPendingTodos(tree.rootId)).toBe(false);

    tree.addTodo(tree.rootId, "任务 1");
    expect(tree.hasPendingTodos(tree.rootId)).toBe(true);

    const data = tree.readThreadData(tree.rootId)!;
    const todoId = data.todos![0]!.id;
    tree.completeTodo(tree.rootId, todoId);
    expect(tree.hasPendingTodos(tree.rootId)).toBe(false);
  });

  test("getPendingTodos 返回未完成待办列表", async () => {
    const tree = await ThreadsTree.create(TEST_DIR, "Root");

    tree.addTodo(tree.rootId, "任务 1");
    tree.addTodo(tree.rootId, "任务 2");
    tree.addTodo(tree.rootId, "任务 3");

    // 完成第一个
    const data = tree.readThreadData(tree.rootId)!;
    tree.completeTodo(tree.rootId, data.todos![0]!.id);

    const pending = tree.getPendingTodos(tree.rootId);
    expect(pending).toHaveLength(2);
    expect(pending[0]!.content).toBe("任务 2");
    expect(pending[1]!.content).toBe("任务 3");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-tree.test.ts`
Expected: FAIL（addTodo 不存在）

- [ ] **Step 3: 实现 addTodo + completeTodo + hasPendingTodos + getPendingTodos**

在 `kernel/src/thread/tree.ts` 的 `ThreadsTree` 类中追加：

```typescript
  /* ========== todo 操作 ========== */

  /**
   * 在指定线程创建待办
   *
   * @param nodeId - 线程 ID
   * @param content - 待办内容
   * @param sourceMessageId - 关联的 inbox 消息 ID（可选）
   */
  addTodo(nodeId: string, content: string, sourceMessageId?: string): void {
    const data = this.readThreadData(nodeId);
    if (!data) return;

    if (!data.todos) data.todos = [];

    const todo: ThreadTodoItem = {
      id: `todo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      content,
      sourceMessageId,
      status: "pending",
      createdAt: Date.now(),
    };
    data.todos.push(todo);

    this.writeThreadData(nodeId, data);
  }

  /**
   * 标记待办完成
   *
   * @param nodeId - 线程 ID
   * @param todoId - 待办 ID
   */
  completeTodo(nodeId: string, todoId: string): void {
    const data = this.readThreadData(nodeId);
    if (!data || !data.todos) return;

    const todo = data.todos.find(t => t.id === todoId);
    if (!todo) return;

    todo.status = "done";
    todo.doneAt = Date.now();

    this.writeThreadData(nodeId, data);
  }

  /**
   * 检查指定线程是否有未完成待办
   *
   * @param nodeId - 线程 ID
   * @returns 是否有 pending 状态的 todo
   */
  hasPendingTodos(nodeId: string): boolean {
    const data = this.readThreadData(nodeId);
    if (!data || !data.todos) return false;
    return data.todos.some(t => t.status === "pending");
  }

  /**
   * 获取指定线程的未完成待办列表
   *
   * @param nodeId - 线程 ID
   * @returns pending 状态的 todo 列表
   */
  getPendingTodos(nodeId: string): ThreadTodoItem[] {
    const data = this.readThreadData(nodeId);
    if (!data || !data.todos) return [];
    return data.todos.filter(t => t.status === "pending");
  }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-tree.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add kernel/src/thread/tree.ts kernel/tests/thread-tree.test.ts
git commit -m "feat: ThreadsTree todo 操作（addTodo + completeTodo + 查询）"
```

---

### Task 8: 更新模块导出 + 全量测试

**Files:**
- Edit: `kernel/src/thread/index.ts`

- [ ] **Step 1: 更新模块导出**

Edit: `kernel/src/thread/index.ts`

```typescript
/**
 * 线程树模块
 *
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md
 */

export * from "./types.js";
export * from "./persistence.js";
export * from "./queue.js";
export * from "./tree.js";
```

- [ ] **Step 2: 运行全量测试确认无回归**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test`
Expected: 全部 PASS（新模块不影响现有代码）

- [ ] **Step 3: Commit**

```bash
git add kernel/src/thread/index.ts
git commit -m "feat: 线程树模块导出更新（queue + tree）"
```

---

## 阶段 2 完成标准

- [ ] `kernel/src/thread/queue.ts` — WriteQueue 串行化写入队列
- [ ] `kernel/src/thread/tree.ts` — ThreadsTree 内存模型，包含：
  - `create` / `load` — 创建和加载线程树
  - `createSubThread` — 创建子线程（深度限制 + 并发安全）
  - `returnThread` — 完成线程（summary + artifacts 路由到创建者）
  - `setNodeStatus` — 状态变更
  - `awaitThreads` / `checkAndWake` / `findWaitingParents` — 等待与唤醒
  - `writeInbox` / `markInbox` — inbox 消息写入与标记（含溢出清理）
  - `addTodo` / `completeTodo` / `hasPendingTodos` / `getPendingTodos` — 待办管理
  - `computeScopeChain` — 认知栈作用域链计算
  - `readThreadData` / `writeThreadData` — 线程数据读写代理
- [ ] `kernel/src/thread/index.ts` — 模块导出更新
- [ ] `kernel/tests/thread-queue.test.ts` — 串行化队列测试全部通过
- [ ] `kernel/tests/thread-tree.test.ts` — 内存模型测试全部通过
- [ ] `bun test` 全量测试无回归
