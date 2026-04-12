---
name: library/git/ops
type: how_to_use_tool
version: 1.0.0
when: "当需要执行 Git 版本控制操作时"
description: Git 版本控制操作：status/diff/log/add/commit/branch/checkout/push/pull
deps: []
---
# Git 版本控制能力

你可以通过以下 API 执行 Git 操作。所有命令在对象的 rootDir 下执行。

## 可用 API

### gitStatus()

获取工作区状态，包括分支信息和文件变更。

```javascript
const result = await gitStatus();
// result.data = {
//   branch: "main",
//   ahead: 0,
//   behind: 0,
//   staged: ["src/index.ts"],
//   unstaged: ["src/utils.ts"],
//   untracked: ["new-file.txt"]
// }
```

### gitDiff(options?)

获取工作区或暂存区的差异。

- `options.staged` — 是否查看暂存区差异（默认 false）
- `options.file` — 只查看指定文件的差异

```javascript
// 工作区差异
const result = await gitDiff();

// 暂存区差异
const result = await gitDiff({ staged: true });

// 指定文件差异
const result = await gitDiff({ file: "src/index.ts" });
```

### gitLog(options?)

获取提交历史。

- `options.limit` — 返回条数（默认 10）

```javascript
const result = await gitLog({ limit: 5 });
// result.data = [
//   { hash: "abc1234...", message: "feat: 新功能", author: "Alice", date: "2026-03-30T10:00:00+08:00" },
//   ...
// ]
```

### gitAdd(files)

将文件添加到暂存区。

- `files` — 文件路径数组

```javascript
const result = await gitAdd(["src/index.ts", "src/utils.ts"]);
```

### gitCommit(message)

创建一个提交。

- `message` — 提交信息

```javascript
const result = await gitCommit("feat: 新增用户登录功能");
// result.data = { hash: "abc1234..." }
```

### gitBranch(name, options?)

创建新分支。

- `name` — 分支名称
- `options.checkout` — 创建后是否切换到新分支（默认 false）

```javascript
// 只创建分支
const result = await gitBranch("feature/login");

// 创建并切换
const result = await gitBranch("feature/login", { checkout: true });
```

### gitCheckout(branch)

切换到指定分支。

- `branch` — 目标分支名称

```javascript
const result = await gitCheckout("main");
```

### gitPush(options?)

推送到远程仓库。

- `options.force` — 是否强制推送（默认 false）
- `options.upstream` — 设置上游分支（如 "origin feature/login"）

```javascript
// 普通推送
const result = await gitPush();

// 设置上游并推送
const result = await gitPush({ upstream: "origin feature/login" });
```

### gitPull(options?)

从远程仓库拉取。

- `options.rebase` — 是否使用 rebase 模式（默认 false）

```javascript
// 普通拉取
const result = await gitPull();

// rebase 模式
const result = await gitPull({ rebase: true });
```

## 注意事项

1. 所有命令在对象的 rootDir 下执行
2. Git 命令失败（非零退出码）会返回 `toolErr`，包含 stderr 信息
3. 只读操作（status/diff/log）不会修改仓库状态

## ⚠️ 安全警告

以下操作具有破坏性，执行前请三思：

- `gitPush({ force: true })` — 强制推送，可能覆盖他人工作
- `gitCheckout` — 切换分支时未提交的更改可能丢失
- `gitCommit` — 确保提交信息准确描述变更内容
