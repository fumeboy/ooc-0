# 线程树 Process 可视化

<!--
@ref kernel/src/persistence/thread-adapter.ts — implemented-by — threadsToProcess 转换函数
@ref kernel/src/persistence/reader.ts — implemented-by — readFlow 线程树检测
@ref kernel/web/src/features/ProcessView.tsx — renders — 线程树可视化
-->

## 背景

线程树架构（2026-04-06 启动）引入了新的数据存储格式：
- `threads.json` — 树结构索引（rootId, nodes 含 title/status/childrenIds/summary）
- `threads/{threadId}/thread.json` — 每个线程的 actions 列表

但前端 ProcessView 依赖旧的 `Process` 结构（从 `process.json` 读取）。
线程树 session 没有 `process.json`，导致 Process tab 只显示一个空的 "task" 默认节点。

## 方案

### 后端：threadsToProcess 转换适配器

新增 `kernel/src/persistence/thread-adapter.ts`，在 `readFlow()` 中检测到 `threads.json` 存在时自动调用。

数据映射：

```
ThreadsTreeFile → Process
├── rootId → focusId（优先选 running 状态线程）
└── nodes → root（递归构建 ProcessNode 树）
    ├── id, title → id, title
    ├── status → status（running/waiting→doing, pending→todo, done/failed→done）
    ├── childrenIds → children（递归）
    ├── summary → summary
    ├── traits/activatedTraits → traits/activatedTraits
    ├── outputs/outputDescription → outputs/outputDescription
    └── thread.json.actions → actions[]（ThreadAction → Action 透传）
```

### 前端：零改动

ProcessView 和 MiniTree 已支持多层级树形结构、actions 时间线、summary 展示。
转换后的 Process 数据直接喂入即可。

## 验证

场景 4 session（derive_from_which_thread）的 Process tab 正确展示三层线程树：
- sophia 主线程 (done) — 6 actions
  - 查阅 G1 基因的定义 (done)
    - 分析 G1 基因与 OOP 的区别 (done)

截图：`user/.temp/process-view-thread-tree.png`

## 关键文件

| 文件 | 变更 |
|------|------|
| `kernel/src/persistence/thread-adapter.ts` | 新增，threadsToProcess 转换函数 |
| `kernel/src/persistence/reader.ts` | readFlow 增加线程树检测分支 |
| `kernel/src/persistence/index.ts` | 导出 threadsToProcess |
