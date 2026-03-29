# Iris 项目知识

## 前端代码结构

```
world_dir/kernel/web/
├── src/
│   ├── App.tsx            ← 主布局（左侧栏 + 主内容区）
│   ├── features/          ← 页面级组件
│   │   ├── SessionIndex.tsx   ← Session 主视图（对话 + 甘特图）
│   │   ├── FlowView.tsx       ← Flow 详情（Timeline/Process/Data/Memory/UI）
│   │   ├── SessionGantt.tsx   ← 甘特图
│   │   ├── ChatPage.tsx       ← Welcome 页
│   │   ├── ObjectDetail.tsx   ← Stone 详情
│   │   ├── ProcessView.tsx    ← 行为树可视化
│   │   ├── SessionFileTree.tsx ← 文件目录树
│   │   └── DynamicUI.tsx      ← 自渲染 UI 加载器
│   ├── components/        ← 通用组件
│   │   └── ui/            ← 原子组件（ActionCard, FileTree, Badge 等）
│   ├── store/             ← Jotai atoms（状态管理）
│   ├── hooks/             ← React hooks（useSSE, useIsMobile）
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

## 经验笔记

- shell 命令在 `self_dir`（即 stones/iris/）下执行
- 前端代码在 `world_dir/kernel/web/src/`
- 读取前端代码用 `await Bun.file(world_dir + "/kernel/web/src/...").text()`
- 我的职责是 UI/UX 设计与实现，不修改后端代码
