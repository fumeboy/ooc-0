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

**本文 A–E 区每个 `##` 元素 = OOC 设计元素注册表**。任何系统设计调整经 issue → review → 裁决 → 验收 流程时，设计 review fan-out 据此清单判定"受影响元素"、为每个受影响元素各派一个 reviewer（外加一个完整性批评官扫全树补漏）；落地后再过一轮落地验收 review，对照 issue 核文档/代码是否如约改造（`landed` → `verified`）。

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

**OOC 与 host language 的边界（两条澄清）**：
- **运行时改写颗粒度 = thread 间，不是单步内**——主张三「Object 能为自己写方法、改字段、写知识、改身份」的实现颗粒度收口到「改源码 → invalidate stone → 下次 hydrate / 下一条 thread」，不在单次 thinkloop tool call 中 in-memory mutate 自身 class prototype（前 issue 提议的 `patch_self_prototype` 不采纳）。
- **OOC 不重新发明 host language 既有机制**——能用 TS / ESM 表达的就用（继承、模块绑定、类型约束）；OOC 只提供 TS/ESM 表达不了的部分（context window 投影、thinkloop、persistable 三层级、reflectable 反思通道等）。继承机制即典型案例：class 复用经 TS `import` + 对象 `spread`，OOC 协议层不内建 dispatch chain。

> 哲学论证链见 `./ooc-philosophy.md`；大局观与 7 维度全貌见 [supervisor self.md](../self.md)。

## OOC Class/Object Model

核心契约（详见 [object self.md](../children/object/self.md) 核心 1-10）：

1. 一切是 object；**class 是定义，object 是实例**。**class 必有 `index.ts` + `types.ts` + 四件套**（readable / executable / visible / persistable，visible 含前端 `visible/index.tsx` + **`visible/server/index.ts`** for-ui 服务端 API）；agent 类额外注册 **`thinkable`** 模块槽（第五维度模块，与四件套同构在 OocClass 注册/解析，见 `## thinkable` / `## thread`；任意 class 可声明 thinkable，但只有跑 thinkloop 的 thread 类实际注册并被调度）。**object instance 不必有 `index.ts`**——无 `index.ts` 的 object 不是新 class、是父 class 的一个 instance（runtime 不在 ClassRegistry 注册新 class，hydrate 时 `OocObjectInstance.class = ooc.class` 直指父）。
2. **OOC Class 协议层不内建任何继承 / dispatch chain 机制**：ClassRegistry 注册扁平的 class 定义，无 chain 元信息、无沿链 fallback；resolveXxx **本类直查**。object 经 `ooc.class` 单跳 binding 一个 class 作为身份模板。**class 想复用另一个 class 的能力，由其 `index.ts` 用 TS 标准 `import` + 对象 `spread`（或 method 级 import 函数 + 显式调）在源码侧完成**——「如何继承」属于 class 实现者的自由，OOC 协议不规约、不感知。可选 helper：`extendClass`（`packages/@ooc/core/runtime/inherit.ts`，**仅 `executable.methods` 一档** method-name 合并）。
3. **class 分单例 / 非单例**：非单例是可复用模板、在 `index.ts` 注册 **construct**；单例恰一个实例（object 一旦自定义函数方法即成自身 class 的单例）。**单例不可被继承是源码组织约定**——OOC 协议层不强制（无运行时感知），由代码评审 / lint 拦截。
4. **object 在 LLM 视角投影成 context window**：readable 按视角把 data 动态投影成 window 的 class 与展示内容；window 投影态与 object data 分离。**类型分立**：`OocObjectInstance={id,class,data}` = 对象本身（持 data，活 **session 对象表** `objectId→唯一实例`）；`OocObjectRef` = **context window** = 对它的引用（持 `id`〔=objectId,表 key〕+ 缓存 class + 视角态〔含 parentWindowId〕、**不持 data**），`ContextWindow=OocObjectRef`。内存经 `objectDataOf(ref, table)` 按 id 从对象表解析 data（`classOf(ref)=ref.class`），磁盘只落 ref，故同 objectId 多窗读同一份 data（live-ref 仅同 job 内）。表挂线程树根、随 job 释放（owner 见 E 区 `## runtime`）。**ServerLoader 双路径**：有 `index.ts` → `import { Class } → registry.register(Class)`；无 `index.ts` → **不**向 registry 注册新 class，hydrate 时 `OocObjectInstance.class = ooc.class`（=父 class id），resolveXxx 直接命中父 class 的字段——两条路径语义同质，前者由子源码 spread 父、后者由 instance.class 直指父。
5. **object method（executable）vs window method（readable）**：前者改 object data、可产生副作用；后者只动 window 投影态、返回新的不可变 window，不碰 object。
6. **visible 经 `visible/server` 提供 UI 服务端 API**：前端经 callMethod 请求这些 for-ui server method（ctx 无 thinkloop thread，改 data → persistable.save）；人机分流不再靠 executable object method 上的 `for_ui_access` 标记（退役）。
7. **持久化可自定义**：object 经 persistable 控制序列化目录与方式，未定义则走系统默认。
8. **children = 命名空间从属、不继承**：children id 以 parent id 为前缀（`parent_id/child_id`），仅命名空间从属。
9. **agent = object + LLM**：在四件套之上额外具 thinkable / collaborable / reflectable，持 `talk` method（执行即开一条跑 thinkloop 的 thread）；**`self.md` 是 agent 实例独有的身份**，只活在 self 门面窗、不进 thinkloop instructions。
10. **生命周期**：`construct` 诞生 → `active` / `unactive` 按引用计数停启（**context window 即引用，close 即移除一个引用**，归零触发 `unactive`）→ **无独立 destruct**（删除是 `unactive` 返回 `{ delete? }` 的引用归零自决）。

