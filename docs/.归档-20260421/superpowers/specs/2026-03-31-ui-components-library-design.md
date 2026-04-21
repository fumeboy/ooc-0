---
name: UI Components Library Design
description: OOC Object 自渲染 UI 组件库设计文档 — 封装 CodeAgent、数据展示、关系导航三类场景的可复用组件
type: reference
created: 2026-03-31
---

# OOC UI 组件库设计文档

## 概述

为了丰富 OOC Object 的自渲染 UI 表达能力，需要封装一批可复用的 UI 组件，放置在 `kernel/web/src/components/ui/` 目录下。对象可以在自己的 `ui/index.tsx` 中导入这些组件来构建自定义界面。

### 设计原则

1. **零侵入性** — 组件仅依赖现有技术栈（React + Tailwind + CodeMirror），不引入大型外部库
2. **与现有主题一致** — 使用 CSS Variables (`--background`, `--foreground`, `--accent` 等)，自动适配亮暗主题
3. **类型安全** — 完整的 TypeScript 类型定义
4. **可组合** — 组件之间可嵌套组合使用

### 优先级

| 优先级 | 场景 | 组件 |
|--------|------|------|
| **P0 (迫切)** | CodeAgent | FileDiffViewer, CodeChangeSet |
| **P1 (迫切)** | 数据展示 | JsonTreeViewer, DataTable, KeyValuePanel |
| **P2** | 关系导航 | ActivityFeed, MentionPicker, RelationList |

---

## P0: CodeAgent 场景组件

### 1. FileDiffViewer

文件 Diff 对比组件，基于 `@codemirror/merge` 实现。

#### 用途

- CodeAgent 展示单个文件的修改前后对比
- PR/MR 风格的代码审查视图
- 配置文件变更对比

#### Props 接口

```typescript
interface FileDiffViewerProps {
  /** 旧版本内容 */
  oldContent: string;
  /** 新版本内容 */
  newContent: string;
  /** 文件语言，用于语法高亮: js, ts, tsx, json, md 等 */
  language?: string;
  /** 视图模式：分栏或统一视图 */
  viewMode?: "split" | "unified";
  /** 文件名（可选，用于标题展示） */
  fileName?: string;
  /** 是否显示行号 */
  showGutter?: boolean;
  /** 是否允许折叠未修改的代码块 */
  collapseUnchanged?: boolean;
}
```

#### 依赖

需要新增 npm 依赖：
```json
{
  "@codemirror/merge": "^6.0.0"
}
```

#### 与现有 CodeMirrorViewer 共享

主题配置（`oocTheme`）从 `CodeMirrorViewer.tsx` 提取到一个共享模块，供两个组件使用。

### 2. CodeChangeSet

多文件变更集组件，展示文件列表 + 选中文件的 Diff。

#### 用途

- CodeAgent 展示批量文件修改（如重构场景）
- Git 风格的变更集概览
- Supervisor 任务看板中的代码变更摘要

#### 数据类型

```typescript
type FileChangeStatus = "added" | "modified" | "deleted" | "renamed";

interface FileChange {
  /** 文件路径 */
  path: string;
  /** 变更类型 */
  status: FileChangeStatus;
  /** 新增行数 */
  additions: number;
  /** 删除行数 */
  deletions: number;
  /** 旧版本内容（modified/deleted/renamed 时需要） */
  oldContent?: string;
  /** 新版本内容（added/modified/renamed 时需要） */
  newContent?: string;
  /** 重命名时的旧路径 */
  oldPath?: string;
}
```

#### Props 接口

```typescript
interface CodeChangeSetProps {
  /** 文件变更列表 */
  changes: FileChange[];
  /** 当前选中的文件路径 */
  selectedPath?: string;
  /** 文件选择回调 */
  onSelect?: (path: string) => void;
  /** 是否默认收起文件列表 */
  collapsed?: boolean;
  /** 是否显示统计信息（总变更数、+/-行数） */
  showStats?: boolean;
  /** 最大高度 */
  maxHeight?: string;
}
```

#### 组件结构

