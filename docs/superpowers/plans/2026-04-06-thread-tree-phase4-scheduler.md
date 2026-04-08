# 线程树架构重构 — 阶段 4：Scheduler 重写

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有的轮询式 Scheduler 重写为事件驱动的线程级调度器，每个线程独立 async loop，支持唤醒、错误传播、死锁检测、暂停/恢复。

**Architecture:** 替换 `kernel/src/world/scheduler.ts`，新增 `kernel/src/thread/scheduler.ts`。旧 Scheduler 在阶段 5 集成完成后删除。

**Tech Stack:** TypeScript, Bun runtime, bun:test

**Spec:** `docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md` Section 6, 8

**依赖：** 阶段 1（types.ts, persistence.ts）、阶段 2（ThreadsTree 内存模型）、阶段 3（ThinkLoop 重写）

**阶段总览：**
- 阶段 1：类型与持久化
- 阶段 2：线程树内存模型 + CRUD
- 阶段 3：ThinkLoop 重写 + Context 构建
- 阶段 4（本文件）：Scheduler 重写 ← 当前
- 阶段 5：协作 API（talk / create_sub_thread_on_node / inbox / Issue）

---

## 文件结构

```
kernel/src/thread/           ← 已有模块（阶段 1-3）
├── types.ts                 ← 阶段 1
├── persistence.ts           ← 阶段 1
├── tree.ts                  ← 阶段 2
├── thinkloop.ts             ← 阶段 3
├── context.ts               ← 阶段 3
├── scheduler.ts             ← 新建（本阶段，~400 行）
└── index.ts                 ← 更新导出

kernel/tests/
└── thread-scheduler.test.ts ← 新建（本阶段，~500 行）
```

---

### Task 1: 测试文件

**Files:**
- Create: `kernel/tests/thread-scheduler.test.ts`

- [ ] **Step 1: 写测试文件（包含所有测试用例）**

Create: `kernel/tests/thread-scheduler.test.ts`

