---
title: agent — OOC Agent 基类（智能 object 的继承起点）
description: builtin 家族 agent 的单一权威定义——kind=class、继承 root、非单例（有 construct）；data.self=身份正文；agency object method talk/plan/todo/end；children=thread/plan/todo/skill_index/pr/method_exec_form；自身不投影成窗
activates_on:
  "object::root": "show_description"
---

# agent

> `_builtin/agent` 是 OOC **Agent 基类**：继承 root，额外具 thinkable / collaborable / reflectable 三智能维度，是一切「会思考的 object」的继承起点（supervisor / feishu_app 等具体 agent 经 `ooc.class=_builtin/agent` 继承它）。
> 对象模型（class/object、单例/非单例、construct、IS-A 继承、children 命名空间、agent 分层）见 class `knowledge/object-model.md`，本文不复述模型。
> **以设计为准**：存量代码部分接线可能过期，分歧逐条记入「五、源码现状与差异」并锚行号。

## 一、是什么（核心职责）

- **ooc.kind = `class`**（`packages/@ooc/builtins/agent/package.json:13`）。
- **ooc.class**：未声明 `ooc.class` ⇒ 隐式继承 **root**（继承链终点，对象模型核心 2）。
- **非单例 class**：`index.ts` 注册了 **construct**（`Class.construct`，`index.ts:18-32`），按需造多个 agent 实例。但它是**抽象基类**——通常不被直接实例化，而是被具体 agent 继承（supervisor 是 object 实例、`ooc.class=_builtin/agent`）。
- **是 agent（不是 tool-object，不是被动 object）**：它是对象模型核心 9 的 agent 抽象本身——在 root 的 readable/executable/visible/persistable 之上，凭 **thinkable / collaborable / reflectable** 成为「智能 object」（设计权威：thinkable `knowledge/agent.md`）。
- **一句话职责**：定义「身份（`self`）+ agency（talk/plan/todo/end）」这套 agent 公共契约，供具体 agent 继承；自身不投影成窗。

## 二、data 结构（types.ts）

`agent` 的 object data 极小（`types.ts:9-11`）：

- **`self: string`** —— agent 实例的**身份正文**（self.md 内容）。经 agent 的 persistable 写入/读回实例目录的 `self.md`、并加载为该 agent thinkloop 的 instructions。`self.md` 只属 ooc agent 实例（对象模型核心 9）——这是 agent 区别于工具 object / 非 agent object 的唯一持有字段。

> 运行过程数据（context/inbox/outbox/events/status）**不在** agent 的 data 上——它们落在 thread 对象（child `thread`）。agent 自身只持身份。

## 三、能力

### object method（executable）—— agency

agent 把 agency 收敛在四条 object method（`executable/index.ts:20-22`），继承它的具体 agent 从此处拿到 agency。**均改 data / 有副作用**，**均未标 `for_ui_access`**（LLM-only，不向 UI 暴露）：

- **`talk`**（`executable/method.talk.ts:24`）—— 开启一个持续会话 talk_window。统一两种会话形态：`target=别的 objectId`（"user" 亦然）⇒ peer 跨对象会话（需 title，同 target 复用同窗）；`target=自己的 objectId` ⇒ fork 一条同对象子线程（需 msg；wait / share_windows 可选）。**实现 = 委托 child `thread` 的 construct**：`ctx.runtime.instantiate("_builtin/agent/thread", args)`（thread-as-object，见四·thread）。这是对象模型核心 9 的 agent 入口——执行即创建 thread、跑 thinkloop。
- **`plan`**（`executable/method.plan.ts:18`）—— 把任务拆成可执行步骤，委托 child `plan` 的 construct（`instantiate("_builtin/agent/plan", args)`）造一个 plan 子对象。
- **`todo`**（`executable/method.todo.ts:17`）—— 登记一条可见待办，委托 child `todo` 的 construct 造一个 todo 子对象。
- **`end`**（`executable/method.end.ts:89`）—— 结束当前 thread（标记 `status="done"`，记 endReason/endSummary）；可选 `result` 经 creator 会话窗 `say` 自动回报父级（fork 走内存树、peer 走磁盘派送，由 say 自分流）。这是 agent 一轮收尾的对外可见动作。

