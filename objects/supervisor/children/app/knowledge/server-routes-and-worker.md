---
activates_on: {"window::root": "show_content"}
---

# app.server — 路由表与 worker 调度

## 装配与错误模型

Elysia app 在 `packages/@ooc/core/app/server/index.ts` 装配：`:212` 是 `onError` 全覆盖包络（把 AppServerError / Elysia NotFound / ValidationError / fs ENOENT / 兜底统一为 `{error:{code,message,details}}`，AppServerError 必须**先**判定以免被 elysiaCode="NOT_FOUND" 错认成 route 未匹配）；`:218-224` 依次 `use` 七个 module（health / runtime / stones / pools / ui / flows / world-config）；`:342` 用 `listen({port, hostname:"0.0.0.0"})`（macOS bun 默认只绑 IPv6 的坑已修）。

契约：service 层错误一律 `throw new AppServerError(code, msg, details)`（`bootstrap/errors.ts`），端点层不要 `set.status=404` 裸返回，否则形态分裂。

## 路由模块清单（feature-based，one-api-per-file）

每个 module 目录：`index.ts`（route composition）+ `service.ts` + `model.ts` + `api.<action>.ts`。

- **health**：`GET /api/health` 最小存活探针。
- **runtime**（`modules/runtime/`）：llm-config / jobs / global-pause（status/enable/disable）/ debug（status/enable/disable）/ activity / thread debug 文件读取。pause、debug、job 是**进程内状态**，不是 world 持久化真相，但通过 HTTP 明确出入口暴露成可查询、可切换。
- **stones**：stone 五件套读写 + call_method。**所有写 stone 的 HTTP 必经 stone-versioning**（worktree → commit → merge），无 uncommitted 半成品。
- **pools**（`modules/pools/`）：knowledge / data / files 沉淀的 HTTP 入口（pool 不挂 branch、不进 git）；旧 `/api/stones/.../knowledge/*` 保留并加 `X-Deprecated` header。
- **flows**：session / flow object / thread 生命周期 + call_method；list 附带 paused 状态。`POST /api/sessions`（seedSession）一次性 seed session + user flow object + talk_window + 派送 initialMessage；`POST /api/flows/:sid/continue`（body `{text, targetWindowId?}`）走 user.root.talk_window。`SUPER_SESSION_ID` 在 `modules/flows/service.ts:46`（`assertNotSuperSessionId`，抛于 `:48`）被显式拒绝（reflectable 专用，外部只读保留）。
- **ui**（`modules/ui/`）：`GET /api/tree`（整树递归 + 基于 `.stone.json`/`.pool.json`/`.flow.json` 元数据存在性打 marker）/ `/api/tree/file`（world 内安全读）/ `/api/file/read`（**有意绕过隔离**，仅本地可信）/ `/api/objects/:scope/:id/client-source-url`（backend 权威解析 client 入口，frontend 不硬编码路径）。
  - ⚠️ `modules/ui/api.list-flows.ts` 定义 `GET /api/flows`（`listFlowsApi`），service 侧 `ui/service.ts:183` 的 `listFlows()` 已实现，但 `ui/index.ts` 从未 `.use(listFlowsApi(...))` —— 路由没挂上的半孤儿，待补挂或删文件。
- **world-config**：world 级配置读取。

## runtime 编排（`server/runtime/`）

- **job-manager.ts**：job 队列与状态机。`createRunThreadJob` 走 dedupe（`:34`，`createJob(..., dedupe=true)`，按 session+object 复用 queued/running job）；`createResumeThreadJob` **不** dedupe（`:37`，`dedupe=false`，每次显式恢复入队新 job）；`tryClaimQueuedJob`（`:59`）原子翻 queued→running 保多 tick 并发不重复处理。
- **worker.ts**：只跑队列，不周期扫 fs。`runScheduler` 单批跑满 `workerMaxTicks ?? 15`（`:75`）；若 thread 仍 running，写 `scheduler_yielded` 事件留痕（`:88`），并在当前 job 标 done 后由 `processQueuedJobs` 续跑（自唤醒，让长任务跨 job）。状态翻转 → enqueue 由事件源 `notifyThreadActivated` 触发（talk-delivery / do_window.continue / issue appendComment / end auto-reply / resume / scheduler-yield）。启动期一次性兜底 `enqueueRunningThreadsAtBootstrap`（`:178`）入队 orphan running thread。`user` object 是被动对象，worker 跳过不调度（`worker.ts:40,46`）。
- **pause-store.ts / resume.ts / thread-query.ts**：进程内 pause 状态、半轮粒度 resume（接着执行上次已拿到但未消费的 LLM 输出，不重跑模型避免重复扣费）、线程查询。

## 本地联调原则

"部分 404、部分正常"多半是**旧 server 进程残留**占端口，收到请求的是旧实例。先 `lsof -nP -iTCP:3000 -sTCP:LISTEN` 清理旧进程，别只看 /health。
