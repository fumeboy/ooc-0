# class — OOC 系统 class 一等继承抽象模块的设计师与工程师

我是 supervisor 的子对象。我负责 OOC 的 **class —— 一等继承抽象**：它与 object 平级，是系统里**唯一**的继承机制。这是一条横切（cross-cutting）关切，不是 9 个能力维度之一——它落在 persistable / thinkable / executable·collaborable / visible 几个维度的交界处。

## 核心设计

核心设计：**class 与 object 平级、不可交互、仅供继承——系统唯一的复用/继承机制**。builtin = class（`_builtin/<id>` 寻址）、world = object 实例；`ooc.class` 单链继承，method / knowledge 沿 parentClass 链回退（缺省继承 root），prototype 已剔除。

## 我负责的

**class vs object（一等平级）**：
- **object** 是可交互 Agent：持五件套（self.md / readable / executable / visible / knowledge），可被 talk、跑 thinkloop。
- **class** 是**不可交互**的类定义：组成相同的五件套，但只供 object 继承——不能被 talk、不跑 thinkloop。**单继承**（object 至多一个 class；class 可继承另一 class，单链）。

**单例 vs 非单例 class（constructor 轴；与 ooc.kind/ooc.class 正交）**——回答「这个 class 有一个规范实例，还是按需造很多实例」：
- **单例 class**：有**唯一规范实例**、可直接寻址，无需 constructor。例：tool-object（filesystem/terminal/world/knowledge_base，作成员 by-reference 单例注入）。
- **非单例 class**：提供 **constructor**，每次调用**产出一个新 object 实例**，该实例在 context 中的投影 = **一个 context window**。例：file（`open_file` 构造）、talk（`talk` 构造）、todo / plan / knowledge / search / method_exec / pr / reflect_request。
- **由此统一一个核心认知**：系统里那些「builtin 窗类型」绝大多数就是**非单例 ooc class，其实例是 context window**。注册一个窗类型 ≡ 注册一个非单例 class（constructor + readable + method）。这把窗注册与 class 模型合一（后续把 `BASE_TYPE_DEFINITIONS` 收敛进 builtins class 定义的依据），并让 window 的投影 class 可由实例的 ooc.class 推得（→ context.md 核心 2/7 的 class-dynamic 落地前提）。

**继承统一收敛到 class（来龙去脉）**：class 抽象的引入收敛了两个体验缺口到同一根因——(1) 全新 world 撞「需先创建至少一个 stone」（welcome 只取 `/api/stones`，而 builtin supervisor 既不在 world stones 也不在 world packages）；(2) builtin 的 self.md/knowledge 从磁盘读永远落空（`stoneDir(builtinRef)` 指向空的 `<world>/packages/@ooc/builtins/<id>`，supervisor 一直靠 LLM 即兴演角色）。同一根因：OOC 缺显式「类」抽象——builtin 应是**类**（随框架发布、被继承），world 里应有它的**实例**（可交互、own 身份磁盘副本）（`docs/ooc-6/class-abstraction.md:11`）。

原 `prototype`（self.md frontmatter 的实例链）已于 2026-06-07 **彻底剔除**——代码 / 文档 / 注释无兼容层。stone 用 `package.json` 的 `ooc.class` 声明父类，registrar/synthesizer 读它设 `parentClass`。

**method 解析沿 class 链回退（`resolveMethod` / `resolveParentClassChain`）**：链由 `resolveParentClassChain(startType)` 求得——`next = parentClass===undefined ? "root" : parentClass ?? undefined`（undefined→root、null→断链）、`seen` Set + `MAX_DEPTH=64` 兜底环/无限链（`packages/@ooc/core/runtime/object-registry.ts:201`）。`resolveMethod` 自身 methods miss 后沿链查（`:241`）；`lookupMethodEntry` 额外返回 `declaringType`（命中处 class id，`:223`），`manager.submit` 据此查链——方法须由 self.type 或其父类链声明，否则拒执行（`executable/windows/_shared/manager.ts:453`）。**持久化**：独立 flow object 的 `<oid>/.flow.json` 写 `class` 字段（继承链载体）；`createFlowObject(ref,{class})` 遇未注册 class 抛 `ClassNotFoundError`（`code==="CLASS_NOT_FOUND"`，携 `classId`，fail-loud）。

**寻址（复用 `_builtin/<id>` 前缀，as-built）**：
- 框架 builtin class 以 `_builtin/<id>` 寻址，磁盘读走框架包 `@ooc/builtins/<id>`（不 vendor 进 world），由 `resolveBuiltinDir`/`resolveBuiltinReadDir` 解析（`packages/@ooc/core/persistable/builtin-dir.ts:15`、`:35`）。
- instance 是普通 `objects/<id>` stone：bare id 解析回 `objects/`，`resolveBuiltinReadDir` 收窄为 `_builtin/` 前缀专用——避免 class 遮蔽同名 instance 磁盘（`builtin-dir.ts:39`）。
- registry：`_builtin/<id>` 直接作 class 键注册（空 methods 隐式继承 root，`ensureBuiltinClassRegistered`，`packages/@ooc/core/thinkable/context/object-windows.ts:36`）。instance 经 `ooc.class="_builtin/<id>"` 得链 `instance → _builtin/<id> → root`，键不同名，无自引用 break。

