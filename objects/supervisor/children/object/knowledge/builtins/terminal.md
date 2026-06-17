---
title: terminal — bash 终端 tool-object（self × 各维度：run → terminal_process bash 子进程+history）
description: _builtin/terminal 家族单一权威——从 self × 各维度看：self 是空 data 的单例 tool-object，executable=run（委托造 child），readable=静态身份窗，construct/visible/persistable 无；child terminal_process 是非单例进程类（bash 子进程 + history）
activates_on:
  "object::root": "show_description"
---

# terminal

> bash 终端 tool-object 家族：parent `terminal` 的 self 把「跑 bash」收成一个 `run` 方法面，委托造 child `terminal_process`（bash 子进程 + exec history）。
> 同形姊妹 `interpreter`（`_builtin/interpreter`，跑 ts/js in-process sandbox）几乎完全同构——本文不复述共享机制，child 共用 `_shared/executable/process-*` 与 `_shared/visible/process-*`，见 interpreter.md。对象模型（class/object、单例、construct、IS-A 继承 / HAS-A 组合、children 命名空间、`_builtin/<id>` 寻址）见 class `knowledge/object-model.md`，本文不复述。

## 一、self（身份 / data）

- **id** `_builtin/terminal`；**`ooc.kind=object`**；单例 tool-object，`parentClass=null`（不继承 root，只持自己的工具方法）；被 agent 组合持有、被 exec（见 object-model.md 组合）。
- **Data = {}**（空）——self 只承载身份 + 一个方法面，状态全在它造出的 child `terminal_process` 上。
- **职责**：把「跑 bash」收成一个可被 exec 的成员对象。

## 二、self × 各维度（核心设计）

### self × executable —— `run`（委托造 child process）
跑一段 bash 脚本，schema `{ code: string (required) }`；不改 self，副作用 = `instantiate` 一个 child `terminal_process`（首次 exec 已跑完、结果进其 history），返回创建提示串。非 for_ui_access。

### self × readable —— 投影成静态身份窗
投影成 class `terminal`——渲染一段静态身份/用途文本，window 声明 `object_methods:["run"]`、不随视角变化。无自定义 window method（无投影态可调）。

### self × construct —— 无
单例 tool-object 即其唯一实例，无 construct；其「实例」语义由 child terminal_process 的 construct 承载。

### self × visible —— 无
自身无 UI（进程详情面板在 child 上），走系统默认。

### self × persistable —— 系统默认
data 空，无自定义序列化。

## 三、children

### `_builtin/terminal/terminal_process`（kind=class，非单例）
bash 进程窗——`terminal.run` 造出的结果对象，一个 world 可有多个。

- **construct**：schema `{ code: string (required) }`；跑一遍 bash、把结果作为 history 首条产出 `{ history: [record] }`。缺 thread context 或空 code 则 fail-loud。
- **data**：`Data = { history: ProcessExecRecord[] }`——每次 exec 一段 bash 追加一条记录（`{ execId, language:"shell", code, output, ok, startedAt }`，类型 + 输出格式化共用 `_shared/executable/process-record.ts`，与 interpreter_process 同源）。
- **object method**：`exec`（再跑一段 bash，追加 history 并上报 data edit）、`close`（关窗）。
- **window method**：`set_history_window`（`history_tail` / `history_start` / `history_end` 调 history 渲染视口——只动投影态、不碰 data），由 `_shared/executable/process-readable.ts` 工厂产出，与 interpreter_process 同源；默认末 10 次 exec。
- **投影**：class `terminal_process`，body = history 摘要按视口截取 + 最近一条 full output。
- **visible**：自定义详情面板 + diff，复用 `_shared/visible/process-*`。**persistable**：无自定义（history 是纯 JSON，系统默认）。
- **bash 执行**：经 bash 子进程跑 `code`，cwd=进程 cwd、有 timeout，stdout/stderr/exitCode 格式化后入 history；env 透出 `OOC_SELF_DIR`（指向 session worktree 的 object 目录，让脚本可稳定定位 stone 目录）。
