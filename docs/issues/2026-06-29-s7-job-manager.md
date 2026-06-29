---
title: S7 · runtime job-manager + jobs endpoint
status: landed
date: 2026-06-29
follows: 2026-06-29-web-server-reimpl-index.md
priority: P2
---

# S7 · runtime job-manager + jobs endpoint

## 背景

来自总目录 S7 项。桩点 **1 个**:C3(fetchJob)。看似小,但**实现需要在 backend 引入 job-manager**——这是当前 worker.ts 没做的事(目前 worker 只有 enqueue + busy/pending flag,无 job 实体)。

## 设计权威锚

- **`app/self.md` ## runtime 编排**:「job:worker 调度的一次任务(kind=`run-thread`/`resume-thread`,状态机 queued→running→done|failed)」
- **`## app`**:控制面是**显式 runtime orchestration**,而非"请求即完成"。建线程、入队 job、轮询、pause-resume、恢复都经 server 的 job 语义串起

## 现状

worker.ts 当前:`enqueueScheduler(sessionId, llm, baseDir, reloadTable?)` — 无 job ID,无队列状态机,只有 worker map + busy/pending flag。

ooc-6 web 用 `fetchJob(jobId)` 查 job 状态,期望:
- `createThread` 返 `jobId`
- 前端轮询 `GET /api/runtime/jobs/<jobId>` 拿状态
- 状态:queued → running → done | failed

## 改动提案

### 1. 引入 job-manager(`app/server/runtime/job-manager.ts`)

```ts
interface Job {
  id: string;
  kind: "run-thread" | "resume-thread";
  sessionId: string;
  status: "queued" | "running" | "done" | "failed";
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
}

class JobManager {
  createJob(kind, sessionId): Job  // 返新 job (status="queued")
  startJob(id): void  // queued → running
  finishJob(id, ok): void  // running → done|failed
  getJob(id): Job | undefined
  listJobs(filter?): Job[]
}
```

- 进程内单例(同 pause-store)
- 与 worker.ts 联动:enqueueScheduler 入口 createJob(returned),runOnce 内 start/finish
- 注:job 是**进程内只读视图**,真实推进力仍在 worker.ts 内的 busy/pending 机制

### 2. endpoint

`GET /api/runtime/jobs/<jobId>`:返 `Job` 形态 或 404

(可选 list jobs `GET /api/runtime/jobs` 留 follow-up)

### 3. enqueueScheduler 返 jobId

```ts
export async function enqueueScheduler(sessionId, llm, baseDir, reloadTable?): Promise<{ jobId: string }>
```

或返 `Job` 对象。caller 解构出 jobId 返给 HTTP response。

### 4. 联动 runtime/threads POST + sessions/continue

- `POST /api/runtime/threads`(已存在)return body 加 `jobId`
- `POST /api/flows/<sid>/continue`(S5)return body 加 `jobId`
- 前端轮询该 jobId 拿状态

### test

`tests/runtime-job-manager.test.ts`

## 落地 commit

1. `feat(server/runtime): job-manager 进程内单例 + Job 状态机`
2. `feat(server/runtime): 改造 enqueueScheduler 返 jobId + worker runOnce 联动 startJob/finishJob`
3. `feat(server/runtime): GET /api/runtime/jobs/<id> endpoint`
4. `feat(web/chat): 解桩 C3`
5. `test`

## 受影响设计元素

- `## app` 实施细节填齐 job 语义层
- `## runtime`(builtins ## runtime,index.md §E)不动 — job-manager 是 server 层基础设施,不进 runtime builtin

## 风险

- worker.ts busy/pending 模型 vs job-manager 状态机如何不冲突? — 建议 job 是 worker 行为的**只读视图**,worker 内部仍用 busy/pending 推进;job 仅服务 HTTP 控制面观测。
- 进程重启 job 全丢 — 接受(同 worker map)。

## 待裁决点

1. **job 是否需要持久化?** — 不需要(同 pause-store)
2. **job 是否需要 list endpoint?** — 留 follow-up

## review/裁决/验收 见总目录 workflow
