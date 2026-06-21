---
title: OOC 核心设计总览（index）
description: OOC 系统全部核心设计的设计层总览——顶层哲学 / 对象模型 / 各维度核心 / builtins / 跨维度·内置对象交叉契约；面向设计，实施细节链回各 self.md。本文 A–E 区每个 `##` 元素即「设计元素注册表」，供 design-workflow 的 review fan-out 索引受影响元素。
activates_on:
  "object::root": "show_description"
---

# 说明（怎么读这份总览）

这是 OOC 系统**全部核心设计**的单一总览，**面向设计**：只综述各设计元素的**核心契约**与它们**相交处**的约定，实施细节（字段 / 接口 / 源码锚点）一律链回对应维度 self.md。

- **index（本文）面向设计**：核心设计 + 跨元素契约，求"一处看全 OOC 是怎么设计的"。
- **各维度 self.md 面向实施**：本维度核心设计 + 锚定源代码的实施细节。
- 二者侧重不同、由 design-workflow 保证一致（见 `./design-workflow.md`）；与代码冲突时一律信代码。

**本文 A–E 区每个 `##` 元素 = OOC 设计元素注册表**。任何系统设计调整经 issue → review 流程时，review fan-out 据此清单判定"受影响元素"、为每个受影响元素各派一个 reviewer（外加一个完整性批评官扫全树补漏）。

**阅读地图**：

- **A · 顶层** — `OOC` / `OOC Class/Object Model`
- **B · 维度核心设计** — `thinkable` / `executable` / `readable` / `persistable` / `collaborable` / `reflectable` / `visible` ＋非维度 `observable` / `app`
- **C · 内置对象** — `builtins`
- **D · 维度 × 维度 交叉** — `executable × thinkable` / `readable × thinkable` / `persistable × thinkable` / `executable × readable` / `reflectable × persistable` / `collaborable × thinkable` / `readable × visible`
- **E · 内置对象 × 维度 交叉** — `thread` / `agent` / `knowledge_base / knowledge` / `method_exec_form` / `pr / reflect_request` / `filesystem / terminal / interpreter` / `runtime` / `user`

# A · 顶层

## OOC

**OOC = Object Oriented Context**：以面向对象编程的哲学为基础，组织上下文、构建 MultiAgent、做 GenUI、实现 Agent 自我迭代。三个根本主张：

- **Object 化的上下文**：LLM 看到的不是裸 prompt，而是一组 ContextWindow 对象——既是信息展示单元，也持有可调用的 Method。
- **Object 化的 Agent**：一个 Agent 就是一个 Object（数据字段 + 程序方法），Object 之间协作、对话、派生新对象，形成 MultiAgent 系统。
- **元编程 → 自我迭代**：Object 能为自己写方法、改字段、写知识、改身份，OOC 因此具备自我进化的可能。

**7 个能力维度**——构成 Agent 的「自我」，按 object → agent 分层：

- **object base（4）**：任何 object/class 都被编写的 4 个 facet——readable（在 LLM 上下文里的展示）/ executable（行动）/ visible（浏览器 UI 展示）/ persistable（持久化）。
- **agent 智能增量（3）**：object 叠上 LLM 多出的 3 维——thinkable（思考）/ collaborable（协作）/ reflectable（反思、沉淀、自我迭代）。一个 object 叠这 3 维即成 agent。

**非维度能力**：按 self-constitutive（是否构成「自我」）判据排除——**observable**（系统对 agent 的旁路观测，不改变其行为）、**extendable**（接入外部世界的外接集成层）不构成自我；**programmable**（为自身编程）已并入 reflectable，作为其自我改写手段、不单列。

**自举（self-hosting）**：用 ooc-world-meta 这个 World 来设计、文档化、实现与测试 OOC 自身。

> 哲学论证链见 `./ooc-philosophy.md`；大局观与 7 维度全貌见 [supervisor self.md](../self.md)。

## OOC Class/Object Model

