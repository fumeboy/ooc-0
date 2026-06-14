---
activates_on: {"object::root": "show_description"}
---

# InterpreterSelf 注入与 terminal_process shell `$OOC_SELF_DIR`

interpreter ts/js sandbox 与 custom method dispatcher 路径执行用户代码时，注入一个 `interpreterSelf`（InterpreterSelf），承载几组能力。构造工厂：`createInterpreterSelf(stoneRef, thread, registry?)`（`packages/@ooc/builtins/interpreter_process/executable/self.ts:44`）。

- **dir**：stone 目录绝对路径，用于在 sandbox 里拼相对路径。
- **callMethod(windowId, method, args?)**（:52）：在 `thread.contextWindows` lookup window → 经 `registry.getObjectDefinition(window.class).methods[method]` 取 object method → `exec(ctx)`。type=custom 时 dispatcher 自带 interpreterSelf 注入。把「调任意 window 上任意 method」统一成 `(window_id, method, args)` 一个签名；找不到时抛带可见 window/method 列表的清晰错误。
- **getData(key) / setData(key, value)**（:80,:86）：读写 flow 级 `flows/<sid>/objects/<self>/data.json`。setData 顶层 spread merge 非整体覆盖。**语义**：是当前 session 的数据，不是跨 session 长期数据；要跨 session 共享走 stone server method 写 pool/sql。无 `thread.persistence` 时 getData 返回 undefined / setData 静默 no-op。
- **getThreadLocal / setThreadLocal**（:91,:94）：读写 `thread.threadLocalData`，同一线程内 ts/js exec 之间共享，但不持久化（重启即丢）。

**依赖边界**：object method 的执行环境是 session（object 的工作区），不与 thread 绑定——getData/setData 与 shell env 都只依赖 session 级 FlowObjectRef；仅 callMethod（查当前线程可见 windows）与 threadLocal（线程内跨 exec 传值）属于调用现场，是 InterpreterSelf 仅有的两个真 thread 依赖。

## 两个进程类

跑脚本拆成两个 builtin 对象 + 两个进程类：

- **interpreter（ts/js）** → `runInterpreterExec`（`packages/@ooc/builtins/interpreter_process/executable/runtime.ts:21`）：经 `createInterpreterSelf`(:39) 注入 self 到用户代码（无 persistence 时 self 为 null）；`executeUserCode` 写 tmp `.mjs` → in-process `import(...?t=id)` 执行，console 进 stdout、`_result_` 进 returnValue、异常解析行号。脚本内可 `await self.callMethod(...)` 编排多步调用。
- **terminal（bash）** → `runBashScript`（`packages/@ooc/builtins/terminal_process/executable/shell.ts:10`）：`Bun.spawn(["bash","-c",code])` 跑独立子进程；经 `buildBashEnv`(:42) 注入 env。

## terminal_process shell `$OOC_SELF_DIR`（worktree 统一模型）

`buildBashEnv(session: FlowObjectRef | undefined)`（`packages/@ooc/builtins/terminal_process/executable/shell.ts:42`）目前只透出 `OOC_SELF_DIR`——签名只收 session 工作区引用，不收 thread。它经 `resolveStoneIdentityDir(ref, "write")`(:48，不是硬拼旧扁平路径）解析：

- **business session** → 该 session worktree 的 object 目录 `flows/<sid>/objects/<id>/`（main HEAD 完整副本，裸读裸写都看得到完整 identity，改动落 worktree 不污染 main，经 super flow `create_pr_and_invite_reviewers` 合入才永久）。
- **super / 控制面** → main canonical。

由此 terminal bash 与 `write_file` / `edit` 收敛到同一 session 目录（session-worktree 统一模型五通道之通道一）。
