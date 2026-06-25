---
title: OOC Object 继承经源码 import + 对象 spread —— 不内建 chain dispatch
status: draft
date: 2026-06-25
supersedes: 2026-06-25-inheritance-as-prototype-chain.md
---

# OOC Object 继承经源码 import + 对象 spread

## 背景 / 动机

OOC 当前继承机制（`OocClass.inheritClass: string | null` + `resolveXxx` 沿单跳链解析）有两组问题：

**A. 概念错位**：设计文档 `object/self.md` 核心 2 写「class 不支持继承」，但代码 `OocClass.inheritClass` + `resolveObjectMethod` 沿链递归实际就是单跳类继承——设计描述与实现长期不一致。

**B. 元编程笨重**：super-call 手动 import + 调；facet override 是 all-or-nothing；多 facet 复用做不到；运行时 hot-reload 不顺畅。

前一个 issue（[2026-06-25-inheritance-as-prototype-chain.md](./2026-06-25-inheritance-as-prototype-chain.md)）提出"OOC 自建 prototype chain dispatch 机制"。经 7 个 reviewer fan-out 后发现：**这个方向引入大量 OOC 自有名词（proto / super / chain / merge / halt / ownerClassId）违反"克制熵增"哲学根；95% 的复杂性根源于"OOC 重新发明 JS / TS 已有机制"**。

本 issue 是反方向：**OOC 不内建继承 dispatch 机制——子 class 用 TS 源码 `import` + 对象 `spread` 直接表达继承；ESM 模块系统天然提供 live binding 自动同步**。

## 现状（锚 index.md 对应 `##` 节）

锚点（与前 issue 相同）：
- `## OOC Class/Object Model`（A 区）核心 1-2-3-7-9
- `## OOC` —— 三主张之三「元编程 → 自我迭代」
- `## executable` / `## readable` / `## persistable` / `## thinkable` / `## visible`（B 区维度核心契约）
- `## reflectable`（B 区）—— 自我改写身体的执行手段
- `## runtime`（E 区）—— ClassRegistry 泛型 seam（resolveXxx 沿链解析）

涉及文件：
- `packages/@ooc/core/runtime/ooc-class.ts`（OocClass 接口定义 / `inheritClass` 字段移除）
- `packages/@ooc/core/runtime/object-registry.ts`（13 处 `resolveXxx` 沿链递归全部移除）
- `packages/@ooc/core/runtime/server-loader.ts`（兜底 parentClass 注入逻辑移除）
- `packages/@ooc/builtins/agent/persistable/self-md.ts` 等使用 inheritClass 的位置（如有）
- `.ooc-world-meta/stones/main/objects/supervisor/children/object/self.md`（核心 2 改写）
- 全树 self.md / index.md / 代码注释里「inheritClass / 单跳继承」字样

## 改动提案

### 改动 1：移除 `OocClass.inheritClass` 字段

`OocClass<Data, Win>` 接口移除 `inheritClass?: string | null`。class 在注册期就是个**扁平的 facet 集合声明**，没有 chain 元信息。

```ts
interface OocClass<Data = any, Win = any> {
  id: string;
  construct?, active?, unactive?, init?,
  executable?, readable?, persistable?, visible?, thinkable?;
  // ❌ 删除：inheritClass
}
```

### 改动 2：`ClassRegistry.resolveXxx` 不沿链 fallback

13 处 `resolveXxx` 全部改为**本类直查**：

```ts
// 之前：
resolveObjectMethod(classId, name): ObjectMethod | undefined {
  const cls = this.classes.get(classId);
  const found = cls?.executable?.methods.find(m => m.name === name);
  if (found) return found;
  if (!cls?.inheritClass) return undefined;
  return this.resolveObjectMethod(cls.inheritClass, name);  // ← 删
}

// 之后：
resolveObjectMethod(classId, name): ObjectMethod | undefined {
  const cls = this.classes.get(classId);
  return cls?.executable?.methods.find(m => m.name === name);
}
```

每个 class 是个**自洽的扁平定义**。子继承父什么、不继承什么、怎么改、怎么 super——都在子的源码里用 TS 表达。

### 改动 3：继承经 `import { Class } + 对象 spread` 表达

子的 `index.ts` 模板：

```ts
// stones/main/objects/coder/index.ts
import type { OocClass } from "@ooc/core/runtime/ooc-class.js";
import { Class as agentClass } from "@ooc/builtins/agent";
import type { Data } from "./types.js";

import executable from "./executable/index.js";

export const Class: OocClass<Data> = {
  ...agentClass,              // 拷父全部 facet（spread = facet 对象引用共享）
  id: "coder",                // 覆盖 id
  executable,                 // 自己的 executable 完整声明
  // readable / persistable / construct 等不写 → 直接用父的（ESM live binding 自动同步）
};

export type { Data } from "./types.js";
```

