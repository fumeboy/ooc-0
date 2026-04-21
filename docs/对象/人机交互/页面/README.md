# 页面 — 占据 Stage 全部空间的完整页面

> 八个主要页面，每个对应一种"核心交互场景"。

## 八个页面

| 文档 | 场景 |
|---|---|
| [welcome.md](welcome.md) | 无活跃 Session 时的首页 |
| [chat.md](chat.md) | 用户与对象的主对话界面 |
| [stone-view.md](stone-view.md) | Stone 的多 Tab 详情 |
| [flow-view.md](flow-view.md) | 单个 Flow 的详情 |
| [session-kanban.md](session-kanban.md) | Session 看板（总览） |
| [issue-detail.md](issue-detail.md) | Issue 详情页 |
| [task-detail.md](task-detail.md) | Task 详情页 |

## 共同设计语言

所有页面共享一些设计规范：

- **Header 左侧**：头像 + 名称 + 状态 Badge
- **Header 右侧**：按钮组 Tabs
- **主体**：页面特定内容
- **抽屉**（可选）：从底部升起的 Sheet，默认 90% 高度
- **iOS 风格装饰条**：抽屉顶部的灰色小条

## 源码位置

```
kernel/web/src/features/
├── WelcomePage.tsx
├── ChatPage.tsx
├── StoneView/
│   ├── index.tsx
│   └── ObjectDetail.tsx
├── FlowView.tsx
├── SessionKanban.tsx
├── IssueDetailView.tsx
└── TaskDetailView.tsx
```