> 单一权威见 [object self.md](../children/object/self.md)；builtin class/object 清单见 `./builtins.md`。

# B · 维度核心设计

> 综述各维度核心，实施细节链回 self.md。末两节 observable / app 为非维度（横切能力）。

## thinkable

LLM 看到的世界不是裸 prompt，而是一组 **ContextWindow 对象**——Object 在 context 中的形态，自带可调的 window method。在此之上是**渐进式执行伴随的渐进式知识激活**：Object 经 open→refine→submit 渐进暴露要操作的窗口与方法，knowledge 则按 `activates_on` 意图在执行推进时渐进激活，执行到哪、知识激活到哪。思考过程组织成可并行、可恢复的 **Thread Tree**，每个 thread 由 **thinkloop** 驱动——单 thread 一轮「构造 context→调 LLM→执行 tool→写事件」的循环。

**context 是稀缺资源、有一套专门的压缩机制（compress）需注意**——读 thinkable 时易被一句「一组 window」带过、却是承重的一块：window 在「怎么压缩」上是**统一协议、各对象自有实现**（呼应「everything is a window 统一寻址不统一实现」），三类窗各按自身形态压缩——**自我主历史窗**（thread 自己的过程）用 summarizer fork 摘要早期历史、**内容窗**（file/知识/…）调展示详略档位、**派生会话窗**（talk）靠预算 overflow + 视口收放（不折叠）。单一权威见 [compress.md](../children/thinkable/knowledge/compress.md)；context 总体构成、视角投影与预算见 [context.md](../children/thinkable/knowledge/context.md)。

**thinkable 是 OocClass 的模块槽（实现归 builtin、不在 core）**：core 只留 `thinkloop`（单 thread 一轮 think 的串行驱动器）/ `scheduler`（线程树 tick 调度）/ `recovery` / `llm`（如何请求模型）+ `knowledge` 的 parser/activator（激活求值）+ 模块契约 `contract.ts`/解析 `resolve.ts`。**context 构造与渲染（buildInputItems / pipeline / renderer / budget / 窗注入）、事件折入（appendEvents）、compress 策略、每-tick 维护（harvest + child-notify）全是 thread 类的 thinkable 实现，物理在 `builtins/agent/children/thread/thinkable/`**；core thinkloop/scheduler 经 registry `resolveThinkable(thread.class)`（`thinkableOf`）调用、不直接 import thread builtin。knowledge 的双源磁盘加载器（loader）归 `builtins/knowledge_base`（见 `## knowledge_base / knowledge`）。

实施细节见 [self.md](../children/thinkable/self.md)。

## executable

Object 行动的唯一方式 = 经 **tool 原语**与 context window 交互；tool 原语恒为 3 个：exec（在某 window 上调一条 method）/ close（关窗 = 移除对其对象的一个引用 + honor 结构窗 `closable` 守卫）/ wait（等某窗 IO 结果），compress 是 window method 而非原语。**`active` / `unactive` 是 class 生命周期钩子（引用 0↔1 触发，见 A 区核心 10）、不是新原语——tool 原语恒定 3 个。**可执行的 method 分**三类**——**object method**（单步直执行，改 object 自身 Data、可副作用，归本维度）、**object guide method**（多步引导，调用即跑 route 算意图：quickSubmit 直执行 / 否则自动开 form 渐进 refine + submit，归本维度）与 **window method**（只动展示态，归 readable）；三者经同一 exec-by-name 入口分派，**method/guide/window method 三侧 name 全集不可重名、注册期 fail-loud**，且 window decl 的 `object_methods` / `guide_methods` 引用悬空亦 fail-loud。method 只管 LLM 侧行动——`for_ui_access` 标记退役，人机分流移交 visible 维度的 **visible/server 模块**（独立签名、ctx 无 thinkloop thread），不再靠 executable method 上的标记。guide 持 `route` 做填表式渐进执行（form：refine 补参、submit 提交），并以 route 输出的 intents 驱动知识激活。实施细节见 [self.md](../children/executable/self.md)。

## readable

