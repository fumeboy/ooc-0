# TaskDetailView — Task 详情页

> 虚拟路径：`flows/{sessionId}/tasks/{taskId}`
> 四个 Tab：描述 | 子任务列表 | 关联 Issues | Reports

## 结构

```
┌────────────────────────────────────────┐
│ Header:                                │
│ [TASK-001] 实现线程树调度器            │
│ status: running                        │
│                                        │
│ [Tabs] [描述] [子任务] [关联] [Reports]│
├────────────────────────────────────────┤
│                                        │
│  (当前 Tab 的内容)                     │
│                                        │
└────────────────────────────────────────┘
```

## DescriptionTab

Task 的 description（Markdown 渲染）。

## SubTasksTab

子任务列表：

```
☑ SUB-01 设计数据结构           alan       done
☐ SUB-02 实现 wait 唤醒逻辑     alan       running
☐ SUB-03 写单测                 coder      pending
```

每行：
- 状态 checkbox（done 打钩）
- 标题
- assignee 头像
- 状态 badge

**点击状态**（如果是 assignee 或 user）→ 切换 status。触发 API 更新。

## LinkedIssuesTab

关联的 Issue 列表，结构同 IssueDetailView 的 LinkedTasksTab。

## ReportsTab

关联的 report 页面列表，通过 DynamicUI 加载展示。

## hasNewInfo 重置

同 IssueDetailView，打开时自动 reset。

## 源码位置

`kernel/web/src/features/TaskDetailView.tsx`
