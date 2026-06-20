---
title: supervisor — 顶层 OOC agent 实例（self × 维度：面孔几乎全沿 _builtin/agent class）
description: builtin supervisor 的单一权威定义，以 self × 维度透镜陈述：self=空 data（业务字段）+ ooc.class=_builtin/agent 单层继承、world 唯一 agent 实例；除 own self.md 身份快照与 runtime 赋予的治理落点外，readable/executable/persistable/visible/thinkable/collaborable/reflectable 各面孔皆复用 _builtin/agent class、自身无自定义。身份/职责的内容权威活在 .ooc-world-meta 对象树本身
activates_on:
  "object::root": "show_description"
---

# supervisor

> 顶层 OOC agent 实例——OOC world 的根 parent object、控制面治理动作（rollback / resolve PR-Issue）的恒定落点、reflectable 冒泡兜底 actor，也是 world 默认 talk 入口。
> 对象模型（class/object、单例·非单例、construct、object 经 `ooc.class` 单层继承一个 class、children、投影、agent=智能 object）见 `object/self.md`，本文不复述模型。
> **范围界定**：supervisor 作为「OOC 该是什么」的设计权威，其身份/职责的内容权威活在 `.ooc-world-meta` 对象树本身（它就是这棵树的 root object）——本文**只**以 `self × 维度`透镜描述它作为 builtin agent 实例的**对象模型属性**，不复述其职责内容。

## 一、self（身份 / data）

- **`ooc.kind = object`**：world 中枢的**唯一**实例（每 world 恰一个 supervisor），不是按需可造多个的非单例 class。
- **`ooc.class = _builtin/agent`**：supervisor 这个 object 经 `ooc.class` **单层继承** `_builtin/agent` class——这是 OOC 里唯一合法的继承（object 继承一个 class）。它由此**是 agent**（跑 thinkloop、可被 talk），区别于被动的 user 与无 agency 的单例 tool-object（filesystem / interpreter / terminal）。
- **data**：supervisor 自身**无额外业务字段**。它持有的唯一 data 字段 `self`（身份正文，self.md 内容）来自 `_builtin/agent` class 的 `Data = { self }`——任何 agent 实例天然持有 `self`，supervisor 不另加字段。
- **一句话职责**：OOC world 的根 agent object——user 交互的默认对端、控制面 supervisor-only 治理的恒定 enactor、reflectable 新对象冒泡沉淀的兜底 super-actor。特殊性不在能力，而在**身份**（own self.md 快照）与 runtime 赋予的**治理落点地位**。

## 二、self × 各维度（核心设计）

supervisor 的总特征：**所有维度面孔都复用 `_builtin/agent` class、自身零自定义**——身为 `ooc.class=_builtin/agent` 的 object，它天然拥有 agent class 的四 facet（readable/executable/visible/persistable）+ 三智能 facet（thinkable/collaborable/reflectable）；supervisor 不为任一面孔写 override。唯一私有物是 own self.md 身份快照。

### self × readable
无自定义。supervisor 是 agent——身份正文（self.md）**渲为 self 门面窗的 self 视角内容**（`resolveProjection`→`readSelf`，**非** thinkloop instructions；见 builtins `agent.md` self×readable）。它作为 peer object 出现在别的 agent 视角时走系统默认 peer 窗投影 + 文件级 `readable.md`（对外名片），由 core readable 渲染（cross-ref readable 维度）。无 window method。

### self × executable
**object method 无自定义**——agency（`talk` / `plan` / `todo` / `end`）全部由 `_builtin/agent` class 提供，supervisor 经 `ooc.class` 继承得到，自身不加 method、不 override。

### self × persistable
无自定义。supervisor 复用 `_builtin/agent` class 的 persistable——`data.self` 写入/读回实例目录 `self.md`（落盘机制、session-aware ref 路由归 persistable 维度）。

### self × visible
无自定义 self UI 详情页（`visible/index.tsx` 为 no-op 占位），走系统默认：web 控制面侧栏选 supervisor 直接发消息。

### self × construct
无。supervisor 是实例（`kind=object`），不是非单例 class，不持 construct（construct 是非单例 class 在 index.ts 注册的造实例槽）。它由 bootstrap 在每个新 world **幂等实例化**——以 framework 包预置的 self.md 作 own 身份 + `ooc.class=_builtin/agent`。

### self × thinkable / collaborable / reflectable
三智能维度面孔全部来自 `_builtin/agent` class、supervisor 自身无自定义（agent=智能 object 的设计见 thinkable `knowledge/agent.md`）。supervisor 不为这三面孔加任何 override；它「会思考、会协作、能自我迭代」纯由 `ooc.class=_builtin/agent` 而来。

