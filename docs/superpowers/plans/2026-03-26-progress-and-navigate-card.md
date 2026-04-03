# 迭代进度展示 + 导航卡片推送 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time iteration progress display in MessageDock and ooc:// navigate card rendering in messages.

**Architecture:** Two independent features sharing no code. Feature A adds a `flow:progress` SSE event from backend and a `ProgressIndicator` component in the frontend MessageDock. Feature B adds a `[navigate]` message format convention parsed by a new `navigate-parser.ts` lib, rendered as `OocNavigateCard` components inside `MarkdownContent`.

**Tech Stack:** TypeScript, Bun (backend), React + Jotai + Vite (frontend), bun:test

---

## Chunk 1: Feature A — flow:progress SSE Event + ProgressIndicator

### Task 1: Backend — Add `flow:progress` SSE event type

**Files:**
- Modify: `kernel/src/server/events.ts:16-27`

- [ ] **Step 1: Add `flow:progress` to SSEEvent union type**

In `kernel/src/server/events.ts`, add the new event type to the union:

```typescript
// Add after the "object:updated" line (line 27), before the semicolon
  | { type: "flow:progress"; objectName: string; sessionId: string; iterations: number; maxIterations: number; totalIterations: number; maxTotalIterations: number }
```

- [ ] **Step 2: Verify no type errors**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun build src/server/events.ts --no-bundle 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && git add src/server/events.ts && git commit -m "feat: add flow:progress SSE event type"
```

---

### Task 2: Backend — Emit `flow:progress` from ThinkLoop (standalone mode)

**Files:**
- Modify: `kernel/src/flow/thinkloop.ts:62-67` (ThinkLoopConfig interface)
- Modify: `kernel/src/flow/thinkloop.ts:115-117` (iteration++ area)

- [ ] **Step 1: Add `emitProgress` to ThinkLoopConfig**

In `kernel/src/flow/thinkloop.ts`, extend the config interface:

```typescript
/** ThinkLoop 配置 */
export interface ThinkLoopConfig {
  /** 最大思考轮次（防止无限循环） */
  maxIterations: number;
  /** 暂停检查回调（由 World 注入，检查对象是否被用户暂停） */
  isPaused?: () => boolean;
  /** 是否发射 flow:progress 事件（默认 true，Scheduler 模式下传 false 避免重复） */
  emitProgress?: boolean;
}
```

- [ ] **Step 2: Import emitSSE and emit after iteration++**

Add import at top of `thinkloop.ts`:

```typescript
import { emitSSE } from "../server/events.js";
```

After `iteration++` (line 116), add:

```typescript
    /* 发射进度事件（独立模式下，Scheduler 模式由 Scheduler 统一发射） */
    if (config.emitProgress !== false) {
      emitSSE({
        type: "flow:progress",
        objectName: stone.name,
        sessionId: flow.sessionId,
        iterations: iteration,
        maxIterations: config.maxIterations,
        totalIterations: iteration,
        maxTotalIterations: config.maxIterations,
      });
    }
```

- [ ] **Step 3: Verify no type errors**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun build src/flow/thinkloop.ts --no-bundle 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && git add src/flow/thinkloop.ts && git commit -m "feat: emit flow:progress from ThinkLoop in standalone mode"
```

---

### Task 3: Backend — Emit `flow:progress` from Scheduler + suppress ThinkLoop emission

**Files:**
- Modify: `kernel/src/world/scheduler.ts:19` (imports)
- Modify: `kernel/src/world/scheduler.ts:131-145` (runThinkLoop call + iteration increment)

- [ ] **Step 1: Import emitSSE in scheduler.ts**

Add to imports:

```typescript
import { emitSSE } from "../server/events.js";
```

- [ ] **Step 2: Pass `emitProgress: false` to runThinkLoop**

In the `run()` method, modify the `runThinkLoop` call (around line 131-142). Change the config argument from:

```typescript
          { maxIterations: 1, isPaused: this._isPaused ? () => this._isPaused!(name) : undefined },
```

to:

```typescript
          { maxIterations: 1, isPaused: this._isPaused ? () => this._isPaused!(name) : undefined, emitProgress: false },
```

- [ ] **Step 3: Emit `flow:progress` after iteration increment**

After `entry.iterations++; totalIterations++;` (lines 144-145), add:

