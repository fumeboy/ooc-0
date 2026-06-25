---
title: OOC Object 继承机制重新设计 —— prototype chain + facet override + 元编程 hot-reload
status: draft
date: 2026-06-25
---

# OOC Object 继承机制重新设计

## 背景 / 动机

OOC 当前继承机制（`OocClass.inheritClass: string | null` + `resolveXxx` 沿单跳链解析）有两组问题：

**A. 概念错位**：
1. 设计文档 `object/self.md` 核心 2 写「class 不支持继承」，但代码 `OocClass.inheritClass` 字段 + `resolveObjectMethod` 沿 `inheritClass` 递归实际就是**单跳类继承**——设计描述与实现长期不一致。
2. inheritClass 把两件事用一个字段表达：① is-a 类型关系 ② facet 实现复用。模糊了语义。

**B. 元编程笨重**：
1. **super-call 必须手动 import + 调** —— 子类 method 想 wrap 父类同名 method，要 import 那个具体 method 符号显式调，没有 `super.foo(args)` 语言原语。
2. **facet override 是 all-or-nothing** —— `executable.methods` 是 method-level merge，但其他 facet（readable / persistable / thinkable / visible）是整槽 override；子类只想改一个细节也要重写整模块。
3. **多 facet 复用没法做** —— 一个 class 想"用 agent 的 talk + logger 的 audit"，单链 inheritClass 只能选一个。
4. **运行时 hot-reload 不顺畅** —— agent 在 super flow 改自己的 stones/<self>/executable/index.ts 后，需要 invalidate cache + re-register；当前没有 thinkloop tick 内的自动重 load。

## 现状（锚 index.md 对应 `##` 节）

锚点：
- `## OOC Class/Object Model`（A 区）核心 1-2-3-7-9（class 定义、继承、单例、self.md、agent）
- `## OOC` —— 三主张之三「元编程 → 自我迭代」
- `## executable`（B 区）—— ObjectMethod 注册 + dispatch
- `## persistable`（B 区）—— save/load facet 解析
- `## thinkable`（B 区）—— ThinkableModule facet 解析
- `## readable`（B 区）—— ReadableModule facet 解析
- `## reflectable`（B 区）—— 自我改写身体的执行手段
- `## runtime`（E 区）—— ClassRegistry 泛型 seam（resolveXxx）

涉及文件：
- `packages/@ooc/core/runtime/ooc-class.ts`（OocClass / OocPackageMeta 类型定义）
- `packages/@ooc/core/runtime/object-registry.ts`（resolveConstructor / resolveActive / resolveUnactive / resolveObjectMethod / resolveObjectMethods / resolveWindowMethod / resolveReadable / resolveReadableRender / resolvePersistable / resolveVisibleServer / resolveThinkable）
- `packages/@ooc/builtins/agent/children/thread/runtime/thread-runtime.ts`（method dispatch + ctx 注入）
- `packages/@ooc/core/types/executable.ts`（ExecutableContext —— ctx.super 注入点）

## 改动提案

### 四视角综合（OOP / Rust trait / Go embedding / JS 原型链）

OOC 现在的 registry 解析 = **披着 class 外衣的 JS 原型链**：
- `OocClass.inheritClass` ↔ `__proto__`
- `resolveObjectMethod` 沿 chain 上溯 ↔ 原型链查找
- 每次访问 method 都查 registry ↔ runtime delegation lookup

OOC 与 JS prototype 的核心差异：
1. **命名**：给原型起 nominal 名（`_builtin/agent`），多 instance 共享
2. **facet 分组**：把原型属性按 readable / executable / persistable 等分组解析
3. **持久化**：原型 mutate 不仅在内存（JS 风格），还要落到 stones git（OOC 加的轴）

把 class 重新理解为 **prototype with named facets**，所有元编程难题（override / extend / hot-reload）变成沿原型链的标准操作。

### 改动 1：概念诚实化

| 旧词 | 新词 | 理由 |
|---|---|---|
| 「class 不支持继承」 | 「class 经 prototype chain 委托复用」 | 反映真实行为：runtime delegation lookup |
| OocClass.inheritClass: string \| null | OocClass.proto?: string[] | 数组顺序 = lookup 顺序；空 = 链终点；多元素 = mixin |
| 继承（is-a） | 委托（delegation）/ 复用（reuse） | 语义对齐 |

**保留 OocClass 这个名字**——它仍是 class（运行时角度是 prototype，外部签名仍是 class）。

### 改动 2：`OocClass.proto: string[]` 替代 `inheritClass`

```ts
interface OocClass<Data, Win> {
  id: string;
  /**
   * Prototype chain —— 数组顺序 = facet lookup 顺序。
   * - 空数组（或缺省）= 链终点，无父复用
   * - 单元素 = 等价旧 inheritClass 单跳
   * - 多元素 = mixin 风格 fallback（按顺序找第一个有实现的 class）
   */
  proto?: string[];
  
  // 9 个 facet 槽位（不变）
  construct?, active?, unactive?, init?,
  executable?, readable?, persistable?, visible?, thinkable?;
}
```

`package.json` 的 `ooc.class: string` → `ooc.proto: string[]`。

兼容期：迁移工具读旧 `inheritClass` 字段自动迁到 `proto: [oldVal]`。

### 改动 3：`resolveXxx` 沿 proto 数组按 facet 解析

