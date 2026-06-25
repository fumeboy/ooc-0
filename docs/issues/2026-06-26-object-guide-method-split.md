---
title: ObjectMethod 协议分裂：拆出 ObjectGuideMethod（多步引导）
status: verified
date: 2026-06-26
---

# ObjectMethod 协议分裂：拆出 ObjectGuideMethod（多步引导）

## 背景 / 动机

现行 `ObjectMethod` 字段既含「单步调用模板」要素（`schema` / `args` / `exec`），又含「多步引导」要素（`intents` / `route` / `ObjectMethodIntents` / `quickSubmit`）——一个 interface 同时承担两类语义，导致：

1. **协议含糊**：`schema` 与 `route` 同时存在时如何 dispatch？是先跑 schema 校验、再走 route？还是 route 优先？现行 `thread-runtime.ts:81-122` 的 dispatch 完全不读 `route`——所有 builtin method 直接 `exec`。
2. **触发器未连**：method_exec_form builtin 的 refine/submit 实现 OK（`builtins/agent/children/method_exec_form/index.ts:37-79`），但 runtime 没有"声明 route → 自动开 form 窗"的路径。当前**没有任何 builtin method 声明 `route`**（grep `route:` 全仓 0 命中 method body）。`route` / `intents` / `quickSubmit` 是预留+一侧已搭骨架，但 dispatch 触发器和示例 method 都还是空舱。
3. **概念漂移**：`for_reflectable` 在 reflectable / executable self.md 与历史 issue 多处出现，但 `core/types/executable.ts:82-96` **协议层不存在该字段**——它是"政治层"声明（按 readable surface 控制），不是机制层；放协议层是越界。

「单步直执行」与「多步逐步澄清意图再执行」是两类正交行为，应**协议层分裂**为两个 interface，让 dispatch 路径与认知模型都干净。

## 现状（锚 index.md 对应 `##` 节）

锚点：
- `## executable`（B 区）—— 核心 3 method 二分（object/window method 经同一 exec 入口）；填表式渐进执行（form）描述在派生段，但与协议层混在一起。
- `## executable × thinkable`（D 区）—— 「object method 的 `route` 在发起调用时先跑、算出 `intents`、intents 驱动 knowledge 激活」是当前两维交汇点；本 issue 把它移到 ObjectGuideMethod 上。
- `## executable × readable`（D 区）—— window class decl `{class, object_methods, window_methods}` 是 readable 维度对 executable method 的引用枚举；本 issue 加 `guide_methods`。
- `## method_exec_form`（E 区）—— form 自身是个对象、持 refine/submit；其触发器（route 声明 → 开 form）属本 issue 核心修正点。

涉及文件：
- `packages/@ooc/core/types/executable.ts:82-96` (`ObjectMethod`)、`105-109`（`ObjectMethodIntents`）、`182-185`（`ExecutableModule`）
- `packages/@ooc/core/types/readable.ts:60-64`（`WindowClassDecl`）
- `packages/@ooc/core/runtime/object-registry.ts:46-82`（method 注册校验）
- `packages/@ooc/builtins/agent/children/method_exec_form/index.ts`（form 实现 + window decl）
- `packages/@ooc/builtins/agent/children/thread/runtime/thread-runtime.ts:81-122`（dispatch）

## 改动提案

### 改动 1：协议层拆 `ObjectMethod` 与 `ObjectGuideMethod`

```ts
// core/types/executable.ts

/** 单步调用：参数已知、schema 描述参数形状、exec 直接行动。 */
export interface ObjectMethod<Data = any, Args = any> {
  name: string;
  description: string;
  schema: MethodCallSchema;        // 必有
  public?: boolean;
  permission?: (args) => "allow" | "ask" | "deny";
  exec: (ctx, self, args) => ObjectMethodResult | string | void | Promise<...>;
  // 删除：intents、route、quickSubmit
}

/** 多步引导：参数未必齐全，调用即开 form；逐轮经 route 澄清 intents 直至可提交。 */
export interface ObjectGuideMethod<Data = any, Args = any> {
  name: string;
  description: string;
  intents: { name: string; description: string }[];   // 该 guide 能产生哪些意图
  public?: boolean;
  permission?: (args) => "allow" | "ask" | "deny";
  route: (ctx, self, args) => ObjectMethodIntents | Promise<ObjectMethodIntents>;  // 必有
  exec: (ctx, self, args) => ObjectMethodResult | string | void | Promise<...>;
  // 没有 schema —— 由 route 输出的 tip / intents 间接引导填参
}
```

