# OOC 文件目录结构重组 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Session 内部的 `flows/` 子目录重命名为 `objects/`，将 kanban 数据从单 JSON 文件拆分为目录结构，将 UI 路径从 `files/ui` 提升为 `ui`。

**Architecture:** 一次性全局替换策略，分 4 个 chunk 执行：后端路径重命名 → Kanban 存储重构 → 前端路径适配 → 文档更新验证。不处理旧数据迁移。

**Tech Stack:** TypeScript (Bun runtime), React + Vite + Jotai

**Spec:** `docs/superpowers/specs/2026-04-04-directory-restructure-design.md`

---

## Chunk 1: 后端 — Session 内部 `flows/` → `objects/` 重命名

将 session 内部存储 flow 对象的子目录从 `flows/` 重命名为 `objects/`，消除 `flows/{sid}/flows/{obj}` 的歧义路径。

### Task 1: Flow 类路径适配

**Files:**
- Modify: `kernel/src/flow/flow.ts`

- [ ] **Step 1: 修改 Flow.create() 路径构建（第 104-106 行）**

```typescript
// 旧代码（第 104-106 行）
/* main flow 目录：flows/{sessionId}/flows/{stoneName}/ */
const sessionDir = join(flowsDir, sessionId);
const dir = join(sessionDir, "flows", stoneName);

// 新代码
/* main flow 目录：flows/{sessionId}/objects/{stoneName}/ */
const sessionDir = join(flowsDir, sessionId);
const dir = join(sessionDir, "objects", stoneName);
```

- [ ] **Step 2: 修改 Flow.createSubFlow() 路径构建（第 115-117, 154 行）**

更新注释（第 115-117 行）：
```typescript
// 旧注释
* Sub-flow 是完整的 Flow 对象，持久化在 session 的 flows/{stoneName}/ 下。
* Sub-flow 使用自己的 files/ 目录（flows/{sessionId}/flows/{stoneName}/files/）。
// 新注释
* Sub-flow 是完整的 Flow 对象，持久化在 session 的 objects/{stoneName}/ 下。
* Sub-flow 使用自己的 files/ 目录（flows/{sessionId}/objects/{stoneName}/files/）。
```

更新路径（第 154 行）：
```typescript
// 旧代码
const dir = join(sessionDir, "flows", stoneName);
// 新代码
const dir = join(sessionDir, "objects", stoneName);
```

- [ ] **Step 3: 更新 Flow.sessionDir 注释（第 211 行）**

```typescript
// 旧注释
/** session 根目录（flows/{sessionId}/），所有同 session 的 flow 共享此目录 */
// 新注释
/** session 根目录（flows/{sessionId}/），所有同 session 的 objects 共享此目录 */
```

- [ ] **Step 4: 提交**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && git add src/flow/flow.ts
git commit -m "refactor: rename session internal flows/ to objects/ in Flow class"
```

### Task 2: World 类路径适配

**Files:**
- Modify: `kernel/src/world/world.ts`

- [ ] **Step 1: 全局替换 session 内部路径**

所有 `join(sessionDir, "flows", ...)` → `join(sessionDir, "objects", ...)`。涉及行号：

| 行号 | 旧代码 | 新代码 |
|------|--------|--------|
| 457 | `Flow.load(join(sessionDir, "flows", "user"))` | `Flow.load(join(sessionDir, "objects", "user"))` |
| 462 | `join(sessionDir, "flows", objectName)` | `join(sessionDir, "objects", objectName)` |
| 469 | `join(sessionDir, "flows", objectName)` | `join(sessionDir, "objects", objectName)` |
| 756 | `Flow.load(join(sessionDir, "flows", "user"))` | `Flow.load(join(sessionDir, "objects", "user"))` |
| 764 | `join(sessionDir, "flows", objectName)` | `join(sessionDir, "objects", objectName)` |
| 775 | `Flow.load(join(sessionDir, "flows", objectName))` | `Flow.load(join(sessionDir, "objects", objectName))` |
| 898 | `Flow.load(join(sessionDir, "flows", "user"))` | `Flow.load(join(sessionDir, "objects", "user"))` |
| 904 | `join(sessionDir, "flows", objectName)` | `join(sessionDir, "objects", objectName)` |
| 1048 | `join(sessionDir, "flows")` | `join(sessionDir, "objects")` |
| 1205 | `join(sessionDir, "flows")` | `join(sessionDir, "objects")` |

更新注释（第 541, 629, 640 行）中的 `flows/` → `objects/`。

注意：`this.flowsDir`（getter，第 1252 行返回 `join(this._rootDir, "flows")`）**不变** — 顶层 sessions 根目录。

- [ ] **Step 2: 提交**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && git add src/world/world.ts
git commit -m "refactor: rename session internal flows/ to objects/ in World class"
```

