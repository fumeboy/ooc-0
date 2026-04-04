# Session Kanban 实现计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 OOC Session 实现看板视图，替换 SessionGantt，展示 Issues/Tasks/工作状态摘要。

**Architecture:** 数据层使用 session 目录下的 JSON 文件（issues.json / tasks.json / readme.md），通过两个 Trait 封装操作（session-kanban 管 CRUD，issue-discussion 管评论），前端注册三个新视图（Kanban 主视图 + Issue 详情 + Task 详情）替换 SessionGantt。后端新增用户评论和 ack 两个 API 端点。

**Tech Stack:** TypeScript, Bun, React, Tailwind CSS, Jotai, SSE

**Spec:** `docs/superpowers/specs/2026-04-04-session-kanban-design.md`

---

## 文件结构

### 新建文件

| 文件 | 职责 |
|------|------|
| `kernel/src/kanban/types.ts` | Issue/Task/Comment/SubTask 类型定义 |
| `kernel/src/kanban/store.ts` | issues.json / tasks.json 的读写操作（serializedWrite） |
| `kernel/src/kanban/methods.ts` | session-kanban trait 的 method 实现函数 |
| `kernel/src/kanban/discussion.ts` | issue-discussion trait 的 method 实现函数 |
| `kernel/tests/kanban.test.ts` | kanban 数据操作单元测试 |
| `user/stones/supervisor/traits/session-kanban/readme.md` | session-kanban trait 定义 |
| `user/stones/supervisor/traits/session-kanban/index.ts` | session-kanban trait method 注册 |
| `kernel/traits/kernel/issue-discussion/TRAIT.md` | issue-discussion kernel trait 定义 |
| `kernel/traits/kernel/issue-discussion/index.ts` | issue-discussion trait method 注册 |
| `kernel/web/src/features/SessionKanban.tsx` | Kanban 主视图组件 |
| `kernel/web/src/features/IssueDetailView.tsx` | Issue 详情页组件 |
| `kernel/web/src/features/TaskDetailView.tsx` | Task 详情页组件 |
| `kernel/web/src/features/kanban/IssueCard.tsx` | Issue 卡片组件 |
| `kernel/web/src/features/kanban/TaskCard.tsx` | Task 卡片组件 |
| `kernel/web/src/features/kanban/StatusGroup.tsx` | 状态分组容器组件 |
| `kernel/web/src/features/kanban/CommentTimeline.tsx` | 评论时间线组件 |
| `kernel/web/src/api/kanban.ts` | Kanban 相关 API 调用函数 |

### 修改文件

| 文件 | 改动 |
|------|------|
| `kernel/src/world/session.ts` | Session 类新增 `serializedWrite()` 方法 |
| `kernel/src/server/server.ts` | 新增评论和 ack 路由 |
| `kernel/web/src/router/registrations.tsx` | 移除 SessionGantt 注册，新增 Kanban/IssueDetail/TaskDetail 注册 |
| `kernel/web/src/api/types.ts` | 新增 Issue/Task/Comment 前端类型 |

---

## Chunk 1: 数据层 — 类型、存储、并发控制

### Task 1: 类型定义

**Files:**
- Create: `kernel/src/kanban/types.ts`

- [ ] **Step 1: 创建 kanban 类型文件**

```typescript
// kernel/src/kanban/types.ts
// Session Kanban 数据类型定义

export type IssueStatus =
  | "discussing" | "designing" | "reviewing"
  | "executing" | "confirming" | "done" | "closed";

export type TaskStatus = "running" | "done" | "closed";

export type SubTaskStatus = "pending" | "running" | "done";

export interface Comment {
  id: string;
  author: string;
  content: string;
  mentions?: string[];
  createdAt: string;
}

export interface Issue {
  id: string;
  title: string;
  status: IssueStatus;
  description?: string;
  participants: string[];
  taskRefs: string[];
  reportPages: string[];
  hasNewInfo: boolean;
  comments: Comment[];
  createdAt: string;
  updatedAt: string;
}

export interface SubTask {
  id: string;
  title: string;
  assignee?: string;
  status: SubTaskStatus;
}

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  description?: string;
  issueRefs: string[];
  reportPages: string[];
  subtasks: SubTask[];
  hasNewInfo: boolean;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add kernel/src/kanban/types.ts
git commit -m "feat(kanban): add Issue/Task/Comment type definitions"
```

### Task 2: Session 并发写入队列

**Files:**
- Modify: `kernel/src/world/session.ts`

- [ ] **Step 1: 在 Session 类中新增 serializedWrite 方法**

在 `kernel/src/world/session.ts` 的 `Session` 类中添加：

```typescript
// 字段声明（在 class 顶部）
private _fileWriteQueue = new Map<string, Promise<void>>();

// 方法（在 class 内部）
/** 串行化文件写入，确保同一文件的读-改-写是原子的 */
async serializedWrite(filePath: string, fn: () => Promise<void>): Promise<void> {
  const prev = this._fileWriteQueue.get(filePath) ?? Promise.resolve();
  const next = prev.then(fn, fn); // 即使前一个失败也继续
  this._fileWriteQueue.set(filePath, next);
  return next;
}
```

- [ ] **Step 2: 运行测试确认无回归**

```bash
bun test tests/world.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add kernel/src/world/session.ts
git commit -m "feat(session): add serializedWrite for concurrent file access"
```

### Task 3: Kanban 数据存储层

**Files:**
- Create: `kernel/src/kanban/store.ts`

- [ ] **Step 1: 创建 store 模块**

```typescript
// kernel/src/kanban/store.ts
// issues.json / tasks.json 的读写操作

import type { Issue, Task } from "./types";

const ISSUES_FILE = "issues.json";
const TASKS_FILE = "tasks.json";

/** 读取 issues.json，不存在则返回空数组 */
export async function readIssues(sessionDir: string): Promise<Issue[]> {
  const path = `${sessionDir}/${ISSUES_FILE}`;
  try {
    const file = Bun.file(path);
    if (!(await file.exists())) return [];
    return JSON.parse(await file.text()) as Issue[];
  } catch {
    return [];
  }
}

/** 写入 issues.json */
export async function writeIssues(sessionDir: string, issues: Issue[]): Promise<void> {
  await Bun.write(`${sessionDir}/${ISSUES_FILE}`, JSON.stringify(issues, null, 2));
}

/** 读取 tasks.json，不存在则返回空数组 */
export async function readTasks(sessionDir: string): Promise<Task[]> {
  const path = `${sessionDir}/${TASKS_FILE}`;
  try {
    const file = Bun.file(path);
    if (!(await file.exists())) return [];
    return JSON.parse(await file.text()) as Task[];
  } catch {
    return [];
  }
}

/** 写入 tasks.json */
export async function writeTasks(sessionDir: string, tasks: Task[]): Promise<void> {
  await Bun.write(`${sessionDir}/${TASKS_FILE}`, JSON.stringify(tasks, null, 2));
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
```

- [ ] **Step 2: Commit**

```bash
git add kernel/src/kanban/store.ts
git commit -m "feat(kanban): add store layer for issues.json/tasks.json read/write"
```

### Task 4: 数据层单元测试

**Files:**
- Create: `kernel/tests/kanban.test.ts`

- [ ] **Step 1: 编写 store 读写测试**

