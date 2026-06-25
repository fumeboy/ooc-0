---
title: ooc class 定义示例
description: 按 `../self.md` 的对象模型，给出新建一个 ooc class 的逐文件骨架；存量 builtin 代码可能过期，以本设计为准
activates_on:
  "object::root": "show_description"
---

# ooc class 定义示例

以一个最小 class `note`（持一段文本 body 的窗）贯穿示例。

## 文件布局

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
    "kind": "class",
    "class": "foo"
  }
}
```

- **`ooc.kind`** —— 这份 stone 是 **class**（一份定义/模板）还是 **object**（一个具体实例）。
- **`ooc.class`**（可选）—— 继承谁，值为父类 id，如 `"_builtin/agent"`。仅当 ooc.kind="object" 时有效。


## types.ts —— object data 结构

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


## visible/index.tsx + visible/server/index.ts —— UI 与 for-ui 服务端 API（可选）

object 经 visible 自定义给系统用户的 UI 界面（`visible/index.tsx`）。UI 经 callMethod 请求的是该 object **`visible/server/index.ts`** 提供的 for-ui server method（独立模块、由 `index.ts` 一并注册；ctx 有 world / session / object-self、**无 thinkloop thread**，改 object data → persistable.save 非版本化）——不是 executable object method（旧 `for_ui_access` 标记退役，人机分流移交 visible/server）。