每个 `resolveXxx` 改为：
```ts
resolveObjectMethod(classId, name): ObjectMethod | undefined {
  const cls = this.classes.get(classId);
  const own = cls?.executable?.methods.find(m => m.name === name);
  if (own) return own;
  for (const parentId of cls?.proto ?? []) {
    const found = this.resolveObjectMethod(parentId, name);
    if (found) return found;
  }
  return undefined;
}
```

同样规则套到 resolveActive / resolveUnactive / resolveReadable / resolvePersistable / resolveVisibleServer / resolveThinkable / resolveConstructor。

### 改动 4：facet-level merging 统一

当前 `resolveObjectMethods`（复数）做 method-name merge，其他 facet 是单点 fallback。**统一规则按维度逐一推演**——继承的具体语义因 facet 性质不同：

#### 三类继承策略

OOC 的 facet 按性质分三类，对应三种继承语义：

1. **method-level merge**（namespace of callables）—— "我的方法集 = 父的方法 + 我新增 + 我覆盖"
   - executable.methods（按 method name 为键）
   - readable.window[]（按 window class 为键，每个 window 内的 window_methods 再按 name merge）
   - visible.methods（如适用，按 method name 为键）
2. **整模块 fallback**（stateful pipeline 单值）—— "我没声明就用父的，要 override 就完整重写"
   - readable.readable（render fn 单值）
   - persistable（save/load 必须同源同模块）
   - thinkable（think / onSchedulerTick 整模块）
   - construct（单函数）
3. **串调（chain invocation）**（lifecycle events）—— "我和父的钩子都跑，我可返 halt 阻断"
   - active
   - unactive
   - init

#### 各维度详细推演

**executable.methods（method-level merge）**：
- 单元 = 单 method（按 name）
- merge：子写同名 method 覆盖父；子未写的 method 沿 proto 链可见可调
- super-call：✅ `ctx.super("methodName", args)` 调链上同名 method

**readable.window[]（window class 级 merge + 每窗内 method 级 merge）**：
- 单元 = 单 WindowClassDecl（按 class 名为键）
- merge：子声明同名 window class，则替换父；子未声明的 window class 沿链继承
- 单窗内 window_methods 按 name 再做 merge
- object_methods（字符串引用列表）：整数组替换——它声明窗内可见的 object method，不智能合并
- super-call：✅ window method 内 `ctx.super("methodName", args)` 调同 window class 同名 window method

**readable.readable / readable.render（整模块 fallback）**：
- render fn 是单值 pipeline，整 fn 整体 override
- 子未声明 render fn 沿链找首个非空
- 不做 method-level merge（render 是 stateful pipeline，merge 无良定义）

**persistable（整模块 fallback）**：
- save 和 load 必须**配对**（自定义 save 就配自定义 load）—— `resolvePersistable` 整模块解析，不能 save 沿链找一个、load 沿链找另一个
- 子覆盖时必须整模块声明
- super-call 可用但罕见（少见场景：子在父 save 前后包装加密/压缩）

**thinkable（整模块 fallback）**：
- 仅 thread 类注册
- 整模块 fallback；hook 内不做 method-level merge
- think 是 LLM tick pipeline，部分 override 难做

**visible（method-level merge）**：
- visibleServer methods 与 executable.methods 同构（name 为键，子覆盖父）
- v1 不在 visible ctx 注入 super（人类 UI 端 method 罕见 wrap parent）

**construct（整函数 + super 调用）**：
- 单函数，子覆盖父
- super-call：✅ ConstructorContext 加 `super(args?)` 调链上同 class 的 construct
- **关键**：父 ctor 产 partial data + 子 ctor `{...parentData, ...mySubFields}` spread —— 经 super 显式表达，不做 runtime 自动 merge 魔法

```ts
construct: {
  exec: async (ctx, args) => {
    const parentData = await ctx.super(args);
    return { ...parentData as object, mySubField: args.x };
  }
}
```

**active / unactive / init（串调）**：
- ⚠️ 与 method 单覆盖**不同**——这些是事件性钩子，多个 class 都可能想响应
- 派发逻辑：子先跑，然后沿 proto 链继续调父（除非子返回 `{halt: true}` 阻断）
- super-call 不需要——hook 本身就是串调，子不必显式 super

```ts
// 派发示例
for (const cls of [self, ...protoChain]) {
  const hook = cls.active;
  if (hook) {
    const result = await hook.exec(ctx, self);
    if (result?.halt) break;
  }
}
```

理由：父 class 有 `active` 做 init A；子 class 有 `active` 做 init B；"按 proto 链找第一个非空"会**丢失父的 init A**。lifecycle hook 必须**全部跑**。

#### Data 类型继承（types.ts）

**关键设计问题**：method 继承了，data 形状是不是也要继承？

**结论**：是 —— 子 class 的 types.ts 显式 `extends ParentData`，纯 TS 语言机制处理：

```ts
// builtins/agent/types.ts
export interface Data { self: string; }

// stones/main/objects/coder/types.ts
import type { Data as AgentData } from "@ooc/builtins/agent/types.js";
export interface Data extends AgentData {
  codeStats?: Stats;  // 子加自有字段
}
```

**多 proto fallback** 的 data 类型：
```ts
import type { Data as AgentData } from "@ooc/builtins/agent/types.js";
import type { Data as LoggerData } from "@ooc/builtins/loggable/types.js";
export interface Data extends AgentData, LoggerData {
  mySpecific?: X;
}
```
TS interface 多继承可用，字段名冲突 TS 会报错（合理）。

