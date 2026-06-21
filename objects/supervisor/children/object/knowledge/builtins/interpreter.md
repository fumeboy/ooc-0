---
title: interpreter — ts/js 解释器 tool-object（self × 各维度：run → interpreter_process sandbox+history）
description: _builtin/interpreter 家族单一权威——从 self × 各维度看：self 是空 data 的单例 tool-object，被 agent 组合持有并 exec；executable=run（委托造 child），readable=静态身份窗，construct/visible/persistable 无；child interpreter_process 是非单例 class（ts/js sandbox + history + 注入 self）
activates_on:
  "object::root": "show_description"
---

# interpreter

> ts/js 解释器 tool-object 家族：parent `interpreter` 的 self 把「跑 ts/js 脚本」收成一个 `run` 方法面，委托造 child `interpreter_process`（一段 sandbox 进程 + exec history）。
> 同形姊妹 `terminal`（`_builtin/terminal`，跑 bash 子进程）几乎完全同构——进程窗 history 结构/渲染/viewport 两者结构同构但各自独立（已不再共享 `_shared`，各 class 自带 `readable/history.ts` + `transcript-viewport.ts` + `executable/exec-record.ts`），见 terminal.md。对象模型（class/object、单例/非单例、construct、组合持有、children 命名空间）见 object 维度 `self.md`（《OOC 对象模型》），本文不复述。

## 一、self（身份 / data）

- **id** `_builtin/interpreter`；**`ooc.kind=object`**；**单例 tool-object**——一个 world 一份、由唯一规范实例直接寻址，被 agent **组合持有（HAS-A）、被 exec 而非被 talk**。自身只持工具方法、无业务数据。
- **Data = {}**（空）——self 只承载身份 + 一个方法面，状态全在它造出的 child `interpreter_process` 上。
- **职责**：把「在隔离 sandbox 里跑一段 ts/js 脚本」收成一个 `run` 方法。

## 二、self × 各维度（核心设计）

interpreter 的形状：self 数据为空，故只有 executable / readable 两面有实体，construct/visible/persistable 皆无或走系统默认。

### self × executable —— `run`（委托造 child process）
参数 `{ language: "ts"|"js"(enum,required), lang?: 别名, code: string(required) }`；委托 `ctx.runtime.instantiate("_builtin/interpreter/interpreter_process", {language, code})` 造一个 interpreter_process（首段脚本在 child construct 内跑完、结果进 history），返回新进程创建提示文本。不改 self；runtime 缺失则 fail-soft 返回提示。LLM-only object method（无 UI 入口；人机分流移交 visible/server）。

### self × readable —— 投影成静态身份窗
恒投影成 `class:"interpreter"`、content 极简「解释器」（方法菜单靠 object method description 撑），window 仅声明 `object_methods:["run"]`、不随视角变化。无自定义 window method——无展示投影态（`InterpreterWin = {}`）。

### self × construct —— 无（单例）
单例 tool-object 即其唯一实例，不 instantiate、无 construct；其「实例」语义由 child interpreter_process 的 construct 承载。

### self × visible —— 无
自身无 UI（进程详情面板在 child 上），走系统默认。

### self × persistable —— 系统默认
data 空，无自定义序列化。

## 三、children（命名空间从属、不继承 interpreter）

children 从属于 interpreter 命名空间（id 以 `_builtin/interpreter/` 为前缀，物理 `interpreter/children/interpreter_process/`），与 parent 仅命名空间从属、无继承关系（见 object 维度《OOC 对象模型》核心 8）。

### `_builtin/interpreter/interpreter_process`（kind=class，非单例）
一段 ts/js 解释进程窗——`interpreter.run` 造出的结果对象，一个 world 可有多个。

- **construct**：即 parent `run` 委托的目标——取 `ctx.thread` 必需、`normLang(args)` + `code` 必需，跑首段脚本，返回 `{ history: [首条 record] }`；缺 thread context 或缺 language/code 则 fail-loud。
- **data**：`Data = { history: ProcessExecRecord[] }`（每次 exec 一条）。`ProcessExecRecord`（execId/language:"ts"|"js"/code/output/ok/startedAt）本 class 自有，定义在 `types.ts`；与 terminal_process 结构同构但各自独立，不再共享代码。
- **object method**：`exec`（在已开窗的进程内再跑一段 ts/js，结果 push 进 `self.history` 并 `ctx.reportDataEdit()` 通知重持久化）、`close`（关窗，无副作用、由 runtime 处置信封 status）。
- **window method**：`set_history_window`——调 history 视口（tail N / 固定 range），返回新 ProcessWin、不碰 data；实现在本 class 的 `readable/history.ts`（与 terminal_process 同构但独立），默认末 10 次 exec。
- **投影**：`class:"interpreter_process"`，content 渲染 history 摘要（经 viewport 切片）+ 最近一条 full output（`renderProcessHistory`）。
- **visible**：自定义详情面板 + diff（本 class 自有 `visible/index.tsx` / `visible/diff.tsx`）。**persistable**：无自定义，系统默认（history 是纯 JSON）。
- **sandbox 与注入的 `self`**：ts/js 写 tmp `.mjs` → in-process import 执行，console 进 stdout、`_result_` 进 returnValue。脚本内注入的 `self`（`createInterpreterSelf`，`executable/self.ts`）可 `callMethod`（经 `ctx.runtime.callMethod` 跨窗调当前 thread 内任意 object method）/ `getData`/`setData`（flow 级 `data.json`）/ `getThreadLocal`/`setThreadLocal`（线程内跨 exec 共享、不持久化）；无 persistence / 无 runtime 时对应能力降级或 fail-loud。