核心契约（详见 [object self.md](../children/object/self.md) 核心 1-10）：

1. 一切是 object；**class 是定义，object 是实例**。class 由 **readable / executable / visible / persistable** 四件套 + **`index.ts`**（装配 `export const Class`，收口后端程序路由）+ **`types.ts`**（定义 object data 结构）构成。
2. **class 不支持继承**：object 经 `ooc.class` 单跳继承一个 class，但 class 不可再继承 class；复用靠 import 目标 class 导出的函数。
3. **class 分单例 / 非单例**：非单例是可复用模板、在 `index.ts` 注册 **construct** 且可被继承；单例恰一个实例（object 一旦自定义函数方法即成自身 class 的单例）、不可被继承。
4. **object 在 LLM 视角投影成 context window**：readable 按视角把 data 动态投影成 window 的 class 与展示内容；window 投影态与 object data 分离。
5. **object method（executable）vs window method（readable）**：前者改 object data、可产生副作用；后者只动 window 投影态、返回新的不可变 window，不碰 object。
6. **object method 标 `for_ui_access`** 才可被 visible 的 UI 请求。
7. **持久化可自定义**：object 经 persistable 控制序列化目录与方式，未定义则走系统默认。
8. **children = 命名空间从属、不继承**：children id 以 parent id 为前缀（`parent_id/child_id`），仅命名空间从属。
9. **agent = object + LLM**：在四件套之上额外具 thinkable / collaborable / reflectable，持 `talk` method（执行即开一条跑 thinkloop 的 thread）；**`self.md` 是 agent 实例独有的身份**，只活在 self 门面窗、不进 thinkloop instructions。
10. **生命周期**：`construct` 诞生 → `active` / `unactive` 按引用计数停启（**context window 即引用，close 即移除一个引用**，归零触发 `unactive`）→ **无独立 destruct**（删除是 `unactive` 返回 `{ delete? }` 的引用归零自决）。

> 单一权威见 [object self.md](../children/object/self.md)；builtin class/object 清单见 `./builtins.md`。

# B · 维度核心设计

> 综述各维度核心，实施细节链回 self.md。末两节 observable / app 为非维度（横切能力）。

## thinkable

LLM 看到的世界不是裸 prompt，而是一组 **ContextWindow 对象**——Object 在 context 中的形态，自带可调的 window method。在此之上是**渐进式执行伴随的渐进式知识激活**：Object 经 open→refine→submit 渐进暴露要操作的窗口与方法，knowledge 则按 `activates_on` 意图在执行推进时渐进激活，执行到哪、知识激活到哪。思考过程组织成可并行、可恢复的 **Thread Tree**，每个 thread 由 **thinkloop** 驱动——单 thread 一轮「构造 context→调 LLM→执行 tool→写事件」的循环。实施细节见 [self.md](../children/thinkable/self.md)。

## executable

Object 行动的唯一方式 = 经 **tool 原语**与 context window 交互；tool 原语恒为 3 个：exec（在某 window 上调一条 method）/ close（关窗 = 移除对其对象的一个引用 + honor 结构窗 `closable` 守卫）/ wait（等某窗 IO 结果），compress 是 window method 而非原语。**`active` / `unactive` 是 class 生命周期钩子（引用 0↔1 触发，见 A 区核心 10）、不是新原语——tool 原语恒定 3 个。**可执行的 method 严格分两维——**object method**（改 object 自身 Data、可产副作用，归本维度）与 **window method**（只动展示态，归 readable）；二者经同一 exec 入口按名分派，同 class 内不可重名、注册期 fail-loud。object method 还可声明 `route` 做**填表式渐进执行**（form：refine 补参、submit 提交），并以推导出的 intents 驱动知识激活。实施细节见 [self.md](../children/executable/self.md)。

## readable