一个 Object 进入 LLM context 时的「长相」由它**自己的 readable** 算出，而非渲染器替它决定：readable 把业务 **Data 投影成 window**——按视角动态算出投影 class 与展示 content，投影是「读」的算子、不持久化。投影态 **win** 与业务 Data 物理分离落盘；**window method** 只动 win、返回不可变的新 win、不碰 Data（与 object method 的根本分界）。同一 Object 可按视角多视角投影成不同 window class；**默认投影 class 名约定**：`"default"` 是保留关键字——单视角 class 的唯一 decl 强约束 `class:"default"`（注册期 fail-loud），多视角 class 各视角具名（如 thread = `thread`/`talk`/`reflect_request`）、不强制 default。静态 `readable.md` 名片是投影槽位的最低优先级兜底（`resolveDefaultWindowClass` 找不到 default decl 时回退到此）。readable 与 visible 互为镜像——前者面向思考者、后者面向用户。实施细节见 [self.md](../children/readable/self.md)。

## persistable

**OOC World = 一个持久化目录**，承载系统全部配置与运行时数据。持久层分三个子目录，按「数据是否版本化 + 是否本 session 暂存」分工：**stones**（版本化 canonical：class 源码 + 标记为版本化的字段值，git 管理）/ **pools**（非版本化 sediment：当前仅 knowledge sediment，不进 git）/ **flows**（本 session 暂存：每 session 一份 git worktree 分支，承载本 session 全部数据变更 working copy）。字段级版本化判据 = `OocClass.versioned_fields`（同伴常量方案——`types.ts` 旁导出 `VERSIONED_FIELDS`，`index.ts` 装配引用注入）。`PersistableContext.scope: "stone"|"pool"|"flow"` 显式标记本次 save/load 写哪一层——**method 写一律 scope="flow"**（runtime 默认注入），整份 data 落 `flows/<sid>/objects/<id>/data.json`；reflectable 分发器（issue D 主体）以 scope="stone"/"pool" 重调把变更分流回 stone（versioned 经 feat-branch PR）/ pool（sediment 直写）。hydrate 顺序 stone canonical + pool sediment + flow override；session 对象表内是单一 merge 后视图，method exec 拿到的 self.data 永远是完整 data。**内存可见性 = write-through**：method 内 mutate self.data 立即在 session 对象表生效，无「写盘 → 重新 hydrate」额外通道。hydrate 完成时记 `flows/<sid>/.hydrate-snapshot.json`（每字段 hash + 可选 stone HEAD sha），供 issue D 增量检测。flow worktree 内 tracked stone（class 源码）与 untracked 运行时数据同落 `objects/<id>/` 由 `.gitignore` 区分。变更经 **reflectable** feat-branch 通道合入 stones/main，绝不从 session worktree 直合。实施细节见 [self.md](../children/persistable/self.md)。

## collaborable

OOC Agent 之间通过**对话**协作。每个 Agent 持有名为 `talk` 的 Object Method，执行它会创建一个 thread 对象，由 thread 运行 LLM thinkloop 处理这场对话；thread 过程中 Agent 可继续 talk 其他 Agent，从而派生出 thread tree。thread 按视角投影成会话窗，两条轴**正交**：**window class 轴**——自己视角是一个 thread 窗（含与 creator 的对话）、与每个 peer/sub 的会话各是一个 talk 窗（super flow POV 下另投影成 reflect_request 窗，见 `E · thread`）；**消息方向轴**——每个会话窗持 `say` 方法，按自己在该对话里是 caller 还是 callee 决定消息发往哪个对端。Agent talk 自己即创建自己的 sub agent thread。每个 thread 持 inbox/outbox：`say` 写入自身 outbox 并派送到对端 thread 的 inbox。**talk(target="super") = 跨 session 自指**（reflectable 入口）：caller 留本 session、callee 进 super flow（sessionId="super"）、callee 对象 = caller 自己；caller object data 持 `superThreadRef` 实现幂等复用，消息派送由 caller 直接写 super flow 内 callee thread 的 inbox（不引入 cross-session bus）。详见 [collaborable](../children/collaborable/self.md)。

## reflectable

reflectable = **自我迭代闸门**：业务 session 内任何对象都不直接合并/落 canonical，只在 flow 暂存改动；所有 stone 变更（含 class 源码 + 版本化字段）+ pool 沉淀（非版本化字段）一律经 super flow 显式分发。super flow（`sessionId="super"`）= 显式合并入口，由 `talk(target="super")` 跨 session 自指（collaborable 核心 7）触达。super flow 内 self-view 的 thread 投影为 **reflect_request** 窗，surface 4 个一步到位分发器 method：`scan_changes` / `create_pr_for_versioned` / `sediment_unversioned` / `create_pr_for_class_edits`——按字段类型 / 是否 class 源码改动自动分流到三条下游通道（PR / pool / PR）。feat-branch PR 仍是 stone 变更进 canonical 的唯一渠道（PR-Issue 落账 `stones/.stones_repo/.pr-issues/<id>.json`，不 git tracked）；reviewer 集由「改动了谁的地盘」决定，supervisor 恒在；`worldConfig.prAutoMerge`（默认 false）决定自动合入 vs 人工经 `POST /api/runtime/pr-issues/:id/resolve` 落锤。reflectable 不发明新机制——只把 collaborable / persistable / thinkable 设施在 super flow 下编排成自我演化。详见 [reflectable](../children/reflectable/self.md)。

## visible

