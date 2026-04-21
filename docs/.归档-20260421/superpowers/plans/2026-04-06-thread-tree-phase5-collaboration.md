# 线程树架构重构 — 阶段 5：协作 API

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现跨 Object 协作的完整 API（talk、create_sub_thread_on_node、talkToSelf、Issue 协作、inbox 清理），替换旧的 Router

**Architecture:** 新建 `kernel/src/thread/collaboration.ts` 协作层 + `kernel/src/thread/inbox.ts` inbox 管理层。修改 `kernel/src/thread/tree.ts` 添加跨 Object 节点创建。修改 Scheduler 添加跨 Object 唤醒。替换旧 Router。

**Tech Stack:** TypeScript, Bun runtime, bun:test

**Spec:** `docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md`

**依赖：** 阶段 1（types + persistence）、阶段 2（ThreadsTree 内存模型 + CRUD）、阶段 3（ThinkLoop + Context）、阶段 4（Scheduler）

**阶段总览：**
- 阶段 1：类型与持久化 ✅
- 阶段 2：线程树内存模型 + CRUD ✅
- 阶段 3：ThinkLoop 重写 + Context 构建 ✅
- 阶段 4：Scheduler 重写 ✅
- 阶段 5（本文件）：协作 API ← 当前

---

## 前置假设（阶段 1-4 提供的接口）

本阶段依赖以下已实现的接口（由阶段 1-4 提供）：

```typescript
// 阶段 1: kernel/src/thread/types.ts
// ThreadsTreeFile, ThreadsTreeNodeMeta, ThreadDataFile, ThreadInboxMessage,
// ThreadTodoItem, ThreadStatus, ThreadHandle, ThreadResult
//
// 【I2 新增】ThreadsTreeNodeMeta 需要添加 creationMode 字段：
//   creationMode?: "sub_thread" | "sub_thread_on_node" | "talk";
//   Phase 3 的 Context builder 根据 creationMode 决定是否加载目标节点数据。
//   - "sub_thread": 默认，拷贝父线程 process 快照
//   - "sub_thread_on_node": 加载目标节点完整 actions
//   - "talk": 空白 process

// 阶段 1: kernel/src/thread/persistence.ts
// readThreadsTree, writeThreadsTree, readThreadData, writeThreadData,
// getThreadDir, ensureThreadDir, getAncestorPath

// 阶段 2: kernel/src/thread/tree.ts
// class ThreadsTree — 内存树模型（实际 API，已审查确认）
//   get rootId: string                                    — Root 节点 ID（getter）
//   getNode(nodeId): ThreadsTreeNodeMeta | null           — 获取节点元数据（浅拷贝）
//   getChildren(nodeId): ThreadsTreeNodeMeta[]            — 获取子节点列表
//   getAncestorPath(nodeId): string[]                     — 获取祖先路径
//   getDepth(nodeId): number                              — 计算节点深度
//   computeScopeChain(nodeId): string[]                   — 计算 scope chain
//   readThreadData(nodeId): ThreadDataFile | null         — 读取线程运行时数据
//   writeThreadData(nodeId, data): void                   — 写入线程运行时数据
//   createSubThread(parentId, title, options?): Promise<ThreadHandle | null>
//     — 创建子线程（ID 由内部 generateNodeId 生成，不支持 caller-provided id）
//     — options: { traits?, description?, outputs?, outputDescription?,
//                  creatorThreadId?, creatorObjectName? }
//   setNodeStatus(nodeId, status): Promise<void>          — 更新节点状态
//   returnThread(nodeId, summary, artifacts?): Promise<void> — 完成线程
//   awaitThreads(nodeId, childIds): Promise<void>         — 等待子线程
//   checkAndWake(nodeId): Promise<boolean>                — 检查并唤醒
//   findWaitingParents(childId): string[]                 — 查找等待指定子线程的父节点
//   writeInbox(nodeId, msg): void                         — 写入 inbox（含溢出处理）
//   markInbox(nodeId, messageId, type, tip): void         — 标记 inbox 消息
//   addTodo(nodeId, content, sourceMessageId?): void      — 创建待办
//   completeTodo(nodeId, todoId): void                    — 完成待办
//
//   【重要】ThreadsTree 没有以下方法（计划中不可使用）：
//   ✗ createNode()   — 用 createSubThread() 替代
//   ✗ updateNode()   — 用 setNodeStatus() 或 returnThread() 替代
//   ✗ flush()        — flush 在 _mutate 内部自动执行
//   ✗ getRootId()    — 用 rootId getter 替代
//
//   【S3 依赖】createSubThread 不支持 caller-provided id。
//   本阶段的 talk / create_sub_thread_on_node / Issue 协作使用 createSubThread
//   返回的 ID，不再生成自定义前缀 ID（w_xxx、h_xxx 等）。
//
//   【注意】不存在 thread-data.ts / ThreadDataManager。
//   所有线程数据操作（readThreadData, writeThreadData, writeInbox 等）
//   都在 ThreadsTree 类上。

// 阶段 3: kernel/src/thread/context.ts（待实现）
// buildContext(tree, nodeId, ...): ContextResult

// 阶段 4: kernel/src/thread/scheduler.ts（待实现）
// class ThreadScheduler
//   startThread(objectName, nodeId): void
//   wakeThread(objectName, nodeId): void
//   onThreadFinished(objectName, nodeId): void
//   getObjectTree(objectName): ThreadsTree
```

---

## 文件结构

```
kernel/src/thread/
├── types.ts                 ← 阶段 1（已有，本阶段修改：添加 creationMode 字段）
├── persistence.ts           ← 阶段 1（已有）
├── queue.ts                 ← 阶段 2（已有）
├── tree.ts                  ← 阶段 2（已有，本阶段修改：添加协作所需的辅助方法）
├── inbox.ts                 ← 新建：inbox 清理策略（~80 行）
├── collaboration.ts         ← 新建：协作 API 实现（~350 行）
└── index.ts                 ← 更新：导出新模块

kernel/tests/
├── thread-inbox.test.ts     ← 新建：inbox 清理测试（~150 行）
├── thread-collaboration.test.ts  ← 新建：协作 API 测试（~400 行）
└── thread-issue-collab.test.ts   ← 新建：Issue 协作集成测试（~200 行）
```

---

### Task 1: inbox 清理策略

**Files:**
- Create: `kernel/src/thread/inbox.ts`
- Create: `kernel/tests/thread-inbox.test.ts`

- [ ] **Step 1: 写测试文件**

Create: `kernel/tests/thread-inbox.test.ts`

```typescript
/**
 * inbox 清理策略测试
 *
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md#3.3
 */
import { describe, test, expect } from "bun:test";
import { enforceInboxLimits } from "../src/thread/inbox.js";
import type { ThreadInboxMessage } from "../src/thread/types.js";

/** 辅助：生成 inbox 消息 */
function makeMsg(id: string, status: "unread" | "marked", timestamp: number): ThreadInboxMessage {
  return {
    id,
    from: "test",
    content: `msg-${id}`,
    timestamp,
    source: "talk",
    status,
    ...(status === "marked" ? { mark: { type: "ack", tip: "ok", markedAt: timestamp } } : {}),
  };
}

describe("enforceInboxLimits", () => {
  test("unread <= 50 时不做任何处理", () => {
    const inbox: ThreadInboxMessage[] = Array.from({ length: 50 }, (_, i) =>
      makeMsg(`u${i}`, "unread", 1000 + i),
    );
    const { cleaned, overflowed } = enforceInboxLimits(inbox);
    expect(cleaned).toHaveLength(50);
    expect(overflowed).toHaveLength(0);
    expect(cleaned.every((m) => m.status === "unread")).toBe(true);
  });

  test("unread > 50 时，最早的 unread 被自动 mark(ignore)", () => {
    const inbox: ThreadInboxMessage[] = Array.from({ length: 55 }, (_, i) =>
      makeMsg(`u${i}`, "unread", 1000 + i),
    );
    const { cleaned, overflowed } = enforceInboxLimits(inbox);
    // 5 条最早的被 mark(ignore)
    expect(overflowed).toHaveLength(5);
    expect(overflowed.every((m) => m.status === "marked" && m.mark?.type === "ignore")).toBe(true);
    // 剩余 50 条 unread
    const unreadCount = cleaned.filter((m) => m.status === "unread").length;
    expect(unreadCount).toBe(50);
    // 总数不变
    expect(cleaned).toHaveLength(55);
  });

  test("marked > 200 时，清理最早的 marked，保留最近 100 条", () => {
    const marked: ThreadInboxMessage[] = Array.from({ length: 210 }, (_, i) =>
      makeMsg(`m${i}`, "marked", 1000 + i),
    );
    const unread: ThreadInboxMessage[] = Array.from({ length: 10 }, (_, i) =>
      makeMsg(`u${i}`, "unread", 2000 + i),
    );
    const inbox = [...marked, ...unread];
    const { cleaned } = enforceInboxLimits(inbox);
    const markedCount = cleaned.filter((m) => m.status === "marked").length;
    expect(markedCount).toBe(100);
    const unreadCount = cleaned.filter((m) => m.status === "unread").length;
    expect(unreadCount).toBe(10);
  });

  test("空 inbox 不报错", () => {
    const { cleaned, overflowed } = enforceInboxLimits([]);
    expect(cleaned).toHaveLength(0);
    expect(overflowed).toHaveLength(0);
  });

  test("混合场景：unread 溢出 + marked 溢出同时处理", () => {
    const marked: ThreadInboxMessage[] = Array.from({ length: 205 }, (_, i) =>
      makeMsg(`m${i}`, "marked", 500 + i),
    );
    const unread: ThreadInboxMessage[] = Array.from({ length: 53 }, (_, i) =>
      makeMsg(`u${i}`, "unread", 1000 + i),
    );
    const inbox = [...marked, ...unread];
    const { cleaned, overflowed } = enforceInboxLimits(inbox);
    // 3 条 unread 溢出被 mark(ignore)
    expect(overflowed).toHaveLength(3);
    // unread 剩余 50
    const unreadCount = cleaned.filter((m) => m.status === "unread").length;
    expect(unreadCount).toBe(50);
    // marked 总数 = 原 205 + 溢出 3 = 208 → 清理到 100
    const markedCount = cleaned.filter((m) => m.status === "marked").length;
    expect(markedCount).toBe(100);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-inbox.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 inbox 清理策略**

Create: `kernel/src/thread/inbox.ts`

```typescript
/**
 * inbox 清理策略
 *
 * 规则（来自 Spec Section 3.3）：
 * - unread 上限 50 条，超过时自动 mark(ignore, "inbox 溢出") 最早的消息
 * - marked 消息超过 200 条时，自动清理最早的 marked 消息（保留最近 100 条）
 *
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md#3.3
 */

