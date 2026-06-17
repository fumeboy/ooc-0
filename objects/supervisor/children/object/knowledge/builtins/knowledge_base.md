---
title: knowledge_base — agent 持有的知识库 tool-object（open_knowledge 把一篇 doc pin 成 knowledge 窗）
description: builtin 家族 knowledge_base 的单一权威——以 self × 各维度 透视：self 是空 data 的纯委托单例；self × executable 唯一 object method open_knowledge 委托 child knowledge 的 construct 实例化一个 knowledge context window；child knowledge 是非单例 class，其实例 = 一个 knowledge 窗，按 trigger 激活进 context（激活机制见 thinkable）
activates_on:
  "object::root": "show_description"
---

# knowledge_base

> agent 组合持有的单例 tool-object 成员——可查询的知识存储；`open_knowledge` 把一篇 knowledge doc 作为 `knowledge` 窗引入 context。
> 对象模型（class/object、单例/非单例、construct、继承/组合、children 命名空间、self 与各维度的关系）见 class `knowledge/object-model.md`，本文不复述。

## 一、self（身份 / data）

- **id `_builtin/knowledge_base`**，`kind=class`；隐式继承 `_builtin/root`。
- **单例 tool-object**（无 construct，一个 world 一份知识库）：被 agent 组合持有、被 exec。
- **data 空**——无业务字段（单例纯委托 tool-object）。
- **一句话职责**：agent 的知识存储入口，提供 `open_knowledge` 把知识索引里的一篇 doc 显式 pin 成一个 `knowledge` 窗、使其常驻 context。它自身是入口/委托类，「一篇知识 = 一个窗」由 child `knowledge` 承载——故 store 成员名为 `knowledge_base`、窗类型名为 `knowledge`。

## 二、self × 各维度（核心设计）

### self × executable —— 唯一一个委托型 object method

`open_knowledge`——按 path pin 一篇 knowledge doc 进 context。**纯委托**：实例化一个 child `knowledge`（args 含 path）并返回其 id，path 解析/校验下放给 child 的 construct。无 `for_ui_access`。

### self × readable —— 投影成静态身份窗

`class: "knowledge_base"`，content 只渲染一段身份/用途说明；window 声明 `object_methods: ["open_knowledge"]`。**window method 无**（tool-object 成员不持展示态）。

### self × construct —— 无（单例）

一个 world 一份知识库，不被构造出新实例。

### self × visible —— 默认

无自定义 UI。

### self × persistable —— 默认

无自定义序列化。

## 三、children

### `_builtin/knowledge_base/knowledge`（class，知识条目窗类型）

- **self**：`kind=class`，**非单例**（有 construct）；命名空间从属 knowledge_base、隐式继承 `_builtin/root`。data：`path`（索引路径，不带 .md）+ `source`（`explicit`/`protocol`/`activator`/`relation` 四类来源，缺省 explicit）+ `body`（合成来源自带正文）+ `presentation`（`full`/`summary`）+ `description`。**职责**：一篇 knowledge 文本作为 context window 的形态——其实例即一个 `knowledge` 窗（注册一个窗类型 ≡ 注册一个非单例 class）；按 trigger 激活进 context、完成即卸载（激活机制归 thinkable，见 `thinkable/knowledge/knowledge-activation.md`）。
- **self × construct**（`open_knowledge` 的真正实现）：args `{path}`；经知识索引校验 path 存在（不存在/缺 path 均 fail-loud），产出 `{path, source:"explicit"}` 初始 data。
- **self × executable**：`reload`（loader 按 mtime 自动失效，此为语义提示）、`close`（关闭 explicit 窗；protocol/activator 来源不可 close）。
- **self × readable**：`class:"knowledge"`，按 source 分支渲染（protocol/activator(full) 直渲 body；activator(summary) 仅 description；explicit 回退索引拉正文），正文按 viewport 切片 + 截断。window method `set_viewport`——只调投影态 viewport，不碰 data、不产副作用。
- **self × visible**：自定义详情面板（path/source/presentation/description + markdown body）+ frontmatter/body 字段级 diff。
- **self × persistable**：默认。
