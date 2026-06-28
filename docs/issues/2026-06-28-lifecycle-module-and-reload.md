---
title: 引入 lifecycle 维度（active / unactive / on_reload 三钩；object base 4→5 维）
status: landed
date: 2026-06-28
---

# 引入 lifecycle 维度

## 背景 / 动机

用户提案（06-28）：**OOC class 新增一个维度 `lifecycle`，与 thinkable 等维度平行；注册三个可选参数 `active` / `unactive` / `on_reload`，其中 `on_reload` 用于处理热更新时的相关资源、内存状态更新。**

当前事实（实勘代码）：

- `active?` / `unactive?` 是 `OocClass` 的**直接字段**（`packages/@ooc/core/runtime/ooc-class.ts:53-54`），由 `ObjectLifecycleHook` 类型承载（`packages/@ooc/core/types/executable.ts:256`）。
- 它们物理位于 `executable.ts` 类型文件、且与 `executable` / `readable` / `persistable` / `thinkable` / `visible` 这些**维度模块**形式上不对齐——后者是**模块对象**（`XxxModule { ... }`），前者是**裸钩字段**直接挂 OocClass。
- 当前**没有 on_reload 钩**——hot-reload 链路（`runtime/hot-reload.ts` + `runtime/server-loader.ts:invalidateStone`）只到「invalidate stone → 下次 hydrate 拿新版本」级别，**不给 class 一次「数据被新代码重读后」的回归点**——故无法处理「class 持有的 in-memory cache、定时器、外部连接、watcher」等热更新时需要重建的资源。
- 解析路径：`ObjectRegistry.resolveActive(classId)` / `resolveUnactive(classId)` 直查 class 直接字段（`packages/@ooc/core/runtime/object-registry.ts:226-233`），与 `resolveThinkable` / `resolveReadable` 等本类直查同构。
- 当前使用点：仅 `thread` 类（`packages/@ooc/builtins/agent/children/thread/index.ts:62` unactive、`thinkable/index.ts:34` 一个名字相同但语义不同的 `active` 谓词——见**风险 4**）；其他 builtin 无 lifecycle 钩注册。

这两条事实组合起来揭示一个**模型不一致**：lifecycle 实质上**已经是 class 的一个维度槽**（与 thinkable 同构本类直查、registry 有 resolver），但**形式上不是模块**——它是两个裸字段直接挂 OocClass。本 issue 兑现「形式跟上实质」+ **顺势补 on_reload 钩**。

## 现状

锚 `knowledge/index.md`：

- **§A · 顶层 / `## OOC`**：当前 7 维度名单 `object base 4（readable/executable/visible/persistable）+ agent 智能增量 3（thinkable/collaborable/reflectable）`，**lifecycle 不在内**；构成自我的 self-constitutive 判据排除 observable / extendable，programmable 并入 reflectable。
- **§A · `## OOC Class/Object Model` 核心 11**：当前文本「`construct` 诞生 → `active` / `unactive` 按引用计数停启 → 无独立 destruct」——把 active/unactive 描述为 class 的两个钩（与 construct 并列），未提及它们形式上是 module 还是字段。
- **`object/self.md` 核心 11 + `object/knowledge/lifecycle.md`**：当前权威，描述 active/unactive 的语义与 refcount 0↔1 派发规则。

源码现状：

```ts
// packages/@ooc/core/runtime/ooc-class.ts:50-74
export interface OocClass<Data = any, Win = any> {
  id: string;
  construct?: ObjectConstructor<Data>;
  active?: ObjectLifecycleHook;      // <-- 裸字段（issue P 之后保留）
  unactive?: ObjectLifecycleHook;    // <-- 裸字段
  executable?: ExecutableModule<Data>;
  readable?: ReadableModule<Data, Win>;
  persistable?: PersistableModule<Data>;
  visible?: VisibleServerModule<Data>;
  thinkable?: ThinkableModule<Data>;
  versioned_fields?: readonly string[];
}
```