**为什么是显式 extends 而不是 runtime 自动**：
- 显式优于魔法：子明确知道自己的 data 形状包括父的字段
- 编译期类型保证：method 在子 data 上跑能编译期看到父字段（因为 extends）
- 父 ctor 产 data 经 `await ctx.super(args)` 拿到（显式），子 ctor `{...parentData, ...}` 拼接

**ConstructorContext 加 `super` 拿父 ctor 产物**——这是 data 继承的运行时机制。类型上对应 TS interface extends，运行时上对应父 ctor 调用。

#### 一个综合表

| 维度 | 单元粒度 | merge 策略 | super-call | data 影响 |
|---|---|---|---|---|
| executable.methods | 单 method | name 为键，子覆盖父 | ✅ ctx.super(name, args) | method 在 self.data 上跑——self.data 含父 Data 字段 |
| readable.window | 单 WindowClassDecl | window class 为键，子覆盖父 | ✅ window method 内 | window method 在 self.data 上跑（只读） |
| readable.readable (render fn) | 单函数 | 子覆盖父（找首个非空） | ❌ | render 在 self.data 上跑 |
| persistable | 整模块 | 子覆盖父（save/load 必须同源） | 可用但罕见 | save/load 操作完整 data（父+子字段） |
| thinkable | 整模块 | 子覆盖父 | 可用但罕见 | thread-only |
| visible | 单 method | name 为键，子覆盖父 | ❌ v1 | 同 executable |
| construct | 单函数 | 子覆盖父 | ✅ ctx.super(args)（ConstructorContext） | **关键**：子拼 `{...await ctx.super(args), ...}` |
| active | 单函数 | **串调**（子先跑，可 halt） | ❌（hook 本身串调） | hook 在 self.data 上跑 |
| unactive | 单函数 | **串调** | ❌ | 同 active |
| init | 单函数 | **串调**（World 启动） | ❌ | 不跑 data |
| **Data 类型** | TS interface | 子显式 `extends ParentData` | N/A | TS 编译期机制 |
| knowledge | md 文件 | inheritable=true 才被子继承 | N/A | 实例级 + 内容级，正交 |

#### self.md 的特殊性

self.md 是 **agent 实例**身份（每个 agent 实例各有自己的 self.md，落在 `stones/main/objects/<id>/self.md`），由 agent persistable 写入 `data.self` 字段，不是 class 级继承的对象。它正交于本 issue 讨论的 class 继承机制。

#### knowledge 的正交性

knowledge 的 `inheritable: true` 是 **领域层级 inheritable 轴**——按 class proto chain（或更广，按祖先目录扫描）决定子 agent 看不看父 agent 的 knowledge。这是 thinkable/knowledge 维度的具体设计，正交于本 issue 的 facet 继承机制。


### 改动 5：`ctx.super(methodName, args)` —— 原型链委托原语

在 `ExecutableContext` 加 `super`：
```ts
interface ExecutableContext {
  // ... 现有字段
  /**
   * 沿当前对象 class 的 proto 链上溯调同名 object method。
   * 等价于 JS `Reflect.getPrototypeOf(this).foo.call(this, args)`。
   * 找不到则抛错（fail-loud）。
   */
  super(methodName: string, args?: Record<string, unknown>): Promise<unknown>;
}
```

ThreadRuntime 注入实现：
```ts
ctx.super = async (methodName, args) => {
  const myCls = registry.getClass(ctx.object.class);
  for (const parentId of myCls?.proto ?? []) {
    const found = registry.resolveObjectMethod(parentId, methodName);
    if (found) return found.exec(ctx, self, args);
  }
  throw new Error(`[super] ${methodName} not found in proto chain of ${ctx.object.class}`);
};
```

### 改动 6：运行时 prototype mutate API

agent 在 super flow 调用：
```ts
runtime.patch_self_prototype({
  patch: {
    executable: { methods: [newTalkFn] },  // method-level partial（merge with existing）
  },
});
```

`builtins/runtime/executable/method.patch_self_prototype.ts` 调 `registry.patch(classId, patch)`：
```ts
ClassRegistry.patch(classId: string, patch: Partial<OocClass>): void {
  const cur = this.classes.get(classId);
  if (!cur) throw new Error(`unknown class: ${classId}`);
  // facet-level merge（method-name 合并、其他整槽覆盖）
  const updated = mergeOocClass(cur, patch);
  this.classes.set(classId, updated);
}
```

**两种 mutate 持久化**：
- **runtime in-memory only**：调 `patch_self_prototype` —— 仅本 session 生效（下次 hydrate 重置）
- **持久化进 stone**：经 reflectable feat-branch PR 改 `stones/main/objects/<self>/executable/index.ts` 文件 → reviewer 批准 → ServerLoader 重新 register。这是已有路径，不变。

### 改动 7：hot-reload 元编程支持

thinkloop 每 tick 末尾（或显式 trigger）：
```ts
// 检测：本 thread 的 owner agent 的 stone executable 文件 mtime 变化
if (await detectSelfClassEdited(thread)) {
  await serverLoader.invalidateStone({ baseDir, objectId: thread.calleeObjectId });
  await serverLoader.loadAndRegisterStoneClass(...);
}
```

让 agent 改完文件**下一 tick 立刻生效**，不必重启进程。

