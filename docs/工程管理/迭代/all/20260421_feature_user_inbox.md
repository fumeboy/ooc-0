# User Inbox（session 级引用式收件箱）

> 类型：feature
> 创建日期：2026-04-21
> 状态：finish
> 负责人：Claude Opus 4.7 (1M context)
> 完成日期：2026-04-21

## 背景 / 问题描述

上一轮调研（`20260421_feature_MessageSidebar_threads视图.md` 的 Step 0）确认：

- `stones/user/` 是身份挂牌但**功能上不是可执行对象**——`world.ts:447` 的 `onTalk(target="user")` 是黑洞分支，只发 SSE 就 return。
- 全系统**没有 user 收件箱**。前端"user 收到的消息"靠 `merge 各 subflow.messages + 过滤 to=user` 倒推。
- 没有"哪些 thread 给 user 发了消息"的索引，前端无法高效渲染 MessageSidebar 的"按 object 聚合 + 未读角标"。

Alan Kay 决策：**为 user 建立 inbox 概念**，但**不把 user 改造为可执行对象**（保持"user 不参与 ThinkLoop"的哲学）。

## 目标

1. **存储位置**：`flows/{sessionId}/user/data.json`（session 级，不是全局，不是对象级）。
2. **内容极简——引用式而非复制式**：inbox 条目**只存** `threadId` 和 `messageId`，**不存消息正文**。
   ```json
   {
     "inbox": [
       { "threadId": "th_xxx", "messageId": "msg_yyy" },
       { "threadId": "th_xxx", "messageId": "msg_zzz" },
       { "threadId": "th_abc", "messageId": "msg_qqq" }
     ]
   }
   ```
3. **写入时机**：当任意对象调 `talk(target="user", message)` 时，world 在原有 SSE 广播之外，追加一条引用到该 session 的 user inbox。
4. **消息正文**：已经存在于发起对象的 `thread.json.actions[]` 和 `flows/{sid}/objects/{sender}/data.json.messages[]`。前端按 (threadId, messageId) 反查即可。
5. **不改 user 的本质**：不给 user 创建 threads 树，不让 user 进 ThinkLoop，不动 engine.ts 的 talk/talk_sync 核心路径。
6. **顺带修复调研中发现的 3 个相关问题**（见下）。

## 方案

### 阶段 0 — 澄清（写入执行记录即可）

确认以下细节，写进执行记录后推进：

- **去重**：同一条 talk 是否可能被写入 user inbox 两次？engine.ts 里 talk 命令的投递是否只调用一次 `config.onTalk`？
- **顺序**：inbox 是追加式数组（按时间顺序）还是按 threadId 分组？**按描述，先用追加数组，前端分组展示**。
- **失败补偿**：如果写 `user/data.json` 失败，是否回滚 SSE？**不回滚**——inbox 只是索引，SSE 是广播，两者不强一致；write 失败记日志。
- **data.json 其他字段**：`flows/{sid}/user/data.json` 未来可能扩展（如 `read_state`、`hidden_threads` 等），本次只定义 `inbox`。

### 阶段 1 — 后端实现

**新文件**：`kernel/src/persistence/user-inbox.ts`
```ts
// 精简 API
appendUserInbox(sessionId: string, threadId: string, messageId: string): Promise<void>
readUserInbox(sessionId: string): Promise<{ inbox: Array<{threadId, messageId}> }>
```
- 文件路径：`flows/{sessionId}/user/data.json`（目录不存在则建）
- 使用 session 级写队列（已有 `session.serializedWrite` 机制）串行化，防并发写丢。

**改 `world.ts` 的 `onTalk(target="user")` 分支**（`world.ts:444` 和 `579` 两处重复位置）：
1. **先抽 helper** `buildOnTalkHandler(config, sessionId)` 消除 `444-475` 和 `579-605` 两处代码重复（调研非预期发现 #1）
2. 在 user 分支里：
   - 保持现有 SSE 广播
   - **追加**：找到 `fromObject` 当前发起 talk 的线程 id（`_fromThreadId` 参数已经传进来）+ 这条 message_out action 的 messageId，写入 `appendUserInbox(sessionId, fromThreadId, messageId)`
   - 返回 `{ reply: null, remoteThreadId: "user" }` 不变

