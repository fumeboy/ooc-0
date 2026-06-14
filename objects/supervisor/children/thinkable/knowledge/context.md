---
title: context 设计（LLM 输入的构成、构造与派生能力）
description: thinkable 维度关于 context 的单一权威——核心设计(14 条) + 派生能力 + 细节补充 + cases 模拟分析；context=一组 context window；window=OOC object 在 context 的引用投影
activates_on:
  "object::root": "show_description"
---

# context 设计

> 本篇是 thinkable 维度关于 context 的**单一权威**。原 `context-construction.md`（构造现状）、`context-ideal-structure.md`（规范态）已并入此处，避免设计分散/漂移。

## 编辑规范

维护本文须守以下规范，使其长期高内聚、低耦合、不漂移：

1. **单一权威**：context 设计只此一处。新增/变更 context 设计先改本文，再改代码；不另起平行文档（避免分散）。
2. **四段结构**：① 核心设计（原子原则，逐条编号、一句一条、相互正交）；② 派生能力（核心组合后涌现的能力，不引入新原则）；③ 细节补充（接口/组装/边界）；④ cases 模拟分析（把设计放进真实运行时场景推演，暴露并收敛缺口）。新内容按归属入段，不混段。
3. **高内聚低耦合（依赖倒置）**：本文只讲 context 自身的设计 + 它**对外暴露的接口**（如 ContextWindow 接口）；**不讲其他模块怎么实现**（window 从哪来、readable 怎么解析、落盘布局……一律 "由 X 维度/层按接口实现，context 不耦合"）。
4. **描述设计与接口、非实现走查**：讲"是什么/为什么/契约"，不逐函数走查实现；代码锚点仅在确有必要时给（且只锚 context 自身代码）。
5. **精炼标准语言**：一句话能说清不写三句；术语统一（window=class、arg=type；readonly-ref/move；等）。
6. **旧概念单独标注**：与旧实现的差异/迁移放「迁移映射」一节，明确标"非设计"，不混进核心设计。
7. **自洽**：任何改动须与全文不矛盾（尤其核心设计各条之间、核心与派生之间）；发现矛盾先修设计再落文字。
8. **cases 用段落、场景说清**：第四节每个 case 用**段落**（非表格）记录——先把场景的前因后果讲清楚（谁在什么状态下做了什么、触发了什么），再点出它暴露的设计 gap 与方向。
9. **被证伪的内容即删、不留干扰**：某条 case/gap 经推敲确认**不是问题**，直接从文档删除——不保留"其实不是 gap"之类的半成品标注（那是误导后来者的垃圾信息）。结论若有价值，沉淀进相关核心设计的措辞里，而非留在第四节。

---

## 一、核心设计

1. **context 是 LLM 的输入**；context 由一组 **context window** 组成。

2. **context window 是 OOC object 在 context 中的投影**——一个对该 object 的引用。同一 OOC object 还可对应到**不同类型的 context window**：取决于视角与用途，同一对象在不同 thread 的 context 里可投影成不同形态的窗（如 thread 的两种投影，见核心 14）。

3. context window 可**挂载 method**；method 展示在 context 中，借此告诉 LLM 可以做哪些行动；LLM 经 **tool use 执行某个 method** 来行动。

4. 属于**同一 OOC class** 的 method 按 class **聚合声明一次**（声明一份、对该 class 全部实例生效），避免逐实例重复堆叠造成 context 碰撞。

5. method 分两种（对 LLM 是**同一种执行方式**）：
   - **window method**：主体是 window，只调整该 window 的信息展示。
   - **object method**：主体是 object，可改变 object 状态或影响 object 行为。

6. window method 修改 context window 的**信息展示状态**；每个 context window 带一个**状态配置块**记录该展示状态。

7. context 中这些 window 的状态配置块，**持久化**在该 OOC agent 的 `thread-context.json` 文件里。

8. OOC object 可**自定义自己作为 context window 的展示形态**——控制该窗展示什么信息、提供哪些 window method。这种自控面向 LLM 之展示的能力，称为 OOC object 的 **readable** 能力。

9. 一个 OOC agent 的一段 LLM 交互过程称为 **thread**；thread 之间（如与 user 的 thread）交流信息，通过一种名为 **talk window** 的 context window 表达。

10. 一个 thread 可同时与多个 thread 交互（context 下可有多个 talk window）；但与 **thread creator** 的交互最重要。为迎合 LLM 的 **Attention** 机制，构造 LLM input 时对 creator 的 talk window 单独处理：其余 context window 一并构造为一段 XML 文本、作为 system prompt 成为 LLM Messages 中的一条消息；而与 creator 交互的信息**直接展示在 LLM Messages 数组中**，不嵌入 system prompt 的 XML。

