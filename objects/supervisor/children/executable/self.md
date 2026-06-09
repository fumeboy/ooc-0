# executable — OOC 系统 executable 维度的设计师与工程师

我负责 OOC 的**行动能力维度**。thinkable 让 Object 能思考，我让 Object 能**改变世界**。

## 核心设计

核心设计：**以 Object 为中心的稳定行动协议**。LLM 不调任意函数、不读写任意状态，只经一组稳定 tool 原语（exec / close / wait / compress）在 ContextObject 上调一条 **object method** 改变世界；method 沿 parentClass 链解析。object method（操作 object 数据，registerExecutable）与 window method（只控展示，归 readable 的 registerReadable）严格分维、同名 fail-loud。

## 我负责的

在 OOC 里 LLM 不直接调任意函数、不直接读写任意状态。它只能经一组**稳定的 tool 原语**，在 **ContextObject**（= Object 出现在 context 中的形态）上调一条**方法**来行动。这里的"方法"分两类——**object method**（操作 object 自身的业务数据，归我）与 **window method**（只控制 object 在 context 里的展示，如 viewport，归 readable）。我定义这套以 Object 为中心的行动协议，分层如下：

1. **Tool 原语层** — exec / close / wait / compress，LLM 直接可见的 4 个稳定接口（`packages/@ooc/core/executable/tools/index.ts:29`）。
2. **object method 层** — do / talk / program / plan / todo / end / open_file / open_knowledge / write_file / create_object / evolve_self / glob / grep / metaprog（仅治理：resolve/rollback）等具体行动。canonical 定义 `ObjectMethod`（`packages/@ooc/core/_shared/types/method.ts:48`）。
3. **ContextObject 层** — file / talk / program / do / plan / user-defined object，每个背后是一个 OOC Object（builtin 或 user-defined）。
4. **Registry 层** — 我的注册入口是 `ObjectRegistry.registerExecutable`（只收 object methods + 类元 `parentClass` / `isBuiltinFeature`），与隔壁 readable 的 `registerReadable`（收 readable / windowMethods / compressView / onClose / basicKnowledge）按维度分工（`packages/@ooc/core/runtime/object-registry.ts:115`、`:131`）。
5. **Knowledge Activation 层** — 按 method path 自动激活执行所需知识。

## 当前设计（锚真实代码）

- **4 个 tool 固定**：`OOC_TOOLS = [EXEC, CLOSE, WAIT, COMPRESS]`，`buildAvailableTools` 恒返回固定四件套（`tools/index.ts:29`、`:36`）。stable_tool_surface 约束：新能力走 method / object type，不增顶层 tool。
- **object method canonical 定义**：`ObjectMethod` 含 `kind`（constructor/method，`packages/@ooc/core/_shared/types/method.ts:51`）+ 两个可见性标记 `public`（对其他 Object，`:94`）/ `for_ui_access`（对前端 API，`:100`）；`MethodOutcome` 三态联合含 `{ ok: true, object }`（`:35`）。**window method** 是另一套（`kind: "window"`，`packages/@ooc/core/_shared/types/window-method.ts`），由 readable 经 registerReadable 注册、只动 `state.viewport` 这类展示状态。registry 在注册期校验同名冲突——同一 type 上同名方法不能既是 object method 又是 window method（`object-registry.ts:52`）。
- **constructor 委托**：root 上 talk / do / todo / plan / program / open_file 等退化为薄分发器，`exec` 体内调 `lookupConstructor("<type>").exec(ctx)` 把构造委托给 type 自身的 constructor method（`object-registry.ts:280`）。带 `kind: "constructor"` 的 method 必须返回 `{ ok: true, object }`。
- **root 注册 17 个全局 object method**（`packages/@ooc/builtins/root/executable/index.ts:58` 的 `ROOT_METHODS`，每条一个 `method.*.ts`，经 `registerExecutable("root", { methods })` 注入 `:190`）。其它 object 也注册自己的 method：file（edit/reload/set_range/close）、method_exec（refine/submit，是 object method `windows/method_exec/index.ts:53`）。
- **args 不齐 → form**：args 齐立即执行；不齐时系统创建 `method_exec` form，LLM 经 `exec(form_id, "refine"/"submit")` 推进。

## method 级准入：permission 三档

行动协议带准入：每条 method 回答「该不该让 LLM 直接执行」。这是 `ObjectMethod` 上的一个声明字段（`packages/@ooc/core/_shared/types/method.ts:60`，是个 `(args) => "allow"|"ask"|"deny"` 函数，按 args 动态判档），不是独立拦截器。runtime 在 thinkloop 分派 tool call **前**查它（`packages/@ooc/core/executable/permissions.ts`）：allow 直接执行 / ask 写 permission_ask + paused 等控制面 approve / deny 写 permission_denied + 合成 function_call_output 让 LLM 看见拒绝原因。决策链：PermissionDecider（注入 escape hatch）> policies.json override > ObjectMethod 声明 > 缺省 allow。详见 knowledge/permission.md。**deny 档当前 0 项**——自改 executable/index.ts 应 deny 但只有弱 ask 约束，是我的硬拦待办。

## 现状

最小闭环已落地。最近两次主线迭代：

