# session-kanban — Supervisor 专属的看板 trait

> 位于 `stones/supervisor/traits/session-kanban/`。只有 Supervisor 对象使用。

## 为什么是 Supervisor 专属

看板的**结构性操作**（创建 Issue、推进状态、关联 Task 等）需要**总协调视角**。如果每个对象都能随意创建 Issue / 改状态，会混乱。

设计选择：**只有 Supervisor 能做结构性操作**。其他对象只能**评论**（通过 `issue-discussion`）。

## Trait 位置

```
stones/supervisor/traits/session-kanban/
├── TRAIT.md
└── methods.ts
```

**不在 kernel/traits/ 下**——因为它是对象特定（Supervisor 专属），不是所有对象共享。

## 核心方法

### Issue 相关

```typescript
createIssue({ title, description, participants }): { id }

updateIssueStatus(id, status): void

updateIssue(id, patch): void          // 合并更新（title, description, participants, taskRefs）

closeIssue(id): void                   // 等同 updateIssueStatus(id, "closed")

setIssueNewInfo(id, hasNewInfo): void  // 标记 / 清除红点
```

### Task 相关

```typescript
createTask({ title, description, issueRefs }): { id }

updateTaskStatus(id, status): void

updateTask(id, patch): void

createSubTask(taskId, { title, assignee }): { subTaskId }

updateSubTask(taskId, subTaskId, patch): void

setTaskNewInfo(id, hasNewInfo): void
```

## 通过 task_dir 变量定位 Session

trait 实现需要知道"当前 Session 的 issues/ tasks/ 目录在哪"。这通过一个特殊变量 `task_dir` 传入：

```typescript
// methods.ts
export const methods = {
  createIssue: async (ctx, args) => {
    const taskDir = ctx.task_dir;  // e.g., "flows/sess_xxx/"
    const issuesPath = path.join(taskDir, "issues");
    // ...
  },
};
```

`task_dir` 在 trait 激活时由 Engine 注入（根据当前 Session ID）。

## 权限约束

方法 handler 可以检查调用者身份：

```typescript
createIssue: async (ctx, args) => {
  if (ctx.currentObject !== "supervisor") {
    throw new Error("session-kanban 仅限 supervisor 使用");
  }
  // ...
}
```

**但更根本的**：非 supervisor 对象根本没有激活此 trait（它在 `stones/supervisor/traits/`）——自然用不到它的方法。

## 典型使用场景

### Session 开始时创建 Issue

```typescript
// supervisor 收到用户消息后
await createIssue({
  title: "用户请求：实现 X 功能",
  description: userMessage,
  participants: ["supervisor", "alan"]
});
// → ISSUE-001
```

### 讨论充分后推进

```typescript
// 用户和 alan 讨论了几轮，方案清楚了
await updateIssueStatus("ISSUE-001", "executing");
await createTask({
  title: "实现 X 后端",
  description: "...",
  issueRefs: ["ISSUE-001"]
});
// → TASK-001
```

### 完成后等确认

```typescript
// coder 完成后
await updateTaskStatus("TASK-001", "done");
await setIssueNewInfo("ISSUE-001", true);  // 触发红点，请用户确认
```

## 与 issue-discussion 的配合

看板的完整工作流：

```
Supervisor 用 session-kanban:
  - 创建 Issue
  - 更新状态
  - 创建 Task
  - 分配 SubTask

其他对象用 issue-discussion:
  - 在 Issue 下评论
  - 读取 Issue 列表 / 详情
  - 感知被 @ 的消息

用户用 API:
  - 评论
  - 查看详情（自动清 hasNewInfo）
```

三方通过 `session.serializedWrite` 保证并发安全。

## 源码锚点

| 概念 | 实现 |
|---|---|
| trait 文件 | `stones/supervisor/traits/session-kanban/` |
| 方法实现 | `kernel/src/kanban/methods.ts` |
| 数据存储 | `kernel/src/kanban/store.ts` |

## 与基因的关联

- **G3**（trait 是自我定义）— session-kanban 是 Supervisor 独特的能力
- **G8**（Effect 与 Space）— 通过看板 Supervisor 结构化管理 Session 这个 Space