```typescript
// kernel/tests/kanban.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync } from "fs";
import {
  readIssues, writeIssues, readTasks, writeTasks, nextId, now,
} from "../src/kanban/store";
import type { Issue, Task } from "../src/kanban/types";

const TEST_DIR = "/tmp/ooc-kanban-test";

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("kanban store", () => {
  test("readIssues returns empty array when file missing", async () => {
    const issues = await readIssues(TEST_DIR);
    expect(issues).toEqual([]);
  });

  test("writeIssues then readIssues roundtrip", async () => {
    const issue: Issue = {
      id: "issue-001", title: "Test", status: "discussing",
      participants: [], taskRefs: [], reportPages: [],
      hasNewInfo: false, comments: [],
      createdAt: now(), updatedAt: now(),
    };
    await writeIssues(TEST_DIR, [issue]);
    const result = await readIssues(TEST_DIR);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("issue-001");
  });

  test("readTasks returns empty array when file missing", async () => {
    const tasks = await readTasks(TEST_DIR);
    expect(tasks).toEqual([]);
  });

  test("writeTasks then readTasks roundtrip", async () => {
    const task: Task = {
      id: "task-001", title: "Test", status: "running",
      issueRefs: [], reportPages: [], subtasks: [],
      hasNewInfo: false,
      createdAt: now(), updatedAt: now(),
    };
    await writeTasks(TEST_DIR, [task]);
    const result = await readTasks(TEST_DIR);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("task-001");
  });

  test("nextId generates sequential IDs", () => {
    expect(nextId("issue", [])).toBe("issue-001");
    expect(nextId("issue", [{ id: "issue-003" }])).toBe("issue-004");
    expect(nextId("task", [{ id: "task-001" }, { id: "task-002" }])).toBe("task-003");
  });
});
```

- [ ] **Step 2: 运行测试确认通过**

```bash
bun test tests/kanban.test.ts
```

Expected: 5 pass, 0 fail

- [ ] **Step 3: Commit**

```bash
git add kernel/tests/kanban.test.ts
git commit -m "test(kanban): add store layer unit tests"
```

---

## Chunk 2: Trait 层 — session-kanban + issue-discussion

### Task 5: session-kanban trait method 实现

**Files:**
- Create: `kernel/src/kanban/methods.ts`

- [ ] **Step 1: 实现 session-kanban 的所有 method 函数**

```typescript
// kernel/src/kanban/methods.ts
// session-kanban trait 的 method 实现

import type { Issue, Task, IssueStatus, TaskStatus, SubTask } from "./types";
import { readIssues, writeIssues, readTasks, writeTasks, nextId, now } from "./store";

// --- Issue 操作 ---

export async function createIssue(
  sessionDir: string,
  title: string,
  description?: string,
  participants?: string[],
): Promise<Issue> {
  const issues = await readIssues(sessionDir);
  const issue: Issue = {
    id: nextId("issue", issues),
    title,
    status: "discussing",
    description,
    participants: participants ?? [],
    taskRefs: [],
    reportPages: [],
    hasNewInfo: false,
    comments: [],
    createdAt: now(),
    updatedAt: now(),
  };
  issues.push(issue);
  await writeIssues(sessionDir, issues);
  return issue;
}

export async function updateIssueStatus(
  sessionDir: string,
  issueId: string,
  status: IssueStatus,
): Promise<void> {
  const issues = await readIssues(sessionDir);
  const issue = issues.find((i) => i.id === issueId);
  if (!issue) throw new Error(`Issue ${issueId} not found`);
  issue.status = status;
  issue.updatedAt = now();
  await writeIssues(sessionDir, issues);
}

export async function updateIssue(
  sessionDir: string,
  issueId: string,
  fields: Partial<Pick<Issue, "title" | "description" | "participants" | "taskRefs" | "reportPages">>,
): Promise<void> {
  const issues = await readIssues(sessionDir);
  const issue = issues.find((i) => i.id === issueId);
  if (!issue) throw new Error(`Issue ${issueId} not found`);
  Object.assign(issue, fields);
  issue.updatedAt = now();
  await writeIssues(sessionDir, issues);
}

export async function setIssueNewInfo(
  sessionDir: string,
  issueId: string,
  hasNewInfo: boolean,
): Promise<void> {
  const issues = await readIssues(sessionDir);
  const issue = issues.find((i) => i.id === issueId);
  if (!issue) throw new Error(`Issue ${issueId} not found`);
  issue.hasNewInfo = hasNewInfo;
  issue.updatedAt = now();
  await writeIssues(sessionDir, issues);
}

export async function closeIssue(
  sessionDir: string,
  issueId: string,
): Promise<void> {
  return updateIssueStatus(sessionDir, issueId, "closed");
}

// --- Task 操作 ---

export async function createTask(
  sessionDir: string,
  title: string,
  description?: string,
  issueRefs?: string[],
): Promise<Task> {
  const tasks = await readTasks(sessionDir);
  const task: Task = {
    id: nextId("task", tasks),
    title,
    status: "running",
    description,
    issueRefs: issueRefs ?? [],
    reportPages: [],
    subtasks: [],
    hasNewInfo: false,
    createdAt: now(),
    updatedAt: now(),
  };
  tasks.push(task);
  await writeTasks(sessionDir, tasks);
  return task;
}

export async function updateTaskStatus(
  sessionDir: string,
  taskId: string,
  status: TaskStatus,
): Promise<void> {
  const tasks = await readTasks(sessionDir);
  const task = tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  task.status = status;
  task.updatedAt = now();
  await writeTasks(sessionDir, tasks);
}

export async function updateTask(
  sessionDir: string,
  taskId: string,
  fields: Partial<Pick<Task, "title" | "description" | "issueRefs" | "reportPages">>,
): Promise<void> {
  const tasks = await readTasks(sessionDir);
  const task = tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  Object.assign(task, fields);
  task.updatedAt = now();
  await writeTasks(sessionDir, tasks);
}

export async function createSubTask(
  sessionDir: string,
  taskId: string,
  title: string,
  assignee?: string,
): Promise<SubTask> {
  const tasks = await readTasks(sessionDir);
  const task = tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  const subtask: SubTask = {
    id: nextId("sub", task.subtasks),
    title,
    assignee,
    status: "pending",
  };
  task.subtasks.push(subtask);
  task.updatedAt = now();
  await writeTasks(sessionDir, tasks);
  return subtask;
}

export async function updateSubTask(
  sessionDir: string,
  taskId: string,
  subTaskId: string,
  fields: Partial<Pick<SubTask, "title" | "assignee" | "status">>,
): Promise<void> {
  const tasks = await readTasks(sessionDir);
  const task = tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  const sub = task.subtasks.find((s) => s.id === subTaskId);
  if (!sub) throw new Error(`SubTask ${subTaskId} not found in ${taskId}`);
  Object.assign(sub, fields);
  task.updatedAt = now();
  await writeTasks(sessionDir, tasks);
}

export async function setTaskNewInfo(
  sessionDir: string,
  taskId: string,
  hasNewInfo: boolean,
): Promise<void> {
  const tasks = await readTasks(sessionDir);
  const task = tasks.find((t) => t.id === taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  task.hasNewInfo = hasNewInfo;
  task.updatedAt = now();
  await writeTasks(sessionDir, tasks);
}
```

- [ ] **Step 2: Commit**

```bash
git add kernel/src/kanban/methods.ts
git commit -m "feat(kanban): implement session-kanban trait method functions"
```

### Task 6: issue-discussion method 实现

**Files:**
- Create: `kernel/src/kanban/discussion.ts`

- [ ] **Step 1: 实现 issue-discussion 的 method 函数**