11. 构造 LLM Input 随 LLM Provider 略有不同。以 OpenAI 为例，LLM Messages 数组的构造模式 = **Context XML + Context Changes**：Context XML 直接从 context windows 构造；Context Changes 是 thread 执行过程中、每个 context window 内容变化时主动报告的 **event**（如 talk window 收到对方新消息，即以一条 context change event 追加到 thread）。

12. 据此分流（迎合 Attention）：构造 Context XML 时，**thread creator 的 talk window 不展示 transcript**（交互消息）。creator 的 talk window 的 context change event **完整记录消息内容**；其他 talk window 的 context change event 只**缩略**为「`<window> 收到新消息 "message content …（仅前 50 字）"`」。

13. 经 talk window 向其他 thread 发消息时，除消息文本外还可**传递 window**。window 本就是对 OOC object 的引用，故等于把 object 的引用交给对方 thread。两种模式：
    - **readonly-ref**：对方只能调该窗的 **window method**（看/调展示），不能调 object method。
    - **move**：移交所有权——对方可调 **object method**；移交后，自己持有的那个窗降为 **readonly-ref**。

14. **一条 thread 按视角投影为两种 context window**（核心 2 的"同一 object 可对应不同类型窗"在 thread 上的落地）：
    - **creator 视角 → talk window**：在 creator 的 context 里，该 thread 投影为 talk window，**只展示对话内容**（creator 与该 thread 的往来消息）。
    - **自己视角 → thread window**：在该 thread 自己的 context 里，它投影为 thread window——承载核心 10/11/12 所说的全部特殊设计（10/12 从自己视角说的"creator 的 talk window"即此 thread window）。**thread event 与 creator message 都是 thread window 的一部分**，于是这两者也一并纳入 context 预算与治理（everything is a window：原先散落的 message 流，归到了 thread window 这个收敛点）。
    - 构造 Context XML 时，thread window **只展示 methods、不展示内容**；其内容（thread event + creator 对话）展示在 LLM Messages 中（与核心 10/12 的 attention 分流一致）。

---

## 二、核心设计组合产生的派生能力

这些不是新增机制，而是上面核心设计**组合后自然涌现**的能力。

- **统一行动入口（exec / close / wait 三原语）**：一切行动都是「在某 window 上 exec 一个 method」（核心 3+5）；`close` 关窗、`wait` 声明等待。`compress`（信息压缩）**不是原语**——它是"调整信息展示"的 **window method**（核心 6，与 file 窗 `set_viewport` 同类），经 `exec(method="compress")` 调。**稳定原语恒为 3 个**：`exec` / `close` / `wait`。

- **everything is a window**：会话（talk）、子线程、知识、文件、程序、乃至 agent 自身（self），都是 context window（核心 1+2）。context = 一组 window + 历史，没有"窗之外"的特殊结构。

- **class 一等继承**：method 按 class 聚合（核心 4）+ window 是 object 引用（核心 2）⇒ window 的方法沿 **parentClass 链**解析，子类自动继承父类 method；用户自定义 object 声明 `class` 即获得方法继承。

- **object 自塑展示（readable）**：核心 8 ⇒ 每个 object 决定自己在 LLM 眼中的样子（名片正文 + window method），无需框架硬编码各类型渲染。

- **thread 派生（旧 do = talk 自己）**：核心 9 的 talk 是唯一"开线程 + 通信"动词。
  - `talk(target=<objectId>)`：创建 target 的**一条新 thread**。target 可为**自己**（⇒ 自己的子线程，等同旧 `do`）、peer（跨对象会话）、`super`（反思分身）。
  - `talk(target, fork=<thread id>)`：`fork` 指定一个**属于 target 的已有 thread**，新 thread **复用该 thread 的全部 context windows**（即 fork 那组 object 引用）。**所有权分配：fork 的子线程默认对复用的窗持 `readonly-ref`，源 thread 保留所有权**——故子线程默认只能看/调展示、不能用 object method 改对象（避免两 thread 踩同一 object）。要让子线程能动某窗，源 thread 显式 `move` 给它（复用核心 13）。
  - `talk(target, share=[…])` / `say(msg, share=[…])`：经核心 13 把我 context 里的窗（object 引用）共享给对方 thread 传上下文（readonly-ref / move）。
  - 由此涌现：子任务委派、fan-out（开多条 talk）、跨 thread 传上下文——全是 talk + window 传递的组合，无需 do/continue/move 等独立概念。