> 注：thinkloop 的「三原语」**exec / close / wait** 不是 agent 的 object method——它们是 tool 层入口（wait 经 `core/executable/tools/wait.ts`），见 thinkable `knowledge/thinkloop.md`，本文不复述。

### window method（readable）

agent **无自定义 window method**——agent 自身不投影成窗（见下）。

### 投影（readable）

**agent 自身没有 readable，不投影成 context window**（`index.ts:9` 注释、`Class` 不含 readable）。原因：agent 是「智能 object」抽象，它的「自我」在 LLM 视角下表现为 thread（会话载体）而非一个静态展示窗；agent 的身份（self.md）作为 thinkloop 的 instructions 注入，而非作为窗内容渲染。具体 agent 若需 self-window 投影，由其自身或经 class 链回退的 readable 决定（class 链文件级 readable 回退尚未落地，见 class `self.md`「已知问题」）。

### visible / persistable

- **persistable**：自定义（`persistable/index.ts`）。`save` 把 `data.self` 写进实例目录 `self.md`；`load` 从 `self.md` 读回 `self`（无则 undefined → 走系统缺省、`data.self` 为空）。读写均经 `resolveStoneIdentityRef`（session-aware 路由，落 stone 身份层）。具体落盘机制归 persistable 维度，本文只声明 agent 把身份委托给它。
- **visible**：agent 基类无自定义 visible，走系统默认。

### construct（非单例 class）

`Class.construct`（`index.ts:18-32`）：args schema 仅 `self`（string，可选，缺省 `""`）；产出新 agent 实例的初始 data `{ self }`。即「造一个带身份正文的 agent 实例」。

## 四、children（命名空间从属，不继承）

children 物理在 `agent/children/<child>/`、id 以 parent 为前缀 `_builtin/agent/<child>`；**从属命名空间、不继承 agent**（对象模型核心 8）。它们承载 agency 落地后产生的各类窗对象。

- **`_builtin/agent/thread`**（class，非单例）—— agent **一次智能运行的载体**，也是**唯一会话载体注册 class**。`talk` 经其 construct 创建（peer / fork 两形态：`index.ts:125` talkConstructor）。**同一 thread 实例按视角（POV）投影成三种 window class**：`thread`（self-view 非 super，与 creator 对话）/ `talk`（other-view，与对端 peer/sub 对话）/ `reflect_request`（self-view super，反思自视，额外 surface 沉淀 method）——投影 class 由 `computeProjectionClass` 从窗形态 + session 算出、**不持久化**（`readable/index.ts:59-67`）。object method：会话三件 `say`/`close`/`share`（session-methods.ts）+ 两条 reflectable 沉淀 method `new_feat_branch`/`create_pr_and_invite_reviewers`（标 `for_reflectable`，仅在 `reflect_request` 投影窗 surface，`executable/index.ts:18-24`）。persistable 声明 `mode:"inline"`（整窗随 thread-context 落盘，`persistable/index.ts:16`）。
  - **thread 三视角投影语义、thinkloop 内情、reflectable 沉淀语义一律 cross-ref**，本文不复述：thread 数据/行为/投影 → thinkable `knowledge/thread.md`；thinkloop/三原语 → thinkable `knowledge/thinkloop.md`；say 双实现/inbox-outbox → collaborable `knowledge/cross-object-talk.md`、`knowledge/inbox-outbox-delivery.md`；feat-branch PR 沉淀 → reflectable `knowledge/feat-branch-pr.md`、`knowledge/super-flow.md`。
