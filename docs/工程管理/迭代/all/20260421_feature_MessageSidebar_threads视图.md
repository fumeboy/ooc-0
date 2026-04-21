# MessageSidebar 扩展：默认开 supervisor thread + threads 列表视图

> 类型：feature
> 创建日期：2026-04-21
> 状态：finish
> 负责人：Claude Opus 4.7 (1M context)
> 完成日期：2026-04-21

## 背景 / 问题描述

当前 `kernel/web/src/features/MessageSidebar.tsx` 是 App 级右侧消息面板，默认展示 supervisor 的 thread process。但它有几个局限：

1. **User 有多个 threads**：user（系统人类用户）既可以主动 `talk` 给不同对象（创建 user 为 creator 的 threads），也会被其他对象 `talk` 过来（创建的是对方对象的 thread，但 user 是参与者 / 目标）。当前 MessageSidebar 只看到 supervisor 一个线程，其他线程里发生的事 user 看不到。
2. **无新消息提示**：其他对象给 user 发消息时，没有任何全局提示。
3. **没有全局 threads 总览**：user 想切换到另一个 thread 查看要走多步（进文件树 / 进 Kanban）。

需求：把 MessageSidebar 从"单对话窗"升级为"user 的多线程消息中心"。

## 目标（用户描述原文）

1. **默认行为变更**：
   - MessageSidebar 的对话窗**默认与 supervisor 对话**，并**新建 supervisor 的 thread**（不再只看既有的 supervisor thread process）。
2. **Body 展示**：
   - Body 用于展示**当前查看的 thread** 的内容（thread process）。
3. **Header 增加 threads 按钮**：
   - 按钮支持**红色 dot 角标**：当其他 thread（非当前查看的）有新消息未读时显示。
4. **点击 threads 按钮切换视图**：
   - Body 从 thread process 切换到 **threads list 界面**。
5. **threads list 界面**：分两栏——
   - **栏 1**：user **通过 talk 主动创建**的 threads。每项展示 `thread title + status`。
   - **栏 2**：**其他对象 talk 给 user** 而产生（user 作为接收方）的 threads。
     - 第二栏**像聊天 app**：除了标题，还展示**一行 message 缩略**，显示"user 收到了什么消息"。
     - **按 object 聚合**：同一个 object talk user 两次就聚合展示在一起（类似微信会话列表——同一联系人多条消息合并为一个会话入口）。

## 方案

### 关键概念澄清（进实现前必须确认）

1. **什么是"user 的 thread"？**
   - 后端目前的线程归属：每个线程存在**某个对象**（如 supervisor / bruce / iris）的目录下（`flows/{sid}/objects/{name}/threads/`）。
   - 线程的 `creatorThreadId` / 外部发起者信息决定了"谁创建了它"。
   - "user 主动 talk supervisor 产生的 thread" = supervisor 目录下的线程，creator = user。
   - "其他对象 talk user" —— user 本身在后端并不是一个可以拥有 threads 的 "object"（user 是系统人类用户的抽象）。**调研 Step 0**：
     - 查 `kernel/src/world/world.ts` 里 `talk(from, to, msg)` 当 `to = "user"` 时怎么处理？
     - 线程结构上"user 收到消息" = 某个对象线程的 `inbox` 中有 `from = <对方对象>, to_user: true` 的消息？还是在 session 级别的 `inbox` 上？
     - **必须先搞清楚数据模型再设计 UI**，否则"第二栏展示其他对象 talk user 的 threads"会悬空。
2. **supervisor "默认新建 thread" 的语义**：
   - 每次打开 MessageSidebar 是否新建？还是每次 session 启动时新建一条保留为活跃？
   - 建议：**每个 session 的 MessageSidebar 打开时，若该 session 下 user → supervisor 没有活跃根线程，则新建一条；否则复用**。避免冗余线程。

### 后端设计（取决于 Step 0 调研）

**假设 A（最可能）**：user 作为 "系统用户" 在每个 session 有对应 identity，可以被 `talk(from=X, to=user, msg)` 投递到一个聚合 inbox 或触发"其他对象的 thread 里产生一条 user 是目标的消息"。
- 需要后端提供 API：
  - `GET /api/session/:sid/user-threads` 返回两组 threads：
    ```
    {
      "created_by_user": [{ threadId, object, title, status, creatorThreadId }, ...],
      "talk_to_user": [
        {
          object: "bruce",
          threads: [
            {
              threadId,
              title,
              status,
              lastMessage: { content, timestamp, from },
              unread: true/false
            },
            ...
          ]
        },
        ...
      ]
    }
    ```
  - SSE 事件：`user_inbox:update` 或复用现有 flow 事件——让前端知道"有新消息到 user"。