```typescript
// kernel/src/kanban/discussion.ts
// issue-discussion trait 的 method 实现

import type { Issue, Comment } from "./types";
import { readIssues, writeIssues, nextId, now } from "./store";

/** 发表评论并返回被 @的对象列表（供调用方投递消息） */
export async function commentOnIssue(
  sessionDir: string,
  issueId: string,
  author: string,
  content: string,
  mentions?: string[],
): Promise<{ comment: Comment; mentionTargets: string[] }> {
  const issues = await readIssues(sessionDir);
  const issue = issues.find((i) => i.id === issueId);
  if (!issue) throw new Error(`Issue ${issueId} not found`);

  const comment: Comment = {
    id: nextId("comment", issue.comments),
    author,
    content,
    mentions,
    createdAt: now(),
  };
  issue.comments.push(comment);
  issue.updatedAt = now();

  // 将评论者加入 participants（去重）
  if (!issue.participants.includes(author) && author !== "user") {
    issue.participants.push(author);
  }

  await writeIssues(sessionDir, issues);

  // 返回需要通知的对象（排除评论者自己）
  const mentionTargets = (mentions ?? []).filter((m) => m !== author);
  return { comment, mentionTargets };
}

/** 读取 issue 的评论列表 */
export async function listIssueComments(
  sessionDir: string,
  issueId: string,
): Promise<Comment[]> {
  const issues = await readIssues(sessionDir);
  const issue = issues.find((i) => i.id === issueId);
  if (!issue) throw new Error(`Issue ${issueId} not found`);
  return issue.comments;
}

/** 读取 issue 详情 */
export async function getIssue(
  sessionDir: string,
  issueId: string,
): Promise<Issue> {
  const issues = await readIssues(sessionDir);
  const issue = issues.find((i) => i.id === issueId);
  if (!issue) throw new Error(`Issue ${issueId} not found`);
  return issue;
}
```

- [ ] **Step 2: Commit**

```bash
git add kernel/src/kanban/discussion.ts
git commit -m "feat(kanban): implement issue-discussion trait method functions"
```

### Task 7: Trait method 单元测试

**Files:**
- Modify: `kernel/tests/kanban.test.ts`

- [ ] **Step 1: 追加 methods 和 discussion 测试**

在 `kernel/tests/kanban.test.ts` 末尾追加：

```typescript
import {
  createIssue, updateIssueStatus, createTask,
  createSubTask, updateSubTask, setIssueNewInfo,
} from "../src/kanban/methods";
import { commentOnIssue, listIssueComments, getIssue } from "../src/kanban/discussion";

describe("kanban methods", () => {
  test("createIssue creates with default status", async () => {
    const issue = await createIssue(TEST_DIR, "Test Issue", "desc", ["alice"]);
    expect(issue.id).toBe("issue-001");
    expect(issue.status).toBe("discussing");
    expect(issue.participants).toEqual(["alice"]);
  });

  test("updateIssueStatus changes status", async () => {
    await createIssue(TEST_DIR, "Test");
    await updateIssueStatus(TEST_DIR, "issue-001", "executing");
    const issues = await readIssues(TEST_DIR);
    expect(issues[0].status).toBe("executing");
  });

  test("createTask with issueRefs", async () => {
    const task = await createTask(TEST_DIR, "Impl", "desc", ["issue-001"]);
    expect(task.id).toBe("task-001");
    expect(task.status).toBe("running");
    expect(task.issueRefs).toEqual(["issue-001"]);
  });

  test("createSubTask and updateSubTask", async () => {
    await createTask(TEST_DIR, "Parent");
    const sub = await createSubTask(TEST_DIR, "task-001", "Child", "bob");
    expect(sub.status).toBe("pending");
    expect(sub.assignee).toBe("bob");

    await updateSubTask(TEST_DIR, "task-001", sub.id, { status: "done" });
    const tasks = await readTasks(TEST_DIR);
    expect(tasks[0].subtasks[0].status).toBe("done");
  });

  test("setIssueNewInfo toggles flag", async () => {
    await createIssue(TEST_DIR, "Test");
    await setIssueNewInfo(TEST_DIR, "issue-001", true);
    let issues = await readIssues(TEST_DIR);
    expect(issues[0].hasNewInfo).toBe(true);

    await setIssueNewInfo(TEST_DIR, "issue-001", false);
    issues = await readIssues(TEST_DIR);
    expect(issues[0].hasNewInfo).toBe(false);
  });
});

describe("issue discussion", () => {
  test("commentOnIssue adds comment and returns mentionTargets", async () => {
    await createIssue(TEST_DIR, "Test");
    const { comment, mentionTargets } = await commentOnIssue(
      TEST_DIR, "issue-001", "alice", "I think...", ["bob", "alice"],
    );
    expect(comment.author).toBe("alice");
    expect(mentionTargets).toEqual(["bob"]); // alice excluded

    const comments = await listIssueComments(TEST_DIR, "issue-001");
    expect(comments).toHaveLength(1);
  });

  test("commentOnIssue adds author to participants", async () => {
    await createIssue(TEST_DIR, "Test");
    await commentOnIssue(TEST_DIR, "issue-001", "charlie", "Hello");
    const issue = await getIssue(TEST_DIR, "issue-001");
    expect(issue.participants).toContain("charlie");
  });

  test("getIssue throws for missing issue", async () => {
    expect(getIssue(TEST_DIR, "nope")).rejects.toThrow("not found");
  });
});
```

- [ ] **Step 2: 运行测试确认全部通过**

```bash
bun test tests/kanban.test.ts
```

Expected: 13 pass, 0 fail

- [ ] **Step 3: Commit**

```bash
git add kernel/tests/kanban.test.ts
git commit -m "test(kanban): add method and discussion unit tests"
```

### Task 8: session-kanban trait 定义文件

**Files:**
- Create: `user/stones/supervisor/traits/session-kanban/readme.md`
- Create: `user/stones/supervisor/traits/session-kanban/index.ts`

- [ ] **Step 1: 创建 trait readme.md**

```markdown
# session-kanban

Supervisor 专属 trait，提供 Session 级别的 Issue/Task 管理能力。

## 能力

- 创建、更新、关闭 Issue（需求/问题讨论）
- 创建、更新 Task（执行单元）及其 SubTask
- 标记 hasNewInfo（需要人类确认的新信息）

## 使用方式

在 `[program]` 中直接调用 method：

```javascript
// 创建 issue
const issue = await createIssue("API 设计方案", "需要讨论 REST vs GraphQL", ["kernel", "sophia"]);

// 更新状态
await updateIssueStatus("issue-001", "executing");

// 创建 task 并关联 issue
const task = await createTask("实现 REST API", "按方案实现", ["issue-001"]);

// 创建子任务并分配
await createSubTask("task-001", "实现用户端点", "kernel");

// 标记需要人类确认
await setIssueNewInfo("issue-001", true);
```
```

- [ ] **Step 2: 创建 trait index.ts**

