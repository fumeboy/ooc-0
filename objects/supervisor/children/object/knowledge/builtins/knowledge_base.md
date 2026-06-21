---
title: knowledge_base — agent 持有的知识库 tool-object（open_knowledge 把一篇 doc pin 成 knowledge 窗）
description: builtin 家族 knowledge_base 的单一权威——以 self × 各维度 透视：self 是空 data 的纯委托单例 object（kind=object）；self × executable 唯一 object method open_knowledge 委托 child knowledge 的 construct 实例化一个 knowledge context window；child knowledge 是非单例 class，其实例 = 一个 knowledge 窗，按 trigger 激活进 context（激活机制见 thinkable）
activates_on:
  "object::root": "show_description"
---

# knowledge_base

> agent 组合持有的单例 tool-object 成员——可查询的知识存储；`open_knowledge` 把一篇 knowledge doc 作为 `knowledge` 窗引入 context。
> 对象模型（class/object、单例/非单例、construct、继承=object 经 `ooc.class` 继承单层 class、组合 HAS-A、children 命名空间从属、self 与各维度的关系）见 class `object/self.md`，本文不复述。

## 一、self（身份 / data）

- **id `_builtin/knowledge_base`**，**`ooc.kind=object`**——**单例 tool-object**（与 filesystem/interpreter/terminal 同类）。身为 object 天然有 readable/executable/visible/persistable 四个 facet + `index.ts`（`export const Class = {executable, readable}`）+ `types.ts`（Data）构成，没有任何基类、不在任何继承链上。
- **单例 tool-object**（无 construct，一个 world 一份知识库）：不被构造出新实例、由唯一规范实例直接寻址，被 agent **组合持有(HAS-A)** 并 exec。
- **data 空**——无业务字段（单例纯委托 tool-object，`Data = {}`）。
- **一句话职责**：agent 的知识存储入口，提供 `open_knowledge` 把知识索引里的一篇 doc 显式 pin 成一个 `knowledge` 窗、使其常驻 context。它自身是入口/委托类，「一篇知识 = 一个窗」由 child `knowledge` 承载——故 store 成员名为 `knowledge_base`、窗类型名为 `knowledge`。

## 二、self × 各维度（核心设计）

### self × executable —— 唯一一个委托型 object method

`open_knowledge`——按 path pin 一篇 knowledge doc 进 context。**纯委托**：经 `ctx.runtime.instantiate('_builtin/knowledge_base/knowledge', args)` 实例化一个 child `knowledge`（args 含 path）并返回其 id，path 解析/校验下放给 child 的 construct。LLM-only object method（无 UI 入口；人机分流移交 visible/server）。

### self × readable —— 投影成静态身份窗

`class: "knowledge_base"`，content 只渲染一段身份/用途说明；window 声明 `object_methods: ["open_knowledge"]`。**window method 无**（tool-object 成员不持展示态，投影态 `Win = {}`）。

### self × construct —— 无（单例）

一个 world 一份知识库，不在 `index.ts` 注册 construct，不被构造出新实例。

### self × visible —— 默认

无自定义 UI。

### self × persistable —— 默认

无自定义序列化（走系统默认）。

## 三、children

children = 命名空间从属（id 前缀 `knowledge_base/knowledge`、物理 `knowledge_base/children/knowledge/`），与 parent 无继承关系。

### `_builtin/knowledge_base/knowledge`（class，知识条目窗类型）

- **self**：`ooc.kind=class`，**非单例**（有 construct）；命名空间从属 knowledge_base。data：`path`（索引路径，不带 .md）+ `source`（`explicit`/`protocol`/`activator`/`relation` 四类来源，缺省 explicit）+ `body`（合成来源自带正文）+ `presentation`（`full`/`summary`）+ `description`。**职责**：一篇 knowledge 文本作为 context window 的形态——其实例即一个 `knowledge` 窗（注册一个窗类型 ≡ 注册一个非单例 class）；按 trigger 激活进 context、完成即卸载（激活机制归 thinkable，见 `thinkable/knowledge/knowledge-activation.md`）。
- **self × construct**（`open_knowledge` 的真正实现）：args `{path}`；从 `ctx.thread` 取 persistence、经知识索引校验 path 存在（不存在/缺 path 均 fail-loud），产出 `{path, source:"explicit"}` 初始 data。
- **self × executable**：`reload`（loader 按 mtime 自动失效，此为语义提示 no-op）、`close`（关闭 explicit 窗；protocol/activator 来源不可 close）。
- **self × readable**：`class:"knowledge"`，按 source 分支渲染（protocol/activator(full) 直渲 body；activator(summary) 仅 description；explicit 回退知识索引 loader 拉正文），正文按 viewport 切片 + 8KB 截断。window method `set_viewport`——只调投影态 `win.viewport`，不碰 data、不产副作用。
- **self × visible**：自定义详情面板（path/source/presentation/description + markdown body）+ frontmatter/body 字段级 diff（`visible/diff.tsx`）。
- **self × persistable**：默认（explicit 来源持久化、合成来源不持久化由 data.source 区分，走系统默认序列化）。