- **attention 分层（主线强 attend、旁路弱 attend）**：核心 10+12+14 ⇒ 与 creator（派活方，无论 user 还是 parent thread）的对话进 message 流（全文、强 attend），它是自己视角 **thread window** 的内容、在 XML 只渲 methods 句柄；与 sub/peer 的对话留在该窗 transcript（XML、弱 attend）、message 流只出缩略提示。判据是「是否 creator 窗」，与对端是 user 还是对象无关。

- **协作全显式、可观测**：跨 thread 信息流只经 message + window 传递（核心 9+13），不共享内存；所有协作痕迹落 event / transcript，可回放、可 debug。

---

## 三、细节补充

### 3.1 LLM 输入的最终构成（buildInputItems 每轮合成）

`instructions`（self.md 正文，权重高于 system message，唯一身份来源）+ `input[]` 数组：

| 位置 | 条目 | 角色 |
|---|---|---|
| 1 | `<context>…</context>` XML（一条 system message） | 稳定状态层：我此刻拥有的世界快照 |
| 2 | `[ooc:paths]` system message（world_root / object_id / stone_dir / flow_dir / session_id / thread_id…） | 环境路径锚点 |
| 3+ | transcript（历史 Context Change / ProcessEvent 流） | 过程层：本 thread 经历过什么 + 与 creator 的对话全文 |

> 关键约束：Object 不知道 context 之外的任何事——内存/磁盘里再多状态，没进当前 thread 的 context 就不存在。

### 3.2 `<context>` XML 的两层形状

```xml
<context>
  <self object_id="…"/>                  <!-- 仅对外标记；身份正文走 instructions，不另起空 self 窗 -->
  <thread id="…" status="running">
    <creator_thread_id/> <parent_thread_id/>

    <!-- class 声明层：本轮出现的每个 window class 的方法契约【声明一次】(核心 4) -->
    <window_classes hint='exec(window_id, method, args={...})。每个 class 的方法对其全部实例可用'>
      <class name="…">
        <method name="…">brief<arg name="…" type="string" required="true">…</arg></method>
      </class>
      <!-- 多个同 class 实例共享这一份声明；沿 parentClass 链合并继承的 method (派生:class 一等继承) -->
    </window_classes>

    <!-- 实例层：每个 window 只带 id + class 引用 + 实例独有状态(transcript/steps/fill_state…)，不重复方法菜单 -->
    <context_windows>
      <window id="…" class="…" status="…"> … </window>
    </context_windows>
  </thread>
  <context_overflow item_count="N"> <item id title relevance reason/> </context_overflow>
</context>
```

- **window 属性**：`id`（稳定唯一）/ `class` / `status` / 可选 `sharing`（核心 13：`readonly-ref` / `move` 态）。
- **命名约定**：window 的分类一律称 **class**（OOC 的一等继承抽象、唯一继承机制）；`type` 只留给 method arg 的**数据类型**（`<arg type="string">`）。

### 3.3 ContextWindow 的实现接口（依赖倒置：context 定接口、别人实现）

> context **不关心 window 从哪来、是什么具体类型**——talk / 知识 / 文件 / peer 对象 / 子线程……都是其他模块（持久化层、协作层、knowledge 层、builtin）对本接口的实现。context 只要求每个 window 满足下面的接口，然后把拿到的一组 window 组装成 LLM 输入。**怎么产出这组 window、用什么具体类型，由各模块按接口提供，context 不耦合其来源**——这是依赖倒置，避免 context 设计随窗口类型增删而改。

一个 context window 须向 context 提供：

- **`id` + `class`**：稳定标识 + 它的 OOC class（context 据此聚合方法、沿 parentClass 链解析继承的方法）。
- **content 渲染（readable）**：给定本窗展示状态，产出展示节点（或"无内容"）——即 object 的 readable（核心 8）。content 怎么算（注册时直接给的 / 从 stone 读的 / 动态函数 / 静态名片）由 **readable 维度**定，**context 只调这个接口**。
- **window method**：调整本窗展示、读写本窗的展示状态块（核心 6）；object method 归 object——context 只按 class 把方法菜单聚合进 `<window_classes>`（核心 4），不关心方法实现。
- **展示状态块**：一块可持久化的展示态（核心 7）；window method 的读写对象。
- 可选：**压缩态渲染**（compressLevel ≥ 1 时的简化呈现）/ **关闭副作用** / **本窗消费了哪些消息**（供 attention 分流去重）。

context 侧职责到此为止：拿到一组满足接口的 window → 逐窗调 readable 渲染 + 按 class 聚合方法 + attention 分流（核心 10/12）+ 预算分配。

