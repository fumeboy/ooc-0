# Flow UI 自渲染 — 设计文档

> OOC 对象在 Flow 运行时可以为自己编写 React TSX 组件，实现面向人类用户的高度自定义内容展示。

## 背景

当前 supervisor 通过 `writeShared("report.md", markdown)` 写 Markdown 文件，前端 ReportView 用 MarkdownContent 渲染。这种方式表达力有限——无法展示交互式图表、动态状态面板、自定义布局等。

系统中已有两套 Stone 级别的自渲染机制：
- **eager 注册表**（`objects/index.ts`）：构建时通过 `import.meta.glob` 扫描 `stones/*/ui/index.tsx`，用于 ObjectDetail 的 "UI" Tab
- **lazy 动态加载**（`DynamicStoneUI.tsx`）：运行时通过 `React.lazy` 加载 `stones/{name}/shared/ui/index.tsx`，用于 ViewRouter 路由渲染

但没有 Flow 级别的对应能力——对象无法为每个 session 生成独立的自渲染 UI。

## 设计目标

1. OOC 对象可以在两个层级编写自渲染 UI：
   - **Stone 级别**：`stones/{name}/shared/ui/index.tsx`（跨 session 共享，已有机制）
   - **Flow 级别**：`flows/{sessionId}/flows/{objectName}/shared/ui/index.tsx`（每个 session 独立，本次新增）
2. 组件面向人类用户，对象间不消费 UI 信息
3. 组件可以完全访问前端 API（通过 `@ooc` 路径别名 import）
4. Vite dev server 提供 HMR 热更新，对象写文件后前端自动刷新
5. supervisor 的 reporter trait 从写 report.md 迁移为写 Flow 级别 TSX 组件
6. 现有 Stone 级别自渲染保留并存

## 核心设计

### 1. 统一加载器 DynamicUI

将现有 `DynamicStoneUI.tsx`（lazy 动态加载）重构为通用的 `DynamicUI`，服务 Stone 和 Flow 两种场景。

`objects/index.ts` 的 eager 注册表保留不动——它服务 ObjectDetail 的 "UI" Tab，职责不同，不冲突。`DynamicUI` 仅替代 `DynamicStoneUI` 在 ViewRouter 中的角色，并新增 Flow UI 的加载能力。

`DynamicUI.tsx` 必须位于 `features/DynamicUI.tsx`，以确保相对 import 路径正确解析。

```typescript
// DynamicUI.tsx
interface DynamicUIProps {
  importPath: string;       // 动态 import 路径（相对于 kernel/web/src/features/）
  componentProps: any;      // 传给加载到的组件的 props
  fallback: React.ReactNode; // 加载失败时的降级视图
}
```

内部逻辑：
- `React.lazy(() => import(/* @vite-ignore */ importPath))` 动态加载
- `ErrorBoundary` 捕获渲染错误 → 渲染 fallback
- `Suspense` 显示加载状态

调用方传入不同的 importPath：
- Stone UI: `"../../../stones/{name}/shared/ui/index.tsx"`
- Flow UI: `"../../../flows/{sid}/flows/{name}/shared/ui/index.tsx"`

### 2. Props 接口

Stone UI 和 Flow UI 使用不同的 props 类型，DynamicUI 本身不约束 props 类型。现有 `StoneUIProps`（定义在 `types/stone-ui.ts`）保持不变。

```typescript
// 新增
export interface FlowUIProps {
  sessionId: string;
  objectName: string;
  // 组件可自由 import @ooc/* 路径获取更多数据
}
```

Flow UI 的 props 只传最基本的上下文标识。组件内部通过 import 前端 API 自行获取所需数据。

### 3. 文件系统约定

**两个层级的 UI 文件位置：**

| 层级 | 路径 | 写入方式 | 生命周期 |
|------|------|---------|---------|
| Stone | `stones/{name}/shared/ui/index.tsx` | `writeShared("ui/index.tsx", code)` 或直接写 `self_shared_dir` | 跨 session 共享 |
| Flow | `flows/{sid}/flows/{objectName}/shared/ui/index.tsx` | 直接写 `task_shared_dir`（原生文件 API） | 每个 session 独立 |

对象在 ThinkLoop 中可以访问两个路径变量：
- `self_shared_dir` → `stones/{name}/shared/`（Stone 级别）
- `task_shared_dir` → `flows/{sid}/flows/{objectName}/shared/`（Flow 级别）

入口文件必须 default export React 组件。可以写多个 `.tsx` 文件，`index.tsx` 是唯一入口，其他文件通过相对 import 引用。

### 4. 前端展示入口

**入口 1：FlowView 新增 UI Tab**

FlowView 的 Tab 栏从 `[Timeline, Process]` 变为 `[Timeline, Process, UI]`。UI Tab 仅当文件树中存在 `shared/ui/` 目录时显示（通过 SessionFileTree 已有的文件树数据判断），避免对没有自渲染的 flow 对象显示无意义的空 Tab。

**入口 2：SessionFileTree 注入 ui 虚拟节点**