### own self.md（supervisor 的唯一特殊文件）
- supervisor 是**唯一保留静态 self.md 的 builtin agent 实例**：framework 包 `packages/@ooc/builtins/supervisor/self.md` 持一份预置身份正文，bootstrap 时拷为实例的 own 快照（`data.self`）。
- 这份 self.md 的**内容权威不在这里**——supervisor 的身份/职责活在 `.ooc-world-meta` 对象树本身（supervisor 就是该树 root object）。framework 包里的 self.md 只是给「裸 world（无对象树）也有个能开口的 supervisor」的 bootstrap 兜底身份。
- 还带 framework 包 `knowledge/` seed（每 thread 按意图自动激活、完成即卸载，cross-ref thinkable·knowledge 维度）。
- 已知 trade-off：self.md 快照漂移——agent class 升级 agency 语义后，own self.md 可能描述旧契约（cross-ref `object/self.md`「self.md 快照」边界）。

### runtime 赋予的治理落点（非维度面孔、属 runtime 地位）
控制面 supervisor-only 治理（rollback / resolve PR-Issue）以 supervisor 为**恒定 enactor**；reflectable 新对象冒泡沉淀以它为**兜底 super-actor**。这不是 supervisor 的某个维度面孔，而是 runtime 赋予这个唯一实例的特权落点。

## 三、children

无 children。agency 相关的会话/任务结构（thread / plan / todo / pr / skill_index 等）是 `_builtin/agent` class 的 children——supervisor 经 `ooc.class` 继承到 agent 的能力，但这些 children 命名空间从属 `_builtin/agent`、不属 supervisor。

## 程序骨架（示意）

> design-level 示意，非可编译代码。supervisor 是 `ooc.kind=object` 实例 + `ooc.class=_builtin/agent` 单层继承的 agent；它**没有自己的 class 程序文件**——readable/executable/persistable/visible 各 facet 全部来自所继承的 `_builtin/agent` class（见 builtins `agent.md` 的程序骨架）。supervisor 这份 stone 里只有：身份正文 self.md + knowledge seed + 一个声明继承关系的 package.json。

```
supervisor/                # ooc.kind=object 实例（非 class，故无 index.ts/types.ts/executable/readable）
├── package.json           # ooc 元信息：kind=object / class=_builtin/agent
├── self.md                # own 身份快照（bootstrap 拷为 data.self）
└── knowledge/             # 预置触发式知识 seed（每 thread 按意图激活、完成即卸载）
```

### package.json —— `kind=object` + `class=_builtin/agent`（单层继承）

```json
{
  "name": "@ooc/builtins/supervisor",
  "type": "module",
  "ooc": {
    "objectId": "supervisor",
    "kind": "object",
    "class": "_builtin/agent"
  }
}
```

- `kind=object`：supervisor 是一个**具体实例**，不是可造多个的 class。
- `class=_builtin/agent`：唯一合法继承——object 单层继承一个 class；agency / 三智能维度 / data 形状 `{ self }` 皆由此得来。

### data 形状（继承自 _builtin/agent class，supervisor 不另加）

```ts
// 来自 _builtin/agent class 的 types.ts —— supervisor 复用，无私有 types.ts
export interface Data {
  self: string   // 身份正文（self.md 内容），渲为 self 门面窗 self 视角内容（非 thinkloop instructions）
}
```

### 继承到的 agency object method（实现在 _builtin/agent class）

supervisor 自身无 executable/index.ts；以下 method 经 `ooc.class=_builtin/agent` 继承得到（签名/语义见 builtins `agent.md`）：

```ts
// _builtin/agent class 的 executable/index.ts —— supervisor 经继承使用，不 override
export default {
  methods: [
    talkMethod,   // 开会话：target=别的 objectId ⇒ peer 跨对象；target=自己 ⇒ fork 子线程
    planMethod,   // 把任务拆成可执行步骤（造 plan 子对象）
    todoMethod,   // 登记可见待办（造 todo 子对象）
    endMethod,    // 结束当前 thread，可选 result 经 creator 会话窗 say 回报
  ]
}
```

### self.md（own 身份快照 —— supervisor 唯一私有物）

```md
# supervisor

OOC world 的根 agent object：user 交互默认对端、控制面治理恒定 enactor、
reflectable 冒泡兜底 super-actor。
（内容权威活在 .ooc-world-meta 对象树本身；此处仅为裸 world bootstrap 兜底身份。）
```