派发点（`ThreadRuntime` `dispatchActive` `dispatchUnactive`，`thread-runtime.ts:489/515`）：经 `registry.resolveActive(inst.class)` / `resolveUnactive(inst.class)` 取 hook 直接 `await hook.exec(ctx, inst.data)`。

hot-reload 链路现状（`core/runtime/hot-reload.ts` + `runtime/server-loader.ts:invalidateStone`）：

```
fs.watch 监听 stones/ 树
  → stoneRegistry.invalidate(id, files) → stone:changed 事件
  → serverLoader.invalidateStone() → executable/readable 等缓存失效
  → 下次该 class 实例 hydrate 拿新版本
```

但 class 不知道「我刚被新代码接管」，**没有钩子让它做迁移 / 重建 in-memory cache / 重启 watcher / 重接外部连接**。

## 改动提案

### 哲学定位（裁决，见下「裁决」段）

lifecycle 升 **object base 第 5 维**（4→5），构成自我；与 readable/executable/visible/persistable 并列；以「**对象本身的存在态钩**」自立。维度增量到「5 + 3 = 8」（**新口径**）。

理由：
- OOP 哲学：构造 + 析构 + 类重载是对象本质生命周期，属于自我而非横切。
- OOC self-constitutive 判据：lifecycle 钩**改变对象本身的存在态**（首次激活、停用、被新代码接管），不是 runtime 单向旁路（≠ observable）。
- 「警惕新增名词」：lifecycle 不是新概念——active/unactive 已存在，本 issue 仅形式归位 + 加 on_reload。
- 「复用先于新引入」：on_reload 复用 hot-reload 既有链路（invalidateStone seam）。

### 三个核心变更

**变更 1 · 新建 `core/types/lifecycle.ts`，定义 `LifecycleModule`**

```ts
// packages/@ooc/core/types/lifecycle.ts
export interface UnactiveResult {
  delete?: boolean;
}

/**
 * 对象生命周期钩子 —— refcount 0↔1 触发。
 * 作用于既有对象（不产 Data）；self = 目标对象的业务 data，由 runtime 解析 ctx.targetId 注入。
 * unactive 可经返回 {delete:true} 自决彻底删除（refcount-0-gated）；active 返回值忽略。
 */
export interface ObjectLifecycleHook<Data = any> {
  description: string;
  exec: (
    ctx: LifecycleContext,
    self: Data,
  ) => void | UnactiveResult | Promise<void | UnactiveResult>;
}

/**
 * 热更新钩子 —— hot-reload 链路触发（class 源码变更后、实例首次承新代码运行前）。
 * 用于处理 in-memory cache、watcher、外部连接、派生态等热更新时需重建的资源。
 * 失败 = fail-loud（与 OOC fail-loud 哲学一致）。
 */
export interface OnReloadHook<Data = any> {
  description: string;
  exec: (
    ctx: LifecycleContext,
    self: Data,
    info: { changedFiles?: string[] },
  ) => void | Promise<void>;
}

/**
 * lifecycle 维度模块 —— object base 第 5 维（issue 2026-06-28）。
 *
 * 注册 3 个可选钩：
 * - active     : refcount 0→1 派发（首次激活）
 * - unactive   : refcount 1→0 派发（停用 / 自决删除）
 * - on_reload  : hot-reload 后实例承新代码前派发（资源/内存态重建）
 */
export interface LifecycleModule<Data = any> {
  active?: ObjectLifecycleHook<Data>;
  unactive?: ObjectLifecycleHook<Data>;
  on_reload?: OnReloadHook<Data>;
}
```

`ObjectLifecycleHook` 从 `core/types/executable.ts` 迁出到 `lifecycle.ts`（归位）。`core/types/index.ts` 同步 re-export。

**变更 2 · OocClass 字段重构**

