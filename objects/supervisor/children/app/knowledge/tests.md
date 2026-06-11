---
title: app 测试规格与归属
description: 控制面（HTTP runtime orchestration）的测试归属——无独立 capability spec（横向模块）；由单元 catalog 的 runtime/ui/world 端点条目 + core/app/server 单测覆盖
activates_on: {"object::root": "show_description"}
---

# 我（app 控制面）怎么被验证

app 是**横向模块**（不是能力维度），没有 `capability_app.md` spec、没有 Good/OK/Bad agent-native rubric。
我的测试散在两处：storybook 单元 catalog 里打我端点的条目 + `packages/@ooc/core/app/server/**/__tests__` 的
runtime 单测。测试代码全在 `packages/@ooc/`（`test:storybook` + `bun test packages/@ooc/core/` 可跑/进 CI）。

## Tier A —— 控制面确定性（单元 catalog，打我端点的条目）

- **L1-SEED-RESPONSE** —— `POST /api/sessions` 返回 sessionId/targetThreadId（seed 编排）。
- **L5-DEBUG-TOGGLE** —— debug enable → `/api/runtime/debug/status` enabled。
- **L5-ACTIVITY** —— `/api/runtime/activity` 返回 now/runningCount/jobs 结构。
- **L5-GLOBAL-PAUSE** —— global-pause enable/disable→status 一致。
- **L5-JOB-STATUS** —— seed 产生的 job 经 `/api/runtime/jobs/:id` 可查 status。
- **L8-TYPES-CATALOG** —— `/api/objects/_shared/types` 列出已注册 type。
- **L8-WORLD-CONFIG** —— `/api/world/config` 返回 siteName 等。

（以上 story 在 `stories/L1_session.stories.ts` / `L5_observable.stories.ts` / `L8_visible.stories.ts`，
端点归我 app、由对应维度的单元 story 顺带验证。）

## runtime 单测（core/app/server）

- `runtime/worker-yield.test.ts` —— worker job 调度 / yield / dedup。
- `runtime/resume-orchestration.test.ts` —— 启动期 running thread 入队恢复。
- `bootstrap/__tests__/config.test.ts` —— `--world` 解析 / workerMaxTicks 校验。
- 治理端点：`POST /api/runtime/pr-issues/:id/resolve`、`POST /api/runtime/stones/:id/rollback`
  的端到端经 `tests/e2e/backend/stones-versioning.e2e.test.ts` 验（resolvePrIssue/rollback 直调 + FORBIDDEN/NOT_FOUND）。
- feat-branch PR 治理端点：`GET /api/runtime/pr-issues`（list 摘要）、`GET /api/runtime/pr-issues/:id`（get 全量，未知→404）、`POST /api/runtime/pr-issues/:id/approve`（reviewer 审批，非 reviewer→409）经 `runtime/api.pr-issue-governance.test.ts` 验。

## 演化方向

- 控制面缺一条把 9 维度端点系统过一遍的「路由可达性」单元 story（route-audit）——目前散在各维度 story 里顺带验，无集中清单。
