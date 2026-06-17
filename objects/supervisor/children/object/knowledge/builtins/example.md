---
title: _builtin/example — 建 class 时照抄的最小样板 class（construct / object method / readable / persistable）
description: example 家族单一权威——以 self × 各维度透视：data={message,bumpCount} 的 self、readable 投影成单一 example 窗、executable 的 bump method、自定义 persistable 落 JSON、无 visible、非单例有 construct；它以最小代码量演示「身为 class 就有的四张 facet + construct」五处可自定义点，是 sibling example.md 逐文件骨架的可运行对照
activates_on:
  "object::root": "show_description"
---

# _builtin/example

> 建一个新 ooc class 时照抄的**最小可运行样板**：用最小代码量演示「身为 class 天然就有的四张 facet（readable / executable / visible / persistable）+ 非单例的 construct」这五处可自定义点。**非真实功能对象**——不被任何 agent 组合持有、不进任何业务闭环，唯一用途是给建 class 的作者照抄。
> 与 sibling `../example.md`（逐文件骨架设计稿）互为印证：`../example.md` 讲「新建一个 class 每个文件应该长什么样」，本 builtin 是那份骨架的可编译、可注册、可构造的对照——二者应保持一致、不矛盾。
> 对象模型本身（一切是 object、class 是定义 / object 是实例、四 facet、单例 / 非单例、construct、children 命名空间、投影）见 parent `object/self.md`，本文不复述；本文只从 **self × 各维度**透视。

## 一、self（身份 / data）

- **id `_builtin/example`，`ooc.kind=class`**——一份定义 / 模板。
- **不写 `ooc.class`**：example 自己就是一个 class，不经 `ooc.class` 去继承别的 class（class 不能继承 class）；要复用别处的程序，靠 import 目标 class export 的函数。`ooc.class` 只在 `kind=object` 时有意义（object 经它继承一个 class，单层），example 是 class、不用它。
- **四张 facet 是「身为 class 就有」**：example 天然由 readable / executable / visible / persistable 四个 facet + `index.ts`（`export const Class`）+ `types.ts`（Data 结构）构成——这四面不是从某个基类拿来的，而是 class 这个抽象自带的。
- **非单例 class**：在 `index.ts` 注册了 `construct`（槽名是 `construct` 不是 `constructor`），可按需造多个实例；每个实例投影为一个 example window。
- **角色**：纯样板 class——既非 agent（无 thinkable / talk / self.md 身份），也非被 agent 组合持有的单例 tool-object。
- **data（`types.ts`）= 这个 self 是什么**，只两字段：
  - `message: string` —— 要展示的文本（可多行）。
  - `bumpCount: number` —— 被 `bump` 累加的次数。
  - 窗信封字段（id / class / status …）与展示态（viewport）**不在 data**——data / 信封 / 投影态三分见 parent `object/self.md` 核心 1 / 4。

一句话职责：**用最小代码量同时演示 class 五处可自定义点（construct + 四 facet），供建 class 作者照抄。**

## 二、self × 各维度（核心设计）

### self × readable —— 投影成 context window

把 data 投影为单一 window class `"example"`，渲染 `<bump_count>` + `<message>`（message 按 viewport 切片、限长 8192 bytes）；该 window class 声明展示 `object_methods:["bump"]` + `window_methods:[set_viewport]`。
window method **`set_viewport`** 调整投影视口（line / column range）、返回新的不可变投影态 `ExampleWin = {viewport}`、**不碰 data**，演示 window method 四参签名 `(ctx, self, before, args)` + 返回新 window 状态对象；越界校验失败即 throw（fail-loud）。viewport 协议复用 `@ooc/core/readable/viewport`（DEFAULT_VIEWPORT / mergeViewport / applyViewport），不自造。

### self × executable —— object method

**`bump`** —— 累加 `self.bumpCount`、返回 `bumped → N`，演示 object method 三参签名 `(ctx, self, args)` + **可改 self / 可副作用**（无 args schema）。非 `for_ui_access`（LLM-only，无 UI 入口）。

### self × persistable —— 序列化（有自定义）

**有自定义**——`save` / `load` 把 data 以 JSON 落在系统解析好的实例目录 `ctx.dir/data.json`，作「自定义序列化」最小参照；不写此面则走系统默认持久化。落盘布局 / session-aware 路由权威归 persistable 维度，example 只演示「我接管自己的序列化目录与格式」。

### self × visible —— 无自定义

无自定义 → 系统默认（无 UI；样板不演示 visible）。

### self × construct —— 实例化（非单例）

**非单例**，在 `index.ts` 的 `Class.construct` 注册：args schema `{ message?: string }`，`exec(ctx, args)` 产出初始 data `{ message: args.message ?? "(empty)", bumpCount: 0 }`；trivial class 忽略 ctx（无需 thread / worktree / spawn）。单例 tool-object 无此面——由唯一规范实例直接寻址、被 agent 组合持有，不被 construct。

## 三、children

无。

## 四、程序骨架（示意）

