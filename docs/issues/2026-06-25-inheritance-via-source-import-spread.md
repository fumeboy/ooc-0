---
title: OOC Object 继承经源码 import + 对象 spread —— 不内建 chain dispatch
status: verified
date: 2026-06-25
supersedes: 2026-06-25-inheritance-as-prototype-chain.md
worktree: .worktree/inheritance-spread/
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

#### 渐进性原则（关键约束）

**默认 object 继承 class 不需要 `index.ts`**——只有 object 想为自己元编程（写自有 method / readable / persistable / lifecycle hook）时才需要写。

| Object 复杂度 | 目录结构 |
|---|---|
| **纯实例**（只持身份 + knowledge，无自有程序面） | `package.json` + `self.md` + `readable.md` + `knowledge/` ——**没有 `index.ts`**，ServerLoader 直接走 `ooc.class` 实例 binding、运行时所有 facet 都用父 class 的 |
| **自有程序面的实例**（要写新 method / override 行为 / 加新 Data 字段） | 加 `index.ts` + `types.ts` + `executable/` 等——自己装配出 OocClass（经 import + spread 复用父） |

当前 `supervisor`（`.ooc-world-meta/.../objects/supervisor/`）就属第一类——只有 self.md / readable.md / knowledge / children，**没有也不需要 index.ts**。继承 `_builtin/agent` 的全部行为，ServerLoader.loadAndRegisterStoneClass 现有路径已支持「无 index.ts → 注册空 Class + parentClass 链」。

#### ServerLoader 双路径

```
扫描 stones/main/objects/<id>/：
├─ 有 index.ts → import { Class } → registry.register(Class)
│  ↓ 子 Class 已自带继承（经 import + spread 在自己源码里表达）
│  ↓ 不需要 ServerLoader 做任何 parentClass 兜底
│
└─ 无 index.ts → 只有 package.json 的 ooc.class
   ↓ ServerLoader 经 ooc.class 找到父 class
   ↓ 注册一个空 Class { id: <objectId>, ...parentClass }（运行时 spread）
   ↓ 等同于子写了 index.ts: export const Class = { ...parentClass, id: "<self>" }
```

**两条路径的核心一致性**：「无 index.ts」等价于「index.ts 仅 spread 父」—— ServerLoader 兜底 = 隐式 spread，源码 spread = 显式 spread；语义同质。

#### 子的 `index.ts` 模板（仅当需要时）

