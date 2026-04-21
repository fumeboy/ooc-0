# SessionKanban — Session 级总览

> 打开 `flows/{sid}` 时看到的页面。展示 Session 内**所有对象的线程树 + Issue + Task**。

## 结构

```
┌────────────────────────────────────────────┐
│ Header:                                    │
│ Session: 线程树集成验证                     │
├────────────────────────────────────────────┤
│ Threads Tree 列表（主体，垂直排列）        │
│                                            │
│ ▸ supervisor (running)                     │
│    └── thread-001                          │
│        ├── thread-002 (waiting)            │
│        └── thread-003 (done)               │
│                                            │
│ ▸ alan (waiting)                           │
│    └── thread-X                            │
│                                            │
│ ▸ bruce (running)                          │
│    └── thread-Y                            │
├────────────────────────────────────────────┤
│ ╭──╮                                        │
│ ├──┤  ← 抽屉（初始 160px，可拖到 90%）     │
│ ╰──╯                                        │
│                                            │
│  Issues | Tasks                            │
│  ┌──────┬──────┐                           │
│  │Issue │Task  │                           │
│  │cards │cards │                           │
│  └──────┴──────┘                           │
└────────────────────────────────────────────┘
```

## 主体：Threads Tree 列表

### 对象分隔标题

每个参与对象有一个"区块"：

- 头像 + 对象名
- 状态 badge（整体 Flow 状态）
- 展开/折叠按钮

### ThreadsTreeView

复用 FlowView 的线程树组件，显示该对象的完整线程树（根线程 + 所有子线程）。

### 加载策略

- Supervisor 优先加载（用户最关心）
- 其他对象**并发加载**
- 加载过程中显示骨架屏

### SSE 刷新

- 订阅 `flow:start`、`thread:*` 等事件
- 只刷新**变化的对象**（防抖批量处理）
- 避免全量重渲染

## 底部抽屉

### 左栏：IssuesPanel

Issue 按状态分组展示。分组顺序：

```
需确认（hasNewInfo=true）
  ↓
讨论中 (discussing)
  ↓
设计中 (designing)
  ↓
评审中 (reviewing)
  ↓
执行中 (executing)
  ↓
确认中 (confirming)
  ↓
完成 (done)
  ↓
关闭 (closed)
```

每张 IssueCard 显示：
- 标题
- 关联 Task 数
- 参与者头像（重叠展示）
- `hasNewInfo` 红点（如有）

点击 → 打开 IssueDetailView。

### 右栏：TasksPanel

Task 按状态分组：

```
执行中 (running) → 完成 (done) → 关闭 (closed)
```

每张 TaskCard 显示：
- 标题
- 子任务进度条（done / total）
- `hasNewInfo` 红点

点击 → 打开 TaskDetailView。

## 为什么把线程树放主体，看板放抽屉

设计理念：**执行优先，规划次之**。

- 线程树是"正在发生什么" — 占主要视觉空间
- 看板是"组织结构" — 抽屉按需展开

用户需要"微观看到线程"时抽屉收起；需要"宏观看整体进度"时抽屉展开。

## 源码位置

```
kernel/web/src/features/SessionKanban/
├── index.tsx
├── ObjectSection.tsx         ← 对象分隔标题 + 线程树
├── IssuesPanel.tsx
├── IssueCard.tsx
├── TasksPanel.tsx
└── TaskCard.tsx
```

## 与基因的关联

- **G11**（UI 即面孔）— Session 的整体面孔
- **G8**（Effect 与 Space）— Session 是 Space 的物理容器
