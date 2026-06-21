---
title: _builtin/filesystem — agent 组合持有的文件系统 tool-object（单例），方法造 file / search 窗
description: filesystem 家族单一权威，按 self × 维度铺陈——self（id _builtin/filesystem、ooc.kind=object、单例 tool-object、Data={} 空、被 agent 组合持有并 exec）；self×executable=grep/glob/open_file/write_file 四委托方法（造 children file/search）；self×readable=静态身份窗；self×construct/visible/persistable 皆无/默认；children file（非单例 class，reload/edit/close + set_viewport/set_range）、search（非单例 class，open_match/close + set_results_window）
activates_on:
  "object::root": "show_description"
---

# _builtin/filesystem

> agent 经组合持有（HAS-A）的**文件系统 tool-object**：把"对文件世界的操作"收成一组连贯 object method，每个方法委托 runtime 造出 file / search 子对象（context window）。对象模型（一切是 object、class=定义/object=实例、单例 vs 非单例、construct、object 经 `ooc.class` 继承一个 class、agent HAS-A 组合 tool-object、children 命名空间从属、object method vs window method）见 `object/self.md`（OOC 对象模型单一权威），本文不复述模型。

## 一、self（身份 / data）

- **id** `_builtin/filesystem`，**`ooc.kind=object`**；**单例 tool-object**：一个 world 一份文件系统，由唯一规范实例直接寻址、不被 instantiate；被多个 agent **组合持有（HAS-A）、被 exec 而非被 talk**。
- **Data = {}**——空：self 只承载身份 + 方法面，所有产物都是它造出的 children 对象。
- **职责**：对文件世界的统一接入面——grep/glob 搜索、open_file/write_file 打开/写文件，结果以 children 对象（search/file 窗）出现在 context。

## 二、self × 各维度（核心设计）

每个维度是 self 的一张**面**——身为 class 即天然具 readable/executable/visible/persistable 四面，加 `index.ts`（`export const Class = {construct?, executable, readable, persistable}`）+ `types.ts`（Data）收口程序入口。filesystem 的特殊形状：self 数据为空，故只有 executable / readable 两面有实体，其余皆无或走默认；`index.ts` 装配的 `Class` 只含 `{executable, readable}`、无 construct（单例）、无 persistable（无实例态）。

### self × executable —— object method（四个都是委托类）

四个方法都是**委托类**：自身不改 data、无副作用持久态，经 `ctx.runtime.instantiate(classId, args)` 造出 child 实例，返回提示文本告知 agent 子对象已造出；runtime 缺失则 fail-loud。缺必填参由各 method schema 的 `required` + `description` 引导。均是 **LLM-only object method**（无 UI 入口；人机分流移交 visible/server）。

- **`grep`** —— regex 搜内容，委托造 search 子对象（mode=grep）。
- **`glob`** —— glob 通配搜文件名，委托造 search 子对象（mode=glob）。
- **`open_file`** —— 打开文件为只读 file 子对象。
- **`write_file`** —— 整文件覆盖写（content 触发 file construct 的 write 分支）。

### self × readable —— 静态身份窗 + window method（无）

无自定义 window method（filesystem 无展示投影态，故投影态 `FilesystemWin = {}`）。恒投影成 `class:"filesystem"`、静态身份文本「文件系统」（object method description 已足够丰富，readable 不赘述）；window decl 展示四个 object method、`window_methods: []`。

### self × construct —— 无（单例）

单例 tool-object 即其唯一规范实例，由直接寻址使用、不 instantiate，故 `index.ts` 的 `Class` 不注册 construct。

### self × visible —— 无

无自定义（filesystem 本体不在控制面单独成页）。

### self × persistable —— 系统默认（Data 空）

走系统默认，Data 为空、无可序列化实例态，故 `Class` 不含自定义 persistable。

## 三、children（命名空间从属，id 前缀 `_builtin/filesystem/`）

children 从属于 filesystem 命名空间（id 以 `_builtin/filesystem/` 为前缀，物理 `filesystem/children/<child>/`），**仅命名空间从属、不继承 filesystem**（对象模型核心 8：children 不继承 parent）。每个 child 自身即一个完整 ooc class（四 facet + index.ts/types.ts）。

### `_builtin/filesystem/file`（kind=class，非单例）

文件窗。**construct** 按 args 分两支：带 `content:string` → write_file（写盘），否则 open_file（校验存在）；产出初始 Data `{path}`（path = 实际读写落点，含 worktree 重定向），失败 throw（runtime 不建窗）。读写落点的 worktree 版本化重定向（读写都重定向到 session/feat 分支 worktree、绝不裸碰 main）归 **persistable** 维度。

- **Data**：`{path:string}`。
- **object method**：`reload`（语义提示，render 每轮重读）、`edit`（基于 old→new 精确唯一替换，支持 `edits[]` 批量原子改）、`close`（关窗、不删盘文件）。
- **window method**：`set_viewport`（调渲染视口 line/column）、`set_range`（遗留，调 lines/columns 切片）；投影态 `FileWin = {viewport, lines?, columns?}` 与 Data 分离。
- **投影**：读 `self.path` → 按 viewport 行/列切片 + 兜底截断，`class:"file"`。
- **visible**：详情面板（path + 内容视图）+ loop 时间机 diff。

### `_builtin/filesystem/search`（kind=class，非单例）

搜索结果窗——把一次 glob/grep 结果以持久 object 留在 context，让 LLM 按 match index 引用而非从裸文本 re-parse。**construct**：grep（优先 rg、回退 JS）/ glob（区分由 args：带 path/glob/case_insensitive → grep，否则 glob），排序 + 截断到 200 条 → 返回纯 Data，失败 throw。