### Task 3: Context builder 适配

**Files:**
- Modify: `kernel/src/context/builder.ts`

- [ ] **Step 1: 替换 builder.ts 中的路径（第 238, 306 行）**

第 238 行 `buildSessionOverview` 函数中：
```typescript
// 旧代码
const flowsDir = join(sessionDir, "flows");
// 新代码
const objectsDir = join(sessionDir, "objects");
```

函数内所有 `flowsDir` 局部变量 → `objectsDir`（第 239, 243, 254 行）。

第 306 行 `buildSessionMessages` 函数中同理：
```typescript
// 旧代码
const flowsDir = join(sessionDir, "flows");
// 新代码
const objectsDir = join(sessionDir, "objects");
```

函数内 `flowsDir` → `objectsDir`（第 307, 311, 322 行）。

- [ ] **Step 2: 提交**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && git add src/context/builder.ts
git commit -m "refactor: rename session internal flows/ to objects/ in context builder"
```

### Task 4: Server 路径适配

**Files:**
- Modify: `kernel/src/server/server.ts`

- [ ] **Step 1: 替换 server.ts 中的 session 内部路径**

| 行号 | 旧代码 | 新代码 |
|------|--------|--------|
| 229 | `join(mainFlow.dir, "flows", name)` | `join(mainFlow.dir, "objects", name)` |
| 288 | `FlowCls.load(join(sessionDir, "flows", "user"))` | `FlowCls.load(join(sessionDir, "objects", "user"))` |
| 290 | `join(sessionDir, "flows", name)` | `join(sessionDir, "objects", name)` |
| 362 | `readFlow(join(sessionDir, "flows", "user"))` | `readFlow(join(sessionDir, "objects", "user"))` |
| 370 | `const flowsDir = join(sessionDir, "flows")` | `const objectsDir = join(sessionDir, "objects")` |
| 372-378 | `flowsDir` 局部变量 → `objectsDir` | 全部替换 |
| 402 | `join(sessionDir, "flows", "user")` | `join(sessionDir, "objects", "user")` |
| 426 | `const flowsSubDir = join(sessionDir, "flows")` | `const objectsSubDir = join(sessionDir, "objects")` |
| 446 | `join(flowsSubDir, "user")` | `join(objectsSubDir, "user")` |
| 451-456 | `flowsSubDir` → `objectsSubDir` | 全部替换 |
| 843 | `readFlow(join(flowsDir, sessionId, "flows", "user"))` | `readFlow(join(flowsDir, sessionId, "objects", "user"))` |

注意：`world.flowsDir`（第 226, 283, 333 等行）**不变** — 顶层路径。

- [ ] **Step 2: 提交**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && git add src/server/server.ts
git commit -m "refactor: rename session internal flows/ to objects/ in server"
```

### Task 5: 其他后端文件适配

**Files:**
- Modify: `kernel/src/world/session.ts`（仅注释）
- Verify: `kernel/src/world/scheduler.ts`（无需改动）
- Verify: `kernel/src/context/history.ts`（无需改动）

- [ ] **Step 1: 更新 session.ts 注释（第 39 行）**

```typescript
// 旧注释
session 根目录（flows/{sessionId}/，所有 sub-flow 在此目录下的 flows/ 中创建）
// 新注释
session 根目录（flows/{sessionId}/，所有 sub-flow 在此目录下的 objects/ 中创建）
```

- [ ] **Step 2: 确认 scheduler.ts 和 history.ts 无需改动**