## 受影响设计元素

对照 `knowledge/index.md` 的 `##` 元素清单：

- `## OOC`（A 区）—— 元编程主张的实现机制
- `## OOC Class/Object Model`（A 区核心 1/2/3/9）—— class 不支持继承 → 改成 prototype delegation chain
- `## executable`（B 区）—— ExecutableContext 加 super；method-level merge 仍是规范
- `## readable`（B 区）—— window-class merge（新）
- `## persistable`（B 区）—— facet 整槽 fallback（不变）
- `## thinkable`（B 区）—— facet 整槽 fallback（不变）
- `## visible`（B 区）—— facet 整槽 fallback（不变）
- `## reflectable`（B 区）—— in-memory patch_self_prototype + feat-branch PR 两通道并存
- `## runtime`（E 区）—— ClassRegistry 加 patch；ServerLoader 加 hot-reload detect

## 风险与权衡

1. **概念翻新风险**：把 inheritClass → proto: string[] 是命名 + 语义双重变化，影响 11 个 builtin class 的 package.json。需迁移工具。
2. **`ctx.super` 实现量大**：要在 ThreadRuntime 注入到 ExecutableContext。当前 ctx.super 不存在，新增字段会影响类型层 + dispatch 层。
3. **hot-reload 边界**：thinkloop tick 末尾 detect 频率太高（每 tick 一次 stat），可改为 file watcher。
4. **多 proto chain 的 diamond 问题**：JS 原型链单链没此问题；OOC 数组顺序解决 —— 第一个找到就返。需文档明确「按数组顺序，不深度优先合并」。
5. **patch_self_prototype 与 PR 通道的关系**：in-memory mutate 不进 PR 是合规的吗？需要 reflectable 章节明确「runtime mutate 是实验态、PR 沉淀是合规态」。

## 待裁决点

1. `OocClass.proto: string[]` vs 保留 `inheritClass` + 加 `mixins: string[]` —— 拆开还是合并？（建议合并到 proto，单字段更简单。）
2. facet merge 三类策略（method-merge / 整模块 fallback / 串调）—— 边界正确吗？特别是 active/unactive/init 用串调而非单覆盖，与 OOP 主流（Java 子类 method override 父 method）不同——需明确这是**因为它们是 lifecycle event 不是 polymorphic dispatch**。
3. `ctx.super` vs `ctx.proto` —— 用哪个名字？（建议 super：与 OOP 语言原语对齐，最熟悉。）
4. **Data 类型继承用 TS extends 显式声明** vs runtime 自动 merge —— 建议显式 extends（编译期保证 + 显式优于魔法）。但需明确父 ctor 产物经 `ctx.super(args)` 在子 ctor 内手 spread—— runtime 不自动合并。
5. **construct 的 super 语义** —— ConstructorContext 加 super 方法（参数为 args，返回 ParentData）；子 ctor 用 `{...await ctx.super(args), ...mySubFields}` 拼接。这是 data 继承的运行时配对——method 继承也意味着 data 继承。
6. **active/unactive halt 信号**：返 `{halt: true}` 的具体类型怎么扩展现有 `UnactiveResult`？（active 当前返 void；unactive 返 UnactiveResult{delete?}。需要 active 也加 halt 语义、统一返 `{halt?: boolean, delete?: boolean}`。）
7. `patch_self_prototype` —— 是 `_builtin/runtime` 的 method 还是单独 `_builtin/reflectable` builtin？（建议放 _builtin/runtime，避免新增 builtin。）
8. hot-reload 实现：thinkloop tick 末尾 detect vs file watcher？（建议先 tick 末尾、stat 廉价；优化为 watcher 后续做。）
9. 兼容期长短：旧 `inheritClass` 字段保留多久？（建议保留一个版本，next minor 删。）

## 实施分期建议

- **P1**：纯 rename + 概念诚实化（`proto: string[]` 替代 `inheritClass` + 文档对齐），不动 facet merge / ctx.super / mutate API。低风险、纯重命名。
- **P2**：`ctx.super` 注入 + 测试。
- **P3**：facet-level merging 统一（特别是 readable.window-class merge）+ 测试。
- **P4**：`patch_self_prototype` + in-memory mutate API + reflectable 文档更新。
- **P5**：hot-reload detect + thinkloop 集成。

## review 记录

**review fan-out 完成日期：2026-06-25**。派出 7 个 reviewer（6 维度主人 + 1 完整性批评官）。汇总如下——按维度分组，每条标主要立场（✅赞同 / ❌反对 / ⚠️建议 / 🆕新发现）。

### A.OOC Class/Object Model 主人意见

- ✅ **概念诚实化必须**：现行核心 2「class 不支持继承」与实现长期内战，proto rename 是必修。
- ⚠️ **类比措辞过远**：「class is prototype with named facets」不要顶层翻案——class 仍是 class（注册期定义），其**复用机制**才是 prototype-style delegation。新核心 2 措辞："class 经 proto chain 复用，是委托非 is-a"。
- ⚠️ **P1 单跳约束**：`proto: string[]` 字段定义保留扩展空间，但**P1 语义硬卡 ≤1 元素**（schema 层 fail-loud），mixin 单独立 issue（多 proto 的 MRO/diamond 缺裁决）。
- ✅ **Data 类型 TS extends 是正解**：编译期保证 + 显式优于魔法 + 与 method 继承对称美。
- 🆕 **核心 8 children-proto 正交性必须显式声明**：parent_id/child_id 命名约定**不**隐含 proto，children 的 proto 由自身 package.json 声明。
- ⚠️ **lifecycle halt 信号在多 proto 下需补语义**（单跳时无问题，多 proto 时需明）。
- ⚠️ **拆 P4/P5 出本 issue**：hot-reload / patch_self_prototype 是 reflectable 维度独立 issue，不应在本 issue 一并裁决。

