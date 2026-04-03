# Session Kanban 设计

> Session 级别的看板视图，替换 SessionGantt，展示 session 的工作状态、Issues 和 Tasks。

## 背景

OOC 的每个 Session 由 Supervisor 主导。用户与 Supervisor 交互，Supervisor 负责任务拆分、分配和协调。当前 Session 视图是 SessionGantt（甘特图），缺少结构化的需求管理和任务跟踪能力。

本设计引入 Issue（需求/问题讨论）和 Task（执行单元）两个独立数据结构，通过 Kanban 视图展示，让用户一眼看到 session 的全局状态。

## 术语约定

本文档中 `sessionId` 即 session 标识符（OOC 中 session 目录名就是 sessionId，如 `session_20260404_xxxx`）。全文统一使用 `sessionId`。

## 数据模型

### Issue 状态机

Issue 状态允许任意转换，不强制状态机。Supervisor 根据实际情况自主决定状态流转。典型路径：

```
discussing → designing → reviewing → executing → confirming → done
                                                            ↘ closed
```

但也允许跳跃（如 discussing → executing）或回退（如 reviewing → discussing）。

### Issue

```typescript
interface Issue {
  id: string;                    // 唯一标识，如 "issue-001"
  title: string;                 // 标题
  status: IssueStatus;           // 状态
  description?: string;          // 描述（markdown）
  participants: string[];        // 参与讨论的对象名称列表
  taskRefs: string[];            // 关联的 task id 列表（多对多）
  reportPages: string[];         // 关联的 report 页面路径（相对于 files/ui/pages/）
  hasNewInfo: boolean;           // 是否有需要人类确认的新信息（supervisor 显式设置）
  comments: Comment[];           // 评论列表
  createdAt: string;             // 创建时间
  updatedAt: string;             // 最后更新时间
}

type IssueStatus =
  | "discussing"                 // 讨论中
  | "designing"                  // 方案设计中
  | "reviewing"                  // 方案评审中
  | "executing"                  // 方案执行中
  | "confirming"                 // 执行结果确认中
  | "done"                       // 已完成
  | "closed";                    // 已关闭（未完成）
```

### Task

```typescript
interface Task {
  id: string;                    // 唯一标识，如 "task-001"
  title: string;                 // 标题
  status: TaskStatus;            // 状态
  description?: string;          // 描述（markdown）
  issueRefs: string[];           // 关联的 issue id 列表（多对多）
  reportPages: string[];         // 关联的 report 页面路径
  subtasks: SubTask[];           // 子任务列表
  hasNewInfo: boolean;           // 是否有需要人类确认的新信息
  createdAt: string;             // 创建时间
  updatedAt: string;             // 最后更新时间
}

type TaskStatus =
  | "running"                    // 执行中
  | "done"                       // 已完成
  | "closed";                    // 已关闭

interface SubTask {
  id: string;                    // 子任务标识
  title: string;                 // 标题
  assignee?: string;             // 分配给哪个 OOC Object
  status: "pending" | "running" | "done";
}
```

### Comment

Comment 是不可变的——创建后不可编辑或删除。

```typescript
interface Comment {
  id: string;                    // 评论标识
  author: string;                // 发言者（OOC Object 名称或 "user"）
  content: string;               // 内容（markdown）
  mentions?: string[];           // @的对象列表
  createdAt: string;             // 发言时间
}
```

### 文件结构

```
flows/{sessionId}/
├── .session.json                ← 已有
├── readme.md                    ← 新增，supervisor 通过 writeFile() 直接维护
├── issues.json                  ← 新增，Issue[] 数组
├── tasks.json                   ← 新增，Task[] 数组
└── flows/                       ← 已有
```

## 并发写入策略

issues.json 有三个写入者：supervisor（session-kanban trait）、其他对象（issue-discussion trait）、后端 API（用户评论）。

**策略：per-session 写入队列**

在 `kernel/src/world/session.ts` 的 Session 中维护一个 per-session 的异步写入队列。所有对 issues.json / tasks.json 的写操作都通过这个队列串行化：

```typescript
class Session {
  private fileWriteQueue: Map<string, Promise<void>>;  // key = 文件路径

  async serializedWrite(filePath: string, fn: () => Promise<void>) {
    const prev = this.fileWriteQueue.get(filePath) ?? Promise.resolve();
    const next = prev.then(fn);
    this.fileWriteQueue.set(filePath, next);
    return next;
  }
}
```

Trait methods 和后端 API 都通过 `session.serializedWrite("issues.json", ...)` 执行写操作，确保同一文件的读-改-写是原子的。

## Trait 设计

### session-kanban（supervisor 专属 trait）

位置：`stones/supervisor/traits/session-kanban/`

前置条件：supervisor stone 必须已存在于 `stones/supervisor/`（OOC 默认创建）。

