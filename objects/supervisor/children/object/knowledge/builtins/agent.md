---
title: _builtin/agent — OOC Agent class（self × 各维度：四 facet + 三智能面）
description: builtin agent 的单一权威，以 self×维度切入——class 天然由 readable/executable/visible/persistable 四 facet 构成，agent 在其上额外具 thinkable/collaborable/reflectable 三张智能面。self=身份正文(data.self/self.md)；self×executable=agency talk/plan(end/todo 归 child thread)；self×readable=自定义 readable 渲 data.self 为 self 门面窗 self 视角内容(他者渲 readable.md；非 thinkloop instructions)；self×persistable=data.self↔实例目录 self.md(实现归 agent builtin)；唯一合法继承=object 经 ooc.class=_builtin/agent 继承本 class；children=thread/plan/todo/skill_index/pr/method_exec_form 命名空间从属
activates_on:
  "object::root": "show_description"
---

# _builtin/agent

> `_builtin/agent` = OOC **Agent class**：一份「智能 object」的 class 定义。**class 天然**由 readable / executable / visible / persistable 四个 facet 构成；agent 在这四面之上**额外**具备 thinkable / collaborable / reflectable 三张**智能面**——这三面让它「会思考、会协作、会自我迭代」。
> 对象模型本身（class/object、单例/非单例、object 经 `ooc.class` 继承一个 class、children 命名空间从属、object method vs window method）见 `object/self.md`；三智能面的设计权威在 thinkable `knowledge/agent.md`——本文都不复述，只讲「agent 的 self 在各维度长什么样」。

## 一、self（身份 / data）

- **`ooc.kind = class`**——一份定义/模板，不写 `ooc.class`（class 本身不继承 class）。
- **非单例 class**（在 index.ts 注册 `construct`），但是**抽象 class**——通常不被直接实例化，而是被一个具体 agent **object 经 `ooc.class=_builtin/agent` 继承**（单层）：supervisor 即 `ooc.class=_builtin/agent` 的 object 实例，feishu_app 同。复用 agent 的程序靠 import 本 class export 的方法，而非 class 继承 class。
- **self 的标识 data 字段 = `self: string`**——agent 实例的**身份正文**（self.md 内容）。这是 agent 区别于工具 object / 非 agent object 的唯一持有字段；`self.md` 只属 ooc agent 实例（见 `object/self.md` 核心 9）。运行过程数据（context/inbox/outbox/events/status）**不在 agent data 上**——落在 child `thread`；agent 的 self 只持身份。
- **一句话职责**：定义「身份（self）+ agency（talk / plan）+ 三智能面」这套 agent 公共契约，供具体 agent object 经 `ooc.class` 继承。

## 二、self × 各维度（核心设计）

class 天然有 readable / executable / visible / persistable 四个 facet；agent 在其上多出 thinkable / collaborable / reflectable 三张「智能面」。以下逐维度看这张 self 如何呈现。

### self × executable —— agency object method（talk / plan）

agent 把 agency 收敛在两条 object method，继承本 class 的具体 agent 从此处拿到 agency。**均改 data / 有副作用，均不标 `for_ui_access`**（LLM-only，无 UI 入口）：

- **`talk`** —— 开启一个持续会话，统一两种会话形态：`target=别的 objectId`（"user" 亦然）⇒ peer 跨对象会话（需 title，同 target 复用同窗）；`target=自己的 objectId` ⇒ fork 一条同对象子线程（需 msg；wait / share_windows 可选）。实现 = 委托 child `thread` 的 construct——执行即创建 thread、跑 thinkloop。
- **`plan`** —— 把任务拆成可执行步骤，委托 child `plan` 的 construct 造一个 plan 子对象。

> `end` / `todo` **不属 agent agency**——它们是 thread 作用域操作，归 child `thread` 的 object method（在 thread 过程窗由 LLM 使用，见 §三 children/thread）。thinkloop 三原语 exec / close / wait 也不是 agent 的 object method——它们是 tool 层入口，见 thinkable `knowledge/thinkloop.md`。

### self × readable —— 自定义 readable 渲 data.self

**agent 的 self 投影成一个 self 门面窗（框架注入，id=objectId、class=objectId）：身份正文渲入 `<context>` XML**。**agent 有自定义 readable module**：self 视角把 `data.self` 投影为该窗的内容（renderer 先经 registry 派发 agent persistable 的 `load` hydrate `data.self`、再交本 readable 投影；空则空窗），并声明该窗 `object_methods:[talk, plan]`（agency surface）；他者视角走通用 readable（渲 `readable.md`）。身份 **不进 thinkloop instructions**（身份只活在 self 门面窗这一处）。self 门面窗同时是 agent 的命令面（挂 agency object methods、exec 默认目标）。注意「过程」（thread.events + creator 对话 + events 折叠）归**自己视角 thread 窗**，与 self 门面窗（identity）主体不同、各归各窗。

