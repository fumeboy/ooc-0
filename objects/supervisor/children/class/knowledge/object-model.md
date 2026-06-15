---
title: OOC 对象模型（class / object / 继承 / 单例·非单例 / context window / children / agent 分层）
description: class 维度关于 OOC 对象模型的单一权威——核心设计 + 派生设计 + 细节补充 + 模拟推演；class=self.md/readable/executable/visible/persistable/types.ts，object=class 实例 + 运行时 data
activates_on:
  "object::root": "show_description"
---

# OOC 对象模型

> 本篇是 class 维度关于**「OOC 里 object / class 是什么、怎么继承、怎么组合、怎么分层」**的**单一权威**。
> class / object 模型原先散落在 sibling knowledge 的旧文档已全部吸收完毕并删除；class vs object（一等平级、唯一继承）的设计落在 `class/self.md`，本篇是对象模型整体的单一权威。
> 与 context.md（thinkable·context 的权威）是**平级关系**：context.md 讲"object 投影到 context 后怎么构造成 LLM 输入"，本篇讲"object / class 自身是什么"；class-dynamic（投影 class 不持久化、按视角算）的设计归 context.md，本篇只声明其前提。

## 编辑规范

维护本文须守以下规范，使其长期高内聚、低耦合、不漂移：

1. **单一权威**：OOC 对象模型只此一处。新增/变更先改本文、再改代码；散落的旧 class 知识吸收进来即删，不另起平行文档。
2. **四段结构**：① 核心设计（原子原则，逐条编号、一句一条、相互正交）；② 派生设计（核心组合后涌现的能力，不引入新原则）；③ 细节补充（字段/接口/寻址/边界）；④ 模拟推演（把模型放进真实运行时场景，暴露并收敛缺口）。新内容按归属入段，不混段。
3. **高内聚低耦合（依赖倒置）**：本文只讲对象模型自身 + 它**对外暴露的接口**；**不讲其他维度怎么实现**（持久化布局归 persistable、投影构造归 context.md、UI 渲染归 visible……一律"由 X 维度按接口实现，对象模型不耦合"）。
4. **描述设计与接口、非实现走查**：讲"是什么/为什么/契约"，不逐函数走查；代码锚点仅在确有必要时给。
5. **精炼标准语言**：一句话能说清不写三句；术语统一（class/object；单例/非单例；constructor；IS-A 继承 / HAS-A 组合；`ooc.kind`/`ooc.class`）。
6. **旧概念单独标注**：与旧实现的差异/迁移放「迁移映射」，明确标"非设计"，不混进核心。
7. **自洽**：任何改动须与全文不矛盾（核心各条之间、核心与派生之间），也不得与 context.md / persistable 权威冲突；发现矛盾先修设计再落文字。

---

## 一、核心设计

1. **一切是 object；class 是定义，object 是实例**。
   **class** 由这几件构成：
   - **`self.md`** —— 身份正文：这个 object 是谁、负责什么。加载为 LLM 的 **instructions**（权重高于 system message，唯一身份来源）。
   - **`readable`**（`readable.ts` / `readable/index.ts` / `readable.md`）—— 它**作为 context window 怎么向 LLM 展示**：渲染什么内容、按视角算出什么 class、提供哪些 window method。
   - **`executable`**（`executable/index.ts`）—— 它的 **object method**。
   - **`visible`**（`visible/index.tsx`）—— 它向 OOC 系统用户提供 UI 界面。
   - **`persistable`**（`persistable/index.ts`）—— 它的**自定义持久化逻辑**（缺省走系统默认）。
   - **`types.ts`** —— 定义该 class 的 **data 结构**（object 运行时数据的类型）；非单例 class 还在此导出 **constructor**（见核心 3）。
   - 可选 **`common/`** —— 放公用的程序函数。

   **object** = 某 class 的实例，持运行时 **data**（结构由 `types.ts` 定义；如何序列化见核心 7）。

2. **继承形成单链**：object 经 `ooc.class` 继承一个 class；class 也可以继承另一个 class；逐级向上形成一条**继承链**（单继承——每个节点至多一个父）。自身未定义的部分沿链回退到最近的提供者。

