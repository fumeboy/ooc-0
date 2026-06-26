---
title: thread 跨 thread/跨 session 调度接通（say scheduleSession + super wake + callerSessionId 编码）
status: decided
date: 2026-06-26
follows: 2026-06-26-stitch-issue-cd-tail.md
---

# thread 跨 thread/跨 session 调度接通

## 背景 / 动机

issue D verified followup 中 method.say 留 `TODO(thread-say-schedule)`——survey 实测确认是**真坏链路**：

1. **method.say.ts:38** `triggerRuntimeSchedule` 返 `never`：say/reply 在写盘后**直接抛 runtime error**——任何 thread 调 say 都炸。当前 tests 不覆盖 say/reply 派送（reflect-idempotent 只断言磁盘 append 成功、不断言对端调度），所以这条死路径没被守门测试逮到。
2. **talk(target="super") 路径无调度**：method.talk.ts `appendMessageToSuperThread` (:43-66) + `createSuperThread` (:74-121) 都纯 fs 写盘、**完全不调度 super session worker**——super agent 永远不会被唤醒处理消息。issue D 设计承诺「super flow scheduler 经轮询发现 super session 的消息增长 → 调度 super thread thinkloop」，但实际从未触发过 worker。
3. **callerSessionId 没编码到 super thread**：method.reflect.ts:64-71 `findCallerSessionId` 返 undefined、退化扫所有业务 flow——三处 reflect method 的 happy-path 假设「业务 session 通常只有一个 caller」，并发场景会乱。issue D 的「幂等键 = (callerSessionId, callerObjectId)」只是逻辑概念、物理未落盘。

三个 bug 同源——**thread 间的 wake-up 链路**全断了。

## 现状（锚 index.md 对应 `##` 节）

锚点：
- `## thread`（E 区）—— thread builtin 寄居核心
- `## collaborable`（B 区）—— talk/say 协作通道，核心 6「say 写入自己 outbox 并派送到对端 thread 的 inbox」
- `## collaborable × thinkable`（D 区）—— say 派送 + scheduler 唤醒咬合
- `## reflectable`（B 区）—— callerSessionId 是 reflect method 定位 caller 业务 flow 的关键
- `## runtime`（E 区）—— worker / scheduler 调度入口
- `## app`（C 区）—— `enqueueScheduler` 当前由 HTTP 控制面手动触发

涉及文件：
- `packages/@ooc/builtins/agent/children/thread/executable/method.say.ts:32-39`（triggerRuntimeSchedule TODO）
- `packages/@ooc/builtins/agent/executable/method.talk.ts:43-66,74-121,148-187`（super 路径写盘不调度）
- `packages/@ooc/builtins/agent/children/thread/runtime/thread-runtime.ts`（ThreadRuntime 不暴露 wake hook）
- `packages/@ooc/builtins/agent/children/thread/executable/method.reflect.ts:64-71,107-133,209-227,419-429`（findCallerSessionId + 三处扫所有业务 flow）
- `packages/@ooc/builtins/agent/children/thread/types.ts:24-32`（ThreadContext 缺 callerSessionId）
- `packages/@ooc/core/app/server/runtime/worker.ts:23`（enqueueScheduler API）
- `packages/@ooc/core/utils/todo.ts`（TODO sentinel——本 issue 落地后 method.say 不应再有 TODO()）

## 改动提案

### 改动 1：super thread 持久化 callerSessionId

types.ts ThreadContext 加 optional `callerSessionId?: string` 字段：
- 普通 thread（business session 内 peer/fork）= undefined；
- super thread（caller 经 talk(target="super") 触达）= caller 业务 sessionId。

method.talk.ts `createSuperThread` 写盘时把 `callerSessionId: ctx.sessionId` 编进 thread.json data。

caller object data 上的 `superThreadRef` 不变（仍只持 super sessionId/threadId；callerSessionId 寄居在 super thread 自身 data 上反查更好——super reflect method 在 super session 内已有 thread.self，从 self.data.callerSessionId 直读）。