Object **持有并演化自身 UI 页面 + 自实现「给 UI 用的服务端 API」**——人类经浏览器看见并与之交互的那一面，与 readable（LLM 侧上下文展示）互为镜像。`ooc://` 原生寻址 1:1 映射控制面 SPA route：stone scope 是跨 session 稳定的单页 `visible/index.tsx`、flow scope 是 session 内多页 `client/pages`。除 tsx UI 外，class 经 **`<ObjectDir>/visible/server/index.ts`** 实现 for-ui 服务端 API（ctx 有 world / session / object-self、**无 thinkloop thread**；改 data → persistable.save 非版本化），由 `index.ts` 与 executable / readable / persistable 一并注册；HTTP `/call_method` dispatch 到此——**仅 flow scope**（`POST /api/flows/:sid/:oid/call_method`），stone scope 只读、不调 object 程序（与 LLM 侧 executable object method 分两条独立签名）。**前端两条编辑通路**：编辑源文件 → app 通用 file-edit 原语（A1，版本化）/ 编辑 data → callMethod 到 class 自写 visible/server（A2，非版本化）。详见 [visible](../children/visible/self.md)。

## observable

> **非维度**：系统对运行中 agent 的旁路观测，按 self-constitutive 判据不构成自我，不列为 7 维度之一。

observable 的铁律是**不改变 agent 行为的旁路观测**：只在 thinkloop 周围加观测点，让 LLM 输入输出、tool 调用、context 快照可记录、可暂停、可回放，使 Object 的思考黑箱可见、可介入。写盘委托 persistable，自己只决定「何时记、记什么」。落地为可观测三件套——log-aggregator（日志去重限流）+ `/api/runtime/activity`（系统活动快照）+ harness 超时快照，把「盲等到超时再 tail」变成「随时一读即诊断」。**关键交叉**：× thinkable——观测点只加在 thinkloop 周围、loop 生命周期由 thinkable 驱动，pause 在 tool call 执行**前**介入；× visible——observable 只产数据（windowsSnapshot / ContextSnapshot），由 visible 渲成 loop_timeline 与 window diff（谁产数据、谁渲染的分工）。详见 [observable](../children/observable/self.md)。

## app

> **非维度 / 横切模块**：把各维度内核汇成人类面入口，本身不是能力维度。

app 的核心契约是**控制面为显式 runtime orchestration，而非「请求即完成」的同步接口**：建线程、入队 job、轮询、pause-resume、恢复都经 server 的 job 语义串起，进程内状态（pause/debug）也经 HTTP 暴露成可查询、可切换的能力。它由 HTTP 控制面（Elysia，把 stone/pool/flow/runtime 暴露为稳定 API，写 stone 必经 versioning，无 uncommitted 半成品）与 Web 控制面（Vite+React，URL 即单向真相、不持业务状态、只把既有状态翻译成人读界面）两面组成。**源文件编辑收口为单一 file-edit 原语** `PUT /stones/:id/file?path=`（三层 path 防护 + 白名单，经 runVersioned 直 commit main；按文件类型开的 self/readable/executable-source 三 typed 端点退役）——人类控制面直写、豁免 reflectable feat-branch 纪律。详见 [app](../children/app/self.md)。

# C · 内置对象

## builtins

OOC 系统自带、实现基础系统功能的一组 builtin class/object。对象模型本身（class/object、单例、construct、`ooc.class` 单跳实例 binding、children 命名空间、agent 分层）见 `../children/object/self.md`；完整清单、各自 id 与命名空间层级见 `./builtins.md`。本节只给设计层骨架。

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

thinkable 构造 context，executable 定义 context 里的 method 能做什么——分界即 thinkable 的 llm 子模块只管「如何请求模型」，「模型能做什么」由 executable 的 tool/method 决定。LLM 操作世界的唯一通道是 3 个 tool 原语（exec / close / wait），它们是 executable 的核心，而消费它们的循环是 thinkable 的 thinkloop：每轮「构造 context→调 LLM→执行 tool→写事件」。两维最深的交汇在**渐进式知识激活**：**object guide method** 的 `route` 在发起调用时先跑、算出 `intents`，这些 intents 反向驱动 thinkable 的 knowledge 按 `intent::` trigger 激活——执行到哪、知识激活到哪。form（method_exec_form window）由 executable 开、refine/submit 推进，但激活机制归 thinkable（phase-1 简化：所有 form 的 currentIntents 合并为 `ActivationContext.activeIntents`；phase-2 按 form objectId 作 source-key 分组替换 + 撤销）。注：method 不再持 `route`——单步语义留 `ObjectMethod`、多步语义迁 `ObjectGuideMethod`。详见 [executable](../children/executable/self.md) 与 [thinkable](../children/thinkable/self.md)。

## readable × thinkable

Object 经 readable 投影成 context window，进入 thinkable 构造的 context——thinkable 的 context 渲染管线消费 readable 的 `ReadableProjection{class, content, consumedMessageIds}`：投影 class、展示内容、本窗已收纳消息 id。身份双面也在此交汇：`self.md`（偏内向，经 readable 投影进 self 门面窗 self 视角内容——agent 自定义 readable 渲 `data.self`，**不进 thinkloop instructions**）与 `readable.md`（偏外向名片，作投影最低优先级回退）。「信息只渲一次」是两维的协作：readable 会话窗把归属消息收进 transcript 并报告 `consumedMessageIds`，thinkable 渲染器据此从顶层 inbox/outbox 兜底剔除。详见 [readable](../children/readable/self.md) 与 [thinkable](../children/thinkable/self.md)。

