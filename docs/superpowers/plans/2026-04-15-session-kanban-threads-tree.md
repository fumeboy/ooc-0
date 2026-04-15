# SessionKanban Threads Tree Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace SessionKanban's readme display with threads tree visualization for all session objects

**Architecture:** Add two backend API endpoints to fetch session objects and their process data. Refactor SessionKanban frontend to load and display ThreadsTreeView components for each object with progressive loading (supervisor first, then others concurrently). Maintain existing Issues/Tasks drawer functionality.

**Tech Stack:** React, TypeScript, Bun, Jotai

---

## File Structure

### Backend (kernel/src/server/server.ts)
- Add 2 new API endpoints for session objects and process data
- Import `threadsToProcess` from thread-adapter

### Frontend (kernel/web/src/)
- **Modify:** `api/client.ts` - Add API client functions
- **Modify:** `api/types.ts` - Add ProcessData type export (if needed)
- **Modify:** `features/SessionKanban.tsx` - Complete rewrite of main body
- **No changes:** Issues/Tasks drawer, kanban API, ThreadsTreeView component

---

## Chunk 1: Backend API Endpoints

### Task 1: Add Session Objects List Endpoint

**Files:**
- Modify: `kernel/src/server/server.ts` (add after existing session endpoints)

- [ ] **Step 1: Add GET /api/sessions/:sessionId/objects endpoint**

Add after line ~380 (after flows/groups endpoint):

```typescript
/* GET /api/sessions/:sessionId/objects — 获取 session 中的所有对象 */
if (method === "GET" && path.startsWith("/api/sessions/") && path.endsWith("/objects")) {
  const sessionId = path.split("/")[3];
  const objectsDir = join(world.flowsDir, sessionId, "objects");

  if (!existsSync(objectsDir)) {
    return json({ success: true, data: [] });
  }

  const objects = readdirSync(objectsDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  // supervisor 排在第一位
  const sorted = objects.sort((a, b) => {
    if (a === "supervisor") return -1;
    if (b === "supervisor") return 1;
    return a.localeCompare(b);
  });

  return json({ success: true, data: sorted });
}
```

- [ ] **Step 2: Test the endpoint manually**

Run backend:
```bash
cd /Users/zhangzhefu/x/ooc/user
bun kernel/src/cli.ts start 8080
```

Test with curl (use an existing sessionId):
```bash
curl http://localhost:8080/api/sessions/s_mnxju7dt_iee77d/objects
```

Expected: `{"success":true,"data":["supervisor","sophia",...]}` or `{"success":true,"data":[]}`

- [ ] **Step 3: Commit**

```bash
git add kernel/src/server/server.ts
git commit -m "feat(api): add GET /api/sessions/:sessionId/objects endpoint

Returns list of object names in a session, with supervisor first.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Add Object Process Data Endpoint

**Files:**
- Modify: `kernel/src/server/server.ts` (add import and endpoint)

- [ ] **Step 1: Add threadsToProcess import**

Add to imports section at top of file:

```typescript
import { threadsToProcess } from "../persistence/thread-adapter.js";
```

- [ ] **Step 2: Add GET /api/sessions/:sessionId/objects/:objectName/process endpoint**

Add after the objects list endpoint:

```typescript
/* GET /api/sessions/:sessionId/objects/:objectName/process — 获取对象的 process 数据 */
if (method === "GET" && path.match(/^\/api\/sessions\/[^/]+\/objects\/[^/]+\/process$/)) {
  const parts = path.split("/");
  const sessionId = parts[3];
  const objectName = parts[5];
  const objectFlowDir = join(world.flowsDir, sessionId, "objects", objectName);

  if (!existsSync(objectFlowDir)) {
    return json({ success: false, error: "Object not found" }, { status: 404 });
  }

  const process = threadsToProcess(objectFlowDir);

  if (!process) {
    return json({ success: false, error: "Process data not available" }, { status: 404 });
  }

  return json({ success: true, data: process });
}
```

- [ ] **Step 3: Test the endpoint manually**

Test with curl (use existing sessionId and objectName):
```bash
curl http://localhost:8080/api/sessions/s_mnxju7dt_iee77d/objects/sophia/process
```

Expected: `{"success":true,"data":{...process data...}}` or 404 error

- [ ] **Step 4: Commit**

```bash
git add kernel/src/server/server.ts
git commit -m "feat(api): add GET /api/sessions/:sessionId/objects/:objectName/process

Returns process data for a specific object in a session.
Uses threadsToProcess for thread tree conversion.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 2: Frontend API Client

### Task 3: Add API Client Functions

**Files:**
- Modify: `kernel/web/src/api/client.ts`
- Modify: `kernel/web/src/api/types.ts` (if ProcessData not exported)

