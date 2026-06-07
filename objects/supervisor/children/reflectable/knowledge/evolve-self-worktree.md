---
title: evolve_self —— session worktree 即演化单元
description: 一次 session 的身份改动怎么 commit + 合回 main；问 self-scope 合入 / worktree 演化时看这篇
activates_on:
  "window::root": "show_content"
---

# evolve_self = session worktree 演化单元

每个业务 session 在 stone 侧有一份**完整副本** worktree，对自身 identity 的读写都收敛到这一个目录；evolve_self 把这份 session 副本的改动**整体合回 main**，让下一轮 thread 看见演化后的身份。

## 演化单元 = session 分支

- `packages/@ooc/core/persistable/stone-worktree.ts:25` `sessionStoneBranch(sessionId)` —— session 分支名。
- `:35` `sessionWorktreePath` —— 落在 `stones/session-<sid>/`，是该 session 的完整工作副本。

「session worktree 即演化单元」（commit db9e54ea，2026-06-06）取代了旧 plain-overlay 模型：旧模型业务 session 改动落 shadow overlay，evolve_self 要逐文件读 overlay 再应用进新建实验 worktree（双目录、shadow 不可裸读、合入路径绕）。新模型读写收敛到单一副本，merge 直接 commit 该分支。

## diff / merge 两步

- `packages/@ooc/core/programmable/evolve-self.ts:98` `evolveSelfDiff` —— 用 git porcelain 列 session worktree 工作树相对 HEAD 的改动文件（`porcelainLineToRel`，:83，映射回相对 object 自治区）；worktree 未建 → 空数组。
- `:124` `evolveSelfMerge` —— commit session worktree → rebase 到 main → **self-scope ff-merge** 回 main → GC（移除 worktree + 删分支）。署名 = objectId（非 bootstrap），契合 self-scope 自治区 ff-merge；冲突 / 越界由底层 merge 上抛，worktree 保留、main 不变（fail-loud）。

## 边界

- self-scope 自治区的 identity 改动（self.md / readable.md 等）走 ff-merge，不经他人 review；cross-object 改别人子树才 PR-Issue，super 本身从不跨 object。
- 改身体形状（executable / visible）是高赌注，走 programmable / visible 的 worktree 演化路径 + stone-versioning，不由反思直接合入。
- 未决：`evolveSelfMerge` 的 must-pr-issue 是「理论上不该越界」的防御性分支；self-scope identity worktree 与 cross-scope metaprog worktree 的边界尚未在 doc 完全统一表达。