**假设 B（退化路径）**：如果后端目前没有清晰的"talk to user"模型——这个迭代的**第一阶段**变成"先在后端建立 user 作为消息目标的抽象"。这可能把迭代变大。若调研发现如此，**拆为两个迭代**：
1. 迭代 X：后端 user 消息通道设计
2. 本迭代：前端 UI（基于迭代 X 输出）

### 前端设计

`MessageSidebar.tsx` 拆分或增设模式：

**1. Header 扩展**
- 原有标题旁边新增 threads 按钮（icon: `List` 或 `MessageSquare` from lucide-react）。
- 按钮右上角红色 dot：当 `created_by_user` 或 `talk_to_user` 的任意非当前线程有 `unread > 0` 时显示。
- 点击切换 body view mode。

**2. Body 双模式**
- `mode = "process"`：当前 thread 的完整 process 视图（复用现有 TuiAction/TuiTalk 渲染）。
- `mode = "threads"`：threads list 界面，两栏：
  - **左栏标题**："我发起的"（`created_by_user`）
    - 列表项：`[头像(object)] [thread.title] [status 圆点]`
    - 点击项 → 回到 process 模式，body 展示该 thread
  - **右栏标题**："收到的"（`talk_to_user`）
    - 按 object 分组：`[对象头像] [对象名] [未读角标] [最后消息缩略] [时间]`
    - 点击分组 → 展开该 object 下的 thread 列表（每条含缩略），点某条 thread → 回到 process 模式
    - 风格类似微信/iMessage 会话列表

**3. 新建 supervisor thread**
- MessageSidebar 初次 mount 时：检测当前 session 下 user → supervisor 是否有活跃根线程；无则发起 `talk("user", "supervisor", "")` 或通过专用 API 创建一条空根线程。
- 发送首条消息时即为该线程的首轮输入。
- 该 thread 作为 Body 默认显示对象。

**4. 状态管理**
- `messageSidebarModeAtom` 现有，扩展取值（或新增 `messageSidebarViewAtom`）：`"process" | "threads"`。
- `currentThreadIdAtom`：当前 Body 展示的 thread id。
- `userThreadsAtom`：拉取的两栏数据，SSE 驱动更新。

**5. Unread / 红点计算**
- 每条 thread 维护 `unread` 状态（按 inbox 里 `status = "unread"` 的消息数）。
- Header 红点：`unread > 0 的 thread 数 > 0 且不是当前 Body 展示的 thread`。
- 切换到某 thread 时，后端/前端需要主动 mark 该 thread 的 unread 消息为 "ack" 或 "ignore"。

### 小范围实现顺序（建议）

1. **Step 0：调研**（最重要）——回答"user 作为消息目标的后端数据模型"。选假设 A 或 B。
2. **Step 1**：后端 API `/user-threads`（若假设 B，还要先建 user inbox 模型）。
3. **Step 2**：默认新建 supervisor thread 的逻辑（前端或后端负责？建议前端 auto-detect + 后端保证幂等 API）。
4. **Step 3**：前端 Header 按钮 + 红点角标（数据来自 `/user-threads`）。
5. **Step 4**：Body 双模式切换 + threads list 左右双栏。
6. **Step 5**：聊天 app 风格的 object 聚合 + 消息缩略。
7. **Step 6**：mark unread 机制打通（切到某 thread → 消除红点）。
8. **Step 7**：SSE 实时更新。

## 影响范围

- **后端**（待 Step 0 调研确认）：
  - `kernel/src/server/server.ts` — 新 API `/api/session/:sid/user-threads`
  - 可能 `kernel/src/world/world.ts` / `kernel/src/thread/*` — user 消息通道（假设 B 时）
  - 单元测试
- **前端**：
  - `kernel/web/src/features/MessageSidebar.tsx` — 大幅重构（Header/Body 双模式）
  - `kernel/web/src/store/session.ts` — 新 atoms
  - `kernel/web/src/api/client.ts` — `getUserThreads`
  - `kernel/web/src/api/types.ts` — 新类型
  - 可能新组件：`ThreadsListView.tsx`、`UserThreadItem.tsx`、`ObjectConversationGroup.tsx`（按粒度决定是否拆）
