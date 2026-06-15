---
title: ooc class 定义示例（五件套逐文件：package.json / types.ts / executable / readable / visible）
description: 按 object-model.md 的对象模型，给出新建一个 ooc class 的逐文件骨架。设计权威是 object-model.md；存量 builtin 代码可能过期，以本设计为准
activates_on:
  "object::root": "show_description"
---

# ooc class 定义示例

> 本篇按 sibling **`object-model.md`**（对象模型单一权威）给出新建一个 ooc class 的逐文件骨架。
> **以设计为准**：仓库现有 builtin（`packages/@ooc/builtins/*`）部分接线已过期——它们 `package.json` 仍写
> `kind:"builtin"` / `type:"object"`、把 constructor 放在 `executable/`、用已废弃的 `instantiate_with_new_world`。
> 这些是历史存量，不照搬；下文字段/分层一律以 object-model.md 为准。代码片段是**示意骨架**、非逐字源码。

以一个最小 class `note`（持一段文本 body 的窗）贯穿示例。

## 文件布局

class 由五件套 + `types.ts`（+ 可选 `common/`）构成；缺省的维度不写文件：

```
note/
├── package.json        # ooc 元信息：kind / class / members
├── self.md             # 身份正文
├── types.ts            # data 结构；非单例 class 还在此导出 constructor
├── executable/index.ts # object method —— 改数据 / 有副作用
├── readable.ts         # 投影成 context window + window method
├── visible/index.tsx   # 可选：UI
└── persistable/index.ts# 可选：自定义序列化
```

## package.json —— `kind` / `class` / `members`

```json
{
  "name": "@ooc/builtins/note",
  "type": "module",
  "ooc": {
    "objectId": "_builtin/note",
    "kind": "class"
  }
}
```

- **`ooc.kind`** —— 这份 stone 是 **class**（一份定义/模板）还是 **object**（一个具体实例）。`note` 是定义 → `"class"`；它被构造出来的实例（运行时窗）是 `"object"`。
  - 单例 / 非单例是**另一条轴**：是否导出 constructor。`note` 有 constructor → **非单例 class**（按需造多个实例）。单例 class 无 constructor、有唯一规范实例。两者 `kind` 都是 `"class"`。
- **`ooc.class`**（可选）—— 继承谁，值为父类 id，如 `"_builtin/agent"`；不写则隐式继承基类。是**单链**继承。
- **`ooc.members`**（可选）—— 组合持有哪些成员对象（string[]，见下「agent 变体」）。

## self.md —— 身份

加载为 LLM 的 instructions（唯一身份来源）。frontmatter 给元信息，正文用 Object 口吻陈述「我是谁、负责什么」：

```markdown
---
title: note
description: 一段可追加文本的便签窗
---
我是一个 note，持有一段文本 body。可被 append 追加内容、按 viewport 调整展示范围。
```

## types.ts —— data 结构 + constructor

data 结构定义 object 运行时数据的类型；**非单例 class 的 constructor 也在此导出**（构造一个新 object 实例）。业务数据与展示状态物理分离——展示态归 `state`，由 window method 读写，object method 不碰。

```ts
import type { BaseContextWindow } from "<runtime>/types";

export interface NoteWindow extends BaseContextWindow {
  class: "note";
  status: "open" | "closed";
  body: string;            // 业务数据：object method 读写
  // 展示状态（viewport 等）归 state，readable 的 window method 读写
}

// 非单例 class 的 constructor：产出一个新 object 实例。
export function createNote(args: { body?: string }): NoteWindow {
  return {
    id: generateWindowId("note"),
    class: "note",
    status: "open",
    title: "note",
    body: args.body ?? "",
    // …继承 BaseContextWindow 的其余字段
  };
}
```

## executable/index.ts —— object method

object method **可改 object 数据、可产生副作用**。`ctx.self` 是当前 object，`ctx.args` 是入参；`schema` 声明参数。