一个 Object 进入 LLM context 时的「长相」由它**自己的 readable** 算出，而非渲染器替它决定：readable 把业务 **Data 投影成 window**——按视角动态算出投影 class 与展示 content，投影是「读」的算子、不持久化。投影态 **win** 与业务 Data 物理分离落盘；**window method** 只动 win、返回不可变的新 win、不碰 Data（与 object method 的根本分界）。同一 Object 可按视角多视角投影成不同 window class；静态 `readable.md` 名片是投影槽位的最低优先级兜底。readable 与 visible 互为镜像——前者面向思考者、后者面向用户。实施细节见 [self.md](../children/readable/self.md)。

## persistable

**OOC World = 一个持久化目录**，承载系统全部配置与运行时数据。持久层分三个自然命名的子目录：**stones**（静，长期身份+设计源码，git 版本管理）/ **flows**（动，每个 session 一份、作为派生自 stones/main 的 git worktree 分支）/ **pools**（积，跨 session 沉淀的事实，不进 git）。持久化逻辑可自定义——缺省把 Data 写入 `state.json`，第三态 inline 让运行态自有窗随所属 thread 整窗落盘。数据变更由 object 经 `ctx.reportDataEdit()` 主动报告、runtime 据此触发持久化；变更经 **reflectable** feat-branch 通道合入 stones/main，绝不从 session worktree 直合。实施细节见 [self.md](../children/persistable/self.md)。

## collaborable

OOC Agent 之间通过**对话**协作。每个 Agent 持有名为 `talk` 的 Object Method，执行它会创建一个 thread 对象，由 thread 运行 LLM thinkloop 处理这场对话；thread 过程中 Agent 可继续 talk 其他 Agent，从而派生出 thread tree。thread 按视角投影成会话窗，两条轴**正交**：**window class 轴**——自己视角是一个 thread 窗（含与 creator 的对话）、与每个 peer/sub 的会话各是一个 talk 窗（super flow POV 下另投影成 reflect_request 窗，见 `E · thread`）；**消息方向轴**——每个会话窗持 `say` 方法，按自己在该对话里是 caller 还是 callee 决定消息发往哪个对端。Agent talk 自己即创建自己的 sub agent thread。每个 thread 持 inbox/outbox：`say` 写入自身 outbox 并派送到对端 thread 的 inbox。详见 [collaborable](../children/collaborable/self.md)。

## reflectable

reflectable = **自我迭代，不发明新机制**：它把已有设施（collaborable 的 talk/say、persistable 的 stone/pool、thinkable 的 knowledge）组合进一个受保护的反思 session。系统提供恒定名为 `super` 的反思通道，承载 flow→stone / flow→pool 的经验沉淀；入口是 `talk(target="super")` 自指。两条沉淀通道互斥：pool sediment 直写即生效，stone 变更（身份/身体/seed knowledge）一律走 **feat-branch PR**——这是 stone 变更进 canonical 的唯一沉淀单元。谁来审由改动了谁的地盘决定，supervisor 恒在审核人列。「为自身编程」（原 programmable）作为改身体的手段已并入本维。详见 [reflectable](../children/reflectable/self.md)。

## visible

Object **持有并演化自身 UI 页面**——人类经浏览器看见并与之交互的那一面，与 readable（LLM 侧上下文展示）互为镜像。`ooc://` 原生寻址 1:1 映射控制面 SPA route：stone scope 是跨 session 稳定的单页 `visible/index.tsx`、flow scope 是 session 内多页 `client/pages`。人类经 HTTP `/call_method` 调用 Object 上标了 `for_ui_access` 的方法交互（与 LLM 侧 object method 分流）；tsx 资源与调用通道归 visible。详见 [visible](../children/visible/self.md)。

## observable

> **非维度**：系统对运行中 agent 的旁路观测，按 self-constitutive 判据不构成自我，不列为 7 维度之一。