### B.executable 主人意见

- ⚠️ **`ctx.super` 返回类型收紧**：从 `Promise<unknown>` 改为 `Promise<ObjectMethodResult>`——经 normalizeMethodResult 收口。
- ⚠️ **ConstructorContext.super 泛型化**：`super<ParentData>(args?): Promise<ParentData>`，子需显式 import 父 Data 类型（与 TS extends 一致）。
- ⚠️ **找不到 super 时错误信息带 proto chain 路径**（便于多 proto 排查）。
- ⚠️ **schema/permission/route 不在 super 链上再跑**：闸门只在 method 调用入口，链调内部不重复闸（self.md 明文）。
- ❌ **method 上加 hooks 不是延后、是否决**：before/after hook 与 ctx.super 95% 重合，违反「单一权威」。如未来需要 method 执行旁路观测，归 observable 维度新 issue。
- ❌ **拆开 ActiveResult / UnactiveResult 类型**：不让 active 返 UnactiveResult（语义说谎）。抽公共 `LifecycleResultBase { halt? }`，各自扩展（active 无 delete、unactive 有 delete）。
- 🆕 **lifecycle 串调顺序**：active 祖先→自己；unactive 自己→祖先；init 祖先→自己（与 ctor/dtor 直觉一致）。在 self.md 明文。
- ⚠️ **multi-proto 的 super 语义 first-hit**：按数组顺序找首个有实现，不深度合并、不 diamond merge。self.md 与 index.md 双写一遍（成对回流）。

### B.readable 主人意见

- ⚠️ **window-class merge 术语纠偏**：不是「method-level merge / namespace of callables」，是「**集合元素 merge（按 class 名为键）**」。和 executable.methods 同构但语义不同——一个按视角投影，一个按可调名。
- ⚠️ **render fn 整 fn override 理由补强**：ReadableProjection 三字段（class / content / consumedMessageIds）是**原子决策**——硬拆 method-level 会产生「class 谁说了算 / content 谁拼」歧义。
- ✅ **window method 内 `ctx.super` 守只读铁律**：只能调链上同 window class 同名 window method（不能跨调 object method）。
- ⚠️ **必须明确禁止跨类型 super**：注册期校验已 fail-loud（window method 与 object method 同名）；super 实现照此分发。
- ❌ **object_methods 不是「整数组替换」、应是「字符串去重并集 merge」**：父白名单 ∪ 子白名单 → 去重最终白名单。如未来需"隐藏父方法"另起黑名单语法 issue。
- 🆕 **新增 `ctx.parent_render()` 原语**：render fn 无名可指，不该用 `ctx.super(name)`——加专名 `parent_render(): Promise<ReadableProjection | undefined>` fail-soft（父无 render 返 undefined）。
- 🆕 **WindowMethodContext extends ReadableContext**：window method ctx 加 super 字段；render fn ctx 加 parent_render——两条原语分工。

### B.persistable 主人意见

- 🚨 **blocker 1：save/load 同源原子**——必须取自**同一 class** 的同一个 persistable 模块，不允许跨链拼接。`resolvePersistable` 返**首个非空的整 PersistableModule**，不分槽各自沿链找。**self.md 增新核心 9**。
- 🚨 **blocker 2：inline 模式 sentinel 字段**——`PersistableModule` 加 `mode?: "inline" | "default" | "custom"`，避免子类沿链 "全 undefined fall through" 破坏 inline 语义。
- ⚠️ **自定义 save 责任范围**：父 save 只写自己 class 声明的字段；子加 Data 字段必须 override persistable（要么 `await ctx.super.save(...)` + 追加，要么整模块重写）。**super-call 在 persistable 上从「罕见」改为「常用」**——子加字段就要 super。
- 🆕 **PersistableContext 加 `super`**：让自定义 save 能委托链上父 save。当前 PersistableContext 无 super 字段，是缺口。
- ✅ **默认 data.json round-trip 子 Data extends 父 Data 安全**：JSON 不分父子字段，stringify 写全、parse 全恢复。
- 🆕 **patch_self_prototype 替换 persistable 模块的 session 边界**：新 save 写出的字节仅本 session 旧 class load 兼容——跨 session 持久化必经 PR 沉淀，否则下次 session 启动数据不可恢复。**self.md 增新核心 10**。

### B.thinkable 主人意见

- ❌ **hook 颗粒度纠错**：thinkable**不是**「整模块 fallback」、是 **hook-field-level fallback**——ThinkableModule 的每个 hook 字段（think / onSchedulerTick）各自沿 proto 链找首个非空。两个字段已经是 optional，本就是独立的可选 slot。
- ⚠️ **resolveThinkable 接口改型**：从「返整 module」改为「按字段独立沿链解析」或返 lazy facade。
- ❌ **knowledge 与 proto chain 不是正交、是部分耦合**：
  - 正交部分：knowledge inheritable 标记决定哪几条向下传——内容轴。
  - 耦合部分：knowledge loader 沿什么链向上找——必然受 proto 链数组化影响。