```
┌────────────────────────────────────────────────────┐
│  已修改 5 个文件  │  +62  │  -18                  │
├───────────────────┬────────────────────────────────┤
│  M src/user.ts    │                                │
│     +12/-3        │  FileDiffViewer (split mode)  │
├───────────────────┤  src/user.ts                   │
│  A src/profile.ts │                                │
│     +45           │  [OLD]          │ [NEW]       │
├───────────────────┤  - function...   │ + function..│
│  D src/old.ts     │  ...             │ ...        │
│     -23           │                                │
├───────────────────┤                                │
│  R src/config.tsx │                                │
│     +8/-8         │                                │
└───────────────────┴────────────────────────────────┘
```

---

## P1: 数据展示场景组件

### 3. JsonTreeViewer

交互式 JSON 树状查看器。

#### 用途

- 展示复杂嵌套的 `data.json`
- 调试时查看对象内部状态
- 配置项结构化展示

#### 功能特性

- 递归展开/折叠节点
- 类型颜色区分：
  - `string`: 蓝色
  - `number`: 橙色
  - `boolean`: 红色
  - `null`: 灰色
  - `object`/`array`: 紫色
- 悬停高亮 + 点击复制节点路径
- 数组/对象大小提示（如 `Array[3]`）
- 搜索词高亮

#### Props 接口

```typescript
interface JsonTreeViewerProps {
  /** 要展示的数据 */
  data: unknown;
  /** 默认展开深度，默认 1（仅展开根节点） */
  defaultExpandDepth?: number;
  /** 搜索词（匹配节点高亮） */
  searchTerm?: string;
  /** 节点点击回调，返回节点路径字符串 */
  onSelectPath?: (path: string) => void;
  /** 最大高度，超出后滚动 */
  maxHeight?: string;
}
```

#### 使用示例

```tsx
<JsonTreeViewer
  data={{
    name: "CodeAgent",
    active: true,
    tasks: ["refactor", "test"],
    config: { timeout: 30000 }
  }}
  defaultExpandDepth={2}
/>
```

### 4. DataTable

可排序、可过滤的数据表格组件。

#### 用途

- 任务列表展示
- 对象目录列表
- 执行历史记录
- 任何结构化数据展示

#### 数据类型

```typescript
interface Column<T> {
  /** 列标识 */
  key: string;
  /** 表头显示文本 */
  header: string;
  /** 列宽度 */
  width?: string | number;
  /** 是否可排序 */
  sortable?: boolean;
  /** 自定义渲染函数 */
  render?: (row: T) => React.ReactNode;
  /** 对齐方式 */
  align?: "left" | "center" | "right";
}
```

#### Props 接口

```typescript
interface DataTableProps<T> {
  /** 列定义 */
  columns: Column<T>[];
  /** 数据行 */
  data: T[];
  /** 行唯一键，可以是字段名或函数 */
  rowKey: keyof T | ((row: T) => string);

  // 排序
  /** 当前排序列 */
  sortKey?: string;
  /** 排序方向 */
  sortDirection?: "asc" | "desc";
  /** 排序回调 */
  onSort?: (key: string, direction: "asc" | "desc") => void;

  // 选择
  /** 是否可选择行 */
  selectable?: boolean;
  /** 已选中的行 key */
  selectedKeys?: string[];
  /** 选择回调 */
  onSelect?: (keys: string[]) => void;

  // 交互
  /** 行点击回调 */
  onRowClick?: (row: T) => void;
  /** 是否悬停高亮，默认 true */
  hoverable?: boolean;

  // 空状态
  /** 空数据时显示文本 */
  emptyText?: string;
}
```

#### 使用示例

```tsx
interface Task {
  id: string;
  name: string;
  status: "done" | "in_progress" | "pending";
  updated: Date;
}

<DataTable<Task>
  columns={[
    { key: "id", header: "ID", width: 80 },
    { key: "name", header: "Name", sortable: true },
    {
      key: "status",
      header: "Status",
      render: (row) => <Badge status={row.status}>{row.status}</Badge>
    },
    { key: "updated", header: "Updated", sortable: true }
  ]}
  data={tasks}
  rowKey="id"
  onRowClick={(task) => navigateToTask(task.id)}
/>
```