observable 的铁律是**不改变 agent 行为的旁路观测**：只在 thinkloop 周围加观测点，让 LLM 输入输出、tool 调用、context 快照可记录、可暂停、可回放，使 Object 的思考黑箱可见、可介入。写盘委托 persistable，自己只决定「何时记、记什么」。落地为可观测三件套——log-aggregator（日志去重限流）+ `/api/runtime/activity`（系统活动快照）+ harness 超时快照，把「盲等到超时再 tail」变成「随时一读即诊断」。**关键交叉**：× thinkable——观测点只加在 thinkloop 周围、loop 生命周期由 thinkable 驱动，pause 在 tool call 执行**前**介入；× visible——observable 只产数据（windowsSnapshot / ContextSnapshot），由 visible 渲成 loop_timeline 与 window diff（谁产数据、谁渲染的分工）。详见 [observable](../children/observable/self.md)。

## app

> **非维度 / 横切模块**：把各维度内核汇成人类面入口，本身不是能力维度。

app 的核心契约是**控制面为显式 runtime orchestration，而非「请求即完成」的同步接口**：建线程、入队 job、轮询、pause-resume、恢复都经 server 的 job 语义串起，进程内状态（pause/debug）也经 HTTP 暴露成可查询、可切换的能力。它由 HTTP 控制面（Elysia，把 stone/pool/flow/runtime 暴露为稳定 API，写 stone 必经 versioning，无 uncommitted 半成品）与 Web 控制面（Vite+React，URL 即单向真相、不持业务状态、只把既有状态翻译成人读界面）两面组成。详见 [app](../children/app/self.md)。

# C · 内置对象

## builtins

OOC 系统自带、实现基础系统功能的一组 builtin class/object。对象模型本身（class/object、单例、construct、单跳继承、children 命名空间、agent 分层）见 `../children/object/self.md`；完整清单、各自 id 与命名空间层级见 `./builtins.md`。本节只给设计层骨架。

按家族分组：

- **agent class** —— `_builtin/agent` 是 OOC agent 的类，object 经 `ooc.class=_builtin/agent` 继承即成 agent 实例。其 children 提供 agent 运行所需的 class：`thread`（一次智能运行的载体，按视角投影成 thread/talk/reflect_request 三种窗）、`plan`、`todo`、`skill_index`（派生注入）、`pr`（reviewer 评审窗）、`method_exec_form`（方法执行表单）。
- **tool-object**（单例 object，被 agent exec，各带 children）：`filesystem`（grep/glob/读写，children file/search）、`interpreter`（ts/js run，children interpreter_process）、`terminal`（bash run，children terminal_process）、`knowledge_base`（open_knowledge，children knowledge）、`feishu_app`（飞书接入，children feishu_chat/feishu_doc）、`runtime`（向 agent 提供 create_object 等系统级接口）。
- **实例 object**：`supervisor`（顶层 agent 实例，统筹各维度子对象，唯一保留静态 self.md 的预置 agent）、`user`（被动 object，不跑 thinkloop，是 agent `talk` 的对端）。
- **样板**：`example`（建 class 时照抄的样板，非真实功能对象）。

两条命名空间约定：children id 以 parent id 为前缀 `_builtin/<parent>/<child>`，物理在 `<parent>/children/<child>/`；children 不继承 parent，仅命名空间从属。`self.md` 只属 ooc agent 实例——只有 `class=_builtin/agent` 的实例才有 self.md；非 agent object（工具 object、class 定义）无 self.md。

kind 口径：`class`=定义，`object`=实例。

# D · 维度 × 维度 交叉

> 写两维之间的契约——只看单维 self.md 会丢失的约定。

## executable × thinkable

thinkable 构造 context，executable 定义 context 里的 method 能做什么——分界即 thinkable 的 llm 子模块只管「如何请求模型」，「模型能做什么」由 executable 的 tool/method 决定。LLM 操作世界的唯一通道是 3 个 tool 原语（exec / close / wait），它们是 executable 的核心，而消费它们的循环是 thinkable 的 thinkloop：每轮「构造 context→调 LLM→执行 tool→写事件」。两维最深的交汇在**渐进式知识激活**：object method 的 `route` 在发起调用时先跑、算出 `intents`，这些 intents 反向驱动 thinkable 的 knowledge 按 `intent::` trigger 激活——执行到哪、知识激活到哪。form（ObjectMethodForm window）由 executable 开、refine/submit 推进，但激活机制归 thinkable。详见 [executable](../children/executable/self.md) 与 [thinkable](../children/thinkable/self.md)。

