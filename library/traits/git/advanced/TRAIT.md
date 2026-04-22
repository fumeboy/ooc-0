---
namespace: library
name: git/advanced
type: how_to_use_tool
version: 1.0.0
when: "当需要执行 cherry-pick / revert / rebase / blame 等高级 Git 操作时"
description: Git 高级操作：cherry_pick / revert / rebase_onto / blame
deps:
  - library:git/ops
---

# Git 高级操作

## 可用 API

### cherry_pick({ commit })

```javascript
await cherry_pick({ commit: "abc1234" });
// 冲突时：Error → 请解决冲突后 `git cherry-pick --continue`（或 --abort）
```

### revert({ commit, noCommit? })

```javascript
await revert({ commit: "abc1234" });         // 自动提交反向 commit
await revert({ commit: "abc1234", noCommit: true }); // 只产生改动
```

### rebase_onto({ onto, upstream?, branch? })

非交互式：`git rebase --onto {onto} [upstream] [branch]`

```javascript
await rebase_onto({ onto: "main", upstream: "old-base" });
```

> **interactive rebase** 的 todo-list 编排（reorder / squash / fixup）后续迭代通过 `GIT_SEQUENCE_EDITOR` 脚本实现。

### blame({ path, range? })

```javascript
const r = await blame({ path: "src/app.ts", range: "10,30" });
// r.data.lines = [{ lineNumber, commit, author, date, content }, ...]
```

## 注意

冲突处理**不由本 trait 自动完成**——需要调用方 LLM 基于返回的 `context` 字段决定下一步（通常是 `talk("user", ...)` 请示人工介入）。
