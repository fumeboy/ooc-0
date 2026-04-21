# ProcessView 时间线重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 ProcessView 从双栏布局重构为一维时间线，支持 Node 卡片式折叠/展开，展示内联节点和新的认知栈 API 信息

**Architecture:**
- 基于现有 ActionCard 组件扩展样式
- 新增 NodeCard 组件处理折叠/展开逻辑
- 重构 ProcessView 为单栏时间线布局
- MiniTree 调整为不独立显示内联节点

**Tech Stack:** React 18 + TypeScript + Vite + Jotai (位于 kernel/web/)

---

## 文件修改清单

| 文件 | 修改类型 | 说明 |
|------|---------|------|
| `kernel/web/src/api/types.ts` | 修改 | 新增 NodeType、扩展 ProcessNode |
| `kernel/web/src/components/ui/NodeCard.tsx` | 新建 | Node 卡片组件（折叠/展开） |
| `kernel/web/src/components/ui/InlineNode.tsx` | 新建 | 内联节点组件 |
| `kernel/web/src/features/ProcessView.tsx` | 重写 | 重构为单栏时间线 |

---

## Task 1: 前端类型更新

**Files:**
- Modify: `kernel/web/src/api/types.ts`

**Step 1: 新增 NodeType 类型**

在 `ProcessNode` 接口上方添加：

```typescript
/** 节点类型（区分普通子栈帧和内联子节点） */
export type NodeType =
  | "frame"           // 普通子栈帧（默认）
  | "inline_before"   // before 内联子节点（hook 自动触发）
  | "inline_after"    // after 内联子节点（hook 自动触发）
  | "inline_reflect"; // reflect 内联子节点（主动触发）
```

**Step 2: 扩展 ProcessNode 接口**

修改 `ProcessNode` 接口，新增以下字段：

```typescript
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

**Step 3: 验证类型编译**

Run: `cd /Users/bytedance/x/ooc/ooc-1/kernel/web && bunx tsc --noEmit`

Expected: No TypeScript errors

**Step 4: Commit**

```bash
cd /Users/bytedance/x/ooc/ooc-1
git add kernel/web/src/api/types.ts
git commit -m "feat(web): add NodeType and extend ProcessNode"
```

---

## Task 2: 新建 NodeCard 组件

**Files:**
- Create: `kernel/web/src/components/ui/NodeCard.tsx`
- Reference: `kernel/web/src/components/ui/ActionCard.tsx` (样式参考)

**Step 1: 创建组件基础结构**

```typescript
/**
 * NodeCard - 单个节点卡片组件
 *
 * 展示单个 ProcessNode 的完整信息，支持折叠/展开。
 * 折叠时：只展示 plan、input、outputs 标记、summary
 * 展开时：展示完整 actions 时间线、内联节点
 */
import { useState } from "react";
import { cn } from "../../lib/utils";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { ProcessNode } from "../../api/types";

interface NodeCardProps {
  node: ProcessNode;
  /** 是否默认展开 */
  defaultExpanded?: boolean;
  /** 是否为当前 focus 节点 */
  isFocus?: boolean;
  /** 点击展开/展开回调 */
  onToggle?: () => void;
}

// 状态颜色
const STATUS_COLORS = {
  done: "#22c55e",
  doing: "#f59e0b",
  todo: "#d1d5db",
};

const STATUS_BADGE_COLORS = {
  done: { bg: "#dcfce7", text: "#166534" },
  doing: { bg: "#dbeafe", text: "#1d4ed8" },
  todo: { bg: "#f3f4f6", text: "#6b7280" },
};

