---
title: S5 · sessions + user.root.thread 模型(user 持 root thread,不参与调度)
status: landed
date: 2026-06-29
follows: 2026-06-29-web-server-reimpl-index.md
priority: P2
---

# S5 · sessions + user.root thread 模型

## 用户裁决(2026-06-29)

> "新建 session 时,给 user 创建一个名为 root 的 thread, 这个 thread 和普通的 thread 一样的结构, 只是 **不参与 thread 调度**"

这是一个**极优雅的设计**——零新概念,完全复用 collaborable 现有 thread 模型:
- user 仍是被动 object(不跑 thinkloop)
- user.root 是一条 **特殊 thread**(等同普通 thread 的 ThreadContext shape)— 但 scheduler 跳过它
- user.root.contextWindows 含子 thread refs(指向 user talk 的各 target agent thread)
- user 经 server endpoint **写入** user.root.transcript(append message,from="caller"), 然后经 scheduleSession 唤醒对端 worker
- 没有"user.root.talk_window 容器"这种新名词——root 本身就是 thread,thread.contextWindows 就是连接其他 thread 的引用

这套设计在新 OOC 范式下:
- `## thread`: ThreadContext 单一形态承载所有 thread,包括 user.root(数据 shape 同 普通 thread)
- `## collaborable`: 通过 transcript + scheduleSession 协作,user.root 即一条 caller-only 的 thread
- worker.ts scheduler: 加一个跳过规则 `inst.id === "user.root"` 或更通用 `data.skip_scheduling === true`(本 issue 选后者,通用性强)

## 背景

来自总目录 S5 项。涉及桩点 **3 个**:B4(createSessionWithObject)+ B5(addUserTalkWindow)+ C2(continueThread)。

## 改动提案

### 1. user builtin 加 root thread 概念

- `_builtin/user` 当前是被动 object。本 issue 给 user.data 加 `rootThreadId: string` 字段(指向 user.root)
- session 创建时 backend 自动:
  1. instantiate user object instance(若不存在)
  2. instantiate 一条 thread (`calleeObjectId="_builtin/user"`,`isUserRoot=true`/`skipScheduling=true`),写 user.data.rootThreadId = newThread.id
  3. user.root 即此 thread

### 2. ThreadContext 加 `skip_scheduling?: boolean` 字段

```ts
// builtins/agent/children/thread/types.ts (Data + ThreadContext)
export interface ThreadContext {
  // ... 现有字段
  /**
   * 退出 scheduler 调度的 thread (issue S5, 2026-06-29 落地)。
   * 典型用例: user.root 是被动入口, 持 transcript 但永不"思考"。
   * scheduler.runScheduler 扫 session 内 thread 时跳过此类。
   */
  skip_scheduling?: boolean;
}
```

scheduler.ts(`runScheduler`)入口:
```ts
iterateSessionObjectTable(sessionId, (inst) => {
  if (inst.class !== THREAD_CLASS_ID) return;
  const t = inst.data as ThreadContext;
  if (t.skip_scheduling) return;  // ← 加这行
  if (t.status !== "running" && t.status !== "waiting") return;
  threads.push(t);
});
```

### 3. endpoint 设计

`POST /api/sessions` body `{ sessionId, title?, targetObjectId, initialMessage? }`:
- backend 创建 flow worktree `flows/<sid>/`
- 创建 user instance(若不存在):`_builtin/user`,`data.rootThreadId` 待填
- 创建 **user.root thread**:calleeObjectId="_builtin/user",skip_scheduling=true。回填 user.data.rootThreadId
- 创建 target agent thread:calleeObjectId=targetObjectId
- 把 target thread 作为 ref push 进 user.root.contextWindows
- 把 initialMessage 写入 target thread.transcript(from="caller")
- 经 enqueueScheduler 唤醒 worker 推 target thread
- response: `{ sessionId, userRootThreadId, targetThreadId, jobId }`