**关键性质**：

1. **零 OOC runtime 机制**：纯 TS 语法。`import` / `spread` / `id` 覆盖都是 JS 标准。
2. **ESM live binding 自动同步**：父 class 改了（hot-reload 后），子 spread 拿到的是 module live binding——下次构造或下次 dispatch 就是新版本。**完全保留 prototype chain 的"父变子变"语义**，但不需要 OOC 自建 chain。
3. **TS 编译期类型检查**：spread 的字段都按 TS 类型 check；子 Data extends 父 Data 也是纯 TS。
4. **任意粒度灵活复用**：见下表。

### 改动 4：复用粒度由子 TS 源码自由表达

| 复用粒度 | 源码写法 |
|---|---|
| 全继承（零自有） | `export const Class = { ...parentClass, id: "child" }` |
| 加新 method | `executable: { methods: [...parentClass.executable!.methods, newMethod] }` |
| Override 一个 method（保留其它） | `executable: { methods: [...parentClass.executable!.methods.filter(m => m.name !== "talk"), myTalk] }` |
| Override method + super-call | `myTalk.exec = async (ctx, self, args) => { /* pre */; return parentTalk.exec(ctx, self, args); }`（显式 `import { talkMethod as parentTalk }`） |
| 多继承 / mixin | `{ ...A, ...B, ...own }`（spread 顺序 = right-most wins） |
| 完全分叉（不继承） | 不 import 父，从头写 |
| Lifecycle 串调 | `active: { exec: async (ctx, self) => { await parentClass.active?.exec(ctx, self); /* 自己加 */ } }`（顺序由子代码控制） |

**每一档都用同一种语言机制（TS）**，OOC 不提供专用 API。

### 改动 5：提供 `extendClass` helper（语法糖，可选）

样板代码长时（如 method-level merge）可用 helper：

```ts
// packages/@ooc/core/runtime/inherit.ts
import type { OocClass } from "./ooc-class.js";
import type { ObjectMethod, ExecutableModule } from "../types/index.js";

/**
 * 继承一个父 class 并选择性 override —— 纯编译期 helper，无 runtime 机制。
 *
 * - executable.methods：按 method name 自动 merge（子覆盖父）
 * - readable.window：按 window class 名自动 merge（子覆盖父）
 * - 其他 facet：子提供则用子的，否则用父的
 */
export function extendClass<Data = any, Win = any>(
  parent: OocClass<Data, Win>,
  overrides: Partial<OocClass<Data, Win>> & { id: string },
): OocClass<Data, Win> {
  const out: OocClass<Data, Win> = { ...parent, ...overrides };
  // 自动 method-level merge
  if (overrides.executable && parent.executable) {
    out.executable = mergeExecutable(parent.executable, overrides.executable);
  }
  if (overrides.readable && parent.readable) {
    out.readable = mergeReadable(parent.readable, overrides.readable);
  }
  return out;
}

function mergeExecutable<Data>(
  parent: ExecutableModule<Data>,
  child: ExecutableModule<Data>,
): ExecutableModule<Data> {
  const byName = new Map<string, ObjectMethod<Data>>();
  for (const m of parent.methods) byName.set(m.name, m);
  for (const m of child.methods) byName.set(m.name, m);  // 子覆盖父
  return { methods: [...byName.values()] };
}

function mergeReadable<Data, Win>(...) { /* 按 window class 名 merge */ }
```

子写起来：

```ts
import { extendClass } from "@ooc/core/runtime/inherit.js";
import { Class as agentClass } from "@ooc/builtins/agent";
import executable from "./executable/index.js";

export const Class = extendClass(agentClass, {
  id: "coder",
  executable,  // 自动与 agent.executable.methods 按 name merge
});
```

**重要**：`extendClass` 是**纯编译期函数**，没有 runtime 状态、没有 ClassRegistry 沿链。它就是 spread + Map 合并的语法糖，可被替代为完全手写 spread。**OOC 不强制使用**。

### 改动 6：Super-call 经 `import` 父 method 函数 + 显式调

```ts
// coder/executable/method.talk.ts
import { talkMethod as parentTalk } from "@ooc/builtins/agent/executable/method.talk.js";

export const talkMethod: ObjectMethod<Data> = {
  name: "talk",
  exec: async (ctx, self, args) => {
    observeLog("coder.talk.audit", `talk to ${args.target}`);
    return parentTalk.exec(ctx, self, args);  // ← 显式调父
  },
};
```