### self × persistable —— data.self ↔ 实例目录 self.md（自定义）

agent 自定义 persistable：`save` 把 `data.self` 写进实例目录 `self.md`，`load` 读回（无则走系统缺省、self 为空）。**`readSelf`/`writeSelf` 实现归 `agent/persistable/self-md.ts`（实现下沉 agent builtin，先例同 thread-json；core 不再拥有），其依赖的 stone 寻址原语经 import 自 `@ooc/core/persistable`。** 落盘机制（session-aware ref 路由 / stone 身份层）归 persistable 维度，agent 只声明把身份委托给它。

### self × construct —— 造带身份的 agent 实例

args schema 仅 `self`（string，可选，缺省 `""`），产出新 agent 实例初始 data `{ self }`——即「造一个带身份正文的 agent 实例」。

### self × visible —— 默认

无自定义，走系统默认。

### self × thinkable / collaborable / reflectable —— 三智能面（cross-ref，不复述）

agent 在四 facet 之上多出的三张面，设计权威分别在 thinkable / collaborable / reflectable 维度对象，本文只指出 self 在各面的入口：

- **self × thinkable**：`talk` → 创建 child `thread` → 跑 thinkloop（构造 context → 喂 LLM → tool use 行动 → 再构造下一轮）。→ thinkable `knowledge/agent.md`、`thread.md`、`thinkloop.md`、`context.md`。
- **self × collaborable**：thread 间 `say` + inbox/outbox，按视角双实现表达跨对象协作。→ collaborable `self.md`。
- **self × reflectable**：自我迭代——经 `talk(target="super")` 进受保护的 super 反思 session，凭 `new_feat_branch` / `create_pr_and_invite_reviewers` 走 feat-branch PR 沉淀对自身知识/身份/身体的编辑。→ reflectable `self.md`。

## 三、children（命名空间从属、不继承）

children 物理在 `agent/children/<child>/`、id 前缀 `_builtin/agent/<child>`，承载 agency 落地后产生的各类窗对象。它们命名空间从属于 agent，但不继承 agent（见 `object/self.md` 核心 8）。

- **`thread`**（class，非单例）—— agent **一次智能运行的载体**，也是**唯一会话载体注册 class**。`talk` 经其 construct 创建（peer / fork 两形态）。同一 thread 实例按视角（POV）投影成三种 window class：`thread`（self-view 非 super）/ `talk`（other-view）/ `reflect_request`（self-view super，反思自视，额外 surface 沉淀 method）——投影 class 按视角算出、不持久化。object method：`say`（会话）/ `close`（关 thread 窗）/ `end`（结束本 thread，标 done、记 endReason/endSummary，可选 result 经 creator 窗 say 回报父级）/ `todo`（在当前 thread context 内登记 todo 子对象）+ 两条 reflectable 沉淀 method `new_feat_branch`/`create_pr_and_invite_reviewers`（标 `for_reflectable`，仅在 `reflect_request` 投影窗 surface）。`end`/`todo` 是从 agent agency 迁入的 thread 作用域操作，仅在 self-view `thread` 投影窗 surface（`talk`/`reflect_request` 投影窗不 surface）。`wait` 是 tool 原语、作用于窗，不是 thread 的 object method。persistable `mode:"inline"`（整窗随 thread-context 落盘）。
  - thread 三视角投影语义 / thinkloop 内情 / say 双实现 / feat-branch PR 沉淀语义一律 cross-ref，本文不复述：thread 数据/行为/投影 → thinkable `knowledge/thread.md`；thinkloop → thinkable `knowledge/thinkloop.md`；say/inbox-outbox → collaborable `self.md`；feat-branch PR → reflectable `self.md`。