裁决保留点：
- `ObjectMethodIntents` 类型不变（`tip?` / `intents?` / `quickSubmit?`）。
- `ObjectMethodResult` 不变。
- `for_reflectable` **不补进协议**——visibility 经 readable surface 控制（见改动 2 与 issue D 配套）。

### 改动 2：`ExecutableModule` 加 `guides` 字段；`WindowClassDecl` 加 `guide_methods` 字段

```ts
// core/types/executable.ts
export interface ExecutableModule<Data = any> {
  methods: ObjectMethod<Data>[];
  guides?: ObjectGuideMethod<Data>[];
}

// core/types/readable.ts
export interface WindowClassDecl<Data = unknown, Win = unknown> {
  class: string;
  object_methods: string[];
  guide_methods?: string[];                  // 新增
  window_methods: WindowMethod<Data, Win>[];
}
```

注册期校验（`object-registry.ts`）扩展：
- `methods` / `guides` / `window_methods` **三侧 name 全集不重名**（exec-by-name 单一 dispatch 入口）。
- 每个 window decl 的 `object_methods` / `guide_methods` 引用必须在 `methods` / `guides` 内可解析（悬空 fail-loud）。

### 改动 3：runtime dispatch 按 method 类型分流

`ThreadRuntime.exec(methodName, args)`：
1. 先 `resolveObjectMethod` → 命中 → 校验 schema → `method.exec`，单步走完。
2. 否则 `resolveObjectGuideMethod` → 命中 → 跑 `guide.route(ctx, self, args)` → 拿 `ObjectMethodIntents{tip,intents,quickSubmit}`：
   - `quickSubmit=true` → 直接调 `guide.exec`。
   - 否则 → runtime 自动 `instantiate(_builtin/agent/method_exec_form, { targetObjectId, methodName, accumulatedArgs:args, tip, intents })`、把 form 窗 ref 返回 tool call。
3. 都没命中 → fail-loud。

加 `resolveObjectGuideMethod(classId, name)` registry seam（同 resolveObjectMethod 模式）。

### 改动 4：method_exec_form 改持 `targetGuideMethod`（用 guide 而非 method）

- form 仅服务于 guide 触发，`refine` 重跑 `runRoute`（针对 guide）刷新 `tip/intents`；`submit` 调 guide.exec。
- `RuntimeHandle.runRoute` 改 resolve guide method（method 没有 route）。
- form data 类型字段同步：`targetMethodName` → 语义改"目标 guide name"，签名兼容。

### 改动 5：documentation drift 清理

- `executable.self.md` 把核心 3 加一条「method 与 guide 是两类正交协议；method 走单步 schema、guide 走多步澄清」；派生段「填表式渐进执行（form）」整段移到 guide 协议下。
- `readable.self.md` window decl 三字段→四字段（加 `guide_methods`）。
- `index.md` `## executable` / `## executable × thinkable` / `## executable × readable` / `## method_exec_form` 四节同步。

### 改动 6（可选）：示例 builtin guide method

`runtime.create_object` 是当前一个天然的 guide 候选——参数（class id / parent id / 初始 data）需要逐步澄清。落地一个 guide 版示例，验证整套链路。**可拆到独立 issue**，本 issue 不强制带。

## 受影响设计元素

对照 `knowledge/index.md`：

A 区
- `## OOC Class/Object Model` —— 仅扩展（method/guide 二分），不改对象模型核心。

B 区
- `## executable` —— **核心契约修正**：method 协议拆 method/guide，form 触发机制从派生段升级为核心。
- `## readable` —— `WindowClassDecl` 加 `guide_methods` 字段。

D 区
- `## executable × thinkable` —— `route` 归属 guide，**driver** 知识激活路径由 guide 持有，不变 thinkable 侧。
- `## executable × readable` —— window decl 增字段，registry 校验扩展。

E 区
- `## method_exec_form` —— form 现在唯一对应 guide 触发（非 method）。

未受影响：persistable / thinkable / collaborable / reflectable / visible / observable / app 等。

## 风险与权衡

