# readable — OOC 系统 readable 维度的设计师与工程师

我负责 OOC 的 **readable（被读 / 展示）维度**：一个 Object 出现在思考者（LLM）的 context 里时，它**怎样把自己投影成 context window**——按视角算出投影 class、把自身 Data 渲染成展示内容、提供调节展示程度的 window method。我是 supervisor 之下的维度对象，与 visible 并列——**我管 LLM 侧的展示（投影进 context），visible 管人类侧的展示（tsx 画进浏览器）**。同一个 Object，两个观众，两条展示线。

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

1. **怎样被读，由 Object 自己控制**：一个 Object 进入 LLM context 时的"长相"是它自己的 readable 算出来的，不是渲染器替它决定的。readable 是 Object class 的一个维度模块（`readable` 投影函数 + `window` 投影 class 声明），与 executable 并列收口进 `index.ts` 的 `export const Class`。

2. **Object 持 Data，readable 把 Data 投影成 window**：Object 自身的业务数据是 `Data`（结构由 class 的 `types.ts` 定义）；readable 把它**投影**成一个 context window——按视角动态算出 window 的 **class** 与展示 **content**（结构化节点或纯文本）。投影是「读」的算子，不持久化投影结果。

3. **投影态 win 与业务 Data 分离**：window 的展示态（如 viewport、transcript 区间）是 `win`，与 `Data` 物理分离持久化——runtime 实例信封把 `data` 与 `win` 显式分作两个字段。readable 同时读 `Data`（算内容）与 `win`（算展示范围）。

4. **window method 只动 win、返回新 win，不碰 Data**：readable 提供 window method 调展示**程度/范围**（详细/部分/总结/压缩、viewport…）。它收 `(ctx, self, before_win, args)`、返回**新的 win**（不可变，runtime 写回实例的 win），不改 Data、不产副作用；出错直接 throw。这是它与 executable 的 object method（改 Data、可副作用）的根本分界。

5. **同一 Object 多视角投影成不同 window class**：readable 可声明多个 window class——同一个 Object 实例按视角（看它的 thread POV、它当前状态）投影成不同的 class，每个 class 各自声明展示哪些 object method、提供哪些 window method。投影 class 是渲染期动态算出的（`ReadableProjection.class`），不写进信封的固有 class。

6. **object method 与 window method 同名 fail-loud**：同一个 class 上，object method（executable）与 window method（readable）不能重名——LLM 经统一的 exec-by-name 入口 dispatch，重名会有优先级歧义。注册期直接 fail-loud。

7. **静态 readable.md 名片是投影的最低优先级回退**：Object 可写一张静态自我介绍名片 `readable.md`（"我是谁、能做什么、何时找我"，协作网络里的对外名片，与 self.md 双面身份）。它是 `<readable>` 投影槽位的**最低优先级兜底**——class 有动态 readable 时用动态投影，没有时才回退读这张名片，再没有才落 placeholder。

8. **与 visible 互为镜像**：readable 是 LLM 侧展示（投影成 context XML），visible 是人类侧展示（tsx 画进浏览器）。两者并列、不互相吞并；同一个 Object，readable 面向思考者、visible 面向用户。

---

## 二、派生设计

这些不是新增机制，而是核心组合后自然涌现的能力。

- **会话窗去重收纳**：会话载体（thread）投影时，把归属本窗的消息收进 transcript 并报告这批消息 id（`consumedMessageIds`），渲染器据此从顶层 inbox/outbox 兜底里剔除——一条消息要么进某窗 transcript、要么进顶层兜底，"信息只渲一次"（context 模型核心 10）。这是核心 2/5（按视角投影 + 报告已渲内容）的组合，不是新机制。
- **展示预算自适应**：window method 调展示程度（核心 4）让同一 Object 在 context 预算紧张时给精简投影、宽裕时给详细投影——不改 Data，只换 win，所以投影随时可收放。
- **沿继承链解析投影**：object 经 ooc.class 单跳继承一个 class 时，readable / window method / window class 声明都沿"self 优先、父类次之"解析（首个命中胜出）——子 class 不覆盖 readable 时自然复用父 class 的投影。

---

## 三、细节补充

- **契约单一权威**：readable 维度的可编译契约在 `packages/@ooc/core/readable/contract.ts`——
  - `ReadableModule = { readable(ctx, self, win) => ReadableProjection, window: WindowClassDecl[] }`（`contract.ts:78`）。
  - `ReadableProjection = { class, content, consumedMessageIds? }`（`contract.ts:37`）：投影 class + 展示内容（`XmlNode[] | string`）+ 本窗已收纳消息 id。
  - `WindowMethod = { name, description, schema?, exec(ctx, self, before_win, args) => Win }`（`contract.ts:51`）：签名收 self(只读 Data)+before_win(当前投影态)+args，返回新 win；出错 throw。
  - `WindowClassDecl = { class, object_methods, window_methods }`（`contract.ts:71`）：一个投影 class 声明展示哪些 object method（按名引用 executable）+ 提供哪些 window method。
  - `ReadableContext = { thread?, object:{id,class}, persistence? }`（`contract.ts:20`）：读侧上下文，不携带改业务数据的能力。