- **文档**：
  - `docs/meta.md` 子树 6（MessageSidebar 节点）更新——从"固定 supervisor 对话"改为"多线程消息中心"
  - 如涉及后端 user 消息模型，子树 4（协作）也要更新
- **基因/涌现**：
  - 强化 G6（社交网络）与 G8（消息）在 UI 层的表达：user 第一次拥有"同时看所有对我说的话"的视图。

## 验证标准

1. **Step 0 调研结论写入执行记录**，选定假设 A 或 B 或拆成两个迭代。
2. **后端单元/集成测试**：`/user-threads` 返回的两栏结构正确；聚合按 object 正确合并。
3. **前端体验验证**：
   - 启动服务，打开前端 → MessageSidebar 默认显示与 supervisor 的新 thread，Body 为空/等待输入。
   - 发送 `@bruce` 让 bruce 反向 talk user（可能需要手动触发 bruce 回调 user）→ Header 红点出现。
   - 点击 Header threads 按钮 → Body 切换到 list 视图，两栏正确显示。
   - 右栏看到 bruce 的消息缩略；点击展开 → 看到完整 thread process。
   - 同一 bruce 两次 talk user → 右栏聚合为一条。
4. **视觉验证**：两张截图（process 模式 / threads list 模式），贴入执行记录。

## 依赖 / 协调

- **强依赖：`20260421_feature_user_inbox.md`**（后端 user inbox 层）。该迭代提供 `GET /api/sessions/:sid/user-inbox` 返回 `[{threadId, messageId}]`，本迭代前端基于此拉取 + 按对象聚合 + 反查消息正文。在 user_inbox 未完成前，本迭代无法真正开始实现。
- **旧 Flow 架构退役已完成**，不再是阻塞项。
- **不与"Thread 上下文可视化"迭代冲突**（文件范围几乎正交）。

## 执行记录

### 2026-04-21 认领

- 前置 `20260421_feature_user_inbox.md` 已完成，提供 `GET /api/sessions/:sid/user-inbox` 端点以及前端 `getUserInbox(sid)` / `UserInboxEntry` / `UserInbox` 类型
- `20260421_feature_trait_namespace_views.md` 并行 agent 正在 Phase 1（后端 trait loader）——本迭代完全不碰 ViewRegistry / trait，理论无冲突

### 2026-04-21 调研

**前端现状**（`kernel/web/src/features/MessageSidebar.tsx`）：
- Header：target avatar + name + sessionId + 上下导航按钮；右侧 pause toggle + sidebar/main 模式切换
- Body：一个 `timeline`（messages + supervisor actions 合并排序），用 `TuiUserMessage / TuiTalk / TuiAction` 渲染
- Input：@mention 对象选择 + 发送
- target state 是本地（非 atom），默认 `"supervisor"`

**"user 主动创建的 threads"数据源**：
- `GET /api/flows/:sid` 返回 `{ flow, subFlows }`，每个 subFlow 有 `stoneName + status + process`
- `process.root` 的 `title / status / id` = 这个对象的根线程；根据 `context-builder.ts:231` 注释，**所有 process.root 都是 user 作为 creator 创建的**
- 所以遍历 subFlows 取每个 root 节点即可得"user 主动创建的 threads"

**"其他对象 talk user"数据源**：
- `GET /api/sessions/:sid/user-inbox` 返回 `{ inbox: [{ threadId, messageId }] }`
- 按 threadId 去 subFlows 找：遍历 subFlows → walk process 树 → 找 node.id === threadId → 取 node.title/status/object
- 反查消息正文：walk node.actions → find a.id === messageId → 取 content（message_out 的 content 带 `[talk] → user: xxx` 前缀，前端可 strip 展示）

### 2026-04-21 设计决策