import type { ThreadInboxMessage } from "./types.js";

/** unread 消息上限 */
const UNREAD_LIMIT = 50;
/** marked 消息触发清理的阈值 */
const MARKED_CLEANUP_THRESHOLD = 200;
/** marked 消息清理后保留的数量 */
const MARKED_KEEP_COUNT = 100;

/** 清理结果 */
export interface InboxCleanupResult {
  /** 清理后的完整 inbox */
  cleaned: ThreadInboxMessage[];
  /** 本次因溢出被自动 mark(ignore) 的消息（用于日志/通知） */
  overflowed: ThreadInboxMessage[];
}

/**
 * 执行 inbox 清理策略
 *
 * 不修改原数组，返回新数组（不可变）。
 *
 * S1: 调用时机说明：
 * - 主要调用点：ThreadsTree.writeInbox() 内部已内置溢出处理逻辑（见 tree.ts），
 *   每次写入 inbox 消息后自动执行 unread 溢出和 marked 清理。
 * - collaboration.ts 的 executeTalk / executeReplyToFlow / commentOnIssueWithNotify
 *   统一通过 tree.writeInbox() 写入消息，无需手动调用 enforceInboxLimits。
 * - 本函数作为独立工具函数导出，供以下场景使用：
 *   1. Context 构建前兜底清理（确保渲染时 inbox 不超限）
 *   2. 单元测试中直接验证清理逻辑
 *
 * @param inbox - 当前 inbox 消息列表
 * @returns 清理结果
 */