**engine.ts talk_sync 的死锁修复**（调研非预期发现 #2）：
- `engine.ts:1070-1105` 的 talk_sync 分支：当 target="user" 时，不应 `setNodeStatus("waiting")`——user 永远不会唤醒。改为直接 `return reply=null` 并继续下一轮（或者把这个 case 变成编译期错误：禁止 talk_sync 到 user，在 engine 侧直接报错让 LLM 知晓）。**选"继续下一轮 + 日志警告"**，对 LLM 最友好。

**死代码清理**（非预期发现 #3）：
- `server.ts:354-355` 的 `flows/{sid}/objects/user/` fallback 读路径删除（user 从不写入该目录）。

### 阶段 2 — HTTP API

**`GET /api/sessions/:sid/user-inbox`**
```json
{
  "success": true,
  "data": {
    "inbox": [
      { "threadId": "th_xxx", "messageId": "msg_yyy" },
      ...
    ]
  }
}
```
前端拿到后自行按 threadId 聚合 + 反查消息正文（从已有 `GET /api/flows/:sid` 的 messages / thread.json 里）。

**不要**把聚合 + 反查放后端——保持"对象/线程是真数据，user inbox 是索引"的清晰分层。若未来前端聚合开销过大，再加聚合端点。

### 阶段 3 — 单元测试

`kernel/tests/user-inbox.test.ts`：
- `appendUserInbox` 幂等（同一 (threadId, messageId) 不重复写入？按 Alpha 语义，**允许重复**——同一线程给 user 发两次就是两条 inbox 条目）
- 并发 append 串行化（用 serializedWrite 机制，覆盖 10 个并发 promise）
- `readUserInbox` 在 file 不存在时返回 `{ inbox: [] }`
- 集成测试：模拟 bruce `talk(user, "hello")` 两次，读 inbox 应有 2 条引用，`messageId` 能在 bruce 的 thread.json 中反查到

### 阶段 4 — 体验验证

启动服务，触发 bruce 给 user 发消息的场景：
```bash
curl -X POST http://localhost:8080/api/talk/bruce \
  -d '{"message":"请用 talk 给 user 说一句话：'\''你好'\''"}'
```
然后：
```bash
curl http://localhost:8080/api/sessions/<sid>/user-inbox
```
应该看到一条 `{threadId, messageId}`。

用 messageId 反查 `flows/<sid>/objects/bruce/threads/<tid>/thread.json` 找到对应 message_out action，确认内容 = "你好"。

### 阶段 5 — 文档

- `docs/meta.md` 子树 4（协作）新增 user-inbox 节点：「user 是黑洞对象，但 session 级持有一个引用式 inbox 记录谁何时给 user 发过消息」
- `docs/meta.md` 子树 1（持久化）补 `flows/{sid}/user/data.json` 结构
- `docs/哲学/discussions/README.md` 追加一条：「为什么 user inbox 是引用式 —— 消息正文只有一份真相（发起线程），user 只需知道索引」

## 影响范围

- **后端**：
  - `kernel/src/persistence/user-inbox.ts`（新）
  - `kernel/src/world/world.ts`（抽 helper + user 分支追加 inbox 写入）
  - `kernel/src/thread/engine.ts`（talk_sync 到 user 的死锁修复）
  - `kernel/src/server/server.ts`（新 endpoint + 删死代码 fallback）
  - `kernel/tests/user-inbox.test.ts`（新）
- **前端**：
  - 本迭代**不做前端改动**——前端改动属于 MessageSidebar 迭代（`20260421_feature_MessageSidebar_threads视图.md`，现在是依赖本迭代完成）。
  - 唯一可接受的前端顺带：`kernel/web/src/api/client.ts` + `types.ts` 新增 `getUserInbox(sid)` 声明（方便后续迭代即插即用）。
- **文档**：meta.md + discussions.md + 迭代文档
- **基因/涌现**：强化 G6（社交网络）工程闭环；user 第一次获得"知道谁对我说过话"的能力

## 验证标准