- **`plan`**（class，非单例）—— 任务结构化（plan 树）。data：title/description/steps[]/status + 父 plan 软链。construct 校验「plan / title / description / steps / parentPlanWindowId 至少一项」。object method：`update_plan` / `add_step` / `update_step` / `expand_step`（造子 plan）/ `collapse_subplan` / `mark_done` / `close`。投影成 `plan` 窗、无 window method；有自定义 visible。
- **`todo`**（class，非单例）—— 可见待办项。data：content / activatesOn? / status(open|done)。construct 必填 content。唯一 object method `mark_done`（open→done）。投影成 `todo` 静态卡片、无 window method；有自定义 visible。
- **`skill_index`**（class，**完全派生、无 construct**）—— stones 上 skills 目录的索引视图。data：status + skills[]，**每 thread 由 synthesizer 每轮扫描双层 skills 目录派生注入、不落盘**。无 object method、无 window method；投影成 `skill_index` 窗，给「open_file 打开具体 SKILL.md」的 hint；有自定义 visible。
- **`pr`**（class，**无 construct**）—— reviewer 评审窗（reflectable 沉淀的 feat-branch PR）。**不由 LLM 构造**，而由 runtime 投递创建——`create_pr_and_invite_reviewers` 开 PR 后给每个 reviewer 的 super-session thread inline 投递。data 最小：issueId / reviewerObjectId / authorObjectId / authorThreadId?（diff/approvals render 时从 PR record 读，不双写）。object method：`approve` / `reject` / `request_changes`（reviewer 亲手批，底层聚合 + auto-merge 闸）。投影成 `pr` 窗、无 window method。沉淀编排/投递归 reflectable 维度。
- **`method_exec_form`**（class）—— method 调用 form 的类型归位（`Data`：method/accumulatedArgs/fill/status…），无维度实现，仅为旧业务类型归位保留。

## 四、程序骨架（示意）

参照 `object/knowledge/example.md` 的逐文件布局；以下是 design-level 示意（**不必可编译**），方法名取本 builtin 真实 object method。agent 自定义了 executable + readable + persistable + construct，visible 走系统默认。

### 文件布局

```
agent/
├── package.json         # ooc.kind=class（不写 ooc.class——class 不继承 class）
├── index.ts             # export const Class = { construct, executable, readable, persistable }
├── types.ts             # Data = { self }
├── executable/index.ts  # agency object method：talk / plan
├── readable/index.ts    # self 视角渲 data.self 为 self 门面窗内容（object_methods:[talk,plan]）
├── persistable/
│   ├── index.ts         # 自定义：data.self ↔ 实例目录 self.md
│   └── self-md.ts       # readSelf/writeSelf/selfFile（下沉自 core，先例同 thread-json）
└── children/            # thread / plan / todo / skill_index / pr / method_exec_form
```

### package.json —— `kind`（无 `class`）

```json
{
  "name": "@ooc/builtins/agent",
  "type": "module",
  "ooc": { "objectId": "_builtin/agent", "kind": "class" }
}
```

### types.ts —— object data 结构

```ts
export interface Data {
  self: string; // 身份正文（self.md 内容）；唯一持有字段，过程数据落 child thread
}
```

### index.ts —— 装配 class（construct + executable + persistable）

```ts
import executable from "./executable/index.ts";
import readable from "./readable/index.ts";
import persistable from "./persistable/index.ts";
import type { Data } from "./types.ts";

const construct = {
  description: "Create an agent instance with an identity (self.md text).",
  schema: { self: { type: "string", required: false, description: "身份正文，缺省空" } },
  exec: (_ctx, args) => ({ self: typeof args?.self === "string" ? args.self : "" }),
};

export const Class = { construct, executable, readable, persistable };
```

### executable/index.ts —— agency object method（talk / plan）

```ts
const talkMethod = { name: "talk", /* target=别人→peer会话窗 / target=自己→fork子线程；委托 thread.construct */ exec: async (ctx, self, args) => { /* ... */ } };
const planMethod = { name: "plan", /* 委托 child plan.construct */ exec: async (ctx, self, args) => { /* ... */ } };

export default { methods: [talkMethod, planMethod] };
// end / todo 不在此——它们是 thread 作用域操作，注册在 children/thread/executable
```

### persistable/index.ts —— 身份 self.md 的序列化（自定义）

```ts
import { readSelf, writeSelf } from "./self-md.js"; // 实现下沉 agent builtin（core 不再拥有）

export default {
  save: async (ctx, data) => {
    const ref = await resolveStoneIdentityRef({ baseDir: ctx.baseDir, objectId: ctx.objectId, sessionId: ctx.sessionId }, "write");
    await writeSelf(ref, data.self ?? "");
  },
  load: async (ctx) => {
    const ref = await resolveStoneIdentityRef({ baseDir: ctx.baseDir, objectId: ctx.objectId, sessionId: ctx.sessionId }, "read");
    const self = await readSelf(ref);
    return self !== undefined ? { self } : undefined; // 无则走系统缺省、self 空
  },
};
```

> visible 无自定义骨架——走系统默认。readable 自定义（`readable/index.ts` 渲 `data.self` 为 self 门面窗 self 视角内容、声明 `object_methods:[talk,plan]`），骨架同 `example.md` 范式。children（thread/plan/todo/…）各有自己的 index.ts/types.ts/executable/readable，本文不展开。