```typescript
// user/stones/supervisor/traits/session-kanban/index.ts
// session-kanban trait method 注册

import type { MethodContext } from "../../../../kernel/src/trait/registry";
import * as methods from "../../../../kernel/src/kanban/methods";

export default function register() {
  return [
    {
      name: "createIssue",
      description: "创建 Issue",
      params: ["title", "description?", "participants?"],
      fn: (ctx: MethodContext, title: string, description?: string, participants?: string[]) =>
        methods.createIssue(ctx.filesDir + "/../..", title, description, participants),
    },
    {
      name: "updateIssueStatus",
      description: "更新 Issue 状态",
      params: ["issueId", "status"],
      fn: (ctx: MethodContext, issueId: string, status: string) =>
        methods.updateIssueStatus(ctx.filesDir + "/../..", issueId, status as any),
    },
    {
      name: "updateIssue",
      description: "更新 Issue 字段",
      params: ["issueId", "fields"],
      fn: (ctx: MethodContext, issueId: string, fields: Record<string, unknown>) =>
        methods.updateIssue(ctx.filesDir + "/../..", issueId, fields as any),
    },
    {
      name: "setIssueNewInfo",
      description: "标记 Issue 是否有需要人类确认的新信息",
      params: ["issueId", "hasNewInfo"],
      fn: (ctx: MethodContext, issueId: string, hasNewInfo: boolean) =>
        methods.setIssueNewInfo(ctx.filesDir + "/../..", issueId, hasNewInfo),
    },
    {
      name: "closeIssue",
      description: "关闭 Issue",
      params: ["issueId"],
      fn: (ctx: MethodContext, issueId: string) =>
        methods.closeIssue(ctx.filesDir + "/../..", issueId),
    },
    {
      name: "createTask",
      description: "创建 Task",
      params: ["title", "description?", "issueRefs?"],
      fn: (ctx: MethodContext, title: string, description?: string, issueRefs?: string[]) =>
        methods.createTask(ctx.filesDir + "/../..", title, description, issueRefs),
    },
    {
      name: "updateTaskStatus",
      description: "更新 Task 状态",
      params: ["taskId", "status"],
      fn: (ctx: MethodContext, taskId: string, status: string) =>
        methods.updateTaskStatus(ctx.filesDir + "/../..", taskId, status as any),
    },
    {
      name: "updateTask",
      description: "更新 Task 字段",
      params: ["taskId", "fields"],
      fn: (ctx: MethodContext, taskId: string, fields: Record<string, unknown>) =>
        methods.updateTask(ctx.filesDir + "/../..", taskId, fields as any),
    },
    {
      name: "createSubTask",
      description: "创建子任务",
      params: ["taskId", "title", "assignee?"],
      fn: (ctx: MethodContext, taskId: string, title: string, assignee?: string) =>
        methods.createSubTask(ctx.filesDir + "/../..", taskId, title, assignee),
    },
    {
      name: "updateSubTask",
      description: "更新子任务",
      params: ["taskId", "subTaskId", "fields"],
      fn: (ctx: MethodContext, taskId: string, subTaskId: string, fields: Record<string, unknown>) =>
        methods.updateSubTask(ctx.filesDir + "/../..", taskId, subTaskId, fields as any),
    },
    {
      name: "setTaskNewInfo",
      description: "标记 Task 是否有需要人类确认的新信息",
      params: ["taskId", "hasNewInfo"],
      fn: (ctx: MethodContext, taskId: string, hasNewInfo: boolean) =>
        methods.setTaskNewInfo(ctx.filesDir + "/../..", taskId, hasNewInfo),
    },
  ];
}
```

注意：`ctx.filesDir + "/../.."` 用于从 flow 的 files 目录回溯到 session 根目录。实现时需要确认 `MethodContext` 中是否有更直接的 session 目录路径（如 `ctx.rootDir`），如果有则优先使用。

- [ ] **Step 3: Commit**

```bash
git add user/stones/supervisor/traits/session-kanban/
git commit -m "feat(kanban): add session-kanban trait definition for supervisor"
```

### Task 9: issue-discussion kernel trait 定义

**Files:**
- Create: `kernel/traits/kernel/issue-discussion/TRAIT.md`
- Create: `kernel/traits/kernel/issue-discussion/index.ts`

- [ ] **Step 1: 创建 TRAIT.md**

```yaml
---
namespace: kernel
name: issue-discussion
type: how_to_think
version: 1.0.0
when: always
description: Issue 讨论能力，所有对象可通过此 trait 参与 issue 评论
deps: []
---
```

后接 markdown 文档：

```markdown
# Issue 讨论

你可以参与 Session 中的 Issue 讨论。

## 可用方法

- `commentOnIssue(issueId, content, mentions?)` — 发表评论，可 @其他对象
- `listIssueComments(issueId)` — 读取评论列表
- `getIssue(issueId)` — 读取 issue 详情

## 讨论原则

- 收到 issue 讨论邀请时，先用 `getIssue()` 阅读 issue 描述和已有评论
- 发表评论要有明确立场和论据，不要空泛回复
- 如果需要其他对象的意见，在 mentions 中 @他们
```

- [ ] **Step 2: 创建 index.ts**

```typescript
// kernel/traits/kernel/issue-discussion/index.ts
import type { MethodContext } from "../../../src/trait/registry";
import * as discussion from "../../../src/kanban/discussion";

export default function register() {
  return [
    {
      name: "commentOnIssue",
      description: "在 Issue 下发表评论",
      params: ["issueId", "content", "mentions?"],
      fn: async (ctx: MethodContext, issueId: string, content: string, mentions?: string[]) => {
        const sessionDir = ctx.filesDir + "/../..";
        const { comment, mentionTargets } = await discussion.commentOnIssue(
          sessionDir, issueId, ctx.stoneName, content, mentions,
        );
        // 返回结果供 ThinkLoop 处理消息投递
        return { comment, mentionTargets };
      },
    },
    {
      name: "listIssueComments",
      description: "读取 Issue 的评论列表",
      params: ["issueId"],
      fn: (ctx: MethodContext, issueId: string) =>
        discussion.listIssueComments(ctx.filesDir + "/../..", issueId),
    },
    {
      name: "getIssue",
      description: "读取 Issue 详情",
      params: ["issueId"],
      fn: (ctx: MethodContext, issueId: string) =>
        discussion.getIssue(ctx.filesDir + "/../..", issueId),
    },
  ];
}
```

- [ ] **Step 3: Commit**

```bash
git add kernel/traits/kernel/issue-discussion/
git commit -m "feat(kanban): add issue-discussion kernel trait"
```

---

## Chunk 3: 后端 API — 用户评论 + ack 端点

### Task 10: 后端路由

**Files:**
- Modify: `kernel/src/server/server.ts`

- [ ] **Step 1: 新增用户评论路由**

在 `kernel/src/server/server.ts` 的 `handleRoute` 函数中，找到现有路由区域，添加：

```typescript
// POST /api/sessions/:sessionId/issues/:issueId/comments — 用户评论
const issueCommentMatch = path.match(/^\/api\/sessions\/([^/]+)\/issues\/([^/]+)\/comments$/);
if (method === "POST" && issueCommentMatch) {
  const [, sessionId, issueId] = issueCommentMatch;
  const body = (await req.json()) as { content: string; mentions?: string[] };
  if (!body.content) return errorResponse("content is required");

  const session = world.getSession(sessionId!);
  if (!session) return errorResponse("Session not found", 404);

  const sessionDir = `${world.rootDir}/flows/${sessionId}`;
  const { commentOnIssue } = await import("../kanban/discussion");

  let result: Awaited<ReturnType<typeof commentOnIssue>>;
  await session.serializedWrite(`${sessionDir}/issues.json`, async () => {
    result = await commentOnIssue(sessionDir, issueId!, "user", body.content, body.mentions);
  });

  // 投递消息给被 @的对象
  for (const target of result!.mentionTargets) {
    world.deliverMessage(sessionId!, target, {
      from: "user",
      content: `issue-${issueId} 下有一条来自用户的新评论，请阅读并参与讨论`,
    });
  }

  return json({ success: true, data: result!.comment });
}
```

- [ ] **Step 2: 新增 issue ack 路由**

