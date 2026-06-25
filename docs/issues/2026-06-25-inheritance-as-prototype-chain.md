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

当前 `resolveObjectMethods`（复数）做 method-name merge，其他 facet 是单点 fallback。**统一规则**：

| Facet | merge 策略 |
|---|---|
| executable.methods | method name 为键，子覆盖父（保持现状） |
| readable.window[] | window class 为键，子覆盖父（**新**：currently 整槽 override） |
| readable.readable (render fn) | 单值，沿链找第一个非空（保持现状） |
| persistable | 单值（整 save/load 模块），沿链找第一个非空 |
| thinkable | 单值（整 think/onSchedulerTick 模块），沿链找第一个非空 |
| visible | 单值（整 visible server 模块），沿链找第一个非空 |
| construct / active / unactive | 单值，沿链找第一个非空 |

「单值」的 facet（render fn / persistable / thinkable / visible / construct / active / unactive）选择沿链找**第一个非空**——保持简单，子类要 override 就**完整声明**。如果将来发现需要细粒度，再讨论 init/before/after hook。

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
2. facet merge 粒度：除 method-name / window-class 之外是否还要细化？（建议先用 method-name + window-class 双 merge，其余整槽，避免过度抽象。）
3. `ctx.super` vs `ctx.proto` —— 用哪个名字？（建议 super：与 OOP 语言原语对齐，最熟悉。）
4. `patch_self_prototype` —— 是 `_builtin/runtime` 的 method 还是单独 `_builtin/reflectable` builtin？（建议放 _builtin/runtime，避免新增 builtin。）
5. hot-reload 实现：thinkloop tick 末尾 detect vs file watcher？（建议先 tick 末尾、stat 廉价；优化为 watcher 后续做。）
6. 兼容期长短：旧 `inheritClass` 字段保留多久？（建议保留一个版本，next minor 删。）

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
