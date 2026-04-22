---
namespace: library
name: git/worktree
type: how_to_use_tool
version: 1.0.0
when: "当需要为线程 fork 准备隔离工作区时"
description: Git worktree 管理（对应线程 fork 的物理容器）：worktree_add / worktree_remove / worktree_list
deps:
  - library:git/ops
---

# Git Worktree 管理

把 Git worktree 作为 OOC 线程 fork 的物理容器：

- 主线程在主工作区
- 每个 fork 子线程在 `.ooc/worktrees/{branch}` 独立工作区
- 子线程 return 后清理 worktree

## 可用 API

### worktree_add({ branch, path?, createFrom? })

- `branch` 存在时 → 直接 attach
- `branch` 不存在 → 从 `createFrom`（默认 HEAD）新建
- `path` 默认为 `.ooc/worktrees/{branch 斜杠转连字符}`

```javascript
const r = await worktree_add({ branch: "feat/login" });
// r.data = { branch: "feat/login", path: ".ooc/worktrees/feat-login" }
```

### worktree_remove({ path, force? })

```javascript
await worktree_remove({ path: ".ooc/worktrees/feat-login" });
// 有未提交改动 → 失败；force=true 强制删除
```

### worktree_list()

```javascript
const r = await worktree_list();
// r.data = [{ path, branch, head }, ...]
```

## 线程树映射建议

- 主线程 fork 子线程（context = fork）→ 子线程第一件事 `worktree_add`
- 子线程 return 前 `worktree_remove`（或由 supervisor 统一清理）
- 同一 branch 同一时刻只应对应**一个** worktree

## 注意

- 不要把 worktree 路径写死在业务代码里——永远通过 `worktree_list` 查询
- worktree 和主工作区共享 git 对象库，切换分支不会污染