在 `enhanceTree` 中，为有 `shared/ui/` 目录的 flow 对象注入一个 `ui` 虚拟节点。点击后在 Stage 中通过 ViewRouter 渲染 DynamicUI。

**ViewRouter 新增路由规则：**

```
flows/{sessionId}/flows/{objectName}/shared/ui  →  DynamicUI(flowPath, flowProps, fallback)
```

### 5. Vite 配置变更

**fs.allow**：新增 `"../flows"` 以允许 Vite 访问 flow 目录下的 TSX 文件。（`"../stones"` 已存在。）

**路径别名**：新增 `@ooc` alias 指向 `kernel/web/src/`，使 Stone UI 和 Flow UI 组件都可以用简洁路径 import 前端模块：
```typescript
// vite.config.ts resolve.alias
{ "@ooc": path.resolve(__dirname, "src") }
```

这样 UI 组件可以写：
```tsx
import { fetchFlow } from "@ooc/api/client";
import { cn } from "@ooc/lib/utils";
```

而不是脆弱的多层相对路径。Stone UI 和 Flow UI 组件使用相同的 `@ooc` 前缀，import 方式一致。

### 6. 删除 ReportView

- 删除 `features/ReportView.tsx`
- 删除 ViewRouter 中 `flows/{sessionId}/report` 路由
- 删除 SessionFileTree 中 report 虚拟节点的注入逻辑

supervisor 的报告能力通过 Flow UI 的通用机制实现，report 只是 index.tsx 的一种"用途"。

### 7. supervisor reporter trait 改造

将 `stones/supervisor/traits/reporter/readme.md` 从"写 report.md"改为"写 Flow 级别 ui/index.tsx"。

核心变化：
- `writeShared("report.md", markdown)` → 使用原生文件 API 写入 `task_shared_dir + "/ui/index.tsx"`
- trait 中提供 TSX 编写指南：可用的 import 列表和 `@ooc` 路径别名
- 保留报告的结构化要求（任务进展、状态、结果），表达方式从 Markdown 升级为 React 组件
- 提醒 supervisor：UI 面向人类，注重可读性和视觉层次

**可用依赖列表（写入 trait）：**
- `react` / `jotai`
- `lucide-react`（图标）
- `@ooc/api/client`（数据获取）
- `@ooc/components/ui/*`（复用原子组件：MarkdownContent, Badge, ObjectAvatar 等）
- `@ooc/lib/utils`（cn 等工具函数）

**示例组件（写入 trait 作为参考）：**

```tsx
import React, { useEffect, useState } from "react";
import { fetchFlow } from "@ooc/api/client";

export default function SupervisorReport({ sessionId, objectName }) {
  const [flow, setFlow] = useState(null);
  useEffect(() => {
    fetchFlow(sessionId).then(setFlow);
  }, [sessionId]);

  if (!flow) return <div>加载中...</div>;

  return (
    <div style={{ padding: 16 }}>
      <h2>任务进展</h2>
      <p>状态: {flow.status}</p>
      {/* 根据实际需要展示更多内容 */}
    </div>
  );
}
```

### 8. 错误处理与降级

| 场景 | 处理方式 |
|------|---------|
| ui/index.tsx 不存在 | React.lazy import 失败 → ErrorBoundary → fallback |
| TSX 语法错误 | Vite 编译失败 → 同上 |
| 组件运行时崩溃 | ErrorBoundary 捕获 → fallback |
| 组件内 API 调用失败 | 组件自己处理，不影响外层 |

降级视图：显示一行提示 "自渲染 UI 加载失败"。

### 9. 不做的事

- 不做沙箱隔离——组件和主应用共享同一个 React 运行时
- 不做组件版本管理——每次 import 都是最新版本
- 不做组件缓存——由 Vite module cache 管理
- 不做文件存在性预检测——直接尝试 import，失败走降级

## 变更清单

| 文件 | 操作 |
|------|------|
| `features/DynamicStoneUI.tsx` | 重构为通用 `DynamicUI.tsx` |
| `types/stone-ui.ts` | 新增 `FlowUIProps` 导出 |
| `features/FlowView.tsx` | 新增 UI Tab（仅当 shared/ui/ 目录存在时显示） |
| `features/ViewRouter.tsx` | 新增 `flow-ui` 路由，删除 `report` 路由，Stone 路由改用 DynamicUI |
| `features/SessionFileTree.tsx` | 注入 `ui` 虚拟节点，删除 `report` 虚拟节点 |
| `features/ReportView.tsx` | 删除 |
| `objects/index.ts` | 保留不动（eager 注册表继续服务 ObjectDetail 的 UI Tab） |
| `vite.config.ts` | `fs.allow` 新增 `"../flows"`，`resolve.alias` 新增 `@ooc` |
| `supervisor/traits/reporter/readme.md` | 从写 Markdown 改为写 TSX（Flow 级别），包含示例组件 |
| `docs/哲学文档/meta.md` 子树 6 | 更新概念树 |