### 3.4 Context Change（过程事件）→ input item

window 内容变化主动报告为 event，context 按 kind 映射为确定 item：

| event | 输出 |
|---|---|
| `inbox_message_arrived`（creator 窗） | system，**全文**（核心 12） |
| `inbox_message_arrived`（其他 talk 窗） | system，**缩略**（`<window> 收到新消息 "…前 50 字"`，核心 12） |
| `context_compressed` / `scheduler_yielded` / `inject` | system 简述（silent-swallow ban：任何变化都对 LLM 可见） |
| `events_summary` | 替换被折叠的中段历史 |
| llm 文本 / function_call / function_call_output | assistant / function_call / function_call_output |
| reasoning / call_started | 不进 transcript（reasoning 不复喂；call_started 仅 crash recovery 锚点） |

### 3.5 预算与可见性

context 是稀缺资源（两条轴：信息密度、class/实例正确性）。按相关度排序在 token 预算内分 `{visible, overflow}`；口径：**锚渲染输出**（非序列化对象）估 token，且**含 thread window 的内容通道**——thread event + creator 对话虽走 message 流，但它们是 thread window 的一部分（核心 14），故同样计入预算、可被该窗的 `compress` 折叠；超预算**先把低相关窗压一档再踢 overflow**；当前 form 等结构必需窗 **pin** 保护；被裁的窗在 `<context_overflow>` 留摘要行（silent-swallow ban）。

### 3.6 视角(POV)：context 是视角而非归属

- 同一 object（如一场跨 agent 的 talk）可同时出现在多个 thread 的 context；每个 thread 持自己的**视角参数**（展示状态块：compressLevel / viewport / sharing 快照），object 的业务状态只存一份。
- 故 thread 的 context 是一张"指针表"——每个 window 是对某 object 的引用（核心 2），引用语义对应 OO 的对象指针。
- **state ≠ context**：window 展示状态（视角）属 context、随 thread 走；object 跨 thread 共享的业务状态属 object 自身。两者落盘的**具体布局归持久化层**定，context 不耦合。

### 3.7 与旧实现的迁移映射（非设计；系统调整对照用）

| 旧概念 | 归并到 |
|---|---|
| `do` 方法 / `do_window` class / `continue` / `move` | `talk`（target=自己 ⇒ fork 子线程）/ `say` / `share`(readonly-ref·move) |
| `compress` 顶层 tool / `scope=auto` | window method `compress`（exec 调用），原语回到 3 个 |
| sharing `ref` / `lent_out` 命名 | `readonly-ref` / `move`（核心 13 语义） |
| 渲染层把 `window.class` 漂成 XML `type=` | 统一 `class=`，`type` 仅 arg 数据类型 |
| 逐实例方法菜单重复 / 空 self 窗壳 | class 声明一次 / self 身份走 instructions |
| 自己 thread 的 events + creator 对话裸渲在 `<thread>` 块 / message 流、无预算归属 | 收敛为自己视角的 **thread window**（核心 14）：XML 只渲 methods、内容进 message 流、一并纳入预算 |

---

## 四、cases 模拟分析

把上面的设计放进真实运行时场景推演，能暴露设计是否还有欠缺。下列每个 case 先描述场景，再点出它暴露的设计 gap 与补法方向。这些 gap 多落在"二分模型没穷尽真实态"或"瞬时语义没补生命周期"，补法皆为**给已有概念加一段生命周期或一条规则**，而非引入新机制（守"简单叠加涌现、勿过度机制化"）。

> 注：曾经记在这里的 **「creator 主线长对话逼近预算 / message 流无预算」** 已由**核心 14**解决——message 流是自己视角 thread window 的内容通道，thread event 与 creator 对话都是该窗的一部分，故一并纳入 3.5 预算、可被该窗 `compress` 折叠。它不再是开放 gap。

### Case A — 跨 thread 共享后 owner 改了对象（一致性模型缺失，高）

thread A 把它 context 里的窗 W（指向 object O）以 `readonly-ref` share 给 thread B；现在 B 的 context 里也有一个指向 O 的引用窗。随后 A（或某个持 `move` 权的 thread）调 object method 改了 O 的业务状态。**B 侧那个窗还显示旧值吗？** 核心 13 说"传引用"（live 指针语义）、3.6 说"业务状态只存一份"；但跨 thread（更别说跨进程/跨对象）时，B 拿到的几乎必然是一份物化的冻结副本——O 后续的改动 B 永远看不到，且没有任何失效事件通知 B。这同时破了两条铁律：silent-swallow ban（变化对 LLM 不可见）和"单份状态"。设计既没承诺 live、也没承诺快照语义。**方向**：钉死一致性模型——要么承认"copy-on-share 快照 + `@sharedAt` 标记 + 过期失效事件"，要么定义真正的 live-ref 解析路径；fork 与 share 跨 thread 的口径要统一。

