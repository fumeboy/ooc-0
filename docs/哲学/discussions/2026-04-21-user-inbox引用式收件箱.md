# User Inbox：为什么是引用式收件箱

> 讨论日期：2026-04-21  | 状态：已结论（本日落地为代码）
> 相关基因：G6（社交网络）、G7（.ooc 即物理存在）、G8（消息投递）
> 发起人：Alan Kay
> 相关迭代：`工程管理/迭代/all/20260421_feature_user_inbox.md`

## 问题陈述

在线程树架构上线后，`stones/user/` 是身份挂牌但**不是可执行对象**——`world.ts` 的 `onTalk(target="user")` 是"黑洞"分支，只发 SSE 广播就返回 `{ reply: null }`。这意味着：

1. **全系统没有 user 收件箱**：前端要想知道"user 收到了哪些消息"，得去各个 subflow.messages 里 `filter(m => m.to === "user")` 然后 merge 再按对象分组——O(N) 倒推，随 session 长度线性退化。
2. **没有"谁给 user 发过消息"的索引**：导致 `MessageSidebar` 无法高效渲染"按对象聚合 + 未读角标"。

但我们又想保持一个哲学清爽的决定：**不要把 user 改造成 runnable Object**。user 的思考由屏幕前的人类完成，不参与 ThinkLoop。如果把 user 改成 runnable，就得给它建线程树、建 inbox queue、接上 scheduler——一大堆基础设施只为了记一个"谁曾给 user 说过什么"。

## 关键观点

### 观点 A — 收件箱的本质是索引，不是复制存储

对象 A 调 `talk("user", "hello")`，这条消息的**真数据**已经在：
- A 的 `thread.json.actions[]` 里有一条 `{type: "message_out", id: "msg_xxx", content: "[talk] → user: hello"}`；
- `flows/{sid}/objects/A/data.json.messages[]` 里有一条 `{direction: "out", from: "A", to: "user", ...}`。

如果给 user 的 inbox 里再存一份完整正文——**两份真相**。两份真相总有一天会漂移（A 改了消息但忘了同步 user inbox，或 user inbox 先创建再删）。

更哲学的表达：真数据一份，索引多份。

### 观点 B — 索引只需要最小化的坐标对

凭什么能从 A 的 thread 里找到这条消息？`(threadId, messageId)` 就够了：
- `threadId` 定位 `flows/{sid}/objects/A/threads/{threadId}/thread.json`；
- `messageId` 定位该文件 `actions[]` 里 `a.id === messageId` 的那一条。

于是 user inbox 的条目就是 `{threadId, messageId}`——两个字符串。正文、时间戳、发送方都能反查得到。

### 观点 C — 保持 user 的"黑洞"语义，只加一个薄索引层

**不做什么**：
- 不给 user 建线程树
- 不让 user 进 ThinkLoop
- 不动 engine 的 talk/talk_sync 核心调度
- 不在 inbox 里存消息正文

**做什么**：
- 在 `flows/{sid}/user/data.json` 里维护一个 inbox 数组（首版只有这个字段）
- `world.ts` 的 `handleOnTalkToUser` helper 在 SSE 广播之外 append 一条引用

这样 user 依然是"不参与 ThinkLoop 的身份挂牌"——inbox 只是 session 级的一个副产物索引。

### 观点 D — 存储位置：session 级而非全局、而非对象级

- **全局 inbox**：跨 session 分不清，长期滚动不可控。
- **对象级 user inbox**（存在 `stones/user/data.json`）：跨 session 共享，语义混乱——user 的对话是按 session 切分的。
- **session 级（`flows/{sid}/user/data.json`）**：天然隔离，session 结束后 inbox 和其他数据一起保留；与现有 `flows/{sid}/...` 目录结构一致。

## 设计决策

1. 路径：`flows/{sessionId}/user/data.json`
2. 结构：`{ inbox: [{threadId, messageId}, ...] }`（首版只这一个字段，未来可扩展 `read_state`、`hidden_threads` 等）
3. 写入时机：`world.handleOnTalkToUser` 里同步 SSE 广播后追加一条（异步，不阻塞调用方）
4. 写入失败处理：`console.error`，不回滚 SSE，不抛——inbox 只是索引
5. 追加语义：**允许重复**——同一 `(threadId, messageId)` 也 append；简化 LLM 侧发消息的心智模型
6. 读取容错：文件不存在、JSON 损坏、inbox 字段缺失均返回 `{ inbox: [] }`
7. 串行化：per-sessionId 的 Promise 链（旧 `session.serializedWrite` 已退役）

## 顺带修复的三个相关问题

### 修复 1 — `onTalk` 的两处代码重复

`world.ts` 的 `_talkWithThreadTree`（线）和 `_buildEngineConfig`（resume/step）各有一份几乎完全一样的 `user` 分支。抽成 `handleOnTalkToUser` helper，两处调用。

### 修复 2 — `talk_sync(target="user")` 死锁

原 engine 无条件对 `talk_sync` 做 `setNodeStatus("waiting")`，等待对方回复。user 永远不会回复，线程就永久 waiting 直到触发全局迭代上限或死锁检测。

修复：`target="user"` 时不 waiting，只记 `consola.warn`，线程继续。语义上降级为 talk（不阻塞）。

### 修复 3 — `server.ts:354-355` 死代码

`GET /api/flows/:sid` 的 `readFlow(sessionDir/objects/user/)` fallback——线程树架构从不写 `objects/user/`，此路径永远返回 null。删除，简化 endpoint 逻辑。

## 后续观察项

- MessageSidebar 迭代是否能凭 inbox 索引高效渲染（O(inbox.length) 而非 O(总消息数)）？
- 未来若 user 需要标记已读 / 隐藏某些 thread，在 `user/data.json` 加 `read_state: Map<messageId, "read">` 等字段即可——引用式设计天然可扩展。
- inbox 条目的规模：单 session 预计 < 100 条；若某天接近 1000，考虑分页或按 thread 分组持久化。

## 与基因的关系

- **G6（社交网络）**：第一次在工程层面实现了"知道谁对我说过话"——user 作为一等公民获得身份感。
- **G7（.ooc 即物理存在）**：`flows/{sid}/user/data.json` 是"人类在这个 session 里的数字痕迹"的物理存在形式。
- **G8（消息投递）**：SSE 是瞬时广播，inbox 是持久索引——两者互补。消息既"到达"又"被记住"。
