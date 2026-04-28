# Session Status And Protocol Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the `s_moic3fom_b79ppk` regression class: completed or waiting work must not look like running, protocol guidance must prefer direct trait method calls, and frontend indicators must reflect backend state without guessing.

**Architecture:** Treat thread state as authoritative and preserve its semantics through Flow summary APIs and UI. Keep `waiting` distinct from `running`; use `threads.json` to build live process/status views; remove stale protocol examples that pull the LLM back to pseudo calls or `callMethod(...)` inside program code.

**Tech Stack:** Bun test runner, TypeScript, OOC thread-tree backend, Vite/React frontend.

---

## Files

- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/src/observable/server/sessions.ts`
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/src/observable/server/server.ts`
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/src/storable/thread/thread-adapter.ts`
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/src/shared/types/process.ts`
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/src/storable/session/flow-data.ts`
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/src/executable/commands/talk.ts`
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/src/thinkable/context/compact.ts`
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/traits/base/TRAIT.md`
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/traits/compact/TRAIT.md`
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/traits/reflective/TRAIT.md`
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/traits/reflective/memory_api/TRAIT.md`
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/traits/computable/TRAIT.md`
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/web/src/api/types.ts`
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/web/src/features/MessageSidebar.tsx`
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/web/src/features/MessageSidebarThreadsList.tsx`
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/web/src/features/SessionKanban.tsx`
- Test: `/Users/bytedance/x/ooc/ooc-0/kernel/tests/server-live-status.test.ts`
- Test: `/Users/bytedance/x/ooc/ooc-0/kernel/tests/server-flow-detail-status.test.ts`
- Test: `/Users/bytedance/x/ooc/ooc-0/kernel/tests/thread-adapter-status.test.ts`
- Test: `/Users/bytedance/x/ooc/ooc-0/kernel/tests/talk-command-lifecycle.test.ts`

---

### Task 1: Preserve `waiting` In Live Status Inference

**Files:**
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/src/observable/server/sessions.ts`
- Test: `/Users/bytedance/x/ooc/ooc-0/kernel/tests/server-live-status.test.ts`

- [ ] **Step 1: Write failing tests for live object/session status**

Add or extend `/Users/bytedance/x/ooc/ooc-0/kernel/tests/server-live-status.test.ts`:

```ts
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { inferLiveFlowStatus, inferSessionLiveStatus } from "../src/observable/server/sessions.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ooc-live-status-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeThreads(objectDir: string, statuses: Array<"running" | "waiting" | "done" | "failed" | "paused" | "pending">) {
  mkdirSync(objectDir, { recursive: true });
  const nodes: Record<string, any> = {};
  statuses.forEach((status, index) => {
    nodes[`n${index}`] = {
      id: `n${index}`,
      title: `node ${index}`,
      status,
      childrenIds: [],
      createdAt: 1,
      updatedAt: 1,
      ...(status === "waiting" ? { waitingType: "explicit_wait" } : {}),
    };
  });
  writeFileSync(join(objectDir, "threads.json"), JSON.stringify({ rootId: "n0", nodes }, null, 2));
}