```typescript
/**
 * 线程级 Scheduler 测试
 *
 * 测试事件驱动调度、唤醒机制、错误传播、死锁检测、暂停/恢复。
 * 使用 mock 的 runOneIteration 替代真实 LLM 调用。
 *
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md#6
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md#8
 */
import { describe, test, expect, beforeEach, afterEach, mock } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  ThreadScheduler,
  type ThreadSchedulerConfig,
  type SchedulerCallbacks,
} from "../src/thread/scheduler.js";
import type { ThreadsTree } from "../src/thread/tree.js";
import type { ThreadsTreeNodeMeta, ThreadStatus } from "../src/thread/types.js";

const TEST_DIR = join(import.meta.dir, ".tmp_thread_scheduler_test");

/** 创建一个最小的 ThreadsTreeNodeMeta */
function makeNode(
  id: string,
  status: ThreadStatus,
  opts?: Partial<ThreadsTreeNodeMeta>,
): ThreadsTreeNodeMeta {
  const now = Date.now();
  return {
    id,
    title: `Node ${id}`,
    status,
    childrenIds: [],
    createdAt: now,
    updatedAt: now,
    ...opts,
  };
}

/**
 * 创建 mock ThreadsTree
 *
 * 提供最小的内存树接口，用于测试 Scheduler 的调度逻辑。
 * 接口与阶段 2 的 ThreadsTree 对齐：
 * - nodeIds getter + getNode(id) 替代 allNodes()
 * - setNodeStatus(id, status) 是 async（真实实现走 _mutate 串行化写入）
 */
function createMockTree(nodes: Record<string, ThreadsTreeNodeMeta>, rootId: string) {
  return {
    rootId,
    get nodeIds() { return Object.keys(nodes); },
    getNode(id: string) { return nodes[id] ?? null; },
    async setNodeStatus(id: string, status: ThreadStatus): Promise<void> {
      const node = nodes[id];
      if (node) { node.status = status; node.updatedAt = Date.now(); }
    },
    getChildren(id: string) {
      const node = nodes[id];
      if (!node) return [];
      return node.childrenIds.map(cid => nodes[cid]).filter(Boolean);
    },
  };
}

/** 创建 mock SchedulerCallbacks */
function createMockCallbacks(opts?: {
  iterationFn?: (threadId: string) => Promise<void>;
}) {
  const iterationLog: string[] = [];
  const wakeLog: string[] = [];
  const errorLog: Array<{ threadId: string; message: string }> = [];

  const callbacks: SchedulerCallbacks = {
    /** 执行一轮 ThinkLoop 迭代 */
    runOneIteration: async (threadId: string, objectName: string) => {
      iterationLog.push(threadId);
      if (opts?.iterationFn) await opts.iterationFn(threadId);
    },
    /** 线程完成回调 */
    onThreadFinished: (threadId: string, objectName: string) => {},
    /** 错误通知回调 */
    onThreadError: (threadId: string, objectName: string, error: string) => {
      errorLog.push({ threadId, message: error });
    },
  };

  return { callbacks, iterationLog, wakeLog, errorLog };
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

/* ========== 基础调度 ========== */

describe("基础调度", () => {
  test("单线程 running → 执行迭代 → done 后停止", async () => {
    const nodes = { r: makeNode("r", "running") };
    const tree = createMockTree(nodes, "r");
    let iterCount = 0;

    const { callbacks, iterationLog } = createMockCallbacks({
      iterationFn: async (threadId) => {
        iterCount++;
        if (iterCount >= 3) {
          await tree.setNodeStatus(threadId, "done");
        }
      },
    });

    const scheduler = new ThreadScheduler({
      maxIterationsPerThread: 100,
      maxTotalIterations: 200,
      deadlockGracePeriodMs: 0,
    });

    await scheduler.run("obj_a", tree as any, callbacks);

    expect(iterationLog).toHaveLength(3);
    expect(nodes.r.status).toBe("done");
  });

  test("pending 线程不被调度", async () => {
    const nodes = {
      r: makeNode("r", "done", { childrenIds: ["a"] }),
      a: makeNode("a", "pending", { parentId: "r" }),
    };
    const tree = createMockTree(nodes, "r");
    const { callbacks, iterationLog } = createMockCallbacks();

    const scheduler = new ThreadScheduler({
      maxIterationsPerThread: 100,
      maxTotalIterations: 200,
      deadlockGracePeriodMs: 0,
    });

    await scheduler.run("obj_a", tree as any, callbacks);

    expect(iterationLog).toHaveLength(0);
  });

  test("多个 running 线程并行调度", async () => {
    const iterCounts: Record<string, number> = { a: 0, b: 0 };
    const nodes = {
      r: makeNode("r", "waiting", { childrenIds: ["a", "b"], awaitingChildren: ["a", "b"] }),
      a: makeNode("a", "running", { parentId: "r" }),
      b: makeNode("b", "running", { parentId: "r" }),
    };
    const tree = createMockTree(nodes, "r");

    const { callbacks, iterationLog } = createMockCallbacks({
      iterationFn: async (threadId) => {
        iterCounts[threadId] = (iterCounts[threadId] ?? 0) + 1;
        if (iterCounts[threadId]! >= 2) {
          await tree.setNodeStatus(threadId, "done");
        }
      },
    });

    const scheduler = new ThreadScheduler({
      maxIterationsPerThread: 100,
      maxTotalIterations: 200,
      deadlockGracePeriodMs: 0,
    });

    await scheduler.run("obj_a", tree as any, callbacks);

    /* 两个线程各执行 2 轮 */
    expect(iterationLog.filter(id => id === "a")).toHaveLength(2);
    expect(iterationLog.filter(id => id === "b")).toHaveLength(2);
  });
});

/* ========== 唤醒机制 ========== */

describe("唤醒机制", () => {
  test("子线程 done → 唤醒 waiting 的父线程", async () => {
    let childIter = 0;
    let parentWoken = false;
    const nodes = {
      r: makeNode("r", "waiting", {
        childrenIds: ["a"],
        awaitingChildren: ["a"],
      }),
      a: makeNode("a", "running", { parentId: "r", creatorThreadId: "r" }),
    };
    const tree = createMockTree(nodes, "r");

    const { callbacks, iterationLog } = createMockCallbacks({
      iterationFn: async (threadId) => {
        if (threadId === "a") {
          childIter++;
          if (childIter >= 2) {
            await tree.setNodeStatus("a", "done");
            nodes.a.summary = "子任务完成";
          }
        }
        if (threadId === "r") {
          parentWoken = true;
          await tree.setNodeStatus("r", "done");
        }
      },
    });

    const scheduler = new ThreadScheduler({
      maxIterationsPerThread: 100,
      maxTotalIterations: 200,
      deadlockGracePeriodMs: 0,
    });

    await scheduler.run("obj_a", tree as any, callbacks);

    expect(parentWoken).toBe(true);
    expect(nodes.r.status).toBe("done");
  });

  test("await_all：所有子线程 done 后才唤醒", async () => {
    const iterCounts: Record<string, number> = {};
    let parentWoken = false;
    const nodes = {
      r: makeNode("r", "waiting", {
        childrenIds: ["a", "b"],
        awaitingChildren: ["a", "b"],
      }),
      a: makeNode("a", "running", { parentId: "r", creatorThreadId: "r" }),
      b: makeNode("b", "running", { parentId: "r", creatorThreadId: "r" }),
    };
    const tree = createMockTree(nodes, "r");

    const { callbacks } = createMockCallbacks({
      iterationFn: async (threadId) => {
        iterCounts[threadId] = (iterCounts[threadId] ?? 0) + 1;
        if (threadId === "a" && iterCounts[threadId]! >= 1) {
          await tree.setNodeStatus("a", "done");
        }
        if (threadId === "b" && iterCounts[threadId]! >= 3) {
          await tree.setNodeStatus("b", "done");
        }
        if (threadId === "r") {
          parentWoken = true;
          await tree.setNodeStatus("r", "done");
        }
      },
    });

    const scheduler = new ThreadScheduler({
      maxIterationsPerThread: 100,
      maxTotalIterations: 200,
      deadlockGracePeriodMs: 0,
    });

    await scheduler.run("obj_a", tree as any, callbacks);

    expect(parentWoken).toBe(true);
    /* a 先完成，但 r 不会被唤醒，直到 b 也完成 */
    expect(nodes.a.status).toBe("done");
    expect(nodes.b.status).toBe("done");
    expect(nodes.r.status).toBe("done");
  });

  test("子线程 failed → 也唤醒等待者", async () => {
    let parentWoken = false;
    const nodes = {
      r: makeNode("r", "waiting", {
        childrenIds: ["a"],
        awaitingChildren: ["a"],
      }),
      a: makeNode("a", "running", { parentId: "r", creatorThreadId: "r" }),
    };
    const tree = createMockTree(nodes, "r");

    const { callbacks, errorLog } = createMockCallbacks({
      iterationFn: async (threadId) => {
        if (threadId === "a") {
          await tree.setNodeStatus("a", "failed");
        }
        if (threadId === "r") {
          parentWoken = true;
          await tree.setNodeStatus("r", "done");
        }
      },
    });

    const scheduler = new ThreadScheduler({
      maxIterationsPerThread: 100,
      maxTotalIterations: 200,
      deadlockGracePeriodMs: 0,
    });

    await scheduler.run("obj_a", tree as any, callbacks);

    expect(parentWoken).toBe(true);
  });
});

/* ========== 错误处理 ========== */

describe("错误处理", () => {
  test("单线程超时（迭代上限）→ 标记 failed", async () => {
    const nodes = { r: makeNode("r", "running") };
    const tree = createMockTree(nodes, "r");

    const { callbacks, iterationLog } = createMockCallbacks();

    const scheduler = new ThreadScheduler({
      maxIterationsPerThread: 5,
      maxTotalIterations: 200,
      deadlockGracePeriodMs: 0,
    });

    await scheduler.run("obj_a", tree as any, callbacks);

    expect(iterationLog).toHaveLength(5);
    expect(nodes.r.status).toBe("failed");
  });

  test("全局迭代上限 → 所有 running 线程标记 failed", async () => {
    const nodes = {
      r: makeNode("r", "waiting", { childrenIds: ["a", "b"], awaitingChildren: ["a", "b"] }),
      a: makeNode("a", "running", { parentId: "r" }),
      b: makeNode("b", "running", { parentId: "r" }),
    };
    const tree = createMockTree(nodes, "r");

    const { callbacks } = createMockCallbacks();

    const scheduler = new ThreadScheduler({
      maxIterationsPerThread: 100,
      maxTotalIterations: 6,
      deadlockGracePeriodMs: 0,
    });

    await scheduler.run("obj_a", tree as any, callbacks);

    expect(nodes.a.status).toBe("failed");
    expect(nodes.b.status).toBe("failed");
  });

  test("线程失败 → 通知 creatorThreadId", async () => {
    let notified = false;
    const nodes = {
      r: makeNode("r", "waiting", {
        childrenIds: ["a"],
        awaitingChildren: ["a"],
      }),
      a: makeNode("a", "running", { parentId: "r", creatorThreadId: "r" }),
    };
    const tree = createMockTree(nodes, "r");

    const { callbacks, errorLog } = createMockCallbacks({
      iterationFn: async (threadId) => {
        if (threadId === "a") {
          await tree.setNodeStatus("a", "failed");
        }
        if (threadId === "r") {
          notified = true;
          await tree.setNodeStatus("r", "done");
        }
      },
    });

    const scheduler = new ThreadScheduler({
      maxIterationsPerThread: 100,
      maxTotalIterations: 200,
      deadlockGracePeriodMs: 0,
    });

    await scheduler.run("obj_a", tree as any, callbacks);

    /* 错误回调被调用 */
    expect(errorLog.length).toBeGreaterThanOrEqual(1);
    expect(errorLog.some(e => e.threadId === "r")).toBe(true);
  });

  test("死锁检测：running=0 且 waiting>0 → 唤醒所有 waiting", async () => {
    /**
     * 构造真实死锁场景：
     * r 创建子线程 a 和 b，然后 await_all([a, b])
     * a 完成后，b 进入 waiting 等待一个不存在于本 Object 内的子线程 x
     * 但 x 实际上也在本 Object 内（只是 awaitingChildren 指向了 r，形成环）
     *
     * 简化版：r waiting for a, a waiting for b, b 不存在
     * → running=0, waiting=2, 内部等待（a 的 awaitingChildren 都在本树内）
     */
    let wokenThreads: string[] = [];
    const nodes = {
      r: makeNode("r", "waiting", {
        childrenIds: ["a"],
        awaitingChildren: ["a"],
      }),
      a: makeNode("a", "waiting", {
        parentId: "r",
        childrenIds: ["b"],
        awaitingChildren: ["b"],
      }),
      b: makeNode("b", "waiting", {
        parentId: "a",
        awaitingChildren: ["r"], /* 循环依赖 → 死锁 */
      }),
    };
    const tree = createMockTree(nodes, "r");

    const { callbacks } = createMockCallbacks({
      iterationFn: async (threadId) => {
        wokenThreads.push(threadId);
        /* 被唤醒后直接完成，避免再次死锁 */
        await tree.setNodeStatus(threadId, "done");
      },
    });

    const scheduler = new ThreadScheduler({
      maxIterationsPerThread: 100,
      maxTotalIterations: 200,
      deadlockGracePeriodMs: 0, /* 测试中不等待宽限期 */
    });

    await scheduler.run("obj_a", tree as any, callbacks);

    /* 死锁被检测到，所有 waiting 线程被唤醒 */
    expect(wokenThreads.length).toBeGreaterThanOrEqual(1);
  });

  test("孤儿线程：creatorThreadId 不存在 → 通知后等待自行结束", async () => {
    const nodes = {
      r: makeNode("r", "done"),
      orphan: makeNode("orphan", "running", {
        parentId: "r",
        creatorThreadId: "nonexistent",
        creatorObjectName: "other_obj",
      }),
    };
    const tree = createMockTree(nodes, "r");
    let orphanRan = false;

    const { callbacks } = createMockCallbacks({
      iterationFn: async (threadId) => {
        if (threadId === "orphan") {
          orphanRan = true;
          await tree.setNodeStatus("orphan", "done");
        }
      },
    });

    const scheduler = new ThreadScheduler({
      maxIterationsPerThread: 100,
      maxTotalIterations: 200,
      deadlockGracePeriodMs: 0,
    });

    await scheduler.run("obj_a", tree as any, callbacks);

    /* 孤儿线程仍然被调度执行 */
    expect(orphanRan).toBe(true);
  });
});

/* ========== 暂停/恢复 ========== */

describe("暂停/恢复", () => {
  test("pauseObject → 线程不再被调度", async () => {
    let iterCount = 0;
    const nodes = { r: makeNode("r", "running") };
    const tree = createMockTree(nodes, "r");

    const { callbacks, iterationLog } = createMockCallbacks({
      iterationFn: async () => {
        iterCount++;
      },
    });

    const scheduler = new ThreadScheduler({
      maxIterationsPerThread: 100,
      maxTotalIterations: 200,
      deadlockGracePeriodMs: 0,
    });

    /* 暂停后立即运行 */
    scheduler.pauseObject("obj_a");

    await scheduler.run("obj_a", tree as any, callbacks);

    /* 被暂停，不执行任何迭代 */
    expect(iterationLog).toHaveLength(0);
    /* 状态保持 running（不改为 failed） */
    expect(nodes.r.status).toBe("running");
  });

  test("resumeObject → 恢复调度", async () => {
    let iterCount = 0;
    const nodes = { r: makeNode("r", "running") };
    const tree = createMockTree(nodes, "r");

    const { callbacks } = createMockCallbacks({
      iterationFn: async () => {
        iterCount++;
        if (iterCount >= 2) await tree.setNodeStatus("r", "done");
      },
    });

    const scheduler = new ThreadScheduler({
      maxIterationsPerThread: 100,
      maxTotalIterations: 200,
      deadlockGracePeriodMs: 0,
    });

    scheduler.pauseObject("obj_a");
    scheduler.resumeObject("obj_a");

    await scheduler.run("obj_a", tree as any, callbacks);

    expect(iterCount).toBe(2);
    expect(nodes.r.status).toBe("done");
  });

  test("暂停期间 inbox 消息不丢失", async () => {
    /**
     * 模拟：暂停 obj_a，期间有消息写入 inbox，
     * 恢复后线程能看到消息。
     *
     * 这个测试验证的是 Scheduler 不清理 inbox，
     * 消息持久化由 ThreadsTree 保证（阶段 2）。
     * Scheduler 只需保证暂停时不调度、恢复后继续。
     */
    let iterCount = 0;
    const nodes = { r: makeNode("r", "running") };
    const tree = createMockTree(nodes, "r");

    const { callbacks } = createMockCallbacks({
      iterationFn: async () => {
        iterCount++;
        if (iterCount >= 1) await tree.setNodeStatus("r", "done");
      },
    });

    const scheduler = new ThreadScheduler({
      maxIterationsPerThread: 100,
      maxTotalIterations: 200,
      deadlockGracePeriodMs: 0,
    });

    scheduler.pauseObject("obj_a");
    /* 模拟外部写入 inbox（Scheduler 不感知，由 tree 层处理） */
    scheduler.resumeObject("obj_a");

    await scheduler.run("obj_a", tree as any, callbacks);

    expect(iterCount).toBe(1);
  });
});

/* ========== Session 级别 ========== */

describe("Session 级别", () => {
  test("Session 超时 → 所有线程强制 failed", async () => {
    const nodes = {
      r: makeNode("r", "running", { childrenIds: ["a"] }),
      a: makeNode("a", "running", { parentId: "r" }),
    };
    const tree = createMockTree(nodes, "r");

    const { callbacks } = createMockCallbacks();

    const scheduler = new ThreadScheduler({
      maxIterationsPerThread: 100,
      maxTotalIterations: 4, /* 全局上限 = Session 超时 */
      deadlockGracePeriodMs: 0,
    });

    await scheduler.run("obj_a", tree as any, callbacks);

    expect(nodes.r.status).toBe("failed");
    expect(nodes.a.status).toBe("failed");
  });

  test("所有线程 done → run() 正常返回", async () => {
    const nodes = { r: makeNode("r", "running") };
    const tree = createMockTree(nodes, "r");

    const { callbacks } = createMockCallbacks({
      iterationFn: async () => {
        await tree.setNodeStatus("r", "done");
      },
    });

    const scheduler = new ThreadScheduler({
      maxIterationsPerThread: 100,
      maxTotalIterations: 200,
      deadlockGracePeriodMs: 0,
    });

    await scheduler.run("obj_a", tree as any, callbacks);

    expect(nodes.r.status).toBe("done");
  });
});

/* ========== 动态线程创建 ========== */

describe("动态线程创建", () => {
  test("onThreadCreated → 新线程被纳入调度", async () => {
    let rootIter = 0;
    let childCreated = false;
    const nodes: Record<string, ThreadsTreeNodeMeta> = {
      r: makeNode("r", "running"),
    };
    const tree = createMockTree(nodes, "r");

    const { callbacks, iterationLog } = createMockCallbacks({
      iterationFn: async (threadId) => {
        if (threadId === "r") {
          rootIter++;
          if (rootIter === 1 && !childCreated) {
            /* 第一轮：创建子线程 */
            nodes["child"] = makeNode("child", "running", { parentId: "r", creatorThreadId: "r" });
            nodes.r.childrenIds.push("child");
            nodes.r.awaitingChildren = ["child"];
            await tree.setNodeStatus("r", "waiting");
            childCreated = true;
            /* 通知 Scheduler 有新线程 */
            scheduler.onThreadCreated("child", "obj_a");
          } else {
            /* 被唤醒后完成 */
            await tree.setNodeStatus("r", "done");
          }
        }
        if (threadId === "child") {
          await tree.setNodeStatus("child", "done");
          nodes.child!.summary = "子任务完成";
        }
      },
    });

    const scheduler = new ThreadScheduler({
      maxIterationsPerThread: 100,
      maxTotalIterations: 200,
      deadlockGracePeriodMs: 0,
    });

    await scheduler.run("obj_a", tree as any, callbacks);

    expect(iterationLog).toContain("child");
    expect(nodes.r.status).toBe("done");
    expect(nodes.child!.status).toBe("done");
  });
});

/* ========== 异常处理 ========== */

describe("异常处理", () => {
  test("runOneIteration 抛异常 → 线程标记 failed + 错误传播", async () => {
    const nodes = {
      r: makeNode("r", "waiting", {
        childrenIds: ["a"],
        awaitingChildren: ["a"],
      }),
      a: makeNode("a", "running", { parentId: "r", creatorThreadId: "r" }),
    };
    const tree = createMockTree(nodes, "r");
    let parentWoken = false;

    const { callbacks, errorLog } = createMockCallbacks({
      iterationFn: async (threadId) => {
        if (threadId === "a") {
          throw new Error("LLM 调用失败: rate limit exceeded");
        }
        if (threadId === "r") {
          parentWoken = true;
          await tree.setNodeStatus("r", "done");
        }
      },
    });

    const scheduler = new ThreadScheduler({
      maxIterationsPerThread: 100,
      maxTotalIterations: 200,
      deadlockGracePeriodMs: 0,
    });

    await scheduler.run("obj_a", tree as any, callbacks);

    /* 线程 a 被标记为 failed */
    expect(nodes.a.status).toBe("failed");
    /* 错误被传播到创建者 r */
    expect(errorLog.some(e => e.threadId === "r")).toBe(true);
    expect(errorLog.some(e => e.message.includes("LLM 调用失败"))).toBe(true);
    /* 父线程被唤醒（failed 也算完成） */
    expect(parentWoken).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-scheduler.test.ts`
