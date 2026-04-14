# URL 路由 + Session 切换 Bug 修复

> 日期：2026-04-10
> 范围：前端路由架构改造

---

## 问题

1. **Create session 后 MessageSidebar 显示旧 session 内容** — `activeSessionFlowAtom` 未在 session 切换时清空
2. **Create session 后初始页面是 supervisor FlowView** — App.tsx 中 `setActivePath` 设为 `flows/{sid}/objects/supervisor` 而非 `flows/{sid}`（Kanban）
3. **Session 切换时 URL 不变** — 当前无 URL 路由，浏览器始终显示 `/`
4. **需要 URL 路由** — 支持 hash 路由，完整粒度映射到 session + 文件路径

## 方案：Hash 路由 + 双向同步

### 路由格式

```
/#/                                          → Welcome 页面
/#/flows/{sessionId}                         → Session Kanban
/#/flows/{sessionId}/objects/{name}          → FlowView
/#/flows/{sessionId}/issues/{issueId}        → IssueDetailView
/#/flows/{sessionId}/tasks/{taskId}          → TaskDetailView
/#/stones/{name}                             → ObjectDetail
/#/stones/{name}/reflect                     → ReflectFlowView
```

### 核心思路

不引入 react-router。用一个轻量的自定义 hook `useHashRouter` 实现 hash ↔ atoms 双向同步：

1. **atoms → hash**：当 `activeTabAtom` / `activeSessionIdAtom` / `activeFilePathAtom` 变化时，更新 `location.hash`
2. **hash → atoms**：当用户直接修改 URL 或浏览器前进/后退时，解析 hash 更新 atoms

这样所有现有的 `setActivePath` / `setActiveId` 调用无需修改，只需在 App.tsx 中挂载 `useHashRouter` hook。

### 实现细节

#### 1. 新增 `useHashRouter` hook

文件：`kernel/web/src/hooks/useHashRouter.ts`

```typescript
/**
 * Hash 路由双向同步 hook
 *
 * atoms → hash：监听 atoms 变化，更新 location.hash
 * hash → atoms：监听 hashchange 事件，解析 hash 更新 atoms
 */
export function useHashRouter() {
  const [activeTab, setActiveTab] = useAtom(activeTabAtom);
  const [activeId, setActiveId] = useAtom(activeSessionIdAtom);
  const [activePath, setActivePath] = useAtom(activeFilePathAtom);
  const [, setActiveFlow] = useAtom(activeSessionFlowAtom);
  const [, setTabs] = useAtom(editorTabsAtom);

  // 防止循环更新的标志
  const suppressHashUpdate = useRef(false);
  const suppressAtomUpdate = useRef(false);

  // atoms → hash
  useEffect(() => {
    if (suppressAtomUpdate.current) {
      suppressAtomUpdate.current = false;
      return;
    }
    suppressHashUpdate.current = true;

    let hash = "/";
    if (activePath) {
      hash = "/" + activePath;
    } else if (activeTab === "flows" && !activeId) {
      hash = "/";
    } else if (activeTab === "stones") {
      hash = "/stones";
    } else if (activeTab === "world") {
      hash = "/world";
    }

    if (location.hash !== "#" + hash) {
      location.hash = hash;
    }

    requestAnimationFrame(() => { suppressHashUpdate.current = false; });
  }, [activeTab, activeId, activePath]);

  // hash → atoms
  useEffect(() => {
    const handleHashChange = () => {
      if (suppressHashUpdate.current) return;
      suppressAtomUpdate.current = true;

      const hash = location.hash.replace(/^#\/?/, "");

      if (!hash || hash === "/") {
        // Welcome 页面
        setActiveTab("flows");
        setActiveId(null);
        setActivePath(null);
        setTabs([]);
        setActiveFlow(null);
        return;
      }

      if (hash.startsWith("flows/")) {
        setActiveTab("flows");
        const sessionMatch = hash.match(/^flows\/([^/]+)/);
        if (sessionMatch) {
          const sid = sessionMatch[1];
          setActiveId(sid);
          setActivePath(hash);
          // tab 由 ViewRegistry 自动处理
        }
      } else if (hash.startsWith("stones/")) {
        setActiveTab("stones");
        setActivePath(hash);
      }
    };

    window.addEventListener("hashchange", handleHashChange);

    // 初始加载：从 URL 恢复状态
    if (location.hash && location.hash !== "#/") {
      handleHashChange();
    }

    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);
}
```

#### 2. Bug 修复：Create session 后 MessageSidebar 显示旧内容

文件：`kernel/web/src/features/MessageSidebar.tsx`

在 `activeId` 变化的 useEffect 中，先清空 `activeFlow` 再 fetch：

```typescript
useEffect(() => {
  setActiveFlow(null);  // ← 新增：立即清空旧数据
  if (!activeId) return;
  fetchFlow(activeId).then(setActiveFlow).catch(console.error);
}, [activeId]);
```

#### 3. Bug 修复：Create session 后初始页面应为 Kanban

文件：`kernel/web/src/App.tsx`

修改 WelcomePage 的 `onSend` 回调：

```typescript
// 当前（错误）：
const path = `flows/${sessionId}/objects/supervisor`;
setActivePath(path);
setTabs([{ path, label: "supervisor" }]);

// 修改为：
const path = `flows/${sessionId}`;
setActivePath(path);
setTabs([{ path, label: "Kanban" }]);
```

#### 4. 挂载 hook

文件：`kernel/web/src/App.tsx`

在 App 组件顶部调用：

```typescript
useHashRouter();
```

---

## 文件变更清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `kernel/web/src/hooks/useHashRouter.ts` | 新增 | Hash 路由双向同步 hook |
| `kernel/web/src/App.tsx` | 修改 | 挂载 hook + 修复 create session 初始路径 |
| `kernel/web/src/features/MessageSidebar.tsx` | 修改 | session 切换时清空旧 flow 数据 |

---

## 验证计划

1. **Create session**：发送消息后，确认 URL 变为 `/#/flows/{sid}`，主内容区显示 Kanban，MessageSidebar 显示新 session 的消息
2. **Session 切换**：点击不同 session，确认 URL 跟随变化，MessageSidebar 内容正确切换
3. **文件导航**：点击文件树中的 supervisor，确认 URL 变为 `/#/flows/{sid}/objects/supervisor`
4. **浏览器前进/后退**：确认 atoms 状态正确恢复
5. **直接输入 URL**：在地址栏输入 `/#/flows/{sid}`，确认正确加载对应 session
6. **刷新页面**：确认从 URL 恢复状态
