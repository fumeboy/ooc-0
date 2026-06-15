---
title: terminal — bash 终端 tool-object（方法 run；child terminal_process=bash 进程）
description: _builtin/terminal 家族单一权威——单例 tool-object、无 data、object method run、child terminal_process（非单例 class，bash 子进程 + history）；投影成只读身份窗
activates_on:
  "object::root": "show_description"
---

# terminal

> bash 终端 tool-object：唯一 object method `run` 跑一段 bash 脚本，造出 child `terminal_process`（bash 子进程 + history）作为结果窗。
> 对象模型（class/object、单例、construct、IS-A 继承 / HAS-A 组合、children 命名空间、`_builtin/<id>` 寻址）见 class `knowledge/object-model.md`，本文不复述。

## 一、是什么

- **id**：`_builtin/terminal`；**ooc.kind = `object`**。
- **角色**：单例 tool-object（被 agent 组合持有、被 exec，`parentClass=null`；模型见 object-model.md 组合）。
- **职责**：把「跑 bash」收成一个可被 exec 的成员对象，每次调用造出一个 bash 进程窗。
- **同形家族**：与 `interpreter`（ts/js 解释器）几乎完全同构（一个 bash、一个 ts/js），child 共用 `_shared/executable/process-*` 与 `_shared/visible/process-*`（见 interpreter.md）。

## 二、data

`{}`——空。terminal 自身无业务数据，只承载身份 + 方法面；状态全在它造出的 child `terminal_process` 上。

## 三、能力

- **object method**：`run`——跑一段 bash 脚本，schema `{ code: string (required) }`；不改 self，副作用 = `instantiate` 一个 child `terminal_process`（首次 exec 已跑完、结果进其 history），返回创建提示串。非 for_ui_access。
- **window method**：无（terminal 无投影态可调）。
- **投影**：window class `terminal`——渲染一段静态身份/用途文本，window 声明 `object_methods: ["run"]`，不随视角变化。
- **construct**：无（单例 tool-object 即其唯一实例）。
- **visible / persistable**：均无自定义（自身无 UI——进程详情面板在 child 上；data 空，走系统默认持久化）。

## 四、children

### `_builtin/terminal/terminal_process`（kind=class，非单例）

bash 进程窗——terminal.run 造出的结果对象，一个 world 可有多个。

- **data**：`{ history: ProcessExecRecord[] }`——每次 exec 一段 bash 追加一条记录（`{ execId, language:"shell", code, output, ok, startedAt }`，类型 + 输出格式化共用 `_shared/executable/process-record.ts`，与 interpreter_process 同源）。
- **construct**：schema `{ code: string (required) }`；跑一遍 bash、把结果作为 history 首条产出 `{ history: [record] }`。缺 thread context 或空 code 则 fail-loud。
- **object method**：`exec`（再跑一段 bash，追加 history 并上报 data edit）、`close`（关窗）。
- **window method**：`set_history_window`（`history_tail` / `history_start` / `history_end` 调 history 渲染视口——只动投影态、不碰 data），由 `_shared/executable/process-readable.ts` 工厂产出，与 interpreter_process 同源。
- **投影**：window class `terminal_process`，body = history 摘要按视口截取 + 最近一条 full output（默认末 10 条）。
- **visible**：详情面板 + diff，复用 `_shared/visible/process-*`。
- **persistable**：无自定义（history 是纯 JSON，走系统默认）。
- **bash 执行**：经 bash 子进程跑 `code`，cwd=进程 cwd、有 timeout，stdout/stderr/exitCode 格式化后入 history；env 透出 `OOC_SELF_DIR`（指向 session worktree 的 object 目录，让脚本可稳定定位 stone 目录）。
