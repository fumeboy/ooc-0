---
title: 合理的 context 结构（构成规范）
description: context 应当如何构成的规范态——分层职责、类型/实例边界、预算口径；与 context-construction.md（现状）配对，差距即演化方向
activates_on:
  "object::root": "show_description"
---

# 合理的 context 结构

这是**规范态**：context 应该长什么样。现状怎么构造见 [[context-construction]]，两篇配对——它们的差距就是我（thinkable）的演化方向。

## 第一原则：context 是稀缺资源，每 token 都要承载当前决策所需的信息

LLM 每轮只能在有限窗口里决策。context 的好坏由两条轴度量：

1. **信息密度** = 真信息（身份 / 知识正文 / 实例状态 / 过程）占总量的比例。结构壳、重复、空节点都是水分。
2. **类型/实例正确性** = 类型级事实只声明一次，实例只携带自己独有的东西。这是 OO 的本分，也是 OOC「Object 化 context」的题中之义——一个 class 的方法表不会抄在它每个实例上。

> 实测一份代表性 thread（self + creator do + do/talk + plan + todo + 一个 method_exec form）：~22k 字符 context 里，真信息（knowledge 正文）只占 ~26%，`<methods>` 方法菜单占 ~50%，其中 ~28% 是逐 window 的**纯重复拷贝**。这份规范要把这两条轴都拉回来。

## 分层职责（各层只做一件事，不越界）

context 自上而下分六层，每层的纳入判据不同：

### 1. 固定协议层 —— 最小常驻

只放**无条件、与任务无关**的协议常量。`interaction-core`（你是谁 / 私有思考空间 / exec·close·wait 三原语 / 工具调用规则）属于此层，合理常驻。

判据：**「不管 agent 干什么，每轮都必需」才进此层。** 情境性协议——`forms`（只在有 method_exec form 时需要）、`self-evolution`（只在 super flow 需要）、`talk-and-super`（只在有 talk 时需要）——**不属于此层**，下沉到知识层按 intent 激活（机制见 [[knowledge-activation]]，activator 已具备，无需新增）。常驻协议越少越好。

### 2. 类型声明层 —— 声明一次（context 优化的核心）

每个在本轮 context 中**出现过的 window type**，其方法契约（method 名 + brief + 必填 `<arg name type required>` 参数契约，见 executable 维度 method-and-constructor）在此层**声明一次**。exec 的调用约定（`exec(window_id, method, args)`）也在此层说一次。

判据：**方法契约是类型级事实，与具体实例无关，因此每个 type 声明一次，而非每个实例抄一遍。** 实例层只引用类型。

> 这是 P0：现状把类型级菜单按实例渲染——8 个 knowledge window 各自完整渲染了一模一样的 4 方法菜单，exec hint 那句常量逐 window 重复 14 次。归一化后「首份之外的重复 = 总量 28%」是纯水分。
>
> 代价交代（这是 trade 不是免费午餐）：声明一次后，LLM 要做一次「window w_123 是 knowledge type → 支持上面声明的方法」的 type→instance 映射。对模型这是 trivial 且可靠的推理，28% 的省量远超它。
>
> 分组粒度（关键约束）：按**实际可见的方法集**分组，而非光按 type 名。creator do_window 与 child do_window 可能因权限差异（creator 的 close 被拒）渲染出不同方法集——分组要认这个差异，否则会抹掉它。同方法集才合并声明。

### 3. 实例层 —— 只带实例独有的东西

每个 `<window>` 只渲染：`id` + `type` 引用 + **实例独有状态**（do/talk 的 transcript、plan 的 steps、todo 的 content、form 的 args/fill_state、self-evolution 的进度）。**不重复方法菜单**（已在类型声明层）。

判据：**「换一个同 type 的实例，这段会不会变」——会变才进实例层，不变的归类型声明层。**

无空壳：零信息节点不渲染。现状里 self 对象窗口是 140 字符空壳（只有 title，身份正文走 instructions）、空的 `<transcript_viewport>` / `<target>` / `<conversation_id>` 都是结构噪声，应省。身份既然走 instructions，`<self object_id/>` 保留对外标记即可，不另起一个无内容的 self window。

### 4. 知识层 —— 按需激活，受控上限

activator 知识按 `activates_on` intent 激活（seed + sediment 双源，上限受控）。**一个事实一个家**：同一信息不在两处表述。

> 现状 `root-methods` knowledge 用表格列了 do/talk/program… 的用途，而这些 method 的 brief 又在类型声明层逐条出现——同一批方法的用途说了两次。规范：留类型声明层的 brief（贴着调用点），删 root-methods 表里与之重叠的部分；root-methods 若仍要存在，只保留「索引 + 何时用哪条」这类菜单 brief 不承载的元信息。

### 5. 过程层 —— transcript

历史 ProcessEvent 流（`processEventToItems` 映射），表达「这个 thread 经历过什么」。规则不变（见 [[context-construction]]）：reasoning 不复喂、call_started 不进 transcript、`_foldedBy` 折叠走 events_summary。

### 6. 预算与可见性 —— 正确的稀缺资源分配

相关性排序纳入/排除的大方向对，但口径要修正为：

- **估算锚渲染输出，不锚序列化对象**。token 估算应基于 LLM 实际看到的渲染文本，而非 `JSON.stringify(window)`（后者含未渲染字段 + JSON 结构字符，估的不是真成本）。
- **单位口径统一**。soft / hard 阈值必须同单位、且 soft < hard 成比例；不能 soft 按字符、hard 按 token 各算各的。
- **overflow 前先优雅降级**。系统已有 compressLevel 1/2 渐进压缩档——超预算应**先把低相关 window 压一档**，压无可压再踢进 overflow，而非一步二元丢弃。降级是已有杠杆，预算该用上。
- **结构必需窗口 pin**。creator window、当前操作的 form 等「结构上不可缺」的窗口给保护位，不因 score 波动被挤进 overflow。
- **被裁的仍可见**（silent-swallow ban 保留）：overflow 的窗口在 `<context_overflow>` 留摘要行。

## 一句话规范

**固定协议最小常驻 → 类型契约声明一次 → 实例只带自己独有 → 知识按 intent 激活、一个事实一个家 → 预算锚真实渲染成本、降级先于丢弃。** 落到量化目标：真信息占比从 ~26% 拉高，方法菜单从 ~50%（含 28% 重复）降到「每 type 一份」，整体可压缩约 1/4–1/3 而不损失任何 LLM 决策所需信息。

## 与现状的差距（即演化方向）

| 层 | 规范 | 现状（[[context-construction]]） | 差距 |
|---|---|---|---|
| 协议 | 仅无条件必需常驻 | 7 条 protocol 多数常驻 | 情境协议下沉 intent 激活 |
| 类型声明 | 每 type 一份 | 每实例抄一遍（28% 重复） | **P0：菜单 type 级去重** |
| 实例 | 只带独有 + 无空壳 | 有 140 字符空壳 self window 等 | 清空节点 |
| 知识 | 一个事实一个家 | root-methods 表与菜单 brief 重叠 | 去重叠 |
| 预算 | 锚渲染 / 同单位 / 先降级 / pin 必需 | 锚 JSON 序列化 / soft·hard 疑似异单位 / 二元丢弃 / 不 pin | 修四处口径 |

骨架（window 对象化、相关性预算、intent 激活）是对的，问题集中在「类型级事实被实例化复制」与「预算估算口径」这两类执行细节——都是熵减型修正，不需要新增机制。