```typescript
        /* 发射进度事件（Scheduler 统一发射，包含全局计数） */
        emitSSE({
          type: "flow:progress",
          objectName: name,
          sessionId: entry.flow.sessionId,
          iterations: entry.iterations,
          maxIterations: this._config.maxIterationsPerFlow,
          totalIterations,
          maxTotalIterations: this._config.maxTotalIterations,
        });
```

- [ ] **Step 4: Verify no type errors**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun build src/world/scheduler.ts --no-bundle 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && git add src/world/scheduler.ts && git commit -m "feat: emit flow:progress from Scheduler with global counts"
```

---

### Task 4: Frontend — Add `flow:progress` to SSEEvent type + flowProgressAtom

**Files:**
- Modify: `kernel/web/src/api/types.ts:127-138` (SSEEvent union)
- Create: `kernel/web/src/store/progress.ts`

- [ ] **Step 1: Add `flow:progress` to frontend SSEEvent type**

In `kernel/web/src/api/types.ts`, add to the SSEEvent union (after line 138, before the semicolon):

```typescript
  | { type: "flow:progress"; objectName: string; sessionId: string; iterations: number; maxIterations: number; totalIterations: number; maxTotalIterations: number }
```

- [ ] **Step 2: Create `store/progress.ts` with flowProgressAtom**

Create `kernel/web/src/store/progress.ts`:

```typescript
/**
 * 迭代进度状态
 *
 * 存储当前活跃 session 的 ThinkLoop 迭代进度。
 * 仅跟踪入口 Flow（用户发起的对话），忽略子 Flow。
 */
import { atom } from "jotai";

/** Flow 迭代进度 */
export interface FlowProgress {
  objectName: string;
  sessionId: string;
  iterations: number;
  maxIterations: number;
  totalIterations: number;
  maxTotalIterations: number;
}

/** 当前活跃 Flow 的迭代进度（null = 无活跃 Flow） */
export const flowProgressAtom = atom<FlowProgress | null>(null);
```

- [ ] **Step 3: Commit**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && git add web/src/api/types.ts web/src/store/progress.ts && git commit -m "feat: add flow:progress frontend type and progress atom"
```

---

### Task 5: Frontend — Handle `flow:progress` in useSSE hook

**Files:**
- Modify: `kernel/web/src/hooks/useSSE.ts`

**Important:** `activeSessionId` must NOT be a useEffect dependency — that would tear down and reconnect the SSE connection every time the user switches sessions. Instead, use a ref to hold the current value.

- [ ] **Step 1: Import new atoms and useRef**

Update imports at top of `useSSE.ts`:

```typescript
import { useEffect, useRef } from "react";
import { useSetAtom, useAtomValue } from "jotai";
import { sseConnectedAtom, lastFlowEventAtom, streamingThoughtAtom, streamingTalkAtom } from "../store/session";
import { activeSessionIdAtom } from "../store/session";
import { objectsAtom } from "../store/objects";
import { flowProgressAtom } from "../store/progress";
import { connectSSE, fetchObjects } from "../api/client";
```

- [ ] **Step 2: Add ref and setter in the hook**

Inside `useSSE()`, add after existing `useSetAtom` calls:

```typescript
  const setFlowProgress = useSetAtom(flowProgressAtom);
  const activeSessionId = useAtomValue(activeSessionIdAtom);
  const activeSessionIdRef = useRef(activeSessionId);
  activeSessionIdRef.current = activeSessionId;
```

The ref is updated on every render, so the SSE callback always reads the latest value without being a useEffect dependency.

- [ ] **Step 3: Handle `flow:progress` event in switch**

Add a new case before the `stream:thought` case (around line 57):

```typescript
        case "flow:progress":
          /* 只跟踪当前活跃 session 的入口 Flow 进度（通过 ref 读取，避免 SSE 重连） */
          if (event.sessionId === activeSessionIdRef.current) {
            setFlowProgress({
              objectName: event.objectName,
              sessionId: event.sessionId,
              iterations: event.iterations,
              maxIterations: event.maxIterations,
              totalIterations: event.totalIterations,
              maxTotalIterations: event.maxTotalIterations,
            });
          }
          break;
```

- [ ] **Step 4: Update `flow:end` case to clear progress**

Modify the existing `flow:end` handling. Currently `flow:end` falls through to `setLastFlowEvent`. Keep that, but also clear progress. Change the flow event cases from:

