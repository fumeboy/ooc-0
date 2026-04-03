---
name: ProcessView 时间线重构设计
description: 将 ProcessView 从双栏布局重构为一维时间线，支持 Node 卡片式折叠/展开，展示内联节点和新的认知栈 API 信息
type: design
---

# ProcessView 时间线重构设计文档

## 背景

根据认知栈 API 重构（`docs/superpowers/specs/2026-03-31-cognitive-stack-api-redesign.md`），后端已新增以下特性：

1. **NodeType 类型**：区分普通子栈帧和内联子节点
   - `frame` — 普通子栈帧（独立生命周期）
   - `inline_before` — before hook 内联子节点（自动触发）
   - `inline_after` — after hook 内联子节点（自动触发）
   - `inline_reflect` — reflect 内联子节点（主动触发）

2. **ProcessNode 新增字段**：
   - `type?: NodeType` — 节点类型
   - `plan?: string` — 当前节点的计划/目标文本（set_plan 写入）
   - `outputs?: string[]` — 契约式编程，节点预期输出的 key 列表
   - `outputDescription?: string` — 输出描述

3. **后端渲染格式**（`renderProcess`）：
   - 内联节点使用 `[inline/before_start]` / `[inline/before_end]` 标记
   - `plan` 字段在【当前计划】区域展示

### 当前前端现状

现有 `ProcessView.tsx` 采用双栏布局：
- **左栏**：选中节点路径上的 actions 时间线（按节点分组）
- **右栏**：MiniTree 节点树缩略视图

存在的问题：
1. 不区分普通节点和内联节点
2. 不展示 `plan` 字段
3. 不展示 `outputs` 契约
4. 时间线按节点分组，内联节点的嵌入关系不清晰

---

## 设计目标

1. **一维时间线**：将所有 Node 按时间顺序排列，内联节点嵌入父节点的时间线中
2. **Node 卡片化**：每个 Node 作为独立卡片，支持折叠/展开
3. **完整信息展示**：展示 `plan`、`outputs` 契约、`push` 输入、`pop` 摘要
4. **内联节点区分**：用浅色背景区分不同类型的内联节点
5. **MiniTree 调整**：内联节点作为父节点的"子内容"，不独立显示

---

## 设计方案

