# 人机交互 — 对象如何被"看见"，人如何"介入"

> G11：**UI 是对象的面孔**。
> 对象的视觉呈现不是外部设计的——它直接由对象的持久化数据生成。

本目录原名"表达"。改为"人机交互"，因为它同时覆盖：
- **对象 → 人**：UI 展示（自渲染、视图注册、页面）
- **人 → 对象**：用户操作（消息输入、命令面板、评论）

## 整体架构

```
Shell（外壳）                      ← 整体布局：LeftRail + Stage + MessageDock
  ├── LeftRail                     ← 左侧导航 + 文件树
  ├── Stage                        ← 主内容区（当前打开的视图）
  └── MessageDock                  ← 右侧消息对话面板

ViewRegistry（视图注册表）          ← 路径 → 视图组件 的分发

页面级视图                          ← 占据 Stage 全部空间
  ├── WelcomePage                  ← 无活跃 session 时
  ├── ChatPage                     ← 对话主界面
  ├── StoneView                    ← Stone 的多 Tab 详情
  ├── FlowView                     ← Flow 详情 + 抽屉
  ├── SessionKanban                ← Session 总览
  ├── IssueDetailView
  └── TaskDetailView

行为树 / 线程树可视化
卡片（ActionCard / TalkCard）
全局覆盖层（CommandPalette / OocLinkPreview / TraitModal）
原子组件（ObjectAvatar / Badge / MarkdownContent / ...）
```

## 子目录

| 目录/文件 | 内容 |
|---|---|
| [自渲染.md](自渲染.md) | ui/index.tsx + DynamicUI 加载机制 |
| [shell/](shell/) | LeftRail + Stage + MessageDock |
| [view-registry.md](view-registry.md) | 路径 → 视图 的分发注册 |
| [页面/](页面/) | 页面级视图（Welcome、Chat、Stone、Flow、Kanban 等） |
| [行为树可视化.md](行为树可视化.md) | ProcessView 双栏 |
| [卡片/](卡片/) | ActionCard + TalkCard |
| [覆盖层/](覆盖层/) | CommandPalette + OocLinkPreview + TraitModal |
| [原子组件.md](原子组件.md) | Avatar / Badge / Markdown / Sheet 等 |
| [状态管理.md](状态管理.md) | Jotai atoms |
| [sse.md](sse.md) | 实时通信事件流 |
| [ooc-protocol.md](ooc-protocol.md) | ooc:// 链接协议 |

## 核心主张：UI 即自我表达

对象的视觉呈现由对象自身数据生成：

```
readme.md  →  身份卡片
data.json  →  数据面板
relations  →  关系图
traits     →  能力列表
ui/index.tsx  →  自定义 UI（最高优先级）
```

**对象改变自己 → UI 自动改变**。没有"UI 工程师手动配置某个对象的展示"。

## 自渲染：ui/index.tsx

Stone 可以提供自定义 UI：

```
stones/{name}/ui/index.tsx
```

前端通过 Vite 动态 import 加载，自动热更新。如果不存在，回退到通用视图（ObjectDetail）。

Flow 则用 `ui/pages/*.tsx`（多页面）——通常用于 Issue / Task 的 report 页面。

详见 [自渲染.md](自渲染.md)。

## 代码位置

```
kernel/web/
├── src/
│   ├── App.tsx
│   ├── router/                     ← 路由定义
│   ├── features/                    ← 页面级组件
│   │   ├── SessionKanban.tsx
│   │   ├── IssueDetailView.tsx
│   │   ├── FlowView.tsx
│   │   └── ...
│   ├── components/                  ← 通用组件
│   │   ├── ActionCard.tsx
│   │   ├── MarkdownContent.tsx
│   │   └── ...
│   ├── store/                       ← Jotai atoms
│   ├── hooks/                        ← React hooks（含 useSSE）
│   ├── api/                         ← 后端 API 客户端
│   └── lib/                         ← 工具函数
```

## 与基因的关联

- **G11**（UI 即面孔）— 本目录核心
- **G1**（数据即对象）— UI 数据来自对象自身
- **G7**（目录即存在）— ui/ 是对象目录的一部分