- 🆕 **multi-proto knowledge 扫描语义待裁决**：`proto: [A, B]` 时子继承 A 与 B 各的 inheritable knowledge；同名（filename）冲突按数组顺序取先者 + warn。
- ⚠️ **hot-reload thinkable 侧透明**：context 经 registry 透明感知 class 变更，但 **knowledge 双源 invalidate 需与 stone 文件 mtime 联动**。

### B.reflectable 主人意见

- 🚨 **核心翻译**：in-memory `patch_self_prototype` 不破坏两通道铁律，但**必须升格为「实验态」第三类**——self.md 新增核心 4'：「实验态不是沉淀」（不入 git、不入 pool、不可审计）。
- ❌ **issue 改动 7 hot-reload 时机选错**：tick 末尾 stat stones/main 违反铁律（agent 不能直接编辑 stones/main）。应改为：
  - 实验态生效 = `patch()` 直接改 registry，零 fs。
  - 沉淀态生效 = PR merge 完成的 finalizer 内 invalidate + reload，不靠 tick stat。
- ⚠️ **必须显式 promote 闸门**：实验态 → 选择性提升到 PR 通道，不应自动 sediment。否则「自演化 silently 断裂」。
- ⚠️ **元编程闭环 6 步明文**：① patch 实验 → ② 验证 → ③ promote_experiment_to_feat_branch → ④ commit + PR → ⑤ reviewer 批准 + merge → ⑥ 合入回调 invalidate + reload。当前 issue 跳了 ③。
- 🆕 **patch_self_prototype 接收 source 字符串而非函数对象**：函数对象 promote 时无法序列化（闭包丢失）。应是 `{ methods: [{ name, source: "export async function..." }] }`。
- ❌ **patch_self_prototype 不该放 `_builtin/runtime`**：违反 self.md 核心 8「反思方法只在反思场所显示」。应挂 reflect_request window 的 `for_reflectable` method。
- ✅ **ctx.super 是反思的细粒度原语**：sub agent 增量改父行为而非全量重写，缩小 PR diff，便于 reviewer 审。

### E.runtime 主人意见

- ⚠️ **环检测必须做**：`proto: ["a"]、a.proto: ["b"]、b.proto: ["a"]` 死循环。注册期 DFS + visited set fail-loud 拒绝注册环；菱形 DAG 放过。
- ⚠️ **proto 数组靠左优先**（与主流 MRO 一致）：merge 时靠右先写、靠左覆盖。`proto: [Agent, Logger]` 直觉 Agent 是主父、Logger 补充 mixin。
- 🆕 **resolveObjectMethod 必须返 `{method, ownerClassId}`**：super 跟踪「当前调用是哪一层」的前置——否则 super 在父 method 内再调 super 会跳错（祖父 → 父再 super → 跳回父自己）。
- 🆕 **新增 resolveWindowClasses（复数）**：渲染期需要"这个 class 的所有可见 window class 列表"——按 class 名为键、子整 decl 覆盖父。
- 🆕 **新增 resolveActiveChain / resolveUnactiveChain / resolveInitChain**：沿 proto 链收集**全部非空** hook，串调时 from chain 数组。
- ⚠️ **patch_self_prototype 限定在 ObjectInsRegistry**（session 级）+ deep-clone 自保：不污染 builtinClassRegistry 跨 session。
- ⚠️ **hot-reload 推荐 thinkloop tick 末尾 stat 当前 thread owner**（单 stat/tick，开销低）；后续优化为 chokidar 推模式。
- 🆕 **LoC 估算**：P1 ~200、P2 ~100、P3 ~150、P4 ~120、P5 ~30。

### 完整性批评官意见

#### 漏掉的受影响元素

- 🆕 **B.collaborable**：say method 在 thread 三视角下的继承 + super-call 在方向敏感的 say 上的语义。
- 🆕 **B.observable**：hot-reload 期间 loop_N / loop_N+1 的语义边界、ContextSnapshot 一致性。
- 🆕 **B.app**：`PUT /stones/:id/file?path=package.json` 改 ooc.proto 后 server 主动 invalidate + reregister 钩子。
- 🆕 **B.visible**：visible/index.tsx 前端资源的文件级 fallback 语义。
- 🆕 **E.knowledge_base**：loader「沿 parentClass 扫」是否随 proto 链改。
- 🆕 **E.thread**：未来扩展 thread 子类时 thinkable 整模块 fallback / inline persistable mode 的继承。
- 🆕 **E.method_exec_form**：method 内 sub-field（route / intents 推导器）的 merge 粒度。

#### Issue 自洽性问题

- 🚨 **`ooc.class` vs `ooc.proto` 字段错位**：`ooc.class` 同时承担 ① object→class 实例 binding ② class→class 单跳继承——一刀切迁成 `ooc.proto: string[]` 让实例 binding 也变数组，概念错位。**必须拆字段**：`ooc.class` 保留实例 binding；新加 `ooc.proto: string[]` 仅 class→class chain。
- ⚠️ **halt 与 delete 优先级**：子 unactive halt 在前，父 unactive 返 `{delete: true}` 会被压制吗？issue 未答。
- ⚠️ **ctx.super 多 proto index**：mixin 时子想显式调链上第 2/3 个 proto 的 foo——issue 无 `ctx.super_at(protoId, methodName)`，要么补、要么明确「不支持」。
- ⚠️ **patch_self_prototype 能否增删 proto 数组**？mixin 动态化的入口，应明确「允许 / 禁止」。
- ⚠️ **hot-reload 与 paused thread**：tick 末尾 detect 在 paused thread 上不会触发；需 file watcher / 显式 invalidate 兜底。
- 🚨 **Data 类型继承 vs persistable 整模块 fallback 张力**：子 TS extends 加字段、子未声明 persistable → load 经父 → 父 load 只读父字段 → 子字段 silent 丢失。必须明示「子加 Data 字段就必须 override persistable」。

