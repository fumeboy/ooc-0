# Iris 项目知识

## 前端代码结构

```
world_dir/kernel/web/
├── src/
│   ├── App.tsx            ← 主布局（LeftRail + Stage + MessageDock）
│   ├── features/          ← 页面级组件
│   │   ├── WelcomePage.tsx    ← 欢迎页（无活跃 session 时）
│   │   ├── ChatPage.tsx       ← 对话页（浮动输入框 + 对话时间线）
│   │   ├── SessionKanban.tsx  ← Session 看板（线程树列表 + Issues/Tasks 抽屉）
│   │   ├── FlowView.tsx       ← Flow 详情（Readme/View + 底部抽屉 Timeline/Process/Data/Memory）
│   │   ├── StoneView.tsx      ← Stone 详情（ObjectDetail 或 DynamicUI）
│   │   ├── ObjectDetail.tsx   ← 通用 Stone 详情页（多 Tab）
│   │   ├── ProcessView.tsx    ← 行为树可视化（双栏 ActionTimeline + MiniTree）
│   │   ├── SessionFileTree.tsx ← Session 文件树（注入虚拟节点）
│   │   ├── DynamicUI.tsx      ← 统一动态 View 加载器（Stone + Flow）
│   │   ├── MessageSidebar.tsx ← 右侧消息面板（多线程消息中心 + form picker）
│   │   ├── IssueDetailView.tsx ← Issue 详情页（描述/评论/关联 Tasks/Reports）
│   │   └── TaskDetailView.tsx  ← Task 详情页（描述/子任务/关联 Issues/Reports）
│   ├── components/        ← 通用组件
│   │   ├── TuiBlock.tsx      ← TuiAction + TuiTalk 统一定义
│   │   └── ui/               ← 原子组件（ObjectAvatar, Badge, MarkdownContent 等）
│   ├── store/             ← Jotai atoms（状态管理）
│   ├── hooks/             ← React hooks（useSSE, useIsMobile, useUserThreads）
│   ├── api/               ← API 客户端
│   ├── router/            ← ViewRegistry 视图注册
│   └── lib/               ← 工具函数
├── vite.config.ts
└── package.json
```

## 技术栈

- React + TypeScript + Vite
- Jotai（状态管理）
- Tailwind CSS（样式）
- lucide-react（图标）
- CodeMirror 6（代码查看）
- SSE（实时更新）

## Views 机制

对象通过 views/{viewName}/ 目录自渲染 UI，每个 view 包含三件套：

- `VIEW.md` - 元数据（namespace=self, kind=view）
- `frontend.tsx` - React 组件（默认导出，必须存在）
- `backend.ts` - 可选，ui_methods / llm_methods

### Views 目录位置

- Stone 级：`stones/{name}/views/{viewName}/`
- Flow 级：`flows/{sessionId}/objects/{name}/views/{viewName}/`

### DynamicUI 加载

- Vite 动态 import（@vite-ignore）加载 frontend.tsx
- 自动注入 callMethod 闭包
- 渲染失败自动降级到 fallback

## 主要组件说明

### MessageSidebar（消息坞）
- 三栏布局：Header + Body + MessageInput
- 双视图切换：process（当前线程 actions）+ threads（按对象聚合的线程列表）
- TuiTalkForm：option picker 支持（↑↓/Enter/Esc/1-9 快捷键，自由文本兜底）
- 未读持久化：服务端 readState 权威 + localStorage 离线兜底

### SessionKanban（看板视图）
- 主体：所有对象的 threads tree 可视化
- 抽屉：底部升起的抽屉页（Issues/Tasks 左右分栏）
- ThreadsTreeView：节点状态圆点 + 颜色图钉 + Ctx View 切换（四色可见性）

### TuiBlock（卡片组件）
- TuiAction：Action 一行展示（tool_use 首行显示 title，次级行显示 toolName）
- TuiTalk：Talk 一行展示（纯文本 bubble）
- TuiStreamingBlock：流式 thought / talk / action

## 经验笔记

- shell 命令在 `self_dir`（即 stones/iris/）下执行
- 前端代码在 `world_dir/kernel/web/src/`
- 读取前端代码用 `await Bun.file(world_dir + "/kernel/web/src/...").text()`
- 我的职责是 UI/UX 设计与实现，不修改后端代码