## persistable × thinkable

thinkable 的 knowledge 双源——seed（stone `knowledge/` 进 git）与 sediment（pool `knowledge/` 不进 git、同名覆盖 seed）——其磁盘路径由 persistable 提供，thinkable 只读 ref、不拥有这套 stone/pool/flow 三层结构。stone/pool/flow 三子树路径经 buildPathsItem 合成进 context 的环境 system message（world_root / object_stone_dir / object_flow_dir / session 等），其中 flow=session 落 `flows/<sid>/objects/<id>/`。**context 渲染读 inst.data 是 merge 后单一视图**（issue C：hydrate 顺序 stone canonical + pool sediment + flow override；method/thinkable 拿到的 self 永远是完整 data，不感知分层）——thinkable 不需要按字段分层读盘，只读 session 对象表的 instance.data。身份 self.md 的读取也跨两维：readable 的 `resolveProjection` 据 stone 寻址路由读 self.md 渲入 self 门面窗——按视角解析 stone identity（business session 读自己的 worktree 副本、super flow / 控制面读 canonical main）由 persistable 的 stone 寻址决定；P3 后经 agent persistable 的 `load` + agent readable 投影，不再直接 readSelf。agent.self 是 VERSIONED_FIELDS=["self"]，persistable.save 按 ctx.scope 分支映射成 self.md（flow=worktree 副本 / stone=canonical），thinkable 始终读 merge 后视图。详见 [persistable](../children/persistable/self.md) 与 [thinkable](../children/thinkable/self.md)。

## executable × readable

method 严格分**三类**但共用同一 **exec-by-name** 入口：object method（executable 单步，改 Data、可副作用，收 `(ctx, self, args)`） / object guide method（executable 多步，先跑 route 算意图后开 form 或 quickSubmit） / window method（readable，只动投影态 win、返回不可变的新 win、不碰 Data，收 `(ctx, self, before_win, args)`）。三者经同一 exec 入口分派，**任意两侧重名都注册期直接 fail-loud**（dispatch 优先级歧义）。两维的装配交汇点是 window class 声明 `WindowClassDecl{class, object_methods, guide_methods?, window_methods}`：一个投影 class 声明展示哪些 object method（按名引用 `ExecutableModule.methods`）+ 展示哪些 guide method（按名引用 `ExecutableModule.guides`） + 提供哪些 window method（readable 自有）。**注册期 cohesion 闸门**（`assertExecutableMethodGuideCohesion`）：method/guide/window 三侧重名 fail / window decl 的 `object_methods` 与 `guide_methods` 引用悬空 fail。**readable.window cohesion**：单视角 class（`window[].length === 1`）唯一 decl 的 `class` 字段强约束 `"default"`（保留关键字）、多视角 class 各 decl `class` 不重复（否则 `resolveWindowClass` 静默取首个）、多视角是否提供 default 自决。Object 多视角可投影成不同 window class，各自挑选展示的 method/guide。**B→A 下 self/win 切分更清**：object method 的 `self` = session 对象表中该 objectId 单一实例的 data（共享、改即处处见，A 区核心 4）；window method 的 `before_win` = **本窗自己的** `win`(视角态留窗、**不入对象表**)——故同一 object 的多视角窗各持自己 win、共享同一 data。详见 [executable](../children/executable/self.md) 与 [readable](../children/readable/self.md)。

## reflectable × persistable

reflectable 的自我迭代是把改动落在 persistable 的持久三层级上：判据从「运行时事实 vs stone 变更」收紧为**字段级版本化**（issue C 三层重定位）——OocClass.versioned_fields 列表内 = 版本化（stone canonical 候选），其余 = 非版本化（flow 暂存 / pool sediment 候选）。两通道仍互斥：pool sediment（当前仅 knowledge）直写 pool——不进 git、不分支、写就生效，下一轮新 thread 即刻看见；stone 变更（versioned 字段值 + class 源码 + seed knowledge）一律走 feat-branch PR——super(Foo) 从 `stones/main` 派生一条 feat 分支 worktree、在其上编辑、commit、开 PR，再合入 canonical main。method 写恒走 flow 暂存（runtime 注入 `scope="flow"`），不直写 stone/pool——reflectable 分发器在 session 结束（或显式 `talk(super)`）扫 `flows/<sid>/.hydrate-snapshot.json` 与当前 flow data.json 的字段 hash 差异，对版本化字段以 scope="stone" 重调 save 起 PR、对 sediment 字段以 scope="pool" 直写。铁律：绝不从 session worktree（`flows/<sid>`）直合 main——它只是派生运行物。**铁律主语是 OOC Agent**——「stone 变更走 feat-branch PR」约束的是 **agent 的自我迭代**（须经审核闸）；**人类经 app 的 `PUT /stones/:id/file?path=` 直 commit main 是合理豁免**（人类=canonical 主权者，编辑本身即「已评审」）。**VERSIONED_FIELDS 是 class definition 一部分**，不可在 flow 内 mutate——改它即"改 class 源码"，本身走 PR。PR-Issue 记录、stone git versioning、reviewer 冒泡纯函数等存储层归 persistable，reflectable 只定义「在反思 session 下如何组合」；分发器具体链路（PR finalizer、pool merge）归 issue D 主体。session=flow=worktree 分支这一 persistable 模型，正是 reflectable feat-branch 沉淀的底座。详见 [reflectable](../children/reflectable/self.md) 与 [persistable](../children/persistable/self.md)。