```typescript
        case "flow:start":
        case "flow:end":
        case "flow:status":
        case "flow:action":
        case "flow:message":
          /* 推送到全局 atom，组件自行订阅 */
          setLastFlowEvent(event);
          break;
```

to:

```typescript
        case "flow:start":
        case "flow:status":
        case "flow:action":
        case "flow:message":
          setLastFlowEvent(event);
          break;
        case "flow:end":
          setLastFlowEvent(event);
          /* 清空进度（仅匹配当前跟踪的 Flow） */
          setFlowProgress((prev) =>
            prev?.sessionId === event.sessionId ? null : prev,
          );
          break;
```

- [ ] **Step 5: Update useEffect deps (add setFlowProgress only, NOT activeSessionId)**

Update the deps array of the useEffect (line 100):

```typescript
  }, [setConnected, setObjects, setLastFlowEvent, setStreamingThought, setStreamingTalk, setFlowProgress]);
```

Note: `activeSessionId` is intentionally NOT in deps — it's read via ref to avoid SSE reconnection.

- [ ] **Step 6: Verify build**

Run: `cd /Users/zhangzhefu/x/ooc/kernel/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && git add web/src/hooks/useSSE.ts && git commit -m "feat: handle flow:progress in useSSE, filter by active session via ref"
```

---

### Task 6: Frontend — Create ProgressIndicator component

**Files:**
- Create: `kernel/web/src/components/ProgressIndicator.tsx`

- [ ] **Step 1: Create the component**

Create `kernel/web/src/components/ProgressIndicator.tsx`:

```typescript
/**
 * ProgressIndicator — 迭代进度指示器
 *
 * 展示当前 Flow 的 ThinkLoop 迭代进度。
 * 位于 MessageDock 顶部。
 */
import { useAtomValue } from "jotai";
import { flowProgressAtom } from "../store/progress";

/** 根据进度比例返回颜色 class */
function getProgressColor(ratio: number): string {
  if (ratio > 0.8) return "bg-red-500";
  if (ratio > 0.6) return "bg-amber-500";
  return "bg-[var(--primary)]";
}

export function ProgressIndicator() {
  const progress = useAtomValue(flowProgressAtom);
  if (!progress) return null;

  const flowRatio = progress.iterations / progress.maxIterations;
  const globalRatio = progress.totalIterations / progress.maxTotalIterations;
  const ratio = Math.max(flowRatio, globalRatio);
  const percent = Math.min(ratio * 100, 100);
  const colorClass = getProgressColor(ratio);

  return (
    <div className="px-4 py-2 shrink-0">
      <div className="flex items-center justify-between text-[10px] text-[var(--muted-foreground)] mb-1">
        <span>迭代进度</span>
        <span>{progress.iterations} / {progress.maxIterations}</span>
      </div>
      <div className="h-1 rounded-full bg-[var(--muted)] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${colorClass}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && git add web/src/components/ProgressIndicator.tsx && git commit -m "feat: create ProgressIndicator component"
```

---

### Task 7: Frontend — Integrate ProgressIndicator into MessageSidebar

**Files:**
- Modify: `kernel/web/src/features/MessageSidebar.tsx:19` (imports)
- Modify: `kernel/web/src/features/MessageSidebar.tsx:284-286` (before message list)

- [ ] **Step 1: Import ProgressIndicator**

Add import in `MessageSidebar.tsx`:

```typescript
import { ProgressIndicator } from "../components/ProgressIndicator";
```

- [ ] **Step 2: Insert ProgressIndicator after header, before message list**

In the return JSX, after the header `</div>` (line 283) and before the message list `<div ref={scrollRef}` (line 286), insert:

```typescript
      {/* 迭代进度 */}
      <ProgressIndicator />
```

- [ ] **Step 3: Verify build**

Run: `cd /Users/zhangzhefu/x/ooc/kernel/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && git add web/src/features/MessageSidebar.tsx && git commit -m "feat: integrate ProgressIndicator into MessageDock"
```

---

## Chunk 2: Feature B — Navigate Card Parsing + OocNavigateCard Component

### Task 8: Create `parseNavigateBlocks` parser + unit tests

**Files:**
- Create: `kernel/web/src/lib/navigate-parser.ts`
- Create: `kernel/tests/navigate-parser.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `kernel/tests/navigate-parser.test.ts`:

```typescript
/**
 * parseNavigateBlocks 单元测试
 */
