---
title: super flow —— Object 自我相关动作的统一执行场所
description: super session 是什么、自指别名翻译、协议知识注入；问 OOC 反思通道怎么工作时看这篇
activates_on:
  "window::root": "show_content"
---

# super flow

`super` 是一条**受保护的特殊 session**，承载 Object 的反思线程。Object 一切「自我相关」能力——自观测（读自己历史）、自反思（沉淀经验）、自修改（改 self / sediment）——都收敛到 super flow。它不是普通业务 session，全系统硬编码识别。

## 受保护 sessionId

- `packages/@ooc/core/_shared/types/constants.ts:12` `SUPER_SESSION_ID = "super"`。
- `:18` `isSuperSessionId`：`trim().toLowerCase() === "super"`，大小写无关，防 HFS+ 等大小写不敏感文件系统用 "Super"/"SUPER" 绕过。
- 整个 OOC world 一个 super session；每个 object 在其下可有自己的反思 thread。`.session.json` 在首次 super 派送时由 talk-delivery 懒创建。

## 自指别名翻译

talk_window.target 一般指向另一个 flow object id；特殊地 `target === "super"`（`SUPER_ALIAS_TARGET`，constants.ts:15）被 talk-delivery 翻译为指向自己的 super 分身：

- `packages/@ooc/core/executable/windows/talk/delivery.ts:88-89` —— `calleeObjectId = caller.objectId`，派进 super session。
- 这是跨 session 派送（caller 当前 session ≠ "super"），不约束 caller/callee 同 session。
- callee thread 启动时注入指向 caller 的 creator talk_window，反思线程据此把结论「回报」给原线程。

## 协议知识注入

`packages/@ooc/core/thinkable/context/protocol.ts:119-121` —— 当 `thread.persistence?.sessionId === SUPER_SESSION_ID` 时，注入两条 knowledge：`REFLECTABLE_KNOWLEDGE`（反思基础协议）+ `REFLECTABLE_METAPROG_KNOWLEDGE`（元编程协议，教 LLM 何时走 worktree 改身体）。这条协议只在 super flow 注入，普通业务线程看不见。

`:158` —— 业务 thread 打开 `command="end"` 的 form 且非 super session 时，注入 `END_REFLECTION_REMINDER_KNOWLEDGE`：一段非阻塞 hint，提醒「你刚工作了一段，考虑反思」。super flow 内的 end 不重提，避免无限套娃。

边界：super 是 **self-scoped**，只观察 / 修改 Object 自己；super 本身从不跨 object。super flow 是反思通道而非执行通道——不跑 program shell、不 edit 业务代码、不开 do 子任务。