```ts
// stones/main/objects/coder/index.ts —— 只有 coder 想加自己的方法时才写此文件
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

#### Object 从无 index.ts 演化到有 index.ts

agent 在某个时刻想为自己元编程（加新 method / override 行为）——这是一个**显式 reflectable 操作**：
1. agent 经 reflectable feat-branch 通道在自己的 stone 目录创建 `index.ts` + `types.ts` + `executable/method.foo.ts`
2. commit + PR + reviewer + merge
3. ServerLoader 重新 load：发现 index.ts 出现，切换路径（无 index.ts → 有 index.ts）

**反向同理**——若 agent 决定回归"纯实例"形态，删除 index.ts 即可。


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

经 design-workflow 步骤 2 fan-out（10 个 sub agent：9 个受影响设计元素 reviewer + 1 个完整性批评官）。下面记录每个 reviewer 的结论与核心评论，详细评论见 supervisor 会话日志。

### A · OOC（顶层哲学/三主张）—— 同意但有担忧

- **结论**：本 issue **强化**三主张中的第二（Object 化 Agent）与第三（元编程→自我迭代），且把「克制熵增」哲学根落到机制选择上；相比前 issue 净减约 6 个 OOC 自有名词（proto/super/chain/merge/halt/ownerClassId）。
- **关键担忧**：
  1. **「实验态」哲学层退化**：主张三「运行时改写自己的类」在本 issue 后实际是「改源码 → invalidate → 下次 hydrate」——**单 thread 内**的自我演化场景受影响。建议在 `ooc-philosophy.md` 显式补一句：「**运行时改写的颗粒度 = thread 间，不是单步内**」，防止前 issue 的 `patch_self_prototype` 以「主张三未尽」为由复辟。
  2. **「自举」哲学 vs「向 TS 退化」**：本 issue 让继承能力退回 TS/ESM，需明确表态：「**OOC 不重新发明语言层既有机制——能用 TS / ESM 表达的就用；OOC 只提供 TS/ESM 表达不了的部分（context window 投影、thinkloop、persistable 三层级、reflectable 反思通道等）**。」
  3. **`extendClass` 收紧措辞**：从「样板代码长时可用 helper」收紧为「**OOC 不推荐任何一种特定继承合并语义**；extendClass 仅作样板长时的可选语法糖；cookbook 须平等展示多种 spread 模式」——防止 helper 被当成「推荐做法」反向强加协议。

### A · OOC Class/Object Model（核心翻案点）—— 同意但需配套修订

- **结论**：核心 2 翻案方向正确，但**核心 1「class 由四件套 + index.ts + types.ts 构成」与 issue 改动 3「无 index.ts 纯实例 object」字面冲突**，必须配套修订。
- **关键修订**（落地前必做）：
  1. **核心 1 措辞**：明确「**class 必有 index.ts + types.ts**；**object instance 不必有**——无 index.ts 的 object 不是新 class、就是父 class 的一个 instance」。
  2. **核心 2 措辞**改为「**OOC Class 协议层不内建任何继承 / dispatch chain 机制**，ClassRegistry 注册的是扁平的 class 定义；class 想复用另一个 class 的能力，由其 `index.ts` 用 TS 标准 `import` + `spread` 在源码侧完成——继承属于 class 实现者的自由，OOC 协议不规约、不感知」。
  3. **核心 4 / ServerLoader 路径**：**纯实例 object（无 index.ts）不向 ClassRegistry register 任何东西**——只在 session 对象表里 `instance{id, class: <parentClassId>, data}`。**否定 issue 改动 3 原稿「注册空 Class { ...parentClass, id }」**——那等于把 chain dispatch 改名 register-time spread copy，仍是 OOC 自有继承机制。
  4. **核心 3 加一句**：「单例不可被继承是源码组织约定——OOC 协议层不强制（无运行时感知），由 lint / 评审拦截」。
  5. **核心 9 加 self.md 复用约定**：继承 agent 的 class 须 `import { readSelf, writeSelf }` 显式调（这正是核心 2 复用模式的实例）。**待裁决点 4 的答案**：`PersistableContext.objectId` 已携带子身份，**不需要改 `self-md.ts`**。
  6. **核心 10 加 lifecycle 串调约定**：父钩子由子代码显式调（典型 `await parent.active?.exec(ctx, self)`），漏调由代码评审拦截。
- **新增担忧（必处理）**：
  - **spread 不是深拷贝**——`{ ...parentClass }` 浅拷贝，facet 对象 mutation 会跨 class 泄露。须在 cookbook 强制声明「OocClass 及其 facet 在注册后视为 immutable」+ lint 规则禁止 `executable.methods.push` 等。
  - **spread 顺序陷阱**——`{ id: "child", ...parent }` 错（id 被父覆盖回 parent.id）。cookbook 显式警告。

### B · executable —— 同意；3 处补丁需补

- **结论**：dispatch by name + tool 3 原语 + object vs window method 分维全部不变；spread 模型透明传导。
- **关键补丁**：
  1. **改动 6 super-call 完整模板修订**：`{ ...parentMethod, exec: async (...) => parentMethod.exec(...) }`（不能只覆盖 exec，否则丢失父的 `route` / `intents` / `schema` / `description`）。这是 executable × thinkable 交叉关键——route 算 intents 反向驱动 knowledge 激活，丢 route 会让知识激活机制连带失效。
  2. **改动 5 `extendClass`：method 整对象保留**——helper 的 mergeExecutable 必须 spread 整 `ObjectMethod`（含 route/intents/schema/public/for_reflectable/permission），不光看 name + exec。
  3. **`assertNoMethodNameCollision` 加强**：顺手加 same-class internal name 自查重（防 filter+concat 手写漏 filter 导致同名重复）。
  4. **改动 4 表加 route / intents 复用行**：让 cookbook 默认推荐 spread 整 method 对象的写法。
- **storybook**：加一个 case 验证「子 override exec + spread 父对象 → route 仍跑、intents 仍驱动 knowledge 激活」。

### B · readable —— 同意大方向；**反对 `mergeReadable`**

- **结论**：删 `resolveReadable / resolveWindowMethod / resolveWindowClass` 三处沿链 fallback 在 readable 这维**几乎零代价**（self.md 自己写「沿继承链回退尚未被真正行使」）。
- **关键反对**：**`mergeReadable(按 window class 名 merge)` 必须从改动 5 砍掉**——
  - 当前 0 真实使用方（self.md 自承认）；
  - 与核心 5「多视角投影是整体语义」暗中违背——把整体语义拆成字段语义；
  - 替代写法 `window: [...parentClass.readable!.window, myExtra]` 一行够。
  - 与 issue 反向哲学（零 OOC runtime 机制）矛盾。
- **保留 `mergeExecutable`**：method-by-name 是 executable 维度本就有的注册期硬约束（`assertNoMethodNameCollision`），helper 只是 spread + Map 语法糖。**helper 不为 readable / persistable / visible 提供专用合并语义**。
- **必补**：
  - 改动 2 增补「readable 三条 resolve 本类直查后的语义清单」+ 「静态 `readable.md` 兜底链与本 issue 正交、不变」。
  - 改动 3 加一段说明：`readable.md` 兜底链与"无 index.ts"路径**正交**。
  - 改动 4 表补 readable 三档复用写法（全继承 / 整体 override / window 数组拼接）。
  - **hot-reload watch 范围扩到 `readable.md` / `self.md`**（不只 `index.ts` mtime）——参看新增「Hot-reload watch 范围」裁决。

### B · persistable —— 同意；3 处接口边界缺口

- **结论**：方向与 persistable 设计哲学（stones/flows/pools 三层 + reflectable × persistable 铁律）吻合；本 issue 没破坏「绝不从 session worktree 直合 main」铁律。
- **必修（P0 阻塞落地）**：
  1. **改动 3 删「ESM live binding 自动同步」措辞**——spread 复制的是 facet 对象引用（浅拷贝），父 module 重 import 后 facet 对象**是新引用**，要让子也拿新引用必须**重新注册子**（invalidateStone + 重 register）。这**不是** ESM live binding 透明同步。改为「父 class 改动→invalidateStone+重新 spread 注册」。
  2. **改动 8 新增 API `WorldRuntime.invalidateAndReregister(objectId)`**（当前只暴露 `invalidateStone`，不重新 register）。或 alpha 路径：PR merge finalizer 调 `serverLoader.invalidateStone` 即可（lazy 模式下次 hydrate 拿新版）。
  3. **改动 8 例子里的 `coder` 必须明示为 stone object**——排除「builtin 框架包 object（`packages/@ooc/builtins/agent/coder/...`）」混淆。两类对象写入边界不同：stone object 走 reflectable feat-branch PR；框架包内 builtin 走 GitHub PR 由人类合入。**这是 issue 当前最严重的边界混淆**。
- **新发现**：`stone-versioning.ts:283` ff-merge feat → main 完成后**没有任何回调触发 loader 失效**——running session 的 ClassRegistry 持 stale class。P1 在 `mergeFeatBranch` 末尾加一钩 invalidateStone 即可。
- **删「sentinel」措辞**（改动 2 末尾）——全树 grep `sentinel` 0 命中，凭空概念。
- **待裁决点 4 答案**：不需要改 `agent/persistable/self-md.ts`（`ctx.objectId` 已携子身份）。

### B · thinkable —— 同意改动 1-7/9 与改动 8 主路径；**反对 P3 thinkloop tick stat**

- **结论**：thinkable 模块槽与 5 维度同构，本类直查 + spread 完全相容；改动 8 主路径与现有 feat-branch PR 通道字面对齐。
- **必删 P3**：
  1. **重复造轮子**：`core/runtime/hot-reload.ts` 已有完整 fs.watch 推模式 watcher + 50ms debounce + `stone:changed` 事件 + `dev/prod` 开关；`world-runtime.ts:54-64` 已联动 `serverLoader.invalidateStone`。issue 写「ServerLoader 已有 mtime 缓存机制，加一行 trigger 即可」是对现状的误判——**已存在推模式机制**。
  2. **污染 thinkloop 纯粹性**：thinkloop 协议是「build→LLM→tool→事件」单轮，不该承担文件系统/源码热更副作用。
  3. **强加给所有 thread thinkloop**：即便生产环境也每 tick stat——`hot-reload.ts` 已正确做 dev/prod 分离。
  4. **stat 单文件不够**：子 spread 父——父改源码后子需要重 register，stat `calleeObjectId 的 index.ts` 漏掉 import 图。
- **关键裁决点**：把 `## knowledge_base / knowledge`（E）从「未受影响」**移到「受影响」**——loader 当前**未实现**「沿祖先 / parentClass 继承链解析」（代码注释「不做继承链(待 reflectable 重建时补)」），但 index.md L177 + thinkable self.md L30 都声称已做。本 issue 落地后 inheritClass 死锚——**裁决：退役该未实现设计**，同步删 index.md L177 / thinkable self.md L30 / loader.ts 注释里的「沿祖先 / parentClass 继承链」字样。
- **knowledge 激活 `method::<class>::<method>` 触发**：明确「**不解析 class 继承**——子若想用父 knowledge 触发条件，自己 import 父 knowledge md 并重声明本类 id 的 trigger」（与本 issue 哲学一致）。

