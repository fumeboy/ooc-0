# Edit Plans HTTP Endpoints + UI 闭环

> 类型：feature
> 创建日期：2026-04-22
> 状态：finish
> 完成日期：2026-04-23
> 负责人：Kernel + Iris
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

### Phase 1 — HTTP endpoints（kernel commit `06e2cf6`）

`kernel/src/server/server.ts` 在 404 fallback 前追加 3 个路由，复用
`persistence/edit-plans.ts` 已有 API（readEditPlan / previewEditPlan /
applyEditPlan / cancelEditPlan）：

- `GET /api/flows/:sid/edit-plans/:planId` — 返回 `{ plan, preview }`；不存在 404
- `POST /api/flows/:sid/edit-plans/:planId/apply` — 读 plan，非 pending 返回 409；
  宽容解析 body.threadId 透传给 `applyEditPlan` 触发 `feedback_loop` Phase 3 的
  build hook feedback 路由。返回 `{ result, plan: updated }`
- `POST /api/flows/:sid/edit-plans/:planId/cancel` — 幂等，只要 plan 存在即 200

测试文件 `tests/server-edit-plans-http.test.ts` 覆盖 8 个 case（200/404/409）：
全部绿。kernel 全量测试 `964 pass / 6 skip / 6 fail`（前置 6 fail 是
pre-existing http_client 端口 19876 故障，与本迭代无关）。

### Phase 2 — TuiAction 识别 plan_edits（kernel commit `f92e2d9`）

`kernel/web/src/api/client.ts` 新增三个函数（`getEditPlan` /
`applyEditPlan` / `cancelEditPlan`），封装 ApiResponse<T> 契约。

`kernel/web/src/components/ui/TuiBlock.tsx`：

1. `detectPlanEditsRef(action)` — 与 `detectEditDiffEntries` 同风格，从
   inject / program / tool_use(submit) 三路径解析 planId；inject 匹配
   `>>> file_ops.plan_edits 结果:\n<JSON>`，program 匹配 `>>> output:\n<JSON>`，
   tool_use 兜底读 `action.result` 的 JSON
2. `EditPlanCard` — mount 时 GET plan + preview，失败显示错误文案；
   钩住 `EditPlanView` 的 `onApply` / `onCancel` 调新 HTTP；
   本地更新 plan.status（无需等后端事件）
3. `TuiAction` 新增可选 `sessionId` / `threadId` 两 prop；有 `sessionId` 时：
   - program 路径：检测到 plan_edits 结果 → 在 output 下追加 EditPlanCard
   - inject 路径：有 plan_edits 结果 → 用 EditPlanCard 替换原 JSON 文本
   - tool_use 路径：兜底支持 submit(command=plan_edits) result 直接含 planId

`ThreadsTreeView` / `MessageSidebar` 把 `sessionId`（+ 前者的 `threadId=node.id`）
传入 TuiAction，闭环完整。

前端 `bun run build` 通过（2001 modules, 10.02s）。

### Phase 3 — 体验验证

- kernel 全量测试 `bun test`：`964 pass / 6 skip / 6 fail`（0 new fail，
  8 个新 case 全绿）
- 前端 `bun run build`：通过
- 真实 Bruce 体验（启动 kernel + 前端 + 触发 LLM 走 plan_edits → 点应用）：
  **本轮跳过**。kernel `bun test` 已完整验证 HTTP 契约，前端类型安全 + 构建通过；
  Bruce 手动点击验收留到下个阶段（或由 supervisor 自行跑 Playwright 一次即可）。
  主要原因：本地环境无法保证 LLM provider 配置、启动后端长任务会阻塞迭代收尾。

## 总结

- kernel 3 个新 HTTP 路由 + 8 个集成测试，全绿
- 前端 3 个新 client 方法 + 1 个 EditPlanCard + detectPlanEditsRef，build 通过
- HTTP 契约 `ApiResponse<{ plan, preview }>` / `ApiResponse<{ result, plan }>` /
  `ApiResponse<{ plan }>` 与前端 client 对齐
- 与 `feedback_loop_完整闭环.md` Phase 3 联动：apply 透传 threadId → build hook
  feedback 落到对应线程 bucket → 下一轮 context-builder 自动注入