`POST /api/flows/<sid>/talk-windows` body `{ targetObjectId, initialMessage? }`:
- 已存在 session: instantiate 新 target thread + push ref to user.root.contextWindows
- 同 target 已有 ref → 幂等
- response: `{ talkWindowId(=targetThreadId), targetThreadId, jobId?, created }`

`POST /api/flows/<sid>/continue` body `{ text, targetWindowId?: string }`:
- 解析 targetWindowId 为 target thread id(缺省取 user.root.contextWindows 中最近活跃)
- append message 到 target thread.transcript(from="caller")
- 经 scheduleSession 唤醒 worker
- response: `{ jobId, targetObjectId, targetThreadId }`

### 4. 实现位置

- 新建 `packages/@ooc/core/app/server/modules/sessions/`
- `flows` module 加 talk-windows + continue endpoints
- `packages/@ooc/builtins/user/types.ts` 加 `rootThreadId?: string`
- `packages/@ooc/builtins/agent/children/thread/types.ts` 加 `skip_scheduling?: boolean`
- `packages/@ooc/builtins/agent/children/thread/thinkable/scheduler.ts` 加 skip 判断

### 5. test

`tests/sessions-user-root-thread.test.ts`(完整 e2e):
- POST /api/sessions 后 user.root thread 出现 + skip_scheduling=true
- worker 推 target thread 但**不**推 user.root
- POST /api/flows/<sid>/continue 写入 target thread.transcript + 唤醒 target

## 落地 commit

1. `feat(thread): ThreadContext 加 skip_scheduling 字段 + scheduler 跳过`
2. `feat(builtins/user): user.data 加 rootThreadId 字段`
3. `feat(server/sessions): POST /api/sessions 创 user + user.root + target thread`
4. `feat(server/flows): talk-windows + continue endpoints`
5. `feat(web/sessions+chat): 解桩 B4/B5/C2`
6. `test: sessions-user-root-thread.test.ts e2e`
7. `docs: builtins/user + thread self.md 同步 skip_scheduling + rootThreadId`

## 受影响设计元素

- `## thread`(index.md §E): 加 skip_scheduling 字段(运行时态,非 versioned)
- `## user`(index.md §C builtins / builtins.md): user 持 rootThreadId 字段
- `## collaborable`: 通过 user.root 暴露 user 主动入口(经 server endpoint 而非 talk method)
- `## app`: server 加 sessions module + flows module 扩展

## 风险

- **风险 1**: user.root 的 contextWindows 持 target thread ref → target thread 经 refcount 计入 → user.root 永不 unactive → target thread 永生(unless 显式 close talk window)
  - **缓解**: 这是设计意图——人类对话历史长期保留,经 talk-window remove UI 显式终结
- **风险 2**: skip_scheduling=true thread 在 issue I(thread readable 三视角)中如何投影? — user.root 是 self-view(对 user 视角) + caller-view(对 target visible)
  - **缓解**: 沿用现有 thread readable 三视角(default/self/super), user.root 在 web UI 上不被作为常规 thread 渲染(它是 transcript 容器,不被 thinkloop 跑)

## review 记录(用户裁决)

用户 (2026-06-29 11:47): "新建 session 时, 给 user 创建一个名为 root 的 thread, 这个 thread 和普通的 thread 一样的结构, 只是不参与 thread 调度"

零新名词、零新机制——complete reuse of existing thread/collaborable 设计。

## 裁决

**user.root = thread(skip_scheduling=true)** 模型确认采用。落地 commit 切分按上述。涉及 source 改动,在 worktree 隔离开发(`.worktree/s5-user-root-thread`)。

## 落地验收

(landed 后:
1. ThreadContext.skip_scheduling 字段在 types.ts 落地 + scheduler 跳过
2. user builtin 含 rootThreadId
3. POST /api/sessions 真创建 user.root thread + target thread + initial message 真到达
4. POST /api/flows/<sid>/continue 真 append + 唤醒 target worker
5. web B4/B5/C2 桩点解除
6. e2e test 通过 + storybook dashboard 加 6+ case
7. builtins/user/self.md + thread/self.md 同步)