1. **Body 双模式 state 放 atom**（`messageSidebarViewAtom: "process" | "threads"`），因为未来可能有别的入口切换视图
2. **currentThreadId 放 atom**（`currentThreadIdAtom: string | null`），业务其他地方（比如 ViewRegistry 的 thread-context-view）未来可能读同一 thread
3. **创建 supervisor thread 时机 — 懒创建**：MessageSidebar mount 时不主动创建空 thread；若当前 session 下 supervisor 已有根线程，自动选为 currentThreadId；若没有则 currentThreadId=null 显示空状态提示"向 supervisor 发起对话"；用户首次发送消息时 `talkTo("supervisor", msg)`——后端会自动建根线程；SSE 刷新后把新根线程的 id 设为 currentThreadId。避免空 thread 污染。
4. **未读判定——前端 localStorage 临时实现**：
   - key: `ooc:user-inbox:last-read:{sid}`，value: `string[]`（已读 messageId 列表）
   - 未读 = `inbox.filter(e => !lastRead.includes(e.messageId))`
   - 切到某 thread 时把该 thread 上所有 inbox 条目 messageId 写入 localStorage
5. **右栏对象聚合 UI**：
   - 一行 = 一个对象卡片：`[头像] [对象名] [最新一条 talk 缩略]   [未读 badge] [相对时间]`
   - 点击 → 展开该对象下所有 thread 列表（thread title + status + 每个 thread 最后一条 talk）
   - 点某条 thread → set currentThreadId + 切回 process 视图
6. **Body 过滤逻辑**：
   - currentThreadId != null 时：walk subFlows → 找 node.id === currentThreadId → 只渲染该节点的 actions（过滤 message_in/out/thread_return，与现有一致）
   - 对象归属：从找到该 node 时知道的 stoneName 记下来（后续作 avatar / TuiAction 的 objectName 参数）

### 2026-04-21 Task 4.1 — Header threads 按钮 + view mode atom

- atom `messageSidebarViewAtom: "process" | "threads"` 加入 `store/session.ts`（默认 `"process"`）
- atom `currentThreadIdAtom: string | null` 加入 `store/session.ts`（默认 `null`）
- Header 加 `MessageSquare` icon 按钮（点击切换 view mode）
- 本次未接 unread 红点（Task 4.4 做）
- commit `c1a17da` — `feat(web/MessageSidebar): Header threads 按钮 + view/currentThread atom`

### 2026-04-21 Task 4.2 — useUserThreads hook

- 新 hook `useUserThreads()`（`web/src/hooks/useUserThreads.ts`）
- 输入：activeFlow.subFlows + `GET /api/sessions/:sid/user-inbox`
- 输出：`{ created_by_user, talk_to_user, allUnreadMessageIds, rawInbox }`
- SSE 触发 debounced(300ms) 重拉 inbox
- 导出 `markMessagesRead(sid, ids)` / `findThreadInAllSubFlows(subFlows, tid)` 工具
- localStorage key: `ooc:user-inbox:last-read:{sid}` 存已读 messageId 数组
- commit `f8cc554` — `feat(web/MessageSidebar): useUserThreads 聚合 user 线程 hook`

### 2026-04-21 Task 4.3 — threads list 双栏视图组件

- 新组件 `MessageSidebarThreadsList.tsx`
- 左栏：user 主动创建的线程列表（每个 subflow root → title + status 圆点 + 目标对象）
- 右栏：按对象聚合的会话卡片（iMessage 风格）
  - 卡片：对象头像 + 名 + 最新消息缩略 + 未读 badge + 相对时间
  - 点击卡片展开该对象下所有 thread
  - 点击任一 thread → markMessagesRead + set currentThreadId + 切回 process view
- commit `dbdfb07` — `feat(web): MessageSidebarThreadsList 双栏视图`

### 2026-04-21 Task 4.4 — unread dot + Body 切换接入

- MessageSidebar Body 根据 `sidebarView` 切换：
  - `"threads"` → `<MessageSidebarThreadsList />`
  - `"process"` → 原有消息时间线 + input（保留 mention/pause 等所有功能）
- Header 红 dot 接入真实数据：
  `unreadTotal = rawInbox.filter(e => e.threadId !== currentThreadId && allUnread.includes(e.messageId)).length`
- commit `5e737eb` — `feat(web/MessageSidebar): unread dot 角标 + 接入 threads 视图`

### 2026-04-21 Task 4.5 — 默认 supervisor thread + 自动选 root

- effect 1: `activeId` 变化时 reset `currentThreadId = null`
- effect 2: `currentThreadId == null` 且 supervisor subFlow 存在 → 把 `supervisor.process.root.id` 设进 atom
- 懒创建：首次发送消息时 `talkTo("supervisor", msg)`，后端建 root；SSE 刷新后 effect 2 自动 select 新 root
- commit `c0b6e86` — `feat(web/MessageSidebar): 默认与 supervisor 对话 + 自动选 root thread`

