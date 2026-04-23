# Git PR Advanced — interactive rebase + GraphQL review comments

> 类型：feature
> 创建日期：2026-04-22
> 完成日期：2026-04-23
> 状态：finish
> 负责人：P2-CodeAgent
> 优先级：P2

## 背景

`git_pr_workflow.md` 完成 MVP 后留下的能力 gap：
- `cherry_pick / revert / rebase_onto` 只做了非交互式
- `comment_on_pr.inReplyTo` 参数签名保留但实际未实现（需要 GitHub GraphQL）
- interactive rebase（reword / squash / fixup）未封装

## 目标

1. **Interactive rebase 编排**：通过 `GIT_SEQUENCE_EDITOR` 脚本注入 rebase todo list
2. **真 GraphQL review 评论**：`inReplyTo` 参数生效，能回复某条 review comment
3. **完整 PR 工作流 E2E**：本地临时仓库跑 interactive rebase 的冲突/成功全路径

## 方案

### Phase 1 — Interactive rebase

- 新 `library/traits/git/advanced.interactive_rebase({onto, plan: [{action, commit, message?}]})`
- 内部：生成 todo 脚本文件 + 消息队列脚本 → 设 `GIT_SEQUENCE_EDITOR="cp <todo>"`、`GIT_EDITOR=<msg-editor.sh>` → 跑 `git rebase -i --onto <onto> <onto>`
- 配套 `rebase_continue` / `rebase_abort`

### Phase 2 — GraphQL 评论

- `gh api graphql` 调用 `addPullRequestReviewComment` mutation
- `inReplyTo` 两种形态：`PRRC_*` node_id 直通；纯数字先 `gh api repos/:o/:r/pulls/comments/:id` 查 node_id
- gh 未安装时返回 `gh_cli_missing`

### Phase 3 — E2E

- 本地临时 git 仓库完整用例（不联网、不污染真实 repo）
- 冲突路径 + rebase_continue/abort 收尾路径

## 影响范围

- `library/traits/git/advanced/`（新增 interactive_rebase / rebase_continue / rebase_abort 三方法）
- `library/traits/git/pr/`（commentOnPr 实现 GraphQL 分支）
- `kernel/tests/trait-git-interactive-rebase.test.ts`（新）
- `kernel/tests/trait-git-pr-graphql-reply.test.ts`（新）
- `kernel/tests/trait-git-advanced-e2e.test.ts`（新）

## 验证标准

- interactive_rebase 对 5-commit 历史做 reword + squash + drop 成功 ✓
- 冲突场景返回 `{ ok:false, conflict:true, files }`，可 continue/abort 收尾 ✓
- PR 评论回复链路通（基于 gh CLI stub 的 PATH 注入测试） ✓

## 执行记录

### 2026-04-23 · P2-CodeAgent

#### Spike：`GIT_SEQUENCE_EDITOR` 可行性

在 `/tmp` 搭 6-commit 仓库（C0 + C1..C5），验证 `GIT_SEQUENCE_EDITOR="cp /tmp/todo.txt"` + `GIT_EDITOR=msg-editor.sh` 方案：
- todo 文件写 `reword <h1>` / `pick <h2>` / `squash <h3>` / `pick <h4>` / `drop <h5>`
- msg-editor.sh 通过 `MSG_STATE_FILE` 轮询 `MSG_1..MSG_N` 环境变量依次覆盖 git 给的消息文件
- 跑一次后 `git log --oneline` = `[C4, C2+C3-combined, C1-reworded, C0]`，验证通过

该方案不依赖 `sed -i` / `--exec`，跨平台稳定。

#### Phase 1：interactive_rebase 实现

- `library/traits/git/advanced/index.ts`：新增 `interactiveRebase / rebaseContinue / rebaseAbort`，导出 `llm_methods.interactive_rebase` 等
- 冲突探测：执行后若 exitCode != 0 且 `.git/rebase-merge` 或 `.git/rebase-apply` 存在，解析 `git status --porcelain` 的 UU/AA/... 标记，返回 `{ ok:false, conflict:true, files }`
- 10 单测（输入校验 6 + llm_methods 契约 2 + E2E 2）全绿
- commit：kernel `4ad3099` / user `663ecd8`

#### Phase 2：GraphQL `inReplyTo`

- `library/traits/git/pr/index.ts`：`commentOnPr` 分两路——顶层评论走 `gh pr comment`；带 `inReplyTo` 走 `gh api graphql -f query=... addPullRequestReviewComment`
- node_id 解析：`PRRC_*` 前缀直通；纯数字先 `gh api repos/:o/:r/pulls/comments/:id` lookup
- gh 不在 PATH 时返回 `gh_cli_missing`（context 里带 `brew install gh` 提示）
- `runCmd` 显式 `env: { ...process.env }` —— 关键修复：Bun.spawn 在没有显式 env 时不看 `process.env.PATH` 的动态修改，导致测试 stub 注入失效
- 6 单测（3 路径 + 非法格式 + llm_methods 契约 + gh 缺失）全绿
- **gh CLI 在本机不可用（`which gh` = not found）**，Phase 2 做成"封装好 + 单测走 stub"，运行时才报 gh_cli_missing
- commit：kernel `2573fa4` / user `1f91410`

#### Phase 3：E2E 链路

- `kernel/tests/trait-git-advanced-e2e.test.ts` 3 用例：
  1. 5-commit → reword C1 + squash C3 into C2 + drop C5 → `git log --format=%s HEAD~3..HEAD` = `["C4", "C2+C3-merged", "C1-reworded"]`，`HEAD~3` 的 subject = `"C0"`
  2. 冲突（两分支改同一行）→ interactive_rebase 返回 conflict + files → `rebase_abort` 恢复原 HEAD
  3. 冲突 → 手动 `git add` 解决 → `rebase_continue` 成功，HEAD.parent = feature-branch HEAD，文件内容 = `RESOLVED`
- commit：kernel `90e2565`

#### 测试基线

- 修改前：1034 pass / 10 skip / 6 fail（6 fail 全是 pre-existing http_client 19876 端口）
- 修改后：1053 pass / 10 skip / 6 fail（+19 新测试，0 回归）

#### 未完成 / Backlog

- **真 GitHub PR 的 E2E**：按约束"不在真实 GitHub 创建 PR"，该路径留给 Bruce 在有 `gh auth login` 环境下手动走一遍 `create_pr → comment_on_pr(inReplyTo) → merge_pr` 端到端
- **`edit` action 的 E2E**：本迭代只覆盖 reword / pick / squash / drop，`edit`（停在某 commit 让人手改）的完整用例留给后续按需补