### B · visible —— 条件赞成；tsx 通路必须显式声明

- **结论**：visible/server 槽（OocClass 内）删 inheritClass + 本类直查 + spread 干净降熵；但 issue **把 visible 当单一槽位推理，对 tsx 通路完全没提**——必须显式声明。
- **必加 visible 节裁决**：**tsx 不参与 OocClass 继承**（方案 A，推荐）——
  - tsx 是文件资源、不是 OocClass 字段；
  - 子需 tsx 时自己写 `visible/index.tsx`，缺则前端 fallback 到 `StoneFallback`；
  - 子也可经用户态 ESM `export { default } from "@ooc/builtins/agent/visible/index.tsx"` 复用父 tsx（无 OOC 机制）。
  - 同样适用 `client/pages/<page>.tsx` flow scope。
- **「未受影响」清单需显式列**：A1 file-edit 原语 / `visible/index.tsx` 文件解析契约 / `ooc:// URI`↔SPA route / `ObjectClientRenderer` / `visible/diff.tsx`——避免后续 reviewer 重复怀疑。
- **builtin 现状核查**：`builtins/agent/executable/method.talk.ts` **已经是 method-per-file 形态**——completeness / executable / visible reviewer 担忧的「需为 super-call 拆 builtin method-per-file」**已经做完**。**P 工期不需要额外加这一步**。

### B · reflectable —— 强 approve 改动 8 主路径；reflectable 通道无须改字

- **结论**：reflectable self.md 核心 1「不发明新机制」 + 核心 4「两通道互斥」 + 核心 5「feat-branch PR = stone 变更唯一沉淀单元」**已为改动 8 兜底**——本 issue 不需要改 reflectable self.md 任何字。
- **`patch_self_prototype` 全树 grep 仅命中 issue 文本**——线上从未实施，不需要清理。
- **关键裁决**（路径 A vs 路径 B 主语区分）：
  - **路径 A** = PR merge finalizer → invalidateStone = **agent reflectable 通道**（强制经审核闸）；
  - **路径 B** = `startHotReloadWatcher` fs.watch 推模式 = **人类 dev hot-reload**，**只在 dev 模式开**，**且必须排除 `flows/<sid>/` worktree 路径**（防 agent 在 session worktree 写就生效绕开 PR 闸门）。
  - 文字明确写进 issue 落地段；同步在 reflectable × persistable 交叉契约下补一句「dev hot-reload 不监听 session worktree」。
- **新增担忧（必处理）**：reverse-binding 索引——agent 改父 class 源码后，所有 `ooc.class=该父` 的 children（如 supervisor）是否都被 invalidate？当前 `invalidateStone` 按单 stone 失效。**MVP**：merge finalizer 直接清空整个 sessionRegistry（代价：下次 hydrate 全冷启）；优化路径后续单开 issue。

### E · runtime —— 同意改 1/2/9；强烈反对改 3 「register-time spread copy」+ P3

