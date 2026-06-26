# readable — OOC 系统 readable 维度的设计师与工程师

我负责 OOC 的 **readable（被读 / 展示）维度**：一个 Object 出现在思考者（LLM）的 context 里时，它**怎样把自己投影成 context window**——按视角算出投影 view、把自身 Data 渲染成展示内容、提供调节展示程度的 window method。我是 supervisor 之下的维度对象，与 visible 并列——**我管 LLM 侧的展示（投影进 context），visible 管人类侧的展示（tsx 画进浏览器）**。同一个 Object，两个观众，两条展示线。

## 编辑规范

维护本文须守以下规范，使其长期高内聚、低耦合、不漂移：

1. **单一权威**：readable 维度的概念模型只定义一处。新增/变更先改本文、再改代码；散落的旧知识吸收进来即删旧文档，不另起平行文档。
2. **四段结构**：① 核心设计（原子原则，逐条编号、一句一条、相互正交）；② 派生设计（核心组合后涌现的能力，不引入新原则）；③ 细节补充（字段/接口/寻址/边界）；④ 模拟推演（把模型放进真实运行时场景，暴露并收敛缺口）。新内容按归属入段，不混段。
3. **高内聚低耦合**：只讲 readable 自身的设计 + 它对外暴露的契约；object 模型（class/object/继承）归 object 维度、object method 归 executable、context 渲染管线归 thinkable——本文只声明 readable 如何投影，不越界复述。
4. **描述设计与接口、非实现走查**：讲"是什么/为什么/契约"，不逐函数走查；代码锚点仅在确有必要时给。
5. **精炼标准语言**：一句话能说清不写三句；术语统一。
6. **旧概念单独标注**：与旧实现的差异/迁移放「迁移映射」，明确标"非设计"，不混进核心。
7. **自洽**：任何改动须与全文不矛盾（核心各条之间、核心与派生之间），也不得与其他权威冲突；发现矛盾先修设计再落文字。

---

## 一、核心设计

1. **怎样被读，由 Object 自己控制**：一个 Object 进入 LLM context 时的"长相"是它自己的 readable 算出来的，不是渲染器替它决定的。readable 是 Object class 的一个维度模块（`readable` 投影函数 + `window` 投影 view 声明），与 executable 并列收口进 `index.ts` 的 `export const Class`。

2. **Object 持 Data，readable 把 Data 投影成 window**：Object 自身的业务数据是 `Data`（结构由 class 的 `types.ts` 定义）；readable 把它**投影**成一个 context window——按视角动态算出 window 的 **view** 与展示 **content**（结构化节点或纯文本）。投影是「读」的算子，不持久化投影结果。术语区分：**`view` = 投影视角**（如 `default` / `self` / `super` / `talk`），与 `OocObjectRef.class` = 对象 class id（如 `_builtin/agent/thread`）是两个正交概念——view 描述"投影方案"，class 描述"对象身份"。

3. **投影态 win 与业务 Data 分离**：window 的展示态（如 viewport、transcript 区间）是 `win`，与 `Data` 物理分离持久化——runtime 实例把 `data` 与 `win` 显式分作两个字段。readable 同时读 `Data`（算内容）与 `win`（算展示范围）。

4. **window method 只动 win、返回新 win，不碰 Data**：readable 提供 window method 调展示**程度/范围**（详细/部分/总结/压缩、viewport…）。它收 `(ctx, self, before_win, args)`、返回**新的 win**（不可变，runtime 写回实例的 win），不改 Data、不产副作用；出错直接 throw。这是它与 executable 的 object method（改 Data、可副作用）的根本分界。

5. **同一 Object 多视角投影成不同 window view**：readable 可声明多个 window view——同一个 Object 实例按视角（看它的 thread POV、它当前状态）投影成不同的 view，每个 view 各自声明展示哪些 object method、提供哪些 window method。投影 view 是渲染期动态算出的（`ReadableProjection.view`），不写进实例存储的固有 class。**多视角投影按 surface method 分集——thread 是典型例**（issue I）：default（对端视角）surface `say`、self（自看视角）surface `reply`/`end`/`todo`、super（反思扩 self）surface `reply`/`end`/`todo` + 4 个 reflect method；各视角 surface 该视角能行使的 method 子集而非全集叠加，把 method 方向语义（caller/callee 谁能调）与 surface 闸门校齐。**默认投影 view 名约定**：`"default"` 是保留关键字——**单视角 class**（`window[].length === 1`）的唯一 decl 的 `view` 字段必须为 `"default"`（注册期强约束，fail-loud）；**多视角 class** 各视角具名（如 thread = `default` / `self` / `super`，issue I 三视角），是否提供 `default` decl 自决——通常多视角每条都具名语义，不强求兜底。术语：`WindowViewDecl.view`（字段名） / default 约定（规则） / default view 值（字符串字面量 `"default"`）三者分开命名。**LLM 看到的 XML attribute 用 `<window view="...">`**（issue J 起从历史的 `class=` 改 `view=`，让 XML 也对齐"投影方案"语义）。

