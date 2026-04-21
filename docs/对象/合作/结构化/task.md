# Task — 执行单元

> Session 级别的执行跟踪单元。多对多关联 Issue。

## 数据结构

```typescript
interface Task {
  id: string;                    // "TASK-001"
  title: string;
  status: TaskStatus;            // running | done | closed
  description: string;           // markdown
  issueRefs: string[];           // 关联的 Issue id
  reportPages: string[];         // 关联 report 页面路径
  subtasks: SubTask[];           // 子任务列表
  hasNewInfo: boolean;
  createdAt: string;
  updatedAt: string;
}

interface SubTask {
  id: string;                    // "SUBTASK-001-01"
  title: string;
  assignee: string;              // 负责的对象名
  status: "pending" | "running" | "done";
}
```

## 存储

```
flows/{sid}/tasks/
├── index.json               ← 轻量索引
└── task-{id}.json           ← 单条完整数据
```

结构与 Issue 类似。

## 状态（简化）

```
running  ← 正在做
  ↓
 done   ← 完成
  ↓
closed  ← 归档（或放弃）
```

比 Issue 简单——Task 是**执行**，状态二元：做 / 没做。

## SubTask

Task 可以有 SubTask 列表：

```typescript
subtasks: [
  { id: "SUB-01", title: "设计数据结构", assignee: "alan", status: "done" },
  { id: "SUB-02", title: "实现 API", assignee: "coder", status: "running" },
  { id: "SUB-03", title: "写测试", assignee: "coder", status: "pending" }
]
```

SubTask 不是独立的 Task——它是 Task 的"分步"。轻量结构，不支持独立评论或 reportPages。

## 典型用法

### 创建 Task

```typescript
// Supervisor
await createTask({
  title: "实现线程树调度器",
  description: "...",
  issueRefs: ["ISSUE-001"]  // 关联的 Issue
});
// → TASK-001
```

### 更新状态

```typescript
await updateTaskStatus("TASK-001", "done");
```

### 添加 SubTask

```typescript
await createSubTask("TASK-001", {
  title: "实现 wait 唤醒逻辑",
  assignee: "alan"
});
```

### 标记 SubTask 完成

```typescript
await updateSubTask("TASK-001", "SUB-01", { status: "done" });
```

## 分配给对象

`subtask.assignee` 是**对象名**。系统可以自动通知：

```
Alan 被分配 SUB-01：
  → Alan 的 inbox 收到 [new] msg: "你被分配到 TASK-001 的子任务 SUB-01"
```

Alan 开始处理 → 更新 status = running。

## hasNewInfo

与 Issue 相同：有需要人类确认的新信息时设为 true。

典型触发：
- Task 完成后需要人工验收
- 执行中遇到阻碍，需要决策

## reportPages

Task 完成后的**结果展示页面**：

```
TASK-001 执行完成
  reportPages: [
    "flows/{sid}/objects/alan/ui/pages/task-001-report.tsx"
  ]
```

由负责的对象（如 Alan）在自己的 Flow 目录下生成 tsx 文件，然后通过 updateTask 关联到 Task。

前端 Task 详情页的 "Reports" tab 用 DynamicUI 加载这些文件，渲染丰富内容。

## Task vs Issue：什么时候用哪个

| 场景 | 用 Issue | 用 Task |
|---|---|---|
| 需求讨论 | ✓ | ✗ |
| 技术决策 | ✓ | ✗ |
| 实施步骤 | ✗ | ✓ |
| 多方分歧 | ✓ | ✗ |
| 单人执行 | ✗ | ✓ |
| 进度跟踪 | 粗粒度 | 细粒度 |

**经验规则**：有待讨论的"怎么做"→ Issue；有明确的"要做什么"→ Task。Issue 和 Task 经常**同时存在**（Issue 孵化出多个 Task）。

## 源码锚点

| 概念 | 实现 |
|---|---|
| Task 类型 | `kernel/src/types/kanban.ts` |
| 创建/更新 | `kernel/src/kanban/store.ts` |
| Supervisor 方法 | `kernel/src/kanban/methods.ts` |
| 前端详情页 | `kernel/web/src/features/TaskDetailView.tsx` |

## 与基因的关联

- **G8**（Effect 与 Space）— Task 是 Session 内结构化的执行规划
- **G9**（线程树调度）— Task 的执行通常对应一棵线程树
