---
title: S5 · sessions + user.root.talk_window 模型(seed + addTalk)
status: draft
date: 2026-06-29
follows: 2026-06-29-web-server-reimpl-index.md
priority: P2
---

# S5 · sessions + user.root.talk_window 模型

## 背景

来自总目录 S5 项。涉及桩点 **3 个**:B4(createSessionWithObject)+ B5(addUserTalkWindow)+ C2(continueThread)。

**这是 ooc-6 web 最复杂的模型**:**user 作为被动 object,经 user.root 上的 talk_window 与其他 object 对话**。涉及多个核心维度:collaborable(talk 创建 thread)+ builtins(user)+ executable(talk method)。

## 设计权威锚

实勘 `.ooc-world-meta/.../objects/supervisor/children/collaborable/self.md`(及对应 `## collaborable` index.md):

- collaborable: 「OOC Agent 之间通过对话协作。每个 Agent 持有名为 `talk` 的 Object Method,执行它会创建一个 thread 对象」
- builtins `## user`: 「user 是代表人类用户的**被动 object** — 不跑 thinkloop,是 agent `talk` 的对端。web session 中由人类驱动的 flow object,worker 调度时显式跳过它」

ooc-6 web 假定的 `user.root` + `talk_window` 模型在新设计**未明确**——只说 user 是被动 object、不跑 thinkloop。是否 user 有 `root` 字段含 talk_window 数组,需要 supervisor 裁决。

## 现状问题

ooc-6 web 用 `endpoints.continueThread`(`POST /api/flows/<sid>/continue`)固定走 user.root.talk_window 投递,假定:
1. user object 存在
2. user.root 是一个特殊容器(thread? object?),持有多个 talk_window
3. talk_window 指向 target object 与对应 thread

这套模型在新设计中**部分被 collaborable 通用机制覆盖**(每个 agent 有 talk method,经 ctx.runtime.scheduleSession 唤醒对端;消息派送在 transcript),但 **user 作为被动 object 怎么"主动 talk" 进入 thread** 是个空白:

- 设计权威说 user 不跑 thinkloop → user 没有 talk method 主动调
- 但人类必然要某个入口"开始 talk" → 该入口是 server endpoint 而非 agent method
- ooc-6 解法是 `POST /api/sessions` server seed user object + 派送 initialMessage

## 改动提案

### 子裁决:user.root.talk_window 模型保留 vs 重设计

**Path α(保留)**:维持 ooc-6 user.root + talk_window 模型作 web 控制面专用通道
- user 是被动 object,但 server 端有特殊路径处理 user.root 上的 talk_window 列表
- 实现 `POST /api/sessions` seed + `POST /api/flows/<sid>/talk-windows` add + `POST /api/flows/<sid>/continue` 投递
- 在 user builtin 实现 root + talk_window 字段(纯 data,无 thinkloop 行为)

**Path β(重设计)**:把 user 当普通 agent 但 worker 跳过,server 直接 instantiate `talk(target=...)` method
- 经 server endpoint 直接调 collaborable 通用 talk 路径(注入 user 作为 caller,target 是 target agent)
- 不需要 user.root 特殊容器 — talk method 自然创建 thread
- continue thread 经 say 调用直接 append 到 transcript

**Supervisor 倾向 β** — 符合 OOC 哲学(复用 collaborable 现有机制,不为 user 引入特殊容器名词)。但需 confirm:user builtin 当前**没有 talk 实现**(它是 passive),所以 server 需要直接 instantiate thread + 投 message,而非调 user.talk。

## 改动提案(Path β 假设)

### endpoint

`POST /api/sessions` body `{ sessionId, title?, targetObjectId, initialMessage? }`:
- backend 创建 flow worktree `flows/<sid>/`
- 创建 thread inst:targetObjectId 作为 callee,user 作为 caller(虚拟),initialMessage 作为初始 message
- 写入 thread.transcript
- 经 enqueueScheduler 唤醒 worker

`POST /api/flows/<sid>/talk-windows` body `{ targetObjectId, initialMessage? }`:
- 在已存在 session 上创建额外 thread → target(同 POST /api/sessions 但复用 session)
- 幂等:同 target 已有 thread → 返回既有 threadId
- 用例:user 在同一 web session 中同时跟多个 agent 对话

`POST /api/flows/<sid>/continue` body `{ text; targetWindowId?: string }`:
- 向 active thread append message(from="caller")
- 经 scheduleSession 唤醒 worker
- targetWindowId 指定具体 thread;缺省取最近活跃 thread

### 实现位置

- 新建 `packages/@ooc/core/app/server/modules/sessions/`(POST sessions + POST talk-windows)
- flows module 加 continue endpoint
- 不动 user builtin(保持被动 — 实测看 user builtin 当前形态)

### test

`tests/sessions-seed-talk.test.ts`(完整 e2e:seed session → continue → message 真到达 thread)

## 落地 commit

1. `feat(server/sessions): seed session 创建 thread + 初始 message 派送`
2. `feat(server/flows): add talk-window + continue thread endpoints`
3. `feat(web/sessions+chat): 解桩 B4/B5/C2`
4. `test`

## 受影响设计元素

- `## collaborable` 不变(复用现有机制)
- `## app` server module 列表加 sessions + 完善 flows
- `## user` builtin 不变(被动) — 但需 supervisor 文档明确"user 作 talk caller 时 server 端虚拟它,不进 thinkloop scheduling"
- 触动设计冲突点:**user.root.talk_window 模型 vs 通用 collaborable talk** — review 需明确裁决

## 风险

- ooc-6 web 中 ThreadHeader / chat 面板大量 UI 假定 user.root.talk_window 模型(显示为"我的对话列表")。Path β 实现后,UI 需要把 fetchSessionThreads 返回的 (objectId, threadId) 列表当作"我开的对话"展示 — 概念差不大,但**UI 代码 likely 含 user.root 相关字段访问**,需排查。

## 待裁决点

1. **Path α / β?** Supervisor 推 β,但等用户裁决(涉及 user builtin 设计是否要扩 .root 字段)
2. 是否 server 把 user 当 virtual caller(不在 stones/main 实例化)而仅在 thread 中作 calleeObjectId 引用?

## review/裁决/验收 — **需 collaborable 维度 reviewer + user builtin reviewer + 完整性批评官**

S5 比其他子 issue 更复杂,review 重点是 user 设计是否完整。