## readable × thinkable

Object 经 readable 投影成 context window，进入 thinkable 构造的 context——thinkable 的 context 渲染管线消费 readable 的 `ReadableProjection{class, content, consumedMessageIds}`：投影 class、展示内容、本窗已收纳消息 id。身份双面也在此交汇：`self.md`（偏内向，经 readable 投影进 self 门面窗 self 视角内容——agent 自定义 readable 渲 `data.self`，**不进 thinkloop instructions**）与 `readable.md`（偏外向名片，作投影最低优先级回退）。「信息只渲一次」是两维的协作：readable 会话窗把归属消息收进 transcript 并报告 `consumedMessageIds`，thinkable 渲染器据此从顶层 inbox/outbox 兜底剔除。详见 [readable](../children/readable/self.md) 与 [thinkable](../children/thinkable/self.md)。

## persistable × thinkable

thinkable 的 knowledge 双源——seed（stone `knowledge/` 进 git）与 sediment（pool `knowledge/` 不进 git、同名覆盖 seed）——其磁盘路径由 persistable 提供，thinkable 只读 ref、不拥有这套 stone/flows/pools 三层结构。stone/pool/flow 三子树路径经 buildPathsItem 合成进 context 的环境 system message（world_root / object_stone_dir / object_flow_dir / session 等），其中 flow=session 落 `flows/<sid>/objects/<id>/`。身份 self.md 的读取也跨两维：readable 的 `resolveProjection` 据 stone 寻址路由读 self.md 渲入 self 门面窗——按视角解析 stone identity（business session 读自己的 worktree 副本、super flow / 控制面读 canonical main）由 persistable 的 stone 寻址决定；P3 后经 agent persistable 的 `load` + agent readable 投影，不再直接 readSelf。详见 [persistable](../children/persistable/self.md) 与 [thinkable](../children/thinkable/self.md)。

## executable × readable

method 严格分两维但共用同一 **exec-by-name** 入口：object method（executable，改 Data、可副作用，收 `(ctx, self, args)`）vs window method（readable，只动投影态 win、返回不可变的新 win、不碰 Data，收 `(ctx, self, before_win, args)`）。因为二者经同一 exec 入口分派，同一 class 上**不可重名**——重名有 dispatch 优先级歧义，注册期直接 fail-loud。两维的装配交汇点是 window class 声明 `WindowClassDecl{class, object_methods, window_methods}`：一个投影 class 声明展示哪些 object method（按名引用 executable）+ 提供哪些 window method（readable 自有）。Object 多视角可投影成不同 window class，各自挑选展示的 object method。详见 [executable](../children/executable/self.md) 与 [readable](../children/readable/self.md)。

## reflectable × persistable

reflectable 的自我迭代是把改动落在 persistable 的持久三层级上：pool sediment（memory/relations 等运行时事实）直写 pool——不进 git、不分支、写就生效，下一轮新 thread 即刻看见；stone 变更（身份/身体/seed knowledge）一律走 feat-branch PR——super(Foo) 从 `stones/main` 派生一条 feat 分支 worktree、在其上编辑、commit、开 PR，再合入 canonical main。两通道互斥，判据是「运行时事实 vs stone 变更」。铁律：绝不从 session worktree（`flows/<sid>`）直合 main——它只是派生运行物。PR-Issue 记录、stone git versioning、reviewer 冒泡纯函数等存储层归 persistable，reflectable 只定义「在反思 session 下如何组合」。而 session=flow=worktree 分支这一 persistable 模型，正是 reflectable feat-branch 沉淀的底座。详见 [reflectable](../children/reflectable/self.md) 与 [persistable](../children/persistable/self.md)。

