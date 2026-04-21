# ViewRegistry — 视图注册表

> 路径 → 视图组件 的分发机制。"打开什么路径，看到什么视图"。

## 注册机制

每个视图组件注册以下字段：

```typescript
interface ViewRegistration {
  match: (path: string) => boolean;
  priority: number;               // 高优先级先匹配
  tabKey: (path: string) => string;  // 用于 Tab 复用
  tabLabel: (path: string) => string;  // Tab 显示名
  Component: React.FC<{ path: string }>;
}
```

## 路径匹配策略

按 priority 从高到低尝试匹配。第一个 `match` 返回 true 的生效：

```
stones/{name}                   → StoneView [priority: 50]
stones/{name}/reflect/          → ReflectFlowView [priority: 80]
flows/{sessionId}               → SessionKanban [priority: 120]
flows/{sid}/issues/{id}         → IssueDetailView [priority: 130]
flows/{sid}/tasks/{id}          → TaskDetailView [priority: 130]
flows/{sid}/objects/{name}      → FlowView [priority: 100]
**/process.json                 → ProcessJsonView [priority: 40]
*.json                          → CodeViewer (JSON) [priority: 0]
*.md                            → MarkdownViewer [priority: 0]
*                               → CodeViewer (fallback) [priority: 0]
```

高优先级（如 IssueDetailView priority 130）覆盖低优先级（如 `*.json` CodeViewer）。

## 为什么不用硬编码 Router

早期版本用 React Router：

```tsx
<Routes>
  <Route path="/stones/:name" element={<StoneView />} />
  ...
</Routes>
```

问题：新加视图要改 App 路由。无法让对象动态"注册自己的视图"。

**ViewRegistry 解决**：

```typescript
// 任何模块都可以注册
registerView({
  match: (p) => p.startsWith("stones/") && p.endsWith("/reflect/"),
  priority: 80,
  tabKey: (p) => p,  // 每个路径独立 tab
  tabLabel: (p) => `Reflect: ${extractName(p)}`,
  Component: ReflectFlowView
});
```

模块化注册，无需改核心路由代码。

## tabKey 的作用

tabKey 决定 Tab 是否复用：

```typescript
tabKey: (p) => p  
  // 每个路径独立 tab
  // flows/sess_1/issues/ISSUE-001 和 flows/sess_1/issues/ISSUE-002 是两个 tab

tabKey: (p) => "session-kanban-" + extractSessionId(p)
  // 一个 Session 的所有 "kanban 相关" 路径共享一个 tab
```

## 常见视图对应

| 路径模式 | 视图 | 说明 |
|---|---|---|
| `stones/{name}` | StoneView | Stone 详情（ObjectDetail 或 DynamicUI） |
| `stones/{name}/reflect/` | ReflectFlowView | 反思子对象 |
| `flows/{sid}` | SessionKanban | Session 总览 |
| `flows/{sid}/issues/{id}` | IssueDetailView | Issue 详情 |
| `flows/{sid}/tasks/{id}` | TaskDetailView | Task 详情 |
| `flows/{sid}/objects/{name}` | FlowView | 单对象 Flow |
| `**/process.json` | ProcessJsonView | 行为树查看器 |
| `*.md` | MarkdownViewer | Markdown 渲染 |
| `*.json` | CodeViewer (JSON) | JSON 高亮 |
| 其他 | CodeViewer | CodeMirror 纯文本 |

## 自渲染优先级

Stone 如果有 `ui/index.tsx`，StoneView 优先加载自渲染 UI（DynamicUI），失败才降级到 ObjectDetail。

详见 [自渲染.md](自渲染.md)。

## 源码位置

```
kernel/web/src/router/
├── registry.ts                 ← ViewRegistry 主逻辑
├── registrations.ts            ← 所有视图的注册
└── types.ts
```

## 与基因的关联

- **G11**（UI 即面孔）— ViewRegistry 是"对象到 UI"的桥梁
- **G3**（trait 是自我定义）— 类比：对象定义自己的 UI