- **装配与注册**：各 class 的 `index.ts` 一处 `export const Class = { construct?, executable, readable, persistable }`（`packages/@ooc/core/runtime/ooc-class.ts:47`）；经单入口 `register(classId, Class, { parentClass })` 注册进 registry（`packages/@ooc/core/runtime/object-registry.ts:103`）。注册期校验 object↔window method 不同名（`object-registry.ts:53`）。
- **投影态与业务数据分离落盘**：runtime 实例信封 `OocObjectInstance = { id, class, …, data, win }`（`ooc-class.ts:75`）把身份信封、业务 Data、投影态 win 三者显式分离；win 随实例持久化，readable 渲染期读它。
- **投影解析与回退**：渲染器对每个实例先 `resolveReadable(inst.class)?.readable(ctx, inst.data, inst.win)` 取投影；无 Class.readable 时回退读盘 `readable.md`；都无落 placeholder（`packages/@ooc/core/thinkable/context/renderers/xml.ts:239`，回退链锚点见 `:251/:268/:284`）。静态名片读写在 `packages/@ooc/core/persistable/stone-readable.ts:17`（`readReadable`）。
- **viewport 纯 helper**：viewport 类 window method 不再走集中执行体，各 class readable 自装 set_viewport，复用纯 helper `mergeViewport` / `applyViewport`（canonical 在 `packages/@ooc/core/_shared/types/viewport.ts`，经 `packages/@ooc/core/readable/viewport.ts` re-export）。
- **样板**：投影 + window method 的标准样板见 `packages/@ooc/builtins/knowledge_base/children/knowledge/readable/index.ts`（set_viewport + Data 投影）；会话窗"一个实例多视角投影成多 class"见 `packages/@ooc/builtins/agent/children/thread/readable/index.ts`（thread 投影成 thread/talk/reflect_request 三 class）；最小对象样板 `packages/@ooc/builtins/example/`（types/executable/readable/persistable 分文件 + index.ts 一处装配）。

---

## 四、模拟推演

把设计放进真实运行时场景，暴露缺口与方向。

- **沿 class 链回退尚未被行使（中）**：registry 有 `resolveWindowMethod` / `resolveReadable` / `resolveWindowClass`（沿 self→父类解析，首个命中胜出，`object-registry.ts:191/202/223`），但目前没有自定义 object 覆盖框架 class 的 readable，这条回退链没有被真正行使过。方向：补一条"子 class 继承/覆盖父 class 投影"的实测。
- **投影质量需真 LLM 判（中）**：投影渲染得好不好、压缩得当不当，本质是 context 质量问题，控制面确定性测不出。方向：补 agent-native 验证——agent 自写一个 object 的 readable（控其在 context 里的投影）或调 window method 改 viewport，确定性核验实例 win 的变化。

---

## 迁移映射（非设计 / 旧）

| 旧概念 | 归并到 |
|---|---|
| `registerReadable` / `registerExecutable` / `registerObjectType`（分维度注册入口） | 已退役；单入口 `register(classId, Class, { parentClass })`（`object-registry.ts:103`），各维度模块经 `export const Class` 收口 |
| `ObjectDefinition`（旧 registry store 元素，平铺 methods + 旧 readable hook） | `OocClass`（`ooc-class.ts:47`）；store 元素 `RegisteredClass` |
| `windowMethods`（旧 ObjectDefinition 字段） | `readable.window[].window_methods`（`contract.ts:74`） |
| `renderXml` / `ReadableFn (ctx)=>XmlNode[]`（旧动态渲染 hook） | `readable(ctx, self, win) => { class, content }`（`contract.ts:79`）——收 self/win，返回投影 class + 内容 |
| `WindowDisplayState` / `window.state` / `windowState` 快照 | 投影态 `win`（与 Data 分离，`ooc-class.ts:75`）；window method 返回新 win |
| `WindowMethodOutcome`（旧 `{ok,state,result}` 返回） | 已退役；window method 直接返回新 win，出错 throw（`contract.ts:51`） |
| `compressView` / `CompressViewHook` / `onClose` / `mergeExistingDefinition` | 已退役（Wave4 readable 契约不再含这些 deferred hook）；展示程度收放靠 window method 换 win |
| `windowSetViewport`（旧集中执行体，`executable/windows/_shared`） | 已删；各 class readable 自装 set_viewport，复用纯 helper `mergeViewport`/`applyViewport`（`readable/viewport.ts`） |
| `_shared/types/window-method.ts` / `window-state.ts` / `registry.ts(ObjectDefinition)`（旧文件） | 均已删；契约统一在 `readable/contract.ts` |
| **programmable**（曾为独立维度，"Object 自写 readable 的形态/热更"） | 已并入 reflectable（"改身体 = 为自身编程"） |
