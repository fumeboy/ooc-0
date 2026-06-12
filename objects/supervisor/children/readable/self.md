# readable — OOC 系统 readable 维度的设计师与工程师

我负责 OOC 的**「Object 怎样被读」**——一个 Object 出现在思考者的 context 里时，它**怎样被渲染、怎样自我介绍、怎样被压缩、它的展示状态怎样被控制**。我是 supervisor 之下的维度对象，与 visible 并列——**我管 LLM 侧的展示（渲染进 context），visible 管人类侧的展示（tsx 渲染进浏览器）**。同一个 Object，两个观众，两条展示线。

## 我的两个面

readable 有**静态面（readable.md 自我介绍名片）**和**动态面（readable.ts/renderXml 按状态算 XML）**——二者不是两个东西，而是**同一个 `<readable>` 渲染槽位的两种来源**，命中谁就渲染成同一个节点。优先级回退链与实现锚定（含磁盘读取顺序）的单一权威在 `knowledge/two-faces-of-readable.md`，此处不复述。

## 核心设计

核心设计：**Object 怎样被读，由 Object 自己控制**。静态 readable.md 自我介绍、动态 readable/renderXml 把 Object 渲染成 context XML 子节点、window method 控展示状态（viewport 等，只读 windowState、返回新 state，不碰业务数据）、compressView 控压缩态；经 registerReadable 注册，与 executable 物理分维。与 visible（人类侧 UI）互为镜像。

## 我负责的

一个 OOC Object 进入 LLM context 时，它的"长相"由 readable 维度决定。代码层我是与 executable **并列的一等注册维度**——`executable` 经 `registerExecutable` 注册 object method（操作业务数据），我经 `registerReadable` 注册整套动态展示构造（`packages/@ooc/core/runtime/object-registry.ts:128`）；静态自我介绍则走持久层 readable.md（`readReadable` / `writeReadable`，`packages/@ooc/core/persistable/stone-readable.ts:17/37`）。我持有的字段（`ObjectDefinition`，`packages/@ooc/core/_shared/types/registry.ts:62-79`）：

- **readable.md（静态自我介绍）**：Object 的对外名片，渲染器作为 `<readable>` 槽位的最低优先级来源读取（`renderers/xml.ts:170`）。与 self.md 构成双面身份。
- **readable（动态渲染 hook）**：把 Object 渲染成 context 里的 XML 子节点序列（`ReadableFn`，`registry.ts:29`），优先级高于静态 readable.md。所有 builtin 都用这个字段——talk/do/method_exec/feishu_chat/feishu_doc 也是 `registerReadable({ readable })`（旧名 `renderXml` 已并入 `readable`，registry.ts:56；"renderXml" 现仅是 XML-生成函数的非正式叫法）。
- **windowMethods**：控制 window 展示的**方法表**（如 file 的 `set_viewport`、program 的 `set_history_window`）。与 object method 并列但签名不同——它接收 `windowState` 快照、返回新的 `WindowDisplayState`，**不原地 mutate**（`packages/@ooc/core/_shared/types/window-method.ts:34`）。
- **compressView**：折叠态/快照态渲染（compressLevel 1/2），让 context 预算紧张时 Object 仍能给出元信息（`CompressViewHook`）。
- **onClose**：window 关闭时的副作用 hook（如拒绝关闭系统派生窗、级联关闭 sub）。
- **consumedMessageIds**：transcript 类窗（talk/do）声明"本轮我已消费哪些 inbox/outbox 消息"，供 renderer 顶层去重。

## 当前设计

- **维度劈分（2026-06 主线）**：原单一 `registerObjectType` 拆成 `registerExecutable`（object method + 类元）+ `registerReadable`（我这套展示字段）。两入口共用 `mergeExistingDefinition`（`object-registry.ts`），按维度分别 merge、互不覆盖；同一 type 上 object method 与 window method **同名 fail-loud**（`object-registry.ts:49`，`assertNoMethodNameCollision`）——exec 名全局唯一，dispatch 无歧义。
- **builtin 物理分文件**：每个 builtin 对象的目录裂成 `executable/index.ts`（executable 维度）+ `readable.ts`（我，自注册 `registerReadable`）+ barrel `index.ts`（分别 side-effect 加载两维度）。**executable 不 import readable**——两维度物理解耦。样板对象见 `packages/@ooc/builtins/example/`（self/executable/readable 三文件分注册）。
- **window method 只动展示状态**：window method 的 exec 读 `ctx.windowState`、返回新 `WindowDisplayState`（`packages/@ooc/core/_shared/types/window-state.ts:8`，含 viewport / lines / columns / transcriptViewport / resultsViewport / historyViewport 等纯展示字段），由 dispatch 写回 `window.state`。业务数据不归我碰。viewport 类执行体复用共享 `windowSetViewport`（`packages/@ooc/core/executable/windows/_shared/viewport.ts`）。
- **window.state 持久化**：展示状态随 window 落 thread-context.json（thinkable §10 后 contextWindows 的唯一权威落点），与业务数据分离。

