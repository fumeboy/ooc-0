---
title: evolve_self —— feat-branch PR 沉淀 finalizer
description: 怎么把一次身份/知识/身体改动经 feat 分支开成 PR 合进 main；问沉淀怎么落 canonical / feat 分支 / PR 审批时看这篇
activates_on:
  "object::root": "show_description"
  "method::root::new_feat_branch": "show_content"
  "method::root::evolve_self": "show_content"
---

# 沉淀进 canonical = feat-branch PR

要把 Object 的身份/知识/身体改动**沉淀进 canonical（main）**，走一条三步的 feat-branch PR 流程（设计权威 `docs/2026-06-11-reflectable-feat-branch-pr-flow-design.md`）。session worktree 是纯运行时派生物、**永不合入 main**，所以沉淀必须另起 feat 分支。

## 三步

1. **new_feat_branch(intent)** —— 沉淀第一步。在 super flow 内从 main 派生一条 `feat/<slug>` 分支 worktree（落 `stones/<branch>/`），把分支名 + intent 绑进 `thread.persistence.stonesBranch`/`sedimentIntent`（随 thread.json 持久化、跨 exec tick 存活）。锚点：`packages/@ooc/builtins/root/executable/method.new-feat-branch.ts` `newFeatBranchMethod`；底层 `packages/@ooc/core/persistable/stone-feat-branch.ts:165` `createFeatBranchWorktree` / `:111` `slugFromIntent` / `:122` `featBranchName` / `:127` `featWorktreePath`。同 intent 重调幂等重绑（git WORKTREE_EXISTS 视成功）——这是 reject/request-changes 回修的 resume 入口。

2. **直接编辑** —— 绑定生效后用普通 `write_file` / `file_window.edit` 编辑 feat worktree 下文件，**不**把文件内容作方法参数传。`packages/@ooc/core/persistable/stone-worktree.ts:169` `resolveStoneIdentityRef` 把 feat 绑定放在 sessionId 路由**最前面、覆盖优先**（`:179-184`，经 `ensureFeatBranchWorktreeReady` 确保就绪），读写自然落 feat worktree。

3. **evolve_self()** —— finalizer（**无 edits 参数**）。锚点 `packages/@ooc/builtins/root/executable/method.evolve-self.ts` `evolveSelfMethod`：读绑定 → `commitAndOpenPr`（commit 署名 actor → 算 reviewer 集 → `createPrIssue`）→ `deliverPrWindowToReviewers` 把 pr_window 投给每个 reviewer。底层 `stone-feat-branch.ts:240` `commitAndOpenPr` / `:92` `computeReviewerSet`。

## reviewer 集冒泡（rule A）

`computeReviewerSet(diffPaths, authorObjectId)`（`stone-feat-branch.ts:92`）：对变更触及的每条路径取其**顶层领地 owner**（`ownerObjectIdOfPath`），并集 supervisor，去掉 author 自身。

- foo 只改自己子树（`objects/foo/**` 含 `children/**`）→ reviewer = {supervisor}。
- 越界改 Y 领地 → reviewer = {Y, supervisor}。
- author（foo）不作 reviewer（避免自审自批）；supervisor 恒在 reviewer 集。

## 审批 + 合入闸

每个 reviewer 的 super-session pr-review thread 收到 `pr_window`（`packages/@ooc/core/executable/windows/pr/delivery.ts:81` `deliverPrWindowToReviewers`，threadId=`:39` `prReviewThreadId`）+ 激活 `packages/@ooc/builtins/root/knowledge/pr-review.md` 协议，经 window 的 `approve`/`reject`/`request_changes` method（`executable/windows/pr/index.ts`）行使评审。

聚合 `packages/@ooc/core/persistable/pr-issue.ts:119` `aggregatePrApproval`：全 approve→ready-to-merge / 任一 reject→rejected（一票否决）/ 否则 changes-requested|pending。`.world.json prAutoMerge`（`world-config.ts:84`，缺省 `DEFAULT_PR_AUTO_MERGE=false`@`:117`=人工）：true 立即 `resolvePrIssue(merge)`；false 留 open 待人工 `POST /pr-issues/:id/resolve {merge}`。单一编排点 `executable/windows/pr/approval-flow.ts:103` `applyPrApproval`（HTTP `approvePrIssue` 与 pr_window method 同源委托它）。合入复用 `stone-versioning.ts:291` `resolvePrIssue`。

## 失败回修 loop

reject / request-changes / 合入失败 → `executable/windows/pr/delivery.ts:166` `routePrRepairMessage` 按 PR record `authorThreadId` 找 super(foo) thread → inbox 追 verdict+反馈 → 翻 running（找不到 fail-loud `NO_AUTHOR_THREAD`）。super(foo) 收 message 后 `new_feat_branch(同 intent)` 幂等重绑续修：request-changes 时旧 worktree+编辑仍在可续改，reject 后旧 worktree 已归档、从 main 重派重做。re-edit → 再 `evolve_self` 重开 PR。

## 边界

- 沉淀第一步是 super flow 内的 `new_feat_branch`，不是手动开 worktree / commit / merge。
- super flow 本身不在 feat 分支外直改 stone——它是沉淀发起点 + finalizer + 治理（resolve / rollback，详见 `knowledge/super-flow.md`）。
- HTTP 控制面写（前端保存 self/readable/executable）→ `httpDirectMainWrite` 直 commit main，立即生效，不开 worktree。
- session worktree 改动永不进 canonical——要沉淀必走 feat-branch PR（或 HTTP 直写）。
