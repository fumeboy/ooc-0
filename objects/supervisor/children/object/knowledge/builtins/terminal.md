---
title: terminal — bash 终端 tool-object（单例，self × 各维度：run → terminal_process bash 子进程+history）
description: _builtin/terminal 家族单一权威——从 self × 各维度看：terminal 是空 Data 的单例 tool-object，被 agent 组合持有(HAS-A)并 exec；executable=run（委托造 child），readable=静态身份窗，construct/visible/persistable 无；child terminal_process 是非单例进程 class（bash 子进程 + history）
activates_on:
  "object::root": "show_description"
---

# terminal

> bash 终端 tool-object 家族：单例 object `terminal` 把「跑 bash」收成一个 `run` 方法面，委托造 child `terminal_process`（bash 子进程 + exec history）。
> 同形姊妹 `interpreter`（`_builtin/interpreter`，跑 ts/js in-process sandbox）几乎完全同构——本文不复述共享机制，child 共用 `_shared/executable/process-*` 与 `_shared/visible/process-*`，见 `interpreter.md`。对象模型（class/object、单例/非单例、construct、object 经 `ooc.class` 继承一个 class、agent 组合持有 tool-object、children 命名空间从属、`_builtin/<id>` 寻址）见 `object/self.md`（对象模型），本文不复述。

## 一、self（身份 / data）

- **id** `_builtin/terminal`；**`ooc.kind=object`**；**单例 tool-object**——一个 world 一份，被多个 agent **组合持有(HAS-A)、被 exec 而非被 talk**（见对象模型核心 3/10）。它**不是 agent**：无 thinkable/collaborable/reflectable，只持自己的工具方法。
- **Data = {}**（空）——self 只承载身份 + 一个方法面，状态全在它造出的 child `terminal_process` 上。
- **职责**：把「跑 bash」收成一个可被 exec 的成员对象。

## 二、self × 各维度（核心设计）

每个维度是 self 的一个**面**。terminal 的特殊形状：Data 为空，故只有 executable / readable 两面有实体，其余皆无或走默认。

### self × executable —— `run`（委托造 child process）
跑一段 bash 脚本，schema `{ code: string (required) }`；不改 self、无持久副作用，副作用 = `ctx.runtime.instantiate("_builtin/terminal/terminal_process", {code})` 造一个 child `terminal_process`（首次 exec 已在 child construct 内跑完、结果进其 history），返回创建提示串。runtime 句柄缺失则 fail-loud。LLM-only object method（无 UI 入口；人机分流移交 visible/server）。

### self × readable —— 投影成静态身份窗
投影成 `class:"terminal"`——渲染一段静态身份/用途文本（方法菜单靠 object method description 撑），window 声明 `object_methods:["run"]`、`window_methods:[]`、不随视角变化。无自定义 window method（无投影态可调）。

### self × construct —— 无（单例）
单例 object 即其唯一规范实例、由 id 直接寻址，不被 instantiate，故无 construct；「实例」语义由 child terminal_process 的 construct 承载。

### self × visible —— 无
自身无 UI（进程详情面板在 child 上），走系统默认。

### self × persistable —— 系统默认
Data 空，无可序列化实例态，走系统默认持久化。

## 三、children（命名空间从属、不继承 terminal）

children 从属于 terminal 命名空间（id 以 `_builtin/terminal/` 为前缀，物理 `terminal/children/terminal_process/`），但与 parent **无继承关系，仅从属命名空间**（见对象模型核心 9）。

### `_builtin/terminal/terminal_process`（kind=class，非单例）
bash 进程窗——`terminal.run` 造出的结果对象，一个 world 可有多个。

- **construct**：即 parent `run` 委托的目标——schema `{ code: string (required) }`；取 `ctx.thread` 必需、空 code fail-loud，跑一遍 bash、把结果作为 history 首条产出 `{ history: [record] }`。
- **Data**：`{ history: ProcessExecRecord[] }`——每次 exec 一段 bash 追加一条记录（`{ execId, language:"shell", code, output, ok, startedAt }`，类型 + 输出格式化是本 class 自有：`types.ts` 定义 `ProcessExecRecord`、`executable/exec-record.ts` 出 `formatShellResult` 等；与 interpreter_process 结构同构但各自独立，不再共享代码）。
- **object method**：`exec`（再跑一段 bash，追加 history 并 `ctx.reportDataEdit()` 上报 data edit）、`close`（关窗）。
- **window method**：`set_history_window`（`history_tail` / `history_start` / `history_end` 调 history 渲染视口——只动投影态 `ProcessWin`（historyViewport）、不碰 Data），实现在本 class 的 `readable/history.ts`；默认末 10 次 exec。
- **投影**：`class:"terminal_process"`，content = history 摘要按视口截取 + 最近一条 full output。
- **visible**：自定义详情面板 + diff（本 class 自有 `visible/index.tsx` / `visible/diff.tsx`）。**persistable**：无自定义（history 是纯 JSON，系统默认）。
- **bash 执行**：经 bash 子进程跑 `code`，cwd=进程 cwd、有 timeout，stdout/stderr/exitCode 格式化后入 history；env 透出 `OOC_SELF_DIR`（指向 session worktree 的 object 目录，让脚本可稳定定位 stone 目录）。