## collaborable × thinkable

collaborable 的 talk 方法创建 thread，thread 跑 thinkable 的 thinkloop 处理对话——协作即派生 Thread Tree（thinkable 的并行、可恢复底座）；thread 途中继续 talk 别的 Agent，树就长深。对话窗（thread / talk window）是 readable 按视角对 thread 的投影，进 thinkable 构造的 context，自带 say 方法把消息发给对端（caller 或 callee）。thread 各持 inbox/outbox：say 写入自己的 outbox 并派送对端 thread 的 inbox。渲染时归属本窗的消息收进窗 transcript 并报告已渲 id，从顶层 inbox/outbox 兜底剔除——与 thinkable context「一条信息只渲一次」咬合。详见 [collaborable](../children/collaborable/self.md) 与 [thinkable](../children/thinkable/self.md)。

## readable × visible

同一个 Object，两个观众、两条展示线：readable 管 LLM 侧（把 Object 投影成 context XML），visible 管人类侧（tsx 画进浏览器）。两者并列、互为镜像、不互相吞并——readable 面向思考者，visible 面向用户。分流的交汇点是 object method：标 `for_ui_access: true` 的方法经 HTTP `/call_method` 暴露给人类侧（visible），按 `for_ui_access` 过滤，与 LLM 侧 exec-by-name 路径共用同一份 `window.methods` 而分流可见性。「变化的展示」也对称：readable 的投影收放（window method 换 win）对 visible 的 `diff.tsx` / loop_timeline window diff——一个给 context、一个给浏览器。详见 [readable](../children/readable/self.md) 与 [visible](../children/visible/self.md)。

# E · 内置对象 × 维度 交叉

> 每节讲一个 builtin 如何串起多个维度。

## thread

thread 是 agent 一次智能运行的载体——`talk` 创建它、thinkloop 在其上运行——也是 builtin 里跨维度最密的对象，一身横跨四维。× thinkable：thinkloop 跑在 thread 上，thread 派生 sub thread 织成 Thread Tree，构成可并行、可恢复的思考底座（见 [thinkable](../children/thinkable/self.md)）。× collaborable：每个 thread 持 inbox/outbox，`say` 写入自己 outbox 并派送到对端 thread 的 inbox。× readable：**同一个 thread 实例按视角投影成三种 window class**——thread（自己视角，过程 event + 与 creator 的对话通道）、talk（与 peer/sub 的会话）、reflect_request（super flow POV）。× persistable：thread 声明 `mode="inline"`，整窗随所属 thread 的 `thread-context.json` 落盘，不写独立 `state.json`。**生命周期**：会话窗即对该 thread 对象的一个引用、关一个 fork 窗 → 该子线程级联 `canceled`、即时落盘（reload 不复活）、`canceled` 与 `done` / `failed` 同为退出态、结构窗（thread / creator 门面窗）不可关；引用计数停启机制见 A 区核心 10 与 [object self.md](../children/object/self.md)。

## agent

agent = object + LLM：在 object base 标准具备的四维（readable / executable / visible / persistable）之上叠加 thinkable / collaborable / reflectable 三维，即成 agent 实例（对象模型核心 9，见 [object self.md](../children/object/self.md)）。它持 `talk` / `plan` agency——`talk` 执行即创建一条 thread 并跑 thinkloop；`end` / `todo` 迁 thread（thread 作用域操作，见 `## thread`）。它的 data 含 `self` 身份字段：由 **agent builtin 的 persistable** 写入/读回实例目录的 `self.md`，经 **agent 自定义 readable** 渲为该 agent **self 门面窗的 self 视角内容**（他者视角渲 `readable.md`），身份只活在这一处、不进 thinkloop instructions。任何 object 经 `ooc.class=_builtin/agent` 继承它，即成 agent 实例。

