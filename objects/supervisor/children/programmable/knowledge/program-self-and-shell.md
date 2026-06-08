---
activates_on: {"window::root": "show_content"}
---

# ProgramSelf 注入与 program shell `$OOC_SELF_DIR`

program ts/js sandbox 与 callCommand 路径执行用户代码时，注入一个 `self`（ProgramSelf），承载几组能力。构造工厂：`createProgramSelf(stoneRef, thread)`（`packages/@ooc/core/executable/object/self.ts:23`）。

- **dir**：stone 目录绝对路径，用于在 sandbox 里拼相对路径。
- **callCommand(windowId, command, args?)**（:31）：在 `thread.contextWindows` lookup window → 经 WindowRegistry 取该 window type 的 `commands[command]` → `exec(ctx)`。type=custom 时 dispatcher 自带 self 注入。把「调任意 window 上任意命令」统一成 `(window_id, command, args)` 一个签名；找不到时抛带可见 window/command 列表的清晰错误。
- **getData(key) / setData(key, value)**（:60,:67）：读写 flow 级 `flows/<sid>/objects/<self>/data.json`（2026-05-23 起从 stone 迁到 flow）。setData 顶层 spread merge 非整体覆盖。**语义**：是当前 session 的数据，不是跨 session 长期数据；要跨 session 共享走 stone server method 写 pool/csv。无 `thread.persistence` 时 getData 返回空 / setData 静默 no-op。
- **getThreadLocal / setThreadLocal**（:76）：读写 `thread.threadLocalData`，同一线程内 ts/js exec 之间共享，但不持久化（重启即丢）。

## 两条使用路径

`runOneExec`（`packages/@ooc/builtins/program/executable/runtime.ts:50`）路由 shell / ts / js：

- **ts/js sandbox**：经 `createProgramSelf`(:87) 注入 self 到用户代码；`executeUserCode` 写 tmp `.mjs` → in-process `import(...?t=id)` 执行，console 进 stdout、`_result_` 进 returnValue、异常解析行号。
- **shell**：经 `buildProgramShellEnv`(:65) 注入 env。

## program shell `$OOC_SELF_DIR`（worktree 统一模型）

`buildProgramShellEnv(thread)`（`packages/@ooc/core/executable/program/self-env.ts:16`）目前只透出 `OOC_SELF_DIR`。它经 `resolveStoneIdentityDir(ref, "write")`(:22) 解析（不是硬拼旧扁平路径）：

- **business session** → 该 session worktree 的 object 目录 `flows/<sid>/objects/<id>/`（main HEAD 完整副本，裸读裸写都看得到完整 identity，改动落 worktree 不污染 main，经 super flow `evolve_self` 合入才永久）。
- **super / 控制面** → main canonical。

由此 program shell 与 `write_file` / `edit` 收敛到同一 session 目录（session-worktree 统一模型五通道之通道一，commit `726ab0e1`，2026-06-06）。修复前 `OOC_SELF_DIR` 硬拼旧路径，agent 用 shell 写 method 落孤儿路径 → runtime 不加载 → call_method 恒 METHOD_NOT_FOUND。

概念权威：`packages/@ooc/meta/object.doc.ts:3871` 节点 `programmable.program_self_injection`。