- **Data**：`{kind:"glob"|"grep", query, matches:SearchMatch[], truncated, searchRoot?}`；`SearchMatch = {index, path, line?, snippet?}`。
- **object method**：`open_match`（按 match index 对其路径造一个 file 窗，grep 命中附 ±40 行上下文）、`close`（关本 search 窗）。
- **window method**：`set_results_window`（调 matches 渲染视口 tail N / 固定区间）；投影态 `SearchWin = {resultsViewport?}`，默认末 50 条。
- **投影**：kind + query + searchRoot + matches（经 viewport 切片）→ `class:"search"`。
- **visible**：详情面板 + matches 按 path+line 配对 diff。

## 四、程序骨架（示意）

design-level 大概布局（不必可编译），对齐 `object/knowledge/example.md` 的逐文件 ooc class 布局。单例 tool-object：`index.ts` 的 `Class` 无 construct；非单例 children 各自注册 construct。

```
filesystem/
├── package.json          # ooc.kind=object（单例，无 ooc.class）
├── self.md               # 身份正文（"文件系统统一接入面"）
├── index.ts              # export const Class = { executable, readable }（无 construct/persistable）
├── types.ts              # Data = {}
├── executable/index.ts   # object method：grep / glob / open_file / write_file（委托 instantiate）
├── readable/index.ts     # 投影 class:"filesystem" + window decl（四 object_methods、无 window_method）
└── children/
    ├── file/             # 非单例 class：construct(open/write 分支) + reload/edit/close + set_viewport/set_range
    └── search/           # 非单例 class：construct(grep/glob) + open_match/close + set_results_window
```

### package.json —— ooc.kind / class

```json
{
  "name": "@ooc/builtins/filesystem",
  "type": "module",
  "ooc": { "objectId": "_builtin/filesystem", "kind": "object" }
}
```

单例 object：`ooc.kind="object"`、无 `ooc.class`（不经 `ooc.class` 继承任何 class，自持工具方法）。

### types.ts —— object data 结构

```ts
// filesystem 本体无业务数据：所有产物都是它造出的 children 对象。
export interface Data {}
```

### index.ts —— Class 装配（无 construct / 无 persistable）

```ts
import type { OocClass } from "<runtime>/runtime/ooc-class";
import executable from "./executable/index.ts";
import readable from "./readable/index.ts";
import type { Data } from "./types.ts";

// 单例 tool-object：无 construct（不被 instantiate）；无业务态：无 persistable。
export const Class: OocClass<Data> = { executable, readable };
```

### executable/index.ts —— object method（四委托方法）

```ts
import type { ExecutableContext, ObjectMethod } from "<runtime>/executable";
import type { Data } from "../types.ts";

const SEARCH_CLASS = "_builtin/filesystem/search";
const FILE_CLASS = "_builtin/filesystem/file";

const grep: ObjectMethod<Data> = {
  name: "grep",
  description: "Search file contents by regex; results appear as a search object.",
  schema: { args: { pattern: { type: "string", required: true }, path: { type: "string" } } },
  exec: async (ctx, _self, args) => {
    await ctx.runtime.instantiate(SEARCH_CLASS, { ...args, mode: "grep" }); // 委托造 search 子对象
    return `opened search (grep) for ${args.pattern}`;
  },
};

const glob: ObjectMethod<Data>     = { name: "glob",       /* …委托 instantiate(SEARCH_CLASS, {glob, cwd, mode:"glob"}) */ } as any;
const open_file: ObjectMethod<Data> = { name: "open_file", /* …委托 instantiate(FILE_CLASS, {path, lines?, columns?}) */ } as any;
const write_file: ObjectMethod<Data>= { name: "write_file",/* …委托 instantiate(FILE_CLASS, {path, content}) → file construct 走 write 分支 */ } as any;

export default { methods: [grep, glob, open_file, write_file] };
```

### readable/index.ts —— 投影 + window method（无 window method）

```ts
import type { ReadableContext, ReadableModule } from "<runtime>/readable";
import type { Data } from "../types.ts";

export interface FilesystemWin {} // 无展示投影态

const readable: ReadableModule<Data, FilesystemWin> = {
  readable: (_ctx, _self, _win) => ({ class: "filesystem", content: "文件系统" }),
  window: [{ class: "filesystem", object_methods: ["grep", "glob", "open_file", "write_file"], window_methods: [] }],
};

export default readable;
```

### children/file —— 非单例 class 骨架（含 construct + window method）

```ts
// children/file/index.ts
export const Class = {
  construct,   // open_file（校验存在）/ write_file（content→写盘）两分支 → 初始 Data {path}
  executable,  // reload / edit（old→new 精确唯一替换，支持 edits[] 原子批改）/ close
  readable,    // 投影 class:"file"（viewport 切片）+ window method set_viewport / set_range
};
// types.ts: export interface Data { path: string }
```

### children/search —— 非单例 class 骨架（含 construct + window method）

```ts
// children/search/index.ts
export const Class = {
  construct,   // grep（rg→JS 回退）/ glob（args 区分）→ 排序 + 截断 200 → Data
  executable,  // open_match（按 index 造 file 窗，grep ±40 行上下文）/ close
  readable,    // 投影 class:"search"（matches viewport 切片）+ window method set_results_window
};
// types.ts: export interface Data { kind: "glob"|"grep"; query: string; matches: SearchMatch[]; truncated: boolean; searchRoot?: string }
```