## 程序骨架（示意）

> design-level 示意，文件布局对齐 object 维度 `knowledge/example.md`。interpreter 是单例 tool-object（无 construct）；非单例 child interpreter_process 才注册 construct。

### parent `interpreter`（单例 tool-object）

```jsonc
// package.json
{
  "name": "@ooc/builtins/interpreter",
  "type": "module",
  "ooc": { "objectId": "_builtin/interpreter", "kind": "object" }
}
```

```ts
// types.ts —— self 无业务数据
export interface Data {}
```

```ts
// index.ts —— 单例 tool-object：无 construct，只收口 executable / readable
import executable from "./executable/index.ts";
import readable from "./readable/index.ts";
export const Class = { executable, readable };
```

```ts
// executable/index.ts —— object method：run（委托造 child）
const runMethod = {
  name: "run",
  description: "Run a ts/js snippet; result appears as an interpreter_process window.",
  schema: { args: {
    language: { type: "string", required: true, enum: ["ts","js"], description: "ts / js" },
    lang:     { type: "string", required: false, description: "language 的别名" },
    code:     { type: "string", required: true, description: "待执行 ts/js 脚本" },
  } },
  exec: async (ctx, _self, args) => {
    if (!ctx.runtime) return "[run] runtime 句柄缺失，无法实例化 interpreter_process。";
    const id = await ctx.runtime.instantiate("_builtin/interpreter/interpreter_process", {
      language: args.language ?? args.lang, code: args.code,
    });
    return `interpreter_process 已启动（${id}）。`;
  },
};
export default { methods: [runMethod] };
```

```ts
// readable/index.ts —— 投影成静态身份窗（无 window method）
export interface InterpreterWin {}
export default {
  readable: (_ctx, _self, _win) => ({ class: "interpreter", content: "解释器" }),
  window: [{ class: "interpreter", object_methods: ["run"], window_methods: [] }],
};
```

### child `interpreter_process`（非单例 class）

```ts
// index.ts —— 非单例 class：注册 construct（跑首段脚本）+ executable + readable
export const Class = {
  construct: {
    description: "Run a ts/js snippet; result appears as a new interpreter_process window.",
    schema: { args: {
      language: { type: "string", required: true, enum: ["ts","js"] },
      lang:     { type: "string", required: false },
      code:     { type: "string", required: true },
    } },
    exec: async (ctx, args) => {
      const thread = ctx.thread;            // 实例尚未存在，从 ctx 取运行时环境
      if (!thread) throw new Error("[interpreter_process] 缺少 thread context。");
      const record = await runInterpreterExec(thread, normLang(args), args.code, ctx.runtime);
      return { history: [record] };          // → 初始 Data
    },
  },
  executable, readable,
};
```

```ts
// executable/index.ts —— object method：exec（追加 history）/ close（关窗）
const execMethod = {
  name: "exec",
  description: "Run another ts/js snippet in this interpreter process; result appended to history.",
  schema: { args: { language:{type:"string",required:true,enum:["ts","js"]}, code:{type:"string",required:true} } },
  exec: async (ctx, self, args) => {
    const record = await runInterpreterExec(ctx.thread, normLang(args), args.code, ctx.runtime);
    self.history.push(record);
    await ctx.reportDataEdit?.();            // 主动报告 data 变更 → runtime 触发持久化
  },
};
const closeMethod = { name: "close", description: "Close this interpreter process window.", exec: () => undefined };
export default { methods: [execMethod, closeMethod] };
```

```ts
// readable/index.ts —— 投影 history + window method（复用 _shared）
export default {
  readable: (_ctx, self, win) => ({ class: "interpreter_process", content: renderProcessHistory(self.history, win) }),
  window: [{
    class: "interpreter_process",
    object_methods: ["exec", "close"],
    window_methods: [setHistoryWindowMethod], // 本 class readable/history.ts 自有；tail N / 固定 range
  }],
};
```
