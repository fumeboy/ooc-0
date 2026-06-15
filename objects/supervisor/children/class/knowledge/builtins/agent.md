---
title: agent — OOC Agent 基类（智能 object 的继承起点）
description: builtin 家族 agent 的单一权威定义——kind=class、继承 root、非单例；data.self=身份正文；agency object method talk/plan/todo/end；children=thread/plan/todo/skill_index/pr/method_exec_form；自身不投影成窗
activates_on:
  "object::root": "show_description"
---

# agent

> `_builtin/agent` 是 OOC **Agent 基类**：继承 root，额外具 thinkable / collaborable / reflectable 三智能维度，是一切「会思考的 object」的继承起点（supervisor / feishu_app 等具体 agent 经 `ooc.class=_builtin/agent` 继承它）。
> 对象模型（class/object、单例/非单例、construct、IS-A 继承、children 命名空间、agent 分层）见 class `knowledge/object-model.md`，本文不复述模型。

## 一、是什么（核心职责）

- **kind = class**，未声明 `ooc.class` ⇒ 隐式继承 root（继承链终点）。
- **非单例**（有 construct），但是**抽象基类**——通常不被直接实例化，而是被具体 agent 继承（如 supervisor 是 `ooc.class=_builtin/agent` 的 object 实例）。
- **是 agent**：在 root 的 readable/executable/visible/persistable 之上，凭 thinkable / collaborable / reflectable 成为「智能 object」（智能维度设计见 thinkable `knowledge/agent.md`）。
- **一句话职责**：定义「身份（`self`）+ agency（talk/plan/todo/end）」这套 agent 公共契约供具体 agent 继承；自身不投影成窗。

## 二、data 结构

- **`self: string`** —— agent 实例的**身份正文**（self.md 内容），经 persistable 写入/读回实例目录的 `self.md`、加载为该 agent thinkloop 的 instructions。这是 agent 区别于工具 object / 非 agent object 的唯一持有字段。

运行过程数据（context/inbox/outbox/events/status）不在 agent data 上——它们落在 child `thread`；agent 自身只持身份。

## 三、能力

### object method（executable）—— agency

agent 把 agency 收敛在四条 object method，继承它的具体 agent 从此处拿到 agency。均改 data / 有副作用，均**不标 `for_ui_access`**（LLM-only）：

- **`talk`** —— 开启一个持续会话。统一两种会话形态：`target=别的 objectId`（"user" 亦然）⇒ peer 跨对象会话（需 title，同 target 复用同窗）；`target=自己的 objectId` ⇒ fork 一条同对象子线程（需 msg；wait / share_windows 可选）。实现 = 委托 child `thread` 的 construct——执行即创建 thread、跑 thinkloop。
- **`plan`** —— 把任务拆成可执行步骤，委托 child `plan` 的 construct 造一个 plan 子对象。
- **`todo`** —— 登记一条可见待办，委托 child `todo` 的 construct 造一个 todo 子对象。
- **`end`** —— 结束当前 thread（标记 done，记 endReason/endSummary）；可选 `result` 经 creator 会话窗 `say` 回报父级（fork / peer 由 say 自分流）。

> thinkloop 三原语 exec / close / wait 不是 agent 的 object method——它们是 tool 层入口，见 thinkable `knowledge/thinkloop.md`。

### 投影 / window method（readable）

**agent 自身没有 readable，不投影成 context window，也无 window method**。设计理由：agent 是「智能 object」抽象，它的「自我」在 LLM 视角下表现为 thread（会话载体）而非静态展示窗；身份（self.md）作为 thinkloop 的 instructions 注入，而非作为窗内容渲染。具体 agent 若需 self-window 投影，由其自身或沿 class 链回退的 readable 决定。

### construct / persistable / visible

- **construct**：args schema 仅 `self`（string，可选，缺省 `""`），产出新 agent 实例初始 data `{ self }`——即「造一个带身份正文的 agent 实例」。
- **persistable**：自定义——`save` 把 `data.self` 写进实例目录 `self.md`，`load` 读回（无则走系统缺省）。落盘机制归 persistable 维度，agent 只声明把身份委托给它。
- **visible**：无自定义，走系统默认。

## 四、children（命名空间从属，不继承）

children 物理在 `agent/children/<child>/`、id 前缀 `_builtin/agent/<child>`，承载 agency 落地后产生的各类窗对象。

- **`thread`**（class，非单例）—— agent **一次智能运行的载体**，也是**唯一会话载体注册 class**。`talk` 经其 construct 创建（peer / fork 两形态）。同一 thread 实例按视角（POV）投影成三种 window class：`thread`（self-view 非 super）/ `talk`（other-view）/ `reflect_request`（self-view super，反思自视，额外 surface 沉淀 method）——投影 class 按视角算出、不持久化。object method：会话三件 `say`/`close`/`share` + 两条 reflectable 沉淀 method `new_feat_branch`/`create_pr_and_invite_reviewers`（标 `for_reflectable`，仅在 `reflect_request` 投影窗 surface）。persistable `mode:"inline"`（整窗随 thread-context 落盘）。
  - thread 三视角投影语义 / thinkloop 内情 / say 双实现 / feat-branch PR 沉淀语义一律 cross-ref，本文不复述：thread 数据/行为/投影 → thinkable `knowledge/thread.md`；thinkloop → thinkable `knowledge/thinkloop.md`；say/inbox-outbox → collaborable `knowledge/cross-object-talk.md`、`knowledge/inbox-outbox-delivery.md`；feat-branch PR → reflectable `knowledge/feat-branch-pr.md`、`knowledge/super-flow.md`。
- **`plan`**（class，非单例）—— 任务结构化（plan 树）。data：title/description/steps[]/status + 父 plan 软链。construct 校验「plan / title / description / steps / parentPlanWindowId 至少一项」。object method：update_plan / add_step / update_step / expand_step（造子 plan）/ collapse_subplan / mark_done / close。投影成 `plan` 窗、无 window method；有自定义 visible。
- **`todo`**（class，非单例）—— 可见待办项。data：content / activatesOn? / status(open|done)。construct 必填 content。唯一 object method `mark_done`（open→done）。投影成 `todo` 静态卡片、无 window method；有自定义 visible。
- **`skill_index`**（class，**完全派生、无 construct**）—— stones 上 skills 目录的索引视图。data：status + skills[]，**每 thread 由 synthesizer 每轮扫描双层 skills 目录派生注入、不落盘**。无 object method、无 window method；投影成 `skill_index` 窗，给「open_file 打开具体 SKILL.md」的 hint；有自定义 visible。
- **`pr`**（class，**无 construct**）—— reviewer 评审窗（reflectable 沉淀的 feat-branch PR）。**不由 LLM 构造**，而由 runtime 投递创建——`create_pr_and_invite_reviewers` 开 PR 后给每个 reviewer 的 super-session thread inline 投递。data 最小：issueId / reviewerObjectId / authorObjectId / authorThreadId?（diff/approvals render 时从 PR record 读，不双写）。object method：approve / reject / request_changes（reviewer 亲手批，底层聚合 + auto-merge 闸）。投影成 `pr` 窗、无 window method。沉淀编排/投递归 reflectable 维度。
- **`method_exec_form`**（class）—— method 调用 form 的类型归位（`Data`：method/accumulatedArgs/fill/status…），无维度实现，仅为旧业务类型归位保留。