```typescript
// POST /api/sessions/:sessionId/issues/:issueId/ack — 清除 hasNewInfo
const issueAckMatch = path.match(/^\/api\/sessions\/([^/]+)\/issues\/([^/]+)\/ack$/);
if (method === "POST" && issueAckMatch) {
  const [, sessionId, issueId] = issueAckMatch;
  const sessionDir = `${world.rootDir}/flows/${sessionId}`;
  const session = world.getSession(sessionId!);

  const { setIssueNewInfo } = await import("../kanban/methods");
  if (session) {
    await session.serializedWrite(`${sessionDir}/issues.json`, async () => {
      await setIssueNewInfo(sessionDir, issueId!, false);
    });
  } else {
    await setIssueNewInfo(sessionDir, issueId!, false);
  }
  return json({ success: true });
}
```

- [ ] **Step 3: 新增 task ack 路由**

```typescript
// POST /api/sessions/:sessionId/tasks/:taskItemId/ack — 清除 hasNewInfo
const taskAckMatch = path.match(/^\/api\/sessions\/([^/]+)\/tasks\/([^/]+)\/ack$/);
if (method === "POST" && taskAckMatch) {
  const [, sessionId, taskItemId] = taskAckMatch;
  const sessionDir = `${world.rootDir}/flows/${sessionId}`;
  const session = world.getSession(sessionId!);

  const { setTaskNewInfo } = await import("../kanban/methods");
  if (session) {
    await session.serializedWrite(`${sessionDir}/tasks.json`, async () => {
      await setTaskNewInfo(sessionDir, taskItemId!, false);
    });
  } else {
    await setTaskNewInfo(sessionDir, taskItemId!, false);
  }
  return json({ success: true });
}
```

- [ ] **Step 4: 确认 world.getSession 和 world.deliverMessage 方法存在**

检查 `kernel/src/world/world.ts`，确认：
- `getSession(sessionId)` 返回 `Session | undefined`（如果不存在需要添加）
- `deliverMessage(sessionId, target, message)` 可以投递消息（如果不存在，使用现有的 router 机制）

如果方法不存在，需要在 World 类中添加简单的代理方法。

- [ ] **Step 5: 运行测试确认无回归**

```bash
bun test
```

- [ ] **Step 6: Commit**

```bash
git add kernel/src/server/server.ts kernel/src/world/world.ts
git commit -m "feat(kanban): add user comment and ack API endpoints"
```

---

## Chunk 4: 前端 — 类型、API、视图注册、Kanban 主视图

### Task 11: 前端类型和 API 函数

**Files:**
- Modify: `kernel/web/src/api/types.ts`
- Create: `kernel/web/src/api/kanban.ts`

- [ ] **Step 1: 在 types.ts 末尾追加 kanban 类型**

```typescript
// --- Session Kanban ---

export type IssueStatus =
  | "discussing" | "designing" | "reviewing"
  | "executing" | "confirming" | "done" | "closed";

export type TaskStatus = "running" | "done" | "closed";

export interface KanbanComment {
  id: string;
  author: string;
  content: string;
  mentions?: string[];
  createdAt: string;
}

export interface KanbanIssue {
  id: string;
  title: string;
  status: IssueStatus;
  description?: string;
  participants: string[];
  taskRefs: string[];
  reportPages: string[];
  hasNewInfo: boolean;
  comments: KanbanComment[];
  createdAt: string;
  updatedAt: string;
}

export interface KanbanSubTask {
  id: string;
  title: string;
  assignee?: string;
  status: "pending" | "running" | "done";
}

export interface KanbanTask {
  id: string;
  title: string;
  status: TaskStatus;
  description?: string;
  issueRefs: string[];
  reportPages: string[];
  subtasks: KanbanSubTask[];
  hasNewInfo: boolean;
  createdAt: string;
  updatedAt: string;
}
```

- [ ] **Step 2: 创建 kanban API 函数**

```typescript
// kernel/web/src/api/kanban.ts
// Kanban 相关 API 调用

import { fetchFileContent } from "./client";
import type { KanbanIssue, KanbanTask } from "./types";

const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

/** 读取 session 的 issues.json */
export async function fetchIssues(sessionId: string): Promise<KanbanIssue[]> {
  try {
    const content = await fetchFileContent(`flows/${sessionId}/issues.json`);
    return JSON.parse(content) as KanbanIssue[];
  } catch {
    return [];
  }
}

/** 读取 session 的 tasks.json */
export async function fetchTasks(sessionId: string): Promise<KanbanTask[]> {
  try {
    const content = await fetchFileContent(`flows/${sessionId}/tasks.json`);
    return JSON.parse(content) as KanbanTask[];
  } catch {
    return [];
  }
}

/** 读取 session 的 readme.md */
export async function fetchSessionReadme(sessionId: string): Promise<string> {
  try {
    return await fetchFileContent(`flows/${sessionId}/readme.md`);
  } catch {
    return "";
  }
}

/** 用户发表评论 */
export async function postIssueComment(
  sessionId: string,
  issueId: string,
  content: string,
  mentions?: string[],
): Promise<void> {
  await fetch(`${API_BASE}/api/sessions/${sessionId}/issues/${issueId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, mentions }),
  });
}

/** 确认 issue 已读（清除 hasNewInfo） */
export async function ackIssue(sessionId: string, issueId: string): Promise<void> {
  await fetch(`${API_BASE}/api/sessions/${sessionId}/issues/${issueId}/ack`, {
    method: "POST",
  });
}