Expected: FAIL（模块不存在）

---

### Task 2: Scheduler 实现

**Files:**
- Create: `kernel/src/thread/scheduler.ts`

- [ ] **Step 1: 实现 ThreadScheduler**

Create: `kernel/src/thread/scheduler.ts`

```typescript
/**
 * ThreadScheduler — 事件驱动的线程级调度器
 *
 * 核心设计：
 * - 每个线程是独立的 async loop（不用 Promise.all 同步）
 * - 扁平调度：不关心线程父子关系或所属 Object，只看 status
 * - 事件驱动：被动响应线程状态变化（done/failed → 唤醒等待者）
 * - 全局安全阀：总迭代上限 + 单线程迭代上限 + 死锁检测
 *
 * 与旧 Scheduler 的区别：
 * - 旧：轮询所有 Flow，每轮调度一个 Flow 的一次 ThinkLoop
 * - 新：每个线程独立循环，快线程不等慢线程
 * - 旧：以 Flow（Object）为调度单位
 * - 新：以线程（ProcessNode）为调度单位
 *
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md#6
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md#8
 */

import { consola } from "consola";
import type { ThreadsTreeNodeMeta, ThreadStatus } from "./types.js";

/* ========== 类型定义 ========== */

/** Scheduler 配置 */
export interface ThreadSchedulerConfig {
  /** 单个线程最大迭代次数 */
  maxIterationsPerThread: number;
  /** 全局最大迭代次数（所有线程合计，等价于 Session 超时） */
  maxTotalIterations: number;
  /** 死锁检测宽限期（毫秒），默认 30000 */
  deadlockGracePeriodMs: number;
}

/** 默认配置 */
const DEFAULT_CONFIG: ThreadSchedulerConfig = {
  maxIterationsPerThread: 100,
  maxTotalIterations: 500,
  deadlockGracePeriodMs: 30_000,
};

/**
 * Scheduler 回调接口
 *
 * Scheduler 本身不依赖 ThinkLoop / LLM / Flow，
 * 通过回调接口与外部解耦。调用方（World）负责注入具体实现。
 */
export interface SchedulerCallbacks {
  /**
   * 执行一轮 ThinkLoop 迭代
   * @param threadId - 线程 ID（ProcessNode.id）
   * @param objectName - 所属 Object 名称
   */
  runOneIteration: (threadId: string, objectName: string) => Promise<void>;

  /**
   * 线程完成回调（done 或 failed）
   * @param threadId - 线程 ID
   * @param objectName - 所属 Object 名称
   */
  onThreadFinished: (threadId: string, objectName: string) => void;

  /**
   * 错误通知回调（向 creatorThreadId 投递错误消息）
   * @param threadId - 接收错误通知的线程 ID
   * @param objectName - 所属 Object 名称
   * @param error - 错误描述
   */
  onThreadError: (threadId: string, objectName: string, error: string) => void;
}

/**
 * 线程运行时跟踪信息（Scheduler 内部使用）
 */
interface ThreadTracker {
  /** 线程 ID */
  threadId: string;
  /** 所属 Object 名称 */
  objectName: string;
  /** 累计迭代次数 */
  iterations: number;
  /** 当前 async loop 的 Promise（null = 未启动或已结束） */
  loopPromise: Promise<void> | null;
  /** 是否已投递过错误通知（防止重复） */
  errorPropagated: boolean;
}

/* ========== ThreadScheduler ========== */

export class ThreadScheduler {
  /** 配置 */
  private readonly _config: ThreadSchedulerConfig;
  /** 暂停的 Object 集合 */
  private readonly _pausedObjects = new Set<string>();
  /** 全局迭代计数 */
  private _totalIterations = 0;
  /** 线程跟踪表：threadId → ThreadTracker */
  private _trackers = new Map<string, ThreadTracker>();
  /** 活跃的 loop Promise 集合（用于 waitAll） */
  private _activeLoops = new Map<string, Promise<void>>();
  /** 内存树引用（run 时注入） */
  private _tree: { getNode: (id: string) => ThreadsTreeNodeMeta | null; readonly nodeIds: string[]; setNodeStatus: (id: string, status: ThreadStatus) => Promise<void> } | null = null;
  /** 回调引用（run 时注入） */
  private _callbacks: SchedulerCallbacks | null = null;
  /** 当前 Object 名称 */
  private _objectName: string = "";
  /** _forceFailAllRunning 是否已执行（I5: 防止多线程同时调用） */
  private _forceFailExecuted = false;
  /** 活跃 loop 计数器 + resolve 回调（I1: 替代 Promise.all） */
  private _activeCount = 0;
  private _allDoneResolve: (() => void) | null = null;

  constructor(config: Partial<ThreadSchedulerConfig> = {}) {
    this._config = { ...DEFAULT_CONFIG, ...config };
  }

  /* ========== 公开 API ========== */

  /**
   * 运行调度循环
   *
   * 扫描线程树中所有 running 线程，为每个启动独立 async loop。
   * 等待所有 loop 结束后返回。
   *
   * @param objectName - Object 名称
   * @param tree - 线程树内存模型（阶段 2 的 ThreadsTree）
   * @param callbacks - 回调接口
   */
  async run(
    objectName: string,
    tree: { getNode: (id: string) => ThreadsTreeNodeMeta | null; readonly nodeIds: string[]; setNodeStatus: (id: string, status: ThreadStatus) => Promise<void> },
    callbacks: SchedulerCallbacks,
  ): Promise<void> {
    this._tree = tree;
    this._callbacks = callbacks;
    this._objectName = objectName;
    this._totalIterations = 0;
    this._trackers.clear();
    this._activeLoops.clear();
    this._forceFailExecuted = false;
    this._activeCount = 0;
    this._allDoneResolve = null;

    consola.info(`[ThreadScheduler] 开始调度 ${objectName}`);

    /* 如果 Object 被暂停，直接返回 */
    if (this._pausedObjects.has(objectName)) {
      consola.info(`[ThreadScheduler] ${objectName} 已暂停，跳过调度`);
      return;
    }

    /* 扫描所有 running 线程，启动 loop */
    for (const nodeId of tree.nodeIds) {
      const node = tree.getNode(nodeId);
      if (node && node.status === "running") {
        this._startThread(node.id, objectName);
      }
    }

    /* 等待所有 loop 结束 */
    await this._waitAll();

    /* 死锁检测（I2: 只运行一次，已知限制，后续迭代改进） */
    await this._checkDeadlock(objectName);

    consola.info(`[ThreadScheduler] 调度结束 ${objectName}，共 ${this._totalIterations} 轮`);
  }

  /**
   * 新线程注册（运行时动态创建的线程）
   *
   * 由 ThinkLoop 中的 create_sub_thread 调用。
   * 如果 Scheduler 正在运行，立即启动新线程的 loop。
   */
  onThreadCreated(threadId: string, objectName: string): void {
    if (!this._tree || !this._callbacks) return;
    const node = this._tree.getNode(threadId);
    if (!node || node.status !== "running") return;
    this._startThread(threadId, objectName);
  }

  /** 暂停 Object 的所有线程（当前迭代完成后生效） */
  pauseObject(objectName: string): void {
    this._pausedObjects.add(objectName);
    consola.info(`[ThreadScheduler] 暂停 ${objectName}`);
  }

  /** 恢复 Object 的所有线程 */
  resumeObject(objectName: string): void {
    this._pausedObjects.delete(objectName);
    consola.info(`[ThreadScheduler] 恢复 ${objectName}`);
  }

  /* ========== 内部方法 ========== */

  /**
   * 启动单个线程的独立循环
   */
  private _startThread(threadId: string, objectName: string): void {
    if (this._trackers.has(threadId)) return; /* 防止重复启动 */

    const tracker: ThreadTracker = {
      threadId,
      objectName,
      iterations: 0,
      loopPromise: null,
      errorPropagated: false,
    };
    this._trackers.set(threadId, tracker);

    this._activeCount++;
    const loop = this._runThreadLoop(tracker).finally(() => {
      this._activeCount--;
      this._activeLoops.delete(threadId);
      /* 当所有 loop 结束时，通知 _waitAll */
      if (this._activeCount === 0 && this._allDoneResolve) {
        this._allDoneResolve();
        this._allDoneResolve = null;
      }
    });
    tracker.loopPromise = loop;
    this._activeLoops.set(threadId, loop);
  }

  /**
   * 单个线程的独立循环
   *
   * while (status === "running") { runOneIteration }
   * 循环退出条件：
   * - status 变为 waiting/done/failed
   * - 单线程迭代上限
   * - 全局迭代上限
   * - Object 被暂停
   */
  private async _runThreadLoop(tracker: ThreadTracker): Promise<void> {
    const { threadId, objectName } = tracker;
    const tree = this._tree!;
    const callbacks = this._callbacks!;

    consola.info(`[ThreadScheduler] 启动线程循环 ${threadId} (${objectName})`);

    while (true) {
      const node = tree.getNode(threadId);
      if (!node || node.status !== "running") break;

      /* 检查暂停 */
      if (this._pausedObjects.has(objectName)) {
        consola.info(`[ThreadScheduler] ${threadId} 暂停中，退出循环`);
        break;
      }

      /* 检查单线程迭代上限 */
      if (tracker.iterations >= this._config.maxIterationsPerThread) {
        consola.warn(`[ThreadScheduler] ${threadId} 达到单线程迭代上限 ${this._config.maxIterationsPerThread}，标记 failed`);
        await tree.setNodeStatus(threadId, "failed");
        /* I4: 错误传播统一由 _onThreadFinished 处理 */
        await this._onThreadFinished(threadId, objectName);
        break;
      }

      /* 检查全局迭代上限 */
      if (this._totalIterations >= this._config.maxTotalIterations) {
        consola.warn(`[ThreadScheduler] 全局迭代上限，${threadId} 标记 failed`);
        await tree.setNodeStatus(threadId, "failed");
        /* I5: 全局超时强制失败，只执行一次 */
        await this._forceFailAllRunning();
        break;
      }

      /* 执行一轮迭代 */
      try {
        await callbacks.runOneIteration(threadId, objectName);
      } catch (e) {
        consola.error(`[ThreadScheduler] ${threadId} 迭代异常:`, (e as Error).message);
        await tree.setNodeStatus(threadId, "failed");
        /* I4: 错误传播统一由 _onThreadFinished 处理 */
        await this._onThreadFinished(threadId, objectName);
        break;
      }

      tracker.iterations++;
      this._totalIterations++;

      /* 迭代后检查状态变化 */
      const updatedNode = tree.getNode(threadId);
      if (!updatedNode || updatedNode.status !== "running") {
        /* 状态已变（waiting/done/failed），退出循环 */
        if (updatedNode && (updatedNode.status === "done" || updatedNode.status === "failed")) {
          await this._onThreadFinished(threadId, objectName);
        }
        break;
      }
    }
  }

  /**
   * 线程结束回调
   *
   * 1. 通知 creatorThreadId（失败时投递错误消息）
   * 2. 检查 awaitingChildren → 唤醒等待者
   * 3. 调用外部 onThreadFinished 回调
   *
   * I4: 错误传播统一在此处理，_runThreadLoop 中不再显式调用 _propagateError。
   */
  private async _onThreadFinished(threadId: string, objectName: string): Promise<void> {
    const tree = this._tree!;
    const callbacks = this._callbacks!;
    const node = tree.getNode(threadId);
    if (!node) return;

    consola.info(`[ThreadScheduler] 线程结束 ${threadId} (${node.status})`);

    /* 失败时通知创建者 */
    if (node.status === "failed") {
      this._propagateError(threadId, `线程 ${threadId} 执行失败`);
    }

    /* 调用外部回调 */
    callbacks.onThreadFinished(threadId, objectName);

    /* 检查是否有等待者需要唤醒 */
    await this._checkAndWakeWaiters(threadId);
  }

  /**
   * 检查并唤醒等待者
   *
   * 遍历所有 waiting 线程，检查其 awaitingChildren 是否全部 done/failed。
   * 如果是，将等待者状态改为 running 并启动新的 loop。
   */
  private async _checkAndWakeWaiters(finishedThreadId: string): Promise<void> {
    const tree = this._tree!;

    for (const nodeId of tree.nodeIds) {
      const node = tree.getNode(nodeId);
      if (!node || node.status !== "waiting") continue;
      if (!node.awaitingChildren || node.awaitingChildren.length === 0) continue;

      /* 检查 awaitingChildren 是否全部完成 */
      const allDone = node.awaitingChildren.every((childId) => {
        const child = tree.getNode(childId);
        return child && (child.status === "done" || child.status === "failed");
      });

      if (allDone) {
        await this._wakeThread(node.id, this._objectName);
      }
    }
  }

  /**
   * 唤醒等待中的线程
   *
   * 将 status 改为 running，启动新的 async loop。
   *
   * I3 设计决策：迭代计数累积
   * prevIterations 保留了线程被唤醒前的迭代次数，唤醒后继续累加。
   * 这意味着一个线程的总迭代次数 = 所有 running 阶段的迭代之和。
   * 这是有意为之：防止线程通过反复 waiting/running 绕过单线程迭代上限。
   */
  private async _wakeThread(threadId: string, objectName: string): Promise<void> {
    const tree = this._tree!;
    const node = tree.getNode(threadId);
    if (!node || node.status !== "waiting") return;

    consola.info(`[ThreadScheduler] 唤醒线程 ${threadId}`);
    await tree.setNodeStatus(threadId, "running");

    /* 清除旧 tracker，创建新的（保留累计迭代次数） */
    const oldTracker = this._trackers.get(threadId);
    const prevIterations = oldTracker?.iterations ?? 0;

    this._trackers.delete(threadId);

    const tracker: ThreadTracker = {
      threadId,
      objectName,
      iterations: prevIterations,
      loopPromise: null,
      errorPropagated: false,
    };
    this._trackers.set(threadId, tracker);

    this._activeCount++;
    const loop = this._runThreadLoop(tracker).finally(() => {
      this._activeCount--;
      this._activeLoops.delete(threadId);
      if (this._activeCount === 0 && this._allDoneResolve) {
        this._allDoneResolve();
        this._allDoneResolve = null;
      }
    });
    tracker.loopPromise = loop;
    this._activeLoops.set(threadId, loop);
  }

  /**
   * 向 creatorThreadId 投递错误消息
   */
  private _propagateError(failedThreadId: string, errorMessage: string): void {
    const tree = this._tree!;
    const callbacks = this._callbacks!;
    const tracker = this._trackers.get(failedThreadId);
    if (tracker?.errorPropagated) return;

    const node = tree.getNode(failedThreadId);
    if (!node?.creatorThreadId) return;

    const creatorNode = tree.getNode(node.creatorThreadId);
    if (!creatorNode) {
      /* 孤儿线程：创建者不存在（可能在另一个 Object） */
      if (node.creatorObjectName) {
        consola.info(`[ThreadScheduler] 跨 Object 错误传播: ${failedThreadId} → ${node.creatorObjectName}:${node.creatorThreadId}`);
        callbacks.onThreadError(node.creatorThreadId, node.creatorObjectName, errorMessage);
      }
    } else {
      consola.info(`[ThreadScheduler] 错误传播: ${failedThreadId} → ${node.creatorThreadId}`);
      callbacks.onThreadError(node.creatorThreadId, this._objectName, errorMessage);
    }

    if (tracker) tracker.errorPropagated = true;
  }

  /**
   * 死锁检测
   *
   * 条件：running=0 且 waiting>0
   * 处理：宽限期后唤醒所有 waiting 线程
   *
   * I2 已知限制：死锁检测只在 run() 的初始 loop 全部结束后运行一次。
   * 如果唤醒后的线程再次形成死锁，不会被二次检测。
   * 后续迭代可改为周期性检测或在 _waitAll 返回时自动触发。
   */
  private async _checkDeadlock(objectName: string): Promise<void> {
    const tree = this._tree!;

    /** 辅助：收集指定状态的节点 */
    const collectByStatus = (status: ThreadStatus): ThreadsTreeNodeMeta[] => {
      const result: ThreadsTreeNodeMeta[] = [];
      for (const nodeId of tree.nodeIds) {
        const node = tree.getNode(nodeId);
        if (node && node.status === status) result.push(node);
      }
      return result;
    };

    const runningNodes = collectByStatus("running");
    const waitingNodes = collectByStatus("waiting");

    if (runningNodes.length > 0 || waitingNodes.length === 0) return;

    /* 区分内部等待和跨 Object 等待 */
    const internalWaiting = waitingNodes.filter(n => {
      if (!n.awaitingChildren || n.awaitingChildren.length === 0) return false;
      /* 所有等待的子线程都在本 Object 内 */
      return n.awaitingChildren.every(childId => tree.getNode(childId) !== null);
    });

    if (internalWaiting.length === 0) {
      /* 全部是跨 Object 等待，不算死锁 */
      consola.info(`[ThreadScheduler] ${objectName} 所有线程等待跨 Object 响应，非死锁`);
      return;
    }

    consola.warn(`[ThreadScheduler] 检测到潜在死锁: running=0, waiting=${waitingNodes.length}`);

    /* 宽限期 */
    if (this._config.deadlockGracePeriodMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this._config.deadlockGracePeriodMs));

      /* 宽限期后重新检查 */
      const recheckRunning = collectByStatus("running");
      const recheckWaiting = collectByStatus("waiting");
      if (recheckRunning.length > 0 || recheckWaiting.length === 0) return;
    }

    /* 确认死锁，唤醒所有 waiting 线程 */
    consola.warn(`[ThreadScheduler] 确认死锁，唤醒所有 waiting 线程`);
    for (const node of waitingNodes) {
      await this._wakeThread(node.id, objectName);
    }

    /* 等待唤醒后的 loop 结束 */
    await this._waitAll();
  }

  /**
   * 强制将所有 running 线程标记为 failed（全局超时时调用）
   *
   * I5: 使用 _forceFailExecuted flag 确保只执行一次，
   * 防止多个线程同时触发全局上限时重复调用。
   */
  private async _forceFailAllRunning(): Promise<void> {
    if (this._forceFailExecuted) return;
    this._forceFailExecuted = true;

    const tree = this._tree!;
    for (const nodeId of tree.nodeIds) {
      const node = tree.getNode(nodeId);
      if (node && node.status === "running") {
        await tree.setNodeStatus(node.id, "failed");
      }
    }
  }

  /**
   * 等待所有活跃的 loop 结束
   *
   * I1: 使用计数器方案替代 Promise.all。
   * _startThread 时 increment，loop finally 时 decrement。
   * 当计数器归零时 resolve。
   * 这样即使 loop 中动态启动新 loop（如 _wakeThread），也能正确等待。
   */
  private async _waitAll(): Promise<void> {
    if (this._activeCount === 0) return;
    return new Promise<void>((resolve) => {
      this._allDoneResolve = resolve;
    });
  }
}
```