## collaborable × thinkable

collaborable 的 talk 方法创建 thread，thread 跑 thinkable 的 thinkloop 处理对话——协作即派生 Thread Tree（thinkable 的并行、可恢复底座）；thread 途中继续 talk 别的 Agent，树就长深。对话窗（thread / talk window）是 readable 按视角对 thread 的投影，进 thinkable 构造的 context，自带 say 方法把消息发给对端（caller 或 callee）。thread 各持 inbox/outbox：say 写入自己的 outbox 并派送对端 thread 的 inbox。渲染时归属本窗的消息收进窗 transcript 并报告已渲 id，从顶层 inbox/outbox 兜底剔除——与 thinkable context「一条信息只渲一次」咬合。详见 [collaborable](../children/collaborable/self.md) 与 [thinkable](../children/thinkable/self.md)。

## readable × visible

同一个 Object，两个观众、两条展示线：readable 管 LLM 侧（把 Object 投影成 context XML），visible 管人类侧（tsx 画进浏览器）。两者并列、互为镜像、不互相吞并——readable 面向思考者，visible 面向用户。**人机分流是两条独立模块**：LLM 侧 = executable object method（exec-by-name）；人类侧 = visible（tsx + `visible/server` for-ui 服务端 API，经 HTTP `/call_method`，ctx 无 thinkloop thread，改 data → persistable.save）——不再「共用同一份 `window.methods` 按 `for_ui_access` 过滤」（该标记退役）。「变化的展示」也对称：readable 的投影收放（window method 换 win）对 visible 的 `diff.tsx` / loop_timeline window diff——一个给 context、一个给浏览器。详见 [readable](../children/readable/self.md) 与 [visible](../children/visible/self.md)。

# E · 内置对象 × 维度 交叉

> 每节讲一个 builtin 如何串起多个维度。

## thread

thread 是 agent 一次智能运行的载体——`talk` 创建它、core thinkloop 在其上运行——也是 builtin 里跨维度最密的对象，一身横跨五维（readable/executable/persistable + **thinkable** + lifecycle）。× thinkable：thread **注册 thinkable 模块**（`builtins/agent/children/thread/thinkable/`：buildInputItems 构造 context / appendEvents 单一 ingest 折事件 / maybeAutoCompress·maybeForceWaitForCompress / onSchedulerTick = harvest + child-notify），core thinkloop/scheduler 经 `thinkableOf(thread)` 调用；thread 派生 sub thread 织成 Thread Tree，构成可并行、可恢复的思考底座（见 [thinkable](../children/thinkable/self.md)）。运行 thread 经 `ctx.ownerThread`（WindowManager 注入）供 thread 类载体方法 **end / readable / talk** 取——取代 point-1 的抛错占位；**construct 已改纯工厂**（用显式 `callerThreadId`/`callerObjectId`/`calleeObjectId` 三身份 args + `ctx.persistence`、不掏运行 thread、不 mutate 父）、**unactive 改收 `self`**（= 被解引用的目标线程本身），二者不再用 ownerThread。**× 类型归位**：thread 业务 data 类型 `ThreadContext` / `ThreadMessage` 活在 thread builtin（`thread/types.ts`）——与旧 `interface Data` 合并为统一类型（会话窗指针字段 target/targetThreadId/isForkWindow 成 optional，`Data`/`TalkData`=别名），core 经 `import type` 引用（运行时擦除、无环）；`ProcessEvent`/`ThreadStatus`/flow-stone refs/路径函数仍留 core/_shared。× collaborable：每个 thread 持 inbox/outbox，`say` 写入自己 outbox 并派送到对端 thread 的 inbox。× readable：**同一个 thread 实例按视角投影成三种 window class**——thread（自己视角，过程 event + 与 creator 的对话通道）、talk（与 peer/sub 的会话）、reflect_request（super flow POV）。× persistable：thread 声明 `mode="inline"`，整窗随所属 thread 的 `thread-context.json` 落盘，不单独落 `data.json`。**生命周期**：会话窗即对该 thread 对象的一个引用、关一个 fork 窗使该子线程 refcount 归 0 → 由 thread 的 `unactive` policy **通知**（往该子线程自己 inbox 发一条 source="system" 通知「creator 已关闭对话窗口、当前已无消息订阅者」、即时落盘）、**不切终态、不级联**，由其下一轮 thinkloop 自决是否 `end`（waiting 子线程因 inbox 增长被 scheduler 唤醒）；退出态只有 `done` / `failed`（无 `canceled`，已退役），thread 终结一律走 `end`→done；结构窗（thread / creator 门面窗）不可关；引用计数停启机制见 A 区核心 10 与 [object self.md](../children/object/self.md)。