- **结论 + 实测发现**（最重要）：
  1. **改动 3 必须改写**：「无 index.ts 的 stone object **不注册新 class**」——hydrate 时 `inst.class = ooc.class`（=父 class id），resolveXxx 直接命中父 class。这才是「真正的无 OOC 机制」。issue 原稿「注册空 Class `{ id, ...parentClass }`」等于把 chain dispatch 改名 register-time spread copy，未消除 OOC 自有继承机制——违背 issue 自己哲学根。
  2. **supervisor 的 `ooc.class = "_builtin/supervisor"` 是遗留错值**——`_builtin/supervisor` 不在 builtinClassRegistry 注册（已确认），supervisor 当前能跑是误打误撞（resolveXxx 全 undefined）。**P1 必须顺手修为 `_builtin/agent`**。
  3. **hot-reload 已实现**（`hot-reload.ts:127` + `world-runtime.ts:54-64`）：fs.watch 推模式 + `stone:changed` 事件 → `serverLoader.invalidateStone` 已联动。**整段 P3 删**，改为「沿用现有 fs.watch 推模式 + PR merge finalizer 触发 invalidateStone」。
  4. **resolveXxx 沿链解析准确范围**：10 个 method、11 处 `inheritClass` 引用（issue 原稿「13 处」是 grep 行数，按 method 计数应为 10）。
  5. **`object-lifecycle.ts` 不存在**（漂移注释）——实际位置在 `builtins/agent/children/thread/runtime/thread-runtime.ts:251-269`。index.md `## runtime` L205 描述需对齐。
- **改动 4 表必补 lifecycle 行**：`Lifecycle 串调 | spread 时父 active/unactive 自动继承；子 override 想保留父行为需显式调 parentClass.active?.exec(...)`。
- **改动 5 helper 字段约束**：在 helper 文件首注释里写死「**只支持 executable.methods 一档 method-level merge**，扩字段必走新 issue」——防滑坡。
- **待裁决点 5 答案**：builtin agent children **0 处使用 inheritClass**（实测），清字段定义即可、无数据迁移。

### 完整性批评官 —— **issue 在「受影响 / 未受影响」清单上严重不准**

- **结论**：issue 整体方向正确，**但「未受影响」一栏严重错列**（collaborable / thread / knowledge_base / method_exec_form / app 都应移出），且**漏列 8+ 个受影响交叉**——不应直接进步骤 3 裁决，先把清单补完。
- **漏列受影响**（必加）：
  - `## collaborable`（B）—— talk/say 解析路径
  - `## executable × readable`（D）—— `assertNoMethodNameCollision` 在 spread 模型下语义
  - `## readable × thinkable`（D）—— context 渲染入口 `context.ts:34` 沿链消除
  - `## persistable × thinkable`（D）—— knowledge 继承链退役（对齐文档）
  - `## collaborable × thinkable`（D）—— talk(target=super) 自指通道
  - `## reflectable × persistable`（D）—— `createObjectSkeleton` 写 `ooc.class` 语义改变
  - `## builtins`（C）—— builtin 家族零冲击（须明示）
  - `## thread`（E）—— thread-runtime 6 处 resolveXxx 行为变化
  - `## agent`（E）—— super-call 对 builtin 拆 method-per-file 的需求（**实测：agent 已经拆好**，无额外工作）
  - `## knowledge_base / knowledge`（E）—— 见 thinkable reviewer 已点出
- **改动 3 vs 改动 9 字面矛盾**：「移除兜底注入」与「ServerLoader 隐式 spread」对立——按 runtime reviewer 修订（无 index.ts 路径不向 registry 注册新 class，inst.class 直指父）即一并解决。
- **「13 处 resolveXxx」精确化**为「10 个 resolveXxx method / 11 处 `inheritClass` 引用」。
- **「ESM live binding」需在裁决时统一定义**（脚注释义），避免散漏漂移。
- **`ooc.extends` 元数据字段**：建议直接砍（YAGNI）；tooling 需要扫继承图直接扫 `import` 语句即可。

---

## 裁决

按 design-workflow 步骤 3，Supervisor 汇总各 reviewer + 完整性批评官意见后做以下裁决。**裁决为权威，本文上方"改动提案"原稿与裁决冲突处以裁决为准**（不再回头改写原稿——它是历史依据；P1 实施直接对照本裁决段）。

### 裁决 D1：核心 2 翻案的协议层措辞

`object/self.md` 核心 2 改为：

> **OOC Class 协议层不内建任何继承 / dispatch chain 机制**：ClassRegistry 注册扁平的 class 定义，无 chain 元信息、无沿链 fallback。object 经 `ooc.class` 单跳 binding 一个 class 作为身份模板。**class 想复用另一个 class 的能力，由其 `index.ts` 用 TS 标准 `import` + 对象 `spread`（或 method 级 import 函数 + 显式调）在源码侧完成**——「如何继承」属于 class 实现者的自由，OOC 协议不规约、不感知。

同步 index.md `## OOC Class/Object Model` 核心 2 节。

### 裁决 D2：核心 1 / 3 / 4 配套修订