### 改动 2：ThreadRuntime 暴露 `scheduleSession(sessionId)` thin wrapper

ThreadRuntime 加方法（注入 `enqueueScheduler` 闭包，避免 builtins → core/app 反向依赖，参照现有 `onDataEdit` 注入模式）：

```ts
class ThreadRuntime {
  private wakeSession?: (sessionId: string) => void;

  static fromThread(thread, registry, opts: { onDataEdit?, wakeSession? }) {
    runtime.wakeSession = opts.wakeSession;
    ...
  }

  scheduleSession(sessionId: string): void {
    this.wakeSession?.(sessionId);
  }
}
```

`builtins/agent/children/thread/thinkable/thinkloop.ts` 或 worker.ts 构造 ThreadRuntime 时传入 `wakeSession: (sid) => enqueueScheduler(sid, llm, baseDir)` 闭包——具体注入点实施时实测决定。

### 改动 3：method.say.ts 真接通

`triggerRuntimeSchedule` 删除（包括 TODO 抛错）。exec body 内：
- 写完本 thread.data.messages 后，**推断对端 sessionId**：
  - 普通 thread（callerSessionId === undefined）→ 对端 sessionId === this thread.sessionId（同 session 内 peer/fork）。
  - super thread（callerSessionId !== undefined）→ 对端 sessionId === this.callerSessionId。
- 调 `ctx.runtime.scheduleSession?.(对端 sessionId)` 唤醒对端 worker。
- 返 normal message。

`method.reply.ts` 同改造（同源签名）。

### 改动 4：method.talk super 路径补 wake 调度

`appendMessageToSuperThread` 调用完 + `createSuperThread` 完成 + 返回 ref 前——**至少一处**调 `ctx.runtime.scheduleSession?.(SUPER_SESSION_ID)` 唤醒 super worker。

注意 super alias 路径在 caller business session 内执行（写 super flow 内 callee thread inbox 是跨 session 写盘）；wake 也是跨 session wake——`enqueueScheduler("super", ...)` 启动 super 的独立 job lane。

### 改动 5：method.reflect.ts findCallerSessionId 真接通

`findCallerSessionId` 实现化：从 `self.data.callerSessionId`（super thread 自身的 ThreadContext）直读返回。`self` 在 reflect method ctx 内即 super thread 自己。

三处 reflect method（:107-133 / :209-227 / :419-429）的「扫所有业务 flow」逻辑保留作为 fallback——若 callerSessionId 存在直用，缺省退化扫表（保持当前 happy-path 行为不变 + 加快典型路径 + 修并发 bug）。

### 改动 6：测试

新增 `tests/thread-scheduling.test.ts`：
- case 1: peer say → 同 session 对端 thread inbox 写入 + scheduleSession 被调（mock wakeSession 验断言）。
- case 2: super alias talk → super thread.json 写入含 callerSessionId 字段 + scheduleSession("super") 被调。
- case 3: super reflect method 从 self.data.callerSessionId 直读 happy path。

扩 `tests/reflectable-redesign-issue-d.test.ts`：reflect-idempotent 测试段验证 super thread.json 内含 callerSessionId 字段。

### 改动 7（顺手清）：method.say.ts 顶部 import TODO sentinel

`import { TODO } from "@ooc/core/utils/todo.js"` 删除（method.say 不再用）。`core/utils/todo.ts` 文件保留（其它地方可能仍在用——grep 一遍；若全树仅 method.say 用且本 issue 删完则 todo.ts 也可退役、归入 followup）。

## 受影响设计元素

A 区：
- `## OOC Class/Object Model` —— 不动（thread 持有面新增 callerSessionId 字段属 thread builtin 内部数据细化、不动核心契约）。

B 区：
- `## collaborable` —— 核心 6「say 写入 outbox 并派送对端 inbox」首次端到端兑现。
- `## reflectable` —— callerSessionId 真接通后 findCallerSessionId fallback 路径仍保留，单一 source 的物理表达落地。