不需要 `ctx.super(name, args)` 运行时机制。子读源码立刻知道父在哪、ctrl-click 可跳过去。

**这条与 `object/self.md` 核心 2 原话「复用靠 import 目标 class 导出的函数」字面对齐**。

### 改动 7：Data 类型继承 —— TS 自带 `extends`

```ts
// coder/types.ts
import type { Data as AgentData } from "@ooc/builtins/agent/types.js";

export interface Data extends AgentData {
  reviewedCount?: number;
  styleProfile?: string;
}
```

完全 TS 标准。多继承用 `interface Data extends A, B {}`。Data 形状继承经编译期保证。

### 改动 8：reflectable 元编程经"改源码"

agent 在 super flow 想改自己的 talk 行为：

1. 经 reflectable feat-branch PR 通道（已存在）写 `stones/main/objects/coder/executable/method.talk.ts`
2. commit + PR + reviewer 批准 + merge into main
3. PR merge finalizer 触发 `serverLoader.invalidateAndReregister("coder")`
4. 下次 hydrate 拿到新版本

不需要 `patch_self_prototype` in-memory mutate（前 issue 设计）。**实验态 = uncommitted 编辑**；**沉淀态 = merged 编辑**——状态由 git 决定，OOC 不内建第三类。

**或**简化版本：开发期 agent 改源码后 ServerLoader 在 thinkloop tick 末尾按 mtime 检测自动 invalidate（pull-mode hot-reload，已存在 mtime 缓存机制，加一行 trigger 即可）。

### 改动 9：package.json 字段简化

```json
{
  "ooc": {
    "objectId": "coder",
    "kind": "object",
    "class": "_builtin/agent"
  }
}
```

- `ooc.class`：object→class **实例 binding**（保留）
- ❌ 删除：`ooc.proto`（前 issue 提案，本 issue 不需要）
- ❌ 删除：`ooc.inheritClass`（已无 runtime 含义）

继承关系在子的 `index.ts` 内经 `import` 显式表达——package.json 不持继承元数据（也不需要 ServerLoader 兜底注入 parentClass 逻辑）。

**可选**：`ooc.extends: string[]` 作为**元数据**字段（让 tooling 能扫"谁继承谁"），但 runtime 不读它。

## 受影响设计元素

对照 `knowledge/index.md` 的 `##` 元素清单：

- `## OOC`（A）—— 元编程主张实现机制变化
- `## OOC Class/Object Model`（A）—— **核心 2 翻案到「class 经 import + spread 复用」**；核心 1（构成 class）保留；核心 3（单例 vs 非单例）不变；核心 8（children 命名空间）不动
- `## executable`（B）—— ObjectMethod 注册仍是 method-name 唯一；ctx 不加 super；method 间复用经 import 函数 + 显式调
- `## readable`（B）—— ReadableModule 仍按 facet 直查；不沿链 fallback；render 间复用经 import 函数 + 显式调
- `## persistable`（B）—— save/load 自洽（每 class 独立完整声明）；inline mode 仍存在但不需要 sentinel 守护
- `## thinkable`（B）—— hook 字段直查；不沿链
- `## visible`（B）—— visible/server method 与 executable 同型
- `## reflectable`（B）—— 元编程经"改源码 + PR"；不需要 in-memory `patch_self_prototype`
- `## runtime`（E）—— `ClassRegistry.resolveXxx` 全部简化为本类直查；`ServerLoader` 移除 parentClass 兜底注入；hot-reload mtime trigger（已存在机制 + 加 thinkloop tick 末尾 detect）

**未受影响**（前 issue 误列）：
- B.collaborable / B.observable / B.app / B.visible(tsx 资源) / E.knowledge_base / E.thread / E.method_exec_form —— 这些维度的"继承下行为"完全经 TS 源码表达，不需要 OOC 维度上的特殊设计

## 与前 issue（prototype-chain）的对比