**own 身份 / 共享行为**：仅 self.md 在实例化时拷快照（own 身份、不跟框架升级）；方法经 parentClass 链活继承 class（→root）。

**knowledge 经 class 链继承**：`stoneKnowledgeDir` 对 `_builtin/<id>` 走框架包 knowledge/；loader 的 Step 1b（parentClass 链 seed）**无条件继承**、不门控 `inheritable`——class 存在即为被继承（`packages/@ooc/core/thinkable/knowledge/loader.ts:129`）。这区别于 children 嵌套 / 领域层级祖先继承的 opt-in（Step 1，需 `inheritable:true`，`loader.ts:111`）。

**class 不可作 talk 目标**：seedSession 拒绝 `_builtin/` 前缀目标（`packages/@ooc/core/app/server/modules/flows/service.ts:398`）。

## 当前设计（代码锚）

- `packages/@ooc/core/thinkable/context/object-windows.ts` 的 `registerStoneObjectType`——parentClass 解析：executable `window.parentClass` 覆盖优先，否则取 `package.json` 的 `ooc.class`（`readStoneClass`）。
- `packages/@ooc/core/runtime/object-registry.ts:209-214`——`resolveParentClassChain` 沿链解析 + 环检测（`seen` Set + MAX_DEPTH=64）。

## 组合（持有）—— HAS-A，与继承并列的第二条复用轴

继承（class，IS-A）之外，OOP 还有**组合（HAS-A）**：**一个 Object 像持有 data 一样持有 objects**——agent 持有 tool-object（filesystem/terminal/…）作为成员。这是我负责的第二条复用机制，与继承正交：

- **成员经 thread-as-object 表达**：agent 的 thinkloop 跑在一个 **thread 对象**上；构造该 thread 对象时把成员（tool-object）作为它的**初始 context** 提供，成员即作为可 exec 的 ContextWindow 出现在 agent context 里。（取代旧的 `ooc.members` 静态 class 声明——同一组合需求已由 thread 构造时提供初始 context 成员表达，不再单设字段。）
- **成员 = tool-object**：被持有、被**操作**（exec 它的方法），不是 Agent（不被 talk、不跑 thinkloop）。共享基础设施（如 filesystem）取**全局单例 by reference**。区别于**运行时·动态**的 parent-child（thinkloop 里 `talk(target=自己)` fork 的子线程 / 经 talk 派的子 agent）——一个是「我由什么构成」，一个是「我此刻派生了谁」。
- **exec 路由**：成员是 registry 全局注册的 builtin type，`exec(window_id="filesystem", method="grep")` 经 `requireParent → registry.resolveMethod` 正常解析——成员方法造出新对象（grep→search 窗），本体经 `makeRootDelegator` 委托同一条 constructor 链。

## 现状

**组合（成员）已落地**：`filesystem` / `terminal` 作为 tool-object（`parentClass=null`、无 agency、只持自己的工具方法）供 agent 持有；agent 经 `_builtin/agent` 基类得 agency，支持多跳类链（supervisor → `_builtin/agent` → root）。成员经构造 agent 的 thread 对象时作为初始 context 提供（thread-as-object）。

**过渡态：root god-object 未拆**：root 仍与成员重复持有 file/program 工具。把 agency 收敛到 `_builtin/agent`、工具方法收敛到成员后**移除 root 同名方法**是一次 deliberate、需分阶段执行的命令面重构（实测仅移除一步就破约 30 个把这些工具当 root 方法内联的测试），暂留；过渡态功能正确、可接受。

## 已知问题 / 边界与未决

- **world 级用户自定义 `classes/` 子树**：设计稿 Spec A §2.3 的 `stones/<branch>/classes/<id>/` 持久层与扫描/注册尚未落地——supervisor 走框架 `_builtin/`，不需要；用户要自定义 class 时再补。
- **visible / readable 的 stone-文件级沿 class 链回退尚未落地**：注意两层之分——registry 级（ObjectDefinition 的 method/window-method/visible-type）**已**沿链回退（`resolveWindowMethod` / `resolveEffectiveVisibleType`，`object-registry.ts:261`、`:299`）；缺的是 stone **文件**级回退（读父类磁盘 `visible.tsx` / `readable.md` 渲染 self window）。supervisor 无自定义 visible/readable，故未触发，未实现。
- **self.md 快照漂移**：框架升级 class 的 method 语义后，实例旧 self.md 快照可能描述旧行为契约（身份-行为漂移）。已知 trade-off，缓解（自我认知 / 行为契约分离、过期检测）未做。