D 区：
- `## collaborable × thinkable` —— say 派送 + scheduler 唤醒咬合首次真接通。

E 区：
- `## thread` —— ThreadContext.callerSessionId 新字段；ThreadRuntime.scheduleSession 新 method。
- `## runtime` —— ThreadRuntime 注入 wakeSession 闭包路径明示。

未受影响：persistable / readable / executable / visible / observable / app 核心契约（app 仅复用既有 enqueueScheduler、无新 HTTP API）。

## 风险与权衡

1. **enqueueScheduler 当前由 worker.ts 提供、且 module-level singleton**：注入模式（闭包传 ThreadRuntime.fromThread）是干净的；但若 thread builtin 未来想脱离 worker.ts 也能跑（如 storybook tier-A），需要 mock wakeSession 注入。改动 2 的 `scheduleSession?` 设为 optional 是这条妥协的体现。
2. **callerSessionId 字段污染**：ThreadContext 现状字段已多；加 optional `callerSessionId?` 是最小新增、且仅 super thread 用。reviewer 关心是否应该把 super 类 thread 拎独立 subtype——倾向不拎（survey 报告 thread 现在投影 default + super 两 class、subtype 化会触动 readable 协议）。
3. **改动 5 fallback 保留**：旧扫所有业务 flow 路径 keep 是"双轨"——确认 callerSessionId 优先快路径，但 fallback 不被 race 时序破坏（如老 super thread 在升级前没写 callerSessionId）。**迁移注意**：旧 super thread.json（若有）无 callerSessionId 字段——reflect method 退化扫表，正常工作。
4. **改动 6 scheduleSession mock 测试**：需要确保 wakeSession 闭包真的传到 ThreadRuntime——实测决定注入点（thinkloop 构造时？worker 构造时？）。

## 待裁决点

1. **改动 1 callerSessionId 写在哪**：super thread.data（推荐，单点写、reflect 直读）vs caller object data 的 superThreadRef（需 cross-session 读）。**推荐 super thread.data**。
2. **改动 2 wakeSession 注入点**：thinkloop 构造 ThreadRuntime 时（推荐，runtime 拥有 wake 责任最直接）vs worker 构造时。**实测决定，倾向 thinkloop**。
3. **改动 7 core/utils/todo.ts 退役**：grep 全树确认 method.say 是唯一 user 后才能退役；倾向**保留**（残留是 OOC 退潮思维的工程债凭证；仅当其它处确认 0 user 才同步删）。
4. **wake 是否对单 thread 而非 session 粒度**：scheduler.ts 当前已是 session-level（扫 sessionRegistries 内 waiting thread），thread-level wake 无收益、增复杂度。**不做**。

## review 记录

按 design-workflow 步骤 2 轻量 fan-out 3 个 reviewer——collaborable+thread / runtime+executable / 完整性批评官。结论：**方向赞同，3 个核心裁决 + 8 项契约校准**。

### review by collaborable / thread

