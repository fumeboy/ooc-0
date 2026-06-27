---
title: builtin class / object 索引
description: OOC 系统自带的 builtin class/object 清单 + 命名空间层级（parent/children）+ 各自 kind；对象模型见 object/self.md
activates_on:
  "object::root": "show_description"
---

# builtin class / object 索引

> 索引 OOC 系统自带、实现基础系统功能的 builtin。**对象模型本身**（class/object、单例/非单例、construct、`ooc.class` 单跳实例 binding、children 命名空间、agent 分层）见 `object/self.md`——本文只回答「系统有哪些 builtin、各自职责、id 与层级」，不复述模型（高内聚低耦合）。
>
> 约定：`kind`（class=定义 / object=实例，见对象模型细节补充）；**children 命名空间从属**（id 以 parent id 为前缀 `_builtin/<parent>/<child>`，物理在 `<parent>/children/<child>/`；children 不继承 parent，仅命名空间从属——对象模型核心 9）。`self.md` 只属 ooc **agent 实例**（对象模型核心 10）——class 定义（`_builtin/agent` / 各工具 class）与非 agent 单例 object（工具 object）**均不持** self.md；builtin 家族中唯一持 self.md 的实例是 supervisor。注：纯实例 object（无 `index.ts`）若是 agent 实例仍可有 self.md（核心 1）——本约束针对 builtin 范围内。

## agent class

- **`_builtin/agent`**（class）—— OOC agent 的类：在 class 标准具备的 readable / executable / visible / persistable 之上，额外具 thinkable / collaborable / reflectable（设计见 thinkable `knowledge/agent.md`）。持 `talk`/`plan`/`todo`/`end` agency + 身份 `self`（persistable 写实例目录 self.md）。object 经 `ooc.class=_builtin/agent` 继承它即成 agent 实例。

## agent 的 children（`_builtin/agent/<child>`）

- **`thread`**（class）—— agent 一次智能运行的载体（`talk` 创建、跑 thinkloop）；唯一会话载体 class，按视角投影成 default + super 二种 window class（issue E 简化）。
- **`plan`**（class）—— 任务结构化。
- **`todo`**（class）—— 待办项（`mark_done` 标记完成）。
- **`skill_index`**（class，派生注入、无 construct）—— 技能索引（每 thread 由 synthesizer 派生注入）。
- **`pr`**（class）—— reviewer 评审窗（reflectable；runtime 投递创建）。
- **`method_exec_form`**（class）—— 方法执行表单（method 参数收集形态的类型归位；form 机制本身 deferred）。

## tool-object（单例 object，被 agent exec；各带 children）

- **`_builtin/filesystem`**（object）—— 文件系统接入；方法 grep/glob/open_file/write_file。
  - children：**`file`**（class，文件窗）、**`search`**（class，搜索结果窗）。
- **`_builtin/interpreter`**（object）—— ts/js 解释器；方法 run。
  - children：**`interpreter_process`**（class，sandbox 进程 + history）。
- **`_builtin/terminal`**（object）—— bash 终端；方法 run。
  - children：**`terminal_process`**（class，bash 进程）。
- **`_builtin/feishu_app`**（object，单例 + 继承 agent）—— 飞书应用接入点；方法 open_chat/open_doc + `active` 钩起 lark event relay（class 级 long-lived service，issue P 取代旧 init）。
  - children：**`feishu_chat`**（class，飞书会话窗）、**`feishu_doc`**（class，飞书文档窗）。
- **`_builtin/knowledge_base`**（object，单例）—— 知识库接入；方法 open_knowledge。
  - children：**`knowledge`**（class，知识条目窗；按 trigger 激活进 context，激活机制见 thinkable `knowledge/` 维度）。
- **`_builtin/runtime`**（class）—— 向 agent 提供系统级接口（如 create_object）。

## 实例 object

- **`supervisor`**（object，`ooc.class=_builtin/agent`）—— 顶层 **OOC agent 实例**（统筹各维度子对象）；唯一保留静态 self.md 的预置 agent 实例。
- **`user`**（object）—— 代表人类用户的**被动 object**：不跑 thinkloop，是 agent `talk` 的对端。

## 其它

- **`_builtin/example`**（class）—— 建 class 时照抄的样板（演示 construct / object method / readable / persistable / types，非真实功能对象）。

> 说明：`runtime` 当前 `kind=class`（单例未定）——提供系统接入方法、被 agent 组合持有；若后续确认单例则可改 `kind=object`。`knowledge_base` 已确认单例 → `kind=object`（与 filesystem/interpreter/terminal 一致）。**`super` 是 thread 在 super flow 视角下的投影 class、非注册 class**（原 `reflect_request` 概念已整体退役改为 `super` 投影，见对象模型 + thinkable `knowledge/thread.md` + issue E）。