6. **method/guide/window method 三侧 name 全集不重名 fail-loud**：同一个 class 上，object method（executable / 单步）、guide method（executable / 多步引导）、window method（readable）三侧共享同一 exec-by-name dispatch 入口，**任意两侧重名都有优先级歧义、注册期 fail-loud**。同侧补：window decl 数组内 `view` 字段不重复（否则 `resolveWindowView` 静默取首个，dispatch 歧义）+ 各 window decl 的 `object_methods` / `guide_methods` 引用必须能在 `ExecutableModule.methods` / `ExecutableModule.guides` 内解析（悬空 fail-loud）。

7. **静态 readable.md 名片是投影的最低优先级回退**：Object 可写一张静态自我介绍名片 `readable.md`（"我是谁、能做什么、何时找我"，协作网络里的对外名片，与 self.md 双面身份）。它是 `<readable>` 投影槽位的**最低优先级兜底**——class 有动态 readable 时用动态投影，没有时才回退读这张名片，再没有才落 placeholder。`resolveDefaultWindowView(classId)` 找不到 default decl 时（多视角无 default 豁免场景）回退到这张名片渲染，兑现本核心。

**渲染入口**（issue E 收口）：核心 5 / 7 的三档 fallback 由 `packages/@ooc/core/readable/render-context.ts:renderReadable` 单入口完成，出 `ReadableResult { payload, source: "render-fn"|"static-card"|"placeholder", warning?, projectionView?, nextWin? }`。**`<window>` XML 壳由调用方自己包**（典型：thread builtin 的 thinkable/context.ts，XML attribute 用 `view`，issue J）；renderReadable 只出 payload + source 标识。`source` 字段供 storybook / observability 区分本次渲染命中哪档，便于排查"不该 placeholder 却落了"漂移。

8. **方法可见性单一来源 = readable.window**（issue E，跨维度收口）：某 method 对哪些视角可见、可调，**完全**由各 `WindowViewDecl.object_methods[]` / `WindowViewDecl.guide_methods[]` 决定。executable 协议层**不持** `public?` 字段——method/guide 协议最小化，可见性策略集中在本维度，跨维度无双权威。

9. **与 visible 互为镜像**：readable 是 LLM 侧展示（投影成 context XML），visible 是人类侧展示（tsx 画进浏览器）。两者并列、不互相吞并；同一个 Object，readable 面向思考者、visible 面向用户。

---

## 二、派生设计

这些不是新增机制，而是核心组合后自然涌现的能力。

- **会话窗去重收纳**：会话载体（thread）投影时，把归属本窗的消息收进 transcript 并报告这批消息 id（`consumedMessageIds`），渲染器据此从顶层 inbox/outbox 兜底里剔除——一条消息要么进某窗 transcript、要么进顶层兜底，"信息只渲一次"（context 模型核心 10）。这是核心 2/5（按视角投影 + 报告已渲内容）的组合，不是新机制。
- **展示预算自适应**：window method 调展示程度（核心 4）让同一 Object 在 context 预算紧张时给精简投影、宽裕时给详细投影——不改 Data，只换 win，所以投影随时可收放。
- **本类直查的投影复用**：object 经 `ooc.class` 单跳 binding 一个 class（**实例 binding，不是继承链**——对象模型核心 2）；readable / window method / window view 声明都**只查本 class**（无 fallback、无 chain walking）。子 class 要复用父 class 的投影，经**源码 import + spread** 在子的 `readable/index.ts` 显式拼父模块（`{ ...parent, window: [...parent.window, myWin] }`）——继承在源码层表达、注册期就是扁平结果。运行时无继承链，行为可预测。
- **ref 显式持视角的渲染路径短路**（issue J）：`OocObjectRef.window_view?` 可选字段——ref 创建点（如 thread.construct 写 `window_view: "self"`、createSuperThread 写 `"super"`）显式标本窗投影视角；readable render 优先用 ref.window_view、缺省退到 fallback 推导（dev-mode 打 warning）。这让"哪个视角"在 ref 上单一来源、避免 readable 内分散推导。

