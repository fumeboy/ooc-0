---
title: _builtin/example — 建 class 时照抄的最小样板 class（construct / object method / readable / persistable）
description: example 家族单一权威：kind=class、继承 root、非单例（有 construct）、data={message,bumpCount}、object method bump、window method set_viewport、自定义 persistable；无 children；它是 example.md 逐文件骨架的可运行对照
activates_on:
  "object::root": "show_description"
---

# _builtin/example

> 建一个新 ooc class 时照抄的**最小可运行样板**：演示 construct / object method / readable 投影 + window method / 自定义 persistable / types.ts 五处怎么落地。**非真实功能对象**——它不被任何 agent 组合持有、不参与任何业务闭环，只作 authoring reference。
> 与 sibling `example.md`（逐文件骨架的设计稿）互为印证：`example.md` 讲「新建一个 class 每个文件应该长什么样」，本 builtin 是那份骨架的**可运行对照**（同一组文件、可编译、可注册、可构造）。
> 对象模型本身（class/object、单例/非单例、construct、继承、children、投影）见 sibling `object-model.md`，本文不复述模型。**以设计为准**：存量代码可能过期，分歧记入「五、源码现状与差异」。

## 一、是什么（核心职责）

- **ooc.kind = `class`**（`package.json:13`，一份定义/模板）。
- **继承**：`package.json` 不写 `ooc.class` → 隐式继承 `_builtin/root`（对象模型核心 2；继承链 `example → root`）。
- **单例性**：**非单例 class**——`index.ts` 注册了 `construct`（`index.ts:15`），可按需造多个 example 实例；每个实例在 context 中投影为一个 example window。
- **角色**：既非 agent（无 thinkable/talk/self.md）、也非被 agent 组合持有的 tool-object——它是一个**纯样板 class**，唯一用途是给 class 维度作者照抄。
- **一句话职责**：用最小代码量同时演示对象模型五处可自定义点（construct / object method / window method + 投影 / 自定义 persistable / types.ts data 结构）。

## 二、data 结构（types.ts）

object 自身运行时 data（`types.ts:10`，纯业务字段，不含信封/投影态）：

- `message: string` —— 要展示的文本（可多行）。
- `bumpCount: number` —— 被 `bump` object method 累加的次数。

信封字段（id/class/title/status/createdAt）由 runtime 管理、不在 data；展示态（viewport）归 readable 投影态 `ExampleWin`、不在 data（`types.ts:2-6`，与对象模型核心 1/4 的「data / 信封 / 投影态三分」一致）。

## 三、能力

### object method（executable，改 data / 副作用）

- **`bump`**（`executable/index.ts:15`）—— 累加 `self.bumpCount`，返回 `bumped → N`。演示 object method 三参签名 `(ctx, self, args)` + 可改 self。非 `for_ui_access`。

### window method（readable，只调展示程度、返回新 win、不改 data）

- **`set_viewport`**（`readable/index.ts:32`）—— 调整投影视口（line/column range），写新的 `ExampleWin.viewport`、不碰 data。演示 window method 四参签名 `(ctx, self, before, args)` + 返回新投影态对象（不可变）；越界经 `mergeViewport` 校验失败即 throw（fail-loud）。

### 投影（readable）

`readable/index.ts:51` 把 data 投影为单一 window class `"example"`：渲染 `<bump_count>` + `<message>`（message 经 `applyViewport` 按 viewport 切片、`truncateBytes` 限长 8192）。`window` 声明（`:62`）该 window class 展示 `object_methods:["bump"]` + `window_methods:[set_viewport]`——对象模型核心 4 的「window 声明展示哪些 object method」。viewport 协议复用 `@ooc/core/_shared/types/viewport`（不自造）。

### visible / persistable / construct

- **visible**：无自定义文件 → 走系统默认（无 UI；样板不演示 visible）。
- **persistable**：**有自定义**（`persistable/index.ts:20`）——`save`/`load` 把 data 以 JSON 落在系统解析好的实例目录 `ctx.dir/data.json`。这是「自定义序列化」最小参照实现；持久化布局的权威归 persistable 维度，本文不复述。
- **construct**（非单例 class，`index.ts:15`）：args schema = `{ message?: string }`，`exec(ctx, args)` 产出初始 data `{ message: args.message ?? "(empty)", bumpCount: 0 }`。trivial class 忽略 ctx（无需 thread/worktree/spawn）。

## 四、children

无 children。

## 五、源码现状与差异（设计 vs 实现）

源码主体（`package.json` / `types.ts` / `index.ts` / `executable` / `readable` / `persistable`）**完全符合** object-model.md 与现行 `OocClass` 契约：`ooc.kind="class"`、construct 槽位用 `construct`（非 `constructor`，避开 `Object.prototype.constructor` 遮蔽陷阱，与 `ooc-class.ts:43-46` 一致）、维度物理分离、data/投影态分离。差异集中在两处过渡态：