import { describe, test, expect } from "bun:test";
import { parseNavigateBlocks } from "../web/src/lib/navigate-parser";

describe("parseNavigateBlocks", () => {
  test("extracts single navigate block with title and description", () => {
    const input = `请查看：\n[navigate title="项目看板" description="当前进度"]ooc://file/objects/supervisor/shared/kanban.md[/navigate]`;
    const result = parseNavigateBlocks(input);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]!.title).toBe("项目看板");
    expect(result.blocks[0]!.description).toBe("当前进度");
    expect(result.blocks[0]!.url).toBe("ooc://file/objects/supervisor/shared/kanban.md");
    expect(result.cleanText).toContain("<!--ooc-nav-0-->");
    expect(result.cleanText).not.toContain("[navigate");
  });

  test("extracts navigate block with title only (no description)", () => {
    const input = `[navigate title="报告"]ooc://object/sophia[/navigate]`;
    const result = parseNavigateBlocks(input);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]!.title).toBe("报告");
    expect(result.blocks[0]!.description).toBeUndefined();
    expect(result.blocks[0]!.url).toBe("ooc://object/sophia");
  });

  test("extracts multiple navigate blocks", () => {
    const input = `看这两个：\n[navigate title="A"]ooc://object/a[/navigate]\n中间文字\n[navigate title="B" description="desc"]ooc://object/b[/navigate]`;
    const result = parseNavigateBlocks(input);
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0]!.title).toBe("A");
    expect(result.blocks[1]!.title).toBe("B");
    expect(result.cleanText).toContain("<!--ooc-nav-0-->");
    expect(result.cleanText).toContain("<!--ooc-nav-1-->");
    expect(result.cleanText).toContain("中间文字");
  });

  test("returns empty blocks for text without navigate markers", () => {
    const input = "普通文本，没有导航卡片";
    const result = parseNavigateBlocks(input);
    expect(result.blocks).toHaveLength(0);
    expect(result.cleanText).toBe(input);
  });

  test("handles non-ooc URL gracefully (still extracts)", () => {
    const input = `[navigate title="外部"]https://example.com[/navigate]`;
    const result = parseNavigateBlocks(input);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]!.url).toBe("https://example.com");
  });

  test("does not match across line breaks in URL", () => {
    const input = `[navigate title="坏的"]ooc://object/\nbroken[/navigate]`;
    const result = parseNavigateBlocks(input);
    // \S+ won't match newline, so this should not match
    expect(result.blocks).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/navigate-parser.test.ts 2>&1 | tail -10`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `parseNavigateBlocks`**

Create `kernel/web/src/lib/navigate-parser.ts`:

```typescript
/**
 * Navigate 块解析器
 *
 * 从消息文本中提取 [navigate] 块，替换为 HTML comment 占位符。
 * 占位符能安全穿越 Markdown 解析，渲染后再替换为 React 组件。
 */

/** 解析出的导航块 */
export interface NavigateBlock {
  title: string;
  description?: string;
  url: string;
  index: number;
}

/** 解析结果 */
export interface ParseResult {
  /** [navigate] 块被替换为占位符后的文本 */
  cleanText: string;
  /** 提取出的导航块 */
  blocks: NavigateBlock[];
}

/** 匹配 [navigate title="..." description="..."]url[/navigate] */
const NAVIGATE_RE = /\[navigate\s+title="([^"]+)"(?:\s+description="([^"]*)")?\]\s*(\S+)\s*\[\/navigate\]/g;

/**
 * 解析文本中的 [navigate] 块
 *
 * 每个块替换为 `<!--ooc-nav-N-->` 占位符。
 */
export function parseNavigateBlocks(text: string): ParseResult {
  const blocks: NavigateBlock[] = [];
  let index = 0;

  const cleanText = text.replace(NAVIGATE_RE, (_match, title: string, description: string | undefined, url: string) => {
    blocks.push({
      title,
      description: description || undefined,
      url,
      index,
    });
    return `<!--ooc-nav-${index++}-->`;
  });

  return { cleanText, blocks };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/navigate-parser.test.ts 2>&1 | tail -10`
Expected: All 6 tests PASS

- [ ] **Step 5: Commit**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && git add web/src/lib/navigate-parser.ts tests/navigate-parser.test.ts && git commit -m "feat: add parseNavigateBlocks parser with tests"
```

---

### Task 9: Create OocNavigateCard component

**Files:**
- Create: `kernel/web/src/components/OocNavigateCard.tsx`

- [ ] **Step 1: Create the component**

Create `kernel/web/src/components/OocNavigateCard.tsx`:

```typescript
/**
 * OocNavigateCard — 导航卡片组件
 *
 * 在消息中渲染 ooc:// 链接为可点击的卡片。
 * 用户点击"打开"按钮后导航到对应页面。
 */
import { useSetAtom } from "jotai";
import { editorTabsAtom, activeFilePathAtom } from "../store/session";
import { oocLinkUrlAtom } from "../store/ooc-link";
import { parseOocUrl } from "../lib/ooc-url";
import { ExternalLink } from "lucide-react";

interface OocNavigateCardProps {
  title: string;
  description?: string;
  url: string;
}

export function OocNavigateCard({ title, description, url }: OocNavigateCardProps) {
  const setEditorTabs = useSetAtom(editorTabsAtom);
  const setActiveFilePath = useSetAtom(activeFilePathAtom);
  const setOocLink = useSetAtom(oocLinkUrlAtom);

  const handleClick = () => {
    const parsed = parseOocUrl(url);
    if (!parsed) {
      /* 无法解析，降级到 OocLinkPreview */
      setOocLink(url);
      return;
    }

    if (parsed.type === "object") {
      const path = `stones/${parsed.name}`;
      setEditorTabs((prev) => {
        if (prev.some((t) => t.path === path)) return prev;
        return [...prev, { path, label: parsed.name }];
      });
      setActiveFilePath(path);
    } else if (parsed.type === "file") {
      const path = `stones/${parsed.objectName}/shared/${parsed.filename}`;
      setEditorTabs((prev) => {
        if (prev.some((t) => t.path === path)) return prev;
        return [...prev, { path, label: parsed.filename }];
      });
      setActiveFilePath(path);
    } else {
      /* 未知类型，降级到 OocLinkPreview */
      setOocLink(url);
    }
  };

  return (
    <div className="my-2 rounded-lg border border-[var(--border)] bg-[var(--card)] overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="shrink-0 w-8 h-8 rounded-md bg-[var(--primary)]/10 flex items-center justify-center">
          <ExternalLink className="w-4 h-4 text-[var(--primary)]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{title}</div>
          {description && (
            <div className="text-xs text-[var(--muted-foreground)] truncate">{description}</div>
          )}
        </div>
        <button
          onClick={handleClick}
          className="shrink-0 px-3 py-1 text-xs rounded-md bg-[var(--primary)] text-[var(--primary-foreground)] hover:opacity-90 transition-opacity"
        >
          打开
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && git add web/src/components/OocNavigateCard.tsx && git commit -m "feat: create OocNavigateCard component"
```

---

### Task 10: Integrate navigate parsing into MarkdownContent

**Files:**
- Modify: `kernel/web/src/components/ui/MarkdownContent.tsx`

- [ ] **Step 1: Add imports**

Add at top of `MarkdownContent.tsx`:

```typescript
import type { ReactNode, MouseEvent } from "react";
import { parseNavigateBlocks } from "../../lib/navigate-parser";
import { OocNavigateCard } from "../OocNavigateCard";
```

- [ ] **Step 2: Extract markdown components into a helper function**

Add this function BEFORE the existing `MarkdownContent` component (after `linkifyOocUrls`):

```typescript
/** ReactMarkdown 自定义组件配置 */
function markdownComponents(setOocLink: (url: string) => void) {
  return {
    p: ({ children }: any) => <p className="my-1 leading-relaxed">{children}</p>,
    pre: ({ children }: any) => (
      <pre className="bg-[var(--muted)] rounded p-2 text-xs overflow-auto my-2 font-mono">
        {children}
      </pre>
    ),
    code: ({ children, className: codeClassName }: any) => {
      const isBlock = codeClassName?.startsWith("language-");
      if (isBlock) return <code>{children}</code>;
      return (
        <code className="bg-[var(--muted)] px-1 py-0.5 rounded text-xs font-mono">
          {children}
        </code>
      );
    },
    ul: ({ children }: any) => <ul className="list-disc pl-4 my-1 space-y-0.5">{children}</ul>,
    ol: ({ children }: any) => <ol className="list-decimal pl-4 my-1 space-y-0.5">{children}</ol>,
    li: ({ children }: any) => <li className="text-sm">{children}</li>,
    h1: ({ children }: any) => <h1 className="text-base font-bold mt-3 mb-1">{children}</h1>,
    h2: ({ children }: any) => <h2 className="text-sm font-bold mt-2 mb-1">{children}</h2>,
    h3: ({ children }: any) => <h3 className="text-sm font-semibold mt-2 mb-0.5">{children}</h3>,
    table: ({ children }: any) => (
      <div className="overflow-auto my-2">
        <table className="text-xs border-collapse w-full">{children}</table>
      </div>
    ),
    th: ({ children }: any) => (
      <th className="border border-[var(--border)] px-2 py-1 bg-[var(--muted)] text-left font-medium">
        {children}
      </th>
    ),
    td: ({ children }: any) => (
      <td className="border border-[var(--border)] px-2 py-1">{children}</td>
    ),
    blockquote: ({ children }: any) => (
      <blockquote className="border-l-2 border-[var(--border)] pl-3 my-2 text-[var(--muted-foreground)] italic">
        {children}
      </blockquote>
    ),
    a: ({ href, children }: any) => {
      if (href && isOocUrl(href)) {
        return (
          <a
            href={href}
            className="text-[var(--primary)] underline cursor-pointer"
            onClick={(e: MouseEvent) => {
              e.preventDefault();
              setOocLink(href);
            }}
          >
            {children}
          </a>
        );
      }
      return (
        <a href={href} className="text-[var(--primary)] underline" target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      );
    },
    hr: () => <hr className="my-3 border-[var(--border)]" />,
    strong: ({ children }: any) => <strong className="font-semibold">{children}</strong>,
  };
}
```

- [ ] **Step 3: Replace the entire `MarkdownContent` function**

Delete the existing `export function MarkdownContent(...)` (lines 27-103) and replace with:

```typescript
export function MarkdownContent({ content, className }: MarkdownContentProps) {
  const setOocLink = useSetAtom(oocLinkUrlAtom);

  /* 预提取 [navigate] 块，替换为占位符 */
  const { cleanText, blocks } = parseNavigateBlocks(content);

  /* 如果没有 navigate 块，走原有渲染路径 */
  if (blocks.length === 0) {
    return (
      <div className={cn("prose prose-sm max-w-none break-words", className)}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={markdownComponents(setOocLink)}
        >
          {linkifyOocUrls(content)}
        </ReactMarkdown>
      </div>
    );
  }

  /* 有 navigate 块：按占位符分割，交替渲染 Markdown 和卡片 */
  const parts: ReactNode[] = [];
  let remaining = linkifyOocUrls(cleanText);

  for (let i = 0; i < blocks.length; i++) {
    const placeholder = `<!--ooc-nav-${i}-->`;
    const idx = remaining.indexOf(placeholder);
    if (idx === -1) continue;

    const before = remaining.slice(0, idx);
    remaining = remaining.slice(idx + placeholder.length);

    if (before.trim()) {
      parts.push(
        <ReactMarkdown key={`md-${i}`} remarkPlugins={[remarkGfm]} components={markdownComponents(setOocLink)}>
          {before}
        </ReactMarkdown>,
      );
    }

    const block = blocks[i]!;
    parts.push(
      <OocNavigateCard key={`nav-${i}`} title={block.title} description={block.description} url={block.url} />,
    );
  }

  if (remaining.trim()) {
    parts.push(
      <ReactMarkdown key="md-last" remarkPlugins={[remarkGfm]} components={markdownComponents(setOocLink)}>
        {remaining}
      </ReactMarkdown>,
    );
  }

  return (
    <div className={cn("prose prose-sm max-w-none break-words", className)}>
      {parts}
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

Run: `cd /Users/zhangzhefu/x/ooc/kernel/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && git add web/src/components/ui/MarkdownContent.tsx && git commit -m "feat: integrate navigate card parsing into MarkdownContent"
```

---

### Task 11: Update talkable trait documentation

**Files:**
- Modify: `kernel/traits/talkable/readme.md`

- [ ] **Step 1: Append navigate card documentation**

At the end of `kernel/traits/talkable/readme.md` (after the "ooc:// 链接协议" section), append:

```markdown

## 导航卡片

当你生成了文档、UI 或重要内容需要引导用户查看时，使用导航卡片格式。前端会将其渲染为可点击的卡片，用户点击后跳转到对应页面。

### 格式

```
[navigate title="标题" description="简短描述"]ooc://...[/navigate]
```

- `title`（必填）— 卡片标题
- `description`（可选）— 卡片描述文字
- URL 必须是 `ooc://` 链接

### 示例

```
[talk/user]
我已经为你生成了项目看板，请查看：

[navigate title="项目看板" description="当前任务进度总览"]ooc://file/objects/supervisor/shared/kanban.md[/navigate]
[/talk]
```

```
[talk/user]
分析报告已完成：

[navigate title="分析报告"]ooc://file/objects/researcher/shared/report.md[/navigate]
[/talk]
```

### 使用场景

- 你生成了文档或报告，需要引导用户查看
- 你创建了自渲染 UI，需要引导用户访问
- 你完成了任务，结果保存在 shared 文件中

普通引用用 `ooc://` 链接即可（会渲染为可点击的文本链接），导航卡片用于"我做了一个东西，请你来看"的场景。
```

- [ ] **Step 2: Commit**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && git add traits/talkable/readme.md && git commit -m "docs: add navigate card format to talkable trait"
```

---

### Task 12: Add ProgressIndicator color logic unit test

**Files:**
- Create: `kernel/tests/progress-color.test.ts`

- [ ] **Step 1: Write the test**

Create `kernel/tests/progress-color.test.ts`:

```typescript
/**
 * ProgressIndicator 颜色逻辑单元测试
 *
 * 测试 getProgressColor 的阈值计算。
 * 由于 getProgressColor 是组件内部函数，这里提取逻辑进行测试。
 */
import { describe, test, expect } from "bun:test";

/** 复制自 ProgressIndicator.tsx 的颜色逻辑 */
function getProgressColor(ratio: number): string {
  if (ratio > 0.8) return "bg-red-500";
  if (ratio > 0.6) return "bg-amber-500";
  return "bg-[var(--primary)]";
}

function computeRatio(iterations: number, max: number, total: number, totalMax: number): number {
  return Math.max(iterations / max, total / totalMax);
}

describe("ProgressIndicator color logic", () => {
  test("< 60% returns neutral (primary)", () => {
    const ratio = computeRatio(30, 100, 30, 200);
    expect(getProgressColor(ratio)).toBe("bg-[var(--primary)]");
  });

  test("60-80% returns amber", () => {
    const ratio = computeRatio(70, 100, 70, 200);
    expect(getProgressColor(ratio)).toBe("bg-amber-500");
  });

  test("> 80% returns red", () => {
    const ratio = computeRatio(85, 100, 85, 200);
    expect(getProgressColor(ratio)).toBe("bg-red-500");
  });

  test("uses Math.max — global ratio dominates when higher", () => {
    // Flow at 30% but global at 90%
    const ratio = computeRatio(30, 100, 180, 200);
    expect(ratio).toBe(0.9);
    expect(getProgressColor(ratio)).toBe("bg-red-500");
  });

  test("uses Math.max — flow ratio dominates when higher", () => {
    // Flow at 90% but global at 50%
    const ratio = computeRatio(90, 100, 100, 200);
    expect(ratio).toBe(0.9);
    expect(getProgressColor(ratio)).toBe("bg-red-500");
  });

  test("boundary: exactly 60% returns neutral", () => {
    const ratio = computeRatio(60, 100, 60, 200);
    expect(getProgressColor(ratio)).toBe("bg-[var(--primary)]");
  });

  test("boundary: exactly 80% returns amber", () => {
    const ratio = computeRatio(80, 100, 80, 200);
    expect(getProgressColor(ratio)).toBe("bg-amber-500");
  });
});
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test tests/progress-color.test.ts 2>&1 | tail -10`
Expected: All 7 tests PASS

- [ ] **Step 3: Commit**

```bash
cd /Users/zhangzhefu/x/ooc/kernel && git add tests/progress-color.test.ts && git commit -m "test: add ProgressIndicator color logic unit tests"
```

---

### Task 13: Final verification

- [ ] **Step 1: Run all backend tests**

Run: `cd /Users/zhangzhefu/x/ooc/kernel && bun test 2>&1 | tail -20`
Expected: All tests pass

- [ ] **Step 2: Run frontend type check**

Run: `cd /Users/zhangzhefu/x/ooc/kernel/web && npx tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 3: Verify frontend builds**

Run: `cd /Users/zhangzhefu/x/ooc/kernel/web && npx vite build 2>&1 | tail -10`
Expected: Build succeeds