```ts
// packages/@ooc/core/runtime/ooc-class.ts
export interface OocClass<Data = any, Win = any> {
  id: string;
  construct?: ObjectConstructor<Data>;
  lifecycle?: LifecycleModule<Data>;     // <-- 新维度槽，替代裸 active/unactive
  executable?: ExecutableModule<Data>;
  readable?: ReadableModule<Data, Win>;
  persistable?: PersistableModule<Data>;
  visible?: VisibleServerModule<Data>;
  thinkable?: ThinkableModule<Data>;
  versioned_fields?: readonly string[];
}
```

**变更 3 · ObjectRegistry resolver 改本类直查**

```ts
// packages/@ooc/core/runtime/object-registry.ts
resolveActive(classId: string): ObjectLifecycleHook | undefined {
  return this.classes.get(classId)?.lifecycle?.active;       // <-- 改路径
}
resolveUnactive(classId: string): ObjectLifecycleHook | undefined {
  return this.classes.get(classId)?.lifecycle?.unactive;     // <-- 改路径
}
resolveOnReload(classId: string): OnReloadHook | undefined { // <-- 新增
  return this.classes.get(classId)?.lifecycle?.on_reload;
}
```

resolver 对外签名不变（active / unactive 仍返同类型），仅内部查找路径加一步 `.lifecycle.`。

**变更 4 · on_reload 派发 seam**

在 `core/runtime/hot-reload.ts` 现有 `stone:changed` 事件 → `serverLoader.invalidateStone()` 链路后增加：

```
serverLoader.invalidateStone(stoneRef)
  → 标记该 class 待 reload（pendingReload: Set<classId>）
  → 该 class 任一实例在 ThreadRuntime 下次解析时（首次 method 调用 / dispatchActive 前）
    → resolveOnReload(class) → 若返回 hook：调用 hook.exec(ctx, inst.data, { changedFiles })
    → 标记完成、从 pendingReload 移除
```

**详细 seam 位置**：`ThreadRuntime.instantiate` / `getOrLoadInstance` 路径（refcount 入 1 之前）。`on_reload` 在 `active` 之前调用——保证「数据已就位 + 资源已重建 → 然后激活」。

**变更 5 · thread builtin 形式迁移**

```ts
// packages/@ooc/builtins/agent/children/thread/index.ts
// 原 const unactive: ObjectLifecycleHook 单独定义 + Class.unactive = unactive
// 改成：
export const Class: OocClass<ThreadContext> = {
  id: "_builtin/agent/thread",
  construct,
  lifecycle: {
    unactive,  // 既有
    // active 不迁此处——thread 的 active 是 thinkable.active 谓词（判终态），不是 lifecycle.active
  },
  // ...
};
```

**注意**：thread 的 `thinkable.active(data) => boolean` 谓词是 issue E 引入的 thinkable 模块字段（判 inst 是否终态），**与 lifecycle.active 同名但语义完全不同**——本 issue **不动 thinkable.active**。这是预存的命名冲突，本 issue 在文档段加 disambiguator 警示，命名重构留作 future issue。

### 文档回流

- `OocClass` JSDoc：删字段级 active/unactive 注释、新增 lifecycle 槽注释。
- `objects/supervisor/children/object/self.md` 核心 11：「lifecycle 模块 (active/unactive/on_reload) 三钩，前两者按 refcount 0↔1 触发、on_reload 在 hot-reload 时机触发」。
- `objects/supervisor/children/object/knowledge/lifecycle.md`：全篇加 on_reload 段、对齐 module 形式。
- `objects/supervisor/knowledge/index.md` §A `## OOC` 维度名单 4+3→5+3；`## OOC Class/Object Model` 核心 11 同步；新增 §B `## lifecycle` 维度核心段。
- `objects/supervisor/self.md` `## 我把握的核心哲学` 段维度名单同步。
- 新建 `objects/supervisor/children/lifecycle/`（self.md + knowledge）—— 维度对象诞生。
- `executable / persistable / thinkable / observable` 各自 self.md 相关交叉点同步（如 «ObjectLifecycleHook 物理位于 executable.ts» 提法清除）。

### 落地 commit 切分