- `scheduler.ts`：接收 `flowsDir` 参数由 world 传入，自身不做 `join(x, "flows")` 操作
- `history.ts`：使用顶层 `flowsDir`，不涉及 session 内部路径

- [ ] **Step 3: 提交**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && git add src/world/session.ts
git commit -m "docs: update session.ts comment for objects/ rename"
```

---

## Chunk 2: Kanban 存储重构

将 `issues.json` / `tasks.json` 拆分为 `issues/` / `tasks/` 目录结构。

### Task 6: 重写 kanban/store.ts

**Files:**
- Rewrite: `kernel/src/kanban/store.ts`

- [ ] **Step 1: 重写 store.ts**

将单文件读写改为目录结构读写。`index.json` 存储完整 Issue/Task 对象数组（前端直接读取）。单条文件（`issue-{id}.json`）用于未来的单条读写优化。

```typescript
// kernel/src/kanban/store.ts
// issues/ 和 tasks/ 目录结构的读写操作

import { join } from "node:path";
import { mkdirSync } from "node:fs";
import type { Issue, Task } from "./types";

/** 确保目录存在 */
function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

/** 读取 issues/index.json，不存在则返回空数组 */
export async function readIssues(sessionDir: string): Promise<Issue[]> {
  const indexPath = join(sessionDir, "issues", "index.json");
  try {
    const file = Bun.file(indexPath);
    if (!(await file.exists())) return [];
    return JSON.parse(await file.text()) as Issue[];
  } catch {
    return [];
  }
}

/** 写入 issues：同时更新 index.json（完整数据）和单条文件 */
export async function writeIssues(sessionDir: string, issues: Issue[]): Promise<void> {
  const issuesDir = join(sessionDir, "issues");
  ensureDir(issuesDir);

  /* 写入 index.json（完整数据，方便前端直接读取） */
  await Bun.write(join(issuesDir, "index.json"), JSON.stringify(issues, null, 2));

  /* 写入单条文件 */
  for (const issue of issues) {
    await Bun.write(
      join(issuesDir, `issue-${issue.id}.json`),
      JSON.stringify(issue, null, 2),
    );
  }
}

/** 读取 tasks/index.json，不存在则返回空数组 */
export async function readTasks(sessionDir: string): Promise<Task[]> {
  const indexPath = join(sessionDir, "tasks", "index.json");
  try {
    const file = Bun.file(indexPath);
    if (!(await file.exists())) return [];
    return JSON.parse(await file.text()) as Task[];
  } catch {
    return [];
  }
}

/** 写入 tasks：同时更新 index.json（完整数据）和单条文件 */
export async function writeTasks(sessionDir: string, tasks: Task[]): Promise<void> {
  const tasksDir = join(sessionDir, "tasks");
  ensureDir(tasksDir);

  /* 写入 index.json（完整数据） */
  await Bun.write(join(tasksDir, "index.json"), JSON.stringify(tasks, null, 2));

  for (const task of tasks) {
    await Bun.write(
      join(tasksDir, `task-${task.id}.json`),
      JSON.stringify(task, null, 2),
    );
  }
}

/** 生成自增 ID */
export function nextId(prefix: string, items: { id: string }[]): string {
  let max = 0;
  for (const item of items) {
    const num = parseInt(item.id.replace(`${prefix}-`, ""), 10);
    if (num > max) max = num;
  }
  return `${prefix}-${String(max + 1).padStart(3, "0")}`;
}

/** 当前时间 ISO 字符串 */
export function now(): string {
  return new Date().toISOString();
}

/** 读取单条 Issue 详情 */
export async function readIssueDetail(sessionDir: string, issueId: string): Promise<Issue | null> {
  try {
    const path = join(sessionDir, "issues", `issue-${issueId}.json`);
    const file = Bun.file(path);
    if (!(await file.exists())) return null;
    return JSON.parse(await file.text()) as Issue;
  } catch {
    return null;
  }
}

/** 写入单条 Issue 详情 */
export async function writeIssueDetail(sessionDir: string, issue: Issue): Promise<void> {
  const issuesDir = join(sessionDir, "issues");
  ensureDir(issuesDir);
  await Bun.write(
    join(issuesDir, `issue-${issue.id}.json`),
    JSON.stringify(issue, null, 2),
  );
}