**关键反馈**：
- **say 写完 transcript 后调度对端 = 核心 6 真兑现**，但 self.md 核心 6 措辞「写入 outbox 并派送对端 inbox」与单 transcript 模型不符——**本 issue 应顺手回流 collaborable self.md + index.md 措辞**到「写入本 thread 共享 transcript（按 entry.author 标 caller/callee），并唤醒对端 thread 所属 session」。
- callerSessionId 写在 super thread.data 合理；**JSDoc 必须显式声明「仅 super thread 用、普通 thread 必须 undefined」+ 加 isSuperThread(t) 辅助**避免误用。
- **自愈机制**：fallback 命中 callerSessionId 后立刻写回 self.data.callerSessionId + reportDataEdit——旧 super thread 首次 reflect 自动升级，免人工迁移。
- scheduleSession **不升格 collaborable 维度契约**——属调度实施，归 `## runtime`/`## thread`；但 `## thread` E 区末尾加一段「跨 thread 唤醒由 ThreadRuntime.scheduleSession 承担」明示。
- reply 同改造——`method.say.ts` 内 `sayMethod` 和 `replyMethod` 一起改；issue 文件清单需澄清（reply 在 say.ts 内、不是独立文件）。
- 测试 case 须**断言对端 thread 真被推进一轮**（不只断言 wakeSession 被调用——那只测了注入装配）。
- **新增隐藏排查**：grep `notifyThreadActivated` 确认 method.end auto-reply 路径是否复用 sayMethod；如复用自动获益、如独立路径需单评估。
- 4 个待裁决点立场：(1) super thread.data ✓；(2) **倾向 worker 构造时注入**（与原 issue 倾向相反）；(3) 保留 todo.ts ✓；(4) 不做 thread 粒度 wake ✓。

### review by runtime / executable

**关键反馈**：
- **wakeSession 注入式**胜过 direct import——避免 builtins→core/app 反向依赖；落点应在 `ThreadRuntime.fromThread` 的 opts，参照既有 `onDataEdit` 注入模式。
- **scheduleSession 必须扩 RuntimeHandle**——ObjectMethod 经 ctx.runtime 是唯一通道。但 self.md 应**文档语义收紧**：「跨 session 调度信号；调用者必须已经写盘 inbox/事件，scheduleSession 仅唤醒已存在的待办，不传载荷」。
- **wakeSession signature 同步 `(sessionId: string) => void`**——enqueueScheduler 是 fire-and-forget 入队，async 误导。
- **session 粒度 wake 充分**（scheduler 已是 session-level；thread-level wake 无收益）。
- **写盘 → wake 顺序**：先写盘后 wake（反过来会有"super 被唤起但 inbox 还没东西"假阳性）；crash 容忍 = scheduler 首轮 tick 扫 inbox 兜底（确认现有 scheduler.ts 行为已满足、本 issue 不补 WAL）。
- **tier-A 控制面 mock**：`wakeSession?` optional、缺席时 `scheduleSession` 静默 no-op + console.warn（不抛错防 storybook tier-A 红）；issue 「受影响实施点」加 `packages/@ooc/storybook/_harness/control-plane.ts` mock 装配点。
- RuntimeHandle 文档 3 处必须成对回流：`core/types/executable.ts` JSDoc / executable self.md / `## runtime` 节。
- **建议**：scheduleSession 当前作为 RuntimeHandle 顶层成员；self.md 可留"未来 `.signals` 子 namespace"分组话头，不必现在分组、但避免后续重构。

### review by completeness critic — Issue G

**关键反馈**：
- **补 `## executable` 受影响元素**（RuntimeHandle interface 扩槽位）。
- **补 `## observable` 受影响元素**（wake 事件应进 activity snapshot 供 e2e harness 诊断「super 是否被唤醒」）。
- **`## pr / super` 标为"间接/兑现条件"**——本 issue 是 super 投影 surface 4 reflect method 调度兑现的最后一公里。
- **改动 1 显式声明** callerSessionId 不进 readable 投影、仅 method-time 内部读。
- **改动 3/4/5 依赖关系标注**：均依赖改动 2 的 scheduleSession 接口 / 改动 1 的 schema。
- **行号错位**：types.ts:24-32 实际是 ProcessEvent 段（不是 ThreadContext）——落地者重定位。
- **title「enqueueThread」非真实符号**——改 scheduleSession（已采纳）。
- **改动 5 fallback 语义需精化**：callerSessionId 存在但目标 session 无 dirty 时——退化扫所有业务 flow？还是直接报无 dirty？
- **改动 2 的 ts 类骨架越界**——蒸馏为契约文字，ts 实施迁 thread self.md。

## 裁决

**采纳全部改动 + 12 项关键裁决**。

### 核心裁决