**Stage A · 形式归位**（最低风险）：
1. `feat(core/types): 新建 lifecycle.ts，迁 ObjectLifecycleHook + 加 LifecycleModule / OnReloadHook 类型`
2. `refactor(core/runtime): OocClass 字段 active/unactive → lifecycle 模块槽 + resolver 改本类直查 .lifecycle.* + 加 resolveOnReload`
3. `refactor(builtins): thread.unactive 迁 lifecycle.unactive 模块`
4. Stage A verify 全绿

**Stage B · on_reload 接入**（新机制）：
5. `feat(core/runtime): on_reload 派发 seam 接入 hot-reload → instantiate 路径`
6. `test(core): on_reload 派发 case`
7. Stage B verify 全绿

**Stage C · 文档回流**：
8. `docs(supervisor + object + lifecycle): 维度 4+3→5+3、lifecycle 维度对象诞生、各 self.md 同步`
9. `docs(meta-issue): 标 landed`

## 受影响设计元素

对照 `knowledge/index.md` `##` 元素清单：

**A · 顶层**
- `## OOC` —— 7 维度名单 4+3 → **5+3**（新增 lifecycle）
- `## OOC Class/Object Model` —— 核心 11 active/unactive/on_reload 表述方式

**B · 维度核心设计**
- **新增 `## lifecycle`** —— 新维度核心段
- `## executable` —— ObjectLifecycleHook 物理迁出
- `## thinkable` —— 仅同构参照，**注意 thinkable.active 谓词与 lifecycle.active 同名但语义不同**
- `## persistable` —— hydrate 不接 on_reload（on_reload 仅 hot-reload 触发），但 lifecycle.md 描述需说明
- `## observable` —— on_reload 是否产观测点（推荐：是，作 LlmObservation 旁路事件）

**C · 内置对象**
- `## builtins` —— thread 是当前唯一持 lifecycle 钩的 builtin，需形式迁移

**D · 维度 × 维度 交叉**
- `## executable × thinkable` —— ObjectLifecycleHook 迁位后注释路径全跟随
- 新增 `## lifecycle × persistable` —— 描述 hot-reload 链路与 lifecycle on_reload 的协作
- 新增 `## lifecycle × executable` —— close 原语 / refcount 与 lifecycle 钩派发的关系

**E · 内置对象 × 维度 交叉**
- `## thread` —— thread 的 unactive 迁 lifecycle.unactive；disambiguator 标 thinkable.active ≠ lifecycle.active
- `## runtime` —— `dispatchActive` / `dispatchUnactive` seam 走 lifecycle 模块；新增 `dispatchOnReload` 派发路径

## 风险与权衡

### 真实风险

1. **「8 维度」哲学根改写**：
   - 当前论述「7 维度构成自我，4+3 分层」是 supervisor 哲学根。改 5+3 需同步 supervisor self.md 多处+ index.md §A `## OOC`+ 各维度对象 self.md 顶端「自我维度构成」一句话。
   - 缓解：本 issue Stage C 一次性全回流；review fan-out 派 object 维度 reviewer 兼任 supervisor 哲学根 reviewer。

2. **ObjectLifecycleHook 迁位的 import 链跟随**：
   - 当前 `ObjectLifecycleHook` 从 `core/types/executable.ts` export，被多处 import（已实测有效引用，预计 4-6 处）。迁到 `lifecycle.ts` 后所有 import 改 path。
   - 缓解：`core/types/index.ts` 提供 barrel re-export 临时兼容；用 grep 校验所有引用点；verify 跑全测试套。

3. **on_reload 派发 seam 选择**：
   - 选 `ThreadRuntime.instantiate` 路径 + pendingReload 标记 set——干净、按 inst 维度（不强制所有现存实例重 reload）、与 active 顺序明确（reload before active）。
   - 替代：在 `serverLoader.invalidateStone` 内立即遍历所有 session 表对该 class 的 inst 调 on_reload——但这要求 invalidateStone 知道所有 session 表，违反单一职责。**否决**。