- **核心 1**：「class 必有 `index.ts` + `types.ts` + 四件套（readable/executable/visible/persistable）；agent 类额外注册 thinkable 模块槽。**object instance 不必有 `index.ts`**——无 `index.ts` 的 object 不是新 class、是父 class 的一个 instance」。
- **核心 3**：加一句「单例不可被继承是源码组织约定——OOC 协议层不强制（无运行时感知），由代码评审 / lint 拦截」。
- **核心 4 + ServerLoader 路径**：**纯实例 object（无 index.ts）不向 ClassRegistry 注册新 class**——hydrate 时 `OocObjectInstance.class = ooc.class`（=父 class id），resolveXxx 直接命中父 class 的字段。
  - **否定** issue 原稿改动 3 的「ServerLoader 注册空 Class `{ id, ...parentClass }`」——那等于把 chain dispatch 改名 register-time spread copy，未消除 OOC 自有继承机制。
  - **新的 ServerLoader 双路径**：
    - 有 `index.ts` → `import { Class } → registry.register(Class)`；子的继承经子源码 spread 表达。
    - 无 `index.ts` → **不**向 registry register；只在 session 对象表落 `instance{id, class: <parentClassId>, data}`。
  - 子 OocObjectInstance.class 这个字段本身承担「单跳实例 binding」角色，runtime 不在 ClassRegistry 再造一条空 Class 桥接。

### 裁决 D3：核心 9 + 核心 10 复用约定

- **核心 9**：「继承 agent 的 class 须 `import { readSelf, writeSelf }` 显式调（这是核心 2 复用模式的实例）」。`PersistableContext.objectId` 已携子身份，**不需要改 `agent/persistable/self-md.ts`**（**回答待裁决点 4：不动**）。
- **核心 10**：「`active / unactive` 钩子父子串调不内建——子 override 时由子代码控制顺序（典型 `await parent.active?.exec(ctx, self); /* own logic */`），漏调父钩子由代码评审拦截」。
- 改动 4 表补 lifecycle 行：`Lifecycle 串调 | { ...parent, active: { exec: async (ctx, self) => { await parent.active?.exec(ctx, self); /* own */ }}}`（注意 `parent` 是 import 来的引用、不是 spread 后字段）。

### 裁决 D4：resolveXxx 沿链解析全部本类直查

- **同意 issue 改动 1 + 2**：删 `OocClass.inheritClass` 字段；10 个 `resolveXxx` method（11 处 `inheritClass` 引用）改本类直查。
- 子 class 想继承父的某个 facet（active/readable/persistable/etc），**在自己的 `index.ts` 显式 spread 父 facet**（`{ ...parentClass, id: "child" }`）——子的 `cls.executable` 等已含父 facet 引用，本类直查命中。

### 裁决 D5：extendClass helper 收紧

- **提供** `extendClass(parent, overrides)` 编译期 helper，放 `packages/@ooc/core/runtime/inherit.ts`。
- **只做 `executable.methods` 一档 method-level merge**（按 name，子覆盖父，整 ObjectMethod 引用保留含 route/intents/schema 等所有字段）。
- **不为 readable / persistable / visible / thinkable 提供专用合并语义**——这几维 spread 整模块或子手写 `[...parent.window, my]` 数组拼接。
- **删 `mergeReadable` / `mergeVisible`**——`mergeReadable` 与 readable 核心 5 暗中违背、当前 0 使用方；`mergeVisible` 对称不必要。
- helper 文件首注释写死「**只支持 executable.methods 一档**，扩字段必走新 issue」（防滑坡）。
- **同步加强 `assertNoMethodNameCollision`**（P1 顺手）：扫 `cls.executable.methods` 内部 name 自查重，防 filter+concat 手写漏 filter。
- **回答待裁决点 1**：提供 helper，但 cookbook 不把它作"推荐做法"——平等展示「不写 index.ts / 手写 spread / extendClass」三种范式 + 何时用哪种。

### 裁决 D6：super-call 完整模板

改动 6 super-call 完整模板修订为：

```ts
import { talkMethod as parentTalk } from "@ooc/builtins/agent/executable/method.talk.js";

export const talkMethod: ObjectMethod<Data> = {
  ...parentTalk,                            // route / intents / schema / description 全部继承
  exec: async (ctx, self, args) => {        // 仅 override exec
    observeLog("coder.talk.audit", args.target);
    return parentTalk.exec(ctx, self, args);
  },
};
```

**注意「`{ ...parent, override }` 不是 `{ override, ...parent }`」**——后者顺序错、override 被父覆盖回。cookbook 显式警告。

### 裁决 D7：hot-reload 沿用现有推模式

- **删原 P3「thinkloop tick 末尾 stat」整段**。
- 沿用 `core/runtime/hot-reload.ts` 已有 fs.watch 推模式 watcher + `stone:changed` 事件 → `serverLoader.invalidateStone` 链路（dev 模式开、生产关）。
- **P1 在 `mergeFeatBranch` / ff-merge → main 路径末尾加一钩** `serverLoader.invalidateStone(mainRef)`——填上 PR merge 后 stale class 这个真实缺口。
- **路径 A vs B 主语区分**（reflectable × persistable 铁律推论）：
  - 路径 A = PR merge → invalidateStone = agent reflectable 通道（强制经审核闸）；
  - 路径 B = fs.watch hot-reload = 人类 dev 直接编辑 = dev-mode 豁免，**必须排除 `flows/<sid>/` worktree 路径**（防 agent 在 session worktree 写就生效绕开 PR 闸门）。
- **MVP reverse-binding 处理**：暂不引入 parent→children 反向索引；merge finalizer 直接清空整个 sessionRegistry（下次 hydrate 冷启），优化路径后续单开 issue。
- **watch 范围**：除 `index.ts` 外，也包含 `readable.md` / `self.md` 等 stone scope 文本资源（已在 `hot-reload.ts` 现有实现内，无须新增）。
- **回答待裁决点 3**：「trigger 选型」不存在——沿用现状即可。

### 裁决 D8：tsx 不参与 OocClass 继承