/** 读取单条 Task 详情 */
export async function readTaskDetail(sessionDir: string, taskId: string): Promise<Task | null> {
  try {
    const path = join(sessionDir, "tasks", `task-${taskId}.json`);
    const file = Bun.file(path);
    if (!(await file.exists())) return null;
    return JSON.parse(await file.text()) as Task;
  } catch {
    return null;
  }
}

/** 写入单条 Task 详情 */
export async function writeTaskDetail(sessionDir: string, task: Task): Promise<void> {
  const tasksDir = join(sessionDir, "tasks");
  ensureDir(tasksDir);
  await Bun.write(
    join(tasksDir, `task-${task.id}.json`),
    JSON.stringify(task, null, 2),
  );
}
```

- [ ] **Step 2: 提交**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && git add src/kanban/store.ts
git commit -m "refactor: restructure kanban store to directory-based storage"
```

### Task 7: 确认 kanban/methods.ts 和 kanban/discussion.ts 无需改动

**Files:**
- Verify: `kernel/src/kanban/methods.ts`
- Verify: `kernel/src/kanban/discussion.ts`

- [ ] **Step 1: 确认无需改动**

这两个文件通过 `readIssues/writeIssues/readTasks/writeTasks` 操作数据。store.ts 的函数签名不变（`sessionDir: string`），所以 methods.ts 和 discussion.ts **无需改动** — 它们会自动使用新的目录结构。

- [ ] **Step 2: 跳过提交**

### Task 8: World 初始化时创建 kanban 目录

**Files:**
- Modify: `kernel/src/world/world.ts`

- [ ] **Step 1: 在 talk() 中创建 issues/ 和 tasks/ 目录**

在 world.ts 中 `Flow.create()` 之后、创建 Scheduler 之前，确保 `issues/` 和 `tasks/` 目录存在并初始化空的 `index.json`。

找到 `Flow.create(this.flowsDir, ...)` 的调用处（约第 633 和 641 行），在其后添加：

```typescript
/* 确保 kanban 目录结构存在 */
const issuesDir = join(mainFlow.sessionDir, "issues");
const tasksDir = join(mainFlow.sessionDir, "tasks");
mkdirSync(issuesDir, { recursive: true });
mkdirSync(tasksDir, { recursive: true });
const issuesIndexPath = join(issuesDir, "index.json");
if (!existsSync(issuesIndexPath)) {
  writeFileSync(issuesIndexPath, "[]", "utf-8");
}
const tasksIndexPath = join(tasksDir, "index.json");
if (!existsSync(tasksIndexPath)) {
  writeFileSync(tasksIndexPath, "[]", "utf-8");
}
```

注意：`mkdirSync`、`writeFileSync`、`existsSync` 已在文件头导入（第 2 行）。

- [ ] **Step 2: 提交**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && git add src/world/world.ts
git commit -m "feat: create issues/ and tasks/ directories on session initialization"
```

### Task 9: 验证后端变更

- [ ] **Step 1: 运行后端测试**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && bun test
```

Expected: 所有测试通过（如无测试文件则跳过）。

- [ ] **Step 2: 启动后端，创建 session 验证目录结构**

```bash
cd /Users/zhangzhefu/x/ooc/user && NO_PROXY='*' HTTP_PROXY='' HTTPS_PROXY='' http_proxy='' https_proxy='' bun kernel/src/cli.ts start 8080
```

用 curl 创建一个 session：
```bash
curl -X POST http://localhost:8080/api/talk/user -H 'Content-Type: application/json' -d '{"message":"test directory restructure"}'
```

检查目录结构：
```bash
ls flows/session_*/objects/
ls flows/session_*/issues/
ls flows/session_*/tasks/
cat flows/session_*/issues/index.json
```

Expected: `objects/` 子目录存在（而非 `flows/`），`issues/index.json` 为 `[]`，`tasks/index.json` 为 `[]`。

---

## Chunk 3: 前端路径适配

将前端所有组件中的路径模式从旧结构更新为新结构。

### Task 10: 更新 ViewRouter.tsx