| 维度 | 前 issue（prototype chain） | 本 issue（import + spread） |
|---|---|---|
| 复用机制 | OOC 自建 proto chain + resolveXxx 沿链 | ESM `import` + 对象 `spread` |
| Super-call | `ctx.super(name, args)` 注入 ExecutableContext | `import { foo as parentFoo }` + `parentFoo.exec(...)` |
| Facet merge | OOC 自建（method-level / hook-field / 串调） | TS spread 自由表达（可选 extendClass helper） |
| Lifecycle 串调 | OOC 自建 resolveActiveChain + halt 信号 | 子代码自定义顺序：`await parent.active?.exec(...); /* 自己加 */` |
| Data 类型 | TS extends（与本 issue 同） | TS extends |
| 多继承 / mixin | `proto: string[]` + 多 proto fallback（MRO 复杂） | `{ ...A, ...B, ...own }`（spread 顺序明确） |
| `package.json` | 拆 `ooc.class` + `ooc.proto` | 只保留 `ooc.class` |
| 注册期 | ClassRegistry 含 chain 信息 + 环检测 | ClassRegistry 平铺 |
| 元编程 in-memory mutate | `patch_self_prototype` | 不需要——改源码即元编程 |
| 元编程沉淀 | feat-branch PR | feat-branch PR（同前）+ hot-reload mtime |
| Hot-reload | tick 末尾 stat / PR finalizer | tick 末尾 stat（ServerLoader 已有 mtime 缓存） |
| 新概念 | 多（proto / super / chain / merge / halt / ownerClassId） | 零（全部用 TS / ESM 既有概念） |
| 文档术语漂移 | 必须全树扫"inheritClass / 单跳继承"改成"proto chain" | 全树删"inheritClass / 单跳继承"，改成"经源码 import + spread" |
| reviewer 担忧 | 95% 担忧根源于 dispatch chain 复杂性 | 95% 担忧 evaporate |

## 实施分期

- **P1**：核心改造（≤2 天）
  - 删 `OocClass.inheritClass` 字段
  - 简化 13 处 `resolveXxx` 为本类直查
  - 移除 `ServerLoader.loadAndRegisterStoneClass` 中的 parentClass 兜底注入
  - 全树扫漂移点 + 改写 self.md / index.md / 代码注释
- **P2**：helper + 文档（≤1 天）
  - 加 `core/runtime/inherit.ts`（extendClass helper，纯编译期）
  - 写 cookbook：「如何继承父 class + 例子」（应该包括所有改动 4 的写法）
  - 改 `object/self.md` 核心 2 措辞为「class 经源码 import + spread 复用」
- **P3**：hot-reload trigger（≤1 天）
  - thinkloop tick 末尾对当前 thread.calleeObjectId 的 stones/<id>/index.ts mtime detect
  - 变化触发 `serverLoader.invalidateStone + loadAndRegisterStoneClass`

不需要前 issue 的 P4（patch_self_prototype）和 P5（reflectable 实验态）—— 元编程就是"改源码"，没有"实验态"层。

## 风险与权衡

1. **样板代码量**：子写 `{ ...parentClass, id: "..." }` 比单字段 `inheritClass: "..."` 略多——extendClass helper 缓解。
2. **ESM live binding 行为依赖运行时**：子 spread 父 Class 拿到的是 module live binding，父 class 改后子是否立刻看到取决于 bun import resolver 行为——需 P3 hot-reload 测试覆盖。
3. **子无法"动态选择父"**：父在 import 时就被绑定。如果需要 runtime 选择继承哪个父（极罕见元编程场景），方案 C 做不到——但当前 OOC 没这个需求。
4. **多继承顺序**：`{ ...A, ...B, ...own }` 顺序由 spread 表达；B 覆盖 A、own 覆盖 B。这比方案 A 的 MRO 算法直观，但程序员要写对顺序。
5. **类型层 spread 推断**：TS 对 `{ ...A, ...B }` 的类型推断有时不如显式 interface extends——若 helper 内做了合并需用泛型保持。

## 待裁决点

1. **是否提供 `extendClass` helper**？还是让子完全手写 spread？建议提供（降低样板）。
2. **`ooc.extends` 元数据字段是否引入**？runtime 不读、tooling 用——建议先不引入（YAGNI），等真有 tooling 需求再加。
3. **Hot-reload trigger**：thinkloop tick 末尾 stat 单文件 vs file watcher（chokidar）？建议 P3 先 stat（开销低），后续优化。
4. **agent persistable 处理 self.md 的逻辑是否变化**？`agent/persistable/self-md.ts` 现在的实现如何应对继承——子覆盖 persistable 时如何还能写 self.md？需在实施前 review 这个文件具体逻辑。
5. **builtin agent 的 children（thread / pr / todo / plan / skill_index / method_exec_form）当前的继承关系**：检查每个的 `inheritClass` 字段使用——大概率没有用（每个 child class 自洽），简单清掉即可。

## review 记录

（待 fan-out）

## 裁决

（待裁决后填）

## 落地验收

（待 landed 后填）
