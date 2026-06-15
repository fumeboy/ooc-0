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
├── package.json        # ooc 元信息：kind / class
├── self.md             # 身份正文
├── index.ts            # ooc class 后端程序路由（不包括 visible）
├── types.ts            # data 结构
├── executable/index.ts # object method —— 改数据 / 有副作用
├── readable/index.ts   # 投影成 context window + window method
├── visible/index.tsx   # 可选：UI
└── persistable/index.ts# 可选：自定义序列化
```

## package.json —— `kind` / `class`

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

> 组合（持有成员对象）**不在 `package.json` 声明**——agent 的成员（tool-object）经构造其 thread 对象时作为初始 context 提供（thread-as-object，见下「agent 变体」）。

## self.md —— 身份

加载为 LLM 的 instructions（唯一身份来源）。frontmatter 给元信息，正文用 Object 口吻陈述「我是谁、负责什么」：

```markdown
---
title: note
description: 一段可追加文本的便签窗
---
我是一个 note，持有一段文本 body。可被 append 追加内容、按 viewport 调整展示范围。
```

## types.ts —— object data 结构（非 window 数据结构）

```ts
export interface Data {
  content: string;
}
```

### index.ts —— 注册 ooc class 构造函数与自定义程序入口(readable/executable/persistable)

```ts
import executable from './executable/index.ts'
import readable from './readable/index.ts'
import persistable from './persistable/index.ts'
export const Class = {
  construct: {
    // 可选，仅非单例 ooc class 注册 construct（单例 class / 已是实例的 object 不需要）。
    // 槽位名是 `construct` 不是 `constructor` —— JS `Object.prototype.constructor` 会遮蔽后者
    // （`({}).constructor === Object` 恒真，单例就无法被识别），故统一用 `construct`。
    description: "...",
    schema: { /* ... */ },
    exec: (ctx, args) => {
      // ctx = ConstructorContext（实例尚未存在，无 self/object）；trivial class 忽略 ctx，
      // 需要 thread/worktree/spawn 的 class 从 ctx 取运行时环境、失败 throw。
      return {content: args.content}
    }
  },
  executable: executable,
  readable: readable,
  persistable: persistable,
}
```

## executable/index.ts —— object method

object method **可改 object 数据、可产生副作用**。

```ts
import type { ExecutableContext, ObjectMethod } from "<runtime>/executable";
import type { Data } from "../types.js";

const appendMethod: ObjectMethod = {
  name: 'appendMethod',
  description: "Append a line to the note.",
  schema: { text: { type: "string", required: true, description: "要追加的一行" } },
  exec: (ctx: ExecutableContext, self: Data, args: any) => {
    self.body = self.body ? `${self.body}\n${args.text}` : String(args.text);
    return `appended → ${self.body.length} chars`;
  },
};

export default {
  methods: [appendMethod]
}
```

## readable.ts —— 投影 + window method

readable 控制 object **怎么投影成 context window** 给 LLM 看（渲染什么、按视角算出什么 class）；并可提供 **window method** 调展示**程度**（详细/部分/总结/压缩）——window method **只动展示、不改业务数据、不产副作用**，与 object method 维度隔离（同名会 fail-loud）。

```ts
import type { ReadableContext, WindowMethod } from "<runtime>/readable";

interface Window {
  line_start: number
  line_end: number
}

// window method：只调展示视口（写 state.viewport），不碰 object data
export const setViewportMethod: WindowMethod = {
  name: 'setViewport',
  description: "Adjust the rendered viewport (line/column range).",
  schema: { line_start: { type: "number" }, line_end: { type: "number" } },
  exec: (ctx, self, before_win, args) => {
    /* window method 总是返回新的 window 状态对象，而不是修改原对象 */
    return {
      line_start: args.line_start,
      line_end: args.line_end,
    }
  },
};

export default {
  readable: (ctx, self, win) => {
    /* 允许动态计算 class 与 window content, 可以从 ctx 获取当前 thread 信息 */
    return {
      class: 'note',
      content: computeViewport(self.data.content, win.line_start, win.line_end)
    }
  },
  window: [
    /* 允许注册多个 window class */
    {
      class: 'note',
      object_methods: ['appendMethod'], /* 控制 window 可展示的 object methods */
      window_methods: [setViewportMethod]
    }
  ]
}
```


## persistable/index.ts —— 序列化（可选）

object 经 persistable 自定义自己的序列化目录与方式；不写则走系统默认持久化。

```ts
import type {Data} from '../types.ts'
import type { PersisitableContext } from "<runtime>/persistable";
export default {
  save: (ctx, data) => {
    /* ... */
  },
  load: (ctx) => {
    /* ... */
  }
}
```


## visible/index.tsx —— UI（可选）

object 经 visible 自定义给系统用户的 UI 界面。UI 可**请求** object 的 object method，但被请求的 method 须标记 **`for_ui_access`**。