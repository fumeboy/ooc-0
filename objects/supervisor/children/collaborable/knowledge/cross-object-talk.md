---
activates_on: {"object::root": "show_description"}
---

# cross-object talk —— Object 之间用消息+窗口协作

OOC 的协作不是「调用对方函数」，而是「消息 + 持续会话窗口」。两个长得像、语义不同的窗口：

- **talk_window**：跨 object 的持续会话窗口。`root.talk` 创建，target 是对端 flow object id（`"user"` 也是一个 flow object）。`say` 发消息（source=`talk`，控制面代用户发时 source=`user`），可 `wait`。同一对端**复用同一 talk_window**，不要每发一条就 close 再重开。
- **do_window**：同 object 内 `root.do` fork 子线程的对话窗口。`continue` 追加消息（source=`do`）。

判定一个 thread 的 creator window 是 do 还是 talk，由 `isCreatorSelf` 决定——creatorObjectId 是否=自身（且同 session）（`packages/@ooc/core/executable/windows/_shared/init.ts:55`）。

`say` 的细节：`talk_window.say` 是挂在 talk_window 上的 object method（`sayMethod: ObjectMethod`，不再叫 "command"）——它改协作状态（发消息落对方 inbox），不是只控展示的 window method（展示控制类 method 归 readable 注册）。`wait=true` 时父线程进 `status="waiting"`，等对端回复进 inbox 唤醒（`packages/@ooc/core/executable/windows/talk/method.say.ts:99`，wait 行为见 `:91` exec 体 / `:20` 知识注释）。

在对象关系三轴里，talk / do 主要承载 **peer 平等轴**：同级 Agent 平等协作，只能 talk 说服、**不能支配对方、不能直接改对方运行时状态**。运行时管控跑偏的 child 也走 talk，不暴力写 child 状态。

creator window 是每个新 thread 启动时指向创建方的恒在通道，`isCreatorWindow=true` 拒绝 close；callee 通过 creator talk_window 的 `say` 回报给 caller（`init.ts:125` / `:138`）。
