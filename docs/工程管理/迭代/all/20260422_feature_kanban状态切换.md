# Kanban Issue/Task 状态切换 UI + 后端端点

> 类型：feature
> 创建日期：2026-04-22
> 状态：todo
> 负责人：TBD

## 背景 / 问题描述

Bruce 首轮报告 #12：Kanban Issue/Task 详情页的"讨论中"状态 badge 看起来像可点，但实际没有切换入口。排查发现：
- `kanban/methods.ts` 已有 `updateIssueStatus` / `updateTaskStatus` 函数（session-kanban trait methods）
- 但**后端没有 HTTP 端点暴露**给前端
- 前端 IssueDetailView / TaskDetailView 无交互 UI

## 目标

1. **后端 HTTP 端点**：
   - `POST /api/sessions/:sid/issues/:id/status` body `{ status: "..." }`
   - `POST /api/sessions/:sid/tasks/:id/status` body `{ status: "..." }`
   - 校验合法 status 值；调用 `kanban/methods.ts` 已有函数
2. **前端交互**：
   - Issue/Task 详情头部 status badge 可点 → 弹出下拉菜单选新状态
   - Issue 状态候选：discussing / designing / reviewing / executing / confirming / done / closed
   - Task 状态候选：running / done / closed
   - 切换后乐观更新 + 调 API + SSE 刷新
3. **类型同步**：api/types.ts + api/client.ts
4. **测试**：后端 endpoint unit test + 前端 tsc

## 方案

### Phase 1 — 后端端点

- 读 `kernel/src/kanban/store.ts` / `methods.ts` 了解现有签名
- `kernel/src/server/server.ts` 文件末尾追加两条路由
- 校验合法 status 枚举（Issue 7 种 / Task 3 种）
- 复用 `session.serializedWrite` 或 SerialQueue（参考 user-inbox 模式）
- 单元测试 `kernel/tests/server-kanban-status.test.ts`
- commit：`feat(server): POST /api/sessions/:sid/{issues,tasks}/:id/status`

### Phase 2 — 前端 UI

- `kernel/web/src/api/types.ts` 加 `IssueStatus` / `TaskStatus` 枚举（或 literal union）
- `kernel/web/src/api/client.ts` 加 `setIssueStatus` / `setTaskStatus`
- `features/IssueDetailView.tsx` + `TaskDetailView.tsx` 头部 status badge 改为 `<button>` + 下拉菜单
- 点击菜单项调 API → 乐观更新 → 等 SSE 回调或直接 refetch
- 视觉：下拉菜单 style 参考现有 CommandPalette / mention picker
- tsc + build 0 error
- commit：`feat(web/kanban): Issue/Task status badge 可点切换`

### Phase 3 — 体验验证

- 启动服务
- Playwright 打开 Issue 详情 → 点 status badge → 选新状态 → 确认 badge 改变且持久化
- 截图存证据

commit：`test: kanban 状态切换 E2E 验证`

## 影响范围

- **后端**：`kernel/src/server/server.ts`、新测试
- **前端**：
  - `kernel/web/src/api/types.ts` / `client.ts`
  - `kernel/web/src/features/IssueDetailView.tsx`
  - `kernel/web/src/features/TaskDetailView.tsx`
- **文档**：`docs/meta.md` 子树 7（看板数据）或子树 6（Web UI）更新

## 验证标准

- 后端 endpoint 单元测试绿
- 前端 tsc 0 error / build pass
- 后端 `bun test` 保持 571+ pass / 0 fail
- E2E：点击 status badge 能切换并持久化

## 执行记录

### 2026-04-22 完成

**Phase 1 — 后端端点**（kernel commit `f30f864`）
- `kernel/src/server/server.ts` 追加两条路由：
  - `POST /api/sessions/:sid/issues/:id/status` body `{status}`
  - `POST /api/sessions/:sid/tasks/:id/status` body `{status}`
- 非法 status → 400（带合法值列表），未知 session / id → 404，成功返回完整更新后对象。
- 新增测试 `kernel/tests/server-kanban-status.test.ts`（7 pass）。

**Phase 2 — 前端 UI**（kernel commit `52b6d38`）
- 新增 `kernel/web/src/features/kanban/StatusBadgeMenu.tsx`：
  原 status badge 改造为 `<button>` + 下拉菜单，点击切换。
- `IssueDetailView` / `TaskDetailView` 接入：乐观更新 → 调 API → 失败回滚。
- `api/kanban.ts` 新增 `setIssueStatus` / `setTaskStatus` + `ISSUE_STATUSES` / `TASK_STATUSES` 常量。
- `tsc --noEmit` 0 error（新增代码），`vite build` 成功。

**Phase 3 — E2E Playwright 验证**
- 启动后端 8080 + 前端 5173，创建 `s_mo9ca3ud_822e5a` session + issue-001 + task-001。
- Issue：`discussing` → `executing`，下拉菜单 7 项全部正确。
- Task：`running` → `done`，下拉菜单 3 项正确。
- 切换后刷新页面状态仍保持；文件落盘验证 `issues/index.json` / `tasks/index.json` 状态一致。
- 截图归档在 `docs/工程管理/迭代/artifacts/20260422_feature_kanban状态切换/`。

**测试基线**：kernel `bun test` 593 pass / 6 skip / 0 fail（本迭代贡献 +7，兼容 sibling agent 的 +15）。
