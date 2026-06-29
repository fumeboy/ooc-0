---
title: S4 · flows 基础(list + pause/resume)
status: draft
date: 2026-06-29
follows: 2026-06-29-web-server-reimpl-index.md
priority: P1
---

# S4 · flows 基础

## 背景

来自总目录 S4 项。涉及桩点 **3 个**:B1(fetchFlows),B2(pauseFlowSession),B3(resumeFlowSession)。

## 设计权威锚

- **`app/self.md` ## runtime 编排**:pause 是进程内调度开关;resume 半轮粒度恢复
- **`## persistable`**:flow = session = git worktree 分支(每 session 一份 `flows/<sid>/`)
- **knowledge/server-routes-and-worker.md**:runtime job 语义,pause 期间禁新入队、不打断 inflight LLM

## 改动提案

### endpoint 设计

`GET /api/flows`:list world 下所有 session(扫 flows/ 目录,每条 `{ sessionId, title?, status?, paused?, lastEventAt?, ... }` + 全局 hash)

`POST /api/flows/<sid>/pause`:进程内 pauseStore 标 paused=true;返回 `{ sessionId, paused: true }`

`POST /api/flows/<sid>/resume`:扫 session 内 pause 期间停在 running/waiting 但未推进的 thread → 重新 enqueueScheduler;返回 `{ sessionId, paused: false, resumedThreadIds: string[], jobIds: string[] }`

### 实现位置

- 新建 `packages/@ooc/core/app/server/modules/flows/`
- 新建 `packages/@ooc/core/app/server/runtime/pause-store.ts`(进程内 Set<sessionId>)
- 改 `worker.ts:enqueueScheduler`:入队前检查 pauseStore.has(sid) → 跳过

### 测试

`tests/flows-list-pause-resume.test.ts`

## 落地 commit

1. `feat(server/runtime): pause-store 进程内单例 + worker 入队闸`
2. `feat(server/flows): list + pause/resume endpoints`
3. `feat(web/flows): 解桩 B1/B2/B3`
4. `test`

## 受影响

- `## app` server module 列表加 flows
- `## runtime` 加 pause-store 中间状态(进程内,不落盘)

## 风险

- pause 是进程内状态,server 重启即丢 — 设计权威接受这点(与 worker 进程内 map 同语义)。
- inflight LLM 请求不打断 — 维持 ooc-6 设计承诺。

## review/裁决/验收 见总目录 workflow
