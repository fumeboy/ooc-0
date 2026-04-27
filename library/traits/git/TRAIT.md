---
namespace: library
name: git
type: how_to_use_tool
description: Git 相关能力索引（子 trait 见本目录）
---

# library/git

本目录作为 `library/git/*` 子 trait 的索引入口。

## 子 Trait 列表

- `library/git/ops` — Git 版本控制操作（status/diff/log/add/commit/branch/checkout/push/pull）
- `library/git/pr` — GitHub PR 工作流（create_pr / list_prs / get_pr / get_pr_checks / comment_on_pr / merge_pr，基于 `gh` CLI）
- `library/git/worktree` — Worktree 管理（worktree_add / worktree_remove / worktree_list，对应线程 fork 的物理容器）
- `library/git/advanced` — 高级操作（cherry_pick / revert / rebase_onto / blame）
