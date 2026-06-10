---
title: evolve_self —— session worktree 即演化单元
description: 一次 session 的身份改动怎么 commit + 合回 main；问 self-scope 合入 / worktree 演化时看这篇
activates_on:
  "object::root": "show_description"
  "method::root::evolve_self": "show_content"
---

# evolve_self = session worktree 演化单元

每个业务 session 在 stone 侧有一份**完整副本** worktree，对自身 / 他人 identity 的读写都收敛到这一个目录；evolve_self 把这份 session 副本的改动**整体合回 main**，让下一轮 thread 看见演化后的身份。

## 演化单元 = session 分支

- `packages/@ooc/core/persistable/stone-worktree.ts:25` `sessionStoneBranch(sessionId)` —— session 分支名（`session-<sid>`），即 evolve_self commit/合入的最小单元。
- worktree 三态（main canonical / session worktree 试验 / evolve 闸门）、eager 派生、物理落点 `flows/<sid>/`、`.gitignore` 白名单分离运行时——权威在 persistable `knowledge/session-worktree-model.md`，本篇只讲合入这一面。

设计权威：`docs/2026-06-09-remove-metaprog-unify-session-worktree-design.md`（2026-06-09）。

## diff / merge 两步

- `packages/@ooc/core/programmable/evolve-self.ts:98` `evolveSelfDiff` —— 用 git porcelain 列 session worktree **全部**改动（含 cross-object），让 super flow 看见要评审什么。
- `:124` `evolveSelfMerge` —— commit session worktree → rebase 到 main → `tryMergeSelf` 分类：
  - **self-scope（只改自己）** → ff-merge 回 main，署名 = objectId。
  - **cross-scope（改别人 / 建新对象）** → `must-pr-issue`，自动转 PR-Issue 给 supervisor → supervisor `resolve` 评审合入。
  - 合入后 GC：`gitWorktreeUnregister` 解除 `.git` link、**保留 `flows/<sid>` 运行时数据**（session 对话历史不丢），再 `gitBranchDelete` 删 `session-<sid>` 分支（ff-merge 后它已等于 main，删之收尾；`evolve-self.ts:179`，删失败仅 warn 不阻塞合入）。

## 边界

- LLM session 内所有 stone 写（改自己 / 改别人 / 建新对象）→ 直接 `write_file` 落 session worktree，不再有「先 open 再写」手动流程。
- 唯一合入闸门 = super flow evolve_self；super flow 本身不直接 write_file 改 stone（它是闸门 + sediment 沉淀 + 治理）。
- HTTP 控制面写（前端保存 self/readable/executable）→ 直接 commit main，立即生效，不开 worktree。
- cross-scope PR-Issue 由 supervisor 在 super flow 做治理决议（resolve / rollback，端点与底层函数详见 `knowledge/super-flow.md` 治理节）。改自己 / 改别人 / 建新对象现在都直接 `write_file` / `create_object` 落 session worktree，无单独固化写动作通道。