**Files:**
- Modify: `kernel/web/src/features/ViewRouter.tsx`

- [ ] **Step 1: 替换 parseRoute 中的路径正则**

所有 `flows/([^/]+)/flows/` → `flows/([^/]+)/objects/`：

| 行号 | 旧代码 | 新代码 |
|------|--------|--------|
| 57 | `path.match(/^flows\/([^/]+)\/flows\/([^/]+)\/files\/ui$/)` | `path.match(/^flows\/([^/]+)\/objects\/([^/]+)\/ui\/pages$/)` |
| 61 | `path.match(/^flows\/([^/]+)\/flows\/([^/]+)\/process\.json$/)` | `path.match(/^flows\/([^/]+)\/objects\/([^/]+)\/process\.json$/)` |
| 65 | `path.match(/^flows\/([^/]+)\/flows\/([^/]+)\/data\.json$/)` | `path.match(/^flows\/([^/]+)\/objects\/([^/]+)\/data\.json$/)` |
| 74 | `path.match(/^flows\/([^/]+)\/flows\/([^/]+)$/)` | `path.match(/^flows\/([^/]+)\/objects\/([^/]+)$/)` |

更新第 56 行注释：
```typescript
/* flows/{sessionId}/objects/{objectName}/ui/pages — Flow UI tab */
```

- [ ] **Step 2: 更新 Stone UI import path（第 113 行）**

```typescript
// 旧代码
importPath={`@stones/${name}/files/ui/index.tsx`}
// 新代码
importPath={`@stones/${name}/ui/index.tsx`}
```

- [ ] **Step 3: 提交**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && git add web/src/features/ViewRouter.tsx
git commit -m "refactor: update ViewRouter paths for objects/ rename and ui/ promotion"
```

### Task 11: 更新 registrations.tsx

**Files:**
- Modify: `kernel/web/src/router/registrations.tsx`

- [ ] **Step 1: 替换 FlowViewAdapter 路径正则（第 59 行）**

```typescript
// 旧代码
const match = path.match(/^flows\/([^/]+)\/flows\/([^/]+)/);
// 新代码
const match = path.match(/^flows\/([^/]+)\/objects\/([^/]+)/);
```

- [ ] **Step 2: 更新 UI tab 检测（第 69 行）**

```typescript
// 旧代码
else if (path.endsWith("/files/ui")) initialTab = "UI";
// 新代码
else if (path.endsWith("/ui/pages")) initialTab = "UI";
```

- [ ] **Step 3: 替换 StoneViewAdapter UI 路径（第 48 行）**

```typescript
// 旧代码
importPath={`@stones/${name}/files/ui/index.tsx`}
// 新代码
importPath={`@stones/${name}/ui/index.tsx`}
```

- [ ] **Step 4: 更新 FlowView 注册的 match/tabKey/tabLabel（第 276, 283, 287-288 行）**

```typescript
// 第 276 行
// 旧代码
const match = p.match(/^flows\/[^/]+\/flows\/[^/]+(.*)$/);
// 新代码
const match = p.match(/^flows\/[^/]+\/objects\/[^/]+(.*)$/);

// 第 283 行
// 旧代码
if (subPath === "/files/ui") return true;
// 新代码
if (subPath === "/ui/pages") return true;

// 第 287-288 行
// 旧代码
tabKey: (p) => p.match(/^(flows\/[^/]+\/flows\/[^/]+)/)?.[1] ?? p,
tabLabel: (p) => p.match(/flows\/[^/]+\/flows\/([^/]+)/)?.[1] ?? "Flow",
// 新代码
tabKey: (p) => p.match(/^(flows\/[^/]+\/objects\/[^/]+)/)?.[1] ?? p,
tabLabel: (p) => p.match(/flows\/[^/]+\/objects\/([^/]+)/)?.[1] ?? "Flow",
```

- [ ] **Step 5: 更新 ProcessJson 排除路径（第 357 行）**

```typescript
// 旧代码
!/^flows\/[^/]+\/flows\/[^/]+/.test(p)
// 新代码
!/^flows\/[^/]+\/objects\/[^/]+/.test(p)
```

- [ ] **Step 6: 提交**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && git add web/src/router/registrations.tsx
git commit -m "refactor: update view registration paths for objects/ and ui/ changes"
```