- [ ] **Step 1: Check if ProcessData is exported in types.ts**

```bash
grep "export.*ProcessData" kernel/web/src/api/types.ts
```

If not found, add to types.ts:
```typescript
export type { ProcessData } from "../../src/types/index.js";
```

- [ ] **Step 2: Add fetchSessionObjects function to client.ts**

Add after existing session-related functions:

```typescript
/** 获取 session 中的所有对象列表 */
export async function fetchSessionObjects(sessionId: string): Promise<string[]> {
  return get<string[]>(`/sessions/${sessionId}/objects`);
}
```

- [ ] **Step 3: Add fetchObjectProcess function to client.ts**

```typescript
/** 获取对象的 process 数据 */
export async function fetchObjectProcess(
  sessionId: string,
  objectName: string
): Promise<ProcessData> {
  return get<ProcessData>(`/sessions/${sessionId}/objects/${objectName}/process`);
}
```

- [ ] **Step 4: Verify imports and exports**

Ensure ProcessData is imported at top of client.ts:
```typescript
import type { ProcessData } from "./types";
```

- [ ] **Step 5: Commit**

```bash
git add kernel/web/src/api/client.ts kernel/web/src/api/types.ts
git commit -m "feat(api): add client functions for session objects and process

- fetchSessionObjects: get list of objects in session
- fetchObjectProcess: get process data for specific object

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 3: SessionKanban Component Refactor

### Task 4: Refactor SessionKanban Main Body

**Files:**
- Modify: `kernel/web/src/features/SessionKanban.tsx`

- [ ] **Step 1: Update imports**

Replace/add imports at top of file:

```typescript
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import { lastFlowEventAtom, editorTabsAtom, activeFilePathAtom } from "../store/session";
import { fetchIssues, fetchTasks, fetchSessionObjects, fetchObjectProcess, createIssue, createTask } from "../api/kanban";
import { StatusGroup } from "./kanban/StatusGroup";
import { IssueCard } from "./kanban/IssueCard";
import { TaskCard } from "./kanban/TaskCard";
import { ThreadsTreeView } from "./ThreadsTreeView";
import { ObjectAvatar } from "../components/ui/ObjectAvatar";
import type { KanbanIssue, KanbanTask, IssueStatus, TaskStatus, ProcessData } from "../api/types";
import { cn } from "../lib/utils";
```

Note: Remove MarkdownContent import, remove fetchSessionReadme import

- [ ] **Step 2: Update state management**

Replace readme state with new state:

```typescript
export function SessionKanban({ sessionId }: { sessionId: string }) {
  const [objectNames, setObjectNames] = useState<string[]>([]);
  const [processData, setProcessData] = useState<Map<string, ProcessData>>(new Map());
  const [loadingObjects, setLoadingObjects] = useState<Set<string>>(new Set());
  const [issues, setIssues] = useState<KanbanIssue[]>([]);
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [dialog, setDialog] = useState<{ type: "issue" | "task" } | null>(null);
  const [drawerExpanded, setDrawerExpanded] = useState(false);
  const lastEvent = useAtomValue(lastFlowEventAtom);
  const setTabs = useSetAtom(editorTabsAtom);
  const setActivePath = useSetAtom(activeFilePathAtom);
```

- [ ] **Step 3: Add progressive loading logic**

Replace readme loading effect with:

```typescript
  /* 加载对象列表和 process 数据 */
  useEffect(() => {
    let mounted = true;

    const loadObjects = async () => {
      try {
        const objects = await fetchSessionObjects(sessionId);
        if (!mounted) return;

        setObjectNames(objects);
        setLoadingObjects(new Set(objects));

        // 先加载 supervisor
        if (objects.includes("supervisor")) {
          try {
            const process = await fetchObjectProcess(sessionId, "supervisor");
            if (!mounted) return;
            setProcessData(prev => new Map(prev).set("supervisor", process));
            setLoadingObjects(prev => {
              const next = new Set(prev);
              next.delete("supervisor");
              return next;
            });
          } catch (err) {
            console.error("Failed to load supervisor process:", err);
            setLoadingObjects(prev => {
              const next = new Set(prev);
              next.delete("supervisor");
              return next;
            });
          }
        }

        // 并发加载其他对象
        const others = objects.filter(name => name !== "supervisor");
        await Promise.all(
          others.map(async (name) => {
            try {
              const process = await fetchObjectProcess(sessionId, name);
              if (!mounted) return;
              setProcessData(prev => new Map(prev).set(name, process));
            } catch (err) {
              console.error(`Failed to load ${name} process:`, err);
            } finally {
              if (mounted) {
                setLoadingObjects(prev => {
                  const next = new Set(prev);
                  next.delete(name);
                  return next;
                });
              }
            }
          })
        );
      } catch (err) {
        console.error("Failed to load session objects:", err);
        if (mounted) {
          setObjectNames([]);
          setLoadingObjects(new Set());
        }
      }
    };

    loadObjects();

    return () => {
      mounted = false;
    };
  }, [sessionId]);
```

- [ ] **Step 4: Add SSE refresh logic with debounce**

Add after loading effect:

```typescript
  /* SSE 实时刷新（防抖批量处理） */
  const pendingRefreshes = useRef<Set<string>>(new Set());

  const debouncedRefresh = useMemo(
    () => {
      let timeoutId: NodeJS.Timeout | null = null;
      return () => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(async () => {
          const objectsToRefresh = Array.from(pendingRefreshes.current);
          pendingRefreshes.current.clear();

          const processes = await Promise.all(
            objectsToRefresh.map(name =>
              fetchObjectProcess(sessionId, name).catch(err => {
                console.error(`Failed to refresh ${name}:`, err);
                return null;
              })
            )
          );

          setProcessData(prev => {
            const next = new Map(prev);
            objectsToRefresh.forEach((name, i) => {
              if (processes[i]) next.set(name, processes[i]);
            });
            return next;
          });
        }, 500);
      };
    },
    [sessionId]
  );

  useEffect(() => {
    if (!lastEvent || !("objectName" in lastEvent)) return;
    const objectName = (lastEvent as any).objectName;

    if (objectNames.includes(objectName)) {
      pendingRefreshes.current.add(objectName);
      debouncedRefresh();
    }
  }, [lastEvent, objectNames, debouncedRefresh]);
