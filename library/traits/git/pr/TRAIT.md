---
namespace: library
name: git/pr
type: how_to_use_tool
version: 1.0.0
description: GitHub PR 工作流（基于 gh CLI）：create_pr / list_prs / get_pr / get_pr_checks / comment_on_pr / merge_pr
deps:
  - library:git/ops
---

# GitHub PR 工作流

通过 `gh` CLI 完成 PR 全链路。所有命令在对象的 rootDir 下执行。在 `program` 沙箱内使用 `callMethod("library:git/pr", method, args)` 调用；单个方法也可以用 `open({ type: "command", command: "program", title, trait: "library:git/pr", method })` 发起。

## 前置

- 宿主机安装了 `gh`（GitHub CLI）且已完成 `gh auth login`
- PR 的源分支已 push 到远程（否则 `gh pr create` 会失败并提示）

## 可用 API

### create_pr({ base, head, title, body, draft? })

```javascript
const r = await callMethod("library:git/pr", "create_pr", {
  base: "main",
  head: "feat/login",
  title: "feat: 新增登录页",
  body: "## Summary\n- 支持账号密码登录\n\n## Test plan\n- [ ] 输入正确账号能进入主页",
});
// r.data = { number: 42, url: "https://github.com/owner/repo/pull/42" }
```

### list_prs({ state?, author?, limit? })

- `state`: open / closed / merged / all（默认 open）
- `author`: GitHub 用户名过滤
- `limit`: 返回条数（默认 30）

```javascript
const r = await callMethod("library:git/pr", "list_prs", { state: "open" });
// r.data = [{ number, title, state, author, headRefName, baseRefName, url, createdAt, updatedAt }, ...]
```

### get_pr({ number })

返回 PR 详情，**包含 diff 和评论**。适合 review 场景。

```javascript
const r = await callMethod("library:git/pr", "get_pr", { number: 42 });
// r.data = { number, title, state, body, diff, comments: [{ author, body, createdAt }], ... }
```

### get_pr_checks({ number })

```javascript
const r = await callMethod("library:git/pr", "get_pr_checks", { number: 42 });
// r.data = {
//   checks: [{ name, state, conclusion, link }, ...],
//   summary: "pass" | "fail" | "pending" | "unknown"
// }
```

### comment_on_pr({ number, body, inReplyTo? })

- 默认创建顶层评论（走 `gh pr comment`）
- 传 `inReplyTo` 时通过 **GraphQL `addPullRequestReviewComment` mutation** 回复 review comment 的 thread
  - `inReplyTo` 可为 GraphQL node_id（`PRRC_*`）或纯数字 REST id（自动先查 `gh api repos/:o/:r/pulls/comments/:id` 拿 `node_id`）
  - 宿主机未安装 `gh` 时，返回 `gh_cli_missing` 错误（context 里带安装提示）

```javascript
// 顶层评论
await callMethod("library:git/pr", "comment_on_pr", { number: 42, body: "LGTM，合并前建议补一个 E2E" });

// 回复 diff 里某条 review comment
await callMethod("library:git/pr", "comment_on_pr", {
  number: 42,
  body: "已修复，看看这样可以吗？",
  inReplyTo: "PRRC_kwDOXXXX",  // 或 "123456789"（数字 REST id）
});
```

### merge_pr({ number, method, deleteBranch? })

**高危**：必须显式传 `method`（squash / merge / rebase），推荐在用户明确确认后调用。

```javascript
await callMethod("library:git/pr", "merge_pr", { number: 42, method: "squash", deleteBranch: true });
```

## 注意

- 所有网络失败都在 `result.error` 里带有 `gh` 的 stderr，LLM 可据此自我修正（比如发现 "not authenticated" → 提示用户先跑 `gh auth login`）
- `get_pr_checks` 在 CI 失败时 `gh` 自身 exitCode = 1，但我们仍然解析 stdout 并返回 `summary: "fail"`，不报错
- 合并 PR 是破坏性操作——LLM 应在执行前用 `talk("user", "是否合并 PR #42？")` 确认
