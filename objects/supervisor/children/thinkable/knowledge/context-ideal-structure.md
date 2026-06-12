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

## 理想 context 的 XML 形状

把六层落成具体骨架（与 [[context-construction]] 的现状 XML 对照看）：

```xml
<context>
  <self object_id="agent_of_executable"/>   <!-- 仅对外标记；身份正文走 instructions，不另起空 self window -->
  <thread id="t_exec_main" status="running">
    <creator_thread_id>t_supervisor</creator_thread_id>

    <!-- ① 固定协议层：仅无条件必需者常驻。forms/self-evolution 等情境协议不在此，下沉到 ④ 按 intent 激活 -->
    <protocol name="interaction-core">你是谁 / 私有思考空间 / exec·close·wait 三原语 / 工具调用规则……</protocol>

    <!-- ② 类型声明层：本轮出现的每个 type 的方法契约声明一次；exec 调用约定也只说一次 -->
    <window_types hint='调用：exec(window_id, method, args={...})。每个 type 的方法对其全部实例可用'>
      <type name="root">
        <method name="do">派生子 thread 执行一段工作（可 wait 阻塞等回写）
          <arg name="msg" type="string" required="true">写入子线程的初始消息</arg>
        </method>
        <method name="talk">开一个对外持续会话
          <arg name="target" type="string" required="true">目标 objectId（"user" 也是）</arg>
          <arg name="title" type="string" required="true">会话主题</arg>
        </method>
        <method name="program">执行 shell/ts/js
          <arg name="language" type="string" required="true" enum="shell|ts|js">语言</arg>
          <arg name="code" type="string" required="true">代码</arg>
        </method>
        <method name="plan">拆任务为 steps（传 plan 文本或 steps 列表）</method>
        <!-- …其余 root method 同样声明一次… -->
      </type>
      <type name="talk">
        <method name="say">向对端发消息（可 wait 等回复）
          <arg name="msg" type="string" required="true">消息正文</arg>
        </method>
        <method name="wait">本线程进 waiting 等对端回写</method>
        <method name="close">关闭本 talk_window（creator 通道不可关）</method>
      </type>
      <type name="do">
        <method name="continue">向子线程追加消息（可 wait 阻塞）
          <arg name="msg" type="string" required="true">追加内容</arg>
        </method>
        <method name="wait">…</method>
        <method name="close">归档本 do_window</method>
      </type>
      <type name="method_exec">
        <method name="refine"><arg name="args" type="object" required="true">补充/修正参数</arg></method>
        <method name="submit">参数齐后提交执行</method>
      </type>
      <type name="knowledge">         <!-- 8 个 knowledge 实例共享这一份声明，菜单不再逐实例复制 -->
        <method name="close">关闭本知识窗</method>
        <method name="set_viewport">调整渲染区段</method>
      </type>
      <!-- plan / todo 同理各声明一次 -->
    </window_types>

    <!-- ③ 实例层：每个 window 只带 id + type 引用 + 实例独有状态；无 methods、无空壳 -->
    <context_windows>
      <window id="w_do_creator" type="do" status="active" is_creator="true">
        <unavailable methods="close"/>   <!-- 方法集差异在实例上标注，既不抹掉差异也不为它另起一个 type -->
        <transcript>…与 caller 的恒在通道最近若干条…</transcript>
      </window>
      <window id="w_do_child" type="do" status="running">
        <transcript>…子任务回写…</transcript>
      </window>
      <window id="w_talk_peerb" type="talk" status="open">
        <target>peer_b</target>
        <transcript>…</transcript>
      </window>
      <window id="w_plan_1" type="plan"><steps>…steps + 各自状态…</steps></window>
      <window id="w_todo_1" type="todo"><content>…</content><activates_on>…</activates_on></window>
      <window id="f_program_1" type="method_exec" parent="root">
        <method>program</method>
        <fill_state>language=shell ✓ / code=missing</fill_state>
        <unknown_args ignored="lang">未知参数 `lang` 已忽略，本 method 接受 language(必填), code(必填)</unknown_args>
      </window>
      <!-- ④ 知识层：activator 按 intent 激活。forms 因当前有 method_exec form 而激活；各实例只带 path + 正文，零菜单重复 -->
      <window id="k_forms" type="knowledge"><path>internal/forms</path>…form 推进协议正文…</window>
    </context_windows>

    <inbox>…未被任何 talk/do 收纳的兜底消息…</inbox>
  </thread>

  <!-- ⑥ 预算：被裁掉的仍可见（silent-swallow ban）。self-evolution 未激活、旧搜索低相关，压无可压后入此 -->
  <context_overflow item_count="2">
    <item id="k_self_evolution" title="self-evolution" relevance="0.31" reason="budget_overflow"/>
    <item id="w_search_old" title="旧搜索结果" relevance="0.28" reason="compressed_then_overflow"/>
  </context_overflow>
</context>
```

这份骨架相对现状的关键差异：

- **方法菜单从「每实例一份」变「每 type 一份」**：8 个 knowledge 实例共用 `<type name="knowledge">` 一份声明，现状那 28% 的逐 window 重复拷贝消失；exec hint 从 14 处收敛到 `<window_types>` 上的一处。
- **实例只承载会变的东西**：do/talk 带 transcript、plan 带 steps、form 带 fill_state——「换一个同 type 实例会变」的才进实例层。
- **方法集差异不靠复制表达**：creator do 的 `close` 不可用，用实例上的 `<unavailable>` 标注，而非为它克隆一份 type 声明（守住「按真实方法集分组」的约束）。
- **情境协议下沉**：`forms` 因有 form 在场而作为 knowledge 激活；`self-evolution` 未命中 super flow → 进 overflow 而非常驻。
- **无空壳**：身份走 instructions，不再渲染 140 字符的空 self window；空 viewport/target 不渲染。

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
