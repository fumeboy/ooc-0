---
activates_on: {"object::root": "show_description"}
---

# cross-object talk —— Object 之间用消息+窗口协作

OOC 的协作不是「调用对方函数」，而是「消息 + 持续会话窗口」。统一一种窗口 **talk_window**，按 target 分两形态：

- **peer 会话**（target=别的 flow object id，`"user"` 也是一个 flow object）：跨 object 的持续会话。`say` 发消息走磁盘 talk-delivery（source=`talk`，控制面代用户发时 source=`user`），可 `wait`。同一对端**复用同一 talk_window**，不要每发一条就 close 再重开。
- **fork 子窗**（target=自己 objectId，`isForkWindow=true`，旧 do_window 并入）：fork 一条同对象子线程，承载父-子算力分身。`say` 走内存树寻址（同 session 同 job、不付磁盘 IO，等同旧 do continue 的父→子/子→父追加）。

判定一个 thread 的 creator window 形态由 `isCreatorSelf` 决定——creatorObjectId 是否=自身（且同 session）：同 ⇒ fork 子窗，异 ⇒ peer 会话窗（`packages/@ooc/core/executable/windows/_shared/init.ts`）。

`say` 的细节：say 是 **thread 的行为**，逻辑落在 thread builtin（`packages/@ooc/builtins/thread/executable/say.ts` `executeSay`）；`sayMethod: ObjectMethod`（`thread/executable/method.say.ts`）注册在 thread class 上，并被会话窗 talk / reflect_request 共享复用。在 talk_window 上 `say` 改协作状态（发消息落对方 inbox），按 `isForkWindow` 自分流（fork → 内存树派送、peer → 磁盘派送）。`wait=true` 时父线程进 `status="waiting"`，等对端回复进 inbox 唤醒。

在对象关系三轴里，talk 承载 **peer 平等轴 + parent-child 层级轴**：peer 会话窗是同级 Agent 平等协作，只能 talk 说服、**不能支配对方、不能直接改对方运行时状态**；fork 子窗是同对象父子算力分身。运行时管控跑偏的 child 也走 talk，不暴力写 child 状态。

creator window 是每个新 thread 启动时指向创建方的恒在通道，`isCreatorWindow=true` 拒绝 close；callee 通过 creator talk_window 的 `say` 回报给 caller（`packages/@ooc/core/executable/windows/_shared/init.ts` `initContextWindows`，`isCreatorWindow: true` 注入见 `:136` / `:153`）。
