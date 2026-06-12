---
activates_on: {"object::root": "show_description"}
---

# inbox/outbox 双写 —— 跨 object 派送的唯一入口

`deliverTalkMessage` 是跨 object 派送的**唯一路径**（`packages/@ooc/core/executable/windows/talk/delivery.ts:76`）。无论 LLM 通过 `talk_window.say` 还是控制面代用户发，都汇集到这里。一次派送做的事：

1. **解析 caller 与 target**：caller = 当前 thread + talk_window；target = `talkWindow.target`（objectId）。`target="super"` 翻译为派往自己的 super 分身（`calleeObjectId = caller.objectId`、session=`"super"`）——跨 session 自我协作（`delivery.ts:11` 注释）。
2. **解析或创建 callee thread**：`targetThreadId` 已设 → readThread；否则 createFlowObject + 新建 thread，注入指向 caller 的 creator talk_window，并把 `targetThreadId` 回填，下次 say 直接命中。
3. **双写同一 messageId**：`caller.outbox` 追加一条 ThreadMessage（`windowId = caller talk_window.id`），`callee.inbox` 追加同一条（`replyToWindowId` 由 `resolveCalleeReplyToWindowId` 解析），并 push `inbox_message_arrived` 事件让 LLM 看到（`delivery.ts:195`-`:196`）。
4. **callee 状态**：waiting/done/failed → running，等 worker 调度；paused 不动。
5. **持久化**：caller / callee 双写 thread.json。
6. **事件驱动入队**：`notifyThreadActivated(callee)` 把 callee 入队，worker 不再周期扫 fs 兜底（`delivery.ts:217`）。

**inbox/outbox 是跨 thread 影响的唯一通道**——thread 之间不共享内存，所有跨 thread 的影响都必经此处显式传递。这是 collaborable 的硬约束：协作链路始终可观察、可回放、可 debug。

`resolveCalleeReplyToWindowId` 按 **targetThreadId（精确命中本条 conversation）→ objectId（对象级 fallback）→ creator window（初次创建）** 三级解析入站消息归属哪个 talk_window 的 transcript（`delivery.ts:247`）。老实现硬写 creator window，会把「assistant↔critic 非首次会话」错塞到 creator window。
