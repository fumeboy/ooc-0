---
title: super flow —— Object 自我相关动作的统一执行场所
description: super session 是什么、自指别名翻译、协议知识注入；问 OOC 反思通道怎么工作时看这篇
activates_on:
  "object::root": "show_content"
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

`packages/@ooc/core/thinkable/context/protocol.ts:119-121` —— 当 `thread.persistence?.sessionId === SUPER_SESSION_ID` 时，注入两条 knowledge：`REFLECTABLE_KNOWLEDGE`（反思基础协议 + sediment write contract）+ 改身体协议（`packages/@ooc/core/thinkable/reflectable/reflectable-knowledge.ts:126`）：教 LLM 改身体在**业务 session** `write_file` 试验、回 super flow 用 `evolve_self` 合入，而**不是**手动开 worktree / commit / merge 四步。这两条协议只在 super flow 注入，普通业务线程看不见。

`:158` —— 业务 thread 打开 `method="end"` 的 method_exec form（`form.method === "end"`）且非 super session 时，注入 `END_REFLECTION_REMINDER_KNOWLEDGE`：一段非阻塞 hint，提醒「你刚工作了一段，考虑反思」。super flow 内的 end 不重提，避免无限套娃。

## super flow 与业务 session 的职责切分（权威）

改身体/身份的 `write_file` 发生在业务 session（`self.md` / `readable.md` / `executable/` / `visible/` 落该 session 的 worktree 副本，即时生效、main 不变）；super flow 本身不 `write_file` 改 stone，它的角色是**闸门 + 沉淀 + 治理**——只直写 pool sediment（memory / relations）、用 `evolve_self` 把业务 session 试验合回 main、做 cross-scope 治理。最短闭环：业务线程 write_file 试验 → end 进 super → `evolve_self` 合入 → 下轮新 thread 生效。

## super flow 治理：resolve / rollback

我（supervisor）在 super flow 里对 evolve 管线做两个**治理动作**。它们是**知识表达的治理判断**，不是框架固化的特殊 method——底层安全编排（PR-Issue 状态迁移 / 署名回滚 / worktree GC）在 persistable / programmable 的函数里，enact 通道是控制面 HTTP 端点这个薄入口（人类 supervisor 在 Web 控制面操作，或 agent 经 `program` 调用）。

- **resolve —— 审 cross-scope evolve 开的 PR-Issue**：cross-object 的 evolve 写（改别人子树 / 建新对象）不自治 ff-merge，而是转成一个 PR-Issue 待我评审。我在 `flows/super/issues/issue-<id>.json` 里看这次改动的 diff，决议 `merge`（在 main 上 ff-merge worktree 分支）/ `reject`（archive 分支、关 Issue）/ `request-changes`（不动 worktree、留 comment 让对方重做）。enact 经 `POST /api/runtime/pr-issues/:issueId/resolve`，body `{ decision: "merge"|"reject"|"request-changes" }`。底层是 `packages/@ooc/core/programmable/versioning.ts:516` `resolvePrIssue`，HTTP 端点是其薄入口。
- **rollback —— 把某 Object 的 stone 回滚到先前 commit**：用于 `[recovery-needed]` 类 PR-Issue（如启动自检发现某 Object 的 `executable/index.ts` 加载失败）。把 main 上 `objects/<id>/` 子树恢复到某个历史 commit，以 supervisor 署名提交。enact 经 `POST /api/runtime/stones/:objectId/rollback`，body `{ targetCommit }`。底层是 `versioning.ts:671` `rollback`——它在 persistable 层强制 `supervisorAuthor === SUPERVISOR_OBJECT_ID`（`:675-687`），任何入口（HTTP route / 工具脚本 / 未来子模块）调它都自动得到「仅 supervisor 治理身份」边界保护。

两者都只是**决议判断 + 调一个安全编排函数**：我的职责是看 diff 做对错判断，不是手动开 worktree / commit / merge。

## 边界

super 是 **self-scoped**，只观察 / 修改 Object 自己；super 本身从不跨 object。super flow 是反思通道而非执行通道——不跑 program shell、不 edit 业务代码、不开 do 子任务。