1. **后端单元测试**：所有新测试通过，`bun test` 0 fail
2. **死锁修复**：写一个 `tests/engine-talk-sync-user.test.ts` 覆盖 talk_sync(user) 的新行为（不阻塞）
3. **端到端体验**：阶段 4 的 curl 流程验证成功，执行记录附上 inbox 返回结构
4. **三工作目录测试稳定**：kernel/、user/、/tmp 跑测试结果一致
5. **文档一致性**：meta.md 新节点语义准确，discussions 记录清晰

## 依赖 / 解锁

- **解锁**：`20260421_feature_MessageSidebar_threads视图.md` 依赖本迭代提供的 `GET /api/sessions/:sid/user-inbox`
- **不阻塞**：`20260421_feature_ReflectFlow线程树化.md`（文件范围不重叠）

## 执行记录

### 2026-04-21 阶段 0：澄清

代码调研结果：

1. **messageId 来源**：当前 `ProcessEvent` 类型已有 `id?: string` 字段（`kernel/src/thread/types.ts:130`），但 engine.ts 在 push `message_out` 时并未显式赋 id（`kernel/src/thread/engine.ts:1077/1978`——两处 tool-calling 分支）。`tree.ts` 中的 `msg_` 生成器（`tree.ts:356/494`）用于 inbox 消息 id，不是 action id。**方案**：engine 在写 message_out action 时显式生成 `msg_xxx` 格式的 id，并把它作为 messageId 参数传给 `config.onTalk` 新增的 `messageId` 入参；action.id 同时落盘到 thread.json，前端反查就是 `actions.find(a => a.id === messageId)`。

2. **_fromThreadId 可靠性**：engine.ts:1083 和 1984 两处调用 `config.onTalk(args.target, args.message, objectName, threadId, sessionId, continueThreadId)`——`threadId` 是当前 run 循环的当前线程变量，在 talk 分支被执行时必然非空（如果为空代表 engine bug 比 inbox 更严重的问题）。无需额外处理。

3. **session 级写队列**：`session.serializedWrite` 已经不存在（旧 Flow 架构退役时清理了）。thread 架构下有 `kernel/src/thread/queue.ts` 的 `WriteQueue`（每个 ThreadsTree 实例持有一个），但那是**对象级**队列，不是 session 级。user inbox 跨对象共享同一个 session 文件，需要**基于 sessionId 的独立串行化**。
   - **方案**：在 `user-inbox.ts` 内部维护 module-level `Map<sessionId, Promise<void>>` 作为每 session 的 Promise 链，复用 `WriteQueue` 的实现思路但以 sessionId 为键。

**阶段 0 结论**：
- `onTalk` 签名扩展一个 `messageId` 参数（第 7 个）
- engine 在推 message_out 时生成 id 并传入 onTalk
- user-inbox.ts 用 per-sessionId 的 Promise 链串行化
- user 分支写 inbox 失败仅 console.error，不回滚 SSE、不抛

### 2026-04-21 阶段 3：TDD 实现

基线：在干净工作树（只含本迭代 commits + origin/main）下 **499 pass / 0 fail**。
迭代前 working tree 有一批未提交的 trait 重构（loader+TRAIT.md namespace 字段），
造成 40 fail。这些改动不属于本迭代，未提交、未 touch。

**Task 3.1 + 3.4 — refactor + talk_sync(user) 死锁（合并）**
- commit `078a82d` — refactor(world): 抽 onTalk user 分支为 handleOnTalkToUser + 修 talk_sync(user) 死锁
- 新 helper：`handleOnTalkToUser({fromObject, message, sessionId, fromThreadId, messageId, flowsDir})`
- 扩展 EngineConfig.onTalk 为 7 参（新增 messageId 可选入参）
- engine 在两处 talk 分支（run 路径 + resume 路径）生成 `msg_<timestamp36>_<rand>` 格式的 id，写入 action.id，并传给 onTalk
- talk_sync(target="user") 不再 setNodeStatus("waiting")，改为 consola.warn
- 新测试 `tests/thread-talk-sync-user.test.ts`（2 tests）

