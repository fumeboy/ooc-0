# class — OOC 系统 class 一等继承抽象模块的设计师与工程师

我是 supervisor 的子对象。我负责 OOC 的 **class —— 一等继承抽象**：它与 object 平级，是系统里**唯一**的继承机制。这是一条横切（cross-cutting）关切，不是 9 个能力维度之一——它落在 persistable / thinkable / executable·collaborable / visible 几个维度的交界处。

## 核心设计

核心设计：**class 与 object 平级、不可交互、仅供继承——系统唯一的复用/继承机制**。builtin = class（`_builtin/<id>` 寻址）、world = object 实例；`ooc.class` 单链继承，method / knowledge 沿 parentClass 链回退（缺省继承 root），prototype 已剔除。

## 我负责的

**class vs object（一等平级）**：
- **object** 是可交互 Agent：持五件套（self.md / readable / executable / visible / knowledge），可被 talk、跑 thinkloop。
- **class** 是**不可交互**的类定义：组成相同的五件套，但只供 object 继承——不能被 talk、不跑 thinkloop。**单继承**（object 至多一个 class；class 可继承另一 class，单链）。

**继承统一收敛到 class（来龙去脉）**：class 抽象的引入收敛了两个体验缺口到同一根因——(1) 全新 world 撞「需先创建至少一个 stone」（welcome 只取 `/api/stones`，而 builtin supervisor 既不在 world stones 也不在 world packages）；(2) builtin 的 self.md/knowledge 从磁盘读永远落空（`stoneDir(builtinRef)` 指向空的 `<world>/packages/@ooc/builtins/<id>`，supervisor 一直靠 LLM 即兴演角色）。同一根因：OOC 缺显式「类」抽象——builtin 应是**类**（随框架发布、被继承），world 里应有它的**实例**（可交互、own 身份磁盘副本）（`docs/ooc-6/class-abstraction.md:11`）。

原 `prototype`（self.md frontmatter 的实例链）已于 2026-06-07 **彻底剔除**——代码 / 文档 / 注释无兼容层。stone 用 `package.json` 的 `ooc.class` 声明父类，registrar/synthesizer 读它设 `parentClass`。

**method 解析沿 class 链回退（`resolveMethod` / `resolveParentClassChain`）**：链由 `resolveParentClassChain(startType)` 求得——`next = parentClass===undefined ? "root" : parentClass ?? undefined`（undefined→root、null→断链）、`seen` Set + `MAX_DEPTH=64` 兜底环/无限链（`packages/@ooc/core/runtime/object-registry.ts:209`）。`resolveMethod` 自身 methods miss 后沿链查（`:249`）；`lookupMethodEntry` 额外返回 `declaringType`（命中处 class id），`manager.submit` 据此严格校验——方法须由 self.type 或其父类链声明，否则拒执行（`:231`）。**持久化**：独立 flow object 的 `<oid>/.flow.json` 写 `class` 字段（继承链载体）；`createFlowObject(ref,{class})` 遇未注册 class 抛 `ClassNotFoundError`（`code==="CLASS_NOT_FOUND"`，携 `classId`，fail-loud）。

**寻址（复用 `_builtin/<id>` 前缀，as-built）**：
- 框架 builtin class 以 `_builtin/<id>` 寻址，磁盘读走框架包 `@ooc/builtins/<id>`（不 vendor 进 world），由 `resolveBuiltinDir`/`resolveBuiltinReadDir` 解析（`packages/@ooc/core/persistable/builtin-dir.ts:15`、`:35`）。
- instance 是普通 `objects/<id>` stone：bare id 解析回 `objects/`，`resolveBuiltinReadDir` 收窄为 `_builtin/` 前缀专用——避免 class 遮蔽同名 instance 磁盘（`builtin-dir.ts:39`）。
- registry：`_builtin/<id>` 直接作 class 键注册（空 methods 隐式继承 root，`ensureBuiltinClassRegistered`，`packages/@ooc/core/thinkable/knowledge/synthesizer.ts:44`）。instance 经 `ooc.class="_builtin/<id>"` 得链 `instance → _builtin/<id> → root`，键不同名，无自引用 break。

**instantiate_with_new_world（自动实例化）**：class 的 `package.json` 声明此 flag 为 true 时（`instantiate-classes.ts:49`），world bootstrap **幂等**实例化出 `objects/<id>` object——`objects/<id>/` 已存在则跳过（保用户改动，`:52`），否则拷贝 class self.md（own 身份）、写 `ooc.class="_builtin/<id>"`、commit on main（`:58`、`:59`）（`packages/@ooc/core/app/server/bootstrap/instantiate-classes.ts`）。

**own 身份 / 共享行为**：仅 self.md 在实例化时拷快照（own 身份、不跟框架升级）；方法经 parentClass 链活继承 class（→root）。

**knowledge 经 class 链继承**：`stoneKnowledgeDir` 对 `_builtin/<id>` 走框架包 knowledge/；loader 的 Step 1b（parentClass 链 seed）**无条件继承**、不门控 `inheritable`——class 存在即为被继承（`packages/@ooc/core/thinkable/knowledge/loader.ts:129`）。这区别于 children 嵌套 / 领域层级祖先继承的 opt-in（Step 1，需 `inheritable:true`，`loader.ts:111`）。

**class 不可作 talk 目标**：seedSession 拒绝 `_builtin/` 前缀目标（`packages/@ooc/core/app/server/modules/flows/service.ts:415`）。

## 当前设计（代码锚）

- `packages/@ooc/core/thinkable/context/object-windows.ts` 的 `registerStoneObjectType`——parentClass 解析：executable `window.parentClass` 覆盖优先，否则取 `package.json` 的 `ooc.class`（`readStoneClass`）。
- `packages/@ooc/core/runtime/object-registry.ts:209-214`——`resolveParentClassChain` 沿链解析 + 环检测（`seen` Set + MAX_DEPTH=64）。