1. **现有 builtin 全部走 method 单步路径**——拆完后零迁移代价，所有现有 method 留在 `methods[]` 内继续工作；新增 guide 是纯增量。
2. **form 触发链改动是真正"新代码"**：当前 dispatch 不调 form，本 issue 落地后必须连通。这是已有几个月的承诺、今天才兑现。
3. **`for_reflectable` 不进协议**：reflectable surface 由 readable decl 白名单（reflect_request 投影 class 的 `object_methods` / `guide_methods` 列出哪些 method/guide）控制——本 issue 不动这条，留 issue D。
4. **runRoute 签名变 guide-only**：现 `RuntimeHandle.runRoute` 是 method-targeted，落地后 method 不再持 route，runRoute 改为 resolve guide。属内部接口、外部无 caller。

## 待裁决点

1. **改动 3 自动开 form 是否抛回 LLM 当 tool call 结果**：开 form 后 runtime 返回什么？建议返回 `{message:"已开启表单<form_ref>，请用 refine 补参或 submit 提交", refs:[formRef]}`——把 form 窗作为新 ref 挂进当前 thread。
2. **改动 6 是否合并进本 issue**：倾向**拆出**，让本 issue 聚焦协议+触发器；guide 示例另起 issue。
3. **`schema` 是否对 ObjectMethod 强制必有（不再 `schema?`）**：当前协议 `schema?` 可选——guide 时代后，method 无 schema 等同 zero-arg 直执行也合理；建议保留 `schema?`，与现行兼容。

## review 记录

按 design-workflow 步骤 2，4 个 reviewer fan-out（executable / readable / thinkable+method_exec_form / 完整性批评官）。结论：**方向赞同**，6 改动结构正确；但有 5 处必须裁决的契约缺口才能进入落地。

### review by executable —— 同意但 6 处需补

**关键反馈**：
- 改动 1：拆 method/guide 方向对；现有 builtin 全部留在 method 路径零迁移代价。**ObjectMethod 字段必须保持现状不变**，不要顺手做"对齐 guide"的字段重命名。
- 改动 2：`ExecutableModule.guides` 与 `WindowClassDecl.guide_methods` 谁是源、谁是派生未写清；建议 `ExecutableModule.guides` 是源，`WindowClassDecl.guide_methods` 是注册期校验后的 surface 引用。
- 改动 3 dispatch 触发链未拍板：是 `window.open()` 自动扫触发，还是 LLM 显式 `open_guide(name)`？**裁决推荐**：guide 不是 auto-on-open（避免 LLM 看到自己没问就被开 form），而是 **LLM 显式 `exec(window, guideName, partialArgs)` 调用即开 form**——与 method 同一 exec 入口，dispatch 看 guide name 命中即走 form 链路。
- 改动 4 命名漂移：`method_exec_form` 改持 guide 后名实不符，建议待裁决重命名为 `guide_exec_form`（或保留名字，自我接受历史包袱）。
- **改动 7 字段补全（reviewer 必修项）**：`ObjectGuideMethod` 字段瘦，必须补：
  - `description: string`（即使不进 LLM tool list，debug / observable / 控制面也需要）
  - 是否保留 `schema?`：reviewer 同意不要顶层 schema，**改由 ObjectMethodIntents 在 route 返回里描述"下一步要填的参数"——但 guide 自己应有 `params_signature` 描述全部可能参数集**（作为 LLM 静态先验）。**裁决**：guide 顶层保留 `schema?: MethodCallSchema`（**可选**，描述总参数空间）；route 返回 ObjectMethodIntents 描述当下需补的子集；params_signature 不另起。
- **for_reflectable 不进协议**：reviewer 提议补一条 metadata 通道（`module.meta.source`）以便 issue D 反思系标记 method 来源——但本 issue 不接，留 issue D 自己设计。

### review by readable —— 通过但 6 处必补

