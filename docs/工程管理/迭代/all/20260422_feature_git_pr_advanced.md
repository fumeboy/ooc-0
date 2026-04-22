# Git PR Advanced — interactive rebase + GraphQL review comments

> 类型：feature
> 创建日期：2026-04-22
> 状态：todo
> 负责人：TBD
> 优先级：P2

## 背景

`git_pr_workflow.md` 完成 MVP 后留下的能力 gap：
- `cherry_pick / revert / rebase_onto` 只做了非交互式
- `comment_on_pr.inReplyTo` 参数签名保留但实际未实现（需要 GitHub GraphQL）
- interactive rebase（reword / squash / fixup）未封装

## 目标

1. **Interactive rebase 编排**：通过 `GIT_SEQUENCE_EDITOR` 脚本注入 rebase todo list
2. **真 GraphQL review 评论**：`inReplyTo` 参数生效，能回复某条 review comment
3. **完整 PR 工作流 E2E**：bruce 在 worktree 里改 feature → create_pr → 等 CI → 响应 review → merge

## 方案

### Phase 1 — Interactive rebase

- 新 `library/traits/git/advanced.interactive_rebase({onto, plan: [{action, commit}]})`
- 内部：生成 todo 脚本文件 → 设 `GIT_SEQUENCE_EDITOR="cat <script>"` → 跑 git rebase -i --onto

### Phase 2 — GraphQL 评论

- `gh api graphql` 调用 addPullRequestReviewComment mutation
- 支持 `inReplyTo: reviewCommentId`

### Phase 3 — E2E

- Bruce 做一次完整 PR 循环验证

## 影响范围

- `library/traits/git/advanced/`、`library/traits/git/pr/`

## 验证标准

- interactive_rebase 对一段历史做 squash + reword 成功
- PR 评论回复链路通

## 执行记录

（初始为空）
