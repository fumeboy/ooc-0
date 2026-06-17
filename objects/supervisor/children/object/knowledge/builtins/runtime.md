---
title: _builtin/runtime — agent 持有的对象世界 tool-object（单例），方法操纵对象世界语义
description: runtime 家族单一权威，按 self × 维度铺陈——self（id _builtin/runtime、单例 tool-object、Data={} 空、无 construct）；self×executable=唯一方法 create_object（建新对象骨架落 session worktree、写盘委派 persistable）；self×readable=静态身份窗；self×construct/visible/persistable 皆无/默认；无 children；命名辨析 _builtin/runtime ≠ ctx.runtime
activates_on:
  "object::root": "show_description"
---

# _builtin/runtime

> agent 经组合持有的**对象世界 tool-object**：把「agent 操纵对象世界」的系统级原语收成一组连贯 object method——当前唯一 `create_object`（建一个全新 OOC Object 的骨架落 session worktree）。对象模型（class 四 facet、单例 vs 非单例、object 经 `ooc.class` 继承一个 class、HAS-A 组合、children 命名空间、object method vs window method）见 `object/self.md`，本文不复述模型。

## 一、self（身份 / data）

- **id** `_builtin/runtime`，**kind = class**；**单例 tool-object**：一个 world 一份，由唯一规范实例直接寻址，被多个 agent **组合持有(HAS-A)、被 exec 而非被 talk**，不跑 thinkloop。
- **Data = {}**——空：单例工具对象无业务运行时数据；窗信封字段（id/class/status）由 WindowManager 管理，不在 Data 内。
- **职责**：对**对象世界语义**的统一接入面——当前仅 `create_object`，是后续对象世界元能力（生命周期、沉淀治理）的归集点。区别于 `filesystem`（操作字节层文件）：runtime 操作的是对象世界语义，是元能力面。

> **命名辨析**：本 builtin `_builtin/runtime` ≠ ExecutableContext 上的 `ctx.runtime`——后者是 WindowManager 句柄（instantiate/close 实例信封），同名不同物。

## 二、self × 各维度（核心设计）

每个维度是 self 的一个**面**——「身为 class 就有」readable / executable / visible / persistable 四面，不从任何基类继承而来。runtime 的特殊形状：self 数据为空，故只有 executable / readable 两面有实体，其余皆无或走默认。

### self × executable —— object method（唯一一个，委托类）

- **`create_object`**（**未标 `for_ui_access`** → 仅 LLM 可调）—— scaffold 一个全新 OOC Object 的骨架（`package.json` + `self.md` + `readable.md`[ + `knowledge/`]）落**当前业务 session 的 worktree**。
  - **args**：`objectId`(必填) / `selfMd`(必填全文) / `readableMd`(必填全文) / `knowledge`(可选 `{filename→content}`)。
  - **契约**：从 `ctx.thread.persistence` 取 `{baseDir, sessionId, objectId(author)}`；缺 thread / 缺 persistence / 非业务 session（super 或空 session）→ fail-loud 返回 `[create_object] …` 文案，不静默。
  - **副作用边界**：只落 session worktree、**不 commit**；本 session 内当场可用（靠 session-aware 读），main 不变、别 session 读不到。**session 永不合入 main**——进 canonical 走独立 feat-branch PR（reflectable 通道）。
  - runtime 只做参数校验 + 委派，写盘原语由 **persistable** 实现（`createObjectInSession`），见 persistable `self.md`「持久层三层级 / stones-flows-pools」「持久化逻辑可自定义」两条。

### self × readable —— 静态身份窗 + window method（无）

恒投影成单一 window class `runtime`，渲染静态 `<about>` 身份/用途文本（系统级接口、create_object 落 session worktree）；window decl 展示唯一 object method（`object_methods: ["create_object"]`）。**无 window method**——runtime 无投影态（无 viewport 等展示态），window 状态结构为空。

### self × construct —— 无（单例）

单例工具对象，由唯一规范实例直接寻址、被 agent 组合持有，不被 construct 出新实例（`index.ts` 的 `Class` 不注册 construct）。

### self × visible —— 无

无自定义 UI（runtime 本体不在控制面单独成页）。

### self × persistable —— 系统默认（Data 空）

走系统默认；Data 为空、无可序列化实例态；作为成员窗注入时本就 transient、不落盘。

