# Running Session 动态摘要（对齐 finished 的一句话摘要）

> 类型：feature
> 创建日期：2026-04-22
> 状态：finish
> 负责人：Running-Summary-Agent（2026-04-22 认领并完成）
> 优先级：P2

## 背景 / 问题描述

Bruce 回归第 2 轮发现（`bruce-report-2026-04-22-regression.md` P2-3）：

- **Finished session**：SessionKanban 列表显示"一句话任务摘要"（如"用户发来问候你好，已直接回复并完成。"）——非常有用
- **Running session**：只显示 `@supervisor`，没有任何"当前在做什么"的提示
- 用户对比之下觉得"running 状态信息量太少"

## 目标

Running session 的行也显示一句话动态摘要："正在 <当前动作>"或从最新 thinking 抽一句提炼。

## 方案

### Phase 1 — 后端

- SessionKanban API 已有 subflow status，扩展每个 subflow 返回 `currentAction`：
  - 优先级：最新 thinking 首句 > 最新 tool_use.title > 最新 action.type
- 限长 50 字符

### Phase 2 — 前端

- `SessionKanban.tsx` 的 running 行：显示 currentAction，旁边加 spinner 或 pulse 效果
- Finished 行保持不变（summary）

### Phase 3 — 实时性

- SSE flow:action 事件触发 SessionKanban 刷新（已有 debouncedRefresh）
- 动态摘要随 action 更新而变化

## 影响范围

- `kernel/src/server/server.ts`（GET /api/flows/:sid 响应扩展）
- `kernel/web/src/features/SessionKanban.tsx`

## 验证标准

- bruce 做一个多步任务 → 中间多次 tool_use → kanban 行的动态摘要随之变化
- 对比 finished 一句话摘要，视觉一致性好

## 执行记录

### 2026-04-22 — Running-Summary-Agent 完成

**Phase 1（后端）** commit `2a00e9d`：
- `kernel/src/server/server.ts`：新增 `computeCurrentAction(process)` helper，
  按优先级"最新 thinking 首句 → 最新 tool_use.title → 最新 action name/type"
  提炼 ≤50 字符摘要。
- `GET /api/flows/:sid` 响应的 `subFlows[i]` **仅追加** 可选字段 `currentAction`，
  原有 `stoneName / status / process` 三字段完全不变。
- 仅 `running / waiting` 状态填充 currentAction；`finished / failed / pausing`
  让位给已有的 `node.summary` 一句话任务摘要，避免两层摘要重叠。
- 新增端到端测试 `tests/server-current-action.test.ts`（6 tests）：
  覆盖三级优先级、50 字符截断、空 actions、finished 不带 currentAction。

**Phase 2 & 3（前端 + 实时性）** commit `84911ba`：
- `kernel/web/src/api/types.ts`：`SubFlowSummary` 新增可选字段 `currentAction`。
- `kernel/web/src/features/SessionKanban.tsx`：
  - 首次挂载 `fetchFlow(sessionId)` 加载 `subFlowMeta`（Map<stoneName, {status, currentAction}>）。
  - 现有 `debouncedRefresh`（SSE `flow:action` 驱动）同步刷新 subFlowMeta。
  - 对象 header 旁展示 "● 正在 &lt;currentAction&gt;"（pulse 蓝点 + truncate），
    fallback "● 思考中…"；`title` 属性承载完整内容。
  - `data-testid="current-action-<name>"` 便于 E2E 断言。

**E2E 证据**（`docs/工程管理/验证/screenshots-running-summary/`）：
- `endpoint-evidence.json` — curl 响应 subFlow.currentAction 字段存在
- `02-kanban-session.png` — waiting session 头部显示 "正在 The user said ..."
- `03-current-action-closeup.png` — pulse + 摘要元素特写
- `04-kanban-finished.png` — finished session 不显示 current-action（对照组）

**测试基线**（含 sibling commit 叠加后）：
- `bun test`：666 pass, 6 skip, 1 fail（`edit-plans.test.ts`，P1 sibling 战场，非我引入）
- 我的 6 个新测全部通过；`server.ts` 无 tsc 错误
- 前端 `tsc -b` 0 error；`bun run build` pass

**非预期**：
- parallel sibling 在同一仓库推进时，`git status` 持续出现 sibling 的
  staged/untracked 文件；commit 前多次 `git reset HEAD` + 显式 `git add <file>`
  才能只提交自己的 diff（硬约束"显式 git add <path>"的原因体现）。
- tsc baseline 存在 ~139 个预存错误（集中在 `library_index / git / engine / hooks / tests`
  等，P0/P1 战场或历史遗留），与本迭代无关。