/** 确认 task 已读（清除 hasNewInfo） */
export async function ackTask(sessionId: string, taskId: string): Promise<void> {
  await fetch(`${API_BASE}/api/sessions/${sessionId}/tasks/${taskId}/ack`, {
    method: "POST",
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add kernel/web/src/api/types.ts kernel/web/src/api/kanban.ts
git commit -m "feat(kanban): add frontend types and API functions"
```

### Task 12: 视图注册 — 替换 SessionGantt

**Files:**
- Modify: `kernel/web/src/router/registrations.tsx`

- [ ] **Step 1: 移除 SessionGantt 注册，新增三个 kanban 视图注册**

在 `registrations.tsx` 中：

1. 移除 SessionGantt 的 `viewRegistry.register(...)` 调用
2. 添加以下注册（在 `registerAllViews()` 函数内）：

```typescript
import SessionKanban from "../features/SessionKanban";
import IssueDetailView from "../features/IssueDetailView";
import TaskDetailView from "../features/TaskDetailView";

// Session Kanban — 替换 SessionGantt
function SessionKanbanAdapter({ path }: ViewProps) {
  const sessionId = path.match(/^flows\/([^/]+)$/)?.[1] ?? "";
  return <SessionKanban sessionId={sessionId} />;
}

viewRegistry.register({
  name: "SessionKanban",
  component: SessionKanbanAdapter,
  match: (p) => /^flows\/[^/]+$/.test(p),
  priority: 120,
  tabKey: (p) => p,
  tabLabel: () => "Kanban",
});

// Issue 详情页
function IssueDetailAdapter({ path }: ViewProps) {
  const m = path.match(/^flows\/([^/]+)\/issues\/([^/]+)$/);
  return <IssueDetailView sessionId={m?.[1] ?? ""} issueId={m?.[2] ?? ""} />;
}

viewRegistry.register({
  name: "IssueDetail",
  component: IssueDetailAdapter,
  match: (p) => /^flows\/[^/]+\/issues\/[^/]+$/.test(p),
  priority: 130,
  tabKey: (p) => p,
  tabLabel: (p) => {
    const id = p.match(/issues\/([^/]+)$/)?.[1] ?? "Issue";
    return id;
  },
});

// Task 详情页
function TaskDetailAdapter({ path }: ViewProps) {
  const m = path.match(/^flows\/([^/]+)\/tasks\/([^/]+)$/);
  return <TaskDetailView sessionId={m?.[1] ?? ""} taskId={m?.[2] ?? ""} />;
}

viewRegistry.register({
  name: "TaskDetail",
  component: TaskDetailAdapter,
  match: (p) => /^flows\/[^/]+\/tasks\/[^/]+$/.test(p),
  priority: 130,
  tabKey: (p) => p,
  tabLabel: (p) => {
    const id = p.match(/tasks\/([^/]+)$/)?.[1] ?? "Task";
    return id;
  },
});
```

- [ ] **Step 2: 创建占位组件（确保编译通过）**

创建三个最小占位组件：

```typescript
// kernel/web/src/features/SessionKanban.tsx
export default function SessionKanban({ sessionId }: { sessionId: string }) {
  return <div className="p-4">Kanban: {sessionId}</div>;
}
```

```typescript
// kernel/web/src/features/IssueDetailView.tsx
export default function IssueDetailView({ sessionId, issueId }: { sessionId: string; issueId: string }) {
  return <div className="p-4">Issue: {issueId}</div>;
}
```

```typescript
// kernel/web/src/features/TaskDetailView.tsx
export default function TaskDetailView({ sessionId, taskId }: { sessionId: string; taskId: string }) {
  return <div className="p-4">Task: {taskId}</div>;
}
```

- [ ] **Step 3: 确认前端编译通过**

```bash
cd kernel/web && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add kernel/web/src/router/registrations.tsx kernel/web/src/features/SessionKanban.tsx kernel/web/src/features/IssueDetailView.tsx kernel/web/src/features/TaskDetailView.tsx
git commit -m "feat(kanban): register kanban views, replace SessionGantt"
```

### Task 13: Kanban 主视图实现

**Files:**
- Modify: `kernel/web/src/features/SessionKanban.tsx`
- Create: `kernel/web/src/features/kanban/StatusGroup.tsx`
- Create: `kernel/web/src/features/kanban/IssueCard.tsx`
- Create: `kernel/web/src/features/kanban/TaskCard.tsx`

- [ ] **Step 1: 创建 StatusGroup 组件**

```tsx
// kernel/web/src/features/kanban/StatusGroup.tsx
// 状态分组容器

interface StatusGroupProps {
  label: string;
  color: string;
  count: number;
  children: React.ReactNode;
}

export default function StatusGroup({ label, color, count, children }: StatusGroupProps) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">({count})</span>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 IssueCard 组件**

```tsx
// kernel/web/src/features/kanban/IssueCard.tsx
import type { KanbanIssue, IssueStatus } from "../../api/types";

const STATUS_COLORS: Record<IssueStatus, string> = {
  discussing: "#3b82f6",
  designing: "#a855f7",
  reviewing: "#f97316",
  executing: "#f59e0b",
  confirming: "#06b6d4",
  done: "#22c55e",
  closed: "#6b7280",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface IssueCardProps {
  issue: KanbanIssue;
  onClick: () => void;
}

export default function IssueCard({ issue, onClick }: IssueCardProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border border-border bg-card p-3 hover:bg-accent/50 transition-colors"
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-1.5 w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: STATUS_COLORS[issue.status] }}
        />
        <span className="text-sm font-medium leading-tight">{issue.title}</span>
      </div>
      <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
        <span>
          {issue.taskRefs.length > 0 && `${issue.taskRefs.length} tasks · `}
          {issue.participants.slice(0, 3).join(", ")}
        </span>
        <span className="flex items-center gap-1">
          {timeAgo(issue.updatedAt)}
          {issue.hasNewInfo && (
            <span className="w-2 h-2 rounded-full bg-red-500" />
          )}
        </span>
      </div>
    </button>
  );
}
```

- [ ] **Step 3: 创建 TaskCard 组件**

```tsx
// kernel/web/src/features/kanban/TaskCard.tsx
import type { KanbanTask, TaskStatus } from "../../api/types";

const STATUS_COLORS: Record<TaskStatus, string> = {
  running: "#f59e0b",
  done: "#22c55e",
  closed: "#6b7280",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface TaskCardProps {
  task: KanbanTask;
  onClick: () => void;
}

export default function TaskCard({ task, onClick }: TaskCardProps) {
  const done = task.subtasks.filter((s) => s.status === "done").length;
  const total = task.subtasks.length;

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border border-border bg-card p-3 hover:bg-accent/50 transition-colors"
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-1.5 w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: STATUS_COLORS[task.status] }}
        />
        <span className="text-sm font-medium leading-tight">{task.title}</span>
      </div>
      {total > 0 && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${(done / total) * 100}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground">{done}/{total}</span>
        </div>
      )}
      <div className="flex items-center justify-end mt-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          {timeAgo(task.updatedAt)}
          {task.hasNewInfo && (
            <span className="w-2 h-2 rounded-full bg-red-500" />
          )}
        </span>
      </div>
    </button>
  );
}
```

- [ ] **Step 4: 实现 SessionKanban 主视图**

```tsx
// kernel/web/src/features/SessionKanban.tsx
import { useEffect, useState, useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { lastFlowEventAtom, editorTabsAtom, activeFilePathAtom } from "../store/session";
import { fetchIssues, fetchTasks, fetchSessionReadme } from "../api/kanban";
import { viewRegistry } from "../router/registry";
import MarkdownContent from "../components/ui/MarkdownContent";
import StatusGroup from "./kanban/StatusGroup";
import IssueCard from "./kanban/IssueCard";
import TaskCard from "./kanban/TaskCard";
import type { KanbanIssue, KanbanTask, IssueStatus, TaskStatus } from "../api/types";

const ISSUE_GROUPS: { status: IssueStatus; label: string; color: string }[] = [
  { status: "discussing", label: "讨论中", color: "#3b82f6" },
  { status: "designing", label: "方案设计中", color: "#a855f7" },
  { status: "reviewing", label: "方案评审中", color: "#f97316" },
  { status: "executing", label: "方案执行中", color: "#f59e0b" },
  { status: "confirming", label: "执行结果确认中", color: "#06b6d4" },
  { status: "done", label: "已完成", color: "#22c55e" },
  { status: "closed", label: "已关闭", color: "#6b7280" },
];

const TASK_GROUPS: { status: TaskStatus; label: string; color: string }[] = [
  { status: "running", label: "执行中", color: "#f59e0b" },
  { status: "done", label: "已完成", color: "#22c55e" },
  { status: "closed", label: "已关闭", color: "#6b7280" },
];

export default function SessionKanban({ sessionId }: { sessionId: string }) {
  const [readme, setReadme] = useState("");
  const [issues, setIssues] = useState<KanbanIssue[]>([]);
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const lastEvent = useAtomValue(lastFlowEventAtom);
  const setTabs = useSetAtom(editorTabsAtom);
  const setActivePath = useSetAtom(activeFilePathAtom);

  const load = useCallback(async () => {
    const [r, i, t] = await Promise.all([
      fetchSessionReadme(sessionId),
      fetchIssues(sessionId),
      fetchTasks(sessionId),
    ]);
    setReadme(r);
    setIssues(i);
    setTasks(t);
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  // SSE 事件触发刷新
  useEffect(() => {
    if (lastEvent && "sessionId" in lastEvent && lastEvent.sessionId === sessionId) {
      load();
    }
  }, [lastEvent, sessionId, load]);

  const openTab = (path: string, label: string) => {
    setActivePath(path);
    setTabs((prev) => {
      if (prev.some((t) => t.path === path)) return prev;
      return [...prev, { path, label }];
    });
  };

  // hasNewInfo 的 issue 置顶
  const sortedIssues = [...issues].sort((a, b) => {
    if (a.hasNewInfo && !b.hasNewInfo) return -1;
    if (!a.hasNewInfo && b.hasNewInfo) return 1;
    return 0;
  });

  return (
    <div className="flex h-full overflow-hidden">
      {/* 左半屏：readme */}
      <div className="w-1/2 border-r border-border overflow-auto p-6">
        {readme ? (
          <MarkdownContent content={readme} />
        ) : (
          <p className="text-muted-foreground text-sm">Session 工作状态待更新...</p>
        )}
      </div>

      {/* 右半屏：Issues + Tasks 双列 */}
      <div className="w-1/2 flex overflow-hidden">
        {/* Issues 列 */}
        <div className="flex-1 border-r border-border overflow-auto p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Issues
          </h3>
          {ISSUE_GROUPS.map(({ status, label, color }) => {
            const items = sortedIssues.filter((i) => i.status === status);
            if (items.length === 0) return null;
            return (
              <StatusGroup key={status} label={label} color={color} count={items.length}>
                {items.map((issue) => (
                  <IssueCard
                    key={issue.id}
                    issue={issue}
                    onClick={() => openTab(
                      `flows/${sessionId}/issues/${issue.id}`,
                      issue.id,
                    )}
                  />
                ))}
              </StatusGroup>
            );
          })}
          {issues.length === 0 && (
            <p className="text-muted-foreground text-sm">暂无 Issue</p>
          )}
        </div>

        {/* Tasks 列 */}
        <div className="flex-1 overflow-auto p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Tasks
          </h3>
          {TASK_GROUPS.map(({ status, label, color }) => {
            const items = tasks.filter((t) => t.status === status);
            if (items.length === 0) return null;
            return (
              <StatusGroup key={status} label={label} color={color} count={items.length}>
                {items.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onClick={() => openTab(
                      `flows/${sessionId}/tasks/${task.id}`,
                      task.id,
                    )}
                  />
                ))}
              </StatusGroup>
            );
          })}
          {tasks.length === 0 && (
            <p className="text-muted-foreground text-sm">暂无 Task</p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add kernel/web/src/features/SessionKanban.tsx kernel/web/src/features/kanban/
git commit -m "feat(kanban): implement SessionKanban main view with cards"
```

---

## Chunk 5: 前端 — 详情页 + 评论组件

### Task 14: CommentTimeline 评论组件

**Files:**
- Create: `kernel/web/src/features/kanban/CommentTimeline.tsx`

- [ ] **Step 1: 实现评论时间线 + 输入框**

```tsx
// kernel/web/src/features/kanban/CommentTimeline.tsx
import { useState } from "react";
import MarkdownContent from "../../components/ui/MarkdownContent";
import type { KanbanComment } from "../../api/types";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface CommentTimelineProps {
  comments: KanbanComment[];
  onSubmit: (content: string) => Promise<void>;
}

export default function CommentTimeline({ comments, onSubmit }: CommentTimelineProps) {
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async () => {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await onSubmit(input.trim());
      setInput("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* 评论列表 */}
      <div className="flex-1 overflow-auto space-y-4 p-4">
        {comments.length === 0 && (
          <p className="text-muted-foreground text-sm">暂无评论</p>
        )}
        {comments.map((c) => (
          <div key={c.id} className="border-b border-border pb-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium">
                {c.author === "user" ? "你" : c.author}
              </span>
              <span className="text-xs text-muted-foreground">{timeAgo(c.createdAt)}</span>
            </div>
            <MarkdownContent content={c.content} className="text-sm" />
          </div>
        ))}
      </div>

      {/* 输入框 */}
      <div className="border-t border-border p-3 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSubmit()}
          placeholder="发表评论..."
          className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          disabled={sending}
        />
        <button
          onClick={handleSubmit}
          disabled={!input.trim() || sending}
          className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          发送
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add kernel/web/src/features/kanban/CommentTimeline.tsx
git commit -m "feat(kanban): add CommentTimeline component"
```

### Task 15: Issue 详情页实现

**Files:**
- Modify: `kernel/web/src/features/IssueDetailView.tsx`

- [ ] **Step 1: 实现 Issue 详情页**

```tsx
// kernel/web/src/features/IssueDetailView.tsx
import { useEffect, useState, useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { lastFlowEventAtom, editorTabsAtom, activeFilePathAtom } from "../store/session";
import { fetchIssues, ackIssue, postIssueComment } from "../api/kanban";
import MarkdownContent from "../components/ui/MarkdownContent";
import CommentTimeline from "./kanban/CommentTimeline";
import DynamicUI from "./DynamicUI";
import type { KanbanIssue, IssueStatus } from "../api/types";

const STATUS_LABELS: Record<IssueStatus, string> = {
  discussing: "讨论中",
  designing: "方案设计中",
  reviewing: "方案评审中",
  executing: "方案执行中",
  confirming: "执行结果确认中",
  done: "已完成",
  closed: "已关闭",
};

const STATUS_COLORS: Record<IssueStatus, string> = {
  discussing: "bg-blue-500",
  designing: "bg-purple-500",
  reviewing: "bg-orange-500",
  executing: "bg-amber-500",
  confirming: "bg-cyan-500",
  done: "bg-emerald-500",
  closed: "bg-gray-500",
};

type Tab = "description" | "comments" | "tasks" | "reports";

export default function IssueDetailView({
  sessionId,
  issueId,
}: {
  sessionId: string;
  issueId: string;
}) {
  const [issue, setIssue] = useState<KanbanIssue | null>(null);
  const [tab, setTab] = useState<Tab>("comments");
  const lastEvent = useAtomValue(lastFlowEventAtom);
  const setTabs = useSetAtom(editorTabsAtom);
  const setActivePath = useSetAtom(activeFilePathAtom);

  const load = useCallback(async () => {
    const issues = await fetchIssues(sessionId);
    const found = issues.find((i) => i.id === issueId);
    setIssue(found ?? null);
  }, [sessionId, issueId]);

  useEffect(() => { load(); }, [load]);

  // SSE 刷新
  useEffect(() => {
    if (lastEvent && "sessionId" in lastEvent && lastEvent.sessionId === sessionId) {
      load();
    }
  }, [lastEvent, sessionId, load]);

  // 自动 ack
  useEffect(() => {
    if (issue?.hasNewInfo) {
      ackIssue(sessionId, issueId);
    }
  }, [issue?.hasNewInfo, sessionId, issueId]);

  const openTab = (path: string, label: string) => {
    setActivePath(path);
    setTabs((prev) => {
      if (prev.some((t) => t.path === path)) return prev;
      return [...prev, { path, label }];
    });
  };

  if (!issue) {
    return <div className="p-6 text-muted-foreground">Issue 未找到</div>;
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: "description", label: "描述" },
    { key: "comments", label: `评论 (${issue.comments.length})` },
    { key: "tasks", label: `关联 Tasks (${issue.taskRefs.length})` },
    ...(issue.reportPages.length > 0
      ? [{ key: "reports" as Tab, label: `Reports (${issue.reportPages.length})` }]
      : []),
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{issue.title}</h2>
          <span className={`px-2 py-0.5 rounded-full text-xs text-white ${STATUS_COLORS[issue.status]}`}>
            {STATUS_LABELS[issue.status]}
          </span>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          参与者: {issue.participants.length > 0 ? issue.participants.join(", ") : "无"}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border px-6 flex gap-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`py-2 text-sm border-b-2 transition-colors ${
              tab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === "description" && (
          <div className="p-6 overflow-auto h-full">
            {issue.description ? (
              <MarkdownContent content={issue.description} />
            ) : (
              <p className="text-muted-foreground text-sm">暂无描述</p>
            )}
          </div>
        )}

        {tab === "comments" && (
          <CommentTimeline
            comments={issue.comments}
            onSubmit={async (content) => {
              await postIssueComment(sessionId, issueId, content);
              await load();
            }}
          />
        )}

        {tab === "tasks" && (
          <div className="p-6 overflow-auto h-full space-y-2">
            {issue.taskRefs.length === 0 && (
              <p className="text-muted-foreground text-sm">暂无关联 Task</p>
            )}
            {issue.taskRefs.map((taskId) => (
              <button
                key={taskId}
                onClick={() => openTab(`flows/${sessionId}/tasks/${taskId}`, taskId)}
                className="block w-full text-left rounded-lg border border-border p-3 hover:bg-accent/50 text-sm"
              >
                {taskId}
              </button>
            ))}
          </div>
        )}

        {tab === "reports" && (
          <div className="p-6 overflow-auto h-full space-y-2">
            {issue.reportPages.map((page) => (
              <div key={page} className="rounded-lg border border-border overflow-hidden">
                <div className="px-3 py-2 bg-muted text-xs font-medium">{page}</div>
                <DynamicUI
                  importPath={`@flows/${sessionId}/flows/supervisor/files/ui/pages/${page}`}
                  componentProps={{ sessionId }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add kernel/web/src/features/IssueDetailView.tsx
git commit -m "feat(kanban): implement IssueDetailView with tabs and comments"
```

### Task 16: Task 详情页实现

**Files:**
- Modify: `kernel/web/src/features/TaskDetailView.tsx`

- [ ] **Step 1: 实现 Task 详情页**

```tsx
// kernel/web/src/features/TaskDetailView.tsx
import { useEffect, useState, useCallback } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { lastFlowEventAtom, editorTabsAtom, activeFilePathAtom } from "../store/session";
import { fetchTasks, ackTask } from "../api/kanban";
import MarkdownContent from "../components/ui/MarkdownContent";
import DynamicUI from "./DynamicUI";
import type { KanbanTask, TaskStatus } from "../api/types";

const STATUS_LABELS: Record<TaskStatus, string> = {
  running: "执行中",
  done: "已完成",
  closed: "已关闭",
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  running: "bg-amber-500",
  done: "bg-emerald-500",
  closed: "bg-gray-500",
};

const SUB_STATUS_COLORS: Record<string, string> = {
  pending: "bg-gray-400",
  running: "bg-amber-500",
  done: "bg-emerald-500",
};

type Tab = "description" | "subtasks" | "issues" | "reports";

export default function TaskDetailView({
  sessionId,
  taskId,
}: {
  sessionId: string;
  taskId: string;
}) {
  const [task, setTask] = useState<KanbanTask | null>(null);
  const [tab, setTab] = useState<Tab>("subtasks");
  const lastEvent = useAtomValue(lastFlowEventAtom);
  const setTabs = useSetAtom(editorTabsAtom);
  const setActivePath = useSetAtom(activeFilePathAtom);

  const load = useCallback(async () => {
    const tasks = await fetchTasks(sessionId);
    const found = tasks.find((t) => t.id === taskId);
    setTask(found ?? null);
  }, [sessionId, taskId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (lastEvent && "sessionId" in lastEvent && lastEvent.sessionId === sessionId) {
      load();
    }
  }, [lastEvent, sessionId, load]);

  // 自动 ack
  useEffect(() => {
    if (task?.hasNewInfo) {
      ackTask(sessionId, taskId);
    }
  }, [task?.hasNewInfo, sessionId, taskId]);

  const openTab = (path: string, label: string) => {
    setActivePath(path);
    setTabs((prev) => {
      if (prev.some((t) => t.path === path)) return prev;
      return [...prev, { path, label }];
    });
  };

  if (!task) {
    return <div className="p-6 text-muted-foreground">Task 未找到</div>;
  }

  const done = task.subtasks.filter((s) => s.status === "done").length;
  const total = task.subtasks.length;

  const tabs: { key: Tab; label: string }[] = [
    { key: "description", label: "描述" },
    { key: "subtasks", label: `子任务 (${total})` },
    { key: "issues", label: `关联 Issues (${task.issueRefs.length})` },
    ...(task.reportPages.length > 0
      ? [{ key: "reports" as Tab, label: `Reports (${task.reportPages.length})` }]
      : []),
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{task.title}</h2>
          <span className={`px-2 py-0.5 rounded-full text-xs text-white ${STATUS_COLORS[task.status]}`}>
            {STATUS_LABELS[task.status]}
          </span>
        </div>
        {total > 0 && (
          <div className="flex items-center gap-2 mt-2">
            <div className="w-32 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full"
                style={{ width: `${(done / total) * 100}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground">{done}/{total} subtasks</span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-border px-6 flex gap-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`py-2 text-sm border-b-2 transition-colors ${
              tab === t.key
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {tab === "description" && (
          <div className="p-6">
            {task.description ? (
              <MarkdownContent content={task.description} />
            ) : (
              <p className="text-muted-foreground text-sm">暂无描述</p>
            )}
          </div>
        )}

        {tab === "subtasks" && (
          <div className="p-6 space-y-2">
            {task.subtasks.length === 0 && (
              <p className="text-muted-foreground text-sm">暂无子任务</p>
            )}
            {task.subtasks.map((sub) => (
              <div
                key={sub.id}
                className="flex items-center gap-3 rounded-lg border border-border p-3"
              >
                <span className={`w-2 h-2 rounded-full ${SUB_STATUS_COLORS[sub.status]}`} />
                <span className="text-sm flex-1">{sub.title}</span>
                {sub.assignee && (
                  <span className="text-xs text-muted-foreground">{sub.assignee}</span>
                )}
                <span className="text-xs text-muted-foreground">{sub.status}</span>
              </div>
            ))}
          </div>
        )}

        {tab === "issues" && (
          <div className="p-6 space-y-2">
            {task.issueRefs.length === 0 && (
              <p className="text-muted-foreground text-sm">暂无关联 Issue</p>
            )}
            {task.issueRefs.map((issueId) => (
              <button
                key={issueId}
                onClick={() => openTab(`flows/${sessionId}/issues/${issueId}`, issueId)}
                className="block w-full text-left rounded-lg border border-border p-3 hover:bg-accent/50 text-sm"
              >
                {issueId}
              </button>
            ))}
          </div>
        )}

        {tab === "reports" && (
          <div className="p-6 space-y-2">
            {task.reportPages.map((page) => (
              <div key={page} className="rounded-lg border border-border overflow-hidden">
                <div className="px-3 py-2 bg-muted text-xs font-medium">{page}</div>
                <DynamicUI
                  importPath={`@flows/${sessionId}/flows/supervisor/files/ui/pages/${page}`}
                  componentProps={{ sessionId }}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 确认前端编译通过**

```bash
cd kernel/web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add kernel/web/src/features/TaskDetailView.tsx
git commit -m "feat(kanban): implement TaskDetailView with subtasks and reports"
```

### Task 17: 最终验证

- [ ] **Step 1: 运行后端测试**

```bash
bun test
```

Expected: 所有 kanban 相关测试通过，无回归

- [ ] **Step 2: 运行前端类型检查**

```bash
cd kernel/web && npx tsc --noEmit
```

Expected: 无类型错误

- [ ] **Step 3: 启动服务端验证**

```bash
bun kernel/src/cli.ts start 8080
```

打开浏览器访问 session 视图，确认 Kanban 视图正常渲染（空状态）。

- [ ] **Step 4: 最终 Commit**

```bash
git add -A
git commit -m "feat(kanban): session kanban complete — views, traits, API"
```