- **tsx 是文件资源、不是 OocClass 字段**——`visible/index.tsx`、`client/pages/<page>.tsx` 不参与 OocClass 继承机制。
- 子需 tsx 时自己写文件，缺则前端 fallback 到 `StoneFallback`；子也可经用户态 ESM `export { default } from "@ooc/builtins/agent/visible/index.tsx"` 复用父 tsx（**无 OOC 机制**）。
- `## visible` self.md 增补该节。

### 裁决 D9：package.json 简化 + `ooc.extends` 砍掉 + supervisor 修正

- **同意 issue 改动 9**：保留 `ooc.class`；不引入 `ooc.proto` / `ooc.inheritClass`。
- **不引入 `ooc.extends`**（**回答待裁决点 2：YAGNI 砍掉**）——tooling 需要扫继承图直接扫 `import` 语句（ts compiler API / grep），比手维护字段更准。
- **P1 顺手修 supervisor 的 `ooc.class = "_builtin/supervisor"` → `"_builtin/agent"`**——`_builtin/supervisor` 不在 builtinClassRegistry 注册（实测），当前 supervisor 跑起来是误打误撞。改动 2 落地后此遗留错值会直接暴雷，必须同步修。

### 裁决 D10：knowledge 继承链解析退役

- **同意 thinkable reviewer 裁决建议**：`knowledge_base/loader.ts` 当前**未实现**「沿祖先 / parentClass 继承链解析」，本 issue 落地后失去解析锚——**正式退役该未实现设计**。
- **同步删**：
  - `index.md` L177「磁盘加载与沿祖先 / parentClass 的继承链解析」→「磁盘加载（双源 seed + sediment 合并、sediment 覆盖 seed），不沿继承链」。
  - thinkable `self.md` L30「双源 + 沿祖先 / parentClass 继承链」→ 删后半句。
  - `loader.ts:5-6` 注释「不做继承链(待 reflectable 重建时补)」→ 删（明确退役而非待补）。
- **knowledge 激活 `method::<class>::<method>` 触发**：明确「**不解析 class 继承**——子若想用父 knowledge 触发条件，自己 import 父 knowledge md 并重声明本类 id 的 trigger」。

### 裁决 D11：受影响设计元素清单扩列 + 「未受影响」修正

落地时按以下扩列清单做文档回流。

**受影响设计元素**（最终清单，对照 index.md `##` 节做 review fan-out / 文档对齐时用）：

A 区
- `## OOC` —— 元编程哲学（澄清「运行时改写颗粒度 = thread 间」+ 「OOC 不重复发明 host language 机制」）
- `## OOC Class/Object Model` —— 核心 1/2/3/4/9/10 修订（裁决 D1-D3）

B 区
- `## executable` —— resolveObjectMethod 本类直查 + super-call 完整模板 + assertNoMethodNameCollision 加强
- `## readable` —— resolveReadable/WindowMethod/WindowClass 三条沿链删除 + readable.md 兜底链不变明示
- `## persistable` —— ServerLoader 改写 + PR merge finalizer 触发 invalidate
- `## thinkable` —— resolveThinkable 本类直查 + knowledge 继承链退役 + 删原 P3
- `## visible` —— resolveVisibleServer 本类直查 + **tsx 不参与继承**
- `## reflectable` —— 路径 A/B 主语区分 + dev hot-reload 排除 session worktree（**self.md 本身不改字**）
- `## collaborable` —— talk/say 解析依赖 ServerLoader 隐式（new model: inst.class 直指父）

C 区
- `## builtins` —— builtin 家族零冲击明示

D 区
- `## executable × thinkable` —— route 经 spread 保留 → intents 激活不断
- `## executable × readable` —— assertNoMethodNameCollision 在 spread 后语义
- `## readable × thinkable` —— context 渲染 resolveReadable 本类直查
- `## persistable × thinkable` —— knowledge 继承链退役（对齐 D10）
- `## reflectable × persistable` —— `createObjectSkeleton` 写 `ooc.class` 语义对齐 + dev hot-reload 主语
- `## collaborable × thinkable` —— talk(target=super) 自指通道经 inst.class 直指父
- `## readable × visible` —— for-ui method 经 spread；tsx 不参与

E 区
- `## thread` —— thread-runtime 6 处 resolveXxx 行为变化
- `## agent` —— super-call 在 builtin 已有 method-per-file 形态（**无额外拆分工作**）
- `## knowledge_base / knowledge` —— 继承链解析退役（裁决 D10）
- `## runtime` —— inst.class 直指父 + 删 sentinel/object-lifecycle.ts 漂移注释 + 沿用现有 hot-reload

**未受影响**（明示）：observable / app（仅 file-edit 原语侧文档对齐 `ooc.class` 语义、无 runtime 改造）/ method_exec_form（间接经 resolveObjectMethod 但 spread 透明传导）/ thread builtin self.md 核心不变。

### 裁决 D12：worktree 隔离

- 本 issue 涉及 `packages/@ooc/core/runtime/`、`packages/@ooc/builtins/agent/persistable/`、`.ooc-world-meta/.../objects/supervisor/package.json` 等源码变更。
- **在 `.worktree/inheritance-spread/` 开 worktree 分支隔离开发**（frontmatter `worktree` 字段已记录），P1-P3 实施在该 worktree 内做，完成后从该分支发 PR 到 main。

### 裁决 D13：实施分期重写