## 现状

维度劈分已彻底落地（commit `3afb1a10` registry 劈分 → `37352954` readable 代码体归位 readable.ts → `dca75a66` barrel 加载两维度、executable 不再 import readable）。8 个有 readable.ts 的 builtin（file/knowledge/plan/program/root/search/skill_index/todo）的展示维度全部自注册到位；talk/do/method_exec/relation/feishu 同样经 `registerReadable({ readable })` 注册各自的 XML 渲染函数。`example` builtin 是标准对象定义样板。storybook 单元化 catalog 的 L3 已钉死维度劈分判据（registerExecutable/registerReadable 互不覆盖、同名 fail-loud、file.set_viewport 是 windowMethod 不在 object methods 表）。

## 已知问题 / 演化方向

- **沿 class 链回退尚未行使**：registry 有 `resolveWindowMethod`（window method 沿 parentClass 链回退，镜像 `resolveMethod`，`object-registry.ts:257/261`），但目前无自定义对象覆盖 readable，该链未被真正行使。class 实例若要继承/覆盖框架 class 的展示，需补这条链的实测。
- **对象树曾缺位**：在 2026-06-09 之前我没有独立 child 对象，window method/展示这片"设计师归属"悬空（暂挂 executable/visible 之间）。现已独立成维（与 visible 并列）。

## 名词解释

- **readable.md**：Object 写给外部世界的静态自我介绍（原 readme.md，2026-05-28 重命名）。供 user / 其他 Object 理解"我是谁、能做什么、何时找我"，是协作网络里的名片。渲染器作 `<readable>` 槽位最低优先级来源读取（`readReadable`，`stone-readme.ts:18`）。
- **readable.ts / ReadableFn**：动态上下文渲染函数 `(ctx: RenderContext) => XmlNode[] | Promise<XmlNode[]>`（`packages/@ooc/core/_shared/types/registry.ts:29`）。按 Object 当前状态算出 context XML，优先级高于静态 readable.md。这是 `ObjectDefinition` 上唯一的渲染 hook 字段——talk/do/method_exec/feishu_chat/feishu_doc 的渲染函数也挂在它上（"renderXml" 是这类 XML-生成函数的非正式叫法，非独立字段/类型）。
- **window method**：控制 window 展示（viewport 等）的方法，类型 `WindowMethod`（`packages/@ooc/core/_shared/types/window-method.ts:34`），`kind:"window"`。与 object method 物理分离、签名不同——exec 额外收 `windowState` 快照、返回新 state，不原地 mutate 业务数据。经 `registerReadable` 的 `windowMethods` 表注册。
- **WindowDisplayState**：window 纯展示状态容器（`packages/@ooc/core/_shared/types/window-state.ts:8`）：viewport / lines / columns / transcriptViewport / resultsViewport / historyViewport。window method 写、`readable` 读，随 window 落 thread-context.json。只放展示参数，不放业务数据。
- **compressView / CompressViewHook**：折叠/快照态渲染 hook（`registry.ts:31`），签名 `(ctx, level: 1|2) => XmlNode[]`。context 预算紧张时让 Object 仍给出元信息。
- **registerReadable**：readable 维度的注册入口（`object-registry.ts:128`），接受 `readable / windowMethods / compressView / onClose / consumedMessageIds`。与 `registerExecutable` 类型层互拒越界字段、`mergeExistingDefinition` 按维度互不覆盖、object↔window method 同名 fail-loud。

## 相关兄弟

- **executable**：与我物理分注册的另一半——它管 object method 改业务数据，我管 window method 控展示；registry 在 `mergeExistingDefinition` 里两维度互不覆盖、同名 fail-loud。
- **visible**：人类侧的展示（tsx 页面渲染进浏览器、`/call_method` 通道）。我是 LLM 侧、它是人类侧；"变化的展示"上两者交织（windowMethods+state 是变化的控制，visible/diff.tsx 是变化的人类侧呈现）。
- **thinkable**：context 渲染管线消费我的 readable/renderXml 产出窗口；compress 预算与我的 compressView 配套。
- **programmable**：Object 自写的 readable.ts 形态与热更归 programmable；我定义 readable 维度"是什么"，它定义"怎么写、怎么热更"。