## 三、children

无。

## 程序骨架（示意）

> 参照 `object/knowledge/example.md` 的逐文件布局。design-level 示意、不必可编译。runtime 是**单例 tool-object**：`index.ts` 的 `Class` 不带 `construct`；只有 executable / readable 两面。

### package.json —— `ooc.kind` / `ooc.class`

```json
{
  "name": "@ooc/builtins/runtime",
  "type": "module",
  "ooc": {
    "objectId": "_builtin/runtime",
    "kind": "class"
  }
}
```

- `ooc.kind="class"`：这份 stone 是一份定义；它是单例 tool-object（object 即 class），不被 construct、不被继承。
- 无 `ooc.class`——runtime 不经 `ooc.class` 继承任何 class（agent 持有它靠 HAS-A 组合，不是继承）。

### types.ts —— object data 结构（空）

```ts
// 单例工具对象无业务运行时数据；窗信封字段由 WindowManager 管理，不在 Data 内。
export interface Data {}
```

### index.ts —— ooc class 后端程序路由（无 construct）

```ts
import type { OocClass } from "<runtime>/ooc-class";
import executable from "./executable/index.ts";
import readable from "./readable/index.ts";
import type { Data } from "./types.ts";

// 单例 tool-object：不注册 construct（不被实例化），只装配 executable / readable 两面。
export const Class: OocClass<Data> = {
  executable,
  readable,
};
```

### executable/index.ts —— object method（唯一：create_object）

```ts
import type { ExecutableContext, ObjectMethod } from "<runtime>/executable";
import { createObjectInSession } from "<runtime>/persistable";
import type { Data } from "../types.ts";

const createObjectMethod: ObjectMethod<Data> = {
  name: "create_object",
  description:
    "Scaffold a brand-new OOC Object (package.json + self.md + readable.md) in the session worktree.",
  // 未标 for_ui_access —— 仅 LLM 可调。
  schema: {
    objectId:   { type: "string", required: true,  description: "新对象 id" },
    selfMd:     { type: "string", required: true,  description: "新对象 self.md 全文" },
    readableMd: { type: "string", required: true,  description: "新对象 readable.md 全文" },
    knowledge:  { type: "object", required: false, description: "可选 seed knowledge { filename → content }" },
  },
  exec: async (ctx: ExecutableContext, _self: Data, args: any) => {
    const thread = ctx.thread;
    if (!thread?.persistence) return { err: "[create_object] 缺少 thread / persistence。" };
    const { baseDir, sessionId, objectId: author } = thread.persistence;
    // 非业务 session（super / 空）拒绝建对象 —— fail-loud，不静默。
    // runtime 只做校验 + 委派；写盘原语归 persistable。
    const r = await createObjectInSession({
      baseDir, sessionId, authorObjectId: author,
      newObjectId: args.objectId, selfMd: args.selfMd, readableMd: args.readableMd,
      ...(args.knowledge ? { knowledge: args.knowledge } : {}),
    });
    if (!r.ok) return { err: `[create_object:${r.code}] ${r.message}` };
    return {
      message: "已落 session worktree，本 session 内即可用。session 永不合入 main——进 canonical 走 feat-branch PR。",
      data: { ok: true, objectId: r.objectId },
    };
  },
};

export default { methods: [createObjectMethod] };
```

### readable/index.ts —— 投影成 context window（静态身份窗，无 window method）

```ts
import type { ReadableContext, ReadableModule } from "<runtime>/readable";
import { xmlElement, xmlText } from "<runtime>/xml";
import type { Data } from "../types.ts";

// runtime 无投影态（无 viewport 等展示态）。
interface RuntimeWin {}

const readable: ReadableModule<Data, RuntimeWin> = {
  readable: (_ctx: ReadableContext, _self: Data, _win: RuntimeWin) => ({
    class: "runtime",
    content: [
      xmlElement("about", {}, [
        xmlText("runtime 对象（agent 持有的成员）——系统级接口。create_object 把新对象骨架落 session worktree。"),
      ]),
    ],
  }),
  window: [
    {
      class: "runtime",
      object_methods: ["create_object"], // window 展示的 object method 菜单
      window_methods: [],                 // 无 window method（无投影态）
    },
  ],
};

export default readable;
```

> persistable / visible 无自定义文件——走系统默认 / 不成页。