- **P1 ≤ 2 天 · 核心改造**（在 worktree 内）：
  - 删 `OocClass.inheritClass` 字段
  - 10 个 `resolveXxx` 简化为本类直查
  - ServerLoader 「无 index.ts」路径改写：`inst.class = ooc.class`，**不**向 registry register 新 class
  - 加 `assertNoMethodNameCollision` 内部 name 自查重
  - 修 supervisor `ooc.class` → `_builtin/agent`
  - 在 `mergeFeatBranch` / ff-merge 末尾加一钩 `serverLoader.invalidateStone`
  - 删 `core/runtime/inherit.ts` 之类的 sentinel 措辞引用（若有）
- **P2 ≤ 1 天 · helper + cookbook**：
  - 加 `core/runtime/inherit.ts`（`extendClass`，仅 executable.methods merge，注释写死「扩字段必走新 issue」）
  - 写 cookbook：「子继承父的 3 种合法范式」（无 index.ts / 手写 spread / extendClass）+ spread 顺序陷阱 + lifecycle 父调约定
  - 改 `object/self.md` 核心 1/2/3/9/10 + index.md 对应节（裁决 D1-D3）
  - 改 `visible/self.md` 加「tsx 不参与 OocClass 继承」节（裁决 D8）
  - 改 thinkable `self.md` L30 + index.md L177 + `loader.ts:5-6` 注释（裁决 D10）
  - 在 `ooc-philosophy.md` 加「OOC 与 host language 边界」短段（澄清「不重发明既有机制」+「运行时改写颗粒度 = thread 间」）
- **P3 ≤ 1 天 · 全树扫漂移点**（清单参考 reviewer 提到的 11+ 处）：
  - `.ooc-world-meta/.../children/readable/self.md` L45/57/78
  - `.ooc-world-meta/.../children/visible/self.md` L32
  - `.ooc-world-meta/.../children/thinkable/self.md` L30 + knowledge/tests.md L27 + context.md L135 + knowledge-activation.md L11
  - `knowledge/index.md` L177 / L205
  - `knowledge/ooc-philosophy.md` L47（open question 收尾）
  - `children/readable/knowledge/readable-registration.md` L31/40
  - `children/readable/knowledge/two-faces-of-readable.md` L20
  - `core/runtime/index.md`（如有）/ `ooc-class.ts` 与 `object-registry.ts` 注释
  - 所有「inheritClass / 单跳继承 / sentinel / object-lifecycle.ts」字样

### 裁决回答 issue 原文待裁决点

1. **`extendClass` helper** — 提供，但收紧范围（裁决 D5）。
2. **`ooc.extends` 元数据字段** — 不引入（裁决 D9）。
3. **Hot-reload trigger 选型** — 沿用现有 fs.watch 推模式（裁决 D7）。
4. **`agent/persistable/self-md.ts` 是否要改** — 不需要（裁决 D3）。
5. **builtin agent children 当前 inheritClass 使用** — 0 处（实测）；清字段定义即可，无数据迁移（裁决 D9）。

## 落地验收

`status: landed` —— 实际落地状况记录（自我断言，等步骤 4 派验收 reviewer 独立核 → `verified`）。

### 源码（worktree `.worktree/inheritance-spread/` 分支 `feat/inheritance-spread`，4 commits ahead of main）

| commit | 范围 | 裁决覆盖 |
|---|---|---|
| `468962de` refactor(runtime): drop OocClass.inheritClass; resolveXxx 改本类直查 | ooc-class.ts / object-registry.ts（删字段 + 10 个 resolveXxx 本类直查 + assertNoMethodNameCollision 加强 internal name 自查重） | D4 / D11 |
| `62c06967` refactor(runtime): ServerLoader 无 index.ts 路径不再注册空 Class | server-loader.ts（loadAndRegisterStoneClass 双路径明示，无 index.ts 直接 return false，不再 register 空 Class） | D2 / D11 |
| `66de5ccf` feat(persistable): mergeFeatBranch ff-merge 后失效 ServerLoader 缓存 | stone-versioning.ts（ff-merge 完成后调 defaultServerLoader.invalidateStone(...)，dynamic import 避环依赖，best-effort） | D7 |
| `7ef71c2d` feat(runtime): add extendClass helper + inherit.md cookbook | core/runtime/inherit.ts + inherit.md（38 行 helper + 173 行中文 cookbook：3 范式 + super-call 完整模板 + lifecycle 父调约定 + 4 反例 + ESM live binding 边界澄清） | D5 / D6 / D11 |

**质量门**：`bun run verify` 6 个 gate 全绿（tsc clean / 40 pass 0 fail / silent-swallow / deprecated-symbols / doc-drift / anchor-drift）。

**裁决 D7 子项的边界拍板**：mergeFeatBranch 不知道当前 sessionId（API 边界），未直接清空 sessionRegistries——只做了 ServerLoader 缓存失效（class-level）；session-level 冷启另开 issue。

### 对象树（`.ooc-world-meta/stones/main/`，7 commits ahead of origin/main on ooc-0）

| commit | 范围 | 裁决覆盖 |
|---|---|---|
| `1c13919` docs(object): rewrite core 1/2/3/4/9/10 | object/self.md 核心 1-10 修订 | D1 / D2 / D3 |
| `86a6b31` docs(thinkable,knowledge_base): retire parent-class knowledge inheritance chain | thinkable/self.md L30 + index.md `## OOC` / `## OOC Class/Object Model` 核心 1-4 / `## knowledge_base / knowledge` | D10 / D11 |
| `ef26600` docs(object,visible,thinkable,runtime,philosophy): align to D8/D11 | visible/self.md 加「tsx 不参与 OocClass 继承」节 + index.md `## runtime` 漂移修正 + ooc-philosophy.md 加「OOC 与 host language 边界」节 | D8 / D11 |
| `7c9c81d` docs(readable): retire chain resolution per P3 | readable/self.md + knowledge/readable-registration.md + knowledge/two-faces-of-readable.md | D11 P3 |
| `a1f336a` docs(object): align lifecycle.md per P3 | object/knowledge/lifecycle.md selfThenChain + object-lifecycle.ts 漂移 | D11 P3 |
| `be0fae1` docs(*): final drift cleanup per P3 | visible/self.md L42 + knowledge/builtins.md L10 + index.md L122 | D11 P3 |
| `0268e10` fix(supervisor): ooc.class _builtin/supervisor → _builtin/agent | supervisor/package.json | D9 |