### 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│  ProcessView (单栏时间线)                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Node 卡片 1 (折叠)                                  │   │
│  │ ────────────────────────────────────────────────── │   │
│  │ Header: 标题 + 状态 dot + badge + ▶ 折叠按钮      │   │
│  │ [plan] 区域 (紫色左边框)                           │   │
│  │ Input: title, traits...                            │   │
│  │ Outputs: taskList, priority (可展开)              │   │
│  │ 内联节点标记: [inline/before] 评估复杂度          │   │
│  │ Actions 标记: [5 个 actions + 2 个子节点]        │   │
│  │ Summary: 已拆解为 3 个主要任务...                  │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Node 卡片 2 (展开)                                  │   │
│  │ ────────────────────────────────────────────────── │   │
│  │ Header: 标题 + ▼ 展开按钮                          │   │
│  │ [plan] 区域                                        │   │
│  │                                                     │   │
│  │ ┌───────────────────────────────────────────────┐ │   │
│  │ │ [inline/before] 内联节点 (浅琥珀色背景)       │ │   │
│  │ │ • [10:30:02] [inject] 系统提示...             │ │   │
│  │ │ • [10:30:03] [thought] 这个任务需要...        │ │   │
│  │ │ • [10:30:04] [program] [cognize_stack_...    │ │   │
│  │ │ [inline/before_end] summary: 已评估...        │ │   │
│  │ └───────────────────────────────────────────────┘ │   │
│  │                                                     │   │
│  │ Actions 时间线:                                    │   │
│  │ • [10:30:05] [thought] 开始思考如何拆解...        │   │
│  │ • [10:30:06] [program] [cognize_stack_frame...]  │   │
│  │                                                     │   │
│  │ Summary 区域                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Node 卡片结构

每个 Node 卡片包含以下区域（从顶到底）：

#### 1. Header 区域

```
┌─────────────────────────────────────────────────────────┐
│ ▶  ● 拆解任务                    [doing]  5 actions      │
└─────────────────────────────────────────────────────────┘
```

- **折叠/展开按钮**：`▶` (折叠) / `▼` (展开)
- **状态 dot**：
  - 绿色 (`#22c55e`)：done
  - 琥珀色 (`#f59e0b`)：doing（带呼吸动画）
  - 灰色 (`#d1d5db`)：todo
- **标题**：`node.title`
- **状态 badge**：
  - `[doing]`：蓝色背景 (`#dbeafe`)
  - `[done]`：绿色背景 (`#dcfce7`)
  - `[todo]`：灰色背景 (`#f3f4f6`)
- **Actions 数量**：`node.actions.length`

#### 2. `[plan]` 区域

**位置**：Header 下方，Input 区域上方

**样式**：
- 紫色左边框 (`#8b5cf6`)
- 文字颜色：深紫色 (`#4c1d95`)
- 无背景色（与卡片背景一致）

**内容**：
- 标签：`[plan]`（紫色小字，加粗）
- 内容：`node.plan`（如果存在）

#### 3. 分隔线

浅灰色分隔线 (`#f3f4f6`)

#### 4. Input 区域

**标签**：`Input`（灰色小字，大写，加粗）

**内容**：
- `title`: `node.title`（如果需要）
- `description`: `node.description`（如果存在）
- `traits`: `node.traits`（如果存在）

#### 5. Outputs 区域

**可折叠/展开区块**：

**折叠状态**：
```
Outputs  [taskList, priority]  ▼
```

**展开状态**：
```
Outputs  [taskList, priority]  ▲
────────────────────────────────
outputDescription: 拆解后的任务列表和优先级映射

已产出:
  ✓ taskList: ["分析需求", "设计方案", "验收标准"]
  ✓ priority: { "分析需求": 1 }
```

**样式**：
- 标签：`Outputs`（深绿色小字，加粗）
- Output keys badge：绿色背景 (`#dcfce7`)，深绿色文字
- 展开后：
  - `outputDescription`: `node.outputDescription`
  - 已产出：如果节点 done，展示 `node.locals` 中与 `outputs` 匹配的 key

#### 6. 分隔线

浅灰色分隔线

#### 7. 内联节点标记（折叠状态）

如果节点包含内联子节点（`inline_before`、`inline_after`、`inline_reflect`），折叠时只显示标记：

**样式**：
- 浅色背景块（根据类型区分）
  - `inline_before`: 浅琥珀色 (`#fffbeb`)
  - `inline_after`: 浅翠绿色 (`#ecfdf5`)
  - `inline_reflect`: 浅紫色 (`#faf5ff`)
- 左边有一个小的彩色 dot
- 标签：`[inline/before]`（加粗，对应颜色）
- 标题：子节点的 `title`
- 右侧：`→` 提示展开查看详情

#### 8. Actions 折叠标记

折叠状态下显示：
```
[5 个 actions + 2 个子节点]  (点击展开)
```

**样式**：
- 浅灰色背景 (`#f9fafb`)
- 居中对齐
- 括号内显示 actions 数量 + 子节点数量

#### 9. 分隔线

浅灰色分隔线

#### 10. Summary 区域

**标签**：`Summary`（灰色小字，大写，加粗）

**样式**：
- 浅灰色左边框 (`#e5e7eb`)
- 文字颜色：深灰 (`#374151`)

**内容**：
- `node.summary`（如果存在）
- `artifacts`: `node.locals` 的 key 列表（如果存在）

---

### 展开状态

当 Node 卡片展开时：

1. **内联节点**：完整展示，嵌入在父节点的 Actions 时间线中
   - 浅色背景区分类型
   - `[inline/before_start]` 和 `[inline/before_end]` 标记清晰可见
   - 包含完整的 Actions 时间线

2. **Actions 时间线**：按时间顺序展示所有 actions
   - 使用现有的 `ActionCard` 组件
   - 时间戳 + type badge + 内容

3. **子节点**：如果有普通子节点，嵌入在 Actions 时间线中

---

### 内联节点展开样式

```
┌───────────────────────────────────────────────────────────┐
│ [inline/before] 评估复杂度              [hook 自动]     │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  [10:30:02] [inject]                                     │
│  ┌─────────────────────────────────────────────────┐   │
│  │ >>> [系统提示 — before | 认知栈评估]            │   │
│  └─────────────────────────────────────────────────┘   │
│                                                           │
│  [10:30:03] [thought]                                    │
│  这个任务需要拆解为多个步骤...                            │
│                                                           │
│  [10:30:04] [program]                                    │
│  [cognize_stack_frame_pop]                               │
│                                                           │
├───────────────────────────────────────────────────────────┤
│ [inline/before_end]  summary: 已评估，需要拆解为 3 步    │
└───────────────────────────────────────────────────────────┘
```

**内联节点类型与颜色对应**：

| 类型 | 背景色 | 文字色 |
|------|--------|--------|
| `inline_before` | `#fffbeb` (浅琥珀) | `#92400e` (深琥珀) |
| `inline_after` | `#ecfdf5` (浅翠绿) | `#065f46` (深翠绿) |
| `inline_reflect` | `#faf5ff` (浅紫) | `#6b21a8` (深紫) |

---

### MiniTree 调整

现有 MiniTree 显示所有节点为独立节点。需要调整：

1. **内联节点不独立显示**：内联节点作为父节点的"子内容"，不显示在 MiniTree 中

2. **父节点显示"包含内联节点"标记**：如果节点包含内联子节点，在标题旁显示一个小图标

3. **交互**：点击父节点时，时间线中会展开显示内联节点

---

## 前端类型更新

需要更新 `kernel/web/src/api/types.ts` 中的 `ProcessNode` 接口：

```typescript
/** 节点类型（区分普通子栈帧和内联子节点） */
export type NodeType =
  | "frame"           // 普通子栈帧（默认）
  | "inline_before"   // before 内联子节点（hook 自动触发）
  | "inline_after"    // after 内联子节点（hook 自动触发）
  | "inline_reflect"; // reflect 内联子节点（主动触发）

/** 行为树节点 */
export interface ProcessNode {
  id: string;
  title: string;
  description?: string;
  status: "todo" | "doing" | "done";
  children: ProcessNode[];
  deps?: string[];
  actions: Action[];
  traits?: string[];
  summary?: string;
  locals?: Record<string, unknown>;

  // 新增字段
  type?: NodeType;           // 节点类型
  plan?: string;             // plan 文本
  outputs?: string[];        // 契约式编程：输出 key 列表
  outputDescription?: string; // 输出描述
  activatedTraits?: string[]; // 动态激活的 traits
}
```

---

## 组件设计

### 新组件

| 组件 | 路径 | 说明 |
|------|------|------|
| `NodeCard` | `web/src/components/ui/NodeCard.tsx` | 单个 Node 卡片（折叠/展开） |
| `TimelineView` | `web/src/features/TimelineView.tsx` | 一维时间线（替代 ProcessView） |

### 现有组件修改

| 组件 | 修改内容 |
|------|---------|
| `MiniTree` | 内联节点不独立显示，父节点显示"包含内联节点"标记 |
| `ProcessView` | 重构为单栏 TimelineView + 可选的 MiniTree 侧边栏 |

---

## 实施清单

### Task 1: 类型更新

- 更新 `kernel/web/src/api/types.ts`
  - 新增 `NodeType` 类型
  - 扩展 `ProcessNode` 接口

### Task 2: 新建 NodeCard 组件

- 创建 `kernel/web/src/components/ui/NodeCard.tsx`
  - Header 区域（折叠/展开按钮、状态 dot、标题、badge）
  - `[plan]` 区域（紫色左边框）
  - Input 区域
  - Outputs 区域（可折叠/展开）
  - 内联节点标记（折叠状态）
  - Actions 折叠标记
  - Summary 区域
  - 折叠/展开状态管理

### Task 3: 新建 InlineNode 组件

- 创建 `kernel/web/src/components/ui/InlineNode.tsx`
  - 支持三种类型：`inline_before`、`inline_after`、`inline_reflect`
  - 不同类型对应不同颜色
  - 开始/结束标记
  - 嵌入 ActionCard 时间线

### Task 4: 重构 ProcessView 为 TimelineView

- 修改 `kernel/web/src/features/ProcessView.tsx`
  - 从双栏改为单栏时间线
  - 按时间顺序排列 NodeCard
  - 内联节点嵌入父节点展开状态
  - 可选的 MiniTree 侧边栏（可配置显示/隐藏）

### Task 5: MiniTree 调整

- 修改 `kernel/web/src/features/ProcessView.tsx` 中的 `MiniTree` 组件
  - 过滤内联节点，不独立显示
  - 父节点显示"包含内联节点"标记

### Task 6: 测试与验证

- 端到端测试：创建包含内联节点的 session
- 验证折叠/展开交互
- 验证 plan、outputs 展示
- 验证内联节点颜色区分

---

## 视觉参考

### 颜色方案

| 用途 | 颜色值 | 说明 |
|------|--------|------|
| 状态 done | `#22c55e` | 绿色 |
| 状态 doing | `#f59e0b` | 琥珀色（带呼吸动画） |
| 状态 todo | `#d1d5db` | 灰色 |
| plan 左边框 | `#8b5cf6` | 紫色 |
| plan 文字 | `#4c1d95` | 深紫色 |
| badge doing | `#dbeafe` 背景 | 浅蓝色 |
| badge done | `#dcfce7` 背景 | 浅绿色 |
| inline_before 背景 | `#fffbeb` | 浅琥珀色 |
| inline_after 背景 | `#ecfdf5` | 浅翠绿色 |
| inline_reflect 背景 | `#faf5ff` | 浅紫色 |
| 分隔线 | `#f3f4f6` | 浅灰色 |
| 主卡片背景 | `#ffffff` | 白色 |
| Header 背景 | `#fafafa` | 浅灰色 |

---

## 相关文档

- `docs/superpowers/specs/2026-03-31-cognitive-stack-api-redesign.md` — 认知栈 API 重构设计
- `kernel/src/types/process.ts` — 后端类型定义
- `kernel/web/src/features/ProcessView.tsx` — 现有组件