### 2026-04-21 Task 4.6 — Body 按 currentThreadId 过滤 process

- `findThreadInAllSubFlows(subFlows, currentThreadId)` 跨所有对象查找节点
- `currentObjectName = found.subFlow.stoneName`，TuiAction/TuiStreamingBlock 的 `objectName` 从硬编码 "supervisor" 改为动态值
- timeline 只取当前节点自身的 actions + 跟该对象相关的 messages（从 activeFlow.messages 过滤）
- 切 thread 时自动 markMessagesRead 把该 thread 全部 inbox messageId 标为已读
- 空状态文案：`currentThreadId=null → "向 X 发起对话"`；线程无内容 → `"此线程暂无内容"`
- commit `2a30239` — `feat(web/MessageSidebar): Body 按 currentThreadId 过滤 process`

### 2026-04-21 步骤 5：类型检查

`cd kernel/web && bun run tsc --noEmit`：
- 4 个 pre-existing 错误（App.tsx OocLogo / tabs 未使用、OocLogo.tsx 参数、FileDiffViewer 缺 @codemirror/merge 类型）
- **本迭代引入 0 个新 TS 错误**（与 user_inbox 迭代记录的 4 个一致）

### 2026-04-21 步骤 6：体验验证

后端启动：`NO_PROXY='*' bun kernel/src/cli.ts start 8080`（user 仓 cwd）。

```bash
curl -X POST http://localhost:8080/api/talk/supervisor \
  -d '{"message":"请用 talk 给 user 发一条问候消息，说一句简短的话就可以"}'
# → sessionId=s_mo8ndbyv_ak0v6h, status=running
```

等待 finished 后查询：

```bash
curl http://localhost:8080/api/sessions/s_mo8ndbyv_ak0v6h/user-inbox
# { inbox: [ { threadId: "th_mo8ndbzc_0rpu5m", messageId: "msg_mo8ndrlp_e0oi" } ] }
```

再让 supervisor 发一次（同 session）：

```bash
curl -X POST http://localhost:8080/api/talk/supervisor \
  -d '{"message":"请再给 user 发一条不同的消息","flowId":"s_mo8ndbyv_ak0v6h"}'
```

inbox 累积：

```bash
curl http://localhost:8080/api/sessions/s_mo8ndbyv_ak0v6h/user-inbox
# { inbox: [
#   { threadId: "th_mo8ndbzc_0rpu5m", messageId: "msg_mo8ndrlp_e0oi" },
#   { threadId: "th_mo8ndbzc_0rpu5m", messageId: "msg_mo8nehcx_gfn9" }
# ] }
```

subFlows 结构：

```
subFlows count: 1
  supervisor status=finished rootId=th_mo8ndbzc_0rpu5m title='supervisor 主线程'
```

→ 前端期望：
- 左栏（我发起的）：1 条 "supervisor 主线程" status=done
- 右栏（收到的）：1 张 supervisor 卡片，unread badge=2（如果 currentThread ≠ th_mo8ndbzc_0rpu5m）
- Header 红 dot：同样依赖 currentThreadId 判断

服务已 kill。

### 2026-04-21 步骤 6.1：UI 人肉验证步骤清单

（执行代理无浏览器 MCP，此处留清单给 Alan Kay 人肉验证）

1. **基础 render**
   - 启动后端 + 前端（`kernel/web && bun run dev`）
   - 访问 http://localhost:5173
   - 进入 Flows tab，右侧应有 MessageSidebar
   - 顶部有一排图标：pause toggle / MessageSquare（threads 切换） / Maximize
2. **默认行为验证**
   - 第一次进入 MessageSidebar，session 无 supervisor 线程时
   - Body 应显示灰色文本 "向 supervisor 发起对话，输入 @ 切换对象"
3. **首次发送消息**
   - 输入 "你好" → 发送
   - 乐观消息立即显示在 Body
   - supervisor 回复后，currentThreadId 应自动变为 supervisor 的 root threadId
   - Body 继续展示该线程的 process（TuiAction/TuiTalk 渲染）
4. **让 supervisor 给 user 发消息**
   - 输入 "请用 talk 给 user 发个消息" → 发送
   - 等待 supervisor 执行完，Body 中应有 `[talk] → user: xxx` 的 TuiAction