describe("live flow status inference", () => {
  test("returns waiting when threads contain only waiting nodes", () => {
    const objectDir = join(dir, "objects", "bruce");
    writeThreads(objectDir, ["waiting"]);

    expect(inferLiveFlowStatus(objectDir, "finished")).toBe("waiting");
  });

  test("running wins over waiting", () => {
    const objectDir = join(dir, "objects", "bruce");
    writeThreads(objectDir, ["waiting", "running"]);

    expect(inferLiveFlowStatus(objectDir, "waiting")).toBe("running");
  });

  test("falls back when no running or waiting nodes exist", () => {
    const objectDir = join(dir, "objects", "kernel");
    writeThreads(objectDir, ["failed"]);

    expect(inferLiveFlowStatus(objectDir, "failed")).toBe("failed");
  });

  test("session with waiting and finished objects is waiting", () => {
    const sessionDir = dir;
    writeThreads(join(sessionDir, "objects", "bruce"), ["waiting"]);
    mkdirSync(join(sessionDir, "objects", "iris"), { recursive: true });
    writeFileSync(join(sessionDir, "objects", "iris", "data.json"), JSON.stringify({
      sessionId: "s",
      stoneName: "iris",
      status: "finished",
      messages: [],
      process: { root: { id: "root", title: "task", status: "done", children: [] }, focusId: "root" },
      data: {},
      createdAt: 1,
      updatedAt: 1,
    }, null, 2));

    expect(inferSessionLiveStatus(sessionDir, "finished")).toBe("waiting");
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
cd /Users/bytedance/x/ooc/ooc-0/kernel
bun test tests/server-live-status.test.ts
```

Expected before implementation: the `only waiting nodes` and session waiting tests fail because `waiting` is inferred as `running`.

- [ ] **Step 3: Implement minimal status inference fix**

Change `/Users/bytedance/x/ooc/ooc-0/kernel/src/observable/server/sessions.ts`:

```ts
export function inferLiveFlowStatus(objectFlowDir: string, dataStatus: FlowStatus): FlowStatus {
  const treePath = join(objectFlowDir, "threads.json");
  if (!existsSync(treePath)) return dataStatus;
  try {
    const tree = JSON.parse(readFileSync(treePath, "utf-8")) as {
      rootId?: string;
      nodes?: Record<string, { status?: string }>;
    };
    if (!tree.nodes) return dataStatus;

    let sawWaiting = false;
    for (const node of Object.values(tree.nodes)) {
      if (node.status === "running") return "running";
      if (node.status === "waiting") sawWaiting = true;
    }
    if (sawWaiting) return "waiting";
    return dataStatus;
  } catch {
    return dataStatus;
  }
}
```

- [ ] **Step 4: Verify**

Run:

```bash
cd /Users/bytedance/x/ooc/ooc-0/kernel
bun test tests/server-live-status.test.ts
bun run typecheck
```

Expected: tests pass and typecheck exits 0.

- [ ] **Step 5: Commit**

```bash
cd /Users/bytedance/x/ooc/ooc-0/kernel
git add src/observable/server/sessions.ts tests/server-live-status.test.ts
git commit -m "fix: preserve waiting live flow status"
```

---

### Task 2: Use One Session Status Aggregator In `/api/flows/:sessionId`

**Files:**
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/src/observable/server/server.ts`
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/src/observable/server/sessions.ts`
- Test: `/Users/bytedance/x/ooc/ooc-0/kernel/tests/server-flow-detail-status.test.ts`

- [ ] **Step 1: Write failing route-level tests**

Create `/Users/bytedance/x/ooc/ooc-0/kernel/tests/server-flow-detail-status.test.ts`:

```ts
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { handleRoute } from "../src/observable/server/server.js";

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "ooc-flow-detail-"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

function makeWorld() {
  return {
    rootDir: root,
    flowsDir: join(root, "flows"),
    objectsDir: join(root, "stones"),
  } as any;
}

function writeFlow(objectName: string, status: string, threadStatus: string) {
  const dir = join(root, "flows", "s_test", "objects", objectName);
  mkdirSync(join(dir, "threads", "root"), { recursive: true });
  writeFileSync(join(dir, "data.json"), JSON.stringify({
    sessionId: "s_test",
    stoneName: objectName,
    status,
    messages: [],
    process: { root: { id: "root", title: "task", status: "done", children: [] }, focusId: "root" },
    data: {},
    createdAt: 1,
    updatedAt: 1,
  }, null, 2));
  writeFileSync(join(dir, "threads.json"), JSON.stringify({
    rootId: "root",
    nodes: {
      root: {
        id: "root",
        title: `${objectName} root`,
        status: threadStatus,
        waitingType: threadStatus === "waiting" ? "explicit_wait" : undefined,
        childrenIds: [],
        createdAt: 1,
        updatedAt: 1,
      },
    },
  }, null, 2));
  writeFileSync(join(dir, "threads", "root", "thread.json"), JSON.stringify({ id: "root", events: [] }, null, 2));
}

describe("GET /api/flows/:sessionId status aggregation", () => {
  test("all waiting subflows produce top-level waiting", async () => {
    writeFlow("bruce", "waiting", "waiting");
    writeFlow("iris", "waiting", "waiting");

    const res = await handleRoute("GET", "/api/flows/s_test", new Request("http://localhost/api/flows/s_test"), makeWorld());
    const body = await res.json() as any;

    expect(body.success).toBe(true);
    expect(body.data.flow.status).toBe("waiting");
    expect(body.data.subFlows.map((sf: any) => sf.status).sort()).toEqual(["waiting", "waiting"]);
  });

  test("running subflow wins over waiting", async () => {
    writeFlow("bruce", "waiting", "waiting");
    writeFlow("supervisor", "running", "running");

    const res = await handleRoute("GET", "/api/flows/s_test", new Request("http://localhost/api/flows/s_test"), makeWorld());
    const body = await res.json() as any;

    expect(body.data.flow.status).toBe("running");
  });
});
```

- [ ] **Step 2: Run the failing route test**

Run:

```bash
cd /Users/bytedance/x/ooc/ooc-0/kernel
bun test tests/server-flow-detail-status.test.ts
```

Expected before implementation: the all-waiting case returns top-level `running`.

- [ ] **Step 3: Export and reuse a subflow status reducer**

In `/Users/bytedance/x/ooc/ooc-0/kernel/src/observable/server/sessions.ts`, add:

```ts
export function aggregateFlowStatuses(statuses: FlowStatus[], fallbackStatus: FlowStatus): FlowStatus {
  if (statuses.includes("running")) return "running";
  if (statuses.includes("waiting")) return "waiting";
  if (statuses.includes("pausing")) return "pausing";
  if (statuses.includes("failed")) return "failed";
  if (statuses.includes("finished")) return "finished";
  return fallbackStatus;
}
```

Then change `inferSessionLiveStatus()` tail to:

```ts
const statuses: FlowStatus[] = [];
```

and inside the loop push `liveStatus`; after the loop return `aggregateFlowStatuses(statuses, fallbackStatus)`.

- [ ] **Step 4: Apply the reducer in flow detail route**

In `/Users/bytedance/x/ooc/ooc-0/kernel/src/observable/server/server.ts`, import:

```ts
import { inferLiveFlowStatus, getSessionsSummary, mergeMessages, aggregateFlowStatuses } from "./sessions.js";
```

Replace:

```ts
if (subFlows.some((s) => s.status === "running" || s.status === "waiting")) {
  flow.status = "running";
}
```

with:

```ts
flow.status = aggregateFlowStatuses(subFlows.map((s) => s.status), flow.status);
```

- [ ] **Step 5: Verify**

Run:

```bash
cd /Users/bytedance/x/ooc/ooc-0/kernel
bun test tests/server-live-status.test.ts tests/server-flow-detail-status.test.ts
bun run typecheck
```

Expected: tests pass and typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/bytedance/x/ooc/ooc-0/kernel
git add src/observable/server/sessions.ts src/observable/server/server.ts tests/server-flow-detail-status.test.ts
git commit -m "fix: aggregate flow detail status without collapsing waiting"
```

---

### Task 3: Expose Waiting In Process Nodes Without Losing Legacy Compatibility

**Files:**
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/src/shared/types/process.ts`
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/src/storable/thread/thread-adapter.ts`
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/web/src/api/types.ts`
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/web/src/features/MessageSidebarThreadsList.tsx`
- Test: `/Users/bytedance/x/ooc/ooc-0/kernel/tests/thread-adapter-status.test.ts`

- [ ] **Step 1: Write failing adapter test**

Create `/Users/bytedance/x/ooc/ooc-0/kernel/tests/thread-adapter-status.test.ts`:

```ts
import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { threadsToProcess } from "../src/storable/thread/thread-adapter.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ooc-thread-adapter-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("threadsToProcess status mapping", () => {
  test("waiting thread maps to waiting process node and keeps raw thread status", () => {
    mkdirSync(join(dir, "threads", "root"), { recursive: true });
    writeFileSync(join(dir, "threads.json"), JSON.stringify({
      rootId: "root",
      nodes: {
        root: {
          id: "root",
          title: "root",
          status: "waiting",
          waitingType: "explicit_wait",
          childrenIds: [],
          createdAt: 1,
          updatedAt: 1,
        },
      },
    }, null, 2));
    writeFileSync(join(dir, "threads", "root", "thread.json"), JSON.stringify({ id: "root", events: [] }, null, 2));

    const process = threadsToProcess(dir);

    expect(process?.root.status).toBe("waiting");
    expect((process?.root.locals as any)._threadStatus).toBe("waiting");
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
cd /Users/bytedance/x/ooc/ooc-0/kernel
bun test tests/thread-adapter-status.test.ts
```

Expected before implementation: process root status is `doing`.

- [ ] **Step 3: Add `waiting` to shared process node status**

In `/Users/bytedance/x/ooc/ooc-0/kernel/src/shared/types/process.ts`, update `NodeStatus`:

```ts
export type NodeStatus = "todo" | "doing" | "waiting" | "done" | "failed";
```

In `/Users/bytedance/x/ooc/ooc-0/kernel/web/src/api/types.ts`, mirror the same union for `ProcessNode.status`.

- [ ] **Step 4: Map waiting explicitly**

In `/Users/bytedance/x/ooc/ooc-0/kernel/src/storable/thread/thread-adapter.ts`, change:

```ts
case "waiting": return "doing";
```

to:

```ts
case "waiting": return "waiting";
```

Also map paused defensively if `NodeStatus` remains without pausing:

```ts
case "paused": return "waiting";
```

- [ ] **Step 5: Update frontend status styling**

In `/Users/bytedance/x/ooc/ooc-0/kernel/web/src/features/MessageSidebarThreadsList.tsx`, update any status-to-color/label helper to handle `waiting` separately:

```ts
if (status === "waiting") return "text-amber-500";
```

If the file maps `doing` to a running label, add:

```ts
const label = status === "waiting" ? "等待中" : status === "doing" ? "运行中" : ...
```

- [ ] **Step 6: Verify**

Run:

```bash
cd /Users/bytedance/x/ooc/ooc-0/kernel
bun test tests/thread-adapter-status.test.ts
bun run typecheck
cd /Users/bytedance/x/ooc/ooc-0/kernel/web
bun run build
```

Expected: backend tests pass, backend typecheck exits 0, frontend build succeeds.

- [ ] **Step 7: Commit**

```bash
cd /Users/bytedance/x/ooc/ooc-0/kernel
git add src/shared/types/process.ts src/storable/thread/thread-adapter.ts web/src/api/types.ts web/src/features/MessageSidebarThreadsList.tsx tests/thread-adapter-status.test.ts
git commit -m "fix: expose waiting process node status"
```

---

### Task 4: Ensure Talk Reply Threads Reach A Terminal Waiting State And Write Flow Data

**Files:**
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/src/executable/commands/talk.ts`
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/src/storable/session/flow-data.ts`
- Test: `/Users/bytedance/x/ooc/ooc-0/kernel/tests/talk-command-lifecycle.test.ts`

- [ ] **Step 1: Write a failing lifecycle test for non-wait talk**

Create `/Users/bytedance/x/ooc/ooc-0/kernel/tests/talk-command-lifecycle.test.ts` with a minimal fake context:

```ts
import { describe, expect, test } from "bun:test";
import { executeTalkCommand } from "../src/executable/commands/talk.js";

describe("talk command lifecycle", () => {
  test("non-wait talk leaves the sender thread waiting after successful delivery", async () => {
    const statuses: Array<{ id: string; status: string; waitingType?: string }> = [];
    const data: any = { id: "root", events: [] };

    const ctx: any = {
      args: { target: "bruce", msg: "hello", context: "fork" },
      objectName: "supervisor",
      threadId: "root",
      sessionId: "s",
      tree: {
        readThreadData: () => data,
        writeThreadData: (_id: string, next: any) => Object.assign(data, next),
        setNodeStatus: async (id: string, status: string, waitingType?: string) => {
          statuses.push({ id, status, waitingType });
        },
        markInbox: () => {},
      },
      onTalk: async () => ({ reply: null, remoteThreadId: "th_remote" }),
      genMessageOutId: () => "msg_1",
      extractTalkForm: () => undefined,
      getAutoAckMessageId: () => undefined,
    };

    await executeTalkCommand(ctx);

    expect(statuses).toContainEqual({ id: "root", status: "waiting", waitingType: "explicit_wait" });
  });
});
```

- [ ] **Step 2: Run failing test**

Run:

```bash
cd /Users/bytedance/x/ooc/ooc-0/kernel
bun test tests/talk-command-lifecycle.test.ts
```

Expected before implementation: no `waiting/explicit_wait` status is set for non-wait talk.

- [ ] **Step 3: Set explicit wait after successful non-wait talk**

In `/Users/bytedance/x/ooc/ooc-0/kernel/src/executable/commands/talk.ts`, after the `ctx.onTalk(...)` call and after writing `[talk → target] remote_thread_id`, add:

```ts
if (!isWaitMode) {
  await ctx.tree.setNodeStatus(ctx.threadId, "waiting", "explicit_wait");
}
```

Keep `talk(wait=true)` behavior unchanged.

- [ ] **Step 4: Ensure flow data writes for waiting results**

Inspect `/Users/bytedance/x/ooc/ooc-0/kernel/src/storable/session/flow-data.ts`. Keep `status = threadStatusToFlowStatus(result.status)` but ensure callers receive `result.status === "waiting"` when command ends in explicit wait. Do not special-case supervisor.

- [ ] **Step 5: Verify with tests**

Run:

```bash
cd /Users/bytedance/x/ooc/ooc-0/kernel
bun test tests/talk-command-lifecycle.test.ts tests/server-live-status.test.ts tests/server-flow-detail-status.test.ts
bun run typecheck
```

Expected: tests pass and typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
cd /Users/bytedance/x/ooc/ooc-0/kernel
git add src/executable/commands/talk.ts src/storable/session/flow-data.ts tests/talk-command-lifecycle.test.ts
git commit -m "fix: settle non-wait talk threads after delivery"
```

---

### Task 5: Replace Stale Protocol Guidance With Current JSON Tool Calls

**Files:**
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/src/thinkable/context/compact.ts`
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/traits/base/TRAIT.md`
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/traits/compact/TRAIT.md`
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/traits/reflective/TRAIT.md`
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/traits/reflective/memory_api/TRAIT.md`
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/traits/computable/TRAIT.md`

- [ ] **Step 1: Replace compact pressure hint with complete JSON examples**

In `/Users/bytedance/x/ooc/ooc-0/kernel/src/thinkable/context/compact.ts`, replace the hint body with:

```ts
return (
  `\n<!-- compact-pressure-hint -->\n` +
  `>>> [系统提示] 当前线程 process events 已占用 ~${kTokens}k tokens（阈值 ${Math.floor(threshold / 1000)}k），接近压力区。\n` +
  `建议先进入 compact 模式：open({"title":"压缩上下文","type":"command","command":"compact","description":"梳理当前线程历史并压缩冗余 events"})。\n` +
  `进入后优先使用直接 trait method：open({"title":"列出可压缩 events","type":"command","command":"program","trait":"kernel:compact","method":"list_actions","description":"查看可压缩 events"})，随后 submit({"form_id":"..."}) 执行。\n` +
  `完成标记后用 submit({"form_id":"<compact form id>","summary":"此前：... 当前：..."}) 应用压缩并退出。`
);
```

- [ ] **Step 2: Rewrite `compact/TRAIT.md` examples**

In `/Users/bytedance/x/ooc/ooc-0/kernel/traits/compact/TRAIT.md`, replace pseudo examples with:

```md
1. `open({"title":"压缩上下文","type":"command","command":"compact","description":"梳理当前线程历史并压缩冗余 events"})`
2. `open({"title":"列出可压缩 events","type":"command","command":"program","trait":"kernel:compact","method":"list_actions","description":"查看可压缩 events"})`
3. `submit({"form_id":"<program form id>"})`
4. `open({"title":"标记冗余 event","type":"command","command":"program","trait":"kernel:compact","method":"drop_action","description":"标记一个可丢弃 event"})`
5. `refine({"form_id":"<program form id>","args":{"idx":12,"reason":"重复的目录列表"}})`
6. `submit({"form_id":"<program form id>"})`
7. `submit({"form_id":"<compact form id>","summary":"此前：... 当前任务：..."})`
```

Remove `submit compact { ... }` and examples missing `"type":"command"`.

- [ ] **Step 3: Rewrite reflective pseudo calls**

In `/Users/bytedance/x/ooc/ooc-0/kernel/traits/reflective/TRAIT.md` and `memory_api/TRAIT.md`, replace:

```md
await talk("super", "请记住：...");
```

with:

```md
open({"title":"沉淀经验到 super","type":"command","command":"talk","description":"把可复用经验发送给 super"})
refine({"form_id":"<form id>","args":{"target":"super","msg":"请记住：...","context":"fork"}})
submit({"form_id":"<form id>"})
```

Replace “输出 [return] 之前” with “提交 return 之前”.

- [ ] **Step 4: Make direct trait method the preferred computable path**

In `/Users/bytedance/x/ooc/ooc-0/kernel/traits/base/TRAIT.md` and `/Users/bytedance/x/ooc/ooc-0/kernel/traits/computable/TRAIT.md`, add this pattern before `callMethod(...)` examples:

```md
优先使用直接 trait method 调用：

open({"title":"读取文件","type":"command","command":"program","trait":"kernel:computable/file_ops","method":"readFile","description":"读取指定文件"})
refine({"form_id":"<form id>","args":{"path":"docs/meta.md"}})
submit({"form_id":"<form id>"})

只有当你需要组合多步脚本、循环或复杂计算时，才打开 `program` 并在 code 中使用 `callMethod(...)`。
```

- [ ] **Step 5: Verify stale protocol strings are gone**

Run:

```bash
cd /Users/bytedance/x/ooc/ooc-0
rg -n "await talk|输出 \\[return\\]|submit compact|open\\(title=.*command=|open\\(command=\\\"compact\\\"\\)" kernel/traits kernel/src/thinkable/context/compact.ts
```

Expected: no hits except historical explanatory text that explicitly says it is obsolete.

- [ ] **Step 6: Commit**

```bash
cd /Users/bytedance/x/ooc/ooc-0/kernel
git add src/thinkable/context/compact.ts traits/base/TRAIT.md traits/compact/TRAIT.md traits/reflective/TRAIT.md traits/reflective/memory_api/TRAIT.md traits/computable/TRAIT.md
git commit -m "docs: align trait protocol guidance with current tools"
```

---

### Task 6: Make UI Stop Treating Explicit Waiting As Thinking

**Files:**
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/web/src/features/SessionKanban.tsx`
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/web/src/features/MessageSidebar.tsx`
- Modify: `/Users/bytedance/x/ooc/ooc-0/kernel/web/src/api/types.ts`

- [ ] **Step 1: Update type mirror if Task 3 added `waiting` process status**

In `/Users/bytedance/x/ooc/ooc-0/kernel/web/src/api/types.ts`, ensure:

```ts
export type NodeStatus = "todo" | "doing" | "waiting" | "done" | "failed";
```

or the inline `ProcessNode.status` union includes `"waiting"`.

- [ ] **Step 2: Change SessionKanban live labels**

In `/Users/bytedance/x/ooc/ooc-0/kernel/web/src/features/SessionKanban.tsx`, replace logic that treats both `running` and `waiting` as “思考中” with:

```tsx
const isRunning = meta?.status === "running";
const isWaiting = meta?.status === "waiting";
```

Render text:

```tsx
{isRunning && !meta?.currentAction && <span>思考中...</span>}
{isWaiting && !meta?.currentAction && <span>等待中</span>}
```

If `currentAction` exists for `waiting`, prefix with `等待：` rather than `正在`.

- [ ] **Step 3: Change MessageSidebar empty/loading copy**

In `/Users/bytedance/x/ooc/ooc-0/kernel/web/src/features/MessageSidebar.tsx`, where it currently checks:

```tsx
activeFlow?.status === "running" || activeFlow?.status === "waiting"
```

split copy into:

```tsx
activeFlow?.status === "running" ? "正在思考中..." :
activeFlow?.status === "waiting" ? "等待下一步输入..." :
...
```

- [ ] **Step 4: Keep Iris badge but rename it narrowly**

In `/Users/bytedance/x/ooc/ooc-0/kernel/web/src/features/MessageSidebar.tsx`, change the badge label from global-sounding:

```tsx
{pendingForms.length} 个待处理
```

to:

```tsx
{pendingForms.length} 个待回复表单
```

Do not expand it to command activeForms in this task.

- [ ] **Step 5: Verify frontend build**

Run:

```bash
cd /Users/bytedance/x/ooc/ooc-0/kernel/web
bun run build
```

Expected: build succeeds.

- [ ] **Step 6: Commit**

```bash
cd /Users/bytedance/x/ooc/ooc-0/kernel
git add web/src/api/types.ts web/src/features/SessionKanban.tsx web/src/features/MessageSidebar.tsx
git commit -m "fix: show waiting state distinctly in web UI"
```

---

### Task 7: Verification With A Fresh OOC Experience Session

**Files:**
- No source edits unless verification finds regressions.

- [ ] **Step 1: Run targeted backend checks**

Run:

```bash
cd /Users/bytedance/x/ooc/ooc-0/kernel
bun test tests/server-live-status.test.ts tests/server-flow-detail-status.test.ts tests/thread-adapter-status.test.ts tests/talk-command-lifecycle.test.ts
bun run typecheck
```

Expected: all tests pass and typecheck exits 0.

- [ ] **Step 2: Run frontend build**

Run:

```bash
cd /Users/bytedance/x/ooc/ooc-0/kernel/web
bun run build
```

Expected: build succeeds.

- [ ] **Step 3: Start backend and frontend**

Run backend:

```bash
cd /Users/bytedance/x/ooc/ooc-0/kernel
bun run src/app/cli.ts serve --root /Users/bytedance/x/ooc/ooc-0 --port 8080
```

Run frontend in another terminal:

```bash
cd /Users/bytedance/x/ooc/ooc-0/kernel/web
bun run dev --host 127.0.0.1 --port 5173
```

- [ ] **Step 4: Create a new Bruce test session**

Use the API:

```bash
curl -sS -X POST http://127.0.0.1:8080/api/talk/bruce \
  -H 'content-type: application/json' \
  -d '{"message":"请作为成熟智能 Agent 系统的真实用户做一次自由体验测试。重点验证：完成后状态是否正确进入 waiting/finished；是否自然优先使用 open(command=program, trait=..., method=...) 直接调用 trait method；如果联系其他对象，请观察对方是否能正确 wait 或 return 收尾。"}'
```

Expected: response returns a new `sessionId`.

- [ ] **Step 5: Poll the session**

Run:

```bash
SESSION_ID=<new session id>
curl -sS "http://127.0.0.1:8080/api/flows/${SESSION_ID}" | jq '.data.flow.status, .data.subFlows[] | {stoneName,status,currentAction}'
```

Expected:
- completed explicit wait appears as `waiting`, not `running`;
- a true running object appears as `running`;
- no object remains `running` merely because it has replied once.

- [ ] **Step 6: Inspect tool usage**

Run:

```bash
SESSION_ID=<new session id>
jq -r '.events[] | select(.type=="tool_use" and .name=="open") | .args' /Users/bytedance/x/ooc/ooc-0/flows/${SESSION_ID}/objects/*/threads/*/thread.json
```

Expected: direct `program + trait + method` calls appear naturally in simple file/shell/list operations, not only `program` code with `callMethod(...)`.

- [ ] **Step 7: Stop servers**

Stop backend and frontend with Ctrl-C. Verify port:

```bash
lsof -n -P -iTCP:8080 -sTCP:LISTEN || true
```

Expected: no output after backend stops.

---

## Self-Review

- Spec coverage: The plan covers status inference, flow detail aggregation, process node UI status, talk lifecycle, protocol docs/hints, frontend waiting copy, and fresh regression testing.
- Placeholder scan: No task contains TBD/TODO/fill-in placeholders. Snippets use concrete file paths and expected commands.
- Type consistency: `waiting` is introduced as a process node status in backend shared types and mirrored in frontend API types. `FlowStatus` remains unchanged.