- **`_builtin/agent/plan`**（class，非单例）—— 任务结构化（plan 树）。data：title/description/steps[]/status + 父 plan 软链（`plan/types.ts`）。construct 校验「plan / title / description / steps / parentPlanWindowId 至少一项」（`plan/index.ts:15-24` constructorHasAnyInput，construct exec 在 `:41` 调用）。object method：update_plan / add_step / update_step / expand_step（造子 plan）/ collapse_subplan / mark_done / close（`plan/executable/index.ts`）。投影成 `plan` 窗、无 window method（plan 无展示态切片，`plan/readable/index.ts`）。有自定义 visible（`plan/visible/`）。
- **`_builtin/agent/todo`**（class，非单例）—— 可见待办项。data：content / activatesOn? / status(open|done)（`todo/types.ts`）。construct 必填 content（`todo/index.ts`）。唯一 object method `mark_done`（open→done，真实业务态迁移，`todo/executable/index.ts:16`）。投影成 `todo` 静态卡片、无 window method。有自定义 visible（`todo/visible/`）。
- **`_builtin/agent/skill_index`**（class，**完全派生**，**无 construct**）—— stones 上 skills 目录的索引视图。data：status:"active" + skills[]（SkillEntry），**每 thread 由 synthesizer 每轮扫描双层 skills 目录派生注入、不落盘**（`skill_index/types.ts`、`skill_index/index.ts:5-6`）。**无 object method**（空表）、无 window method；投影成 `skill_index` 窗，给「open_file 打开具体 SKILL.md」的 hint（`skill_index/readable/index.ts`）。有自定义 visible（`skill_index/visible/`）。
- **`_builtin/agent/pr`**（class，**无 construct**）—— reviewer 评审窗（reflectable 沉淀的 feat-branch PR）。**不由 LLM 构造**，而由 `deliverPrWindowToReviewers`（runtime 投递创建）在 `create_pr_and_invite_reviewers` 开 PR 后，给每个 reviewer 的 super-session thread inline 投递（`pr/index.ts:1-8`、`pr/delivery.ts`）。data 最小：issueId / reviewerObjectId / authorObjectId / authorThreadId?（diff/approvals 等 render 时从 PR record 读，不冗余双写，`pr/types.ts`）。object method：approve / reject / request_changes（reviewer 亲手批，底层 applyPrApproval 聚合 + prAutoMerge 闸，`pr/executable/index.ts`）。投影成 `pr` 窗、无 window method。沉淀编排/投递（approval-flow.ts / delivery.ts）经 `pr/index.ts:22-24` re-export 被 reflectable barrel 复用。
- **`_builtin/agent/method_exec_form`**（class，**空 Class 占位**）—— method 调用 form 的类型归位。**form 机制 Wave4 已废**；本类仅把旧 `_shared/types/method-exec.ts` 的业务类型（`Data`：method/accumulatedArgs/fill/status…）归位于此 + 注册一个空 `Class = {}`（无 construct/executable/readable，`method_exec_form/index.ts:11`）。是过渡态遗留（见五）。

## 五、源码现状与差异（设计 vs 实现）

逐条对照 object-model.md 核心设计核验：