export function NodeCard({ node, defaultExpanded = false, isFocus = false, onToggle }: NodeCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const handleToggle = () => {
    setExpanded(!expanded);
    onToggle?.();
  };

  const statusColor = STATUS_COLORS[node.status];
  const badgeColor = STATUS_BADGE_COLORS[node.status];

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white mb-4">
      {/* Header */}
      <div
        className="flex items-center px-3.5 py-2.5 bg-gray-50 border-b border-gray-100 cursor-pointer"
        onClick={handleToggle}
      >
        {/* 折叠/展开按钮 */}
        <span className="mr-2 text-gray-500 text-base">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </span>

        {/* 状态 dot */}
        <span
          className="w-2.5 h-2.5 rounded-full mr-2.5"
          style={{
            backgroundColor: statusColor,
            animation: node.status === "doing" ? "pulse 2s infinite" : "none"
          }}
        />

        {/* 标题 */}
        <span className={cn("font-semibold text-gray-900", isFocus && "text-blue-600")}>
          {node.title}
        </span>

        {/* 状态 badge */}
        <span
          className="ml-3 px-2 py-0.5 rounded-full text-xs"
          style={{ backgroundColor: badgeColor.bg, color: badgeColor.text }}
        >
          {node.status}
        </span>

        {/* Actions 数量 */}
        {node.actions.length > 0 && (
          <span className="ml-auto text-xs text-gray-400">
            {node.actions.length} {node.actions.length === 1 ? "action" : "actions"}
          </span>
        )}
      </div>

      {/* 内容区域 */}
      <div className="px-4 py-3">
        {/* [plan] 区域 */}
        {node.plan && (
          <div className="mb-3 pl-1 border-l-2 border-purple-500">
            <div className="text-xs text-purple-700 font-semibold mb-1">[plan]</div>
            <div className="text-sm text-purple-900 leading-relaxed whitespace-pre-wrap">
              {node.plan}
            </div>
          </div>
        )}

        {/* 分隔线 */}
        {(node.plan || expanded) && <div className="h-px bg-gray-100 my-3" />}

        {/* 折叠状态内容 */}
        {!expanded ? (
          <CollapsedContent node={node} />
        ) : (
          <ExpandedContent node={node} />
        )}
      </div>
    </div>
  );
}