> design-level 示意，对照 sibling `../example.md` 的逐文件布局 + `packages/@ooc/builtins/example/` 真实源码；不必逐字可编译。一个 class 天然由这几件构成：`package.json`（ooc 元信息）+ `types.ts`（Data）+ `index.ts`（`export const Class`）+ 四 facet 子模块（按需自定义，缺省走系统默认）。

### 文件布局

```
example/
├── package.json          # ooc 元信息：kind=class（不写 ooc.class —— class 不继承 class）
├── index.ts              # export const Class = { construct, executable, readable, persistable }
├── types.ts              # Data 结构
├── executable/index.ts   # object method —— bump（改 data / 有副作用）
├── readable/index.ts     # 投影成 example 窗 + window method set_viewport
└── persistable/index.ts  # 自定义序列化（save/load → ctx.dir/data.json）
                          # 无 visible/index.tsx —— 样板不演示 UI，走系统默认
```

### package.json —— `kind=class`，无继承

```json
{
  "name": "@ooc/builtins/example",
  "type": "module",
  "ooc": {
    "objectId": "_builtin/example",
    "kind": "class"
  }
}
```

- **`ooc.kind=class`** —— 这份 stone 是一份定义 / 模板（不是某个具体实例 object）。
- **无 `ooc.class`** —— class 不继承 class；要复用程序靠 import 目标 class 的 export。

### types.ts —— object data 结构

```ts
export interface Data {
  message: string;   // 要展示的文本（可多行）
  bumpCount: number; // 被 bump 累加的次数
}
```

### index.ts —— `export const Class`（装配 construct + 四 facet）

```ts
import executable from "./executable/index.ts";
import readable from "./readable/index.ts";
import persistable from "./persistable/index.ts";
import type { Data } from "./types.ts";

export const Class = {
  // 非单例 class 在此注册 construct（槽名是 construct 不是 constructor）。
  // 单例 tool-object 无 construct —— 由唯一规范实例直接寻址、被 agent 组合持有。
  construct: {
    description: "Create an example object showing a message (authoring reference).",
    schema: { message: { type: "string", description: "要展示的文本（可多行）" } },
    exec: (_ctx, args: { message?: string }): Data => ({
      message: typeof args.message === "string" ? args.message : "(empty)",
      bumpCount: 0,
    }),
  },
  executable,
  readable,
  persistable,
  // 无 visible —— 走系统默认（样板不演示 UI）。
};
```

### executable/index.ts —— object method（改 data / 有副作用）

```ts
import type { ExecutableContext, ObjectMethod } from "<runtime>/executable";
import type { Data } from "../types.ts";

const bumpMethod: ObjectMethod<Data> = {
  name: "bump",
  description: "Increment the example object's bump counter.",
  // 非 for_ui_access：LLM-only，无 UI 入口
  exec: (_ctx: ExecutableContext, self: Data) => {
    self.bumpCount = (self.bumpCount ?? 0) + 1;
    return `bumped → ${self.bumpCount}`;
  },
};

export default { methods: [bumpMethod] };
```

### readable/index.ts —— 投影成 window + window method（只动展示态）

```ts
import type { ReadableContext, WindowMethod } from "<runtime>/readable";
import type { Data } from "../types.ts";

// 投影态（与 Data 分离）：行/列 viewport
interface ExampleWin { viewport: Viewport; }

// window method：只返回新的投影态，不碰 Data、不产副作用
const setViewportMethod: WindowMethod<Data, ExampleWin> = {
  name: "set_viewport",
  description: "Adjust the rendered viewport (line/column range) for this example window.",
  schema: { line_start: { type: "number" }, line_end: { type: "number" } },
  exec: (_ctx, _self, before, args) => {
    const merged = mergeViewport(before?.viewport ?? DEFAULT_VIEWPORT, args);
    if (!merged.ok) throw new Error(`[example.set_viewport] ${merged.error}`); // fail-loud
    return { viewport: merged.viewport };
  },
};

export default {
  // 动态算出 class + content（message 经 viewport 切片 + 限长）
  readable: (_ctx: ReadableContext, self: Data, win: ExampleWin) => ({
    class: "example",
    content: [
      xmlElement("bump_count", {}, [xmlText(String(self.bumpCount ?? 0))]),
      xmlElement("message", {}, [
        xmlText(truncateBytes(applyViewport(self.message ?? "", win?.viewport ?? DEFAULT_VIEWPORT), 8192)),
      ]),
    ],
  }),
  window: [
    {
      class: "example",
      object_methods: ["bump"],          // window 可展示的 object methods
      window_methods: [setViewportMethod],
    },
  ],
};
```

### persistable/index.ts —— 自定义序列化（落 ctx.dir/data.json）

```ts
import type { PersistableContext } from "<runtime>/persistable";
import type { Data } from "../types.ts";

export default {
  save: async (ctx: PersistableContext, data: Data) => {
    // 自定义序列化目录与格式：把 Data 以 JSON 落在系统解析好的实例目录
    await writeFile(join(ctx.dir, "data.json"), JSON.stringify(data, null, 2), "utf8");
  },
  load: async (ctx: PersistableContext): Promise<Data | undefined> => {
    try { return JSON.parse(await readFile(join(ctx.dir, "data.json"), "utf8")) as Data; }
    catch { return undefined; }
  },
};
```