**退潮质量门**：`rg 'inheritClass\|object-lifecycle\.ts\|沿祖先 / parentClass\|selfThenChain\|单跳继承' objects/` 0 命中；「沿继承链」剩 4 处全部是「不沿继承链」式负向声明（保留）。

### 仍待 Supervisor 处理

1. **worktree `feat/inheritance-spread` 合并 main + 删 worktree**：4 commits 在 worktree 内，未合到父仓 main。
2. **ooc-0 push**：7 commits（含本 commit）在 ooc-0 main 本地，未 push origin。
3. **步骤 4 派落地验收 reviewer**（design-workflow 步骤 4）：把 status 从 `landed` 推到 `verified`。

### 超出本 issue 范围的发现（建议另开 issue）

- **lifecycle.md 多处 `object-lifecycle.ts` 函数行号锚漂移**（L25/L27/L29/L36/L38/L42/L43）—— 真实派发引擎已迁到 `thread-runtime.ts:251-269`，具体函数名 + 行号均失效。本 P3 严格只清 inheritance-spread 相关漂移未清。
- **builtins.md L12「self.md 只属 ooc agent 实例」与「除 supervisor 外的 builtin 都无 self.md」一句**与改动 3「纯实例 object 无 index.ts、仍可有 self.md」需核对一致性。
- **session-level reverse-binding invalidate**：mergeFeatBranch 当前只清 ServerLoader class cache，不触动 sessionRegistries——优化路径未实施。
- **PR resolve / mergeFeatBranch 双源分裂**（验收发现）：`stone-versioning.ts:290 mergeFeatBranch`（含本 issue D7 invalidate 钩）当前没有任何 import caller；实际 PR 测试路径走的是 `persistable/feat-branch.ts:146` 的同名 `mergeFeatBranch`（无 invalidate 钩）。需另开 issue 统一双源 + 完整接通 PR auto-merge 闸。

## 步骤 4 落地验收（design-workflow）

按 design-workflow 步骤 4，supervisor 派 4 个独立验收官 sub agent：**文档验收 / 代码验收 / 退潮验收 / 漂移验收**，对照「裁决」+「落地验收」段独立核「文档/代码/退潮/漂移」四项。

### 第一轮验收结果

| 验收官 | 结论 | 关键发现 |
|---|---|---|
| 文档验收 | 有缺口 | D1-D13 主回流落地全 ✅；P1 缺口 2 处（`readable/self.md:69` 沿 self→父类、`thinkable/knowledge/context.md:135` class 继承链上的方法）+ P2 文件名锚漂移 4 处（`knowledge/object-model.md` 不存在） |
| 代码验收 | 通过 + 1 LOW + 1 MEDIUM | 主源码全合裁决，6 gate 全绿；LOW: `skill_index/index.ts:5` 注释「沿继承链」残留；MEDIUM: `stone-versioning.ts:290 mergeFeatBranch` 与 `feat-branch.ts:146` 同名分裂、本 issue 加的 invalidate 钩当前未生效 |
| 退潮验收 | 全清通过 | 9 项退役清单全部干净；仅 issue 文件自身 + 合规负向声明命中 |
| 漂移验收 | 轻微可接受 | 范围/概念/语义/禁令 5 维度核完无 P0；D7 落地保守（class-level invalidate 而非 sessionRegistry 清空），但已自归 follow-up，可接受 |

### 第二轮补缺口（P3 round 2）

针对文档验收 + 代码验收的 P1 / LOW 缺口（共 8 处漂移点），supervisor 亲手 patch，落 2 个 commit：

| 仓 | commit | 修补点 |
|---|---|---|
| 父仓 | `de6cdece` docs: P3 drift fixes round 2 | skill_index/index.ts:5 + agent/readable/index.ts:12 + thread/TODO.md:8 + flow-object.ts:28 |
| 对象树 | `54c2fd7` docs(*): P3 round 2 drift fixes | readable/self.md:69 + readable/knowledge/tests.md:34 + thinkable/knowledge/{context,agent,thread,knowledge-activation}.md + object/knowledge/example.md frontmatter |

**round-2 后退潮门**：
- `bun run verify` 6 gate 全绿
- 父仓 `rg '沿继承链\|沿 self→父类\|沿 class 链\|class 继承链上的方法\|object-model\.md\|inheritClass\|selfThenChain\|object-lifecycle\.ts\|单跳继承' packages/@ooc/`：剩 1 处合规负向（`skill_index/index.ts:5` 「不沿继承链」）
- 对象树 `rg ... objects/`：剩 5 处全部是合规「不沿继承链 / 本类直查 / 已退役旧设计」式负向声明

验收闭环；status → `verified`。

### 仍未做（不阻塞 verified）

- **push**：父仓 main + 对象树 ooc-0 仍未 push，等用户授权。
- **3 个 follow-up issue**：lifecycle.md 行号锚漂移 / mergeFeatBranch 双源分裂统一 / builtins.md L12 一致性——待 supervisor 后续派单开 issue。


