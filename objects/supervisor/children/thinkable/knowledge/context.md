---
title: context 设计（LLM 输入的构成、构造与派生能力）
description: thinkable 维度关于 context 的单一权威——核心设计(13 条) + 派生能力 + 细节补充；context=一组 context window；window=OOC object 在 context 的引用投影
activates_on:
  "object::root": "show_description"
---

# context 设计

> 本篇是 thinkable 维度关于 context 的**单一权威**。原 `context-construction.md`（构造现状）、`context-ideal-structure.md`（规范态）已并入此处，避免设计分散/漂移。

---

## 一、核心设计

1. **context 是 LLM 的输入**；context 由一组 **context window** 组成。

2. **context window 是 OOC object 在 context 中的投影**——一个对该 object 的引用。

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

---

## 二、核心设计组合产生的派生能力

这些不是新增机制，而是上面核心设计**组合后自然涌现**的能力。

- **统一行动入口（exec / close / wait 三原语）**：一切行动都是「在某 window 上 exec 一个 method」（核心 3+5）；`close` 关窗、`wait` 声明等待。`compress`（信息压缩）**不是原语**——它是"调整信息展示"的 **window method**（核心 6，与 file 窗 `set_viewport` 同类），经 `exec(method="compress")` 调。**稳定原语恒为 3 个**：`exec` / `close` / `wait`。

- **everything is a window**：会话（talk）、子线程、知识、文件、程序、乃至 agent 自身（self），都是 context window（核心 1+2）。context = 一组 window + 历史，没有"窗之外"的特殊结构。

- **class 一等继承**：method 按 class 聚合（核心 4）+ window 是 object 引用（核心 2）⇒ window 的方法沿 **parentClass 链**解析，子类自动继承父类 method；用户自定义 object 声明 `class` 即获得方法继承。

- **object 自塑展示（readable）**：核心 8 ⇒ 每个 object 决定自己在 LLM 眼中的样子（名片正文 + window method），无需框架硬编码各类型渲染。

- **thread 派生（旧 do = talk 自己）**：核心 9 的 talk 是唯一"开线程 + 通信"动词。
  - `talk(target=<objectId>)`：创建 target 的**一条新 thread**。target 可为**自己**（⇒ 自己的子线程，等同旧 `do`）、peer（跨对象会话）、`super`（反思分身）。
  - `talk(target, fork=<thread id>)`：`fork` 指定一个**属于 target 的已有 thread**，新 thread **复用该 thread 的全部 context windows**（即 fork 那组 object 引用；快照拷贝，之后各自演化）。
  - `talk(target, share=[…])` / `say(msg, share=[…])`：经核心 13 把我 context 里的窗（object 引用）共享给对方 thread 传上下文（readonly-ref / move）。
  - 由此涌现：子任务委派、fan-out（开多条 talk）、跨 thread 传上下文——全是 talk + window 传递的组合，无需 do/continue/move 等独立概念。

- **attention 分层（主线强 attend、旁路弱 attend）**：核心 10+12 ⇒ 与 creator（派活方，无论 user 还是 parent thread）的对话进 message 流（全文、强 attend）、creator 窗在 XML 只剩句柄；与 sub/peer 的对话留在该窗 transcript（XML、弱 attend）、message 流只出缩略提示。判据是「是否 creator 窗」，与对端是 user 还是对象无关。

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
- **单窗内容优先级**：`compressLevel ≥ 1` → `compressView`；否则走 readable 解析链（registry.readable → stone `executable` 的 window.readable → `readable.ts` → `readable.md` → placeholder），沿 parentClass 链回退。

### 3.3 context windows 的来源（合成 ≠ 持久化）

`thread.contextWindows`（持久化那份）+ 每轮 pipeline 合成的派生窗：
1. **持久化窗**（thread-context.json）：LLM/user open 的 talk / 子线程 / knowledge / file / program / method_exec / 自定义 object。
2. **protocol knowledge**：每轮按条件注入的框架协议常量（`interaction-core` 等；情境性协议按 intent 激活，不常驻）。
3. **activator knowledge**：seed + sediment 双源按 `activates_on` 激活（机制见 [[knowledge-activation]]，上限受控）。
4. **skill_index** / **peer·children object 自动注入**（peer 本身作为 window 进 context，`class=objectId`，渲染走其 readable）/ **enrichment**（运行时派生字段，落盘前剥离）。

### 3.4 Context Change（过程事件）→ input item

window 内容变化主动报告为 event，按 kind 映射为确定 item：

| event | 输出 |
|---|---|
| `inbox_message_arrived`（creator 窗） | system，**全文**（header msg_id/from/window_id + 正文） |
| `inbox_message_arrived`（其他 talk 窗） | system，**缩略**（`<window> 收到新消息 "…前 50 字"`，核心 12） |
| `context_compressed` / `scheduler_yielded` / `inject` | system 简述（silent-swallow ban：任何变化都对 LLM 可见） |
| `events_summary` | 替换被 `_foldedBy` 折叠的中段历史 |
| llm_interaction.text / function_call / function_call_output | assistant / function_call / function_call_output |
| thinking / call_started | 不进 transcript（reasoning 不复喂；call_started 仅 crash recovery 锚点） |

### 3.5 预算与可见性

context 是稀缺资源（两条轴：信息密度、class/实例正确性）。`BudgetManager`：`score(window)` 由 provenance/priority/recency/signal 算相关度，`allocate` 按相关度在 token 预算内分 `{visible, overflow}`。口径：**锚渲染输出**（非 JSON 序列化）估 token；超预算**先把低相关窗压一档（compressLevel）再踢 overflow**；creator 窗 / 当前 form 等结构必需窗 **pin** 保护；被裁的窗在 `<context_overflow>` 留摘要行（silent-swallow ban）。

### 3.6 持久化与"视角"语义

- **状态块持久化**：window 展示状态（compressLevel / viewport 等）落 `thread-context.json`（核心 7）。
- **state ≠ context**：object 跨 thread 共享的业务状态存 `flows/<sid>/<oid>/state.json`；thread 视角存 thread-context.json，对独立 flow object 只存轻量 `_ref` 指针，hydrate 时另读 state.json。内置特性（talk/子线程/method_exec 无独立 state）完整 inline。
- **context = 视角(POV) 而非归属**：同一 object（如一场跨 agent talk）可同时出现在多个 thread 的 context，每个 thread 持自己的视角参数（compressLevel / sharing 快照）；object 状态只存一份。thread-context.json 即 OOC 的"指针表"，`_ref` 对应 OO 的对象指针。

### 3.7 旧概念清除清单（系统调整时彻底移除）

| 旧概念 | 归并到 |
|---|---|
| `do` 方法 / `do_window` class / `continue` / `move` | `talk`（target=自己 fork 子线程）/ `say` / `share`(readonly-ref·move) |
| `compress` 顶层 tool / `scope=auto` | window method `compress`（exec 调用），原语回到 3 个 |
| sharing `ref` / `lent_out` 命名 | `readonly-ref` / `move`（核心 13 语义） |
| 渲染层把 `window.class` 漂成 XML `type=` | 统一 `class=`，`type` 仅 arg 数据类型 |
| 逐实例方法菜单重复 / 空 self 窗壳 | class 声明一次 / self 身份走 instructions |
