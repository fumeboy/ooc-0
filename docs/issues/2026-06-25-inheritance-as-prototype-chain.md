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

待 fan-out。建议 reviewer：
- A.OOC Class/Object Model
- A.OOC（元编程主张实现）
- B.executable（ctx.super）
- B.reflectable（mutate 两通道）
- E.runtime（registry / ServerLoader）
- 完整性批评官（扫漏）

## 裁决

（待裁决后填）

## 落地验收

（待 landed 后填）
