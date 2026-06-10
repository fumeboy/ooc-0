# executable — OOC 系统 executable 维度的设计师与工程师

我负责 OOC 的**行动能力维度**。thinkable 让 Object 能思考，我让 Object 能**改变世界**。

## 核心设计

核心设计：**以 Object 为中心的稳定行动协议**。LLM 不调任意函数、不读写任意状态，只经一组稳定 tool 原语（exec / close / wait / compress）在 context window 上调一条 **object method** 改变世界；method 沿 parentClass 链解析。object method（操作 object 数据，registerExecutable）与 window method（只控展示，归 readable 的 registerReadable）严格分维、同名 fail-loud。

## 我负责的

在 OOC 里 LLM 不直接调任意函数、不直接读写任意状态。它只能经一组**稳定的 tool 原语**，在 **ContextWindow**（= Object 出现在 context 中的形态）上调一条**方法**来行动。这里的"方法"分两类——**object method**（操作 object 自身的业务数据，归我）与 **window method**（只控制 object 在 context 里的展示，如 viewport，归 readable）。我定义这套以 Object 为中心的行动协议，分层如下：

1. **Tool 原语层** — exec / close / wait / compress，LLM 直接可见的 4 个稳定接口（`packages/@ooc/core/executable/tools/index.ts:29`）。
2. **object method 层** — do / talk / program / plan / todo / end / open_file / open_knowledge / write_file / create_object / evolve_self / glob / grep 等具体行动。canonical 定义 `ObjectMethod`（`packages/@ooc/core/_shared/types/method.ts:48`）。治理动作（resolve PR-Issue / rollback stone）不再是 object method，已转控制面 governance 端点（详见下文「现状」）。
3. **ContextWindow 层** — file / talk / program / do / plan / user-defined object，每个背后是一个 OOC Object（builtin 或 user-defined）。
4. **Registry 层** — 我的注册入口是 `ObjectRegistry.registerExecutable`（只收 object methods + 类元 `parentClass` / `isBuiltinFeature`，`packages/@ooc/core/runtime/object-registry.ts:115`）；它与隔壁 readable 的 `registerReadable` 按维度分工，完整劈分机制详见 readable 维度 knowledge/readable-registration。
5. **Knowledge Activation 层** — 按 method path 自动激活执行所需知识。

## 当前设计（一句话锚，详见 knowledge/）

- **4 个 tool 固定**：`OOC_TOOLS = [EXEC, CLOSE, WAIT, COMPRESS]`，`buildAvailableTools` 恒返回固定四件套；新能力走 method / object type、不增顶层 tool（stable_tool_surface）。详见 knowledge/tool-primitives.md。
- **method 分两类、按维度分注册**：object method（操作数据，`registerExecutable`）vs window method（控展示，归 readable 的 `registerReadable`），同一 type 同名 fail-loud；`ObjectMethod` canonical 含 kind / public / for_ui_access / `MethodOutcome` 三态。详见 knowledge/method-and-constructor.md。
- **constructor 委托**：root 上 talk / do / todo / plan / program / open_file 退化为薄分发器，`exec` 体内 `lookupConstructor("<type>").exec(ctx)` 委托给 type 自身 constructor；`kind:"constructor"` 的 method 返回 `{ ok: true, object }`。详见 knowledge/method-and-constructor.md。
- **root 16 个全局 object method + form 推进**：`ROOT_METHODS`（do / talk / program / plan / todo / end / open_file / open_knowledge / write_file / create_object / evolve_self / glob / grep / example …）；args 不齐 → 系统创建 `method_exec` form，LLM 经 `exec(form_id, "refine"/"submit")` 推进。详见 knowledge/root-methods-and-forms.md。

## method 级准入：permission 三档

行动协议带准入：每条 method 回答「该不该让 LLM 直接执行」。这是 `ObjectMethod` 上的一个声明字段（`packages/@ooc/core/_shared/types/method.ts:60`，按 args 动态判档），runtime 在 thinkloop 分派 tool call **前**查它（`packages/@ooc/core/executable/permissions.ts`）。三档语义（allow/ask/deny）、决策链、以及「deny 档当前 0 项」待办，权威落点全在 knowledge/permission.md。

## 现状

最小闭环已落地。最近两次主线迭代：

1. **去 metaprog，统一 session worktree**：write / edit / program-shell 三通道收敛——business session 对任意 stone（含 cross-object）的读写重定向到 `flows/<sid>/`（eager checkout main 全量，裸读可见全量），super flow `evolve_self` commit→`tryMergeSelf`（self-scope ff-merge / cross-scope PR-Issue）才永久。原 root.metaprog 整条 method 已删——它的写动作（open_worktree / commit / merge / create_object）下放给 write_file / create_object 落 session worktree、走 super flow evolve_self 合入；它承载的 supervisor 治理（resolve PR-Issue / rollback stone）转控制面 governance 端点 `POST /api/runtime/pr-issues/:issueId/resolve`（`packages/@ooc/core/app/server/modules/runtime/api.resolve-pr-issue.ts:28`）/ `POST /api/runtime/stones/:objectId/rollback`（`api.rollback-stone.ts:24`），底层走 `packages/@ooc/core/programmable/versioning.ts` 的 `resolvePrIssue`（`:516`）/ `rollback`（`:671`）；治理语义权威在 reflectable 维度。建新对象走独立的 `create_object`（落 session worktree，`method.create-object.ts`）。program shell `$OOC_SELF_DIR` 经 `resolveStoneIdentityDir(ref, "write")` 解析（`packages/@ooc/core/executable/program/self-env.ts:22`）。
2. **registry 按维度劈分**：我这半是 `registerExecutable`（object methods + 类元），builtin 对象的 `executable/index.ts` 是我的落点。两入口注册 / 同名 fail-loud / builtin 物理分文件的完整劈分机制详见 readable 维度 knowledge/readable-registration。

