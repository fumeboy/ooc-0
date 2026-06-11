---
title: super flow —— Object 自我相关动作的统一执行场所
description: super session 是什么、自指别名翻译、协议知识注入；问 OOC 反思通道怎么工作时看这篇
activates_on:
  "object::root": "show_description"
---

# super flow

`super` 是一条**受保护的特殊 session**，承载 Object 的反思线程。Object 一切「自我相关」能力——自观测（读自己历史）、自反思（沉淀经验）、自修改（改 self / sediment）——都收敛到 super flow。它不是普通业务 session，全系统硬编码识别。

## 受保护 sessionId

- `packages/@ooc/core/_shared/types/constants.ts:12` `SUPER_SESSION_ID = "super"`。
- `:18` `isSuperSessionId`：`trim().toLowerCase() === "super"`，大小写无关，防 HFS+ 等大小写不敏感文件系统用 "Super"/"SUPER" 绕过。
- 整个 OOC world 一个 super session；每个 object 在其下可有自己的反思 thread。`.session.json` 在首次 super 派送时由 talk-delivery 懒创建。

## 自指别名翻译

talk_window.target 一般指向另一个 flow object id；特殊地 `target === "super"`（`SUPER_ALIAS_TARGET`，constants.ts:15）被 talk-delivery 翻译为指向自己的 super 分身：

- `packages/@ooc/core/executable/windows/talk/delivery.ts:94`（+ worker `runtime/worker.ts:282`）—— `calleeObjectId = await resolveSuperActor(baseDir, caller.objectId)`：caller canonical → 派进自身 super 分身；caller **非 canonical**（新对象只在 session）→ 沿 parent 链冒泡到最近 canonical 祖先（顶层→supervisor）作 actor（`super-actor.ts:51`）。
- 这是跨 session 派送（caller 当前 session ≠ "super"），不约束 caller/callee 同 session。
- callee thread 启动时注入指向 caller 的 creator talk_window，反思线程据此把结论「回报」给原线程。

## 协议知识注入

协议正文是 **agent-facing knowledge md**（不是 TS const；旧 `thinkable/reflectable/reflectable-knowledge.ts` 已不存在）：`packages/@ooc/builtins/root/knowledge/super-flow.md`（本篇，`activates_on: {"super":"show_content"}`，sessionId==="super" 命中）+ `self-evolution.md`（`object::root` / `method::root::write_file`）+ `pr-review.md`（`object::pr`，pr_window 在场）。教 LLM 沉淀身份/身体走 feat-branch PR——`new_feat_branch` 开分支 → 直接 `write_file` 编辑 → `evolve_self` finalizer 开 PR，而**不是**手动开 worktree / commit / merge。激活引擎 `packages/@ooc/core/thinkable/knowledge/triggers.ts:179`（`case "super"`）。

`:158` —— 业务 thread 打开 `method="end"` 的 method_exec form（`form.method === "end"`）且非 super session 时，注入 `END_REFLECTION_REMINDER_KNOWLEDGE`：一段非阻塞 hint，提醒「你刚工作了一段，考虑反思」。super flow 内的 end 不重提，避免无限套娃。

## super flow 与业务 session 的职责切分（权威）

改身体/身份的沉淀发生在 super flow 的 **feat 分支**上：super(foo) `new_feat_branch` 开分支 → 普通 `write_file` 直接编辑 `self.md` / `readable.md` / `executable/` / `visible/`（feat 绑定覆盖路由落 feat worktree、main 不变）→ `evolve_self` finalizer 开 PR。super flow 的角色是**沉淀发起点 + finalizer + 治理**——直写 pool sediment（memory / relations，write-through）、发起并 finalize feat-branch PR、做 PR 治理。最短闭环：业务线程 `talk(super)` → super(foo) `new_feat_branch` → 编辑 → `evolve_self` 开 PR → review approve → 合入 main → 下轮新 thread 生效。（业务 session worktree 的随手改动是纯运行时态，永不合入，要沉淀须经 feat 分支。）

## super flow 治理：resolve / rollback

我（supervisor）在 super flow 里对 evolve 管线做两个**治理动作**。它们是**知识表达的治理判断**，不是框架固化的特殊 method——底层安全编排（PR-Issue 状态迁移 / 署名回滚 / worktree GC）在 persistable / programmable 的函数里，enact 通道是控制面 HTTP 端点这个薄入口（人类 supervisor 在 Web 控制面操作，或 agent 经 `program` 调用）。

- **resolve —— 审 feat-branch PR**：feat 分支变更经 `evolve_self` 开成 PR-Issue（reviewers 按变更范围冒泡，supervisor 恒在内）。我在 `flows/super/issues/issue-<id>.json` 里看这次改动的 diff，决议 `merge`（ff-merge feat 分支进 main + archive）/ `reject`（archive 分支、关 Issue）/ `request-changes`（留 comment 让 author 续修）。agent 经 pr_window 的 `approve`/`reject`/`request_changes` method 行使；人工/HTTP enact 经 `POST /api/runtime/pr-issues/:issueId/resolve`，body `{ decision: "merge"|"reject"|"request-changes" }`。底层是 `packages/@ooc/core/persistable/stone-versioning.ts:291` `resolvePrIssue`，HTTP 端点（`api.resolve-pr-issue.ts:26` `resolvePrIssueApi`）是其薄入口。
- **rollback —— 把某 Object 的 stone 回滚到先前 commit**：用于 `[recovery-needed]` 类 PR-Issue（如启动自检发现某 Object 的 `executable/index.ts` 加载失败）。把 main 上 `objects/<id>/` 子树恢复到某个历史 commit，以 supervisor 署名提交。enact 经 `POST /api/runtime/stones/:objectId/rollback`，body `{ targetCommit }`。底层是 `stone-versioning.ts:427` `rollback`——它在 persistable 层强制 supervisor 署名校验，任何入口（HTTP route / 工具脚本 / 未来子模块）调它都自动得到「仅 supervisor 治理身份」边界保护。

两者都只是**决议判断 + 调一个安全编排函数**：我的职责是看 diff 做对错判断，不是手动开 worktree / commit / merge。

## 边界

super flow 是沉淀通道而非业务执行通道——不跑 program shell、不 edit 业务代码、不开 do 子任务。沉淀越界（改别人领地 / 建新对象）不是禁止，而是被 reviewer 集冒泡接住：变更触及的领地 owner ∪ supervisor 一起 review（rule A），author 不自审。新对象（仅 session、未 canonical）沉淀自己时由最近 canonical 祖先（顶层兜底 supervisor）作 super-flow actor 代发 PR。