1. **example 根本未被注册——root.example authoring-reference 是死链（应修）**。
   - `register-builtins.ts` 装载了全部 builtin class，但**没有** `import { Class as ExampleClass }` 也没有 `_reg.register("_builtin/example", ...)`（通读 `packages/@ooc/core/runtime/register-builtins.ts:16-72` 确认缺席）。
   - 与此同时 `packages/@ooc/builtins/root/executable/method.example.ts:24` 的 `root.example` method 调 `ctx.runtime.instantiate("_builtin/example", args)`；`instantiate` 经 `registry.resolveConstructor(classId)` 取 construct，未注册即返回空 → 抛 `instantiate: class "_builtin/example" has no constructor registered`（`packages/@ooc/core/executable/manager.ts:127-131`）。
   - 后果：作为「照抄样板 + 可运行对照」的 example，**当前既进不了 registry、也无法被 root.example 构造**——authoring reference 名存实亡。修法二选一：把 `_reg.register("_builtin/example", ExampleClass)` 补进 `register-builtins.ts`；或若刻意不随框架装载（避免污染真实 window class 列表），则 `root.example` 不应硬连一个未注册 class。建议补注册（它本就是「照抄即可用」的样板，注册成本极低且能让 root.example 自验证）。

2. **`__tests__/example.test.ts` 整体是旧契约残留（应修/删）**——通读 `packages/@ooc/builtins/example/__tests__/example.test.ts` 全文，无一处与现源码对得上：
   - `import type { ExampleWindow } from "@ooc/builtins/example/types.js"`（`:4`）—— `types.ts` 只 export `Data`，`ExampleWindow` 不存在，文件无法类型检查。
   - 依赖 `import "@ooc/builtins/example"` 的 side-effect 注册（`registerExecutable + registerReadable`，`:2`）——现行无 side-effect 注册，example 也不在 `register-builtins`，`builtinRegistry.getObjectDefinition("example")` 取不到。
   - 断言旧字段：`def.methods.close` / `def.methods.example`（构造器作 method）/ `def.compressView` / `def.windowMethods` / `kind:"constructor"`（`:8-20`）—— 现契约下构造器是 `construct` 槽（不挂进 methods）、无 `compressView`/`close`/`windowMethods` 字段。
   - 旧投影 shape：`{ class, message, bumpCount, state:{viewport:{lineStart,lineEnd,columnStart,columnEnd}} }`（`:44-49`）—— 现 data 分离为 `Data{message,bumpCount}` + 投影态 `ExampleWin{viewport}`，且 viewport 字段名以 `_shared/types/viewport` 为准（非 `lineStart` 平铺）。
   - 该测试是「BaseContextWindow 平铺业务字段」旧单体结构 + side-effect 注册时代的化石，与现源码全不兼容；应整体重写为现契约（直接调 `Class.construct.exec` / `Class.executable.methods` / `Class.readable.readable`）或删除。

> 说明：`builtins.md` 索引把 `_builtin/example` 列为「class，建 class 时照抄的样板」（`builtins.md:49`），与本 doc 设计一致；但索引未反映「example 未注册 + root.example 死链 + 测试化石」这三处现状——属索引粒度之外的实现差异，记于此。

## 六、倒推 ooc core 改进方向

1. **样板 class 应有「注册即自验证」的护栏**（direction：把 example 补进 register-builtins 并加一条「root.example 能成功 instantiate」的 control-plane 冒烟，或在 manifest 上加「凡被 root method 硬连的 classId 必须已注册」的启动期断言）。rationale：当前 example 未注册而 root.example 仍硬连它，是一条**编译期通过、运行期才炸**的死链——core 缺「method 引用的 classId 在装载期可解析」的 fail-loud 校验，让样板的「可运行对照」承诺静默落空。severity：medium。

2. **builtin class 装载入口缺漂移护栏**（direction：register-builtins 的 import 列表与 `packages/@ooc/builtins/*` 实际包做一致性校验——有包无注册 / 有注册无包都该 fail-loud）。rationale：example 有完整五件套包却漏在 register-builtins，靠人工逐行维护 import 列表必然漏；core 应能从 builtins 目录自发现或在启动期对账。severity：low（example 是样板、漏注册影响小，但同类漏注册若发生在真实 window class 上则是隐性功能缺失）。

3. **退役契约的测试需随契约迁移强制回流**（direction：把 example.test.ts 这类引用已删类型（`ExampleWindow`）/已删字段（`compressView`/`windowMethods`/`close`）/旧投影 shape 的测试纳入 `check:doc-drift` 同类的「check:stale-test」扫描，或至少让其进 CI 类型检查暴露）。rationale：从 BaseContextWindow 平铺 → data/win/信封三分 是一次大契约迁移，example 源码迁了、测试没迁且无人发现，说明 core 的退役流程缺「测试侧符号回流」的强制闸——这与 MEMORY 里「退役符号要全树文档回流」是同一类漂移，只是落点在测试。severity：medium。
