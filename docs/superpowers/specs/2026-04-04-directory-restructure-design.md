# Feature: OOC 文件目录结构重组

> 日期: 2026-04-04
> 状态: 草案

## 目标

解决三个问题：
1. session 内部 `flows/{sid}/flows/{obj}` 路径有两个 `flows` 段，易引发歧义
2. kanban 数据（issues/tasks）从单 JSON 文件拆分为目录结构，支持单条读写
3. 自定义 UI 路径从 `files/ui` 提升为 `ui`，明确 stone（唯一入口）与 flow（多页演示）的分工

## 目录结构变更

### Session 内部

```
flows/{sessionId}/
├── .session.json              (不变)
├── readme.md                  (不变)
├── objects/                   ← 原 flows/ (session 内部的 flow 对象目录)
│   ├── {objectName}/
│   │   ├── .flow              (不变)
│   │   ├── data.json          (不变)
│   │   ├── process.json       (不变)
│   │   ├── memory.md          (不变)
│   │   └── ui/                ← 原 files/ui/
│   │       └── pages/         ← flow 演示页面
│   │           ├── pageFoo.tsx
│   │           └── pageBar.tsx
│   └── ...
├── issues/                    ← 原 issues.json
│   ├── index.json             (轻量索引，见下方 schema)
│   ├── issue-ISSUE-001.json   (单条 issue 详情，文件名 = issue-{id}.json)
│   └── issue-ISSUE-002.json
├── tasks/                     ← 原 tasks.json
│   ├── index.json             (轻量索引，见下方 schema)
│   ├── task-TASK-001.json     (单条 task 详情，文件名 = task-{id}.json)
│   └── task-TASK-002.json
└── reflect/                   (不变)
```

### Stone

```
stones/{name}/
├── .stone                     (不变)
├── readme.md                  (不变)
├── data.json                  (不变)
├── memory.md                  (不变)
├── traits/                    (不变)
├── reflect/                   (不变)
├── ui/                        ← 原 files/ui/
│   └── index.tsx              (stone 唯一入口界面)
└── files/                     (保留，用于其他数据文件)
```

### UI 分工

| 类型 | 路径 | 说明 |
|------|------|------|
| Stone UI | `stones/{name}/ui/index.tsx` | 唯一主界面入口 |
| Flow UI | `flows/{sid}/objects/{name}/ui/pages/*.tsx` | 多个演示页面，无 index.tsx |

### Kanban index.json Schema

`issues/index.json`:
```json
[
  {"id": "ISSUE-001", "title": "讨论 API 设计", "status": "discussing", "updatedAt": "..."}
]
```

`issues/issue-ISSUE-001.json` — 完整 Issue 对象（与现有 Issue 类型一致）。

`tasks/index.json` 和 `tasks/task-{id}.json` 同理。

index.json 是**数组**格式（与现有结构一致），只保留 4 个索引字段。写入时 writeIssues 同时写 index.json（索引字段）和单条文件（完整数据）。

## 后端变更

### world.ts

- Session 内部 `this.flowsDir` → `this.objectsDir`（仅指 session 内部的 flow 对象子目录）
- 顶层 `flows/` 目录（sessions 根目录）不变
- 所有 `join(flowsDir, objectName)` → `join(objectsDir, objectName)`

### flow/flow.ts

- `Flow.dir` 属性指向的路径会自然变更（因为它由 world.ts 传入）
- `Flow.create()` 路径构建需适配

### context/builder.ts

- 第 238、306 行：`join(sessionDir, "flows")` → `join(sessionDir, "objects")`

### context/history.ts

- `flowsDir` 引用需更新为 `objectsDir`

### flow/thinkloop.ts

- `task_dir: flow.dir` 暴露的路径格式会自然变更

### kanban/store.ts

已有函数调整：
- `readIssues(sessionDir)` → 读 `issues/index.json`
- `writeIssues(sessionDir, issues)` → 同时写 `issues/index.json`（索引字段）和 `issues/issue-{id}.json`（完整数据）
- `readTasks(sessionDir)` → 读 `tasks/index.json`
- `writeTasks(sessionDir, tasks)` → 同时写 `tasks/index.json` 和 `tasks/task-{id}.json`

新增函数：
- `readIssueDetail(sessionDir, issueId)` → 读 `issues/issue-{issueId}.json`
- `writeIssueDetail(sessionDir, issue)` → 写 `issues/issue-{id}.json`
- `readTaskDetail(sessionDir, taskId)` → 读 `tasks/task-{taskId}.json`
- `writeTaskDetail(sessionDir, task)` → 写 `tasks/task-{id}.json`

ID 格式不变，保持现有的 `ISSUE-{num}` / `TASK-{num}` 格式。文件名使用 `issue-ISSUE-001.json`（前缀+ID）。

### world/session.ts

- `Session` 类本身是内存数据结构，不做文件系统操作
- 目录和文件初始化由 `world.ts` 的 `_createAndRunFlow()` 在创建 session 时完成：
  - 创建 `objects/`、`issues/`、`tasks/` 子目录
  - 初始化 `issues/index.json` 和 `tasks/index.json` 为 `[]`

### world/scheduler.ts

- `scheduler.ts` 接收的 `flowsDir` 参数由 `world.ts` 传入，当 world.ts 改为 `objectsDir` 后自然适配
- 内部无硬编码 `"flows"` 路径段，无需额外改动

### server.ts

- 文件树 API 路径调整
- UI 静态文件服务路径: `files/ui` → `ui`（stone 和 flow 统一）
- kanban API 端点路径更新
- getSessionsSummary 中遍历 `flows/` 子目录 → `objects/` 子目录

## 前端变更