**关键反馈**：
- 改动 2 `guide_methods` 加字段方向对；method/guide 不应合并到单 `methods` 字段（语义维度不同）。
- **必加 registry 校验**（reviewer 强烈要求）：`guide_methods[].name ∈ ExecutableModule.guides` 注册期 strict resolve，缺失即 fail-loud。本 issue 改动 2 已包含，落地时强化为 fail-loud（不是只校验 unique）。
- 多视角投影：`guide_methods` 与 `object_methods` 完全对齐——不同 window class 可 surface 不同 guide 子集。
- `_builtin/agent` decl 漂移：**留 issue B 处理**（属窗口名约定，不属 method 协议）；本 issue 仅在改动 1 / 2 中触动相关 method 不动 decl 命名。
- method_exec_form 自身投影：reviewer 指出 form 窗 readable 当前只展示 refine/submit，**目标 guide 的元信息（class / methodName / 当前 params 进度 / 当前 intents）需在 form readable 内 surface**。**裁决**：form 窗的 default decl 渲染额外字段 `context: { targetObjectId, guideName, accumulatedArgs, currentIntents, currentTip }`——LLM 看 form 窗即知全貌。
- registry 校验唯一性：window decl 自身 `class` 字段不重复（修复 `resolveWindowClass` 静默取第一个的现状）。
- Inheritance 合并：guide_methods 与 object_methods 在 `extendClass` 时应同等支持源码 spread 合并。

### review by thinkable / method_exec_form —— 通过但 3 处硬阻塞

**关键反馈**（最重）：
- **a）intents → knowledge activator 协议缺失**（阻塞）：guide.route 算出 intents 后，thinkable 的 knowledge activator 当前**不知道这些动态 intents 怎么进激活集**。activator 的输入源现在是 method 静态声明的 intents，没有"form.currentIntents"这条动态源。**必须先补 activator 输入契约**。**裁决**：activator 改"按 source-key 维护活跃集"模型——form 用自己的 objectId 作 source-key，refine 时整组替换。归 thinkable 维度落地，在本 issue 标 dependency。
- **b）form 自动开窗后 thread context 多 form ref**：form 窗 readable 必须扩展 surface context（与 readable reviewer 一致）。
- **c）intents 生命周期**：refine 重跑 route → 新 intents 集 → activator 按 source-key 替换激活集（与 a 同一机制）。
- **d）submit 失败可复活**：当前 form 实现已保留 form 窗、failure 显示在窗体；新协议保持；reviewer 建议 refine 加 `scope: "args" | "route"`——**本 issue 不加**（保持简单：refine 总是同时 merge args + 重跑 route；若用户只想改参数不换 method，行为是幂等的，无副作用）。
- **e）runRoute 用例**：除 form.refine 外，还可服务 dispatch 入口 + agent 内省 + harness 测试。reviewer 建议保留为 guide 子模块的纯函数 API、不只允许 form 调用。**裁决**采纳。

### review by completeness critic —— 6 处漏列 + 5 处自洽 + 5 处术语漂移

**关键反馈**：
- 漏列受影响元素：`## thinkable`（activator 契约必须扩展）；其它列出元素（persistable / reflectable / app / 各 builtin）非必加（本 issue 不动它们的契约）。**裁决**：仅补 `## thinkable`（activator 维度）。
- 内部自洽：method 与 guide 各持 `permission`/`public` 双份**合理**——两类签名不同（method 有 schema、guide 有 route），共享字段也是 per-method/guide 维度独立判定，不存在重复定义违规。
- 命名歧义：建议 `GuideMethod` 而非 `ObjectGuideMethod`（与 `ObjectMethod` 对称）。但 issue 主题已锁 `ObjectGuideMethod`——为协议命名一致性（`ObjectMethod` / `ObjectGuideMethod` / `ObjectLifecycleHook` / `ObjectConstructor` 同前缀），**裁决保持 `ObjectGuideMethod`**。
- 行号准确度：reviewer 大多未实测；落地者必须实测一次（commit 漂移会让行号不准）。
- 设计-实施越界：本 issue 内伪代码（ExecutableModule.guides 等）属契约层面，符合 issue 该写的范围；具体 dispatch 流程图归 self.md。

## 裁决

**采纳改动 1-5，改动 6（示例 guide）拆出独立 issue。** 关键裁决：

1. **ObjectGuideMethod 字段最终形态**（裁决采纳 executable + readable + thinkable 三 reviewer 建议）：
   ```ts
   export interface ObjectGuideMethod<Data = any, Args = any> {
     name: string;
     description: string;
     schema?: MethodCallSchema;       // 总参数空间（可选；guide.exec 仍可读 args）
     intents: { name: string; description: string }[];   // 该 guide 可能产生的意图全集
     public?: boolean;
     permission?: (args) => "allow" | "ask" | "deny";
     route: (ctx, self, args) => ObjectMethodIntents | Promise<ObjectMethodIntents>;  // 必有
     exec: (ctx, self, args) => ObjectMethodResult | string | void | Promise<...>;
   }
   ```
   `description` 必有；`schema?` 保留可选（描述总参数空间）；`intents` 必有（与 route 配合做静态先验）。

