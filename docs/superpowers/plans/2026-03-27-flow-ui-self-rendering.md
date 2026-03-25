# Flow UI 自渲染 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable OOC objects to write React TSX components during Flow execution, rendered dynamically by the frontend via Vite HMR.

**Architecture:** Refactor `DynamicStoneUI` into a generic `DynamicUI` loader that handles both Stone-level (`stones/{name}/shared/ui/`) and Flow-level (`flows/{sid}/flows/{name}/shared/ui/`) dynamic imports. Add Flow UI entry points in FlowView (new UI tab) and SessionFileTree (virtual node). Delete ReportView and migrate supervisor's reporter trait from Markdown to TSX.

**Tech Stack:** React, Vite (dynamic import + HMR + path alias), Jotai, TypeScript

---

## Chunk 1: Foundation — Vite Config + DynamicUI + Types

### Task 1: Vite config — add `fs.allow` and `@ooc` alias

**Files:**
- Modify: `.ooc/web/vite.config.ts`

- [ ] **Step 1: Replace vite.config.ts with updated config**

This is a full file replacement. Adds `import path`, `resolve.alias` for `@ooc`, and `"../flows"` to `fs.allow`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@ooc": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
    fs: {
      allow: [
        ".",
        "../stones",
        "../flows",
      ],
    },
  },
});
```

- [ ] **Step 2: Verify Vite still starts**

Run: `cd .ooc/web && npx vite --version`
Expected: prints version without error (config syntax is valid)

- [ ] **Step 3: Commit**

```bash
git add .ooc/web/vite.config.ts
git commit -m "feat: vite config — add ../flows fs.allow and @ooc path alias"
```

### Task 2: Add `FlowUIProps` type

**Files:**
- Modify: `.ooc/web/src/types/stone-ui.ts`

- [ ] **Step 1: Add FlowUIProps export**

Append to the end of `stone-ui.ts`:

```typescript
/** Flow 级别自渲染 UI 的 Props */
export interface FlowUIProps {
  sessionId: string;
  objectName: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add .ooc/web/src/types/stone-ui.ts
git commit -m "feat: add FlowUIProps type"
```

### Task 3: Refactor DynamicStoneUI → DynamicUI

**Files:**
- Create: `.ooc/web/src/features/DynamicUI.tsx`
- Delete: `.ooc/web/src/features/DynamicStoneUI.tsx`
- Modify: `.ooc/web/src/features/ViewRouter.tsx`

- [ ] **Step 1: Create `DynamicUI.tsx` as a new file**

Create `.ooc/web/src/features/DynamicUI.tsx` with this content:

```tsx
/**
 * DynamicUI — 统一动态加载自渲染 UI 组件
 *
 * 支持 Stone 级别和 Flow 级别的动态 import：
 * - Stone: ../../../stones/{name}/shared/ui/index.tsx
 * - Flow:  ../../../flows/{sid}/flows/{name}/shared/ui/index.tsx
 *
 * @ref .ooc/docs/哲学文档/gene.md#G11 — implements — 对象 UI 自我表达
 */
import React, { Component, Suspense, useMemo } from "react";

/** Error Boundary for dynamic UI */
interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class UIErrorBoundary extends Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

/**
 * 通用动态 UI 加载器
 *
 * @param importPath - 相对于 .ooc/web/src/features/ 的 import 路径
 * @param componentProps - 传给加载到的组件的 props
 * @param fallback - 加载失败时的降级视图（可选）
 */
export function DynamicUI({
  importPath,
  componentProps,
  fallback,
}: {
  importPath: string;
  componentProps: Record<string, unknown>;
  fallback?: React.ReactNode;
}) {
  const errorFallback = fallback ?? (
    <div className="p-4 text-sm text-red-500">
      自渲染 UI 加载失败
    </div>
  );

  const LazyComponent = useMemo(() => {
    return React.lazy(async () => {
      try {
        const mod = await import(/* @vite-ignore */ importPath);
        return { default: mod.default as React.ComponentType<any> };
      } catch {
        return {
          default: () => errorFallback as React.ReactElement,
        };
      }
    });
  }, [importPath]);

  return (
    <UIErrorBoundary fallback={errorFallback}>
      <Suspense
        fallback={
          <div className="p-4 text-sm text-muted-foreground">加载自渲染 UI...</div>
        }
      >
        <LazyComponent {...componentProps} />
      </Suspense>
    </UIErrorBoundary>
  );
}
```

- [ ] **Step 2: Update ViewRouter imports and usage**

In `.ooc/web/src/features/ViewRouter.tsx`:

Change import (line 17):
```typescript
// Before:
import { DynamicStoneUI } from "./DynamicStoneUI";
// After:
import { DynamicUI } from "./DynamicUI";
```

Update usage (lines 96-101):
```tsx
// Before:
<DynamicStoneUI
  objectName={name}
  props={stoneUIProps}
  fallback={<ObjectDetail objectName={name} />}
/>
// After:
<DynamicUI
  importPath={`../../../stones/${name}/shared/ui/index.tsx`}
  componentProps={stoneUIProps}
  fallback={<ObjectDetail objectName={name} />}
/>
```

- [ ] **Step 3: Delete old DynamicStoneUI.tsx**

```bash
rm .ooc/web/src/features/DynamicStoneUI.tsx
```

- [ ] **Step 4: Verify no TypeScript errors**

Run: `cd .ooc/web && npx tsc --noEmit 2>&1 | head -20`
Expected: no errors related to DynamicUI/DynamicStoneUI

- [ ] **Step 5: Commit**

```bash
git add .ooc/web/src/features/DynamicUI.tsx .ooc/web/src/features/ViewRouter.tsx
git rm .ooc/web/src/features/DynamicStoneUI.tsx
git commit -m "refactor: DynamicStoneUI → DynamicUI generic loader"
```

## Chunk 2: Flow UI Entry Points + Delete ReportView

### Task 4: ViewRouter — add flow-ui route, remove report route

**Files:**
- Modify: `.ooc/web/src/features/ViewRouter.tsx`

All changes in this task are applied to the same file in sequence.

- [ ] **Step 1: Update parseRoute return type and add flow-ui match**

Change the return type union from:
```typescript
type: "stone" | "flow-session" | "flow-detail" | "report" | "process-json" | "file";
```
to:
```typescript
type: "stone" | "flow-session" | "flow-detail" | "flow-ui" | "process-json" | "file";
```

Add the flow-ui route match right after the stone readme match (before the old report match):

```typescript
/* flows/{sessionId}/flows/{objectName}/shared/ui — Flow 自渲染 UI */
const flowUIMatch = path.match(/^flows\/([^/]+)\/flows\/([^/]+)\/shared\/ui$/);
if (flowUIMatch) return { type: "flow-ui", sessionId: flowUIMatch[1], objectName: flowUIMatch[2] };
```

- [ ] **Step 2: Remove report match from parseRoute**

Delete these lines (the report match block):
```typescript
/* flows/{sessionId}/report — supervisor 报告 */
const reportMatch = path.match(/^flows\/([^/]+)\/report$/);
if (reportMatch) return { type: "report", sessionId: reportMatch[1] };
```

- [ ] **Step 3: Update ViewRouter component — add flow-ui handler, remove report handler**

Add flow-ui handler (after the stone handler block):
```tsx
if (route.type === "flow-ui" && route.sessionId && route.objectName) {
  const flowImportPath = `../../../flows/${route.sessionId}/flows/${route.objectName}/shared/ui/index.tsx`;
  return (
    <DynamicUI
      importPath={flowImportPath}
      componentProps={{ sessionId: route.sessionId, objectName: route.objectName }}
      fallback={
        <div className="flex items-center justify-center h-full text-sm text-[var(--muted-foreground)]">
          该对象尚未生成自渲染 UI
        </div>
      }
    />
  );
}
```

Remove the report handler block:
```tsx
// DELETE these lines:
if (route.type === "report" && route.sessionId) {
  return <ReportView sessionId={route.sessionId} />;
}
```

- [ ] **Step 4: Remove ReportView import and delete ReportView.tsx**

Remove this import from ViewRouter.tsx:
```typescript
import { ReportView } from "./ReportView";
```

Delete the file:
```bash
rm .ooc/web/src/features/ReportView.tsx
```

- [ ] **Step 5: Verify no TypeScript errors**

Run: `cd .ooc/web && npx tsc --noEmit 2>&1 | head -20`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add .ooc/web/src/features/ViewRouter.tsx
git rm .ooc/web/src/features/ReportView.tsx
git commit -m "feat: ViewRouter — add flow-ui route, remove report route and ReportView"
```

### Task 5: SessionFileTree — replace report node with ui node

**Files:**
- Modify: `.ooc/web/src/features/SessionFileTree.tsx`

- [ ] **Step 1: Replace report virtual node injection with ui virtual node injection**

In the `enhanceTree` function, replace lines 37-50 (the report node block) with the following. Note: the `flowsDir` variable is declared on line 38 of the original code inside this block — it must be preserved for use by both the new ui injection and the existing `.stone` injection at line 53.

Replace:
```typescript
/* 2. 如果 flows/ 下存在 supervisor 目录，注入 report 虚拟节点（与 index 同级） */
const flowsDir = enhanced.children.find(
  (c) => c.type === "directory" && c.name === "flows"
);
const supervisorFlow = flowsDir?.children?.find((c) => c.name === "supervisor");
if (supervisorFlow) {
  const reportNode: FileTreeNode = {
    name: "report",
    type: "file",
    path: `flows/${sessionId}/report`,
    size: 0,
  };
  enhanced.children.splice(1, 0, reportNode);
}
```

With:
```typescript
/* 2. 查找 flows/ 目录 + 为有 shared/ui/ 的 flow 对象注入 ui 虚拟节点 */
const flowsDir = enhanced.children.find(
  (c) => c.type === "directory" && c.name === "flows"
);
if (flowsDir?.children) {
  for (const child of flowsDir.children) {
    if (child.type === "directory" && child.marker === "flow") {
      const hasUI = child.children?.some(
        (c) => c.type === "directory" && c.name === "shared" &&
          c.children?.some((sc) => sc.type === "directory" && sc.name === "ui")
      );
      if (hasUI) {
        const uiNode: FileTreeNode = {
          name: "ui",
          type: "file",
          path: `flows/${sessionId}/flows/${child.name}/shared/ui`,
          size: 0,
        };
        child.children = [uiNode, ...(child.children ?? [])];
      }
    }
  }
}
```

The `flowsDir` declaration is preserved so the `.stone` injection block at line 53 continues to work.

- [ ] **Step 2: Verify no TypeScript errors**

Run: `cd .ooc/web && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add .ooc/web/src/features/SessionFileTree.tsx
git commit -m "feat: SessionFileTree — replace report node with per-object ui node"
```

### Task 6: FlowView — add UI tab

**Files:**
- Modify: `.ooc/web/src/features/FlowView.tsx`

- [ ] **Step 1: Import DynamicUI and fetchSessionTree**

Add imports at top:

```typescript
import { DynamicUI } from "./DynamicUI";
import { fetchSessionTree } from "../api/client";
```

- [ ] **Step 2: Change TABS to be dynamic, add UI tab logic**

Replace the static TABS definition and Tab type (lines 26-27):

```typescript
const BASE_TABS = ["Timeline", "Process"] as const;
type Tab = "Timeline" | "Process" | "UI";
```

Add state for tracking whether UI exists. Inside the `FlowView` component, after the `tab` state (line 31):

```typescript
const [hasUI, setHasUI] = useState(false);
```

Add a check for UI directory existence using the file tree data (not speculative import). After the SSE effect (after line 49):

```typescript
/* 检查该对象是否有 shared/ui/ 目录（通过文件树数据判断） */
useEffect(() => {
  fetchSessionTree(sessionId).then((tree) => {
    const flowsDir = tree.children?.find((c) => c.name === "flows");
    const objectDir = flowsDir?.children?.find((c) => c.name === objectName);
    const sharedDir = objectDir?.children?.find((c) => c.name === "shared");
    const uiDir = sharedDir?.children?.find((c) => c.name === "ui");
    setHasUI(!!uiDir);
  }).catch(() => setHasUI(false));
}, [sessionId, objectName]);

const tabs: Tab[] = hasUI ? [...BASE_TABS, "UI"] : [...BASE_TABS];
```

- [ ] **Step 3: Update tab rendering**

Replace `{TABS.map((t) => (` with `{tabs.map((t) => (` in the JSX (line 108).

Add UI tab content after the Process tab content (after line 152):

```tsx
{tab === "UI" && (
  <DynamicUI
    importPath={`../../../flows/${sessionId}/flows/${objectName}/shared/ui/index.tsx`}
    componentProps={{ sessionId, objectName }}
  />
)}
```

- [ ] **Step 4: Verify no TypeScript errors**

Run: `cd .ooc/web && npx tsc --noEmit 2>&1 | head -20`

- [ ] **Step 5: Commit**

```bash
git add .ooc/web/src/features/FlowView.tsx
git commit -m "feat: FlowView — add UI tab for Flow-level self-rendering"
```

## Chunk 3: Supervisor Trait Migration + Meta Update

### Task 7: Rewrite supervisor reporter trait

**Files:**
- Modify: `.ooc/stones/supervisor/traits/reporter/readme.md`

- [ ] **Step 1: Rewrite the trait**

Replace the entire content. Key changes from original:
- `writeShared("report.md", ...)` → write to `task_shared_dir + "/ui/index.tsx"` using Bun file API
- Preserves hooks section (adapted for TSX)
- Adds available dependencies list and example component

```markdown
---
when: always
---

# UI 自渲染

你可以通过编写 React TSX 组件来为用户展示高度自定义的内容。组件文件写入 `task_shared_dir` 下的 `ui/index.tsx`。

## 写入方式

使用 Bun 文件 API 写入（task_shared_dir 是你在沙箱中可用的路径变量）：

```javascript
const uiDir = task_shared_dir + "/ui";
await Bun.write(uiDir + "/index.tsx", tsxCode);
```

## 规则

1. **任务开始时** — 创建 ui/index.tsx，展示任务标题、初始状态和任务分解
2. **委派时** — 更新组件，记录委派对象和任务描述
3. **收到回复时** — 更新组件，展示进展，标记已完成步骤
4. **任务结束时** — 更新组件，展示结果摘要，状态改为"已完成"

## hooks

```yaml
when_start: "创建 ui/index.tsx 初始报告组件"
when_wait: "检查 ui/index.tsx 是否已更新到最新状态"
when_finish: "确保 ui/index.tsx 包含最终结果摘要，状态标记为已完成"
```

## 可用依赖

组件可以 import 以下模块（使用 `@ooc` 路径别名）：

- `react` / `jotai` — React 核心
- `lucide-react` — 图标库
- `@ooc/api/client` — 数据获取 API（fetchFlow, fetchSessionTree 等）
- `@ooc/components/ui/*` — 原子组件（MarkdownContent, Badge 等）
- `@ooc/lib/utils` — 工具函数（cn 等）

## 示例

```tsx
import React, { useEffect, useState } from "react";
import { fetchFlow } from "@ooc/api/client";
import { cn } from "@ooc/lib/utils";
import { CheckCircle, Clock, AlertCircle } from "lucide-react";

export default function SupervisorReport({ sessionId, objectName }) {
  const [flow, setFlow] = useState(null);
  useEffect(() => {
    fetchFlow(sessionId).then(setFlow);
  }, [sessionId]);

  if (!flow) return <div style={{ padding: 16, color: "#888" }}>加载中...</div>;

  const tasks = [
    { name: "分析需求", status: "completed" },
    { name: "委派 coder 实现", status: "in_progress" },
    { name: "汇总结果", status: "pending" },
  ];

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <h2 style={{ fontSize: 20, fontWeight: 600 }}>任务进展</h2>
      <p style={{ color: "#666", marginTop: 4 }}>状态: {flow.status}</p>
      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
        {tasks.map((t) => (
          <div key={t.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {t.status === "completed" && <CheckCircle size={16} color="green" />}
            {t.status === "in_progress" && <Clock size={16} color="orange" />}
            {t.status === "pending" && <AlertCircle size={16} color="#ccc" />}
            <span>{t.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## 注意

- 每次更新都是**全量覆写** ui/index.tsx
- 组件必须 `export default` 一个 React 组件
- 不要省略历史进展记录
- 即使任务失败也要更新 UI，标注失败原因
- UI 面向人类用户，注重可读性和视觉层次
```

- [ ] **Step 2: Commit**

```bash
git add .ooc/stones/supervisor/traits/reporter/readme.md
git commit -m "feat: supervisor reporter trait — migrate from report.md to TSX self-rendering"
```

### Task 8: Update meta.md 子树 6

**Files:**
- Modify: `docs/哲学文档/meta.md` (子树 6 section only)

- [ ] **Step 1: Read meta.md and apply these exact edits**

Edit 1 — SessionFileTree virtual nodes (line 476):
```
// Before:
│   │       │       注入虚拟节点：index（session 入口）、report（报告）、.stone（对象源）
// After:
│   │       │       注入虚拟节点：index（session 入口）、ui（自渲染 UI）、.stone（对象源）
```

Edit 2 — ViewRouter routes (lines 495-498):
```
// Before:
│   ├── stones/{name}          → StoneView（ObjectDetail 或 DynamicStoneUI）
│   ├── flows/{sessionId}      → ChatView（ChatPage）
│   ├── flows/{sid}/flows/{name} → FlowView（Flow 详情）
│   ├── flows/{sid}/report     → ReportView（Supervisor 报告）
// After:
│   ├── stones/{name}          → StoneView（ObjectDetail 或 DynamicUI）
│   ├── flows/{sessionId}      → ChatView（ChatPage）
│   ├── flows/{sid}/flows/{name} → FlowView（Flow 详情，含 UI Tab）
│   ├── flows/{sid}/flows/{name}/shared/ui → DynamicUI（Flow 自渲染 UI）
```

Edit 3 — StoneView DynamicStoneUI reference (line 520):
```
// Before:
│   │   │   ObjectDetail 或 DynamicStoneUI（自渲染优先）
// After:
│   │   │   ObjectDetail 或 DynamicUI（自渲染优先）
```

Edit 4 — DynamicStoneUI entry (lines 534-536):
```
// Before:
│   │   └── DynamicStoneUI ── 对象自渲染 UI 加载器
│   │           Vite 动态 import stones/{name}/shared/ui/index.tsx
│   │           渲染失败自动降级到 ObjectDetail
// After:
│   │   └── DynamicUI ── 统一动态 UI 加载器（Stone + Flow）
│   │           Vite 动态 import（@vite-ignore）
│   │           渲染失败自动降级到 fallback
```

Edit 5 — FlowView tabs (lines 541-542):
```
// Before:
│   │   ├── TimelineTab ── 时间线（消息 + actions 按时间排序）
│   │   └── ProcessTab ── 行为树视图（复用 ProcessView）
// After:
│   │   ├── TimelineTab ── 时间线（消息 + actions 按时间排序）
│   │   ├── ProcessTab ── 行为树视图（复用 ProcessView）
│   │   └── UITab ── Flow 自渲染 UI（DynamicUI 加载 shared/ui/index.tsx）
```

Edit 6 — Remove ReportView (lines 549-550):
```
// DELETE these lines:
│   └── ReportView（报告视图）── Supervisor 的 report.md 展示
│           SSE 事件驱动自动刷新
```

- [ ] **Step 2: Verify the edits are consistent**

Grep for any remaining references to `DynamicStoneUI` or `ReportView` in meta.md:
```bash
grep -n "DynamicStoneUI\|ReportView" docs/哲学文档/meta.md
```
Expected: no matches

- [ ] **Step 3: Commit**

```bash
git add docs/哲学文档/meta.md
git commit -m "docs: update meta.md 子树 6 — DynamicUI, Flow UI tab, remove ReportView"
```