export function enforceInboxLimits(inbox: ThreadInboxMessage[]): InboxCleanupResult {
  const overflowed: ThreadInboxMessage[] = [];

  /* 第一步：处理 unread 溢出 */
  const unread = inbox.filter((m) => m.status === "unread");
  const marked = inbox.filter((m) => m.status === "marked");

  let newUnread = [...unread];
  let newMarked = [...marked];

  if (newUnread.length > UNREAD_LIMIT) {
    /* 按 timestamp 升序排列，最早的先溢出 */
    newUnread.sort((a, b) => a.timestamp - b.timestamp);
    const overflowCount = newUnread.length - UNREAD_LIMIT;
    const overflowMsgs = newUnread.splice(0, overflowCount);

    /* 溢出消息自动 mark(ignore) */
    const now = Date.now();
    for (const msg of overflowMsgs) {
      const markedMsg: ThreadInboxMessage = {
        ...msg,
        status: "marked",
        mark: { type: "ignore", tip: "inbox 溢出", markedAt: now },
      };
      newMarked.push(markedMsg);
      overflowed.push(markedMsg);
    }
  }

  /* 第二步：处理 marked 溢出 */
  if (newMarked.length > MARKED_CLEANUP_THRESHOLD) {
    newMarked.sort((a, b) => a.timestamp - b.timestamp);
    newMarked = newMarked.slice(newMarked.length - MARKED_KEEP_COUNT);
  }

  /* 合并并按 timestamp 排序 */
  const cleaned = [...newMarked, ...newUnread].sort((a, b) => a.timestamp - b.timestamp);

  return { cleaned, overflowed };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-inbox.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add kernel/src/thread/inbox.ts kernel/tests/thread-inbox.test.ts
git commit -m "feat: inbox 清理策略（unread 上限 50 + marked 上限 200）"
```

---

### Task 2: 协作 API 核心实现

**Files:**
- Modify: `kernel/src/thread/types.ts`（添加 creationMode 字段）
- Modify: `kernel/src/thread/tree.ts`（扩展 createSubThread options + 添加 updateNodeMeta）
- Create: `kernel/src/thread/collaboration.ts`
- Create: `kernel/tests/thread-collaboration.test.ts`

- [ ] **Step 1: 修改 types.ts — 添加 creationMode 字段（I2）**

Modify: `kernel/src/thread/types.ts`

在 `ThreadsTreeNodeMeta` 接口中添加：

```typescript
  /** I2: 创建方式标记，Phase 3 的 Context builder 据此决定加载策略 */
  creationMode?: "sub_thread" | "sub_thread_on_node" | "talk";
```

- [ ] **Step 2: 修改 tree.ts — 扩展 createSubThread options + 添加 updateNodeMeta**

Modify: `kernel/src/thread/tree.ts`

2a. 扩展 `createSubThread` 的 `options` 参数，添加协作所需字段：

```typescript
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
      // 以下为阶段 5 新增（协作 API 所需）
      linkedWaitingNodeId?: string;       // talk 的 H 节点关联 W 节点
      linkedWaitingObjectName?: string;   // talk 的 H 节点关联 W 所在 Object
      creationMode?: "sub_thread" | "sub_thread_on_node" | "talk";  // I2
    },
  ): Promise<ThreadHandle | null> {
```

在 `childMeta` 构造中添加对应字段：

```typescript
    const childMeta: ThreadsTreeNodeMeta = {
      // ... 现有字段 ...
      linkedWaitingNodeId: options?.linkedWaitingNodeId,
      linkedWaitingObjectName: options?.linkedWaitingObjectName,
      creationMode: options?.creationMode,
    };
```

2b. 添加 `updateNodeMeta` 方法（用于 onTalkHandlerReturn 设置 W 的 summary）：

```typescript
  /**
   * 更新节点元数据（通用字段更新）
   *
   * 用于协作 API 中需要更新 summary 等非状态字段的场景。
   * 与 setNodeStatus 不同，此方法可更新任意 meta 字段。
   *
   * @param nodeId - 节点 ID
   * @param fields - 要更新的字段（部分更新）
   */
  async updateNodeMeta(nodeId: string, fields: Partial<Pick<ThreadsTreeNodeMeta,
    "summary" | "description" | "awaitingChildren" | "linkedWaitingNodeId" | "linkedWaitingObjectName"
  >>): Promise<void> {
    if (!this._tree.nodes[nodeId]) return;
    await this._mutate((tree) => {
      const node = tree.nodes[nodeId];
      if (node) {
        Object.assign(node, fields);
        node.updatedAt = Date.now();
      }
    });
  }
```

- [ ] **Step 3: 写测试文件**

Create: `kernel/tests/thread-collaboration.test.ts`

```typescript
/**
 * 协作 API 测试
 *
 * 测试 talk、create_sub_thread_on_node、talkToSelf、replyToFlow 的完整生命周期。
 * 使用 mock 的 ThreadsTree（匹配真实 API）和 MockScheduler。
 *
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md#4.2
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md#9
 */
import { describe, test, expect, beforeEach, mock } from "bun:test";
import {
  createCollaborationAPI,
  type CollaborationContext,
  type ObjectResolver,
} from "../src/thread/collaboration.js";
import type {
  ThreadsTreeNodeMeta,
  ThreadDataFile,
  ThreadInboxMessage,
  ThreadStatus,
} from "../src/thread/types.js";

/* ========== Mock 基础设施 ========== */

/**
 * 简易内存树 mock — 模拟 ThreadsTree 的真实 API
 *
 * 【重要】必须与 kernel/src/thread/tree.ts 的 ThreadsTree 公开 API 一致：
 * - rootId (getter)，不是 getRootId()
 * - createSubThread(parentId, title, options?) → Promise<string | null>
 * - setNodeStatus(nodeId, status) → Promise<void>
 * - awaitThreads(nodeId, childIds) → Promise<void>
 * - checkAndWake(nodeId) → Promise<boolean>
 * - writeInbox(nodeId, msg) → void
 * - readThreadData(nodeId) → ThreadDataFile | null
 * - writeThreadData(nodeId, data) → void
 * - getNode / getChildren / findWaitingParents 等只读方法
 *
 * 不存在的方法（不可使用）：
 * ✗ createNode / updateNode / flush / getRootId
 */
class MockTree {
  nodes: Record<string, ThreadsTreeNodeMeta> = {};
  threadData: Record<string, ThreadDataFile> = {};
  private _rootId = "root_001";
  private _nextId = 0;

  constructor() {
    const now = Date.now();
    this.nodes["root_001"] = {
      id: "root_001",
      title: "Root",
      status: "running",
      childrenIds: [],
      createdAt: now,
      updatedAt: now,
    };
    this.threadData["root_001"] = { id: "root_001", actions: [] };
  }

  get rootId() { return this._rootId; }

  getNode(id: string) { return this.nodes[id] ? { ...this.nodes[id] } : null; }

  getChildren(id: string) {
    const node = this.nodes[id];
    if (!node) return [];
    return node.childrenIds.map((cid) => this.nodes[cid]!).filter(Boolean).map(n => ({ ...n }));
  }

  async createSubThread(
    parentId: string,
    title: string,
    options?: {
      traits?: string[];
      description?: string;
      creatorThreadId?: string;
      creatorObjectName?: string;
    },
  ): Promise<string | null> {
    const parent = this.nodes[parentId];
    if (!parent) return null;
    const id = `th_mock_${this._nextId++}`;
    const now = Date.now();
    parent.childrenIds.push(id);
    this.nodes[id] = {
      id,
      title,
      description: options?.description,
      status: "pending",
      parentId,
      childrenIds: [],
      creatorThreadId: options?.creatorThreadId ?? parentId,
      creatorObjectName: options?.creatorObjectName,
      createdAt: now,
      updatedAt: now,
    };
    this.threadData[id] = { id, actions: [] };
    return id;
  }

  async setNodeStatus(nodeId: string, status: ThreadStatus): Promise<void> {
    const node = this.nodes[nodeId];
    if (node) {
      node.status = status;
      node.updatedAt = Date.now();
    }
  }

  async returnThread(nodeId: string, summary: string, artifacts?: Record<string, unknown>): Promise<void> {
    const node = this.nodes[nodeId];
    if (!node) return;
    node.status = "done";
    node.summary = summary;
    node.updatedAt = Date.now();
    if (node.creatorThreadId && this.nodes[node.creatorThreadId]) {
      const creatorData = this.readThreadData(node.creatorThreadId);
      if (creatorData) {
        if (artifacts) creatorData.locals = { ...(creatorData.locals ?? {}), ...artifacts };
        if (!creatorData.inbox) creatorData.inbox = [];
        creatorData.inbox.push({
          id: `msg_${Date.now().toString(36)}`,
          from: node.title,
          content: `子线程「${node.title}」已完成: ${summary}`,
          timestamp: Date.now(),
          source: "system",
          status: "unread",
        });
        this.writeThreadData(node.creatorThreadId, creatorData);
      }
    }
  }

  async awaitThreads(nodeId: string, childIds: string[]): Promise<void> {
    const node = this.nodes[nodeId];
    if (node) {
      node.awaitingChildren = childIds;
      node.status = "waiting";
      node.updatedAt = Date.now();
    }
  }

  async checkAndWake(nodeId: string): Promise<boolean> {
    const node = this.nodes[nodeId];
    if (!node || node.status !== "waiting" || !node.awaitingChildren) return false;
    const allDone = node.awaitingChildren.every(cid => {
      const c = this.nodes[cid];
      return c && (c.status === "done" || c.status === "failed");
    });
    if (!allDone) return false;
    node.awaitingChildren = undefined;
    node.status = "running";
    node.updatedAt = Date.now();
    return true;
  }

  findWaitingParents(childId: string): string[] {
    return Object.values(this.nodes)
      .filter(n => n.status === "waiting" && n.awaitingChildren?.includes(childId))
      .map(n => n.id);
  }

  writeInbox(nodeId: string, msg: { from: string; content: string; source: ThreadInboxMessage["source"]; issueId?: string }): void {
    const data = this.readThreadData(nodeId);
    if (!data) return;
    if (!data.inbox) data.inbox = [];
    data.inbox.push({
      id: `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      from: msg.from,
      content: msg.content,
      timestamp: Date.now(),
      source: msg.source,
      issueId: msg.issueId,
      status: "unread",
    });
    this.writeThreadData(nodeId, data);
  }

  readThreadData(nodeId: string): ThreadDataFile | null {
    if (!this.threadData[nodeId]) return null;
    return this.threadData[nodeId]!;
  }

  writeThreadData(nodeId: string, data: ThreadDataFile): void {
    this.threadData[nodeId] = data;
  }
}

/** 简易 Scheduler mock */
class MockScheduler {
  started: { objectName: string; nodeId: string }[] = [];
  woken: { objectName: string; nodeId: string }[] = [];

  startThread(objectName: string, nodeId: string) {
    this.started.push({ objectName, nodeId });
  }
  wakeThread(objectName: string, nodeId: string) {
    this.woken.push({ objectName, nodeId });
  }
}

/* ========== 测试 ========== */

describe("talk() 完整生命周期", () => {
  let treeA: MockTree;
  let treeB: MockTree;
  let scheduler: MockScheduler;
  let api: ReturnType<typeof createCollaborationAPI>;

  beforeEach(() => {
    treeA = new MockTree();
    treeB = new MockTree();
    scheduler = new MockScheduler();

    const resolver: ObjectResolver = {
      getTree: (name) => (name === "A" ? treeA : treeB) as any,
      objectExists: (name) => name === "A" || name === "B",
    };

    const ctx: CollaborationContext = {
      currentObjectName: "A",
      currentThreadId: "root_001",
      resolver,
      scheduler: scheduler as any,
      sessionDir: "/tmp/test-session",
    };

    api = createCollaborationAPI(ctx);
  });

  test("talk 创建 W 节点（waiting）在 A 侧 + H 节点（running）在 B 侧", async () => {
    const result = await api.talk("B", "请帮我搜索 AI safety");

    // A 侧：当前节点下创建了 W 子节点
    const aChildren = treeA.getChildren("root_001");
    expect(aChildren).toHaveLength(1);
    const W = aChildren[0]!;
    expect(W.status).toBe("waiting");
    expect(W.title).toContain("等待 B 回复");
    expect(W.creatorThreadId).toBe("root_001");

    // B 侧：Root 下创建了 H 子节点
    const bChildren = treeB.getChildren("root_001");
    expect(bChildren).toHaveLength(1);
    const H = bChildren[0]!;
    expect(H.status).toBe("running");
    expect(H.title).toContain("处理 A 的请求");
    expect(H.creatorThreadId).toBe("root_001");
    expect(H.creatorObjectName).toBe("A");
    // linkedWaitingNodeId / linkedWaitingObjectName 通过 description 或 meta 传递
    // 具体字段取决于 createSubThread 的 options 扩展（见 collaboration.ts 实现）

    // H 的 inbox 收到消息（通过 tree.writeInbox）
    const hData = treeB.readThreadData(H.id);
    expect(hData?.inbox).toHaveLength(1);
    expect(hData!.inbox![0]!.content).toBe("请帮我搜索 AI safety");
    expect(hData!.inbox![0]!.source).toBe("talk");

    // Scheduler 启动了 H 的线程
    expect(scheduler.started).toHaveLength(1);
    expect(scheduler.started[0]!.objectName).toBe("B");
    expect(scheduler.started[0]!.nodeId).toBe(H.id);

    // A 的当前线程进入 waiting
    const aRoot = treeA.getNode("root_001")!;
    expect(aRoot.status).toBe("waiting");
    expect(aRoot.awaitingChildren).toContain(W.id);
  });

  test("talk 目标不存在时返回错误", async () => {
    const result = await api.talk("C_not_exist", "hello");
    expect(result).toContain("错误");
  });

  test("talk 不能向自己发消息", async () => {
    const result = await api.talk("A", "hello self");
    expect(result).toContain("错误");
  });
});

describe("create_sub_thread_on_node()", () => {
  let tree: MockTree;
  let scheduler: MockScheduler;
  let api: ReturnType<typeof createCollaborationAPI>;

  beforeEach(() => {
    tree = new MockTree();
    scheduler = new MockScheduler();

    // 创建一个已完成的子节点 C（通过 createSubThread）
    // 注意：createSubThread 是 async，需要 await
  });

  test("在目标节点下创建子线程", async () => {
    // 先创建已完成的子节点 C
    const childCId = await tree.createSubThread("root_001", "已完成的任务 C", {
      creatorThreadId: "root_001",
    });
    expect(childCId).not.toBeNull();
    await tree.returnThread(childCId!, "C 完成了数据收集");

    // 给 C 写入一些 actions 历史
    const cData = tree.readThreadData(childCId!);
    cData!.actions = [
      { type: "thought", content: "开始收集数据", timestamp: 1000 },
      { type: "action", content: "调用 API", timestamp: 2000, result: "成功", success: true },
    ];
    tree.writeThreadData(childCId!, cData!);

    const resolver: ObjectResolver = {
      getTree: () => tree as any,
      objectExists: () => true,
    };

    const ctx: CollaborationContext = {
      currentObjectName: "A",
      currentThreadId: "root_001",
      resolver,
      scheduler: scheduler as any,
      sessionDir: "/tmp/test-session",
    };

    api = createCollaborationAPI(ctx);

    const result = await api.createSubThreadOnNode(childCId!, "你收集的数据路径在哪？");

    // child_c 下创建了新子节点
    const cChildren = tree.getChildren(childCId!);
    expect(cChildren).toHaveLength(1);
    const sub = cChildren[0]!;
    expect(sub.status).toBe("running");
    expect(sub.creatorThreadId).toBe("root_001");
    expect(sub.creatorObjectName).toBe("A");

    // I2: 新子线程的 thread.json 包含目标节点的完整 actions（inject action）
    const subData = tree.readThreadData(sub.id);
    expect(subData).not.toBeNull();
    const injectAction = subData!.actions.find((a: any) => a.type === "inject");
    expect(injectAction).toBeDefined();
    expect(injectAction!.content).toContain("开始收集数据");
    expect(injectAction!.content).toContain("调用 API");

    // 新子线程的 inbox 收到消息
    expect(subData!.inbox).toHaveLength(1);
    expect(subData!.inbox![0]!.content).toBe("你收集的数据路径在哪？");

    // Scheduler 启动了新线程
    expect(scheduler.started).toHaveLength(1);
  });

  test("目标节点不存在时返回错误", async () => {
    const resolver: ObjectResolver = {
      getTree: () => tree as any,
      objectExists: () => true,
    };
    const ctx: CollaborationContext = {
      currentObjectName: "A",
      currentThreadId: "root_001",
      resolver,
      scheduler: scheduler as any,
      sessionDir: "/tmp/test-session",
    };
    api = createCollaborationAPI(ctx);
    const result = await api.createSubThreadOnNode("nonexistent", "hello");
    expect(result).toContain("错误");
  });
});

describe("talkToSelf()", () => {
  let tree: MockTree;
  let scheduler: MockScheduler;
  let api: ReturnType<typeof createCollaborationAPI>;
  let deliverToSelfMetaCalled = false;

  beforeEach(() => {
    tree = new MockTree();
    scheduler = new MockScheduler();
    deliverToSelfMetaCalled = false;

    const resolver: ObjectResolver = {
      getTree: () => tree as any,
      objectExists: () => true,
    };

    const ctx: CollaborationContext = {
      currentObjectName: "A",
      currentThreadId: "root_001",
      resolver,
      scheduler: scheduler as any,
      sessionDir: "/tmp/test-session",
      deliverToSelfMeta: (_name: string, _msg: string) => {
        deliverToSelfMetaCalled = true;
        return "[已发送到 ReflectFlow]";
      },
    };

    api = createCollaborationAPI(ctx);
  });

  test("talkToSelf 调用 deliverToSelfMeta", () => {
    const result = api.talkToSelf("我需要反思一下");
    expect(deliverToSelfMetaCalled).toBe(true);
    expect(result).toContain("ReflectFlow");
  });

  test("talkToSelf 无 deliverToSelfMeta 时返回错误", () => {
    const resolver: ObjectResolver = {
      getTree: () => tree as any,
      objectExists: () => true,
    };
    const ctx2: CollaborationContext = {
      currentObjectName: "A",
      currentThreadId: "root_001",
      resolver,
      scheduler: scheduler as any,
      sessionDir: "/tmp/test-session",
      // 不提供 deliverToSelfMeta
    };
    const api2 = createCollaborationAPI(ctx2);
    const result = api2.talkToSelf("hello");
    expect(result).toContain("错误");
  });
});

describe("replyToFlow()", () => {
  let tree: MockTree;
  let scheduler: MockScheduler;
  let api: ReturnType<typeof createCollaborationAPI>;

  beforeEach(async () => {
    tree = new MockTree();
    scheduler = new MockScheduler();

    // 创建一个正在运行的子线程（模拟发起 talkToSelf 的线程）
    await tree.createSubThread("root_001", "正在执行的任务", {
      creatorThreadId: "root_001",
    });

    const resolver: ObjectResolver = {
      getTree: () => tree as any,
      objectExists: () => true,
    };

    // ReflectFlow 的上下文（currentThreadId 是 ReflectFlow 自己的线程）
    const ctx: CollaborationContext = {
      currentObjectName: "A",
      currentThreadId: "root_001",
      resolver,
      scheduler: scheduler as any,
      sessionDir: "/tmp/test-session",
    };

    api = createCollaborationAPI(ctx);
  });

  test("replyToFlow 将消息写入目标线程的 inbox", () => {
    // 获取子线程 ID（由 createSubThread 生成）
    const children = tree.getChildren("root_001");
    expect(children).toHaveLength(1);
    const targetThreadId = children[0]!.id;

    const result = api.replyToFlow(targetThreadId, "反思结果：应该优化缓存策略");

    // 目标线程的 inbox 收到消息（通过 tree.writeInbox）
    const targetData = tree.readThreadData(targetThreadId);
    expect(targetData?.inbox).toBeDefined();
    const inboxMsgs = targetData!.inbox!.filter(m => m.content === "反思结果：应该优化缓存策略");
    expect(inboxMsgs).toHaveLength(1);
    expect(inboxMsgs[0]!.source).toBe("system");
    expect(inboxMsgs[0]!.from).toContain("ReflectFlow");
    expect(inboxMsgs[0]!.status).toBe("unread");

    expect(result).toContain("已回复");
  });

  test("replyToFlow 目标线程不存在时返回错误", () => {
    const result = api.replyToFlow("nonexistent_thread", "hello");
    expect(result).toContain("错误");
  });
});

describe("talk 回复路由（onTalkHandlerReturn）", () => {
  let treeA: MockTree;
  let treeB: MockTree;
  let scheduler: MockScheduler;

  beforeEach(() => {
    treeA = new MockTree();
    treeB = new MockTree();
    scheduler = new MockScheduler();
  });

  test("H return 后，结果路由回 A 的 inbox + locals", async () => {
    const { onTalkHandlerReturn } = await import("../src/thread/collaboration.js");

    // 模拟 talk 已经创建了 W 和 H
    // W 在 A 侧（等待占位节点）
    const wId = await treeA.createSubThread("root_001", "等待 B 回复", {
      creatorThreadId: "root_001",
    });
    expect(wId).not.toBeNull();
    await treeA.setNodeStatus(wId!, "waiting");
    await treeA.awaitThreads("root_001", [wId!]);

    // H 在 B 侧（处理节点）
    const hId = await treeB.createSubThread("root_001", "处理 A 的请求", {
      creatorThreadId: "root_001",
      creatorObjectName: "A",
    });
    expect(hId).not.toBeNull();
    await treeB.setNodeStatus(hId!, "done");
    // 手动设置 linked 信息和 summary（实际由 collaboration.ts 在创建时设置）
    treeB.nodes[hId!].linkedWaitingNodeId = wId!;
    treeB.nodes[hId!].linkedWaitingObjectName = "A";
    treeB.nodes[hId!].summary = "搜索完成，找到 3 篇论文";

    const resolver: ObjectResolver = {
      getTree: (name) => (name === "A" ? treeA : treeB) as any,
      objectExists: () => true,
    };

    onTalkHandlerReturn(
      resolver,
      scheduler as any,
      "B",
      hId!,
      "搜索完成，找到 3 篇论文",
      { papers: ["paper1.pdf", "paper2.pdf", "paper3.pdf"] },
    );

    // W 节点变为 done
    expect(treeA.getNode(wId!)!.status).toBe("done");
    expect(treeA.getNode(wId!)!.summary).toBe("搜索完成，找到 3 篇论文");

    // A 的 root_001 inbox 收到回复（通过 tree.writeInbox）
    const aRootData = treeA.readThreadData("root_001");
    const talkMsgs = aRootData!.inbox!.filter(m => m.source === "talk");
    expect(talkMsgs).toHaveLength(1);
    expect(talkMsgs[0]!.content).toContain("搜索完成");

    // A 的 root_001 locals 收到 artifacts
    expect(aRootData!.locals?.papers).toEqual(["paper1.pdf", "paper2.pdf", "paper3.pdf"]);

    // A 的 root_001 被唤醒（awaitingChildren 全部 done）
    expect(treeA.getNode("root_001")!.status).toBe("running");
    expect(scheduler.woken).toHaveLength(1);
    expect(scheduler.woken[0]!.objectName).toBe("A");
    expect(scheduler.woken[0]!.nodeId).toBe("root_001");
  });
});
```

- [ ] **Step 4: 运行测试确认失败**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-collaboration.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 5: 实现协作 API**

Create: `kernel/src/thread/collaboration.ts`

```typescript
/**
 * 协作 API — 跨 Object 对话与线程内协作
 *
 * 实现 talk()、create_sub_thread_on_node()、talkToSelf()、replyToFlow() 四个核心协作原语。
 * 替代旧的 kernel/src/world/router.ts。
 *
 * 设计原则：
 * - talk 是复合操作：创建 W（等待节点）+ H（处理节点）+ 状态转换
 * - W 是纯占位节点（无 thread.json），H 是真正执行的线程
 * - 所有结果路由回调用方的 inbox + locals
 *
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md#4.2
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md#9
 */

import { consola } from "consola";
import type {
  ThreadsTreeNodeMeta,
} from "./types.js";

/*
 * 注意：不再需要 import { enforceInboxLimits } from "./inbox.js"
 * ThreadsTree.writeInbox() 内置了溢出处理逻辑。
 * inbox.ts 的 enforceInboxLimits 仍然作为独立工具函数导出，
 * 供 Context 构建时兜底使用。
 */

/* ========== 类型定义 ========== */

/** Object 解析器 — 获取其他 Object 的线程树 */
export interface ObjectResolver {
  /** 获取指定 Object 的线程树（ThreadsTree 实例） */
  getTree(objectName: string): import("./tree.js").ThreadsTree;
  /** 检查 Object 是否存在 */
  objectExists(objectName: string): boolean;
}

/** 协作 API 的上下文（创建时注入） */
export interface CollaborationContext {
  /** 当前 Object 名称 */
  currentObjectName: string;
  /** 当前线程 ID */
  currentThreadId: string;
  /** Object 解析器 */
  resolver: ObjectResolver;
  /** Scheduler 引用（用于启动/唤醒线程） */
  scheduler: {
    startThread(objectName: string, nodeId: string): void;
    wakeThread(objectName: string, nodeId: string): void;
  };
  /** Session 目录（用于 Issue 操作） */
  sessionDir: string;
  /** 向 ReflectFlow 投递消息的回调（可选，由 World 层注入） */
  deliverToSelfMeta?: (objectName: string, message: string) => string;
  /**
   * S2: talk 深度/轮次限制（防止无限对话循环）
   *
   * 共享轮次计数器，同一 Session 内所有 CollaborationAPI 共享。
   * 每次 talk() 调用递增，超过 maxTalkRounds 时拒绝发送。
   * 复用 Scheduler 的 maxTotalIterations 作为全局保护的上限参考。
   *
   * 设计决策：
   * - 使用共享计数器而非树深度，因为 talk 可能在不同深度的线程中发起
   * - 默认上限 100 轮（与旧 Router 的 MAX_ROUNDS 一致）
   * - Scheduler 的 maxTotalIterations 作为更高层的全局保护（覆盖所有线程的总迭代）
   */
  talkRoundCounter?: SharedTalkRoundCounter;
}

/** S2: 共享 talk 轮次计数器 — 同一 Session 内所有 CollaborationAPI 共享 */
export interface SharedTalkRoundCounter {
  count: number;
}

/** S2: talk 轮次上限（防止无限对话） */
const MAX_TALK_ROUNDS = 100;

/** 协作 API 接口（注入到沙箱） */
export interface ThreadCollaborationAPI {
  /** 跨 Object 对话（async：内部调用 createSubThread） */
  talk(targetObject: string, message: string): Promise<string>;
  /** 在指定节点下创建子线程（同 Object 内，async） */
  createSubThreadOnNode(nodeId: string, message: string): Promise<string>;
  /** 向自己的 ReflectFlow 发消息 */
  talkToSelf(message: string): string;
  /** ReflectFlow 专用：回复发起方线程（将消息写入发起方线程的 inbox） */
  replyToFlow(targetThreadId: string, message: string): string;
}

/* ========== 核心实现 ========== */

/*
 * 注意：不再需要 generateNodeId / generateMessageId。
 * - 节点 ID 由 ThreadsTree.createSubThread 内部生成
 * - 消息 ID 由 ThreadsTree.writeInbox 内部生成
 */

/**
 * 创建协作 API
 *
 * 每个线程的 ThinkLoop 启动时调用一次，注入到沙箱环境。
 *
 * @param ctx - 协作上下文
 * @returns 协作 API 对象
 */
export function createCollaborationAPI(ctx: CollaborationContext): ThreadCollaborationAPI {
  return {
    async talk(targetObject: string, message: string): Promise<string> {
      return executeTalk(ctx, targetObject, message);
    },

    async createSubThreadOnNode(nodeId: string, message: string): Promise<string> {
      return executeCreateSubThreadOnNode(ctx, nodeId, message);
    },

    talkToSelf(message: string): string {
      return executeTalkToSelf(ctx, message);
    },

    replyToFlow(targetThreadId: string, message: string): string {
      return executeReplyToFlow(ctx, targetThreadId, message);
    },
  };
}

/**
 * talk() 实现 — 跨 Object 对话
 *
 * 完整生命周期（Spec Section 4.2）：
 * 1. 在 A（调用方）当前节点下创建子节点 W（等待占位）
 * 2. 在 B（目标方）Root 下创建子节点 H（处理节点）
 * 3. A 的当前线程进入 waiting
 * 4. H 独立执行，完成后通过 onTalkHandlerReturn 路由结果
 *
 * 【API 适配】使用 ThreadsTree 的真实 API：
 * - createSubThread() 替代 createNode()（ID 由内部生成）
 * - setNodeStatus() 替代 updateNode()
 * - awaitThreads() 替代手动设置 awaitingChildren
 * - writeInbox() 替代 addInboxMessage()
 * - 无需手动 flush()（_mutate 内部自动 flush）
 */
async function executeTalk(ctx: CollaborationContext, targetObject: string, message: string): Promise<string> {
  const { currentObjectName, currentThreadId, resolver, scheduler } = ctx;

  /* 校验 */
  if (targetObject === currentObjectName) {
    return "[错误] 不能向自己发消息，请使用 talkToSelf()";
  }
  if (!resolver.objectExists(targetObject)) {
    return `[错误] 对象 ${targetObject} 不存在`;
  }

  /* S2: talk 轮次限制检查 */
  const counter = ctx.talkRoundCounter ?? { count: 0 };
  counter.count++;
  if (counter.count > MAX_TALK_ROUNDS) {
    const errMsg = `[Collaboration] talk 轮次超限 (${counter.count}/${MAX_TALK_ROUNDS})，拒绝 ${currentObjectName} → ${targetObject}`;
    consola.warn(errMsg);
    return `[错误] 对话轮次过多（${MAX_TALK_ROUNDS}），无法继续。请检查是否存在对话循环。`;
  }

  const myTree = resolver.getTree(currentObjectName);
  const targetTree = resolver.getTree(targetObject);

  /* Step 1: 在 A 的当前节点下创建 W（等待占位节点） */
  const wId = await myTree.createSubThread(currentThreadId, `等待 ${targetObject} 回复`, {
    creatorThreadId: currentThreadId,
  });
  if (!wId) return "[错误] 创建等待节点失败（可能超过深度限制）";
  await myTree.setNodeStatus(wId, "waiting");

  /* Step 2: 在 B 的 Root 下创建 H（处理节点） */
  const targetRootId = targetTree.rootId;
  const hId = await targetTree.createSubThread(targetRootId, `处理 ${currentObjectName} 的请求`, {
    creatorThreadId: currentThreadId,
    creatorObjectName: currentObjectName,
    linkedWaitingNodeId: wId,
    linkedWaitingObjectName: currentObjectName,
    creationMode: "talk",
  });
  if (!hId) return "[错误] 创建处理节点失败";
  await targetTree.setNodeStatus(hId, "running");

  /* 将消息写入 H 的 inbox（使用 tree.writeInbox） */
  targetTree.writeInbox(hId, {
    from: currentObjectName,
    content: message,
    source: "talk",
  });

  /* Step 3: A 的当前线程进入 waiting（使用 tree.awaitThreads） */
  await myTree.awaitThreads(currentThreadId, [wId]);

  /* 记录 action（读取当前线程数据，追加 action，写回） */
  const myThreadData = myTree.readThreadData(currentThreadId);
  if (myThreadData) {
    myThreadData.actions.push({
      type: "message_out",
      content: `[talk → ${targetObject}] ${message}`,
      timestamp: Date.now(),
    });
    myTree.writeThreadData(currentThreadId, myThreadData);
  }

  /* 启动 H 的线程 */
  scheduler.startThread(targetObject, hId);

  consola.info(`[Collaboration] ${currentObjectName}:${currentThreadId} → talk(${targetObject}): W=${wId}, H=${hId}`);

  return `[消息已发送给 ${targetObject}，等待回复]`;
}

/**
 * create_sub_thread_on_node() 实现 — 在指定节点下创建子线程
 *
 * 仅限同一 Object 内。目标节点的完整 actions 历史会作为新线程的 Context。
 *
 * 【API 适配】使用 ThreadsTree 的真实 API：
 * - createSubThread() 创建子线程
 * - readThreadData() 读取目标节点的 actions
 * - writeThreadData() 写入 inject action 到新子线程
 * - writeInbox() 写入消息
 * - awaitThreads() 设置等待
 *
 * @ref Spec Section 4.1 — create_sub_thread_on_node
 */
async function executeCreateSubThreadOnNode(ctx: CollaborationContext, nodeId: string, message: string): Promise<string> {
  const { currentObjectName, currentThreadId, resolver, scheduler } = ctx;

  const tree = resolver.getTree(currentObjectName);

  /* 校验目标节点存在 */
  const targetNode = tree.getNode(nodeId);
  if (!targetNode) {
    return `[错误] 节点 ${nodeId} 不存在`;
  }

  /* 读取目标节点的 thread.json，获取完整 actions 历史 */
  const targetThreadData = tree.readThreadData(nodeId);
  const targetActions = targetThreadData?.actions ?? [];

  /* 在目标节点下创建子线程 */
  const subId = await tree.createSubThread(nodeId, `回忆 ${targetNode.title}`, {
    creatorThreadId: currentThreadId,
    creatorObjectName: currentObjectName,
    creationMode: "sub_thread_on_node",  // I2: 标记创建方式
  });
  if (!subId) return `[错误] 创建子线程失败（可能超过深度限制）`;
  await tree.setNodeStatus(subId, "running");

  /*
   * I2: 将目标节点的完整 actions 作为 inject action 写入新子线程的 thread.json。
   * 这样子线程的 Context 中自然包含目标节点的历史（按需回忆）。
   * Phase 3 的 buildThreadContext 在构建 Context 时会展示这些 inject actions。
   */
  if (targetActions.length > 0) {
    const subData = tree.readThreadData(subId);
    if (subData) {
      const injectContent = targetActions
        .map((a: any) => `[${a.type}] ${a.content ?? ""}`)
        .join("\n");
      subData.actions.push({
        type: "inject",
        content: `=== 目标节点 ${targetNode.title} 的完整历史 ===\n${injectContent}`,
        timestamp: Date.now(),
      });
      tree.writeThreadData(subId, subData);
    }
  }

  /* 将消息写入子线程的 inbox */
  tree.writeInbox(subId, {
    from: currentObjectName,
    content: message,
    source: "talk",
  });

  /* 当前线程进入 waiting */
  const currentNode = tree.getNode(currentThreadId);
  const existingAwaiting = currentNode?.awaitingChildren ?? [];
  await tree.awaitThreads(currentThreadId, [...existingAwaiting, subId]);

  /* 记录 action */
  const myThreadData = tree.readThreadData(currentThreadId);
  if (myThreadData) {
    myThreadData.actions.push({
      type: "create_thread",
      content: `[create_sub_thread_on_node(${nodeId})] ${message}`,
      timestamp: Date.now(),
    });
    tree.writeThreadData(currentThreadId, myThreadData);
  }

  /* 启动子线程 */
  scheduler.startThread(currentObjectName, subId);

  consola.info(`[Collaboration] ${currentObjectName}:${currentThreadId} → create_sub_thread_on_node(${nodeId}): sub=${subId}`);

  return subId;
}

/**
 * talkToSelf() 实现 — 向 ReflectFlow 发消息
 *
 * 适配到新的线程树模型：通过 deliverToSelfMeta 回调与 ReflectFlow 交互。
 * ReflectFlow 的具体实现不变，只是入口从旧 Router 迁移到新 CollaborationAPI。
 */
function executeTalkToSelf(ctx: CollaborationContext, message: string): string {
  const { currentObjectName, deliverToSelfMeta } = ctx;

  if (!deliverToSelfMeta) {
    return "[错误] talkToSelf 不可用（未配置 ReflectFlow）";
  }

  try {
    return deliverToSelfMeta(currentObjectName, message);
  } catch (e) {
    const errMsg = `[Collaboration] talkToSelf 失败: ${(e as Error).message}`;
    consola.error(errMsg);
    return `[错误] ${(e as Error).message}`;
  }
}

/**
 * replyToFlow() 实现 — ReflectFlow 回复发起方线程
 *
 * 在新的线程树模型中，replyToFlow 的语义是：
 * ReflectFlow 回复发起方 → 将消息写入发起方线程的 inbox。
 * 这是 talkToSelf 的反向通道。
 *
 * 【API 适配】使用 ThreadsTree 的真实 API：
 * - getNode() 校验目标线程存在
 * - writeInbox() 写入消息（内置溢出处理，无需手动调用 enforceInboxLimits）
 *
 * @param ctx - 协作上下文
 * @param targetThreadId - 发起方线程 ID
 * @param message - 回复内容
 */
function executeReplyToFlow(ctx: CollaborationContext, targetThreadId: string, message: string): string {
  const { currentObjectName, resolver } = ctx;

  const tree = resolver.getTree(currentObjectName);

  /* 校验目标线程存在 */
  const targetNode = tree.getNode(targetThreadId);
  if (!targetNode) {
    return `[错误] 线程 ${targetThreadId} 不存在`;
  }

  /* 将消息写入目标线程的 inbox（tree.writeInbox 内置溢出处理） */
  tree.writeInbox(targetThreadId, {
    from: `${currentObjectName}:ReflectFlow`,
    content: message,
    source: "system",
  });

  consola.info(`[Collaboration] ${currentObjectName}:ReflectFlow → replyToFlow(${targetThreadId})`);

  return `[已回复线程 ${targetThreadId}]`;
}

/* ========== 回复路由 ========== */

/**
 * talk 处理节点 return 后的回调
 *
 * 由 Scheduler 的 onThreadFinished 调用。当 H 节点 return 时：
 * 1. W.status → done，W.summary = H 的 summary
 * 2. H 的 summary → 调用方线程的 inbox
 * 3. H 的 artifacts → 调用方线程的 locals
 * 4. 检查调用方的 awaitingChildren 是否全部 done → 唤醒
 *
 * 【API 适配】使用 ThreadsTree 的真实 API：
 * - getNode() 读取节点信息
 * - returnThread() 完成 W 节点（设置 done + summary）
 * - writeInbox() 写入调用方 inbox
 * - readThreadData/writeThreadData 操作 locals
 * - checkAndWake() 检查并唤醒等待者
 *
 * @param resolver - Object 解析器
 * @param scheduler - Scheduler 引用
 * @param handlerObjectName - H 所在的 Object 名称
 * @param handlerNodeId - H 的节点 ID
 * @param summary - H 的 return summary
 * @param artifacts - H 的 return artifacts
 */
export function onTalkHandlerReturn(
  resolver: ObjectResolver,
  scheduler: { wakeThread(objectName: string, nodeId: string): void },
  handlerObjectName: string,
  handlerNodeId: string,
  summary: string,
  artifacts?: Record<string, unknown>,
): void {
  const handlerTree = resolver.getTree(handlerObjectName);
  const handlerNode = handlerTree.getNode(handlerNodeId);

  if (!handlerNode?.linkedWaitingNodeId || !handlerNode?.linkedWaitingObjectName) {
    consola.warn(`[Collaboration] onTalkHandlerReturn: H=${handlerNodeId} 没有 linked 信息，跳过`);
    return;
  }

  const callerObjectName = handlerNode.linkedWaitingObjectName;
  const waitingNodeId = handlerNode.linkedWaitingNodeId;
  const callerTree = resolver.getTree(callerObjectName);

  /* Step 1: W.status → done + summary */
  callerTree.setNodeStatus(waitingNodeId, "done");
  callerTree.updateNodeMeta(waitingNodeId, { summary });

  /* Step 2: 找到调用方线程（W 的 creatorThreadId） */
  const wNode = callerTree.getNode(waitingNodeId);
  const callerThreadId = wNode?.creatorThreadId;
  if (!callerThreadId) {
    consola.warn(`[Collaboration] onTalkHandlerReturn: W=${waitingNodeId} 没有 creatorThreadId`);
    return;
  }

  /* 写入调用方线程的 inbox（使用 tree.writeInbox） */
  callerTree.writeInbox(callerThreadId, {
    from: handlerObjectName,
    content: `[${handlerObjectName} 回复] ${summary}`,
    source: "talk",
  });

  /* Step 3: artifacts → 调用方线程的 locals */
  if (artifacts && Object.keys(artifacts).length > 0) {
    const callerThreadData = callerTree.readThreadData(callerThreadId);
    if (callerThreadData) {
      callerThreadData.locals = { ...(callerThreadData.locals ?? {}), ...artifacts };
      callerTree.writeThreadData(callerThreadId, callerThreadData);
    }
  }

  /* Step 4: 检查 awaitingChildren 是否全部 done → 唤醒 */
  callerTree.checkAndWake(callerThreadId).then((woken) => {
    if (woken) {
      scheduler.wakeThread(callerObjectName, callerThreadId);
      consola.info(`[Collaboration] 唤醒 ${callerObjectName}:${callerThreadId}（awaitingChildren 全部完成）`);
    }
  });
}
```

- [ ] **Step 6: 运行测试确认通过**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-collaboration.test.ts`
Expected: 全部 PASS

- [ ] **Step 7: 运行全量测试确认无回归**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test`
Expected: 全部 PASS

- [ ] **Step 8: Commit**

```bash
git add kernel/src/thread/types.ts kernel/src/thread/tree.ts kernel/src/thread/collaboration.ts kernel/tests/thread-collaboration.test.ts
git commit -m "feat: 协作 API（talk 完整生命周期 + create_sub_thread_on_node + talkToSelf + replyToFlow）"
```

---

### Task 3: Issue 协作集成

**Files:**
- Modify: `kernel/src/thread/collaboration.ts`（添加 `commentOnIssueWithNotify`）
- Create: `kernel/tests/thread-issue-collab.test.ts`

- [ ] **Step 1: 写测试文件**

Create: `kernel/tests/thread-issue-collab.test.ts`

```typescript
/**
 * Issue 协作集成测试
 *
 * 测试 commentOnIssue 时 @某人 → 在对方 Root 下创建 issue 对应的 thread。
 * 同一 Issue 不重复创建 thread。
 *
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md#9.2
 */
import { describe, test, expect, beforeEach } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  commentOnIssueWithNotify,
  type ObjectResolver,
} from "../src/thread/collaboration.js";
import type { ThreadsTreeNodeMeta, ThreadInboxMessage, ThreadStatus } from "../src/thread/types.js";
import { createIssue } from "../src/kanban/methods.js";

const TEST_DIR = join(import.meta.dir, ".tmp_issue_collab_test");

/* ========== Mock 基础设施（简化版，复用 Task 2 的 MockTree 模式） ========== */

/**
 * Issue 测试用 MockTree — 匹配 ThreadsTree 真实 API
 * 与 Task 2 的 MockTree 相同结构，但简化（只需 Issue 协作用到的方法）
 */
class MockTree {
  nodes: Record<string, ThreadsTreeNodeMeta> = {};
  threadData: Record<string, { id: string; actions: any[]; inbox?: ThreadInboxMessage[]; locals?: Record<string, unknown> }> = {};
  private _rootId = "root_001";
  private _nextId = 0;

  constructor() {
    const now = Date.now();
    this.nodes["root_001"] = {
      id: "root_001", title: "Root", status: "running",
      childrenIds: [], createdAt: now, updatedAt: now,
    };
    this.threadData["root_001"] = { id: "root_001", actions: [] };
  }

  get rootId() { return this._rootId; }
  getNode(id: string) { return this.nodes[id] ? { ...this.nodes[id] } : null; }
  getChildren(id: string) {
    const node = this.nodes[id];
    if (!node) return [];
    return node.childrenIds.map((cid) => this.nodes[cid]!).filter(Boolean).map(n => ({ ...n }));
  }
  async createSubThread(parentId: string, title: string, options?: {
    description?: string; creatorThreadId?: string; creatorObjectName?: string;
    linkedWaitingNodeId?: string; linkedWaitingObjectName?: string;
    creationMode?: string;
  }): Promise<string | null> {
    const parent = this.nodes[parentId];
    if (!parent) return null;
    const id = `th_mock_${this._nextId++}`;
    const now = Date.now();
    parent.childrenIds.push(id);
    this.nodes[id] = {
      id, title, description: options?.description,
      status: "pending", parentId, childrenIds: [],
      creatorThreadId: options?.creatorThreadId,
      creatorObjectName: options?.creatorObjectName,
      createdAt: now, updatedAt: now,
    };
    this.threadData[id] = { id, actions: [] };
    return id;
  }
  async setNodeStatus(nodeId: string, status: ThreadStatus): Promise<void> {
    const node = this.nodes[nodeId];
    if (node) { node.status = status; node.updatedAt = Date.now(); }
  }
  writeInbox(nodeId: string, msg: { from: string; content: string; source: ThreadInboxMessage["source"]; issueId?: string }): void {
    const data = this.threadData[nodeId];
    if (!data) return;
    if (!data.inbox) data.inbox = [];
    data.inbox.push({
      id: `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      from: msg.from, content: msg.content, timestamp: Date.now(),
      source: msg.source, issueId: msg.issueId, status: "unread",
    });
  }
  readThreadData(nodeId: string) { return this.threadData[nodeId] ?? null; }
  writeThreadData(nodeId: string, data: any) { this.threadData[nodeId] = data; }
}

class MockScheduler {
  started: { objectName: string; nodeId: string }[] = [];
  startThread(objectName: string, nodeId: string) {
    this.started.push({ objectName, nodeId });
  }
  wakeThread() {}
}

/* ========== 测试 ========== */

describe("Issue 协作集成", () => {
  let treeA: MockTree;
  let treeB: MockTree;
  let treeC: MockTree;
  let scheduler: MockScheduler;
  let resolver: ObjectResolver;
  let sessionDir: string;
  let issueId: string;  // I3: 捕获 createIssue 返回的 ID，不硬编码

  beforeEach(async () => {
    treeA = new MockTree();
    treeB = new MockTree();
    treeC = new MockTree();
    scheduler = new MockScheduler();

    const trees: Record<string, MockTree> = { A: treeA, B: treeB, C: treeC };

    resolver = {
      getTree: (name) => trees[name] as any,
      objectExists: (name) => name in trees,
    };

    sessionDir = join(TEST_DIR, `session_${Date.now()}`);
    mkdirSync(sessionDir, { recursive: true });

    // I3: 捕获 createIssue 返回的 Issue 对象，使用其 .id
    const issue = await createIssue(sessionDir, "讨论 AI safety 方案", "需要多方讨论", ["A", "B", "C"]);
    issueId = issue.id;
  });

  test("commentOnIssue @B → B 的 Root 下创建 issue thread", async () => {
    await commentOnIssueWithNotify(
      sessionDir, resolver, scheduler as any,
      issueId, "A", "我认为应该优先考虑对齐问题", ["B"],
    );

    // B 的 Root 下创建了 issue thread
    const bChildren = treeB.getChildren("root_001");
    expect(bChildren).toHaveLength(1);
    const issueThread = bChildren[0]!;
    expect(issueThread.title).toContain("Issue");
    expect(issueThread.description).toContain(`[issue:${issueId}]`);

    // issue thread 的 inbox 收到通知（通过 tree.readThreadData）
    const threadData = treeB.readThreadData(issueThread.id);
    expect(threadData?.inbox).toHaveLength(1);
    expect(threadData!.inbox![0]!.source).toBe("issue");
    expect(threadData!.inbox![0]!.issueId).toBe(issueId);
    expect(threadData!.inbox![0]!.content).toContain("对齐问题");

    // Scheduler 启动了 issue thread
    expect(scheduler.started).toHaveLength(1);
    expect(scheduler.started[0]!.objectName).toBe("B");
  });

  test("同一 Issue 不重复创建 thread", async () => {
    // 第一次 @B
    await commentOnIssueWithNotify(
      sessionDir, resolver, scheduler as any,
      issueId, "A", "第一条评论", ["B"],
    );

    // 第二次 @B（同一 Issue）
    await commentOnIssueWithNotify(
      sessionDir, resolver, scheduler as any,
      issueId, "C", "第二条评论", ["B"],
    );

    // B 的 Root 下仍然只有 1 个 issue thread
    const bChildren = treeB.getChildren("root_001");
    expect(bChildren).toHaveLength(1);

    // 但 inbox 有 2 条消息（通过 tree.readThreadData）
    const threadData = treeB.readThreadData(bChildren[0]!.id);
    expect(threadData?.inbox).toHaveLength(2);
  });

  test("@多人时，每人各创建一个 issue thread", async () => {
    await commentOnIssueWithNotify(
      sessionDir, resolver, scheduler as any,
      issueId, "A", "大家怎么看？", ["B", "C"],
    );

    const bChildren = treeB.getChildren("root_001");
    expect(bChildren).toHaveLength(1);

    const cChildren = treeC.getChildren("root_001");
    expect(cChildren).toHaveLength(1);

    expect(scheduler.started).toHaveLength(2);
  });

  test("@自己时不创建 thread", async () => {
    await commentOnIssueWithNotify(
      sessionDir, resolver, scheduler as any,
      issueId, "A", "自言自语", ["A"],
    );

    const aChildren = treeA.getChildren("root_001");
    expect(aChildren).toHaveLength(0);
    expect(scheduler.started).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-issue-collab.test.ts`
Expected: FAIL（`commentOnIssueWithNotify` 不存在）

- [ ] **Step 3: 在 collaboration.ts 中添加 Issue 协作函数**

Append to: `kernel/src/thread/collaboration.ts`

```typescript
/* ========== Issue 协作 ========== */

import * as discussion from "../kanban/discussion.js";

/**
 * commentOnIssue + 自动通知被 @的对象
 *
 * 当 commentOnIssue 时 @某人：
 * 1. 调用现有 kanban/discussion.commentOnIssue 发表评论
 * 2. 对每个被 @的对象，检查其 Root 下是否已有该 Issue 的 thread
 * 3. 如果没有 → 创建 issue thread + inbox 通知 + 启动线程
 * 4. 如果已有 → 仅追加 inbox 通知
 *
 * Issue thread 的去重标记：description 包含 "[issue:{issueId}]"
 *
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md#9.2
 */
export async function commentOnIssueWithNotify(
  sessionDir: string,
  resolver: ObjectResolver,
  scheduler: { startThread(objectName: string, nodeId: string): void },
  issueId: string,
  author: string,
  content: string,
  mentions?: string[],
): Promise<void> {
  /* Step 1: 发表评论（复用现有 kanban 逻辑） */
  const { comment, mentionTargets } = await discussion.commentOnIssue(
    sessionDir, issueId, author, content, mentions,
  );

  /* Step 2: 对每个被 @的对象，创建或追加 issue thread */

  for (const targetName of mentionTargets) {
    if (!resolver.objectExists(targetName)) continue;

    const targetTree = resolver.getTree(targetName);
    const targetRootId = targetTree.rootId;

    /* 检查是否已有该 Issue 的 thread（去重） */
    const issueTag = `[issue:${issueId}]`;
    const existingChildren = targetTree.getChildren(targetRootId);
    let issueThread = existingChildren.find(
      (n) => n.description?.includes(issueTag),
    );

    if (!issueThread) {
      /* 创建新的 issue thread（使用 createSubThread，ID 由内部生成） */
      const threadId = await targetTree.createSubThread(targetRootId, `Issue ${issueId} 讨论`, {
        description: `${issueTag} 来自 ${author} 的讨论邀请`,
      });
      if (!threadId) continue;
      await targetTree.setNodeStatus(threadId, "running");
      issueThread = targetTree.getNode(threadId)!;

      /* 启动线程 */
      scheduler.startThread(targetName, threadId);
    }

    /* 追加 inbox 通知（使用 tree.writeInbox，内置溢出处理） */
    targetTree.writeInbox(issueThread.id, {
      from: author,
      content: `[Issue ${issueId}] ${author}: ${content}`,
      source: "issue",
      issueId,
    });
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-issue-collab.test.ts`
Expected: 全部 PASS

- [ ] **Step 5: 清理测试临时目录**

在测试文件顶部添加 `afterEach` 清理：

```typescript
import { afterEach } from "bun:test";

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});
```

- [ ] **Step 6: Commit**

```bash
git add kernel/src/thread/collaboration.ts kernel/tests/thread-issue-collab.test.ts
git commit -m "feat: Issue 协作集成（commentOnIssue @通知 + issue thread 去重）"
```

---

### Task 4: 替换旧 Router + 模块导出更新

**Files:**
- Modify: `kernel/src/thread/index.ts`（添加导出）
- Modify: `kernel/src/thread/scheduler.ts`（集成 onTalkHandlerReturn）
- Modify: `kernel/src/world/world.ts`（替换旧 Router 为新 CollaborationAPI）
- Modify: `kernel/src/world/index.ts`（替换旧 Router 导出）
- Modify: `kernel/src/world/scheduler.ts`（替换旧 Router 类型导入）
- Modify: `kernel/src/flow/thinkloop.ts`（替换旧 Router 类型导入）

**I4: 旧 Router 的所有 4 个导入文件及具体替换语句：**

```
文件 1: kernel/src/flow/thinkloop.ts
  旧: import type { CollaborationAPI } from "../world/router.js";
  新: import type { ThreadCollaborationAPI as CollaborationAPI } from "../thread/collaboration.js";
  注: 如果 thinkloop 中使用了 CollaborationAPI 类型名，可以用 alias 保持兼容，
      或者全局替换 CollaborationAPI → ThreadCollaborationAPI。

文件 2: kernel/src/world/scheduler.ts
  旧: import type { CollaborationAPI } from "./router.js";
  新: import type { ThreadCollaborationAPI as CollaborationAPI } from "../thread/collaboration.js";

文件 3: kernel/src/world/index.ts
  旧: export { createCollaborationAPI } from "./router.js";
       export type { CollaborationAPI, Routable } from "./router.js";
  新: export { createCollaborationAPI, type ThreadCollaborationAPI, type CollaborationContext, type ObjectResolver } from "../thread/collaboration.js";
  注: 删除 Routable 导出（新模型不再需要 Routable 接口）。

文件 4: kernel/src/world/world.ts
  旧: import { createCollaborationAPI, createSharedRoundCounter, type Routable, type SharedRoundCounter } from "./router.js";
  新: import { createCollaborationAPI, type CollaborationContext, type ObjectResolver, type ThreadCollaborationAPI } from "../thread/collaboration.js";
  注: 删除 Routable/SharedRoundCounter（新模型不再需要）。World 类不再实现 Routable 接口。
```

- [ ] **Step 1: 更新模块导出**

Modify: `kernel/src/thread/index.ts`

在现有导出基础上追加：

```typescript
export * from "./inbox.js";
export {
  createCollaborationAPI,
  onTalkHandlerReturn,
  commentOnIssueWithNotify,
  type CollaborationContext,
  type ObjectResolver,
  type ThreadCollaborationAPI,
} from "./collaboration.js";
```

- [ ] **Step 2: 在 Scheduler 的 onThreadFinished 中集成 talk 回复路由**

Modify: `kernel/src/thread/scheduler.ts`

在 `onThreadFinished` 方法中，检查完成的线程是否是 talk 的处理节点（H），如果是则调用 `onTalkHandlerReturn`：

```typescript
// 在 onThreadFinished(objectName, nodeId) 方法中追加：

import { onTalkHandlerReturn } from "./collaboration.js";

// ... 现有的 onThreadFinished 逻辑 ...

/* 检查是否是 talk 的处理节点（H） */
const tree = this.getObjectTree(objectName);
const finishedNode = tree.getNode(nodeId);
if (finishedNode?.linkedWaitingNodeId && finishedNode?.linkedWaitingObjectName) {
  /* 这是一个 talk 处理节点，路由结果回调用方 */
  const threadData = tree.readThreadData(nodeId);
  onTalkHandlerReturn(
    this._resolver,       // ObjectResolver
    this,                 // scheduler（自身实现了 wakeThread）
    objectName,
    nodeId,
    finishedNode.summary ?? "（无摘要）",
    // artifacts 从 thread.json 的 locals 中提取
    threadData?.locals as Record<string, unknown> | undefined,
  );
}
```

- [ ] **Step 3: 在 World 中替换旧 Router**

Modify: `kernel/src/world/world.ts`

替换要点：

```typescript
// 旧代码（删除）：
import { createCollaborationAPI, createSharedRoundCounter, type Routable, type SharedRoundCounter } from "./router.js";

// 新代码（替换为）：
import {
  createCollaborationAPI,
  type CollaborationContext,
  type ObjectResolver,
  type ThreadCollaborationAPI,
} from "../thread/collaboration.js";
```

在 `talk()` 方法中，将旧的 `deliverMessage` 调用替换为新的 `createCollaborationAPI`：

```typescript
// World 类中新增 ObjectResolver 实现
private _createObjectResolver(sessionId: string): ObjectResolver {
  return {
    getTree: (objectName: string) => {
      const session = this._activeSessions.get(sessionId);
      if (!session) throw new Error(`Session ${sessionId} not found`);
      return session.scheduler.getObjectTree(objectName);
    },
    objectExists: (objectName: string) => {
      return this._registry.has(objectName);
    },
  };
}

// 为每个线程创建 CollaborationAPI 时：
private _createThreadCollaborationAPI(
  sessionId: string,
  objectName: string,
  threadId: string,
): ThreadCollaborationAPI {
  const resolver = this._createObjectResolver(sessionId);
  const session = this._activeSessions.get(sessionId);

  const ctx: CollaborationContext = {
    currentObjectName: objectName,
    currentThreadId: threadId,
    resolver,
    scheduler: session!.scheduler,
    sessionDir: join(this._rootDir, "flows", sessionId),
    deliverToSelfMeta: (name, msg) => {
      return this.deliverToSelfMeta(name, msg, threadId);
    },
  };

  return createCollaborationAPI(ctx);
}
```

- [ ] **Step 4: 确认类型检查通过**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bunx tsc --noEmit`
Expected: 无错误

- [ ] **Step 5: 运行全量测试确认无回归**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test`
Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add kernel/src/thread/index.ts kernel/src/thread/scheduler.ts kernel/src/world/world.ts kernel/src/world/index.ts kernel/src/world/scheduler.ts kernel/src/flow/thinkloop.ts
git commit -m "refactor: 替换旧 Router 为新 CollaborationAPI（talk/talkToSelf/replyToFlow/Issue 统一入口）"
```

---

### Task 5: 旧 Router 清理

**Files:**
- Delete: `kernel/src/world/router.ts`（旧 Router，121 行）
- Modify: 所有引用旧 Router 的文件（已在 Task 4 的 I4 清单中列出）

**I4: 受影响文件完整清单（4 个导入 router.ts 的文件）：**

| # | 文件 | 旧 import | 新 import | 备注 |
|---|------|-----------|-----------|------|
| 1 | `kernel/src/flow/thinkloop.ts` | `import type { CollaborationAPI } from "../world/router.js"` | `import type { ThreadCollaborationAPI as CollaborationAPI } from "../thread/collaboration.js"` | alias 保持兼容 |
| 2 | `kernel/src/world/scheduler.ts` | `import type { CollaborationAPI } from "./router.js"` | `import type { ThreadCollaborationAPI as CollaborationAPI } from "../thread/collaboration.js"` | alias 保持兼容 |
| 3 | `kernel/src/world/index.ts` | `export { createCollaborationAPI } from "./router.js"` + `export type { CollaborationAPI, Routable } from "./router.js"` | `export { createCollaborationAPI, type ThreadCollaborationAPI, type CollaborationContext, type ObjectResolver } from "../thread/collaboration.js"` | 删除 Routable |
| 4 | `kernel/src/world/world.ts` | `import { createCollaborationAPI, createSharedRoundCounter, type Routable, type SharedRoundCounter } from "./router.js"` | `import { createCollaborationAPI, type CollaborationContext, type ObjectResolver, type ThreadCollaborationAPI } from "../thread/collaboration.js"` | 删除 Routable/SharedRoundCounter |

- [ ] **Step 1: 替换所有 4 个文件的 import 语句**

按上表逐一替换。注意：如果 Task 4 Step 3 已经替换了 world.ts，此处只需处理剩余的 thinkloop.ts、scheduler.ts、index.ts。

- [ ] **Step 2: 删除旧 Router**

```bash
rm kernel/src/world/router.ts
```

- [ ] **Step 3: 确认类型检查通过**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bunx tsc --noEmit`
Expected: 无错误

- [ ] **Step 4: 运行全量测试确认无回归**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: 删除旧 Router（router.ts），协作能力完全由 thread/collaboration.ts 接管"
```

---

## 阶段 5 完成标准

- [ ] `kernel/src/thread/inbox.ts` — inbox 清理策略（unread 50 / marked 200）
- [ ] `kernel/src/thread/types.ts` — ThreadsTreeNodeMeta 添加 `creationMode` 字段（I2）
- [ ] `kernel/src/thread/tree.ts` — 扩展 createSubThread options（linkedWaitingNodeId 等）+ 添加 updateNodeMeta
- [ ] `kernel/src/thread/collaboration.ts` — 完整协作 API：
  - [ ] `talk()` — 创建 W + H + waiting + 回复路由
  - [ ] `createSubThreadOnNode()` — 同 Object 内按需回忆 + 目标节点 actions 注入（I2）
  - [ ] `talkToSelf()` — 适配 ReflectFlow
  - [ ] `replyToFlow()` — ReflectFlow 回复发起方线程 → 写入 inbox（I1）
  - [ ] `onTalkHandlerReturn()` — H return 后结果路由回调用方
  - [ ] `commentOnIssueWithNotify()` — Issue @通知 + thread 去重
  - [ ] `SharedTalkRoundCounter` + `MAX_TALK_ROUNDS` — talk 轮次限制（S2）
- [ ] `kernel/src/thread/index.ts` — 导出新模块
- [ ] `kernel/src/thread/scheduler.ts` — onThreadFinished 集成 talk 回复路由
- [ ] `kernel/src/world/world.ts` — 替换旧 Router 为新 CollaborationAPI
- [ ] `kernel/src/world/index.ts` — 替换旧 Router 导出（I4）
- [ ] `kernel/src/world/scheduler.ts` — 替换旧 Router 类型导入（I4）
- [ ] `kernel/src/flow/thinkloop.ts` — 替换旧 Router 类型导入（I4）
- [ ] `kernel/src/world/router.ts` — 已删除
- [ ] `kernel/tests/thread-inbox.test.ts` — 全部 PASS
- [ ] `kernel/tests/thread-collaboration.test.ts` — 全部 PASS（含 replyToFlow 测试）
- [ ] `kernel/tests/thread-issue-collab.test.ts` — 全部 PASS（I3: 使用动态 issueId）
- [ ] `bun test` 全量测试无回归