### 5. KeyValuePanel

简洁的键值对面板组件。

#### 用途

- 展示 `data.json` 中的扁平数据
- 对象状态概览
- 配置项展示

比 `JsonTreeViewer` 更轻量、更易读，适合扁平结构。

#### 数据类型

```typescript
interface KeyValueItem {
  /** 键名 */
  key: string;
  /** 值 */
  value: React.ReactNode;
  /** 显示名称（可选，不填用 key） */
  label?: string;
  /** 值类型，用于格式化显示 */
  type?: "string" | "number" | "boolean" | "date" | "array";
}
```

#### Props 接口

```typescript
interface KeyValuePanelProps {
  /** 键值对列表 */
  items: KeyValueItem[];
  /** 布局模式 */
  layout?: "grid" | "list";
  /** Grid 模式的列数，默认 2 */
  columns?: number;
  /** 面板标题 */
  title?: string;
  /** 是否可折叠 */
  collapsible?: boolean;
  /** 默认是否折叠 */
  defaultCollapsed?: boolean;
}
```

#### 使用示例

```tsx
<KeyValuePanel
  title="对象状态"
  layout="grid"
  columns={2}
  items={[
    { key: "name", label: "名称", value: "CodeAgent" },
    { key: "status", label: "状态", value: <Badge status="active">运行中</Badge> },
    { key: "activeTasks", label: "活跃任务", value: 3, type: "number" },
    { key: "lastUpdate", label: "最后更新", value: new Date(), type: "date" }
  ]}
/>
```

---

## P2: 关系与导航场景组件

### 6. ActivityFeed

活动时间线组件。

#### 用途

- Session 级事件流展示
- 对象变更历史
- 协作消息记录
- Supervisor 全局活动概览

#### 数据类型

```typescript
type ActivityEventType =
  | "action"      // 对象执行 action
  | "talk"        // 对象间发送消息
  | "state_change" // 状态变更
  | "effect"      // 副作用操作
  | "custom";     // 自定义类型

interface ActivityEvent {
  /** 事件唯一 ID */
  id: string;
  /** 事件类型 */
  type: ActivityEventType;
  /** 时间戳 */
  timestamp: number;
  /** 发起对象名 */
  actor: string;
  /** 事件内容 */
  content: React.ReactNode;

  // talk 类型专用
  /** 接收对象名 */
  recipient?: string;

  // state_change 类型专用
  /** 变更前状态 */
  fromState?: string;
  /** 变更后状态 */
  toState?: string;

  // 自定义图标
  icon?: React.ReactNode;
}
```

#### Props 接口

```typescript
interface ActivityFeedProps {
  /** 事件列表 */
  events: ActivityEvent[];
  /** 加载更多回调 */
  loadMore?: () => void;
  /** 是否还有更多数据 */
  hasMore?: boolean;
  /** 是否正在加载 */
  loading?: boolean;
  /** 事件点击回调 */
  onEventClick?: (event: ActivityEvent) => void;
  /** 最大高度 */
  maxHeight?: string;
  /** 空状态文本 */
  emptyText?: string;
}
```

#### 视觉设计

```
  ┌──┐
  │●│  2 min ago      CodeAgent 修改了 src/user.ts (+12/-3)
  └──┘
   │
  ┌──┐
  │●│  5 min ago      Supervisor 分配任务给 TestAgent
  └──┘
   │
  ┌──┐
  │●│  10 min ago     TestAgent 完成了测试套件，全部通过 ✅
  └──┘
```

### 7. MentionPicker

@ 对象选择器组件。

#### 用途

- 消息输入框中 `@` 提及对象
- 快速选择要通信的目标对象
- 任务分配时选择执行者

#### 数据类型

```typescript
interface ObjectOption {
  /** 对象名 */
  name: string;
  /** 简短描述 */
  description?: string;
  /** 用于分类筛选的 traits */
  traits?: string[];
  /** 头像颜色（可选，不填自动生成） */
  color?: string;
}
```

