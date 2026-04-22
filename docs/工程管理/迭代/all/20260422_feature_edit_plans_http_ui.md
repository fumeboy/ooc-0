# Edit Plans HTTP Endpoints + UI 闭环

> 类型：feature
> 创建日期：2026-04-22
> 状态：todo
> 负责人：TBD
> 优先级：P1

## 背景

`multi_file_transaction.md` 落地了后端 plan/apply/cancel + 前端 `EditPlanView` 组件，但**HTTP endpoint + TuiAction 渲染缺失**，导致前端无法真正走完"LLM 生成 plan → 用户看 diff → 点应用"的闭环。

两道卡点：
1. Multi-file-tx agent 遵守硬约束未碰 `server.ts`（Running-Summary 在并发改）→ 跳过 HTTP
2. TuiAction 未注册 plan 类型的自定义卡片渲染

## 目标

1. **HTTP endpoints**：
   - `GET /api/flows/:sid/edit-plans/:planId` 详情
   - `POST /api/flows/:sid/edit-plans/:planId/apply` 应用
   - `POST /api/flows/:sid/edit-plans/:planId/cancel` 取消
2. **TuiAction 识别 plan_edits tool_use**：
   - action.name === "submit" 且 args.command === "plan_edits" → 渲染 `EditPlanView` 卡片
   - 卡片带"查看 diff / 应用 / 取消" 按钮
3. **plan 应用后 build-hook 触发**：参见 `feedback_loop_完整闭环.md` Phase 3（两迭代联动）

## 方案

### Phase 1 — HTTP 端点

- `server.ts` 追加 3 个路由
- 调用 `persistence/edit-plans.ts` 已有 API

### Phase 2 — TuiAction 识别

- `components/ui/TuiBlock.tsx`（TuiAction）识别 plan_edits command
- 嵌入 EditPlanView 并接 HTTP client 的 apply/cancel 调用

### Phase 3 — 体验验证

- LLM 用 plan_edits 做跨文件重构
- user 前端看到 diff preview
- 点应用 → 写盘成功

## 影响范围

- `kernel/src/server/server.ts`
- `kernel/web/src/api/client.ts`（plan-related methods）
- `kernel/web/src/components/ui/TuiBlock.tsx`
- 新增测试

## 验证标准

- E2E：Playwright 点击 apply → 文件落盘
- `bun test` 0 fail

## 执行记录

（初始为空）