- [ ] **Step 2: 运行测试确认通过**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/thread-scheduler.test.ts`
Expected: 全部 PASS

- [ ] **Step 3: 运行全量测试确认无回归**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test`
Expected: 全部 PASS（新模块不影响现有代码）

- [ ] **Step 4: Commit**

```bash
git add kernel/src/thread/scheduler.ts kernel/tests/thread-scheduler.test.ts
git commit -m "feat: 事件驱动 ThreadScheduler（独立线程循环 + 唤醒 + 错误传播 + 死锁检测 + 暂停/恢复）"
```

---

### Task 3: 更新模块导出

**Files:**
- Edit: `kernel/src/thread/index.ts`

- [ ] **Step 1: 在 index.ts 中添加 scheduler 导出**

在 `kernel/src/thread/index.ts` 末尾追加：

```typescript
export { ThreadScheduler, type ThreadSchedulerConfig, type SchedulerCallbacks } from "./scheduler.js";
```

- [ ] **Step 2: 确认类型检查通过**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bunx tsc --noEmit src/thread/index.ts`
Expected: 无错误输出

- [ ] **Step 3: Commit**

```bash
git add kernel/src/thread/index.ts
git commit -m "chore: 导出 ThreadScheduler 模块"
```

---

### Task 4: World 集成适配（预备）

> 注意：完整的 World 集成在阶段 5 完成。本 Task 仅编写适配层的接口定义和桩实现，确保 ThreadScheduler 可以被 World 调用。

**Files:**
- Create: `kernel/src/thread/world-adapter.ts`

- [ ] **Step 1: 写适配层**

Create: `kernel/src/thread/world-adapter.ts`

```typescript
/**
 * World ↔ ThreadScheduler 适配层
 *
 * 将 World 的现有接口（LLMClient, Flow, Stone, Traits）
 * 桥接到 ThreadScheduler 的 SchedulerCallbacks 接口。
 *
 * 阶段 4 仅定义接口和桩实现。
 * 阶段 5 完成完整集成后，替换旧 Scheduler 的调用点。
 *
 * @ref docs/superpowers/specs/2026-04-06-thread-tree-architecture-design.md#6
 */

