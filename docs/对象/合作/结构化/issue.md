# Issue — 需求/问题讨论

> Session 级别的需求跟踪单元。跨对象讨论，多对多关联 Task。

## 数据结构

```typescript
interface Issue {
  id: string;                          // "ISSUE-001"
  title: string;
  status: IssueStatus;
  description: string;                 // markdown
  participants: string[];              // 参与讨论的对象名称
  taskRefs: string[];                  // 关联的 Task id
  reportPages: string[];               // 关联 report 页面路径
  hasNewInfo: boolean;                 // 是否需要人类确认
  comments: Comment[];                 // 评论列表（不可变）
  createdAt: string;
  updatedAt: string;
}

type IssueStatus =
  | "discussing"    // 讨论中
  | "designing"     // 设计中
  | "reviewing"     // 评审中
  | "executing"     // 执行中
  | "confirming"    // 确认中
  | "done"          // 完成
  | "closed";       // 关闭（放弃/已解决）
```

## 存储

```
flows/{sid}/issues/
├── index.json               ← 轻量索引
└── issue-{id}.json          ← 单条完整数据
```

### index.json

```json
[
  { "id": "ISSUE-001", "title": "...", "status": "executing", "updatedAt": "..." },
  { "id": "ISSUE-002", "title": "...", "status": "done", "updatedAt": "..." }
]
```

用于快速列表展示——不需要加载全部 issue 详情。

### issue-{id}.json

存储完整 Issue 数据（含所有评论）。按需加载。

## 状态流转

```
discussing  ← 任务被提出，各方讨论
   ↓
designing   ← 确定做什么，讨论怎么做
   ↓
reviewing   ← 设计完成，需要审核
   ↓
executing   ← 开始实施
   ↓
confirming  ← 完成后等待确认
   ↓
done        ← 确认完成
（done 或任意阶段 → closed）
```

**不是强制状态机**——可以跳过阶段、可以回退。由 Supervisor 或人类判断。

## 典型用法

### 创建 Issue

```typescript
// Supervisor 通过 session-kanban trait
await createIssue({
  title: "线程树架构集成验证",
  description: "验证线程树架构能否替代旧的 Flow/Process 架构...",
  participants: ["alan", "bruce"],
});
// → ISSUE-001
```

### 在 Issue 下讨论

```typescript
// 任何对象通过 issue-discussion trait
await commentOnIssue("ISSUE-001", {
  content: "我觉得应该先验证用例 010（多线程并发）...",
  mentions: ["bruce"]
});
```

mentions 中的对象会在 inbox 收到提醒消息：`[@alan 在 ISSUE-001 中提到你]`。

### 推进状态

```typescript
// Supervisor
await updateIssueStatus("ISSUE-001", "executing");
```

### 关联 Task

```typescript
await updateIssue("ISSUE-001", {
  taskRefs: ["TASK-001", "TASK-002"]
});
```

## participants 机制

`participants` 字段让系统知道"谁在关注这个 Issue"。

- Issue 更新时，participants 中的对象收到通知（写入 inbox）
- Issue 详情页侧栏显示参与者头像
- 新增 participant 时，该对象收到 "你被邀请到 ISSUE-001 讨论"

## hasNewInfo 机制

当 Issue 有新的、**需要人类确认**的信息时（例如：方案初稿、需要决策的分歧、完成状态等），将 `hasNewInfo = true`：

```typescript
await setIssueNewInfo("ISSUE-001", true);
```

前端在该 Issue 卡片上显示红点提示。

**人类打开详情页 → 自动 reset**：

```typescript
// 后端 API
POST /api/session/{sid}/issues/{id}/view
→ 自动调用 setIssueNewInfo(id, false)
```

## 与 Task 的关系

Issue 和 Task **多对多**：

```
Issue A —┬─ Task X
         └─ Task Y

Task Y —┬─ Issue A
        └─ Issue B
```

一个 Issue 可能产生多个 Task（如"支持 A 功能" → "后端 API"、"前端组件"、"测试"三个 Task）。
一个 Task 可能解决多个 Issue（如"数据库迁移" 同时影响 Issue A 和 B）。

**关联通过双向字段维护**：Issue.taskRefs 和 Task.issueRefs 都要更新。

## 源码锚点

| 概念 | 实现 |
|---|---|
| Issue 类型 | `kernel/src/types/kanban.ts` |
| 创建/更新 | `kernel/src/kanban/store.ts` |
| Supervisor 方法 | `kernel/src/kanban/methods.ts` |
| 其他对象方法 | `kernel/src/kanban/discussion.ts` |
| 前端详情页 | `kernel/web/src/features/IssueDetailView.tsx` |

## 与基因的关联

- **G8**（Effect 与 Space）— Issue 是 Session 这个 Space 内的结构化对话
- **G10**（行动记录不可变）— Issue 的 comments 是不可变的