## 程序骨架（示意）

按 `object/knowledge/example.md` 的 ooc class 文件布局，给本家族两个 class 的后端程序骨架（design-level 示意、不必可编译；单例 `terminal` 无 construct，非单例 `terminal_process` 有 construct）。

### `terminal`（单例 tool-object）

```
terminal/
├── package.json          # ooc.kind=object（单例 object）
├── readable.md           # 静态身份名片
├── index.ts              # Class = { executable, readable }（无 construct）
├── types.ts              # Data = {}（空）
├── executable/index.ts   # object method: run
└── readable/index.ts     # 投影静态身份窗 + window decl
```

```json
// package.json —— 单例 tool-object，无 ooc.class（不继承任何 class）
{ "name": "@ooc/builtins/terminal", "type": "module",
  "ooc": { "objectId": "_builtin/terminal", "kind": "object" } }
```

```ts
// types.ts —— Data 为空（terminal 自身无业务数据）
export interface Data {}
```

```ts
// index.ts —— 单例 class 无 construct；只装配 executable / readable
import executable from "./executable/index.js"
import readable from "./readable/index.js"
import type { Data } from "./types.js"
export const Class: OocClass<Data> = { executable, readable }
```

```ts
// executable/index.ts —— object method: run（委托造 child terminal_process）
const runMethod: ObjectMethod<Data> = {
  name: "run",
  description: "Run a bash script; result appears as a terminal_process window.",
  schema: { args: { code: { type: "string", required: true, description: "待执行 bash 脚本" } } },
  exec: async (ctx, _self, args) => {
    if (!ctx.runtime) throw new Error("[terminal.run] runtime 句柄缺失")
    const id = await ctx.runtime.instantiate("_builtin/terminal/terminal_process", args)
    return `terminal_process 已创建（${id}）：bash 脚本已执行，结果进 history。`
  },
}
export default { methods: [runMethod] }
```

```ts
// readable/index.ts —— 投影静态身份窗（无 window method）
export default {
  readable: (_ctx, _self, _win) => ({ class: "terminal", content: "bash 终端：run 一段脚本即开一个进程窗。" }),
  window: [{ class: "terminal", object_methods: ["run"], window_methods: [] }],
}
```

### `terminal_process`（非单例进程 class）

```
terminal/children/terminal_process/
├── package.json          # ooc.kind=class（非单例模板）
├── index.ts              # Class = { construct, executable, readable }
├── types.ts              # Data = { history: ProcessExecRecord[] }
├── executable/index.ts   # object method: exec / close
└── readable/index.ts     # 投影 history 窗 + window method: set_history_window
```

```ts
// types.ts —— ProcessExecRecord 本 class 自有（与 interpreter_process 各自独立）
export interface ProcessExecRecord { execId: string; language: "shell"; code?: string; output: string; ok: boolean; startedAt: number }
export interface Data { history: ProcessExecRecord[] }
```

```ts
// index.ts —— 非单例 class 注册 construct（terminal.run 委托的目标）
export const Class: OocClass<Data> = {
  construct: {
    description: "Run a bash script; result appears as a new terminal_process window.",
    schema: { args: { code: { type: "string", required: true, description: "待执行 bash 脚本" } } },
    exec: async (ctx, args) => {
      if (!ctx.thread) throw new Error("[terminal_process] 缺少 thread context")
      const record = await runBashExec(ctx.thread, args.code)
      return { history: [record] }   // 首条 history = 首次 bash 结果
    },
  },
  executable, readable,
}
```

```ts
// executable/index.ts —— object method（改 self.history、有副作用）
const execMethod: ObjectMethod<Data> = {
  name: "exec",
  description: "Run another bash script in this terminal process; result appended to history.",
  schema: { args: { code: { type: "string", required: true, description: "待执行 bash 脚本" } } },
  exec: async (ctx, self, args) => {
    const record = await runBashExec(ctx.thread, args.code)
    self.history = [...self.history, record]
    await ctx.reportDataEdit?.()       // 主动上报 data 变更，触发持久化
    return undefined
  },
}
const closeMethod: ObjectMethod<Data> = { name: "close", description: "Close this terminal process window.", exec: () => undefined }
export default { methods: [execMethod, closeMethod] }
```

```ts
// readable/index.ts —— 投影 history 窗 + window method（只动投影态、不碰 Data）
export default {
  readable: (_ctx, self, win) => ({ class: "terminal_process", content: renderHistory(self.history, win) }),
  window: [{ class: "terminal_process", object_methods: ["exec", "close"], window_methods: [setHistoryWindowMethod] }],
}
// setHistoryWindowMethod + renderHistory 实现在本 class 的 readable/history.ts（与 interpreter_process 结构同构但各自独立）
```