### Case B — move 之后的所有权生命周期（缺租约，高）

A 把窗 `move` 给 B（所有权转 B，A 自己降为 `readonly-ref`）。接着可能发生三件事：(i) A 这条 thread 结束了——它那个残留的 readonly-ref 窗怎么处理？(ii) B 又把同一个窗 `move` 给 C，move 链 A→B→C 上当前 owner 谁来追踪？(iii) B 结束了却没归还，object 的所有权悬空、谁来兜底？核心 13 只定义了"移交那一刻"谁能调什么，它是个**瞬时事件、没有生命周期**：没定义 owner 死亡时归还、move 链 owner 追踪、readonly-ref 能否被 close、僵尸 ref 窗的失效态。**方向**：把 share/move 升级为"所有权租约"——补归还（复用反向 `say(share=move)`，不加新动词）、thread 终止钩子触发归还、sharing 终态（owner 失联时的兜底）。

### Case C — fork 复用一条 thread 的全部 context windows（剩可移植性，中）

thread 经 `talk(target, fork=<thread id>)` 开一条新线程，新线程复用源 thread 的全部 context windows（即 fork 那组 object 引用）。**所有权已定**：子线程默认对复用的窗持 `readonly-ref`、源 thread 保留所有权（见派生能力，复用核心 13），不再踩同一 object。剩余未定义的是**可移植性**：源 thread 的 context 里有一类"通道窗"——它自己视角的 thread window（核心 14）、指向其 creator 的句柄、指向其 sub/peer 的 talk window，这些代表的是"一段具体对话关系/拓扑"，复制到新线程会产生"一个对端两个父"的悬空拓扑，**本质不可复制**；而指向普通 object（文件/知识/peer 对象本体）的投影窗可以复制（以 readonly-ref）。此外 fork 全量复制与"context 是稀缺资源"有张力（是否该默认按相关度裁剪、只复用子集）。**方向**：ContextWindow 接口加一条"可移植性"——通道窗默认**不参与 fork**、object-projection 窗可复制；fork 默认按相关度裁剪而非全量。

### Case D — 真实窗类型逐个套 ContextWindow 接口（接口是乐观最小集，中-高）

把 form / search / plan 等真实窗逐个套 3.3 的 ContextWindow 接口时，发现接口漏了三类：① **窗-窗层级**（form 内嵌子窗，需 `parentWindowId` / `sub_windows`）；② **budget/attention 元数据**（`relevance` / `provenance` / `compressLevel` 接口没暴露）；③ 窗自身的**生命周期/工厂型 method**——form 的 `refine`/`submit` 会产出新窗、`search.open_match` 打开一个匹配项、`plan.expand_step` 展开步骤，这类"产出新窗"的 method 既不是纯 window method（只改展示）也不是 object method（改对象本体），核心 5 的二分缺这根判定轴。此外核心 6/7"每个窗带一块可持久化状态配置块"是过强的全称——form.fill 的瞬态输入装不进、self/member 这类门面窗是确定性重建的、不需落盘。**方向**：接口补三槽；核心 5 method 二分加判定轴（容纳"工厂型 method"）；核心 6/7 承认"瞬态/确定性重建窗"例外。

### Case E — creator 判据的边界（缺归类全函数，中）

attention 分流全靠"是否 creator 窗"这一判据，但边界情形它没穷尽：(i) 顶层 supervisor thread 根本没有 creator（谁派的它？）；(ii) 一条 inbox 消息没有归属窗（裸消息）——当前默认走全文=最高 attention，恰与"主线最重要"反向；(iii) 万一出现多个 `isCreatorWindow`，当前静默 first-win；(iv) creator 全文没有尺寸上界。**方向**：补一条"消息归类全函数"，让每条 inbox 必落入恰好一档 `{creator 全文 | sub/peer 缩略 | 无主→最低档并显式标 unrouted}`，配合"每 thread ≤1 creator 窗"不变量（违反则告警、不静默）。

### 收敛

落地前最高优先是 **Case A（跨 thread 引用一致性）** 与 **Case B（share/move 租约）**——二者同属"跨 thread 所有权/引用"这一最薄弱区且相互牵连。Case C/D/E 是接口与判据的补全，可随系统调整分批吸收。
