---
activates_on: {"object::root": "show_description"}
---

# app.server — 路由表与 worker 调度

## 装配与错误模型

Elysia app 在 `packages/@ooc/core/app/server/index.ts` 装配：`:212` 是 `onError` 全覆盖包络（把 AppServerError / Elysia NotFound / ValidationError / fs ENOENT / 兜底统一为 `{error:{code,message,details}}`，AppServerError 必须**先**判定以免被 elysiaCode="NOT_FOUND" 错认成 route 未匹配）；`:218-224` 依次 `use` 七个 module（health / runtime / stones / pools / ui / flows / world-config）；`:342` 用 `listen({port, hostname:"0.0.0.0"})`（macOS bun 默认只绑 IPv6 的坑已修）。

契约：service 层错误一律 `throw new AppServerError(code, msg, details)`（`bootstrap/errors.ts`），端点层不要 `set.status=404` 裸返回，否则形态分裂。

## 路由模块清单（feature-based，one-api-per-file）

每个 module 目录：`index.ts`（route composition）+ `service.ts` + `model.ts` + `api.<action>.ts`。

- **health**：`GET /api/health` 最小存活探针。
- **runtime**（`modules/runtime/`）：llm-config / jobs（list + get-by-id）/ global-pause（status/enable/disable）/ debug（status/enable/disable）/ activity / thread debug 文件读取（latest + loop list/get）/ HITL permission decision。pause、debug、job 是**进程内状态**，不是 world 持久化真相，但通过 HTTP 明确出入口暴露成可查询、可切换。
  - `GET /api/runtime/activity`：进程内运行时活动快照（log-aggregator 聚合），长跑/超时排查时不干等，用它定位根因。
  - `POST /api/runtime/flows/:sid/:oid/threads/:tid/permission`（body `{eventId?, action:"approve"|"reject", reason?}`）：**HITL** approve/reject 入口（permission model §F / Q0c）。要求 thread status=paused、命中最近一条未 decided 的 `permission_ask` 事件；写 decided + 翻 running + `notifyThreadActivated`（与 talk-delivery 同款续跑路径）。注意实际路径挂在 `/runtime/flows/...` 前缀下（非 design 文档里的 `/api/threads/:tid/permission`），复用 threadDebugParams 避免按 threadId 全局扫 session。
  - debug 文件读取（latest / loop list / loop get）使用 server config 注入的 `baseDir`，**不再接受 `?baseDir=` query 覆盖**（旧 `process.cwd()` fallback 与 query override 均已移除；见 `api.get-latest-debug.ts:6-13`，移除原因：query override 允许外部 caller 读任意 host 路径）。
- **stones**：stone 五件套读写。**所有写 stone 的 HTTP 必经 stone-versioning**（worktree → commit → merge），无 uncommitted 半成品。（裁定：stone scope **无 call_method**——不调 object 程序、stone client 只读，运行时/data 编辑归 flow scope；代码侧 stones `/call_method` 已退役。）
- **pools**（`modules/pools/`）：knowledge / data / files 沉淀的 HTTP 入口（pool 不挂 branch、不进 git）；旧 `/api/stones/.../knowledge/*` 保留并加 `X-Deprecated` header。
- **flows**：session / flow object / thread 生命周期 + call_method；list 附带 paused 状态。`POST /api/sessions`（seedSession）一次性 seed session + user flow object + talk_window + 派送 initialMessage；`POST /api/flows/:sid/continue`（body `{text, targetWindowId?}`）走 user.root.talk_window。`SUPER_SESSION_ID` 在 `modules/flows/service.ts:47`（`assertNotSuperSessionId`，抛于 `:49`）被显式拒绝（reflectable 专用，外部只读保留）。
- **ui**（`modules/ui/`）：`GET /api/tree`（整树递归 + 基于 `.stone.json`/`.pool.json`/`.flow.json` 元数据存在性打 marker）/ `/api/tree/file`（world 内安全读）/ `/api/file/read`（**有意绕过隔离**，仅本地可信）/ `/api/objects/:scope/:id/client-source-url`（backend 权威解析 client 入口，frontend 不硬编码路径）。
- **world-config**（`modules/world-config/`，单文件 `index.ts`）：world 级配置（`.world.json`）的只读 HTTP 入口，供前端读 LLM provider 等 world 级设置。

## 启动期自检链（`if (import.meta.main)`，非每请求）

`index.ts` 在 listen 前按序跑一组**幂等**的 bootstrap 步骤，再 `buildServer(config).listen({port, hostname:"0.0.0.0"})`：

1. `ensureStoneRepo`：init bare stones git repo + main worktree，迁移旧扁平布局。必须先于任何版本化 stone 写。
2. `createPoolObject` for `BUILTIN_OBJECT_IDS`（supervisor / user）：builtin 的 stone/definition 随代码仓发布不写 world，但 pool 是 world 内跨 session 沉淀层，需保证 `pools/<id>/` 存在。
3. `instantiateBuiltinClassObjects`：把 `ooc.kind==="object"` 的框架 builtin class（supervisor）幂等实例化为可交互 `objects/<id>`（拷 self.md + 写 `ooc.class`），让全新 world 自动有 supervisor object。
4. `runRecoveryCheck`（非阻塞）：经 `loadStoneClass` 遍历加载 `stones/main/<obj>/index.ts`（`export const Class` 装配口），加载失败的开 PR-Issue 到 super session，dump objectId + reason，供 Supervisor 决策回滚。

另：`buildServer` 若 `workerEnabled` 且 `.world.json` 配了 Lark 凭证，会 fire-and-forget 起 `startLarkEventRelay`（ws 长连接收 im.message 反向触发 OOC session；缺凭证 noop），并把 thread 状态翻转 `maybeForwardToLark`。

## runtime 编排（`server/runtime/`）

- **job-manager.ts**：job 队列与状态机。`createRunThreadJob` 走 dedupe（`:41`，`createJob(..., dedupe=true)`，按 session+object 复用 queued/running job）；`createResumeThreadJob` **不** dedupe（`:44`，`dedupe=false`，每次显式恢复入队新 job）；`tryClaimQueuedJob`（`:66`）原子翻 queued→running 保多 tick 并发不重复处理。
- **worker.ts**：只跑队列，不周期扫 fs。`runScheduler` 单批跑满 `workerMaxTicks ?? 15`（`:75`）；若 thread 仍 running，写 `scheduler_yielded` 事件留痕（`:90`），并在当前 job 标 done 后由 `processQueuedJobs` 续跑（自唤醒，让长任务跨 job）。状态翻转 → enqueue 由事件源 `notifyThreadActivated` 触发（talk-delivery / talk fork 内存派送 / issue appendComment / end auto-reply / resume / scheduler-yield）。启动期一次性兜底 `enqueueRunningThreadsAtBootstrap`（`:178`）入队 orphan running thread。`user` object 是被动对象，worker 跳过不调度（`worker.ts:40,46`）。
- **pause-store.ts / resume.ts / thread-query.ts**：进程内 pause 状态、半轮粒度 resume（接着执行上次已拿到但未消费的 LLM 输出，不重跑模型避免重复扣费）、线程查询。

## 本地联调原则

启动约束（`--world` 解析、端口、旧 server 进程残留 / `lsof` 排查、runtime 单例测试卫生）权威在 [[startup-constraints]]，此处不复述。