---

## 三、细节补充

- **契约单一权威**：readable 维度的可编译契约在 `packages/@ooc/core/types/readable.ts`——
  - `ReadableModule = { readable(ctx, self, win) => ReadableProjection, window: WindowViewDecl[], intents?(self, ref) => readonly string[] }`。**`intents?`**（issue N 新增可选槽）：本 class 暴露给上下文聚合的 intent 集合,由 `core/thinkable/context/scanIntents.ts` 在每轮 thinkloop 调一次、Set 去重后注入 `ReadableContext.intents`。**stateless 投影**——每轮重算、无缓存,form close 后自然消失。典型实现:`method_exec_form` 产 `form_open::<targetClass>::<guideName>` + `user::<name>` user intents；`thread` 据 ref.window_view + sessionId 产 `class::root` / `class::talk` / `super_flow::active`；`agent` 产 `class::root`（callee 门面）。缺省 undefined = 本 class 不产 intent。
  - `ReadableProjection = { view, content, win?, consumedMessageIds? }`：投影 view 名 + 展示内容（`XmlNode[] | string`）+ 可选新 win 投影态 + 本窗已收纳消息 id。
  - `WindowMethod = { name, description, schema?, exec(ctx, self, before_win, args) => Win }`：签名收 self(只读 Data)+before_win(当前投影态)+args，返回新 win；出错 throw。
  - `WindowViewDecl = { view, object_methods, guide_methods?, window_methods }`：一个投影 view 声明展示哪些 object method（按名引用 `ExecutableModule.methods`）+ 展示哪些 guide method（按名引用 `ExecutableModule.guides`，issue 2026-06-26-object-guide-method-split 引入）+ 提供哪些 window method。method 与 guide 命名空间共享 dispatch 入口，跨域重名 fail-loud；引用悬空 fail-loud。
  - `ReadableContext = { object: { id, class }, intents: Set<string> }`（issue N: `intents` 必填,缺省传空 Set 即可）：readable / window method 的执行上下文（读侧）。`intents` 由 core scanIntents 聚合,所有 readable render 据"基于意图的资源激活"协议消费（knowledge_base 是实现之一）。
  - `ReadableContext = { object:{id,class} }`：读侧上下文，不携带改业务数据的能力。
- **装配与注册**：各 class 的 `index.ts` 一处 `export const Class = { construct?, executable, readable, persistable }`（`packages/@ooc/core/runtime/ooc-class.ts`）；经 `register(cls)` 注册进 registry（`packages/@ooc/core/runtime/object-registry.ts`）。注册期校验 method↔window method 不同名（`assertNoMethodNameCollision`）+ **method/guide/window method 三侧 cohesion**（`assertExecutableMethodGuideCohesion`：guides 内部查重 / method 与 guide / guide 与 window method 跨域不重名 / window decl 的 `object_methods` 与 `guide_methods` 引用悬空 fail-loud）+ readable.window cohesion（`assertReadableWindowCohesion`：单视角强 default / 多视角 default-or-all-named / view 字段唯一）。
- **默认投影 view seam**：`resolveDefaultWindowView(classId)` 查 `view === "default"` 的 decl，是单视角 class 的兜底入口；多视角 class 若无 default decl 时返 undefined，调用方回退到 `readable.md` 名片（兑现核心 7 最低优先级回退）。`DEFAULT_WINDOW_VIEW` 常量作字符串字面量唯一源。
- **投影态与业务数据分离落盘**：runtime 实例 `OocObjectInstance = { id, class, data }`；ref `OocObjectRef = { id, class, window_view?, title?, createdAt, data?, closable? }` 把身份元信息（id/class）、视角投影 hint（window_view）、投影态 win（data）显式分离；win 随实例持久化，readable 渲染期读它。
- **投影解析与回退**：渲染器对每个实例先 `resolveReadable(inst.class)?.readable(ctx, self, ref)` 取投影；无 Class.readable 时回退读盘 `readable.md`；都无落 placeholder（`renderReadable` 三档 fallback，`core/readable/render-context.ts`）。
- **viewport 纯 helper**：viewport 类 window method 不再走集中执行体，各 class readable 自装 set_viewport + 自带 viewport 纯 helper（`mergeViewport` / `applyViewport`）。曾收在 `core/_shared/utils/viewport.ts` 共享，现已拆解进各 class 内部（自我闭环、容忍重复）：file/knowledge/example 各有 `readable/viewport.ts`（二维行列）；thread/search/process 各有 `transcript-viewport.ts`（tail/range）。
- **样板**：投影 + window method 的标准样板见 `packages/@ooc/builtins/knowledge_base/children/knowledge/readable/index.ts`（set_viewport + Data 投影）；会话窗"一个实例多视角投影成多 view"见 `packages/@ooc/builtins/agent/children/thread/readable/index.ts`（thread 投影成 default/self/super 三 view，issue I 修正 issue E 二投影合并 caller+callee surface 的语义 bug）；最小对象样板 `packages/@ooc/builtins/example/`（types/executable/readable/persistable 分文件 + index.ts 一处装配）。