负责 issue/task 的结构性操作。所有 method 内部读取 JSON 文件 → 修改 → 写回，自动更新 `updatedAt`。

**Session 路径解析**：trait method 通过执行上下文中的 `task_dir` 变量获取当前 session 目录路径（即 `flows/{sessionId}/`），从而定位 `issues.json` 和 `tasks.json`。`task_dir` 是 ThinkLoop 在每轮执行时注入到 `[program]` 作用域中的标准变量。

**Methods**：

| Method | 参数 | 说明 |
|--------|------|------|
| `createIssue(title, description?, participants?)` | 标题、描述、初始参与者 | 创建 issue，状态默认 discussing |
| `updateIssueStatus(issueId, status)` | issue ID、目标状态 | 更新 issue 状态 |
| `updateIssue(issueId, fields)` | issue ID、要更新的字段 | 更新 title/description/participants/taskRefs/reportPages |
| `setIssueNewInfo(issueId, hasNewInfo)` | issue ID、布尔值 | 标记是否需要人类确认 |
| `closeIssue(issueId)` | issue ID | 关闭 issue（设为 closed） |
| `createTask(title, description?, issueRefs?)` | 标题、描述、关联 issue | 创建 task，状态默认 running |
| `updateTaskStatus(taskId, status)` | task ID、目标状态 | 更新 task 状态 |
| `updateTask(taskId, fields)` | task ID、要更新的字段 | 更新 title/description/issueRefs/reportPages |
| `createSubTask(taskId, title, assignee?)` | task ID、标题、分配对象 | 创建子任务 |
| `updateSubTask(taskId, subTaskId, fields)` | task ID、子任务 ID、字段 | 更新子任务状态/assignee |
| `setTaskNewInfo(taskId, hasNewInfo)` | task ID、布尔值 | 标记是否需要人类确认 |

### issue-discussion（kernel trait，所有对象共享）

位置：`kernel/traits/issue-discussion/`

负责 issue 评论和讨论。任何 OOC Object（包括 supervisor）都可以通过此 trait 参与 issue 讨论。Supervisor 评论 issue 时也使用此 trait，而非 session-kanban。

**Session 路径解析**：同 session-kanban，通过 `task_dir` 变量定位 `issues.json`。

**Methods**：

| Method | 参数 | 说明 |
|--------|------|------|
| `commentOnIssue(issueId, content, mentions?)` | issue ID、评论内容、@对象列表 | 发表评论并通知被 @的对象 |
| `listIssueComments(issueId)` | issue ID | 读取 issue 的评论列表 |
| `getIssue(issueId)` | issue ID | 读取 issue 详情 |

**消息投递**：`commentOnIssue` 内部解析 mentions，对每个被 @的对象投递 message（在同一 session 下），消息格式：`"issue-{id} 下有一条来自 {author} 的新评论，请阅读并参与讨论"`。

**Bias**（认知指导）：
- 收到 issue 讨论邀请时，先阅读 issue 描述和已有评论，理解上下文
- 发表评论要有明确立场和论据，不要空泛回复
- 如果需要其他对象的意见，主动 @他们

## 前端设计

### Kanban 视图

**注册**：在 ViewRegistry 中注册，匹配 `flows/{sessionId}` 路径（正则 `/^flows\/[^/]+$/`），priority 120。移除 SessionGantt 的注册。

**布局**：

```
┌────────────────────────┬──────────────┬─────────────┐
│                        │              │             │
│   readme.md            │   Issues     │   Tasks     │
│   (markdown 渲染)      │   按状态分组 │   按状态分组│
│                        │              │             │
│   supervisor 维护的    │   讨论中     │   执行中    │
│   session 工作状态     │   ┌───────┐  │   ┌──────┐  │
│   摘要                 │   │ card  │  │   │ card │  │
│                        │   └───────┘  │   └──────┘  │
│                        │   执行中     │   已完成    │
│                        │   ┌───────┐  │   ┌──────┐  │
│                        │   │ card  │  │   │ card │  │
│                        │   └───────┘  │   └──────┘  │
│                        │              │             │
└────────────────────────┴──────────────┴─────────────┘
```

- 左半屏：readme.md 的 markdown 渲染
- 右半屏两列：Issues 按状态分组、Tasks 按状态分组
- Issues 分组顺序：有新信息需确认 → 讨论中 → 方案设计中 → 方案评审中 → 方案执行中 → 执行结果确认中 → 已完成 → 已关闭
- Tasks 分组顺序：执行中 → 已完成 → 已关闭
- 空分组不显示

### Issue 卡片

```
┌──────────────────────────┐
│ ● API 设计方案           │  ← 标题，左侧状态圆点
│ 2 tasks · Kernel, Sophia │  ← 关联 task 数 + 参与者
│ 3m ago               🔴  │  ← 更新时间 + hasNewInfo 红点
└──────────────────────────┘
```