1. **改动 1 super thread.data 加 `callerSessionId?: string` optional 字段**：
   - JSDoc 显式：「**仅 super thread 用**（sessionId === SUPER_SESSION_ID）；普通 thread 必须 undefined。值 = 创建此 super thread 的 caller object 所在业务 sessionId」。
   - 配套加 `isSuperThread(t: ThreadContext): boolean` 辅助（实现：`t.sessionId === SUPER_SESSION_ID`）。
   - **VERSIONED_FIELDS 不含此字段**——非版本化运行时事实。
   - **不进 readable 投影**——仅 method exec 内部读；readable render 不渲 `<caller_session>` 子节点。
   - method.talk.ts `createSuperThread` 写盘时 `callerSessionId: ctx.sessionId`。

2. **改动 2 ThreadRuntime.scheduleSession + wakeSession 注入**：
   - `ThreadRuntimeOpts` 加 `wakeSession?: (sessionId: string) => void`（**同步签名**）。参照 `onDataEdit` 注入模式。
   - `ThreadRuntime` 加 method `scheduleSession(sessionId: string): void`——内部 `this.wakeSession?.(sessionId)` 转发；wakeSession 未注入时**静默 no-op + console.warn**（"scheduleSession called without wakeSession hook"），不抛错（防 storybook tier-A 红）。
   - **扩 `RuntimeHandle.scheduleSession?(sessionId: string): void`**（optional——ObjectMethod 经 ctx.runtime 调用）；types/executable.ts JSDoc 显式收紧语义：「仅唤醒、不传载荷；调用者必须已写盘对端数据」。
   - **注入点**：**worker.ts 构造 ThreadRuntime 时绑定 `wakeSession: enqueueScheduler` 闭包**（runtime reviewer 立场——worker 是离 enqueueScheduler 最近的层）；具体路径实测决定，若 worker→scheduler→thinkloop→ThreadRuntime 透传过深可回退 thinkloop 注入。

3. **改动 3 method.say/reply 真接通**：
   - 删除 `triggerRuntimeSchedule` 占位（含 `TODO` 抛错）。
   - exec 体内写完本 thread.data.messages 后**推断对端 sessionId**：
     - 普通 thread（`callerSessionId === undefined`）→ 对端 sessionId === `this.thread.sessionId`（同 session 内 peer/fork）。
     - super thread（`callerSessionId !== undefined`）→ 对端 sessionId === `this.callerSessionId`。
   - 调 `ctx.runtime.scheduleSession?.(对端 sessionId)`——唤醒对端 worker。
   - **顺序**：先写盘 + reportDataEdit、再 wake（防 super-唤起但 inbox 空假阳性）。
   - `replyMethod` 同改造（method.say.ts 内同源签名）。

4. **改动 4 method.talk super 路径补 wake**：
   - `appendMessageToSuperThread` 调用后 + 返回 ref 前 → `ctx.runtime.scheduleSession?.(SUPER_SESSION_ID)` 唤醒 super job lane。
   - `createSuperThread` 完成后同样 wake。

5. **改动 5 findCallerSessionId 真接通 + 自愈**：
   - 实现从 `self.data.callerSessionId` 直读返回。
   - **fallback 语义精化**：若 callerSessionId 存在 → **优先用**该 session 找 dirty；**该 session 找不到 dirty 时不再退化扫表**（直接报无 dirty——这是正确行为，避免误命中其它 session）。callerSessionId 缺失（旧 super thread）→ 退化扫所有业务 flow + **自愈**：命中后立刻写回 `self.data.callerSessionId` + `reportDataEdit()`，下次直读。

6. **改动 6 测试**：
   - `tests/thread-scheduling.test.ts`（新）4 case：
     - case 1: peer say → 同 session wakeSession 被调 + **对端 thread 真被推进一轮**断言。
     - case 2: super alias talk → super thread.json 写入含 callerSessionId 字段 + wakeSession("super") 被调。
     - case 3: super reflect method 从 self.data.callerSessionId 直读 happy path。
     - **case 4（新增）**：super thread.replyMethod 触发 → wakeSession(self.data.callerSessionId) 被调（super→业务 session 反向唤醒）。
   - 扩 `tests/reflectable-redesign-issue-d.test.ts`：reflect-idempotent 段加断言 super thread.json 内含 callerSessionId 字段。