## knowledge_base / knowledge

knowledge_base 是单例 object，经 `open_knowledge` 把知识条目接入系统；其 child `knowledge`（class）是知识条目窗（命名空间从属、不继承 parent，对象模型核心 8）。它的故事主要落在 × thinkable：每条 knowledge 持 `activates_on` trigger，thinkloop 构造 context 时对每篇求激活级别，命中即按级别（`show_description` 只露标题描述 / `show_content` 展开正文）激活进 context；这与渐进式执行咬合成"执行到哪、知识激活到哪"，控制每轮 context 体积。knowledge 的双源（seed / sediment）加载与沿祖先 / parentClass 的继承链解析，归 thinkable 的 knowledge 子模块（见 [thinkable](../children/thinkable/self.md)）。

## method_exec_form

form 是 object method 填表式渐进执行的载体——× executable：object method 可声明 `route`，发起调用时先跑 route 算出 `ObjectMethodIntents{tip, intents, quickSubmit}`；`quickSubmit` 则直接执行，否则参数不齐时不执行，开一张 **form** 入 context，把 `tip` 回作补参提示。form 自身是个对象，持累积参数 + 填表态，注册 `refine`（merge 新参、重跑 route 刷新 tip/intents，失败可复活）与 `submit`（用累积参数真正执行、成功后退场）两条 method。× thinkable：route 算出的 `intents` 驱动渐进式知识激活——填到哪个意图，关联该意图的 knowledge 随之激活、离开即卸载（`intent::`/`method::` 触发）。form 机制本身在 thinkable/executable，`method_exec_form` 只是其类型归位。详见 [executable](../children/executable/self.md)。

## pr / reflect_request

两类反思期投影窗，归 reflectable 通道、存储归 persistable：

- **`reflect_request`**：thread 在 super flow POV 下由 readable 算出的**投影 class**（非注册 builtin），复用 talk 的会话/回报形态，额外挂「开分支」「finalizer」两个 `for_reflectable` 方法——只在反思场所 surface。
- **`pr`**：真注册 builtin class（`agent/children/pr`），reviewer 评审窗，runtime 投递创建。

二者永不共存于同一 thread。窗只是脸：PR-Issue 记录、stone git versioning、reviewer 冒泡纯函数都归 persistable，反思通道的组合语义归 [reflectable](../children/reflectable/self.md)。

## filesystem / terminal / interpreter

三个单例 tool-object 被 agent exec，是「object method 产副作用 + children 窗投影展示」的标准组合样板：

- × executable：各暴露 object method——`filesystem`: grep/glob/open_file/write_file；`terminal`: run；`interpreter`: run。method 改世界、产工具副作用（归 [executable](../children/executable/self.md)）。
- × readable：各自 children 是结果窗 class——`filesystem` 的 file/search、`terminal` 的 terminal_process、`interpreter` 的 interpreter_process——把工具产出投影成 context window（viewport/transcript 等可调展示态），归 [readable](../children/readable/self.md)。

清单见 [builtins](./builtins.md)。

## runtime

`_builtin/runtime` 向 agent 提供系统级接入方法——× executable：如 `create_object`（建新对象骨架）等系统接入 object method，经统一 exec 入口调用。它不是被读展示的窗，而是被 agent **组合持有**的能力来源：agent 触达「建对象 / 系统操作」这类 OOC 系统能力的入口收在此对象上。形态见 [builtins](./builtins.md)，调用契约归 [executable](../children/executable/self.md)。

## user

`user` 是代表人类用户的**被动 object**——× collaborable：它不跑 thinkloop，是 agent `talk` 的对端。web session 中由人类驱动的 flow object，worker 调度时显式跳过它。它体现了「object 不必是 agent」这条边界——同样是协作网络里的一个参与者，却只被动接收对话、不主动思考。协作语义见 [collaborable](../children/collaborable/self.md)，对象清单见 [builtins](./builtins.md)。
