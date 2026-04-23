---
namespace: library
name: git/advanced
type: how_to_use_tool
version: 1.0.0
when: "当需要执行 cherry-pick / revert / rebase / blame 等高级 Git 操作时"
description: Git 高级操作：cherry_pick / revert / rebase_onto / interactive_rebase / rebase_continue / rebase_abort / blame
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

### interactive_rebase({ onto, plan })

通过 `GIT_SEQUENCE_EDITOR` + `GIT_EDITOR` 脚本注入 todo 和消息，实现 reword / squash / fixup / drop。

```javascript
await interactive_rebase({
  onto: "HEAD~5",
  plan: [
    { action: "reword", commit: "abc1234", message: "feat: 更清晰的标题" },
    { action: "pick",   commit: "bcd2345" },
    { action: "squash", commit: "cde3456", message: "合并后的正文" }, // message 可省
    { action: "pick",   commit: "def4567" },
    { action: "drop",   commit: "ef05678" },
  ],
});
```

- `plan` 顺序 = todo 顺序（从旧到新）
- `reword` 必须带 `message`；`squash` / `fixup` 的 `message` 可省（保留 git 默认合并消息）
- 冲突时返回 `{ ok:false, conflict:true, files:[...] }`——**不自动 abort**，由上层决策：
  - 解决冲突 → `rebase_continue({})`
  - 放弃本次 → `rebase_abort({})`

### rebase_continue() / rebase_abort()

```javascript
await rebase_continue({}); // 调用前确保已 git add 解决后的冲突文件
await rebase_abort({});
```

### blame({ path, range? })

```javascript
const r = await blame({ path: "src/app.ts", range: "10,30" });
// r.data.lines = [{ lineNumber, commit, author, date, content }, ...]
```

## 注意

冲突处理**不由本 trait 自动完成**——需要调用方 LLM 基于返回的 `context` 字段决定下一步（通常是 `talk("user", ...)` 请示人工介入）。