import { consola } from "consola";
import type { SchedulerCallbacks } from "./scheduler.js";
import type { ThreadsTreeNodeMeta } from "./types.js";

/**
 * 适配层依赖接口
 *
 * 由 World 在创建适配层时注入。
 * 使用接口而非直接依赖 World，避免循环引用。
 */
export interface WorldBridge {
  /** 执行一轮 ThinkLoop 迭代（阶段 3 的新 ThinkLoop） */
  runOneIteration: (threadId: string, objectName: string) => Promise<void>;
  /** 向线程 inbox 投递错误消息 */
  deliverErrorToInbox: (threadId: string, objectName: string, error: string) => void;
  /** 发射 SSE 进度事件 */
  emitProgress: (objectName: string, threadId: string, iterations: number) => void;
}

/**
 * 创建 SchedulerCallbacks
 *
 * 将 WorldBridge 适配为 ThreadScheduler 所需的回调接口。
 */
export function createSchedulerCallbacks(bridge: WorldBridge): SchedulerCallbacks {
  return {
    runOneIteration: async (threadId: string, objectName: string) => {
      await bridge.runOneIteration(threadId, objectName);
      bridge.emitProgress(objectName, threadId, 1);
    },

    onThreadFinished: (threadId: string, objectName: string) => {
      consola.info(`[WorldAdapter] 线程结束 ${threadId} (${objectName})`);
    },

    onThreadError: (threadId: string, objectName: string, error: string) => {
      bridge.deliverErrorToInbox(threadId, objectName, error);
    },
  };
}
```

- [ ] **Step 2: 确认类型检查通过**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bunx tsc --noEmit src/thread/world-adapter.ts`
Expected: 无错误输出