- **[符合] kind/继承/construct/data**：`package.json` 用规范的 `ooc.kind="class"`（无旧 `kind:"builtin"`/`type:"object"`）；construct 用规范槽名 `construct`（非被遮蔽的 `constructor`）；data 只持 `self`、身份经 persistable 落 self.md——与对象模型核心 1/3/9 一致。**agency 已从 root 搬迁到 agent class**（`executable/index.ts:4` 注释），符合 class `self.md`「agency 收敛到 `_builtin/agent`」方向。
- **[过渡态·可接受] children id 用 `_builtin/agent/<child>`，但 talk-family 文件内部别名仍写 `_builtin/thread`**：thread readable/types 注释多处称投影载体为 `_builtin/thread`（`thread/types.ts:6`、`thread/types.ts:38`、`thread/readable/index.ts:12`、`thread/readable/talk-render.ts:4`），而注册/实例化用的是带 parent 前缀的 `_builtin/agent/thread`（`thread/package.json:12`、`method.talk.ts:56`）。注释里的 `_builtin/thread` 是 children 命名空间重组（commit 87793f06）前的旧名残留——**文档断言/注释未完全回流**，不影响运行（实际 instantiate 用全前缀）。属应修的文档漂移。
- **[应修] skill_index 的 `ooc.kind` 与设计不符**：`skill_index/package.json:16` 写 `kind:"object"`，但 `index.ts`（无 construct、不持久化，`skill_index/index.ts:5-6`）/types.ts/builtins 索引均把它当**派生 class**（每 thread 由 synthesizer 重建注入、不持久化）。按对象模型，「类定义/模板」应 `kind:"class"`；此处 `object` 是单文件遗留误标。应改为 `class`（或明确其单例 object 语义并统一索引口径）。
- **[过渡态·可接受] method_exec_form 是空占位**：`index.ts:11` 注册 `Class = {}`——无任何维度实现，仅为旧类型归位保留。form 机制已废（对象模型「无累积式 form」、interaction-core knowledge 亦称「不再有累积式 form」）。其作为 agent child 注册无实际能力，是清理候选（涨潮后该退潮的废弃物）。
- **[过渡态·可接受 / deferred] agency 与 thread 沉淀 method 的深层 core 耦合留 deferred**：talk 的「会话对象 construct 创建 thread + 跑 thinkloop / peer 复用同窗 / fork 内存树派送」、end 的「creator window 识别 + say 派送 + notifyThreadActivated」、pr 的「runtime 投递创建实例正式入口」均标 deferred_hooks，待 core 反推阶段补 RuntimeHandle 面（`method.talk.ts:54`、`method.end.ts:6-8`、`pr/index.ts:6`）。功能骨架在、完整运行时语义未在 method 内闭合——是 Wave4 对象模型重构的预期过渡态。
- **[与索引一致性] builtins.md 索引称 agent 持 `talk/plan/todo/end` agency** —— 与源码 `executable/index.ts` 四 method 一致。索引把 agent children 列为 `thread/plan/todo/skill_index/pr/method_exec_form`，与源码 children 目录一致。无需在 designVsSource 另记索引漂移。

## 六、倒推 ooc core 改进方向

- **runtime 缺「投递创建实例」与完整 RuntimeHandle 面**：talk/plan/todo 经 `ctx.runtime.instantiate` 造子对象，但 talk 的 thread 创建 + thinkloop 编排、end 的 `ctx.runtime.say` 派送、pr 的 runtime 投递创建均为 deferred，靠 method 内骨架兜底（runtime 缺席即退化为事件登记）。core 应补齐 RuntimeHandle 的会话/派送/投递正式 API，使 agency 的运行时语义在 method 内可闭合，而非散落 deferred_hooks。severity: high。
- **skill_index 暴露「派生窗对象」缺一等模型**：skill_index 完全由 synthesizer 每轮重建、不经 construct、不持久化，却仍要伪装成一个 ooc class（空 executable + ooc.kind 误标）。core 缺「synthesizer 派生窗」这一介于 class 实例与纯渲染之间的形态的一等表达，导致 package.json kind 字段与实际语义打架。severity: medium。
- **form 机制退役物未清理**：method_exec_form 作为空 Class 占位仍注册为 agent child，是已废 form 机制的残留。core/builtins 缺「退役 builtin class 的下线流程」，使废弃类型以空壳形式滞留命名空间。severity: low。
- **class 链文件级 readable/visible 回退未落地**：agent 无 readable（不投影），继承它的具体 agent 若需 self-window 投影，依赖「沿 class 链回退到父类磁盘 readable.md/visible.tsx」——该 stone 文件级回退当前未实现（仅 registry 级 method/window 回退已落，见 class `self.md`）。这制约了「具体 agent 复用基类投影」。severity: medium。