```

- [ ] **Step 5: Replace main body JSX**

Replace the main body div (lines 77-85) with:

```typescript
  return (
    <div className="relative flex flex-col h-full overflow-hidden">
      {/* 主体：Threads Tree 列表 */}
      <div className="flex-1 overflow-auto p-6">
        {objectNames.length === 0 && loadingObjects.size === 0 ? (
          <p className="text-muted-foreground text-sm">暂无对象参与此 session</p>
        ) : (
          <div className="space-y-8">
            {objectNames.map(name => (
              <div key={name} className="space-y-2">
                {/* 对象名分隔标题 */}
                <div className="flex items-center gap-2 sticky top-0 bg-background py-2 z-10">
                  <ObjectAvatar name={name} size="sm" />
                  <h3 className="text-sm font-medium">{name}</h3>
                </div>

                {/* ThreadsTreeView 或加载状态 */}
                {processData.has(name) ? (
                  <ThreadsTreeView
                    process={processData.get(name)!}
                    sessionId={sessionId}
                    objectName={name}
                  />
                ) : loadingObjects.has(name) ? (
                  <div className="text-sm text-muted-foreground">加载中...</div>
                ) : (
                  <div className="text-sm text-muted-foreground">对象数据不可用</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
```

Keep the drawer JSX unchanged (lines 87-onwards)

- [ ] **Step 6: Verify the component compiles**

```bash
cd kernel/web
bun run build
```

Expected: No TypeScript errors

- [ ] **Step 7: Commit**

```bash
git add kernel/web/src/features/SessionKanban.tsx
git commit -m "feat(ui): refactor SessionKanban to show threads tree

- Remove session readme display
- Add progressive loading (supervisor first, then others)
- Display ThreadsTreeView for each object
- Add SSE refresh with debounce batching
- Keep Issues/Tasks drawer unchanged

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 4: Testing and Documentation

### Task 5: Manual Testing

**Files:**
- None (manual testing)

- [ ] **Step 1: Start backend and frontend**

Terminal 1:
```bash
cd /Users/zhangzhefu/x/ooc/user
bun kernel/src/cli.ts start 8080
```

Terminal 2:
```bash
cd /Users/zhangzhefu/x/ooc/user/kernel/web
bun run dev
```

- [ ] **Step 2: Test empty session**

Navigate to a session with no objects (or create one).
Expected: "暂无对象参与此 session"

- [ ] **Step 3: Test single object session**

Navigate to a session with only supervisor.
Expected: supervisor threads tree displays

- [ ] **Step 4: Test multi-object session**

Navigate to a session with supervisor + other objects.
Expected:
- supervisor loads first
- other objects load concurrently
- all threads trees display

- [ ] **Step 5: Test SSE refresh**

Trigger an action in one object (e.g., send message to supervisor).
Expected: Only that object's threads tree refreshes

- [ ] **Step 6: Test Issues/Tasks drawer**

Click drawer handle, verify it expands/collapses.
Create an issue/task, verify it appears.
Expected: Drawer functionality unchanged

- [ ] **Step 7: Document test results**

Create a test log:
```bash
echo "## SessionKanban Threads Tree Testing

Date: $(date)

### Test Results
- [ ] Empty session: PASS/FAIL
- [ ] Single object: PASS/FAIL
- [ ] Multi-object: PASS/FAIL
- [ ] SSE refresh: PASS/FAIL
- [ ] Drawer: PASS/FAIL

### Issues Found
(list any issues)
" > /tmp/session-kanban-test-log.md
```

---

### Task 6: Update meta.md Documentation

**Files:**
- Modify: `docs/meta.md`

- [ ] **Step 1: Update SessionKanban description in Web UI section**

Find the SessionKanban section (around line 767-777) and update:

```markdown
├── SessionKanban（Session 看板）── Session 级总览
│   │   主体：所有对象的 threads tree 可视化
│   │   抽屉：底部升起的抽屉页（初始 160px，展开 90%）
│   │
│   ├── Threads Tree 列表（主体）── 垂直排列所有对象的线程树
│   │   ├── 对象分隔标题 ── 头像 + 对象名
│   │   ├── ThreadsTreeView ── 复用 FlowView 的线程树组件
│   │   ├── 加载策略 ── supervisor 优先，其他并发加载
│   │   └── SSE 刷新 ── 只刷新变化的对象（防抖批量处理）
│   │
│   └── 底部抽屉 ── iOS 风格装饰条 + Issues/Tasks 左右分栏
│       ├── IssuesPanel ── 左栏：Issue 按状态分组展示
│       │   ├── IssueCard ── Issue 卡片（标题 + 关联 task 数 + 参与者 + hasNewInfo 红点）
│       │   └── 分组顺序：需确认 → 讨论中 → 设计中 → 评审中 → 执行中 → 确认中 → 完成 → 关闭
│       └── TasksPanel ── 右栏：Task 按状态分组展示
│           ├── TaskCard ── Task 卡片（标题 + 子任务进度条 + hasNewInfo 红点）
│           └── 分组顺序：执行中 → 完成 → 关闭
```

- [ ] **Step 2: Commit meta.md update**

```bash
git add docs/meta.md
git commit -m "docs: update meta.md for SessionKanban threads tree

Reflect the new threads tree visualization in SessionKanban.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Chunk 5: Final Integration

### Task 7: Final Verification and Cleanup

**Files:**
- None (verification only)

- [ ] **Step 1: Run full build**

```bash
cd /Users/zhangzhefu/x/ooc/user/kernel/web
bun run build
```

Expected: Build succeeds with no errors

- [ ] **Step 2: Check for unused imports**

```bash
grep -n "fetchSessionReadme\|MarkdownContent" kernel/web/src/features/SessionKanban.tsx
```

Expected: No matches (these should be removed)

- [ ] **Step 3: Verify API endpoints are registered**

```bash
grep -n "/api/sessions.*objects" kernel/src/server/server.ts
```

Expected: Two matches (objects list and process endpoints)

- [ ] **Step 4: Push all commits**

```bash
git push
```

- [ ] **Step 5: Create summary**

Document what was implemented:
```bash
echo "## SessionKanban Threads Tree Implementation Complete

### Changes Made
1. Backend: Added 2 API endpoints
   - GET /api/sessions/:sessionId/objects
   - GET /api/sessions/:sessionId/objects/:objectName/process

2. Frontend: Refactored SessionKanban
   - Removed session readme display
   - Added threads tree visualization for all objects
   - Progressive loading (supervisor first)
   - SSE refresh with debounce batching
   - Maintained Issues/Tasks drawer

3. Documentation: Updated meta.md

### Testing
- All manual tests passed
- Build succeeds
- No TypeScript errors

### Next Steps
- Monitor production usage
- Consider adding object filtering/search
- Consider virtual scrolling for large sessions
" > /tmp/session-kanban-implementation-summary.md
```

---

## Implementation Notes

**Key Decisions:**
1. **Progressive Loading** — Supervisor loads first for immediate feedback, others load concurrently
2. **Debounce Batching** — Multiple SSE events within 500ms are batched into single refresh
3. **Error Handling** — Failed loads show "对象数据不可用" instead of crashing
4. **Backward Compatibility** — Old sessions work without migration

**Testing Strategy:**
- Manual testing covers all scenarios (empty, single, multi-object sessions)
- SSE refresh tested by triggering actions
- Drawer functionality verified unchanged

**Performance:**
- React.memo not added yet (can be added if performance issues arise)
- Virtual scrolling not implemented (only needed for 10+ objects)
- Debounce prevents excessive refreshes

**Future Enhancements:**
- Object filtering/search
- Collapse/expand individual objects
- Export threads tree as image
- Virtual scrolling for large sessions