- [ ] **Step 3: 更新 index.ts 导出**

在 `kernel/src/thread/index.ts` 追加：

```typescript
export { createSchedulerCallbacks, type WorldBridge } from "./world-adapter.js";
```

- [ ] **Step 4: Commit**

```bash
git add kernel/src/thread/world-adapter.ts kernel/src/thread/index.ts
git commit -m "feat: World ↔ ThreadScheduler 适配层（接口定义 + 桩实现）"
```

---

## 阶段 4 完成标准

- [ ] `kernel/src/thread/scheduler.ts` — ThreadScheduler 完整实现
  - [ ] 每个线程独立 async loop（`_runThreadLoop`）
  - [ ] `startThread` / `onThreadCreated` — 启动和动态注册
  - [ ] `_checkAndWakeWaiters` — 子线程 done/failed 时唤醒等待者
  - [ ] `_propagateError` — 失败通知路由（同 Object + 跨 Object）
  - [ ] 单线程超时（`maxIterationsPerThread`）
  - [ ] Session 超时（`maxTotalIterations`）
  - [ ] `_checkDeadlock` — 死锁检测（含宽限期 + 内部/跨 Object 区分）
  - [ ] `_forceFailAllRunning` — 全局超时强制失败
  - [ ] `pauseObject` / `resumeObject` — 暂停/恢复
- [ ] `kernel/src/thread/world-adapter.ts` — WorldBridge 接口 + createSchedulerCallbacks
- [ ] `kernel/tests/thread-scheduler.test.ts` — 全部测试通过
  - [ ] 基础调度（单线程、pending 不调度、多线程并行）
  - [ ] 唤醒机制（子线程 done 唤醒、await_all、failed 也唤醒）
  - [ ] 错误处理（单线程超时、全局超时、失败通知、死锁检测、孤儿线程）
  - [ ] 异常处理（runOneIteration 抛异常 → failed + 错误传播 + 唤醒等待者）
  - [ ] 暂停/恢复（暂停不调度、恢复后继续、inbox 不丢失）
  - [ ] Session 级别（全局超时、正常结束）
  - [ ] 动态线程创建（onThreadCreated）
- [ ] `kernel/src/thread/index.ts` — 导出更新
- [ ] `bun test` 全量测试无回归