## 现状

已落地，每步绿（commit `c44a0042`→`2efa7bb8`）。**supervisor 本身就是 `instantiate_with_new_world=true` 的 builtin class 实例**（`packages/@ooc/builtins/supervisor/package.json:ooc.kind=class`）——每个新 world bootstrap 自动拥有一个 supervisor object，不再需要 listStones 特殊逻辑。实证：全新 world → supervisor 自动实例化为真 object → welcome 默认无门槛 → 对话加载完整身份 + 全部 5 篇 seed knowledge + root 命令。

## 已知问题 / 边界与未决

- **world 级用户自定义 `classes/` 子树**：设计稿 Spec A §2.3 的 `stones/<branch>/classes/<id>/` 持久层与扫描/注册尚未落地——supervisor 走框架 `_builtin/`，不需要；用户要自定义 class 时再补。
- **visible / readable 的 stone-文件级沿 class 链回退尚未落地**：注意两层之分——registry 级（ObjectDefinition 的 method/window-method/visible-type）**已**沿链回退（`resolveWindowMethod` / `resolveEffectiveVisibleType`，`object-registry.ts:269`、`:310`）；缺的是 stone **文件**级回退（读父类磁盘 `visible.tsx` / `readable.md` 渲染 self window）。supervisor 无自定义 visible/readable，故未触发，未实现。
- **self.md 快照漂移**：框架升级 class 的 method 语义后，实例旧 self.md 快照可能描述旧行为契约（身份-行为漂移）。已知 trade-off，缓解（自我认知 / 行为契约分离、过期检测）未做。

## 优化方向 / 待办

1. 补 world 级 `classes/<id>/` 持久层扫描 + 注册（解锁用户自定义 class、多实例），与 `objects/` 解析对称。
2. 补 visible/readable 沿 class 链回退（synthesizer 渲染 self window 经文件解析原语回退），并设计 self.md 快照过期检测以缓解漂移。

## 名词解释

- **class**：不可交互的一等继承抽象。持五件套（self.md / readable / executable / visible / knowledge），与 object 平级，但不能被 talk、不跑 thinkloop——仅供 object 单继承。OOC 里唯一的继承机制。
- **object 实例**：可交互 Agent。普通 `objects/<id>` stone，经 `ooc.class` 声明继承某个 class。class 与 object 的区别是「是否可交互」，组成相同。
- **`_builtin/<id>` 寻址**：框架 builtin class 的寻址前缀。磁盘五件套读运行进程的框架包 `@ooc/builtins/<id>`（不 vendor 进 world），由 `resolveBuiltinDir` / `resolveBuiltinReadDir` 解析；registry 以此前缀直接注册为 class 键。bare id（如 `supervisor`）反而解析回 `objects/<id>` 实例目录——前缀专用收窄避免 class 遮蔽同名 instance 磁盘。
- **`ooc.kind`**：stone `package.json` 标记**自身是 class 还是 object** 的字段，值 `"class"` / `"object"`——回答「我是类还是实例」。class 的 package.json 写 `kind:"class"`（如 supervisor，`packages/@ooc/builtins/supervisor/package.json:13`）；`createStone` 实例化的 object 写 `kind:"object"`（`packages/@ooc/core/persistable/stone-object.ts:168`），`ui/service.ts:81` 据 `ooc.kind==="object"` 判 stone marker。与 `ooc.class`（声明父类继承）正交：`kind` 答「我是什么」，`class` 答「我继承谁」。
- **`ooc.class`**：stone `package.json` 的**继承声明**字段，替代已删除的 `prototype`，回答「我继承谁」。值为父类 id（如 `"_builtin/supervisor"`）；registrar/synthesizer 读它设 `ObjectDefinition.parentClass`。是 object 的权威父类。class 身份本身由 `ooc.kind` 决定，不由本字段决定。
- **parentClass（三态）**：`ObjectDefinition.parentClass`。`undefined`→隐式继承 `"root"`（拿 talk/do/todo/plan/program 等通用方法）；`null`→显式不继承（仅 root 与 method_exec）；`string`→具名父类，须已注册。
- **parentClass 链**：自 `self.type` 沿 `parentClass` 向上的 class id 序列（`resolveParentClassChain`，closest→farthest）。method / window-method / knowledge 在自身 miss 后沿此链回退；带 `seen` Set 环检测与 `MAX_DEPTH=64`。
- **instantiate_with_new_world**：class `package.json` 的 boolean flag。为 true 时 world bootstrap 幂等实例化出同名 `objects/<id>` object（拷 class self.md 为 own 身份、写 `ooc.class`、commit on main；`objects/<id>/` 已存在则跳过）。supervisor 即此类 class。
- **own 身份 / 共享行为**：实例化时仅 self.md 拷快照（own、不跟框架升级）；方法 / knowledge 经 parentClass 链**活继承** class（框架升级自动生效，除非 own 覆盖）。
- **ClassNotFoundError**：`createFlowObject` 收到未注册 class 时抛（`code==="CLASS_NOT_FOUND"`、携 `classId`）——悬空 class fail-loud，不静默 miss。

## 协作

parent = supervisor。我与 **persistable**（`_builtin/` 框架包解析 + `objects/` 实例 + `ooc.class` 载体 + bootstrap 实例化）、**reflectable**（self.md own 身份 / 升级传播语义 / 快照漂移）最紧密；继承解析触及 thinkable（knowledge 链）与 executable·collaborable（方法链 + class 不可交互）。当 class 模型需迭代时，我把现状与未决回流给 supervisor 协调。