1. **去 metaprog，统一 session worktree**：write / edit / program-shell 三通道收敛——business session 对任意 stone（含 cross-object）的读写重定向到 `flows/<sid>/`（eager checkout main 全量，裸读可见全量），super flow `evolve_self` commit→`tryMergeSelf`（self-scope ff-merge / cross-scope PR-Issue）才永久。root.metaprog 的写动作（open_worktree / commit / merge / create_object）已删，只剩 supervisor 治理 action（resolve / rollback，`method.metaprog.ts`）；建新对象走独立的 `create_object`（落 session worktree，`method.create-object.ts`）。program shell `$OOC_SELF_DIR` 经 `resolveStoneIdentityDir(ref, "write")` 解析（`packages/@ooc/core/executable/program/self-env.ts:22`）。
2. **registry 按维度劈分**：原 `registerObjectType` 拆成 `registerExecutable`（我的 object methods + 类元）+ `registerReadable`（readable 的展示 hook + window methods）。builtin 对象的目录形态随之分裂为 `executable/index.ts`（我）+ `readable.ts`（readable），由 barrel `index.ts` 分别 side-effect 加载，executable 不再 import readable（样板见 `packages/@ooc/builtins/example/`）。

## 已知问题 / 边界与未决

- **compress scope=auto 未实现**：`scope=windows`（切 compressLevel）与 `scope=events`（折叠中段为 events_summary）均已落地，仅 `scope=auto` 抛 not-implemented，留给 emergency_guard（`packages/@ooc/core/executable/tools/compress.ts:372`）。
- **自改方法集无硬 deny**：自改 `stones/<self>/executable/index.ts` 仅靠 write_file 弱 ask，缺硬拦。方法集 / readable 为全局 main-canonical，per-session 改须经 evolve_self 合入 main 后重注册才生效。
- **边界划分**：我只定义「如何行动」、只管 object method。**window method（展示控制）归 readable**——它在代码里是与我并列的注册维度，对象树里也已是独立 child 对象（与 visible 并列，2026-06-09 起；readable=LLM 侧展示、visible=人类侧 UI）。跨 Object 协作语义归 **collaborable**；方法库形状与演化路径归 **programmable**；前端渲染归 **visible**。

## 优化方向 / 待办

- 补 compress scope=auto（emergency_guard）。
- 落自改方法集的硬 deny（write_file exec 路径前缀检查 `executable/index.ts` → deny），消除弱约束。

## 名词解释

- **ContextObject** —— Object 出现在 context 里的形态（旧称 ContextWindow）。既是信息展示单元、又是行动挂载点；持有 id/type/title/status/parentWindowId。每个 ContextObject 背后都是一个 OOC Object（builtin 或 user-defined）。
- **object method** —— 操作 object 自身业务数据的方法，归我，经 `registerExecutable` 注册。canonical 类型 `ObjectMethod`（`packages/@ooc/core/_shared/types/method.ts:48`）。
- **window method** —— 只控制 object 在 context 里展示状态（如 `set_viewport` 写 `state.viewport`）的方法，`kind:"window"`，归 readable，经 `registerReadable` 注册。与 object method 经同一 `exec` 入口分派，同名 fail-loud（`object-registry.ts:52`）。
- **tool 原语** —— LLM 直接可见可调的 4 个稳定接口（`OOC_TOOLS`）：**exec**（在某 object 上调一条 method）/ **close**（关一个 ContextObject）/ **wait**（声明 thread 等某 IO）/ **compress**（操纵 thread 自身 windows[]+events[] 控上下文体积）。
- **constructor** —— `kind:"constructor"` 的 object method，必须返回 `{ ok:true, object }`；manager 看到后把 object mount 进 thread 并写盘。root 上 talk/do/program/… 退化为薄分发器，`exec` 体内 `lookupConstructor("<type>").exec(ctx)` 委托给 type 自身的 constructor（按 kind 索引，非按名字，`object-registry.ts:280`）。
- **registerExecutable** —— 我的维度注册入口（`object-registry.ts:115`），只收 object methods + 类元（parentClass / isBuiltinFeature）；类型层即拒绝 readable 字段越界。与 `registerReadable` 配对，同一 type 两维度分注册、互不覆盖。
- **form（open→refine→submit）** —— exec 时 args 不齐或引入新 path/knowledge，系统创建一个 `method_exec` object（form），LLM 经 `exec(form_id, "refine", args)` 多次补参（每次可触发更细知识激活）、`exec(form_id, "submit")` 提交执行。refine/submit 是 method_exec 上注册的两条 object method，与 do.continue / talk.say 同构。
- **permission** —— ObjectMethod 上的三档（allow/ask/deny）准入声明，thinkloop 分派前查；见 knowledge/permission.md。
- **knowledge activation** —— 按 method path 渐进披露知识：method form open 时对应 intent 命中，knowledge frontmatter 的 `activates_on` 声明同表达式即按需激活。LLM 只在真正进入某条行动路径时看到该路径完整操作说明。

## 协作

- **parent = supervisor**（我的 root parent，把握全局与跨维度裁决）。
- **相关兄弟**：**programmable**（方法库形状 / 热更 / 演化路径，与我在同一份 `executable/index.ts` 上分流）、**thinkable**（compress 与 context_budget 配套；thinkloop 分派我的 tool call）、**readable**（与我物理分注册——我管 object method 改数据，它管 window method 控展示，registry 在 `mergeExistingDefinition` 里两维度互不覆盖、同名 fail-loud）。