---

## 四、模拟推演

把设计放进真实运行时场景，暴露缺口与方向。

- **resolveXxx 本类直查、不沿链回退（已退役旧设计）**：registry 的 `resolveWindowMethod` / `resolveReadable` / `resolveWindowView` 在旧设计里曾沿 self→父类解析，但 issue `2026-06-25-inheritance-via-source-import-spread` 裁决 D4 后改本类直查、无 chain walking——子 class 想复用父投影经源码 `import { Class as parent }` + `{ ...parent.readable, ... }` spread 表达。方向：补一条"子 class 经 spread 继承/覆盖父 class 投影"的实测。
- **投影质量需真 LLM 判（中）**：投影渲染得好不好、压缩得当不当，本质是 context 质量问题，控制面确定性测不出。方向：补 agent-native 验证——agent 自写一个 object 的 readable（控其在 context 里的投影）或调 window method 改 viewport，确定性核验实例 win 的变化。

---

## 迁移映射（非设计 / 旧）

| 旧概念 | 归并到 |
|---|---|
| `WindowClassDecl` / `decl.class` / `resolveWindowClass` / `resolveDefaultWindowClass` / `DEFAULT_WINDOW_CLASS` / `ReadableProjection.class` / `projectionClass` / `<window class="...">` XML attribute（**术语 "window class" 阶段**） | issue J 已统一改为 **window view** 术语：`WindowViewDecl` / `decl.view` / `resolveWindowView` / `resolveDefaultWindowView` / `DEFAULT_WINDOW_VIEW` / `ReadableProjection.view` / `projectionView` / `<window view="...">`。术语"class"在 readable 维度内不再用作投影视角概念——`OocObjectRef.class` 专指对象 class id（对象身份），与 view（投影方案）正交。 |
| `registerReadable` / `registerExecutable` / `registerObjectType`（分维度注册入口） | 已退役；单入口 `register(cls)`，各维度模块经 `export const Class` 收口 |
| `ObjectDefinition`（旧 registry store 元素，平铺 methods + 旧 readable hook） | `OocClass`；store 元素 `RegisteredClass` |
| `windowMethods`（旧 ObjectDefinition 字段） | `readable.window[].window_methods` |
| `renderXml` / `ReadableFn (ctx)=>XmlNode[]`（旧动态渲染 hook） | `readable(ctx, self, win) => { view, content }`——收 self/win，返回投影 view + 内容 |
| `WindowDisplayState` / `window.state` / `windowState` 快照 | 投影态 `win`（与 Data 分离）；window method 返回新 win |
| `WindowMethodOutcome`（旧 `{ok,state,result}` 返回） | 已退役；window method 直接返回新 win，出错 throw |
| `compressView` / `CompressViewHook` / `onClose` / `mergeExistingDefinition` | 已退役（Wave4 readable 契约不再含这些 deferred hook）；展示程度收放靠 window method 换 win |
| `windowSetViewport`（旧集中执行体，`executable/windows/_shared`） | 已删；各 class readable 自装 set_viewport + 自带 viewport 纯 helper `mergeViewport`/`applyViewport`（拆解进各 class，不再共享 `core/_shared/utils/viewport.ts`） |
| `_shared/types/window-method.ts` / `window-state.ts` / `registry.ts(ObjectDefinition)`（旧文件） | 均已删；契约统一在 `types/readable.ts` |
| **programmable**（曾为独立维度，"Object 自写 readable 的形态/热更"） | 已并入 reflectable（"改身体 = 为自身编程"） |
