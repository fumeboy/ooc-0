---
name: session-kanban
type: how_to_think
when: never
command_binding:
  commands: ["create_sub_thread", "set_plan"]
description: Supervisor 专属 trait，提供 Session 级别的 Issue/Task 管理能力
deps: []
---

# session-kanban

Supervisor 专属 trait，提供 Session 级别的 Issue/Task 管理能力。

## 能力

- 创建、更新、关闭 Issue（需求/问题讨论）
- 创建、更新 Task（执行单元）及其 SubTask
- 标记 hasNewInfo（需要人类确认的新信息）

## 可用方法

- `createIssue(title, description?, participants?)` — 创建 Issue
- `updateIssueStatus(issueId, status)` — 更新 Issue 状态
- `updateIssue(issueId, fields)` — 更新 Issue 字段
- `setIssueNewInfo(issueId, hasNewInfo)` — 标记需要人类确认
- `closeIssue(issueId)` — 关闭 Issue
- `createTask(title, description?, issueRefs?)` — 创建 Task
- `updateTaskStatus(taskId, status)` — 更新 Task 状态
- `createSubTask(taskId, title, assignee?)` — 创建 SubTask
- `updateSubTask(taskId, subTaskId, fields)` — 更新 SubTask
