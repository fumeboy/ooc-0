# SessionKanban Threads Tree 重构设计

**日期：** 2026-04-15
**状态：** 已批准
**作者：** Claude Opus 4.6

## 背景

当前 SessionKanban 主体展示 session readme（由 supervisor 维护的工作状态摘要）。用户希望改为展示所有参与对象的 threads tree，以便直观看到每个对象的执行状态和线程结构。

## 目标

1. 移除 session readme 展示
2. 主体区域展示所有对象的 threads tree（复用 ThreadsTreeView 组件）
3. supervisor 的 tree 排在最前面
4. 分批加载：先加载 supervisor，再并发加载其他对象
5. SSE 实时更新：只刷新变化的对象
6. 保持底部抽屉（Issues/Tasks）不变

## 架构设计

### 组件结构

```
SessionKanban
├── 主体区域（threads tree 列表）
│   ├── supervisor 的 ThreadsTreeView（优先加载）
│   ├── 其他对象的 ThreadsTreeView（并发加载）
│   └── 加载状态指示器
└── 底部抽屉（保持不变）
    ├── Issues 左栏
    └── Tasks 右栏
```

### 数据流

1. 组件挂载 → 获取 session 对象列表
2. 先加载 supervisor 的 process 数据 → 渲染
3. 并发加载其他对象的 process 数据 → 逐个渲染
4. SSE 事件 → 识别 objectName → 只刷新对应对象

## API 设计

### 新增端点 1：获取 session 对象列表

```
GET /api/session/{sessionId}/objects

Response:
{
  "success": true,
  "data": ["supervisor", "kernel", "sophia", ...]
}
```

**实现：**
- 读取 `flows/{sessionId}/objects/` 目录
- 返回子目录名称列表
- supervisor 排在第一位（如果存在）

### 新增端点 2：获取单个对象的 process

```
GET /api/session/{sessionId}/objects/{objectName}/process

Response:
{
  "success": true,
  "data": ProcessData  // 与 FlowView 使用的相同结构
}
```

**实现：**
- 复用 FlowView 的 process 加载逻辑
- 读取 `threads.json` + `threads/{threadId}/thread.json`
- 使用 `thread-adapter.ts` 转换为 Process 格式

### 复用现有 API

- Issues/Tasks API 保持不变
- SSE 事件流保持不变

## 前端实现

### 状态管理

```typescript
const [objectNames, setObjectNames] = useState<string[]>([]);
const [processData, setProcessData] = useState<Map<string, ProcessData>>(new Map());
const [loadingObjects, setLoadingObjects] = useState<Set<string>>(new Set());
```

### 加载策略

1. 获取对象列表：`fetchSessionObjects(sessionId)`
2. 立即加载 supervisor（如果存在）
3. 使用 `Promise.all` 并发加载其他对象
4. 每个对象加载完成后立即更新 `processData` Map

### 渲染结构

```tsx
<div className="flex-1 overflow-auto p-6">
  <div className="space-y-8">
    {objectNames.map(name => (
      <div key={name} className="space-y-2">
        {/* 对象名分隔标题 */}
        <div className="flex items-center gap-2 sticky top-0 bg-background py-2">
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
</div>
```

### SSE 实时刷新

```typescript
useEffect(() => {
  if (!lastEvent || !("objectName" in lastEvent)) return;
  const objectName = lastEvent.objectName;

  // 只刷新变化的对象
  if (objectNames.includes(objectName)) {
    fetchObjectProcess(sessionId, objectName).then(process => {
      setProcessData(prev => new Map(prev).set(objectName, process));
    });
  }
}, [lastEvent, sessionId, objectNames]);
```

## 后端实现

### 端点 1：获取对象列表

```typescript
// kernel/src/server/server.ts
app.get("/api/session/:sessionId/objects", async (req, res) => {
  const { sessionId } = req.params;
  const objectsDir = join(world.flowsDir, sessionId, "objects");

  if (!existsSync(objectsDir)) {
    return res.json({ success: true, data: [] });
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

  res.json({ success: true, data: sorted });
});
```

### 端点 2：获取对象 process

```typescript
// kernel/src/server/server.ts
app.get("/api/session/:sessionId/objects/:objectName/process", async (req, res) => {
  const { sessionId, objectName } = req.params;
  const objectFlowDir = join(world.flowsDir, sessionId, "objects", objectName);

  if (!existsSync(objectFlowDir)) {
    return res.status(404).json({
      success: false,
      error: "Object not found"
    });
  }

  // 复用 FlowView 的逻辑
  const threadsFile = join(objectFlowDir, "threads.json");
  if (!existsSync(threadsFile)) {
    return res.status(404).json({
      success: false,
      error: "Threads data not found"
    });
  }

  const threadsTree = JSON.parse(readFileSync(threadsFile, "utf-8"));
  const process = convertThreadsTreeToProcess(threadsTree, objectFlowDir);

  res.json({ success: true, data: process });
});
```

## 错误处理

1. **对象不存在** → 显示 "对象数据不可用"
2. **加载失败** → 显示错误信息 + 重试按钮
3. **空 session** → 显示 "暂无对象参与此 session"
4. **网络错误** → Toast 提示 + 自动重试（最多 3 次）

## 性能优化

1. **React.memo** — 包裹 ThreadsTreeView 避免不必要的重渲染
2. **防抖刷新** — SSE 刷新使用 500ms 防抖
3. **并发加载** — 使用 `Promise.all` 并发加载多个对象
4. **增量更新** — 只更新变化的对象，不重新加载整个列表

## 测试计划

1. **单对象 session** — 只有 supervisor
2. **多对象 session** — supervisor + kernel + sophia
3. **大 session** — 5+ 个对象，验证分批加载
4. **实时更新** — 触发 SSE 事件，验证只刷新对应对象
5. **错误场景** — 对象不存在、网络失败、空 session

## 迁移影响

- **移除功能** — session readme 展示（supervisor 不再需要维护 readme.md）
- **保持功能** — Issues/Tasks 抽屉、创建 Issue/Task、SSE 实时更新
- **新增功能** — threads tree 可视化、分批加载、按对象刷新

## 后续优化

1. 虚拟滚动（如果对象数量 > 10）
2. 对象过滤/搜索
3. 折叠/展开单个对象
4. 导出 threads tree 为图片

---

**批准人：** 用户
**实施时间：** 2026-04-15
