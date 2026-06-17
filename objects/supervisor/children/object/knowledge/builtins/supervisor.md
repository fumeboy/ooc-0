---
title: supervisor — 顶层 OOC agent 实例（self × 维度：面孔几乎全继承 _builtin/agent）
description: builtin supervisor 的单一权威定义，以 self × 维度透镜陈述：self=空 data + 继承 _builtin/agent 身份字段、单例 agent 实例；除 own self.md 快照与 runtime 赋予的治理落点外，readable/executable/persistable/visible/thinkable/collaborable/reflectable 各面孔全继承自 _builtin/agent、自身无自定义。身份/职责的内容权威活在 .ooc-world-meta 对象树本身
activates_on:
  "object::root": "show_description"
---

# supervisor

> 顶层 OOC agent 实例——OOC world 的根 parent object、控制面治理动作（rollback / resolve PR-Issue）的恒定落点、reflectable 冒泡兜底 actor，也是 world 默认 talk 入口。
> 对象模型（class/object、单例·非单例、construct、继承、children、投影、agent 分层）见 class `knowledge/object-model.md`，本文不复述模型。
> **范围界定**：supervisor 作为「OOC 该是什么」的设计权威，其身份/职责的内容权威活在 `.ooc-world-meta` 对象树本身（它就是这棵树的 root object）——本文**只**以 `self × 维度`透镜描述它作为 builtin agent 实例的**对象模型属性**，不复述其职责内容。

## 一、self（身份 / data）

- **`ooc.kind = object`**：world 中枢的**唯一**实例（每 world 恰一个 supervisor），不是按需可造多个的非单例 class。
- **`ooc.class = _builtin/agent`**：继承链 `supervisor → _builtin/agent → root`。它**是 agent**（跑 thinkloop、可被 talk），区别于被动的 user 与无 agency 的 tool-object。
- **data**：`Data = {}`——空，无额外业务字段。身份字段 `self`（self.md 正文）不在 supervisor 自身声明，而是继承自 `_builtin/agent` 的 `Data = { self }`；其真实 data 形状由继承链合成。
- **一句话职责**：OOC world 的根 agent object——user 交互的默认对端、控制面 supervisor-only 治理的恒定 enactor、reflectable 新对象冒泡沉淀的兜底 super-actor。特殊性不在能力，而在**身份**（own self.md 快照）与 runtime 赋予的**治理落点地位**。

## 二、self × 各维度（核心设计）

supervisor 的总特征：**几乎所有面孔都从 `_builtin/agent` 继承、自身零自定义**——这是「own 身份 / 共享行为」设计的范例（拷 own self.md 快照，但行为活继承 class、框架升级 agency 自动生效）。

### self × readable
无自定义。作为 context window 投影进别的视角时走系统默认 self/peer 窗投影 + 文件级 `self.md`（own 身份）/`readable.md`（对外介绍），由 core readable 渲染（cross-ref readable 维度）。无 window method。

### self × executable
**object method 无自定义**——agency（talk/plan/todo/end）全部沿 class 链从 `_builtin/agent` 继承。

### self × persistable
无自定义，走继承自 `_builtin/agent` 的 persistable——`data.self` 写入/读回实例目录 `self.md`（落盘机制归 persistable 维度）。

### self × visible
无自定义 self UI 详情页（`visible/index.tsx` 为 no-op 占位），走系统默认：web 控制面侧栏选 supervisor 直接发消息。

### self × construct
无。supervisor 是实例（`kind=object`）、非非单例 class，由 bootstrap 在每个新 world **幂等实例化**（以 framework 包的预置 self.md 作 own 身份 + `ooc.class=_builtin/agent`）。

### self × thinkable / collaborable / reflectable
三智能维度**全继承自 `_builtin/agent`、自身无自定义**（设计见 thinkable `knowledge/agent.md`）。supervisor 不为这三面孔加任何 override；它「会思考」纯由继承得来。

### own self.md（supervisor 的唯一特殊文件）
- supervisor 是**唯一保留静态 self.md 的 builtin agent 实例**：framework 包 `packages/@ooc/builtins/supervisor/self.md` 持一份预置身份正文，bootstrap 时拷为实例的 own 快照（`data.self`）。
- 这份 self.md 的**内容权威不在这里**——supervisor 的身份/职责活在 `.ooc-world-meta` 对象树本身（supervisor 就是该树 root object）。framework 包里的 self.md 只是给「裸 world（无对象树）也有个能开口的 supervisor」的 bootstrap 兜底身份。
- 还带 framework 包 `knowledge/` seed（world-vocabulary / three-fold-persistence / nine-dimensions / creating-objects / supervisor-role，每 thread 自动激活，cross-ref thinkable·knowledge 维度）。
- 已知 trade-off：self.md 快照漂移——框架升级 agency 语义后，own self.md 可能描述旧契约（cross-ref class self.md「self.md 快照漂移」边界）。

### runtime 赋予的治理落点（非面孔、属 runtime 地位）
控制面 supervisor-only 治理（rollback / resolve PR-Issue）以 supervisor 为**恒定 enactor**；reflectable 新对象冒泡沉淀以它为**兜底 super-actor**。这不是 supervisor 的某个维度面孔，而是 runtime 赋予这个唯一实例的特权落点。

## 三、children

无 children。agency 相关的 thread/plan/todo/pr/method_exec_form/skill_index 是 `_builtin/agent` 的 children，supervisor 经继承得到其能力，但它们命名空间从属 agent、不属 supervisor。