#### Props 接口

```typescript
interface MentionPickerProps {
  /** 可选对象列表 */
  objects: ObjectOption[];
  /** 当前搜索词 */
  searchQuery: string;
  /** 搜索回调 */
  onSearch: (query: string) => void;
  /** 选择回调 */
  onSelect: (obj: ObjectOption) => void;
  /** 关闭回调 */
  onClose: () => void;
  /** 是否显示 */
  isOpen: boolean;
  /** 定位坐标（相对于输入框光标） */
  position?: { x: number; y: number };
  /** 最大显示条数，默认 8 */
  maxItems?: number;
  /** 已选中的对象名（高亮） */
  selectedNames?: string[];
}
```

### 8. RelationList

对象关系列表组件（第一期简化版，替代复杂的 RelationGraph）。

#### 用途

- 展示对象的社交关系
- 对象间的依赖连接
- 父子关系、协作关系等

#### 数据类型

```typescript
type RelationType =
  | "friend"        // 友好关系
  | "child"         // 子对象
  | "parent"        // 父对象
  | "collaborator"  // 协作者
  | "custom";       // 自定义

interface Relation {
  /** 目标对象名 */
  target: string;
  /** 关系类型 */
  type: RelationType;
  /** 自定义标签（可选） */
  label?: string;
  /** 关系描述 */
  description?: string;
}
```

#### Props 接口

```typescript
interface RelationListProps {
  /** 关系列表 */
  relations: Relation[];
  /** 当前对象名（用于视角） */
  objectName: string;
  /** 关系点击回调 */
  onRelationClick?: (rel: Relation) => void;
  /** 跳转到目标对象 */
  onNavigate?: (targetName: string) => void;
  /** 按类型过滤 */
  filterType?: RelationType;
  /** 空状态文本 */
  emptyText?: string;
  /** 是否显示类型标签 */
  showTypeLabels?: boolean;
}
```

---

## 目录结构

```
kernel/web/src/components/ui/
├── CodeMirrorViewer.tsx    # 现有，优化主题共享
├── FileDiffViewer.tsx      # 新增 - 文件 Diff
├── CodeChangeSet.tsx       # 新增 - 多文件变更集
├── JsonTreeViewer.tsx      # 新增 - JSON 树
├── DataTable.tsx           # 新增 - 数据表格
├── KeyValuePanel.tsx       # 新增 - 键值对面板
├── ActivityFeed.tsx        # 新增 - 活动时间线
├── MentionPicker.tsx       # 新增 - @ 对象选择
├── RelationList.tsx        # 新增 - 关系列表
└── codemirror/
    └── theme.ts            # 新增 - 共享 CodeMirror 主题
```

---

## 实现顺序

### Phase 1: CodeAgent 场景 (P0)

1. 提取 CodeMirror 主题到 `codemirror/theme.ts`
2. 安装 `@codemirror/merge` 依赖
3. 实现 `FileDiffViewer`
4. 实现 `CodeChangeSet`

### Phase 2: 数据展示场景 (P1)

5. 实现 `JsonTreeViewer`
6. 实现 `KeyValuePanel`
7. 实现 `DataTable`

### Phase 3: 关系与导航场景 (P2)

8. 实现 `ActivityFeed`
9. 实现 `MentionPicker`
10. 实现 `RelationList`

---

## 测试策略

每个组件需要：
1. **渲染测试** — 验证基础渲染
2. **交互测试** — 验证用户交互（点击、展开、选择等）
3. **Props 边界测试** — 空数据、各种边缘情况

使用项目现有的测试框架（bun:test + React Testing Library）。

---

## 文档与示例

每个组件需要：
1. 完整的类型注释
2. 使用示例（在 Storybook 或独立 example 文件中）
3. 与现有组件的组合使用示例

---

## 变更记录

| 日期 | 版本 | 变更 |
|------|------|------|
| 2026-03-31 | 1.0 | 初始设计文档 |