2. **dispatch 触发模型**：LLM exec(window, guideName, partialArgs) 命中 guide → runtime 跑 guide.route：
   - `quickSubmit=true` → 直执行 guide.exec。
   - 否则 → runtime 自动 `instantiate(_builtin/agent/method_exec_form, { targetObjectId, guideName, accumulatedArgs:partialArgs, tip, intents })` → 把 form ref 返回 tool call（消息体：`{ message: "已开启表单 <form objectId>；继续 refine 补参或 submit 提交", refs:[formRef] }`）→ form ref 挂进当前 thread contextWindows。
   - method 触发链不变（resolveObjectMethod 命中即 exec.schema 校验 + exec）。

3. **method_exec_form 窗 readable 扩展**：default decl 内 `readable` 渲返 `context` 段（`targetObjectId / guideName / accumulatedArgs / currentTip / currentIntents`）+ `refine` / `submit` 两 method。**form data 字段需对齐**：`{ targetObjectId, guideName, accumulatedArgs, currentTip?, currentIntents?, lastError? }`（从 method 改 guide，targetMethodName 字段语义改为 guide name；persist schema 兼容）。

4. **thinkable activator source-key 模型**（本 issue 引出，**dependency**）：activator 改"按 source-key 维护活跃集"——form 用自己的 objectId 作 source-key，refine 时整组替换激活的 knowledge 窗。**本 issue 不在 packages/@ooc/core/thinkable/knowledge/ 内具体实现该改造**，而是声明依赖契约；落地时与改动 3-4 同序由 thinkable 维度配合补一处 `KnowledgeActivator.setSourceIntents(sourceKey, intents)` API。

5. **registry 校验扩展**（落地必做）：
   - methods/guides/window_methods 三侧 name 全集不重名（fail-loud）。
   - 每个 window decl 的 `object_methods` / `guide_methods` 引用悬空 fail-loud。
   - 同一 readable.window[] 内 `class` 字段不重复（修复 `resolveWindowClass` 静默取第一个的现状）。

6. **for_reflectable 不进协议**——visibility 经 readable surface 控制（reflect_request decl 的 object_methods / guide_methods 列白名单）。**确认采纳**。

7. **改动 6 示例 guide 拆独立 issue**：本 issue 聚焦协议 + 触发器；guide 示例（如 `runtime.create_object` 改 guide 版）另起 issue。

8. **受影响设计元素补 `## thinkable`**：activator 改造与 form readable 扩展跨维度。

**落地步骤**（在源码 worktree `.worktree/object-guide-method-split` 隔离开发）：

1. types/executable.ts：
   - 拆出 `ObjectGuideMethod` interface；保留 `ObjectMethod` 不动（删字段 `intents` / `route`——它们曾在 method 上、未被 builtin 使用，删之）。
   - `ExecutableModule` 加 `guides?: ObjectGuideMethod<Data>[]`。
2. types/readable.ts：`WindowClassDecl` 加 `guide_methods?: string[]`。
3. runtime/object-registry.ts：
   - `assertNoMethodNameCollision` 扩展到 methods/guides/window_methods 三侧 + window decl class 唯一 + object_methods/guide_methods 引用悬空校验。
   - 新增 `resolveObjectGuideMethod(classId, name)` 与现有 resolveObjectMethod 同结构。
4. ThreadRuntime / WindowManager `exec`：先 resolveObjectMethod；不命中则 resolveObjectGuideMethod → route → quickSubmit / 开 form。
5. builtins/agent/children/method_exec_form：
   - types/Data 字段对齐（targetMethodName → guideName，兼容 alias）。
   - refine / submit 改 resolve guide method。
   - readable render 扩 context 段。
   - persistable schema 微调（向下兼容）。