3. **class 分单例 / 非单例**：
   - **非单例 class**：可复用模板，在 `types.ts` 导出 **constructor** 函数用于构造 object 实例；可被继承。
   - **单例 class**：恰一个实例——object 一旦**自定义自己的函数方法**（持自己的 自定义程序逻辑），就成为**自身 class 的单例**（object 即 class）；单例 class **不可被继承**。

4. **object 在 LLM 视角下呈现为 context window**：context window 向 LLM 展示 object 的**内容**与它**具有的方法**；如何把 object 构造成 context window，由 object 的 **readable** 控制。
   readable 还可额外提供 **window method**，用于调节窗口信息展示的**程度**（详细 / 部分 / 总结 / 压缩）。**window method 只控制 window 的信息展示，不影响 object 行为、不改变 object 数据**。

5. **object method 由 executable 实现**：区别于 window method（核心 4），object method **可改变 object 数据、可产生副作用**。

6. **object 经 visible 自定义 UI 界面**：UI 可**请求** object 的 object method；被请求的 object method 须标记 **`for_ui_access`**。

7. **持久化可自定义**：object 经自定义 **persistable** 程序控制自己的**序列化目录与序列化方式**；未自定义则走**系统默认**持久化。

8. **children = 命名空间从属、不继承**：ooc class 可有 children class，ooc object 可有 children object；children **从属于 parent、但不继承 parent**——只是命名空间上 children 的 id 以 parent id 为前缀（`parent_id/child_id`）。

9. **ooc agent = 继承 object base class 的 ooc class**：在 readable / executable / visible / persistable 之上，额外具备 **thinkable / collaborable / reflectable**。agent 持名为 **`talk`** 的 object method——执行即创建一条 **thread**，thread 内运行 LLM 的 **thinkloop**，以此实现 agent 的智能。

> 核心设计 9 条已逐条与用户敲定（仿 context.md 听写/grill 流程）。**系统自带 builtin class/object 的清单索引见 supervisor `knowledge/builtins.md`**（高内聚低耦合：本文只讲对象模型、不列具体 builtin）。派生设计 / 细节补充 / 模拟推演待补。

---

## 二、派生设计

*(待核心设计定稿后补——核心组合涌现的能力，不引入新原则。)*

---

## 三、细节补充

- **`ooc.kind`（class / object 标识）**：`package.json` 的 `ooc.kind` 声明这份 stone **是 ooc class 还是 ooc object**——`"class"` 是一份**类定义**（单例与非单例皆是 class，区别在是否有 constructor，见核心 3）；缺省 / `"object"` 是一个具体**实例**。与 `ooc.class`（声明继承谁）正交：`kind` 答「我是类还是实例」，`class` 答「我继承谁」。逐文件定义骨架见 sibling `example.md`。
- **`_builtin/<id>` 寻址**：框架 builtin class 以 `_builtin/<id>` 寻址，五件套读自运行进程的 `@ooc/builtins/<id>` 包（不 vendor 进 world）；bare id 解析回 world 的 `objects/<id>`、与 class 磁盘分离。详见 `class/self.md`「寻址」段。
- *(其余待补：`ooc.class` 字段语义、constructor 注册接口、同名辨析等。组合成员经 thread-as-object 构造时的初始 context 表达，归 thinkable·thread，不在 `package.json` 设字段。)*

---

## 四、模拟推演

*(待核心设计定稿后补——open_file 全链路 / agent vs tool-object 边界 / thread 作为 object 的持久化 / builtin 实例化 own 身份 / 跨视角投影，逐 case 暴露设计 gap。)*

---

## 迁移映射（非设计 / 旧）

- **`instantiate_with_new_world` 已废弃**：原设计把框架 builtin 做成 **class**，并经 `package.json` 的 `ooc.instantiate_with_new_world=true` 在每个新 world bootstrap 时把 class 的 self.md 拷进 `objects/<id>`、自动实例化出一个 object 副本（supervisor 即此类）。**现已废弃**——一份 stone 直接由 `ooc.kind` 声明自身是 class 还是 object，不再走「class→每 world 自动实例化成 object」这条路。**supervisor 由此改为直接的 ooc object（`ooc.kind=object`）**，不再是 class + 自动实例化。代码 `packages/@ooc/core/app/server/bootstrap/instantiate-classes.ts` 的旧 flag 待回流移除。
