---
title: supervisor — 顶层 OOC agent 实例（继承 _builtin/agent，唯一保留静态 self.md 的预置实例）
description: builtin supervisor 家族的单一权威定义：kind=object、继承 _builtin/agent、空 data、agency 全继承（无自定义 method）、own self.md 快照、控制面治理特权落点。其身份/职责的内容权威活在 .ooc-world-meta 对象树本身，本文只描述它作为 builtin agent 实例的对象模型属性
activates_on:
  "object::root": "show_description"
---

# supervisor

> 顶层 OOC agent 实例——OOC world 的根 parent object、控制面治理动作（rollback / resolve PR-Issue）的恒定落点、reflectable 冒泡兜底 actor，也是 world 默认 talk 入口。
> 对象模型（class/object、单例·非单例、construct、继承、children、投影、agent 分层）见 `class/knowledge/object-model.md`，本文不复述模型。
> **范围界定**：supervisor 作为「OOC 该是什么」的设计权威，其身份/职责的内容权威活在 `.ooc-world-meta` 对象树本身（它就是这棵树的 root object）——本文**只**描述它作为 builtin agent 实例的**对象模型属性**（kind / 继承 / data / 能力来源 / own self.md 快照 / 投影 / 治理落点），不复述其职责内容。

## 一、是什么

- **`ooc.kind = object`**：world 中枢的**唯一**实例（每 world 恰一个 supervisor），不是按需可造多个的非单例 class。
- **`ooc.class = _builtin/agent`**：继承链 `supervisor → _builtin/agent → root`，从 `_builtin/agent` 拿到 agency（talk/plan/todo/end）+ 身份持久化（self.md），从 root 拿到基类能力。它**是 agent**（跑 thinkloop、可被 talk），区别于被动的 user 与无 agency 的 tool-object。
- **一句话职责**：OOC world 的根 agent object——user 交互的默认对端、控制面 supervisor-only 治理动作的恒定 enactor、reflectable 新对象冒泡沉淀的兜底 super-actor。其特殊性不在能力（业务能力全继承自 `_builtin/agent`、自身无自定义 method），而在**身份**（own self.md 快照）与 runtime 赋予的**治理落点地位**。

## 二、data

- `Data = {}`——空，无额外业务字段。
- 身份字段 `self`（self.md 正文）不在 supervisor 自身声明，而是继承自 `_builtin/agent` 的 `Data = { self: string }`。supervisor 的真实 data 形状由继承链合成。

## 三、能力

- **object method**：无自定义。agency（talk/plan/todo/end）全部沿 class 链从 `_builtin/agent` 继承。这是「own 身份 / 共享行为」设计的范例——supervisor 拷 own self.md 快照，但方法活继承 class、框架升级 agency 自动生效。
- **window method**：无自定义。
- **投影**：作为 context window 投影进别的视角时，走系统默认 self/peer 窗投影 + 文件级 `self.md`（own 身份）/`readable.md`（对外介绍），由 core readable 渲染（cross-ref readable 维度）。
- **visible**：无自定义 self UI 详情页，走系统默认（web 控制面侧栏选 supervisor 直接发消息）。
- **persistable**：无自定义，走继承自 `_builtin/agent` 的 persistable——`data.self` 写入/读回实例目录 self.md。
- **construct**：无。supervisor 是实例（`kind=object`）、非非单例 class，由 bootstrap 在每个新 world 幂等实例化（以 framework 包的预置 self.md 作 own 身份 + `ooc.class=_builtin/agent`）。

### own self.md（supervisor 的唯一特殊文件）

- supervisor 是**唯一保留静态 self.md 的 builtin agent 实例**：framework 包 `packages/@ooc/builtins/supervisor/self.md` 持一份预置身份正文，bootstrap 时拷为实例的 own 快照（`data.self`）。
- 这份 self.md 的**内容权威不在这里**——supervisor 的身份/职责活在 `.ooc-world-meta` 对象树本身（supervisor `self.md` + `knowledge/` + 各 `children/<dim>/`）。framework 包里的 self.md 只是给「裸 world（无对象树）也有个能开口的 supervisor」的 bootstrap 兜底身份。
- supervisor 还带 framework 包 `knowledge/`（seed knowledge：world-vocabulary / three-fold-persistence / nine-dimensions / creating-objects / supervisor-role，每 thread 自动激活，cross-ref thinkable·knowledge 维度）。
- 已知 trade-off：self.md 快照漂移——框架升级 agency 语义后，own self.md 可能描述旧契约（cross-ref class self.md「self.md 快照漂移」边界）。

## 四、children

无 children。agency 相关的 thread/plan/todo/pr/method_exec_form/skill_index 是 `_builtin/agent` 的 children，supervisor 经继承得到其能力，但它们命名空间从属 agent、不属 supervisor。
