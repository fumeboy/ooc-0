# object — OOC 系统 对象结构 的设计师

# OOC 对象模型

> 本篇是 class 维度关于**「OOC 里 object / class 是什么、怎么继承、怎么组合、怎么分层」**的**单一权威**。

## 编辑规范

维护本文须守以下规范，使其长期高内聚、低耦合、不漂移：

1. **单一权威**：OOC 对象模型只此一处。新增/变更先改本文、再改代码；散落的旧 class 知识吸收进来即删，不另起平行文档。
2. **四段结构**：① 核心设计（原子原则，逐条编号、一句一条、相互正交）；② 派生设计（核心组合后涌现的能力，不引入新原则）；③ 细节补充（字段/接口/寻址/边界）；④ 模拟推演（把模型放进真实运行时场景，暴露并收敛缺口）。新内容按归属入段，不混段。
3. **高内聚低耦合**：本文只讲对象模型自身 + 它**对外暴露的接口**；**不讲其他维度怎么实现**。
4. **描述设计与接口、非实现走查**：讲"是什么/为什么/契约"，不逐函数走查；代码锚点仅在确有必要时给。
5. **精炼标准语言**：一句话能说清不写三句；术语统一
6. **旧概念单独标注**：与旧实现的差异/迁移放「迁移映射」，明确标"非设计"，不混进核心。
7. **自洽**：任何改动须与全文不矛盾（核心各条之间、核心与派生之间），也不得与其他权威冲突；发现矛盾先修设计再落文字。

---

## 一、核心设计

1. **一切是 object；class 是定义，object 是实例**。
   **class** 由这几件构成：
   - **`readable`**（`readable.ts` / `readable/index.ts` / `readable.md`）—— 它**作为 context window 怎么向 LLM 展示**：渲染什么内容、按视角算出什么 class、提供哪些 window method。
   - **`executable`**（`executable/index.ts`）—— 它的 **object method**。
   - **`visible`**（`visible/index.tsx`）—— 它向 OOC 系统用户提供 UI 界面。
   - **`persistable`**（`persistable/index.ts`）—— 它的**自定义持久化逻辑**（缺省走系统默认）。
   - **`index.ts`** —— class 的**后端程序路由**（不含 visible 前端）：`export const Class = { construct?, executable, readable, persistable }`，把各维度的程序入口收口在一处；非单例 class 在此注册 **construct**（见核心 3）。槽名是 `construct` 不是 `constructor`——JS `Object.prototype.constructor` 会遮蔽后者（`({}).constructor === Object` 恒真），单例就无法被识别。
   - **`types.ts`** —— 定义该 class 的 **object data 结构**（object 自身运行时数据的类型；**不是** window 投影结构，见核心 4）。
   - 可选 **`common/`** —— 放公用的程序函数。

   **object** = 某 class 的实例，持运行时 **data**（结构由 `types.ts` 定义；如何序列化见核心 7）。

2. **OOC Class 不支持继承**：ooc object 可以经 `ooc.class` 继承一个 class；但 class 本身不可以继续继承另一个 class；如果需要复用程序，可以通过 import 目标 class export 的函数、方法的方式。

3. **class 分单例 / 非单例**：
   - **非单例 class**：可复用模板，在 `index.ts` 的 `Class.construct` 注册 **construct**（`exec(args)` 产出新 object 实例的初始 data）；可被继承。
   - **单例 class**：恰一个实例——object 一旦**自定义自己的函数方法**（持自己的 自定义程序逻辑），就成为**自身 class 的单例**（object 即 class）；单例 class **不可被继承**。

4. **object 在 LLM 视角下呈现为 context window**：object 持自身 **data**（核心 1 的 `types.ts`），由 object 的 **readable** 把 data **投影**成 context window——按视角动态算出 window 的 class 与展示内容，并声明该 window 展示哪些 object method。window 的投影态（如 viewport）与 object data **分离**。
   readable 还可提供 **window method** 调节展示**程度**（详细 / 部分 / 总结 / 压缩）：window method **只动 window 投影态、返回新的 window 状态对象**（不可变），不影响 object 行为、不改变 object data。

5. **object method 由 executable 实现**：区别于 window method（核心 4），object method **可改变 object 数据、可产生副作用**。

6. **object 经 visible 自定义 UI 界面**：UI 可**请求** object 的 object method；被请求的 object method 须标记 **`for_ui_access`**。

7. **持久化可自定义**：object 经自定义 **persistable** 程序控制自己的**序列化目录与序列化方式**；未自定义则走**系统默认**持久化。

8. **children = 命名空间从属、不继承**：ooc class 可有 children class，ooc object 可有 children object；children **从属于 parent、但不继承 parent**——只是命名空间上 children 的 id 以 parent id 为前缀（`parent_id/child_id`）。

9. **ooc agent = ooc object with LLM**：在 readable / executable / visible / persistable 之上，额外具备 **thinkable / collaborable / reflectable**。agent 持名为 **`talk`** 的 object method——执行即创建一条 **thread**，thread 内运行 LLM 的 **thinkloop**，以此实现 agent 的智能。
   **`self.md` 是 agent 实例独有的身份**：agent 的 data 含一个 `self` 字段（身份正文文本），由 agent 的 persistable 写入/读回实例目录的 `self.md`、并加载为该 agent thinkloop 的 **instructions**。非 agent 的 object（工具 object、class 定义）没有 self.md。

> 核心设计 9 条已逐条与用户敲定（仿 context.md 听写/grill 流程）。**系统自带 builtin class/object 的清单索引见 supervisor `knowledge/builtins.md`**（高内聚低耦合：本文只讲对象模型、不列具体 builtin）。派生设计 / 细节补充 / 模拟推演待补。

---

## 二、派生设计


---

## 三、细节补充

---

## 四、模拟推演


---

## 迁移映射（非设计 / 旧）