#### 与代码现状的冲突

- 🚨 **风险 1 误读现状**：issue 说「影响 11 个 builtin package.json，需迁移工具」——实测 packages/@ooc/builtins/**/package.json **都不声明 ooc.class**，仅 .ooc-world-meta/.../supervisor/package.json 持 ooc.class 做实例 binding。真正改造点是 core 三文件 + supervisor 一个 package.json。

#### 与流程冲突

- ⚠️ **术语漂移管控**：全树「inheritClass / 单跳继承 / class 不支持继承」字样散布在 core 源码注释 + .ooc-world-meta 各 self.md / index.md / D 区交叉契约 + 多份历史 issue。本 issue P1 末尾必须加一步「全树扫漂移点并改写 self.md / index.md / 代码注释」（成对回流）。
- ⚠️ **与并行 issue `2026-06-25-radical-rebuild-from-root.md` 协调**：同日两条 issue 都触动对象模型核心 1-3，需 Supervisor 协调先后/合并/优先级。

---

## 裁决（Supervisor 汇总）

基于 7 个 reviewer 的 fan-out 意见 + 完整性批评官的扫漏，Supervisor 做出如下裁决：

### 裁决 1：核心概念表述（A 区主人 + 完整性批评官）

- **保留 `OocClass` 名字** —— class 仍是 class（注册期定义）。
- **重命名 `inheritClass: string | null` → `proto: string[]`**——但 P1 阶段**强制 ≤1 元素**（schema fail-loud），mixin 留待独立 issue。
- **`package.json` 字段拆分**：保留 `ooc.class: string`（object→class 实例 binding）；新增 `ooc.proto: string[]`（class→class 复用链）。
- **新核心 2 措辞**：「class 经 proto chain 复用」——委托非 is-a；**不**用「prototype with named facets」顶层翻案。
- **核心 8 补一句**：children 命名空间与 proto 正交，children 的 proto 由其自身 package.json 显式声明。

### 裁决 2：facet 继承三类策略（多维主人共识）

- **method-level merge**（按 name / class 名为键）：executable.methods / readable.window[]（按 window class 名）/ visible methods
  - readable.window 内 window_methods 二级 name-merge
  - readable.window 内 object_methods 字符串去重并集 merge（不是整数组替换）
- **hook-field-level fallback**（每字段独立沿链找首个非空）：readable.readable / persistable（整模块同源原子）/ thinkable（每 hook 独立）/ construct / visible 整模块
- **chain invocation 串调**（沿链全部跑，子 halt 阻断）：active / unactive / init
  - 串调顺序：active 祖先→自己 / unactive 自己→祖先 / init 祖先→自己

### 裁决 3：super-call 设计（B.executable + B.readable）

- **`ctx.super(methodName, args)`** 注入 ExecutableContext —— 返 `Promise<ObjectMethodResult>`（normalize 后），错误信息带 proto chain。
- **`ctx.super<ParentData>(args)`** 注入 ConstructorContext —— 泛型化，子显式 import 父 Data。
- **`ctx.parent_render()`** 注入 ReadableContext（render fn 专用）—— 返 `Promise<ReadableProjection | undefined>` fail-soft。
- **`ctx.super`** 注入 WindowMethodContext（window method 专用）—— 守只读铁律，只调同 window class 同名 window method、不跨调 object method。
- **schema/permission/route 不在 super 链调时再跑**（闸门只在 method 调用入口）。
- **resolveObjectMethod 必须返 `{method, ownerClassId}`**：super 跟踪当前调用层的前置。

### 裁决 4：lifecycle 返回类型重构（B.executable）

```ts
interface LifecycleResultBase { halt?: boolean; }
interface ActiveResult extends LifecycleResultBase {}
interface UnactiveResult extends LifecycleResultBase { delete?: boolean; }
type ActiveHook<Data> = ...;   // 返 ActiveResult
type UnactiveHook<Data> = ...; // 返 UnactiveResult
```

OocClass 上的 `active?` / `unactive?` 类型拆开。Halt 与 delete 优先级：halt 阻断后续 hook 但**不**压制本 hook 自己的 delete 决议（即 unactive halt+delete 都生效）。

### 裁决 5：reflectable 三态明确（B.reflectable）

- **沉淀两通道（铁律不破）**：pool sediment 直写、stone 经 feat-branch PR。
- **实验态第三类（新增核心 4'）**：runtime in-memory `patch_self_prototype` —— session-scoped、不入 git/pool、不可审计。
- **显式 promote 闸门**：`promote_experiment_to_feat_branch()` 把 in-memory patch **序列化为可读 TS 源码**（patch 接收 source 字符串而非函数对象）写入 feat-branch worktree → 走 PR。
- **反思方法位置**：`patch_self_prototype` / `promote_experiment_to_feat_branch` 挂 reflect_request window 的 `for_reflectable` method，**不挂** `_builtin/runtime`（违反核心 8）。
- **hot-reload 时机**：实验态零 fs（patch 直改 registry）；沉淀态在 **PR merge 完成的 finalizer** 触发 `serverLoader.invalidateAndReregister(objectId)`——**不**在 thinkloop tick 末尾 stat。