5. **threads 按钮 + 红点**
   - 当 currentThreadId ≠ 消息所在线程时（比如刚切到另一个线程），Header 的 MessageSquare 按钮右上角应有红 dot
   - 当前查看的线程就是这条消息的线程时，不显示红 dot（"自己看自己的消息不算未读"）
6. **点击 threads 按钮切到 list 视图**
   - Body 内容切换为双栏 list
   - 左栏 "我发起的"：至少 1 条（supervisor 主线程）
   - 右栏 "收到的"：至少 1 张 supervisor 卡片，缩略显示 supervisor 说的话，未读 badge 显示 N
7. **点击右栏对象卡片**
   - 卡片展开，显示该对象下所有 thread 的缩略列表
8. **点击某条 thread**
   - Body 立即切回 process 视图
   - 展示该 thread 的 actions
   - 该 thread 的所有 messageId 写入 localStorage（Chrome DevTools Application → Local Storage 可验证 key `ooc:user-inbox:last-read:{sid}`）
   - Header 红点消失（或 unread 数下降）
9. **刷新页面**
   - 已读状态保持（localStorage）
10. **多对象场景**
    - @bruce 发一条消息 → bruce 线程创建
    - bruce 回复到 user → 右栏出现第二个对象卡片（bruce）
    - bruce 多次 talk user → 同一 bruce 卡片上 unread badge 累加

### 2026-04-21 步骤 7：文档

- `docs/meta.md` 子树 6 MessageDock 节点重写——从"固定 supervisor 对话"升级为"user 多线程消息中心"，包括 Header / Body 双视图 / Body 双模式 / 未读持久化
- 新建 `docs/哲学/discussions/2026-04-21-MessageSidebar多线程消息中心.md`：记录"为什么 user 需要消息中心"、"引用式数据 + 前端反查"、"对象聚合 > 线程聚合"、"localStorage 过渡方案" 四个设计决策

## 最终总结

### Commit 清单（kernel 子模块）

1. `c1a17da` — feat(web/MessageSidebar): Header threads 按钮 + view/currentThread atom
2. `f8cc554` — feat(web/MessageSidebar): useUserThreads 聚合 user 线程 hook
3. `dbdfb07` — feat(web): MessageSidebarThreadsList 双栏视图
4. `5e737eb` — feat(web/MessageSidebar): unread dot 角标 + 接入 threads 视图
5. `c0b6e86` — feat(web/MessageSidebar): 默认与 supervisor 对话 + 自动选 root thread
6. `2a30239` — feat(web/MessageSidebar): Body 按 currentThreadId 过滤 process

### 前端类型检查

- tsc --noEmit：0 新增错误（仅 4 个与本迭代无关的 pre-existing TS 错误）

### 测试基线

- 本迭代仅改前端；后端零改动，`bun test` 基线保持 499 pass
- 并行 Trait Namespace agent 在 kernel 里有 engine.ts 的 Phase 2 改动（未提交的 working tree）——本迭代不触碰，也不 add 这些文件，完全隔离

### 非预期发现

- `ProcessNode.locals._creatorObjectName` 未写入（`thread-adapter.ts:89` 只写 `_creatorThreadId`）——本迭代未依赖这一字段，改用 "subFlow.stoneName" 作为对象归属判定
- `activeFlow.messages` 包含跨 subFlow 的全部 message（已 mergeMessages），所以 Body 过滤时要显式 filter `involvesObj + involvesUser`
- Header 红点未读计数决策：**排除当前 currentThreadId 的消息**——避免"我正在看这个对话，但 Header 一直闪红点"的体验问题

### 与 Trait Namespace agent 的冲突情况

- 完全无冲突。Trait agent 改的是：
  - `kernel/src/thread/engine.ts`（Phase 2 MethodRegistry 沙箱 API）
  - `kernel/traits/computable/file_ops/index.ts`（llm_methods 迁移）
  - `kernel/src/trait/registry.ts`（Phase 2 三元键）
  - trait frontmatter namespace 字段（Phase 1 已合并进 main）
- 本迭代改的都是 `kernel/web/src/` 前端文件，零交叉
- Phase 3 如果会动 ViewRegistry 前端机制，那也与本迭代的 MessageSidebar 正交

### 未做的事

- 后端 user inbox read-state 持久化——本迭代明确用 localStorage 过渡
- threads 视图里 "我发起的" 栏没有展示 thread 下的最新 action 缩略（只有 title + status），用户若要看详情点进去即可
- 同一对象卡片的展开/折叠状态未持久化（刷新后收起）