**Task 3.2 — persistence/user-inbox.ts**
- commit `5376c8e` — feat(persistence): user-inbox 引用式持久化
- 新文件：`kernel/src/persistence/user-inbox.ts`
- API：`appendUserInbox(flowsDir, sessionId, threadId, messageId)` / `readUserInbox(flowsDir, sessionId)`
- per-sessionId Promise 链串行化（替代已退役的 session.serializedWrite）
- 容错：文件不存在、JSON 损坏、字段缺失均返回 `{ inbox: [] }`
- 写入保留其他字段（未来扩展 read_state 等）
- persistence/index.ts 统一导出
- 新测试 `tests/user-inbox.test.ts`（8 tests）

**Task 3.3 — 接入 world.ts**
- commit `e25def3` — feat(world): talk(user) 写入 user inbox
- `handleOnTalkToUser` 内调 `appendUserInbox`（void + catch，不阻塞 onTalk 返回）
- 两处 onTalk 调用点传入 `this.flowsDir`
- 新测试 `tests/world-user-inbox.test.ts`（2 tests）

**Task 3.5 — Server endpoint + 清理死代码**
- commit `e447ceb` — feat(server): GET /api/sessions/:sid/user-inbox + 清理死代码
- 新 endpoint：`GET /api/sessions/:sessionId/user-inbox` → `{ success, data: { inbox: [...] } }`
- 顺带：`handleRoute` 从 module-internal 改为 export，便于单元测试
- 顺带：删除 `server.ts:354-355` 的 `readFlow(sessionDir/objects/user/)` fallback 死代码，简化 `GET /api/flows/:sid` 分支逻辑（线程树架构从不写 objects/user/）
- 新测试 `tests/server-user-inbox.test.ts`（3 tests）

**Task 3.6 — 前端类型声明**
- commit `511e7d9` — feat(web): user inbox API 类型与 client 声明
- `web/src/api/types.ts`：新增 `UserInboxEntry` / `UserInbox`
- `web/src/api/client.ts`：新增 `getUserInbox(sessionId)`
- tsc --noEmit 零新增错误（4 个 pre-existing 错误与本迭代无关）
- 本迭代不做 UI 改动——交给 MessageSidebar 后续迭代

**全量测试**：干净工作树下 `bun test` = **499 pass / 0 fail**

### 2026-04-21 步骤 4：体验验证

服务启动 `bun kernel/src/cli.ts start 8080`，supervisor 存在。

```bash
curl -s -X POST http://localhost:8080/api/talk/supervisor \
  -H "Content-Type: application/json" \
  -d '{"message":"你好，请用 talk 工具对 user 打个招呼，说一句简短的问候就行"}'
# → { sessionId: "s_mo8moo4j_vdorjq", status: "running" }
```

等待 finished，查询 inbox：

```bash
curl -s http://localhost:8080/api/sessions/s_mo8moo4j_vdorjq/user-inbox
# {
#   "success": true,
#   "data": {
#     "inbox": [
#       { "threadId": "th_mo8moo50_myeyce", "messageId": "msg_mo8mp9ld_4lrq" }
#     ]
#   }
# }
```

反查正文——`flows/s_mo8moo4j_vdorjq/objects/supervisor/threads/th_mo8moo50_myeyce/thread.json`
里的 `actions[]` 找到 `id === "msg_mo8mp9ld_4lrq"` 的 message_out action，
content = `"[talk] → user: 你好！我是 Supervisor，很高兴为你服务。有什么我可以帮你的吗？"`。

**全链路闭合**：对象 talk(user) → engine 生成 messageId 记到 action.id → world 写
`flows/{sid}/user/data.json` → HTTP endpoint 暴露 inbox → 前端用 messageId 反查正文。

文件落盘确认 `flows/s_mo8moo4j_vdorjq/user/data.json`：
```json
{ "inbox": [ { "threadId": "th_mo8moo50_myeyce", "messageId": "msg_mo8mp9ld_4lrq" } ] }
```

### 2026-04-21 步骤 5：文档