## 四、程序骨架（示意）

> design-level 示意，文件布局参照 class `object/knowledge/example.md`。单例 tool-object `knowledge_base` **无 construct**；非单例 child `knowledge` 在 `index.ts` 注册 construct。method 名为本 builtin 真实方法名。

### `knowledge_base/`（单例 tool-object）

```
knowledge_base/
├── package.json          # ooc.objectId=_builtin/knowledge_base, ooc.kind=object
├── types.ts              # Data = {}（无业务字段）
├── index.ts              # export const Class = { executable, readable }（无 construct）
├── executable/index.ts   # object method: open_knowledge
├── readable/index.ts     # 投影成身份窗
└── children/knowledge/   # 非单例 child（见下）
```

```json
// package.json
{ "name": "@ooc/builtins/knowledge_base", "type": "module",
  "ooc": { "objectId": "_builtin/knowledge_base", "kind": "object" } }
```

```ts
// types.ts —— 单例纯委托 tool-object，无业务字段
export interface Data {}
```

```ts
// index.ts —— 单例：装配 executable + readable，不注册 construct
import executable from './executable/index.ts'
import readable from './readable/index.ts'
export const Class = { executable, readable }
```

```ts
// executable/index.ts —— 唯一 object method：纯委托实例化 child
const openKnowledge: ObjectMethod<Data> = {
  name: 'open_knowledge',
  description: 'Pin a knowledge doc by path so it stays visible in context.',
  schema: { path: { type: 'string', required: true, description: 'knowledge 索引路径（不带 .md）' } },
  exec: async (ctx, _self, args) => {
    const id = await ctx.runtime.instantiate('_builtin/knowledge_base/knowledge', args)
    return `opened knowledge → ${id}`
  },
}
export default { methods: [openKnowledge] }
```

```ts
// readable/index.ts —— 投影成身份窗；无投影态、无 window method
export default {
  readable: (_ctx, _self, _win) => ({
    class: 'knowledge_base',
    content: [/* about: 可查询知识存储，open_knowledge 把一篇 doc 引入 context */],
  }),
  window: [{ class: 'knowledge_base', object_methods: ['open_knowledge'], window_methods: [] }],
}
```

### `knowledge_base/children/knowledge/`（非单例 class，一篇知识 = 一个窗）

```
children/knowledge/
├── package.json          # ooc.objectId=_builtin/knowledge_base/knowledge, ooc.kind=class
├── types.ts              # Data = { path, source?, body?, presentation?, description? }
├── index.ts              # export const Class = { construct, executable, readable }
├── executable/index.ts   # object method: reload / close（语义提示 no-op）
├── readable/index.ts     # 投影 + window method: set_viewport
└── visible/index.tsx     # 详情面板 + visible/diff.tsx 字段级 diff
```

```ts
// types.ts
export interface Data {
  path: string
  source?: 'explicit' | 'protocol' | 'activator' | 'relation'
  body?: string
  presentation?: 'full' | 'summary'
  description?: string
}
```

```ts
// index.ts —— 非单例：注册 construct（open_knowledge 的真正实现）
import executable from './executable/index.ts'
import readable from './readable/index.ts'
export const Class = {
  construct: {
    description: 'Explicitly pin a knowledge doc by path so it stays visible in context.',
    schema: { path: { type: 'string', required: true } },
    exec: async (ctx, args) => {
      const path = String(args.path ?? '')
      if (!path) throw new Error('[open_knowledge] 缺少 path。')
      // 经 ctx.thread.persistence 取知识索引校验 path 存在，不存在则 fail-loud
      return { path, source: 'explicit' }
    },
  },
  executable,
  readable,
}
```

```ts
// executable/index.ts —— 语义提示 no-op（loader 自动失效 / runtime 在窗层处理 close）
const reload: ObjectMethod<Data> = { name: 'reload', description: '...', exec: () => undefined }
const close: ObjectMethod<Data> = { name: 'close', description: '...', exec: () => undefined }
export default { methods: [reload, close] }
```

```ts
// readable/index.ts —— 投影 + window method set_viewport（只动 win.viewport）
export interface KnowledgeWin { viewport: Viewport }
const setViewport: WindowMethod<Data, KnowledgeWin> = {
  name: 'set_viewport',
  description: 'Adjust the viewport rendered for this knowledge window.',
  exec: (_ctx, _self, before, args) => ({ viewport: mergeViewport(before.viewport, args) }),
}
export default {
  readable: async (ctx, self, win) => ({
    class: 'knowledge',
    content: [/* path/source/presentation/description + 正文（viewport 切片 + 8KB 截断；explicit 回退 loader） */],
  }),
  window: [{ class: 'knowledge', object_methods: ['reload', 'close'], window_methods: [setViewport] }],
}
```