## agent

agent = object + LLM：在 object base 标准具备的四维（readable / executable / visible / persistable）之上叠加 thinkable / collaborable / reflectable 三维，即成 agent 实例（对象模型核心 9，见 [object self.md](../children/object/self.md)）。它持 `talk` / `plan` agency——`talk` 执行即创建一条 thread 并跑 thinkloop；`end` / `todo` 迁 thread（thread 作用域操作，见 `## thread`）。它的 data 含 `self` 身份字段，**`VERSIONED_FIELDS = ["self"]`**（issue C 同伴常量方案）——self 是版本化字段，每次迭代须经测试评估（reflectable feat-branch PR）。**agent builtin 的 persistable** 按 `ctx.scope` 分支：scope="flow"（method 路径）写 worktree 内 `self.md` 副本（resolveStoneIdentityRef 解析到 session worktree）+ runtime 在外层把整份 data 落 `data.json`（双写、保持 readable + JSON round-trip）；scope="stone"（reflectable 分发器调用，issue D 主体）直写 `stones/main/objects/<id>/self.md` canonical。经 **agent 自定义 readable** 渲为该 agent **self 门面窗的 self 视角内容**（他者视角渲 `readable.md`），身份只活在这一处、不进 thinkloop instructions。任何 object 经 `ooc.class=_builtin/agent` 继承它，即成 agent 实例。

## knowledge_base / knowledge

knowledge_base 是单例 object，经 `open_knowledge` 把知识条目接入系统；其 child `knowledge`（class）是知识条目窗（命名空间从属、不继承 parent，对象模型核心 8）。它的故事主要落在 × thinkable：每条 knowledge 持 `activates_on` trigger，thinkloop 构造 context 时对每篇求激活级别，命中即按级别（`show_description` 只露标题描述 / `show_content` 展开正文）激活进 context；这与渐进式执行咬合成"执行到哪、知识激活到哪"，控制每轮 context 体积。knowledge 的双源（seed / sediment）**磁盘加载（双源 seed + sediment 合并、sediment 覆盖 seed，不沿继承链）**由 **knowledge_base builtin 的 loader 模块**（`builtins/knowledge_base/loader.ts`）实现；**激活协议**（`activates_on` 触发求值 = `computeActivations`/activator）仍归 core thinkable 的 knowledge 子模块、在 context 构造期（thread thinkable 的 activator-windows/protocol）调用——物理位置 vs 语义属性分立。loader→core parser/persistable 是 builtin→core（合法）。**`method::<class>::<method>` 触发不解析 class 继承**——子若想用父 knowledge 触发条件，自己 import 父 knowledge md 并重声明本类 id 的 trigger（与 `## OOC Class/Object Model` 核心 2 一致）。**两源的编辑落点按版本化分**：**seed knowledge**（stone / 进 git）经 app 通用 file-edit 原语 `PUT /stones/:id/file?path=knowledge/x.md`（A1，版本化）；**sediment knowledge**（pool / 不进 git、非版本化）走独立 `/api/pools/` 端点——seed/sediment **不并入同一原语**（A1 只管 stone 版本化文件，pool 不进 git 与「版本化文件编辑」矛盾）。

## method_exec_form

form 是 **ObjectGuideMethod 多步引导**的载体——× executable：guide method 持 `route`，dispatch 命中时先跑 route 算出 `ObjectMethodIntents{tip, intents, quickSubmit}`：`quickSubmit=true` 直接执行 guide.exec；否则 runtime 自动 `instantiate(_builtin/agent/method_exec_form, { targetObjectId, guideName, accumulatedArgs:args, currentTip, currentIntents })`，把 form ref 作为 `refs:[formRef]` 返给 tool call。form 自身是个对象，持累积参数 + 填表态，注册 `refine`（merge 新参、重跑 route 刷新 currentTip/currentIntents，失败把 err 留在 lastError、可继续 refine）与 `submit`（经 `runtime.execGuide` **跳过 dispatch、直调 guide.exec**——避开递归再开 form）两条 object method。form readable 投影 `context` 段含 `target_object` / `guide` / `accumulated_args` / `current_tip` / `current_intents` / `last_error` 子节点，LLM 看 form 窗即知全貌。× thinkable：route 算出的 `intents` 驱动渐进式知识激活——填到哪个意图，关联该意图的 knowledge 随之激活、离开即卸载（`intent::` trigger）。phase-1 简化：所有 form 的 currentIntents 合并入 `ActivationContext.activeIntents`；phase-2 按 form objectId 作 source-key 分组替换 + 撤销（API 在 `core/thinkable/knowledge/source-intents.ts` 已预留）。详见 [executable](../children/executable/self.md)。

## pr / reflect_request

两类反思期投影窗，归 reflectable 通道、存储归 persistable：

