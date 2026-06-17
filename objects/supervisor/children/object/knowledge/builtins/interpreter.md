---
title: interpreter — ts/js 解释器 tool-object（self × 各维度：run → interpreter_process sandbox+history）
description: _builtin/interpreter 家族单一权威——从 self × 各维度看：self 是空 data 的单例 tool-object，executable=run（委托造 child），readable=静态身份窗，construct/visible/persistable 无；child interpreter_process 是非单例进程类（ts/js sandbox + history + 注入 self）
activates_on:
  "object::root": "show_description"
---

# interpreter

> ts/js 解释器 tool-object 家族：parent `interpreter` 的 self 把「跑 ts/js 脚本」收成一个 `run` 方法面，委托造 child `interpreter_process`（一段 sandbox 进程 + exec history）。
> 同形姊妹 `terminal`（`_builtin/terminal`，跑 bash 子进程）几乎完全同构——本文不复述共享机制，进程窗 history 结构/渲染/viewport 复用 `_shared`，见 terminal.md。对象模型（class/object、单例/非单例、construct、继承、children 命名空间）见 class `knowledge/object-model.md`，本文不复述。

## 一、self（身份 / data）

- **id** `_builtin/interpreter`；**`ooc.kind=object`**；单例 tool-object，`parentClass=null`（不继承 root，只持自己的工具方法）；被 agent 组合持有、被 exec（见 object-model.md 组合）。
- **Data = {}**（空）——self 只承载身份 + 一个方法面，状态全在它造出的 child `interpreter_process` 上。
- **职责**：把「在隔离 sandbox 里跑一段 ts/js 脚本」收成一个 `run` 方法。

## 二、self × 各维度（核心设计）

### self × executable —— `run`（委托造 child process）
参数 `{ language: "ts"|"js"(enum,required), lang?: 别名, code: string(required) }`；委托 `ctx.runtime.instantiate("_builtin/interpreter/interpreter_process", {language, code})` 造一个 interpreter_process（首段脚本在 child construct 内跑完、结果进 history），返回新进程 id 文本。不改 self；非 for_ui_access。

### self × readable —— 投影成静态身份窗
投影成 class `interpreter`、content 极简（方法菜单靠 object method description 撑），window 仅声明 `object_methods:["run"]`、不随视角变化。无自定义 window method——无投影态（`InterpreterWin = {}`）。

### self × construct —— 无
单例 tool-object 即其唯一实例，无 construct；其「实例」语义由 child interpreter_process 的 construct 承载。

### self × visible —— 无
自身无 UI（进程详情面板在 child 上），走系统默认。

### self × persistable —— 系统默认
data 空，无自定义序列化。

## 三、children

### `_builtin/interpreter/interpreter_process`（kind=class，非单例）
一段 ts/js 解释进程窗——`interpreter.run` 造出的结果对象，一个 world 可有多个。

- **construct**：即 parent `run` 委托的目标——取 `ctx.thread` 必需、`normLang(args)` + `code` 必需，跑首段脚本，返回 `{ history: [首条 record] }`。
- **data**：`Data = { history: ProcessExecRecord[] }`（每次 exec 一条）。`ProcessExecRecord`（execId/language/code/output/ok/startedAt）与 terminal_process 共用，收在 `@ooc/builtins/_shared`。
- **object method**：`exec`（在已开窗的进程内再跑一段 ts/js，结果 push 进 `self.history` 并通知重持久化）、`close`（关窗）。
- **window method**：`set_history_window`——调 history 视口（tail N / 固定 range），返回新 ProcessWin、不碰 data；与 terminal_process 复用 `_shared` 的 history viewport，默认末 10 次 exec。
- **投影**：class `interpreter_process`，content 渲染 history 摘要 + 最近一条 full output。
- **visible**：自定义详情面板 + diff（复用 `_shared/visible/process-detail` / `process-diff`）。**persistable**：无自定义，系统默认。
- **sandbox 与注入的 `self`**（机制权威在 programmable `knowledge/interpreter-self-and-shell.md`）：ts/js 写 tmp `.mjs` → in-process import 执行，console 进 stdout、`_result_` 进 returnValue。脚本内注入的 `self` 可 `callMethod`（跨窗调任意 object method）/ `getData`/`setData`（flow 级）/ `getThreadLocal`/`setThreadLocal`（线程内跨 exec、不持久化）。