### 裁决 6：persistable 同源原子 + inline mode（B.persistable）

- **`resolvePersistable(classId)` 返首个非空的整 PersistableModule**（save/load 同源，不拆分沿链）—— self.md 新核心 9。
- **`PersistableModule.mode?: "inline" | "default" | "custom"`** sentinel 字段，避免子类沿链 "全 undefined fall through" 破坏 inline 语义。
- **PersistableContext 加 `super(data)`**：让自定义 save 能委托父 save。
- **子加 Data 字段必须 override persistable**（否则 silent 丢字段）—— self.md 派生设计明示。
- **patch_self_prototype 替换 persistable 模块的 session 边界**（self.md 新核心 10）。

### 裁决 7：knowledge 与 proto chain 部分耦合（B.thinkable + 完整性批评官）

- knowledge **内容轴**（inheritable 标记）**正交**于 proto chain。
- knowledge **扫描路径**沿 proto 链——loader 的「沿 parentClass 扫」改成「沿 proto 链扫」。
- multi-proto 时同名 knowledge 按 proto 数组顺序取先者 + warn（与 method 一致）。
- knowledge 双源 invalidate 与 stone 文件 mtime 联动。

### 裁决 8：环检测 + multi-proto 收敛（E.runtime）

- **注册期 DFS 环检测**：`ClassRegistry.register` 时 visited set 验证无环；fail-loud 拒绝注册环；菱形 DAG 放过。
- **P1 单跳约束**（仅允许 0 或 1 元素），multi-proto / mixin 留待独立 issue 处理 MRO / diamond / 顺序优先级语义。
- 字段类型保留 `string[]`，留 schema 扩展空间。

### 裁决 9：拆分独立 issue（A 主人 + 完整性批评官）

本 issue 范围收紧为 **P1-P3**：rename + ctx.super + facet merge 三类策略。下列拆出独立 issue（不在本 issue 裁决，不在本 issue 落地）：

- **新 issue A**：multi-proto / mixin 设计（MRO / diamond / 同名冲突策略）—— 解锁本 issue 的 P1 单跳约束。
- **新 issue B**：reflectable 实验态 + promote 闸门 + hot-reload —— 包含 patch_self_prototype（source 字符串接口）/ promote_experiment_to_feat_branch / PR merge finalizer hot-reload。
- **新 issue C**：lifecycle hook 类型重构（ActiveResult / UnactiveResult 拆分 + halt 语义）—— 独立小 issue，与 P3 facet merge 并行可。

### 裁决 10：受影响元素清单补全

完整性批评官指出的漏列元素一并纳入：
- 补 reviewer：B.collaborable / B.observable / B.app / B.visible(tsx 资源) / E.knowledge_base / E.thread / E.method_exec_form
- 这些维度的具体推演归本 issue 范围（method 继承的连带影响），但每条 reviewer 评论尚未做——**Supervisor 暂以本轮已有信息裁决，下一轮回流验收时补 fan-out 这些维度的轻 review**。

### 裁决 11：术语漂移全树清理

P1 末尾加一步「全树扫 inheritClass / 单跳继承 / class 不支持继承 等字样，按裁决 1 措辞改写 self.md / index.md / 代码注释 / D 区交叉契约」。历史 issue（landed/verified 状态）不动。

### 裁决 12：与并行 issue 协调

本 issue 与 `2026-06-25-radical-rebuild-from-root.md` 都触动对象模型核心。后者是**已 landed 的实施 issue**（极简化 + 重建），本 issue 是**对象模型核心机制的设计修订**——两者范围不重叠。本 issue 落地时引用 `radical-rebuild` 的核心 1 结构作前置，不冲突。

---

## 实施分期（裁决后版本）

- **P1**（≤2 天）：纯 rename + 字段拆分 + 概念诚实化
  - `OocClass.inheritClass` → `proto: string[]`（强制 ≤1 元素）
  - `package.json` 拆 `ooc.class`（实例 binding）/ `ooc.proto`（class chain）
  - 全树扫漂移 + 改写 self.md/index.md/代码注释
  - 注册期环检测（DFS visited set）
  - 改 self.md 核心 2 措辞 + 补核心 8 children-proto 正交
- **P2**（≤3 天）：ctx.super / ctx.parent_render / ConstructorContext.super 注入
  - resolveObjectMethod 返签名扩展（含 ownerClassId）
  - 测试覆盖：单层 super、双层 super、跨维度禁调、找不到 fail-loud
- **P3**（≤4 天）：facet-level merging 统一
  - method-level merge（executable / readable.window/window_methods / visible methods）
  - object_methods 字符串去重并集
  - hook-field-level fallback（readable.readable / persistable / thinkable / construct）
  - 串调（active / unactive / init）+ resolveXxxChain 新增 + dispatcher 重写
  - persistable.mode sentinel 字段（inline 守护）

P4 / P5 拆出独立 issue（裁决 9）。


## 落地验收

（待 landed 后填）
