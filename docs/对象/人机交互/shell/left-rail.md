# LeftRail — 左侧导航栏

> 左侧栏拆分成**上下两个圆角卡片**，中间 gap-1.5 露出背景。

## 结构

```
┌─────────────────┐
│   上部卡片       │  ← Logo 区域
│  ┌─────────┐   │
│  │ OOC Logo│   │
│  └─────────┘   │
│                 │
│ Oriented Object │
│    Context      │
│                 │
│ [⏸] [🐛] [●]   │  ← ControlButtons
└─────────────────┘

┌─────────────────┐
│   下部卡片       │
│                 │
│ [Flows][Stone][W]│  ← ModeSwitch（三 Tab）
│                 │
│ Session Title   │  ← SessionBar
│                 │
│ ├── session     │
│ ├── ui          │  ← TreePane（随 Mode 切换）
│ └── .stone      │
│                 │
│ ▓▓░░▓▓░▓░░▓▓░   │  ← ActivityHeatmap
└─────────────────┘
```

## 上部卡片：Logo 区域

### BrandMark

OOC Logo：阿基米德螺旋 + 三圆点关系图。象征：
- 螺旋 = 对象的成长循环
- 三圆点 = 最小关系网络

### Title

`Oriented Object Context` 两行排版。

### ControlButtons

三个等宽圆角按钮，放在灰色圆角容器中：

| 按钮 | 作用 |
|---|---|
| **Pause** (⏸) | 暂停当前 Flow（进入 pausing 状态） |
| **Debug** (🐛) | 打开调试面板（查看 Context、LLM 输出等） |
| **Online** (●) | 当前 Session 连接状态 |

按钮样式：`rounded-md`，高度 24px。

## 下部卡片：Tab + 内容

### ModeSwitch

三 Tab 切换器：

| Tab | 显示内容 |
|---|---|
| **Flows** | 当前 Session 的文件树（或 Session 列表） |
| **Stones** | 所有 Stone 的通用目录树 |
| **World** | 从 World 对象的视角看目录 |

### SessionBar（Flows 模式）

显示当前活跃 Session：

- 标题（可点击编辑）
- 切换 Session 的下拉菜单
- "新建 Session" 按钮

### TreePane

内容随 ModeSwitch 切换：

#### Flows 模式 · 无活跃 Session

展示 **SessionsList** — 历史 Session 列表，点击进入。

#### Flows 模式 · 有活跃 Session

展示 **SessionFileTree** — 当前 Session 的文件结构，含**虚拟节点**：

```
sess_xxx/
├── [index]              ← 虚拟：Session 看板入口
├── [ui]                 ← 虚拟：Supervisor 自渲染 UI
├── [.stone]             ← 虚拟：对象源
├── readme.md            ← 真实文件
├── issues/
│   ├── issue-001.json
│   └── issue-002.json
├── tasks/
└── objects/
    ├── supervisor/
    │   └── ...
    ├── alan/
    └── bruce/
```

虚拟节点提供语义化入口（不是真的文件路径）。

#### Stones / World 模式

展示 **FileTree** — 普通文件目录树，带 marker 图标：

- `Box` = stone
- `GitBranch` = flow
- `Folder` = 普通目录

### ActivityHeatmap

当月使用热力图。每天的活跃度（Session 数 / actions 数）用色块浓淡表示。让用户看到自己的使用节奏。

## 源码位置

```
kernel/web/src/features/LeftRail/
├── index.tsx
├── BrandMark.tsx
├── ControlButtons.tsx
├── ModeSwitch.tsx
├── SessionBar.tsx
├── TreePane.tsx
├── SessionsList.tsx
├── SessionFileTree.tsx
├── FileTree.tsx
└── ActivityHeatmap.tsx
```

## 与基因的关联

- **G11**（UI 即面孔）— LeftRail 是系统"面孔"的导航部分
- **G7**（目录即存在）— 树展示直接映射目录结构