- 状态圆点颜色：蓝=讨论中，紫=设计中，橙=评审中，琥珀=执行中，青=确认中，绿=完成，灰=关闭
- hasNewInfo 为 true 时右下角显示红点
- 点击 → 打开新 EditorTab 展示 issue 详情页

### Task 卡片

```
┌──────────────────────────┐
│ ● 数据层实现             │  ← 标题 + 状态圆点
│ ██████░░░░ 2/4 subtasks  │  ← 子任务进度条
│ 1h ago               🔴  │  ← 更新时间 + hasNewInfo 红点
└──────────────────────────┘
```

- 状态圆点：琥珀=执行中，绿=完成，灰=关闭
- 点击 → 打开新 EditorTab 展示 task 详情页

### Issue 详情页

注册到 ViewRegistry，虚拟路径 `flows/{sessionId}/issues/{issueId}`（正则 `/^flows\/[^/]+\/issues\/[^/]+$/`），priority 130。

- 顶部：标题、状态 badge、参与者头像列表
- Tabs：描述 | 评论 | 关联 Tasks | Reports
- 评论 Tab：时间线展示所有 comment，底部输入框供用户发言
- Reports Tab：列出 reportPages，点击用 DynamicUI 加载 `files/ui/pages/*.tsx`

### Task 详情页

注册到 ViewRegistry，虚拟路径 `flows/{sessionId}/tasks/{taskItemId}`（正则 `/^flows\/[^/]+\/tasks\/[^/]+$/`），priority 130。

- 顶部：标题、状态 badge、子任务进度
- Tabs：描述 | 子任务列表 | 关联 Issues | Reports
- Reports Tab：同 issue 详情页

### hasNewInfo 重置机制

`hasNewInfo` 红点在用户打开 issue/task 详情页时自动清除：

- 前端打开详情页时，检查 `hasNewInfo` 是否为 true
- 如果是，调用后端 API `POST /api/session/{sessionId}/issues/{issueId}/ack`（或 tasks 对应端点）
- 后端将 `hasNewInfo` 设为 false 并写回 JSON 文件
- Kanban 视图通过 SSE 事件刷新，红点消失

### Report Pages 扩展

现有 `files/ui/index.tsx` 逻辑不变。新增 `files/ui/pages/` 目录，每个 TSX 文件对应一个独立报告或演示。

**DynamicUI 改动**：当前 DynamicUI 只支持加载固定路径 `files/ui/index.tsx`。需要扩展为接受任意 TSX 文件路径参数：

```typescript
// 现有：固定加载 index.tsx
<DynamicUI path={`@flows/${sessionId}/flows/${name}/files/ui/index.tsx`} />

// 扩展：支持 pages 目录下的任意文件
<DynamicUI path={`@flows/${sessionId}/flows/${name}/files/ui/pages/report-001.tsx`} />
```

DynamicUI 组件本身不需要改动（已支持任意路径），只需在 Reports Tab 中传入正确的 pages 文件路径即可。

## 后端 API

### 用户评论端点

```
POST /api/session/{sessionId}/issues/{issueId}/comments
Content-Type: application/json

{
  "content": "评论内容（markdown）",
  "mentions": ["kernel", "sophia"]   // 可选
}
```

- 通过 `session.serializedWrite()` 读取 issues.json → 找到对应 issue → 追加 comment（author: "user"）→ 写回
- 如果有 mentions，投递 message 给被 @的对象（在同一 session 下）
- 返回创建的 comment

### hasNewInfo 确认端点

```
POST /api/session/{sessionId}/issues/{issueId}/ack
POST /api/session/{sessionId}/tasks/{taskId}/ack
```

- 将对应 issue/task 的 `hasNewInfo` 设为 false 并写回
- 通过 `session.serializedWrite()` 保证并发安全

## 数据流

### 写入流

```
Supervisor ThinkLoop
  → 调用 session-kanban trait method
  → method 读取 issues.json / tasks.json → 修改 → 写回
  → 文件写入触发 SSE 事件

任意 OOC Object ThinkLoop
  → 调用 issue-discussion trait method（commentOnIssue）
  → method 读取 issues.json → 追加 comment → 写回
  → 解析 mentions → 投递 message
  → 文件写入触发 SSE 事件

用户在详情页评论
  → 前端 POST /api/session/{sessionId}/issues/{issueId}/comments
  → 后端读取 issues.json → 追加 comment → 写回
  → 如有 mentions，投递 message
  → SSE 事件通知前端刷新
```

### 读取流

```
前端 Kanban 视图挂载
  → fetchFileContent("flows/{sessionId}/readme.md")
  → fetchFileContent("flows/{sessionId}/issues.json")
  → fetchFileContent("flows/{sessionId}/tasks.json")
  → 监听 SSE 事件，收到更新时重新拉取
```

## TODO

- [ ] 甘特图能力整合：在 kanban 视图中整合原 SessionGantt 的时间线信息（暂不实现）