### Task 12: 更新 DynamicUI.tsx

**Files:**
- Modify: `kernel/web/src/features/DynamicUI.tsx`

- [ ] **Step 1: 更新 extractUITarget 正则（第 34 行）**

```typescript
// 旧代码
const flowMatch = importPath.match(/@flows\/([^/]+)\/flows\/([^/]+)/);
// 新代码
const flowMatch = importPath.match(/@flows\/([^/]+)\/objects\/([^/]+)/);
```

- [ ] **Step 2: 更新文件头注释（第 5-6 行）**

```typescript
// 旧注释
* - Stone: @stones/{name}/files/ui/index.tsx
* - Flow:  @flows/{sid}/flows/{name}/files/ui/index.tsx
// 新注释
* - Stone: @stones/{name}/ui/index.tsx
* - Flow:  @flows/{sid}/objects/{name}/ui/pages/*.tsx
```

- [ ] **Step 3: 提交**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && git add web/src/features/DynamicUI.tsx
git commit -m "refactor: update DynamicUI paths for objects/ and ui/ changes"
```

### Task 13: 更新 FlowView.tsx

**Files:**
- Modify: `kernel/web/src/features/FlowView.tsx`

- [ ] **Step 1: 更新 UI 检测逻辑（第 66-81 行）**

```typescript
// 旧代码
const flowsDir = tree.children?.find((c) => c.name === "flows");
const objectDir = flowsDir?.children?.find((c) => c.name === objectName);
const filesDir = objectDir?.children?.find((c) => c.name === "files");
const uiDir = filesDir?.children?.find((c) => c.name === "ui");
const found = !!uiDir;

// 新代码
const objectsDir = tree.children?.find((c) => c.name === "objects");
const objectDir = objectsDir?.children?.find((c) => c.name === objectName);
const uiDir = objectDir?.children?.find((c) => c.name === "ui");
const pagesDir = uiDir?.children?.find((c) => c.name === "pages");
const found = !!pagesDir;
```

- [ ] **Step 2: 更新 DynamicUI importPath（第 196 行）**

```typescript
// 旧代码
importPath={`@flows/${sessionId}/flows/${objectName}/files/ui/index.tsx`}
// 新代码
importPath={`@flows/${sessionId}/objects/${objectName}/ui/pages/index.tsx`}
```

- [ ] **Step 3: 更新 SplitDataTab 路径（第 219 行）**

```typescript
// 旧代码
const path = `flows/${sessionId}/flows/${objectName}/data.json`;
// 新代码
const path = `flows/${sessionId}/objects/${objectName}/data.json`;
```

- [ ] **Step 4: 更新 FlowMemoryTab 路径（第 266 行）**

```typescript
// 旧代码
const path = `flows/${sessionId}/flows/${objectName}/memory.md`;
// 新代码
const path = `flows/${sessionId}/objects/${objectName}/memory.md`;
```

- [ ] **Step 5: 提交**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && git add web/src/features/FlowView.tsx
git commit -m "refactor: update FlowView paths for objects/ rename and ui/ promotion"
```

### Task 14: 更新 SessionFileTree.tsx

**Files:**
- Modify: `kernel/web/src/features/SessionFileTree.tsx`

- [ ] **Step 1: 更新 enhanceTree 中的目录查找（第 38-39 行）**

```typescript
// 旧代码
const flowsDir = enhanced.children.find(
  (c) => c.type === "directory" && c.name === "flows"
);
// 新代码
const objectsDir = enhanced.children.find(
  (c) => c.type === "directory" && c.name === "objects"
);
```

后续所有 `flowsDir` 引用改为 `objectsDir`（第 58, 95 行等）。

- [ ] **Step 2: 提交**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && git add web/src/features/SessionFileTree.tsx
git commit -m "refactor: update SessionFileTree to use objects/ directory name"
```

### Task 15: 更新 App.tsx

**Files:**
- Modify: `kernel/web/src/App.tsx`

- [ ] **Step 1: 更新 supervisor 路径（第 372, 388 行）**

```typescript
// 第 372 行 — 旧代码
const path = `flows/${result.sessionId}/flows/supervisor`;
// 新代码
const path = `flows/${result.sessionId}/objects/supervisor`;

