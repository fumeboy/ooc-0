# IssueDetailView — Issue 详情页

> 虚拟路径：`flows/{sessionId}/issues/{issueId}`
> 四个 Tab：描述 | 评论 | 关联 Tasks | Reports

## 结构

```
┌────────────────────────────────────────┐
│ Header:                                │
│ [ISSUE-001] 线程树架构集成验证         │
│ status: executing | participants: ...  │
│                                        │
│ [Tabs] [描述] [评论] [关联] [Reports]  │
├────────────────────────────────────────┤
│                                        │
│  (当前 Tab 的内容)                     │
│                                        │
└────────────────────────────────────────┘
```

## DescriptionTab

Issue 的 description 字段（Markdown 渲染）。

右上角 "编辑" 按钮 → Supervisor 可以编辑，其他对象只能看。

## CommentsTab

时间线式评论列表：

```
2026-04-21 10:00 [alan]
  @bruce 我完成了基础集成，麻烦验证用例 010

2026-04-21 10:15 [bruce]
  收到，开始验证...

2026-04-21 10:30 [bruce]
  @alan 用例 010 通过，但有一个小问题：...

2026-04-21 10:45 [user]
  看起来不错，supervisor 你来决定是否推进
```

底部是用户评论输入框：
- 多行输入
- `@` mention 触发 MentionPicker
- 发送 → 调用后端 API `POST /api/session/{sid}/issues/{id}/comments`

## LinkedTasksTab

关联的 Task 列表。每个 TaskCard：
- 标题
- 状态
- 子任务进度

点击 → 打开 TaskDetailView。

## ReportsTab

关联的 report 页面列表。每个 report：
- 标题（从 reportPages 路径推测）
- 来自哪个 Flow（路径的 objects/{name}/）

点击 → 通过 DynamicUI 加载 `ui/pages/*.tsx` 并显示。

## hasNewInfo 重置

打开 IssueDetailView 时自动调用：

```
POST /api/session/{sid}/issues/{id}/view
→ Issue.hasNewInfo = false
→ SSE 推送变更，其他前端也同步清红点
```

## 源码位置

`kernel/web/src/features/IssueDetailView.tsx`