## 已知问题 / 边界与未决

- **compress scope=auto 未实现**：`scope=windows`（切 compressLevel）与 `scope=events`（折叠中段为 events_summary）均已落地，仅 `scope=auto` 抛 not-implemented（`packages/@ooc/core/executable/tools/compress.ts:372`）：旧 `applyEmergencyGuard` 自动降级已删；scope=auto 预留紧急压缩、策略未定（≠复活旧 guard）。
- **自改方法集无硬 deny**：权威落点 knowledge/permission.md（「deny 档当前 0 项」待办）。方法集 / readable 为全局 main-canonical，per-session 改须经 evolve_self 合入 main 后重注册才生效。
- **边界划分**：我只定义「如何行动」、只管 object method。**window method（展示控制）归 readable**——它在代码里是与我并列的注册维度，对象树里也已是独立 child 对象（与 visible 并列，2026-06-09 起；readable=LLM 侧展示、visible=人类侧 UI）。跨 Object 协作语义归 **collaborable**；方法库形状与演化路径归 **programmable**；前端渲染归 **visible**。

## 优化方向 / 待办

- 补 compress scope=auto 紧急压缩策略（策略未定，≠复活旧 applyEmergencyGuard）。
- 落自改方法集的硬 deny（详见 knowledge/permission.md 的 deny 待办：write_file exec 路径前缀检查 `executable/index.ts` → deny）。

## 名词解释

- **ContextWindow** —— Object 出现在 context 里的形态（既是信息展示单元、又是行动挂载点）；详见 supervisor `knowledge/ooc-glossary.md`。
- **object method** —— 操作 object 自身业务数据的方法，归我，经 `registerExecutable` 注册。canonical 类型 `ObjectMethod`（`packages/@ooc/core/_shared/types/method.ts:48`）。
- **window method** —— 只控制 object 在 context 里展示状态（如 `set_viewport` 写 `state.viewport`）的方法，`kind:"window"`，归 readable，经 `registerReadable` 注册。与 object method 经同一 `exec` 入口分派，同名 fail-loud（`object-registry.ts:52`）。
- **tool 原语** —— LLM 直接可见可调的 4 个稳定接口（`OOC_TOOLS`）：**exec**（在某 object 上调一条 method）/ **close**（关一个 context window）/ **wait**（声明 thread 等某 IO）/ **compress**（操纵 thread 自身 windows[]+events[] 控上下文体积）。
- **constructor** —— `kind:"constructor"` 的 object method，必须返回 `{ ok:true, object }`；manager 看到后把 object mount 进 thread 并写盘。root 上 talk/do/program/… 退化为薄分发器，`exec` 体内 `lookupConstructor("<type>").exec(ctx)` 委托给 type 自身的 constructor（按 kind 索引，非按名字，`object-registry.ts:280`）。
- **registerExecutable** —— 我的维度注册入口（`object-registry.ts:115`），只收 object methods + 类元（parentClass / isBuiltinFeature）；类型层即拒绝 readable 字段越界。与 `registerReadable` 配对，同一 type 两维度分注册、互不覆盖。
- **form（open→refine→submit）** —— exec 时 args 不齐或引入新 path/knowledge，系统创建一个 `method_exec` object（form），LLM 经 `exec(form_id, "refine", args)` 多次补参（每次可触发更细知识激活）、`exec(form_id, "submit")` 提交执行。refine/submit 是 method_exec 上注册的两条 object method，与 do.continue / talk.say 同构。
- **permission** —— ObjectMethod 上的三档（allow/ask/deny）准入声明，thinkloop 分派前查；见 knowledge/permission.md。
- **knowledge activation** —— 按 method path 渐进披露知识：method form open 时对应 intent 命中，knowledge frontmatter 的 `activates_on` 声明同表达式即按需激活。LLM 只在真正进入某条行动路径时看到该路径完整操作说明。

## 协作

- **parent = supervisor**（我的 root parent，把握全局与跨维度裁决）。
- **相关兄弟**：**programmable**（方法库形状 / 热更 / 演化路径，与我在同一份 `executable/index.ts` 上分流）、**thinkable**（compress 与 context_budget 配套；thinkloop 分派我的 tool call）、**readable**（与我物理分注册——我管 object method 改数据，它管 window method 控展示，registry 在 `mergeExistingDefinition` 里两维度互不覆盖、同名 fail-loud）。