7. **配对回流 collaborable 措辞**（顺手清，避免漂移）：
   - `collaborable/self.md` 核心 6 改：「写入本 thread 共享 transcript（按 entry.author 标 caller/callee），并经 `ctx.runtime.scheduleSession(对端 sessionId)` 唤醒对端 thread 所属 session 让其消费」。
   - `index.md` `## collaborable` 节 + `## collaborable × thinkable` 节同步措辞。
   - `## thread` E 区节末尾加「跨 thread 唤醒：写入 transcript 的 method（say/reply/talk-super append）经 ThreadRuntime.scheduleSession(targetSessionId) 通知对端 sessionId 的 worker 重新调度」。
   - `## executable` 节 / executable self.md 加 RuntimeHandle.scheduleSession 槽位描述 + 收紧语义说明。
   - `## runtime` 节加 wakeSession 注入路径明示。

8. **受影响设计元素补**：补 `## executable`（RuntimeHandle 扩 scheduleSession 槽位）、`## observable`（标注 followup：wake 事件可进 activity snapshot——本 issue 不实施、留 followup）；`## pr / super` 标为"间接/兑现条件"。

9. **隐藏波及排查**（落地必做）：grep `notifyThreadActivated` + method.end auto-reply 路径，确认是否复用 sayMethod；若复用自动获益、若独立路径加单 case 覆盖。

10. **行号修正**：types.ts:24-32 重定位（实际不是 ThreadContext 段）；落地者按真实行号操作。

11. **TODO sentinel `core/utils/todo.ts` 保留**——本 issue 删 method.say 用法后 grep 确认其它用户；倾向保留作工程债凭证。

12. **不夹带**：scheduler.ts 不动（session-level 调度已覆盖）；observable trace wake 事件留 followup；nondeterministic fallback 时序优化留 followup。

### 落地步骤（worktree `.worktree/thread-cross-session-scheduling`）

1. core/types/executable.ts：`RuntimeHandle.scheduleSession?` optional 字段 + JSDoc 语义收紧。
2. builtins/agent/children/thread/types.ts：`ThreadContext.callerSessionId?: string` + JSDoc + `isSuperThread` 辅助；VERSIONED_FIELDS 不变。
3. builtins/agent/children/thread/runtime/thread-runtime.ts：`ThreadRuntimeOpts.wakeSession?`、`ThreadRuntime.scheduleSession` method、no-op + warn 兜底。
4. core/app/server/runtime/worker.ts：构造 ThreadRuntime 时绑定 `wakeSession: enqueueScheduler` 闭包（实测落点；如过深回退 thinkloop 内注入）。
5. builtins/agent/children/thread/executable/method.say.ts：删 `triggerRuntimeSchedule` + 删 `TODO` import；sayMethod / replyMethod exec 体内调度对端。
6. builtins/agent/executable/method.talk.ts：`createSuperThread` 写 callerSessionId；super alias 路径补 wake。
7. builtins/agent/children/thread/executable/method.reflect.ts：findCallerSessionId 真实现 + 自愈写回；3 处 reflect method fallback 语义精化。
8. tests/thread-scheduling.test.ts（新）4 case + 扩 reflectable-redesign-issue-d.test.ts。
9. grep `notifyThreadActivated` + method.end auto-reply 排查。
10. 文档回流：collaborable/self.md 核心 6 + executable/self.md RuntimeHandle 段 + index.md 4 节（## collaborable / ## collaborable × thinkable / ## thread / ## executable / ## runtime）。
11. 质量门：tsc + tests 全绿。

## 落地验收

（待 landed 后填）