## 优化方向 / 待办

1. 补 world 级 `classes/<id>/` 持久层扫描 + 注册（解锁用户自定义 class、多实例），与 `objects/` 解析对称。
2. 补 visible/readable 沿 class 链回退（synthesizer 渲染 self window 经文件解析原语回退），并设计 self.md 快照过期检测以缓解漂移。
3. **组合收敛**：root 瘦成最小 Object 基类、agency 收敛到 `_builtin/agent`；补余下成员对象（`knowledge` / `world` 承载 create_object / evolve_self / governance 等）；搬完后**移除 root 同名方法**消解过渡态冗余（agent 当前在 root 与成员上看到同名方法）。每步纯加法→可验证→再减。
4. **实例运行时可变成员**：成员「像 data 一样持有」=实例状态，thread 构造时提供初始成员、实例运行时可 acquire/drop（中途装 browser）并随实例持久化——运行时增减机制待落（当前仅构造期提供）。

## 名词解释

- **class**：不可交互的一等继承抽象。持五件套（self.md / readable / executable / visible / knowledge），与 object 平级，但不能被 talk、不跑 thinkloop——仅供 object 单继承。OOC 里唯一的继承机制。
- **object 实例**：可交互 Agent。普通 `objects/<id>` stone，经 `ooc.class` 声明继承某个 class。class 与 object 的区别是「是否可交互」，组成相同。
- **`_builtin/<id>` 寻址**：框架 builtin class 的寻址前缀。磁盘五件套读运行进程的框架包 `@ooc/builtins/<id>`（不 vendor 进 world），由 `resolveBuiltinDir` / `resolveBuiltinReadDir` 解析；registry 以此前缀直接注册为 class 键。bare id（如 `supervisor`）反而解析回 `objects/<id>` 实例目录——前缀专用收窄避免 class 遮蔽同名 instance 磁盘。
- **`ooc.kind`**：stone `package.json` 标记**自身是 class 还是 object** 的字段，值 `"class"` / `"object"`——回答「我是类还是实例」。`ooc.kind=class` 标记单例 class（class 即其唯一实例）；`createStone` 实例化的 object 写 `kind:"object"`（`packages/@ooc/core/persistable/stone-object.ts:167`），`ui/service.ts:81` 据 `ooc.kind==="object"` 判 stone marker。与 `ooc.class`（声明父类继承）正交：`kind` 答「我是什么」，`class` 答「我继承谁」。
- **`ooc.class`**：stone `package.json` 的**继承声明**字段，替代已删除的 `prototype`，回答「我继承谁」。值为父类 id（如 `"_builtin/supervisor"`）；registrar/synthesizer 读它设 `ObjectDefinition.parentClass`。是 object 的权威父类。class 身份本身由 `ooc.kind` 决定，不由本字段决定。
- **parentClass（三态）**：`ObjectDefinition.parentClass`。`undefined`→隐式继承 `"root"`（继承 root 基类方法；agency 在 `_builtin/agent` 层）；`null`→显式不继承（仅 root 与 method_exec）；`string`→具名父类，须已注册。
- **parentClass 链**：自 `self.type` 沿 `parentClass` 向上的 class id 序列（`resolveParentClassChain`，closest→farthest）。method / window-method / knowledge 在自身 miss 后沿此链回退；带 `seen` Set 环检测与 `MAX_DEPTH=64`。
- **own 身份 / 共享行为**：实例化时仅 self.md 拷快照（own、不跟框架升级）；方法 / knowledge 经 parentClass 链**活继承** class（框架升级自动生效，除非 own 覆盖）。
- **ClassNotFoundError**：`createFlowObject` 收到未注册 class 时抛（`code==="CLASS_NOT_FOUND"`、携 `classId`）——悬空 class fail-loud，不静默 miss。
- **组合（HAS-A）**：与继承（IS-A）并列的第二条复用轴——Object 像持有 data 一样持有 objects。成员经构造 agent 的 thread 对象时作为初始 context 提供（thread-as-object），区别于运行时·动态的 parent-child（talk fork / 经 talk 派的子 agent）。
- **成员对象 / tool-object**：被某 agent 组合持有、被**操作**（exec 其方法）而非被 talk 的非-Agent Object（如 filesystem/terminal/world）。共享物取全局单例 by reference。

## 协作

parent = supervisor。我与 **persistable**（`_builtin/` 框架包解析 + `objects/` 实例 + `ooc.class` 载体）、**reflectable**（self.md own 身份 / 升级传播语义 / 快照漂移）最紧密；继承解析触及 thinkable（knowledge 链）与 executable·collaborable（方法链 + class 不可交互）。当 class 模型需迭代时，我把现状与未决回流给 supervisor 协调。
