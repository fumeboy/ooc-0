# 多文件 Transaction + Preview

> 类型：feature
> 创建日期：2026-04-22
> 状态：todo
> 负责人：TBD
> 优先级：P0

## 背景 / 问题描述

当前 `file_ops.writeFile` 是单文件立即写入：
- 跨文件重构（改 5 个文件）中间失败 → 仓库半改动态，无法回滚
- 用户看不到"LLM 打算改什么"的预览
- 无 dry-run 能力

对标 Claude Code / Aider：multi-file diff preview + atomic apply。

## 目标

1. **批量编辑 API**：`plan_edits({ changes: [{path, oldText, newText} | {path, write: newContent}] })`
   - 不真写，生成 edit plan
   - 返回 plan_id + 所有 diff 摘要
2. **Preview**：前端能看到 plan 的 unified diff（侧滑面板）
3. **Atomic apply**：`apply_edits(plan_id, options)` 一次提交，任意失败全部回滚
4. **User approval gate**（可选）：某些路径（如 `.env` / `kernel/src`）需要用户点击"应用"

## 方案

### Phase 1 — 后端

- 新 `kernel/src/persistence/edit-plans.ts`
- plan 持久化在 `flows/{sid}/edit-plans/{plan_id}.json`
- apply 用 git stash 做 snapshot（失败时 `git stash pop` 回滚）

### Phase 2 — Trait 方法

- `computable/file_ops` 新增 `plan_edits` / `preview_edit_plan` / `apply_edits`
- 老 `writeFile` 保留（单文件直接写仍然合法）

### Phase 3 — 前端

- `TuiAction` 识别 plan 输出 → 渲染带"查看 diff / 应用"按钮的卡片
- Diff 用 CodeMirror merge view

### Phase 4 — 验证

- LLM 做一次跨 5 文件的重构，用户看到 preview 后点应用

## 影响范围

- `kernel/traits/computable/file_ops/index.ts`
- `kernel/src/persistence/edit-plans.ts`（新）
- `kernel/web/src/features/` — edit plan 展示组件

## 验证标准

- 单文件 + 多文件 + 失败回滚三类单元测试
- E2E：bruce 做跨文件重构

## 执行记录

### 2026-04-22 P0-CodeAgent 落地

- 新建 `kernel/src/persistence/edit-plans.ts`：plan 创建/读取/预览/应用/取消
- plan 持久化 `flows/{sessionId}/edit-plans/{planId}.json`（无 sessionId 则 `/tmp/ooc-edit-plans/`）
- apply 语义：先读 snapshot → 预计算所有 change → 写盘阶段任一失败按 snapshot 回滚
- 扩展 `kernel/traits/computable/file_ops/`：新增 plan_edits / preview_edit_plan / apply_edits / cancel_edits 四个 llm_methods
- 前端新建 `kernel/web/src/features/EditPlanView.tsx` 展示 plan + unified diff，onApply/onCancel 作为 prop 待后续接 HTTP
- 测试：`tests/edit-plans.test.ts` 13 tests + `tests/trait-file-ops.test.ts` +1 test，全部 pass
- 全量基线：624 → 668 pass / 6 skip / 0 fail

### 未完成 / backlog

- 前端 HTTP 端点：创建 plan / 应用 plan / 拉取 plan 详情（需要 Running-Summary-Agent 完成 server.ts 后再接）
- TuiAction 自动识别 plan 输出并渲染 EditPlanView 卡片
- git stash 备份式回滚（当前是按 snapshot 内容回滚，功能等价但重复开销）
