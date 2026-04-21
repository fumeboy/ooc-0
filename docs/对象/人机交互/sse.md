# SSE — 实时通信事件流

> Server-Sent Events：后端 → 前端的单向实时推送。用于 Flow 运行时的实时更新。

## 为什么是 SSE 而非 WebSocket

| 特性 | SSE | WebSocket |
|---|---|---|
| 方向 | 单向（服务端→客户端） | 双向 |
| 协议 | HTTP | 独立协议 |
| 自动重连 | 有 | 要手动实现 |
| 复杂度 | 简单 | 中 |

OOC 前端→后端的交互**主要通过普通 HTTP API**（发消息、评论等），后端→前端的**持续事件流**用 SSE 就够。不需要双向 WebSocket。

## 连接

```typescript
const eventSource = new EventSource(`/api/session/${sid}/stream`);

eventSource.addEventListener("flow:start", (e) => { ... });
eventSource.addEventListener("stream:thought", (e) => { ... });
```

一个 Session 一个 SSE 连接。连接断线 EventSource 自动重连。

## 事件类型

### Flow 生命周期

| 事件 | 含义 |
|---|---|
| `flow:start` | Flow 被创建 |
| `flow:message` | 新消息（inbox 写入） |
| `flow:action` | 新 Action（写入 thread.actions） |
| `flow:talk` | 流式对话（LLM 逐 token 输出） |
| `flow:thought` | 流式思考（thinking 逐 token 输出） |

### 线程生命周期

| 事件 | 含义 |
|---|---|
| `thread:start` | 新线程创建 |
| `thread:revived` | done → running |
| `thread:returned` | running → done |
| `thread:failed` | any → failed |
| `thread:waiting` | → waiting |
| `thread:resumed` | waiting → running |

### 流式输出

| 事件 | 用途 |
|---|---|
| `stream:program` | program 执行的 stdout（逐行） |
| `stream:action` | 整个 action 的完整内容（当 action 写入时） |
| `stream:thought` | thinking_chunk（流式思考） |

### 看板

| 事件 | 含义 |
|---|---|
| `kanban:issue_updated` | Issue 字段变化 |
| `kanban:task_updated` | Task 字段变化 |
| `kanban:comment_added` | 新评论 |

## useSSE hook

前端统一订阅：

```typescript
function useSSE(eventType: string, handler: (data: any) => void) {
  useEffect(() => {
    const listener = (e: MessageEvent) => handler(JSON.parse(e.data));
    eventSource.addEventListener(eventType, listener);
    return () => eventSource.removeEventListener(eventType, listener);
  }, [eventType, handler]);
}
```

## 常见模式

### 模式 1：驱动重渲染

```typescript
const setRefreshKey = useSetAtom(refreshKeyAtom);
useSSE("flow:action", () => setRefreshKey(k => k + 1));
// refreshKeyAtom 变化 → 所有依赖它的 atom / 组件重新拉数据
```

### 模式 2：流式展示

```typescript
const [thinking, setThinking] = useAtom(streamingThoughtAtom);
useSSE("stream:thought", (event) => {
  if (event.threadId === currentThreadId) {
    setThinking(prev => prev + event.chunk);
  }
});
```

### 模式 3：精准更新

```typescript
useSSE("kanban:issue_updated", (event) => {
  // 只更新这一条 Issue，不拉整个列表
  queryClient.setQueryData(["issue", event.id], event.data);
});
```

## 防抖批量处理

高频事件（如 `stream:thought` 每 100ms 一个 chunk）批量处理，避免每个 chunk 都触发渲染：

```typescript
const batchedChunks = useRef<string[]>([]);
useSSE("stream:thought", (event) => {
  batchedChunks.current.push(event.chunk);
  debounce(() => {
    setThinking(prev => prev + batchedChunks.current.join(""));
    batchedChunks.current = [];
  }, 50);
});
```

## 源码位置

```
kernel/web/src/hooks/useSSE.ts
kernel/web/src/hooks/useEventSource.ts
kernel/src/server/sse.ts                 ← 后端 SSE 端点
```

## 与基因的关联

- **G11**（UI 即面孔）— SSE 让面孔"实时"
- **G8**（Effect 与 Space）— SSE 是后端向前端的"广播 Effect"
