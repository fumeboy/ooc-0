# 结构化 — Issue / Task / 看板

> 消息是**点对点**的合作；看板是**结构化的、多方可见的**合作。
> 当一个话题需要多轮讨论、多人参与、长期跟踪时，消息不够——需要 Issue 和 Task。

## 数据模型

```
Issue（需求/问题讨论）     Task（执行单元）
  ├── id                   ├── id
  ├── title                ├── title
  ├── status               ├── status
  ├── description          ├── description
  ├── participants         ├── issueRefs（多对多）
  ├── taskRefs（多对多）    ├── subtasks[]
  ├── comments[]           ├── reportPages[]
  └── reportPages[]        └── hasNewInfo
```

Issue 和 Task 是**多对多**——一个 Issue 可以拆成多个 Task；一个 Task 可以解决多个 Issue。

## 六个文档

| 文档 | 内容 |
|---|---|
| [issue.md](issue.md) | Issue 数据结构 + 状态机 + 用法 |
| [task.md](task.md) | Task 数据结构 + subtasks |
| [comment.md](comment.md) | 不可变评论 + mentions |
| [并发写入.md](并发写入.md) | per-session 串行化队列 |
| [trait/session-kanban.md](trait/session-kanban.md) | Supervisor 专属的看板 trait |
| [trait/issue-discussion.md](trait/issue-discussion.md) | 所有对象可用的 Issue 讨论 trait |

## 为什么需要看板

### 消息的局限

消息是线性、1:1 的：

```
A talks B
B replies
...
```

如果有 C、D 也要参与，每条消息要发多次。如果过一周 A 忘了，无法快速回溯"我们讨论到哪了"。

### 看板的优势

Issue 把一个"话题"结构化：

- **参与者**：谁在讨论
- **状态**：当前进展（讨论中 / 设计中 / 执行中 / 确认中 / 完成）
- **关联**：哪些 Task 是为这个 Issue 服务的
- **报告**：哪些 report 页面记录了结果

一眼看到全貌，不需要翻历史消息。

## 状态机

### Issue 状态

```
discussing → designing → reviewing → executing → confirming → done → closed
```

**不是强制流转**——Supervisor 根据情况判断何时切换。每个状态都可回退或跳转。

### Task 状态

```
running → done → closed
```

更简单——Task 是执行单元，要么在做、要么做完、要么废弃。

## 谁能写看板

| 写入方 | 通过什么 trait |
|---|---|
| **Supervisor** | `session-kanban`（专属） |
| **其他对象** | `issue-discussion`（共享） |
| **用户** | 后端 API 直接写 |

三方写入通过 `session.serializedWrite` 串行化，保证一致性。

详见 [并发写入.md](并发写入.md)。

## 前端展示

看板有独立的页面视图：

- **Kanban 总览**：所有 Issue 和 Task 按状态分组展示
- **Issue 详情页**：描述 + 评论列表 + 关联 Tasks + Reports
- **Task 详情页**：描述 + SubTasks + 关联 Issues + Reports

详见 [../../人机交互/页面/session-kanban.md](../../人机交互/页面/session-kanban.md)。

## hasNewInfo 机制

每个 Issue / Task 有 `hasNewInfo` 布尔字段。当有需要**人类确认**的新信息时，设为 true（前端显示红点）。

人类打开该 Issue/Task 详情页时，自动清零。

让用户不错过关键进展，但也不被所有更新淹没。

## reportPages 机制

Issue 和 Task 可以关联一个或多个 `report` 页面（自渲染 UI）：

```
Task TASK-001:
  reportPages: [
    "flows/{sid}/objects/alan/ui/pages/task-001-result.tsx"
  ]
```

这些页面由 Flow 生成，前端通过 DynamicUI 加载。让结果展示比纯文本更丰富——可以是表格、图表、交互式 demo。

详见 [../../人机交互/自渲染.md](../../人机交互/自渲染.md)。

## 源码锚点

| 概念 | 实现 |
|---|---|
| 数据存储 | `kernel/src/kanban/store.ts` |
| session-kanban 方法 | `kernel/src/kanban/methods.ts` |
| issue-discussion 方法 | `kernel/src/kanban/discussion.ts` |
| 后端 API | `kernel/src/server/kanban.ts`（或类似路径） |
| 前端 | `kernel/web/src/features/SessionKanban.tsx`, `IssueDetailView.tsx`, `TaskDetailView.tsx` |

## 与基因的关联

- **G8**（Effect 与 Space）— 看板是 Session 这个 Space 的结构化视图
- **G10**（行动记录不可变）— Comment 不可变，符合 G10