### 路径模式变更

| Before | After |
|--------|-------|
| `flows/{sid}/flows/{obj}` | `flows/{sid}/objects/{obj}` |
| `flows/{sid}/flows/{obj}/files/ui` | `flows/{sid}/objects/{obj}/ui/pages` |
| `flows/{sid}/flows/supervisor/files/ui` | `flows/{sid}/objects/supervisor/ui/pages` |
| `stones/{name}/files/ui` | `stones/{name}/ui` |
| `@flows/{sid}/flows/{obj}/files/ui/` | `@flows/{sid}/objects/{obj}/ui/pages/` |
| `@stones/{name}/files/ui/` | `@stones/{name}/ui/` |

### 组件变更

| 组件 | 变更 |
|------|------|
| **App.tsx** | 第 372、388 行: `flows/${activeId}/flows/supervisor` → `flows/${activeId}/objects/supervisor`；`files/ui` → `ui/pages` |
| **SessionFileTree.tsx** | enhanceTree: `flows` 子目录 → `objects`；index 虚拟节点路径更新；.stone 虚拟节点路径中 `files/ui` → `ui` |
| **DynamicUI.tsx** | Flow UI 路径从 `@flows/{sid}/flows/{obj}/files/ui/` → `@flows/{sid}/objects/{obj}/ui/pages/`；Stone UI 路径从 `@stones/{name}/files/ui/` → `@stones/{name}/ui/` |
| **FlowView.tsx** | UI tab 检测路径从 `files/ui` → `ui/pages`；data.json/memory.md 路径更新 |
| **FlowViewAdapter** (registrations.tsx) | match pattern 从 `^flows/[^/]+/flows/[^/]+` → `^flows/[^/]+/objects/[^/]+` |
| **StoneViewAdapter** (registrations.tsx) | UI 路径从 `@stones/${name}/files/ui/` → `@stones/${name}/ui/` |
| **IssueDetailView.tsx** | API 路径更新；reportPages 中的 `@flows/${sid}/flows/supervisor/files/ui/pages/` → `@flows/${sid}/objects/supervisor/ui/pages/` |
| **TaskDetailView.tsx** | 同上 |
| **ViewRouter.tsx** | parseRoute 中所有 `flows/{sid}/flows/` 正则 → `flows/{sid}/objects/`；stone UI 路径更新 |
| **FlowView.tsx (UI检测)** | 第 68-71 行：tree 遍历查找 `files` → `ui` → 改为查找 `ui` → `pages` |

### api/kanban.ts

- `fetchIssues`: 读取路径从 `flows/{sid}/issues.json` → `flows/{sid}/issues/index.json`
- `fetchTasks`: 读取路径从 `flows/{sid}/tasks.json` → `flows/{sid}/tasks/index.json`

### objects/index.ts

- `import.meta.glob` 模式 `../../../stones/*/ui/index.tsx` — 当前已指向正确路径（stone UI 在 `ui/index.tsx`），不需要改
- 但需确认 DynamicUI 中的 import 路径与 glob 注册一致

## 数据迁移

不处理旧数据迁移。新结构从空 session 开始生效。

## 影响范围（完整清单）

### 后端 (kernel/src/)
- `world/world.ts` — flowsDir → objectsDir
- `flow/flow.ts` — Flow.create 路径
- `flow/thinkloop.ts` — flow.dir 路径（自然变更）
- `context/builder.ts` — `join(sessionDir, "flows")` → `join(sessionDir, "objects")`
- `context/history.ts` — flowsDir 引用
- `kanban/store.ts` — 路径重构
- `kanban/methods.ts` — 路径重构
- `kanban/discussion.ts` — 路径重构
- `world/session.ts` — 初始化目录创建
- `server/server.ts` — API 路径、文件服务路径、getSessionsSummary
- `world/scheduler.ts` — 接收 `flowsDir` 参数传递给 `Flow.createSubFlow()`，当 world.ts 改为 `objectsDir` 后自然适配，无需额外改动

### 前端 (kernel/web/src/)
- `App.tsx` — supervisor 路径
- `features/SessionFileTree.tsx` — enhanceTree
- `features/DynamicUI.tsx` — UI 路径解析
- `features/FlowView.tsx` — UI tab 检测 + 数据路径
- `features/IssueDetailView.tsx` — API + reportPages 路径
- `features/TaskDetailView.tsx` — API + reportPages 路径
- `features/ViewRouter.tsx` — parseRoute 正则
- `router/registrations.tsx` — match patterns
- `api/kanban.ts` — fetchIssues/fetchTasks 路径
- `objects/index.ts` — 确认 glob 路径一致性

### 文档
- `docs/meta.md` — 架构描述更新
- `kernel/traits/kernel/cognitive-style/TRAIT.md` — 更新具体路径示例：`task_dir` 从 `flows/{sessionId}/flows/{objectName}/` → `flows/{sessionId}/objects/{objectName}/`；`task_files_dir` 从 `task_dir + "/files"` 保持不变（files 目录仍存在，只是 UI 从 files/ui 提升为 ui）；UI 相关说明从 `files/ui/` → `ui/`

## 体验验证

实现完成后，spawn 两个体验角色进行系统验证：

- **Bruce** — 通过 CLI/API 端到端测试：创建 session、发送消息、验证新目录结构是否正确生成（`objects/`、`issues/`、`tasks/` 子目录和 `index.json`）、验证 kanban API 端点是否正常工作
- **Candy** — 通过 Web UI 测试：验证 session 侧边栏文件树是否正确展示新路径、点击 index 节点是否打开 Kanban 视图、FlowView 和 StoneView 的 UI tab 是否正确加载自定义组件