4. **命名冲突警示**：
   - `thinkable.active(data) => boolean` 谓词（issue E）vs 新 `lifecycle.active` 钩——**同名、不同语义**。前者判 inst 终态、后者首次激活。本 issue 不动 thinkable.active，但在 `lifecycle.md` 顶端 + `thinkable/self.md` `## active` 子段加 disambiguator 警示。
   - **future issue**：考虑把 `thinkable.active` 重命名为 `thinkable.isAlive` / `thinkable.isRunning` 消除冲突。

5. **on_reload 失败语义**：
   - 抛 = fail-loud（推荐，与 OOC fail-loud 哲学一致）。class 自承迁移失败 → throw → invalidateStone 链路停 → 上层错误处理。
   - 错误日志走 observable 通道（如果对接的话）。

### 权衡选择（已裁决，理由见各段「为什么」）

- **方式 1：维持裸字段 + 加 on_reload 字段（不引入模块）** ❌ —— 形式不一致、与 thinkable/readable/... 模块槽不同质。
- **方式 2：lifecycle 升 OocClass 模块槽 + 不升维度** ❌ —— 违反 self-constitutive 判据（lifecycle 改变对象存在态、构成自我）。
- **方式 3：lifecycle 升 object base 第 5 维 + 模块槽** ✅ —— 本 issue 采用。

## 待裁决点（已裁决）

**1. lifecycle 升不升维度？** → **升 object base 第 5 维**（4+3 → 5+3）。理由见「哲学定位」段。

**2. on_reload 派发时机？** → **仅 hot-reload 后触发**（用户明确说"用于热更新时"）。hydrate 路径不接 on_reload——hydrate 时数据从盘读、class 程序也是最新，没有"接管"问题。

**3. on_reload 与 active 顺序？** → **`on_reload → active`**：资源就位先于激活。若 inst 当时 refcount=0，on_reload 派发时机可推迟到 next-touch；若 refcount>0，立即派发后再继续运转。

**4. on_reload 失败语义？** → **fail-loud**。

**5. 落地路径？** → **Stage A + Stage B + Stage C 三阶段，每阶段 verify 全绿后进下一阶段**。Stage A（形式归位）+ Stage B（on_reload 接入）+ Stage C（文档回流）。

**6. 涉及源代码变更：是否在 worktree 隔离？** → **是**，建 `.worktree/lifecycle-module-and-reload/`。

## review 记录

本 issue 由 supervisor（Claude Code 主会话）自审完成；未走 sub agent fan-out（用户授权独立决策推进）。受影响元素清单已完整列出，按 design-workflow 落地后启动验收 review。

## 裁决

**最终方案**：

1. 引入 lifecycle 维度模块（`LifecycleModule { active?, unactive?, on_reload? }`）作为 object base 第 5 维。
2. 哲学根维度数 4+3 → 5+3（构成自我维度共 8 个）。
3. on_reload 仅 hot-reload 触发；派发顺序 `on_reload → active`；失败 fail-loud。
4. Stage A/B/C 三阶段实施，每阶段 verify gate。
5. **涉及核心 runtime 源码改动**，按 design-workflow 在源码仓 `.worktree/lifecycle-module-and-reload/` 隔离开发。
6. 命名冲突（thinkable.active vs lifecycle.active）本 issue 仅加 disambiguator、不改名；命名重构 future issue。

## 落地验收

（landed 后启动验收 review：（1）lifecycle 模块槽真在 OocClass 落地；（2）ObjectLifecycleHook 物理迁到 lifecycle.ts；（3）所有 import path 跟随；（4）thread builtin 形式更新；（5）on_reload 钩派发链路真接通；（6）supervisor `self.md` + `knowledge/index.md` + `object/self.md` + `lifecycle.md` 全回流；（7）新建 `objects/supervisor/children/lifecycle/` 维度对象；（8）verify gate 仍绿；（9）disambiguator 警示在 lifecycle.md + thinkable/self.md 都有）