/* ── 折叠状态内容 ── */
function CollapsedContent({ node }: { node: ProcessNode }) {
  const hasInlineChildren = node.children.some(c => c.type && c.type !== "frame");
  const hasRegularChildren = node.children.some(c => !c.type || c.type === "frame");

  return (
    <>
      {/* Input 区域 */}
      <div className="mb-3">
        <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Input</div>
        <div className="text-sm text-gray-700 leading-relaxed">
          <div><strong>title:</strong> {node.title}</div>
          {node.description && (
            <div className="mt-1 text-gray-500"><strong>description:</strong> {node.description}</div>
          )}
          {node.traits && node.traits.length > 0 && (
            <div className="mt-1"><strong>traits:</strong> {node.traits.join(", ")}</div>
          )}
        </div>
      </div>

      {/* Outputs 区域 */}
      {node.outputs && node.outputs.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center justify-between py-1 cursor-pointer">
            <div className="flex items-center">
              <span className="text-xs text-green-700 font-semibold">Outputs</span>
              <span
                className="ml-2 px-2 py-0.5 rounded-full text-xs"
                style={{ backgroundColor: "#dcfce7", color: "#166534" }}
              >
                {node.outputs.join(", ")}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-gray-500" />
          </div>
        </div>
      )}

      {/* 内联节点标记 */}
      {hasInlineChildren && (
        <div className="mb-3 px-3 py-1.5 rounded text-xs flex items-center justify-between" style={{ backgroundColor: "#fffbeb" }}>
          <div className="flex items-center">
            <span className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: "#f59e0b" }} />
            <span className="font-semibold text-amber-800">[inline]</span>
            <span className="ml-1.5 text-amber-700">
              {node.children.filter(c => c.type && c.type !== "frame").map(c => c.title).join(", ")}
            </span>
          </div>
          <span className="text-amber-700">→</span>
        </div>
      )}

      {/* Actions 折叠标记 */}
      {(node.actions.length > 0 || hasRegularChildren) && (
        <div className="mb-3 px-3 py-1.5 rounded text-xs text-center text-gray-500" style={{ backgroundColor: "#fafafa" }}>
          <span className="font-medium">
            [{node.actions.length} 个 actions
            {hasRegularChildren && ` + ${node.children.filter(c => !c.type || c.type === "frame").length} 个子节点`}]
          </span>
          <span className="ml-2">(点击展开)</span>
        </div>
      )}

      {/* 分隔线 */}
      {node.summary && <div className="h-px bg-gray-100 my-3" />}

      {/* Summary 区域 */}
      {node.summary && (
        <div>
          <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Summary</div>
          <div className="text-sm text-gray-700 leading-relaxed pl-1 border-l-2 border-gray-200 whitespace-pre-wrap">
            {node.summary}
            {node.locals && Object.keys(node.locals).length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-400">
                <strong>artifacts:</strong> {Object.keys(node.locals).join(", ")}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* ── 展开状态内容（占位，在 Task 4 中完善） ── */
function ExpandedContent({ node }: { node: ProcessNode }) {
  return (
    <div className="text-sm text-gray-500">
      展开状态内容
    </div>
  );
}
```

**Step 2: 添加 CSS 动画**

不需要额外 CSS，使用 Tailwind 类和 inline style 即可。

**Step 3: 验证编译**

Run: `cd /Users/bytedance/x/ooc/ooc-1/kernel/web && bunx tsc --noEmit`

Expected: No TypeScript errors

**Step 4: Commit**

```bash
cd /Users/bytedance/x/ooc/ooc-1
git add kernel/web/src/components/ui/NodeCard.tsx
git commit -m "feat(web): add NodeCard component (collapsed state)"
```

---

## Task 3: 新建 InlineNode 组件

**Files:**
- Create: `kernel/web/src/components/ui/InlineNode.tsx`
- Reference: `kernel/web/src/components/ui/ActionCard.tsx`

**Step 1: 创建组件基础结构**

```typescript
/**
 * InlineNode - 内联节点组件
 *
 * 展示 inline_before、inline_after、inline_reflect 类型的节点。
 * 使用浅色背景区分类型，嵌入在父节点的展开内容中。
 */
import { ActionCard } from "./ActionCard";
import type { ProcessNode, NodeType } from "../../api/types";

interface InlineNodeProps {
  node: ProcessNode;
}

// 内联节点类型样式映射
const INLINE_TYPE_STYLES: Record<string, {
  bg: string;
  border: string;
  headerBg: string;
  text: string;
  label: string;
}> = {
  inline_before: {
    bg: "#fffbeb",
    border: "#fde68a",
    headerBg: "#fef3c7",
    text: "#92400e",
    label: "before",
  },
  inline_after: {
    bg: "#ecfdf5",
    border: "#a7f3d0",
    headerBg: "#d1fae5",
    text: "#065f46",
    label: "after",
  },
  inline_reflect: {
    bg: "#faf5ff",
    border: "#e9d5ff",
    headerBg: "#f3e8ff",
    text: "#6b21a8",
    label: "reflect",
  },
};

export function InlineNode({ node }: InlineNodeProps) {
  const nodeType = (node.type || "frame") as NodeType;
  const style = INLINE_TYPE_STYLES[nodeType] || INLINE_TYPE_STYLES.inline_before;

  return (
    <div
      className="rounded-lg mb-4 overflow-hidden border"
      style={{
        backgroundColor: style.bg,
        borderColor: style.border,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-1.5 border-b text-xs font-semibold"
        style={{
          backgroundColor: style.headerBg,
          borderColor: style.border,
          color: style.text,
        }}
      >
        <div className="flex items-center">
          <span className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: style.text }} />
          [inline/{style.label}] {node.title}
        </div>
        <span className="px-2 py-0.5 rounded text-xs">
          {nodeType === "inline_before" || nodeType === "inline_after" ? "hook 自动" : "主动"}
        </span>
      </div>

      {/* Actions 时间线 */}
      {node.actions.length > 0 && (
        <div className="px-4 py-3">
          {node.actions.map((action, i) => (
            <ActionCard key={i} action={action} maxHeight={200} />
          ))}
        </div>
      )}

      {/* Footer */}
      {node.summary && (
        <div
          className="px-3 py-1.5 border-t text-xs"
          style={{
            backgroundColor: style.headerBg,
            borderColor: style.border,
            color: style.text,
          }}
        >
          [inline/{style.label}_end] &nbsp;
          <strong>summary:</strong> {node.summary}
        </div>
      )}
    </div>
  );
}
```

**Step 2: 验证编译**

Run: `cd /Users/bytedance/x/ooc/ooc-1/kernel/web && bunx tsc --noEmit`

Expected: No TypeScript errors

**Step 3: Commit**

```bash
cd /Users/bytedance/x/ooc/ooc-1
git add kernel/web/src/components/ui/InlineNode.tsx
git commit -m "feat(web): add InlineNode component"
```

---

## Task 4: 完善 NodeCard 展开状态

**Files:**
- Modify: `kernel/web/src/components/ui/NodeCard.tsx`
- Use: `kernel/web/src/components/ui/InlineNode.tsx`

**Step 1: 添加必要的 import**

在 `NodeCard.tsx` 顶部添加：

```typescript
import { InlineNode } from "./InlineNode";
import { ActionCard } from "./ActionCard";
```

**Step 2: 替换 ExpandedContent 实现**

替换原有的 `ExpandedContent` 占位实现：

```typescript
/* ── 展开状态内容 ── */
function ExpandedContent({ node }: { node: ProcessNode }) {
  // 区分子节点类型
  const inlineChildren = node.children.filter(c => c.type && c.type !== "frame");
  const regularChildren = node.children.filter(c => !c.type || c.type === "frame");

  return (
    <>
      {/* Input 区域 */}
      <div className="mb-3">
        <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Input</div>
        <div className="text-sm text-gray-700 leading-relaxed">
          <div><strong>title:</strong> {node.title}</div>
          {node.description && (
            <div className="mt-1 text-gray-500"><strong>description:</strong> {node.description}</div>
          )}
          {node.traits && node.traits.length > 0 && (
            <div className="mt-1"><strong>traits:</strong> {node.traits.join(", ")}</div>
          )}
          {node.outputs && node.outputs.length > 0 && (
            <div className="mt-1"><strong>outputs:</strong> {node.outputs.join(", ")}</div>
          )}
          {node.outputDescription && (
            <div className="mt-1 text-gray-500"><strong>outputDescription:</strong> {node.outputDescription}</div>
          )}
        </div>
      </div>

      {/* 分隔线 */}
      <div className="h-px bg-gray-100 my-3" />

      {/* 内联节点（嵌入在 Actions 之前） */}
      {inlineChildren.length > 0 && (
        <div className="mb-3">
          {inlineChildren.map(child => (
            <InlineNode key={child.id} node={child} />
          ))}
        </div>
      )}

      {/* Actions 时间线 */}
      {node.actions.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-gray-500 uppercase font-semibold mb-2">Actions 时间线</div>
          <div className="border-l-2 border-gray-200 ml-3 pl-4 space-y-3">
            {node.actions.map((action, i) => (
              <ActionCard key={i} action={action} maxHeight={200} />
            ))}
          </div>
        </div>
      )}

      {/* 普通子节点 */}
      {regularChildren.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-gray-500 uppercase font-semibold mb-2">子节点</div>
          {regularChildren.map(child => (
            <NodeCard key={child.id} node={child} defaultExpanded={false} />
          ))}
        </div>
      )}

      {/* 分隔线 */}
      {node.summary && <div className="h-px bg-gray-100 my-3" />}

      {/* Summary 区域 */}
      {node.summary && (
        <div>
          <div className="text-xs text-gray-500 uppercase font-semibold mb-1">Summary</div>
          <div className="text-sm text-gray-700 leading-relaxed pl-1 border-l-2 border-gray-200 whitespace-pre-wrap">
            {node.summary}
            {node.locals && Object.keys(node.locals).length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-100 text-xs text-gray-400">
                <strong>artifacts:</strong> {Object.keys(node.locals).join(", ")}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
```

**Step 3: 移除未使用的 import（如果有）**

确保只导入需要的组件。

**Step 4: 验证编译**

Run: `cd /Users/bytedance/x/ooc/ooc-1/kernel/web && bunx tsc --noEmit`

Expected: No TypeScript errors

**Step 5: Commit**

```bash
cd /Users/bytedance/x/ooc/ooc-1
git add kernel/web/src/components/ui/NodeCard.tsx
git commit -m "feat(web): complete NodeCard expanded state"
```

---

## Task 5: 重构 ProcessView 为单栏时间线

**Files:**
- Modify: `kernel/web/src/features/ProcessView.tsx`

**Step 1: 添加必要的 import**

在 `ProcessView.tsx` 顶部添加：

```typescript
import { NodeCard } from "../components/ui/NodeCard";
```

**Step 2: 添加辅助函数**

在组件外部添加辅助函数：

```typescript
/** 构建聚焦路径 */
function buildFocusPath(
  node: ProcessNode,
  focusId: string,
  path: ProcessNode[] = []
): ProcessNode[] | null {
  const newPath = [...path, node];
  if (node.id === focusId) return newPath;

  for (const child of node.children) {
    const result = buildFocusPath(child, focusId, newPath);
    if (result) return result;
  }
  return null;
}
```

**Step 3: 重写 ProcessView 组件主体**

替换 `ProcessView` 组件的 return 部分：

```typescript
export function ProcessView({ process }: ProcessViewProps) {
  const [selectedId, setSelectedId] = useState<string>(() =>
    process?.root ? findDefaultId(process.root, process.focusId) : "",
  );

  if (!process?.root) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-[var(--muted-foreground)]">No process data</p>
      </div>
    );
  }

  // 构建聚焦路径
  const focusPath = buildFocusPath(process.root, process.focusId) || [process.root];

  return (
    <div className="flex gap-0 h-full">
      {/* 主时间线区域 */}
      <div className="flex-1 min-w-0 overflow-auto pr-4">
        {focusPath.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-xs text-[var(--muted-foreground)]">No nodes</p>
          </div>
        ) : (
          <div className="space-y-4 pt-4">
            {focusPath.map((node) => (
              <NodeCard
                key={node.id}
                node={node}
                isFocus={node.id === process.focusId}
                defaultExpanded={node.id === process.focusId}
              />
            ))}
          </div>
        )}
      </div>

      {/* 右栏：MiniTree 节点树缩略视图 */}
      <aside className="w-56 shrink-0 border-l border-[var(--border)] pl-4 overflow-auto">
        <h4 className="text-[10px] font-medium text-[var(--muted-foreground)] uppercase tracking-wide mb-2 pt-4">
          Nodes
        </h4>
        <MiniTree
          node={process.root}
          focusId={process.focusId}
          selectedId={selectedId}
          onSelect={setSelectedId}
          depth={0}
        />
      </aside>
    </div>
  );
}
```

**Step 4: 修改 MiniTree 过滤内联节点**

修改 `MiniTree` 组件：

```typescript
export function MiniTree({
  node, focusId, selectedId, onSelect, depth,
}: {
  node: ProcessNode;
  focusId: string;
  selectedId: string;
  onSelect: (id: string) => void;
  depth: number;
}) {
  // 过滤掉内联节点，不独立显示
  const visibleChildren = node.children.filter(c => !c.type || c.type === "frame");
  const hasInlineChildren = node.children.some(c => c.type && c.type !== "frame");

  const hasChildren = visibleChildren.length > 0;
  const [expanded, setExpanded] = useState(
    node.status === "doing" || node.id === focusId || depth < 2,
  );
  const isSelected = node.id === selectedId;
  const isFocus = node.id === focusId;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1.5 py-1 px-2 rounded text-xs cursor-pointer transition-colors",
          isSelected && "bg-[var(--accent)] font-medium",
          !isSelected && "hover:bg-[var(--accent)]/40",
        )}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => onSelect(node.id)}
      >
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
            className="shrink-0 text-[var(--muted-foreground)]"
          >
            {expanded
              ? <ChevronDown className="w-3 h-3" />
              : <ChevronRight className="w-3 h-3" />
            }
          </button>
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <span className={cn(
          "w-2 h-2 rounded-full shrink-0",
          node.status === "done" ? "bg-green-500" : node.status === "doing" ? "bg-[var(--warm)]" : "bg-[var(--muted-foreground)] opacity-40",
        )} />
        <span className={cn(
          "truncate flex-1",
          node.status === "done" && "text-[var(--muted-foreground)]",
        )}>
          {node.title}
          {hasInlineChildren && (
            <span className="ml-1 text-amber-500 text-[10px]">+inline</span>
          )}
        </span>
        {isFocus && (
          <span className="text-[10px] text-[var(--warm)] shrink-0">(focus-on)</span>
        )}
        {node.actions.length > 0 && (
          <span className="text-[10px] text-[var(--muted-foreground)] shrink-0">
            {node.actions.length}
          </span>
        )}
      </div>

      {expanded && hasChildren && (
        <div>
          {visibleChildren.map((child) => (
            <MiniTree
              key={child.id}
              node={child}
              focusId={focusId}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 5: 验证编译**

Run: `cd /Users/bytedance/x/ooc/ooc-1/kernel/web && bunx tsc --noEmit`

Expected: No TypeScript errors

**Step 6: Commit**

```bash
cd /Users/bytedance/x/ooc/ooc-1
git add kernel/web/src/features/ProcessView.tsx
git commit -m "feat(web): refactor ProcessView to single-column timeline"
```

---

## Task 6: 测试与验证

**Step 1: 构建前端项目**

Run: `cd /Users/bytedance/x/ooc/ooc-1/kernel/web && bun run build`

Expected: Build completes successfully

**Step 2: 验证测试（如有）**

如果前端有测试，运行测试：

Run: `cd /Users/bytedance/x/ooc/ooc-1/kernel/web && bun test`

Expected: All tests pass

**Step 3: 端到端测试（手动）**

1. 启动 OOC 服务器：`bun kernel/src/cli.ts start 8080`
2. 创建一个新会话
3. 触发会创建内联节点的操作（如创建子任务，激活带 before hook 的 trait）
4. 验证：
   - ✅ NodeCard 正确展示 plan、input、outputs、summary
   - ✅ 内联节点用浅色背景区分
   - ✅ 折叠/展开交互正常
   - ✅ MiniTree 不独立显示内联节点
   - ✅ focus 节点默认展开

**Step 4: Commit（如有修改）**

```bash
cd /Users/bytedance/x/ooc/ooc-1
git add -A
git commit -m "test: verify ProcessView timeline redesign"
```

---

## 实施清单摘要

| Task | 组件 | 说明 |
|------|------|------|
| Task 1 | `api/types.ts` | 新增 NodeType、扩展 ProcessNode |
| Task 2 | `NodeCard.tsx` | 新建 Node 卡片组件（折叠状态） |
| Task 3 | `InlineNode.tsx` | 新建内联节点组件 |
| Task 4 | `NodeCard.tsx` | 完善展开状态 |
| Task 5 | `ProcessView.tsx` | 重构为单栏时间线 |
| Task 6 | 测试 | 构建 + 手动验证 |

---

## 依赖关系

```
Task 1 (types)
    ↓
Task 2 (NodeCard collapsed) ──→ Task 3 (InlineNode)
    ↓                                    ↓
Task 4 (NodeCard expanded) ←───────────┘
    ↓
Task 5 (ProcessView refactor)
    ↓
Task 6 (Test)
```