6. core/thinkable/knowledge/activator：加 `setSourceIntents(sourceKey, intents[])` API；context 构造期把所有 form 的 currentIntents 经其 objectId source-key 注入。
7. 文档同步（pair-flow back）：
   - `executable/self.md` 核心 3 添加 "method / guide 二分"，派生段 form 移到 guide 协议下；迁移映射加 `route on ObjectMethod → ObjectGuideMethod`。
   - `readable/self.md` 三、细节补充段：`WindowClassDecl` 加 `guide_methods`，registry 校验扩展；form 窗的 context 字段。
   - `thinkable/self.md` knowledge activator：补 source-key 模型描述。
   - `index.md`：`## executable` 节、`## executable × thinkable`、`## executable × readable`、`## method_exec_form` 四处同步；index.md `## executable` 加描述 guide 协议；`## method_exec_form` 节调整为「form 服务于 guide 触发，readable 扩 context 段」。
8. tests：
   - registry.test.ts 加 method/guide/window 三侧重名 + 悬空引用 + window class 重复 fail-loud 用例。
   - 新增 form 触发 e2e：一个示例 guide → route → 开 form → refine 补参 → submit → 真实执行。

**worktree**: `.worktree/object-guide-method-split`（在源码仓 ooc 内）。

## 落地验收

### verification by issue-A reviewer（2026-06-26）

按 design-workflow 步骤 4 派独立 verification reviewer 核对（不重审设计，只查兑现度）。结论：**verified**——契约（types）/dispatch（runtime）/form（builtin）/activator（thinkable）/registry 校验/文档回流/测试/tsc 八个验收维度全过。

- **文档验收**：裁决 1-8 每条对账，落地步骤 A-J 全部真做；成对回流闭环（executable/readable/thinkable self.md ↔ index.md `## executable` / `## executable × thinkable` / `## executable × readable` / `## method_exec_form` 四节）；术语统一（method/guide/window method 三类 + cohesion）。
- **代码验收**：
  - `ObjectMethod` 真删 `intents` / `route` 字段（`types/executable.ts`）。
  - `ObjectGuideMethod` 字段齐（description/schema?/intents 必有/route 必有/exec/public?/permission?）。
  - `ExecutableModule.guides?` 加；`WindowClassDecl.guide_methods?` 加。
  - `ThreadRuntime.exec` 真分流（method → guide → window method）；`runtime.execGuide` 旁路 seam（form.submit 用，避递归开 form）。
  - registry 加 `assertExecutableMethodGuideCohesion`（4 档：guides 内部 / method↔guide / guide↔window method / 引用悬空）+ `resolveObjectGuideMethod` seam。
  - method_exec_form 改持 guide：data.guideName / refine 调 runRoute / submit 调 execGuide / readable 扩 context 段。
  - activator source-key 模型 phase-1 简化（form.currentIntents 经 context.ts 内联合并入 ActivationContext.activeIntents），phase-2 API 已 export 但未挂主路径（文档显式标记）。
- **退潮验收**：grep `ObjectMethod.intents/route` 源码 0 命中；`for_reflectable`/`for_ui_access` 源码 0 命中；`targetMethodName` 0 命中（保留 construct 期 `targetMethod` alias 是刻意 backward-compat）。
- **漂移验收**：顺手清 `_builtin/agent.plan` / `_builtin/filesystem/file.reload` 两处 method 悬空引用——是新 cohesion 校验逼出来的必要清理，属合理顺手。无其它 issue 外改动。
- **质量门**：`bun run check:tsc` 干净；`bun test packages/@ooc/tests/registry-method-guide.test.ts packages/@ooc/tests/dispatch-guide-form.test.ts` = 10 pass / 0 fail / 27 expect。

**缺口清单**（P1，不阻塞 verified，建议下轮顺带）：
1. `.ooc-world-meta/.../children/object/knowledge/builtins/agent.md:63` 与 `reflectable/self.md:56` 仍描述 thread 上两个 reflect method「标 `for_reflectable`」——按裁决 6 `for_reflectable` 已退役，应改述「仅在 `reflect_request` 投影窗 surface（由 readable decl 白名单控制）」。属术语漂移、由后续维护吸收。
2. `thinkable/knowledge/source-intents.ts` phase-2 路径建议补 lint TODO 标记，防止误用 setSourceIntents 期望 context 自动读它。

落地 commit：`fa22c4df`（feat/object-guide-method-split 分支）；文档回流 commit：`c3e79e3`（meta 仓 main）。