// 第 388 行 — 旧代码
const indexPath = `flows/${activeId}/flows/supervisor/files/ui`;
// 新代码
const indexPath = `flows/${activeId}/objects/supervisor/ui/pages`;
```

- [ ] **Step 2: 提交**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && git add web/src/App.tsx
git commit -m "refactor: update App.tsx supervisor paths for objects/ and ui/ changes"
```

### Task 16: 更新 IssueDetailView.tsx 和 TaskDetailView.tsx

**Files:**
- Modify: `kernel/web/src/features/IssueDetailView.tsx`
- Modify: `kernel/web/src/features/TaskDetailView.tsx`

- [ ] **Step 1: 更新 IssueDetailView 的 reportPages 路径（第 105 行）**

```typescript
// 旧代码
<DynamicUI importPath={`@flows/${sessionId}/flows/supervisor/files/ui/pages/${page}`} componentProps={{ sessionId }} />
// 新代码
<DynamicUI importPath={`@flows/${sessionId}/objects/supervisor/ui/pages/${page}`} componentProps={{ sessionId }} />
```

- [ ] **Step 2: 更新 TaskDetailView 的 reportPages 路径（第 116 行）**

```typescript
// 旧代码
<DynamicUI importPath={`@flows/${sessionId}/flows/supervisor/files/ui/pages/${page}`} componentProps={{ sessionId }} />
// 新代码
<DynamicUI importPath={`@flows/${sessionId}/objects/supervisor/ui/pages/${page}`} componentProps={{ sessionId }} />
```

- [ ] **Step 3: 提交**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && git add web/src/features/IssueDetailView.tsx web/src/features/TaskDetailView.tsx
git commit -m "refactor: update IssueDetail/TaskDetail reportPages paths"
```

### Task 17: 更新 api/kanban.ts

**Files:**
- Modify: `kernel/web/src/api/kanban.ts`

- [ ] **Step 1: 更新 fetchIssues 和 fetchTasks 路径**

```typescript
// 第 12 行 — 旧代码
const content = await fetchFileContent(`flows/${sessionId}/issues.json`);
// 新代码
const content = await fetchFileContent(`flows/${sessionId}/issues/index.json`);

// 第 22 行 — 旧代码
const content = await fetchFileContent(`flows/${sessionId}/tasks.json`);
// 新代码
const content = await fetchFileContent(`flows/${sessionId}/tasks/index.json`);
```

注意：`index.json` 存储完整 Issue/Task 对象数组，前端无需改动读取逻辑。

- [ ] **Step 2: 提交**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && git add web/src/api/kanban.ts
git commit -m "refactor: update kanban API paths to issues/index.json and tasks/index.json"
```

### Task 18: 确认 objects/index.ts 无需改动

**Files:**
- Verify: `kernel/web/src/objects/index.ts`

- [ ] **Step 1: 确认 glob 路径**

当前 glob 模式 `../../../stones/*/ui/index.tsx` 已指向正确的 `stones/{name}/ui/index.tsx` 路径。stone UI 已在 `ui/` 下（新路径），不需要改动。

确认 DynamicUI 中 stone 的 importPath 使用 `@stones/{name}/ui/index.tsx`（Task 12 已改），与 glob 注册路径一致。

- [ ] **Step 2: 无需改动，跳过提交**

---

## Chunk 4: 文档更新 + 端到端验证

### Task 19: 更新 TRAIT.md

**Files:**
- Modify: `kernel/traits/kernel/cognitive-style/TRAIT.md`

- [ ] **Step 1: 更新 task_dir 路径示例（第 214 行）**

```markdown
<!-- 旧 -->
task_dir — 当前 flow 的根目录（如 `flows/{sessionId}/flows/{objectName}/`）
<!-- 新 -->
task_dir — 当前 flow 的根目录（如 `flows/{sessionId}/objects/{objectName}/`）
```

- [ ] **Step 2: 更新 UI 相关路径说明**

