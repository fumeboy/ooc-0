---
title: builtin class / object 索引
description: OOC 系统自带的 builtin class（基类 + 非单例模板）与 builtin object（单例：tool-object / user / supervisor）清单；对象模型见 class/knowledge/object-model.md
activates_on:
  "object::root": "show_description"
---

# builtin class / object 索引

> 索引 OOC 系统自带、用于实现基础系统功能的 builtin class / object。**对象模型本身**（class/object、单例/非单例、constructor、继承、agent 分层）见 class 维度 `knowledge/object-model.md`——本文只回答「系统有哪些 builtin、各自职责」，不复述模型（高内聚低耦合）。

## builtin class（基类 + 非单例模板）

- **`ooc object base`** —— 所有 object 的基类（readable / executable / visible / persistable）。
- **`ooc agent`** —— 继承 object base，额外具 thinkable / collaborable / reflectable（设计见 thinkable `knowledge/agent.md`）。
- **`thread`** —— agent 一次智能运行的单元（`talk` 创建、跑 thinkloop）。
- **`plan`** —— 任务结构化。
- **`todo`** —— 待办项。
- **`knowledge`** —— 知识条目（按 trigger 激活进 context 的 knowledge 窗实例；激活机制见 thinkable `knowledge/knowledge-activation.md`）。
- **`method_exec_form`** —— 方法执行表单（method_exec 窗）。
- **`pr`** —— reviewer 评审窗（reflectable）。
- **`reflect_request`** —— 反思会话 / 沉淀（reflectable）。
- **`file`** —— 文件（由 `filesystem` 构造）。
- **`terminal_process`** —— bash 进程（由 `terminal` 构造）。
- **`interpreter_process`** —— ts/js 进程（由 `interpreter` 构造）。

## builtin object（单例 builtin object）

tool-object（被 exec、非 agent）：
- **`filesystem`** —— 提供方法创建 / 读取 / 编辑 / 删除 `file`。
- **`terminal`** —— 提供方法创建 `terminal_process` 执行 bash 脚本程序。
- **`interpreter`** —— 提供方法创建 `interpreter_process` 执行 ts/js 脚本程序。
- **`runtime`** —— 向 Agent 提供系统级接口（如 create object）。
- **`knowledge_base`** —— 提供知识访问方法（如 open_knowledge）。

其它：
- **`user`** —— 代表人类用户的**被动 object**：不跑 thinkloop，是 agent `talk` 的对端。
- **`supervisor`** —— 顶层 **OOC agent**（统筹各维度子对象）。