- **`reflect_request`**：thread 在 super flow POV 下由 readable 算出的**投影 class**（非注册 builtin）——super flow self-view（thread.sessionId === "super"）下 surface 4 个一步到位分发器 object method（`scan_changes` / `create_pr_for_versioned` / `sediment_unversioned` / `create_pr_for_class_edits`）+ say/reply。普通 session 投影为 thread / talk 看不到这 4 method（声明驱动可见性）。
- **`pr`**：真注册 builtin class（`agent/children/pr`），reviewer 评审窗，runtime 投递创建；inline persistable（PR data 随载体 thread 落盘）；approve/reject/comment 内部触发 `onReviewerAction` finalizer → 聚合投票 → 按 `worldConfig.prAutoMerge` 自动 / 人工合入。

二者永不共存于同一 thread。窗只是脸：PR-Issue 记录（`stones/.stones_repo/.pr-issues/<id>.json`，不 git tracked）、stone git versioning、reviewer 冒泡纯函数都归 persistable，反思通道的组合语义归 [reflectable](../children/reflectable/self.md)。

## filesystem / terminal / interpreter

三个单例 tool-object 被 agent exec，是「object method 产副作用 + children 窗投影展示」的标准组合样板：

- × executable：各暴露 object method——`filesystem`: grep/glob/open_file/write_file；`terminal`: run；`interpreter`: run。method 改世界、产工具副作用（归 [executable](../children/executable/self.md)）。
- × readable：各自 children 是结果窗 class——`filesystem` 的 file/search、`terminal` 的 terminal_process、`interpreter` 的 interpreter_process——把工具产出投影成 context window（viewport/transcript 等可调展示态），归 [readable](../children/readable/self.md)。

**filesystem.write_file（agent 侧）vs app file-edit 原语（人类侧）—— 有意分工、互斥不混用**：`filesystem.write_file` 是 **agent 侧写**，强制落 session worktree、进 canonical 走 feat-branch PR，**拒绝裸写 main**；app 的 `PUT /stones/:id/file?path=`（A1）是**人类侧特权直 commit main**。两条永不混用——人类=canonical 主权者直写、agent 自我迭代经审核闸（对齐 `## reflectable × persistable` 铁律主语）。

清单见 [builtins](./builtins.md)。

## runtime

`_builtin/runtime` 向 agent 提供系统级接入方法——× executable：如 `create_object`（建新对象骨架）等系统接入 object method，经统一 exec 入口调用。它不是被读展示的窗，而是被 agent **组合持有**的能力来源：agent 触达「建对象 / 系统操作」这类 OOC 系统能力的入口收在此对象上。**× object 生命周期：runtime 在 session 执行上下文内持 object 实例解析表**（`objectId → 唯一持 data 实例`，A 区核心 4 的 single-source / context window 引用解析的落点；= flows 磁盘的运行态镜像、refcount/active-unactive 落点；挂内存线程树根、随 job 释放，**非永生全局表**——worker 各 job 独立 readThread 重建内存树、跨 job 物理隔离无需锁）。派发时由 `dispatchUnactiveIfZero`/`dispatchActiveIfFirst`（`builtins/agent/children/thread/runtime/thread-runtime.ts:251-269`）经 `targetId` 解析目标对象 data（object 表兜不到则从内存线程树 `reachableThreads` 取，覆盖 fork child / thread 目标）作 **self** 传入生命周期钩子（`ObjectLifecycleHook.exec(ctx, self)`）。**× 模块解析：ObjectRegistry 注册五维度模块（executable/readable/persistable/thinkable/visibleServer）、resolveXxx 本类直查**——继承经子源码 `import` + `spread` 在 class `index.ts` 内表达（见 `## OOC Class/Object Model` 核心 2），registry 不沿链 fallback。新增 `resolveThinkable(classId)` 与 resolveReadable/resolvePersistable 同构本类直查；`thinkableOf(thread)`（core/thinkable/resolve.ts）是 thinkloop/scheduler 的运行时解析入口、无注册 fail-loud。**Hot-reload**：沿用 `core/runtime/hot-reload.ts` 现有 fs.watch 推模式 watcher + `stone:changed` 事件 → `serverLoader.invalidateStone` 链路（dev 模式开、生产关，且排除 `flows/<sid>/` worktree 路径防 agent 绕开 PR 闸门）；agent reflectable feat-branch PR 合入 main 时由 `mergeFeatBranch` finalizer 触发 invalidateStone，下次 hydrate 拿新版本。`WindowManager.fromThread` 构造各 ctx 时注入 `ownerThread`（运行 thread）供 thread 类载体方法 **end / readable / talk** 取（construct 纯工厂用 args + `ctx.persistence`、unactive 收 self，二者不经 ownerThread）。形态见 [builtins](./builtins.md)，调用契约归 [executable](../children/executable/self.md)。

## user

`user` 是代表人类用户的**被动 object**——× collaborable：它不跑 thinkloop，是 agent `talk` 的对端。web session 中由人类驱动的 flow object，worker 调度时显式跳过它。它体现了「object 不必是 agent」这条边界——同样是协作网络里的一个参与者，却只被动接收对话、不主动思考。协作语义见 [collaborable](../children/collaborable/self.md)，对象清单见 [builtins](./builtins.md)。