搜索所有 `files/ui` 引用，替换为新路径 `ui/`。更新 `task_files_dir` 说明（第 215 行注释 `task_dir + "/files"` 保持不变，因为 files 目录仍存在，只是 UI 从 files/ui 提升为 ui）。

- [ ] **Step 3: 提交**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && git add traits/kernel/cognitive-style/TRAIT.md
git commit -m "docs: update TRAIT.md paths for objects/ rename and ui/ promotion"
```

### Task 20: 更新 meta.md

**Files:**
- Modify: `user/docs/meta.md`

- [ ] **Step 1: 更新目录结构描述**

- 第 352 行附近：`flows/{name}` → `objects/{name}`
- 第 369 行附近：`flows/{sessionId}/flows/{name}/process.json` → `flows/{sessionId}/objects/{name}/process.json`
- 第 616 行附近：`flows/{sid}/flows/{name}` → `flows/{sid}/objects/{name}`

- [ ] **Step 2: 更新 UI 相关描述**

- 第 319 行：`files/ui/index.tsx` → `ui/index.tsx`（stone）和 `ui/pages/*.tsx`（flow）
- 第 663 行：`files/ui/index.tsx` → `ui/index.tsx`

- [ ] **Step 3: 提交**

```bash
cd /Users/zhangzhefu/x/ooc/user && git add docs/meta.md
git commit -m "docs: update meta.md directory structure for objects/ rename"
```

### Task 21: 端到端验证

- [ ] **Step 1: 启动后端**

```bash
cd /Users/zhangzhefu/x/ooc/user && NO_PROXY='*' HTTP_PROXY='' HTTPS_PROXY='' http_proxy='' https_proxy='' bun kernel/src/cli.ts start 8080
```

- [ ] **Step 2: 启动前端**

```bash
cd /Users/zhangzhefu/x/ooc/kernel/web && NO_PROXY='*' HTTP_PROXY='' HTTPS_PROXY='' http_proxy='' https_proxy='' npm run dev
```

- [ ] **Step 3: Bruce 场景验证（CLI/API）**

1. 创建 session（向对象发消息）
2. 检查新 session 目录结构：`ls -R flows/session_*/` 确认有 `objects/`、`issues/`、`tasks/` 子目录
3. 检查 `issues/index.json` 和 `tasks/index.json` 内容为 `[]`
4. 通过 kanban API 创建 issue 和 task，检查单条文件生成

- [ ] **Step 4: Candy 场景验证（Web UI）**

1. 打开浏览器访问前端页面
2. 点击 session，确认 Kanban 视图正确展示
3. 检查文件树侧边栏：session 下的 `objects/` 目录正确显示
4. 点击 flow 对象，确认 FlowView 各 tab 正常加载（Timeline/Process/Readme/Data/Memory）
5. 点击 stone，确认 StoneView 的 UI tab 正常加载

- [ ] **Step 5: 检查最终 commit 历史**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && git log --oneline -15
cd /Users/zhangzhefu/x/ooc/user && git log --oneline -5
```

---

## 变更路径速查表

| 旧路径 | 新路径 | 影响范围 |
|--------|--------|----------|
| `flows/{sid}/flows/{obj}` | `flows/{sid}/objects/{obj}` | 后端+前端全部 |
| `flows/{sid}/flows/{obj}/files/ui` | `flows/{sid}/objects/{obj}/ui/pages` | FlowView, registrations, ViewRouter |
| `flows/{sid}/flows/supervisor/files/ui` | `flows/{sid}/objects/supervisor/ui/pages` | App.tsx, IssueDetail, TaskDetail |
| `stones/{name}/files/ui/index.tsx` | `stones/{name}/ui/index.tsx` | ViewRouter, registrations, objects/index.ts |
| `@flows/{sid}/flows/{obj}/files/ui/` | `@flows/{sid}/objects/{obj}/ui/pages/` | DynamicUI |
| `@stones/{name}/files/ui/` | `@stones/{name}/ui/` | DynamicUI, ViewRouter, registrations |
| `flows/{sid}/issues.json` | `flows/{sid}/issues/index.json` | kanban.ts, store.ts |
| `flows/{sid}/tasks.json` | `flows/{sid}/tasks/index.json` | kanban.ts, store.ts |