```ts
import type { ObjectMethod } from "<runtime>/method-types";
import type { NoteWindow } from "../types.js";

export const appendMethod: ObjectMethod = {
  description: "Append a line to the note.",
  schema: { args: { text: { type: "string", required: true, description: "要追加的一行" } } },
  exec: (ctx) => {
    const self = ctx.self as NoteWindow;
    self.body = self.body ? `${self.body}\n${ctx.args.text}` : String(ctx.args.text);
    return `appended → ${self.body.length} chars`;
  },
};
```

## readable.ts —— 投影 + window method

readable 控制 object **怎么投影成 context window** 给 LLM 看（渲染什么、按视角算出什么 class）；并可提供 **window method** 调展示**程度**（详细/部分/总结/压缩）——window method **只动展示、不改业务数据、不产副作用**，与 object method 维度隔离（同名会 fail-loud）。

```ts
import type { RenderContext } from "<runtime>/registry";
import type { WindowMethod } from "<runtime>/window-method";
import { xmlElement, xmlText, applyViewport, windowSetViewport, type XmlNode } from "<runtime>/xml";
import type { NoteWindow } from "./types.js";

// 把 note 渲染进 LLM context。
export function readable(ctx: RenderContext): XmlNode[] {
  const w = ctx.window as NoteWindow;
  const body = applyViewport(w.body, w.state?.viewport);
  return [xmlElement("note", {}, [xmlText(body)])];
}

// window method：只调展示视口（写 state.viewport），不碰 body。
export const setViewportMethod: WindowMethod = {
  kind: "window",
  description: "Adjust the rendered viewport (line/column range).",
  schema: { args: { line_start: { type: "number" }, line_end: { type: "number" } } },
  exec: (ctx) => windowSetViewport(ctx, "note"),
};
```

## 注册 —— 一处声明（当前 runtime 接线）

把各维度声明在一处注册进 runtime（注册机制属 executable/runtime 维度的实现细节，随实现演进）：executable（object method + 把 `createNote` 接成 constructor）+ readable（readable + window method）一处合一。

```ts
import { builtinRegistry } from "<runtime>/registry";
import { appendMethod } from "./executable/index.js";
import { readable, setViewportMethod } from "./readable.js";
import { createNote } from "./types.js";

builtinRegistry.registerWindowClass({
  type: "note",
  methods: {
    append: appendMethod,
    note: { kind: "constructor", exec: (ctx) => ({ ok: true, window: createNote(ctx.args) }) },
  },
  readable,
  windowMethods: { set_viewport: setViewportMethod },
});
```

## visible/index.tsx —— UI（可选）

object 经 visible 自定义给系统用户的 UI 界面。UI 可**请求** object 的 object method，但被请求的 method 须标记 **`for_ui_access`**。不写则无自定义 UI。

## persistable/index.ts —— 序列化（可选）

object 经 persistable 自定义自己的序列化目录与方式；不写则走系统默认持久化。

---

## 变体：单例 class（tool-object）

无 constructor、有唯一规范实例（被 agent 组合持有、by-reference 注入）。只声明自己的工具 method，不被 talk、不跑 thinkloop（**不是 Agent**）。`package.json` 仍 `kind:"class"`；省去 `types.ts` 的 constructor。

## 变体：agent class

agent = 继承 object base class 的 ooc class，在 readable/executable/visible/persistable 之上额外具备 thinkable/collaborable/reflectable，并持 **`talk`** object method（执行即开一条 thread 跑 thinkloop）。

```json
{
  "ooc": {
    "objectId": "_builtin/my_agent",
    "kind": "class",
    "class": "_builtin/agent",
    "members": ["filesystem", "terminal", "knowledge_base"]
  }
}
```

- **`class`**：继承 `_builtin/agent` 得 agency（talk/…）。
- **`members`**：经组合（HAS-A）持有 tool-object 成员；成员作为可 exec 的窗注入 context（详见 `class/self.md`「组合」段）。