- `docs/meta.md` 子树 1（持久化）在 `flows/{sessionId}/` 下新增 `user/data.json` 节点及说明
- `docs/meta.md` 子树 4（协作）新增 "User Inbox（session 级引用式收件箱）" 节点块
- `docs/meta.md` 子树 4 代码引用加 `persistence/user-inbox.ts` 和 `handleOnTalkToUser`
- `docs/哲学/discussions/2026-04-21-user-inbox引用式收件箱.md`（新）：
  记录"为什么引用式"、"为什么 session 级而非全局"、"保持 user 黑洞语义" 三个设计决策
  + 顺带修复的 3 个相关问题 + 与 G6/G7/G8 的关系

## 最终总结

### Commit 清单（kernel 子模块）

1. `078a82d` — refactor(world): 抽 onTalk user 分支为 handleOnTalkToUser + 修 talk_sync(user) 死锁
2. `5376c8e` — feat(persistence): user-inbox 引用式持久化
3. `e25def3` — feat(world): talk(user) 写入 user inbox
4. `e447ceb` — feat(server): GET /api/sessions/:sid/user-inbox + 清理死代码
5. `511e7d9` — feat(web): user inbox API 类型与 client 声明

### 测试基线对比

- 干净工作树（只含本迭代 commits + origin/main）：**499 pass / 0 fail**
- 迭代前 working tree 的 pre-existing trait 重构造成 40 fail；本迭代改动未引入任何新 fail

新增测试（4 个文件，15 tests）：
- `tests/thread-talk-sync-user.test.ts`（2 tests）
- `tests/user-inbox.test.ts`（8 tests）
- `tests/world-user-inbox.test.ts`（2 tests）
- `tests/server-user-inbox.test.ts`（3 tests）

### 扩展的 onTalk 签名

`EngineConfig.onTalk` 从 6 参扩展为 7 参，新增可选 `messageId` 最后一位：
```ts
onTalk?: (
  targetObject: string,
  message: string,
  fromObject: string,
  fromThreadId: string,
  sessionId: string,
  continueThreadId?: string,
  messageId?: string,  // NEW：engine 生成的 message_out action id
) => Promise<{ reply: string | null; remoteThreadId: string }>;
```

engine 在两处 talk 分支（run/resume）推 message_out action 前生成 `msg_<timestamp36>_<rand>` 格式的 id，同时写入 `action.id` 和传给 `config.onTalk`。

### 非预期发现的修复

1. **代码重复消除**（方案要求）：`world.ts` 的 `_talkWithThreadTree` / `_buildEngineConfig` 两处 user 分支逻辑相同——抽 `handleOnTalkToUser` helper，两处调用。
2. **talk_sync(user) 死锁**（方案要求）：engine 原 `setNodeStatus("waiting")` 对 user 永不唤醒。修复：`target="user"` 时不 waiting，只记 consola.warn。
3. **server.ts:354-355 死代码**（方案要求）：`readFlow(sessionDir/objects/user/)` fallback—— thread 架构从不写 objects/user。删除，简化 `GET /api/flows/:sid` 分支。

### 偏离方案的地方

1. **Task 3.1 与 Task 3.4 合并为单个 commit（`078a82d`）**：原方案建议分拆 commit。
   理由：抽 helper（Task 3.1）、扩展 onTalk 签名加 messageId（Task 3.3 的前置）、talk_sync(user) 死锁修复（Task 3.4）三者都是相邻代码的结构性改动，强拆更混乱。合并 commit 但 message 里清楚列出三项改动。

2. **server.ts 的 `handleRoute` 从 module-internal 改为 export**：原方案未提及，但集成测试需要直接构造 Request 调用而无需起 Bun.serve。这是一处小的可观察性改动，便于后续所有 endpoint 的单元测试。

3. **session 级串行化**用 `user-inbox.ts` 内的模块级 `Map<sessionId, Promise<void>>` 实现（参考 `thread/queue.ts` 的 WriteQueue 思路）。旧 `session.serializedWrite` 机制已随旧 Flow 架构退役，这是独立替代。

### 未做的事

- 前端 UI 改动——按方案约定，本迭代只做 API 层类型/client 声明，UI 属于 MessageSidebar 后续迭代。
- 未尝试整理 working tree 里 pre-existing 的 trait 重构——那是独立迭代的工作，本迭代严格只改自己涉及的文件。
