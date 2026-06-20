---
title: compress 设计（context 的信息压缩：窗折叠 + 历史折叠 + 预算兜底）
description: thinkable 维度关于 compress 的单一权威——核心设计 + 派生能力 + 细节补充 + cases；compress=调展示程度的 window method（非原语），两 scope（windows 档位 / events 历史折叠），改 win 投影态不碰 object data、可逆，配预算软提示 + 应急钳制兜底
activates_on:
  "object::root": "show_description"
---

# compress 设计

> 本篇是 thinkable 维度关于 **compress（context 的信息压缩）** 的单一权威。
> compress 是 `context.md` 核心 6（window method 调展示态）落到"压缩"这件事上的深化——本文只讲 compress 自身，
> context 总体设计（window 是什么、视角投影、预算分配框架）以 `context.md` 为准、不重复。两文须自洽。

## 编辑规范

维护本文须守以下规范，使其长期高内聚、低耦合、不漂移：

1. **单一权威**：compress 设计只此一处。新增/变更先改本文、再改代码；不另起平行文档。
2. **四段结构**：① 核心设计（原子原则，逐条编号、一句一条、相互正交）；② 派生能力（核心组合涌现，不引入新原则）；③ 细节补充（参数/投影/边界）；④ cases 模拟分析（放进真实运行时推演、暴露并收敛缺口）。新内容按归属入段。
3. **高内聚低耦合（依赖倒置）**：只讲 compress 自身 + 它对外的契约；window/预算/持久化框架"由 X 维度按接口实现，compress 不耦合其实现"。
4. **描述设计与接口、非实现走查**：讲"是什么/为什么/契约"，不逐函数走查；代码锚点仅在确有必要时给（锚文件 + 符号名、不锚易漂的行号）。
5. **精炼标准语言**：一句话能说清不写三句；术语统一（window=class、arg=type；win=投影态；scope=windows/events；compressLevel / summarizedRanges）。
6. **旧概念单独标注**：与旧实现的差异/过渡态放「迁移映射」，明确标"非设计"，不混进核心。
7. **自洽**：任何改动须与全文、且与 `context.md` 不矛盾；发现矛盾先修设计再落文字。
8. **cases 用段落、场景说清**：先把场景前因后果讲清，再点出暴露的 gap 与方向。
9. **被证伪的内容即删**：某 case/gap 经推敲确认不是问题，直接删，不留半成品标注。

---

## 一、核心设计

1. **compress 是「调展示程度」的 window method，不是 tool 原语**。一切行动经 `exec`/`close`/`wait` 三原语（context.md 派生）；compress 经 `exec(window_id, method="compress", args=...)` 调，与 file 窗 `set_viewport` 同类。`expand` 是其逆。**稳定原语恒 3 个**，compress/expand 不进原语表。

2. **compress 改 window 的投影态（win）、不碰 object data，可逆**。它只调"这一视角怎么看"，不改"真相"（object 的 data、thread 的 events）。展开即还原——折叠是**视角选择、非数据销毁**（落 context.md 核心 5/6：window method 纯函数、只动 win、零副作用）。

3. **两个 scope、一个 method、统一语义、零派发冲突**：
   - `scope=windows`（缺省）：调单窗的展示**档位** `compressLevel`（0 全文 → 1 缩略 → 2 仅句柄）；compress 升一档（封顶 2）、expand 降一档（封底 0）。
   - `scope=events`：折叠本窗 transcript 的一**段历史**为摘要；compress 往 `summarizedRanges` 加一段、expand 移除（或清空）。

4. **折叠态视角独立**。compressLevel / summarizedRanges 都是 win（投影态），随窗实例走；同一 object 在不同视角是不同窗实例、各持自己的 win（context.md 核心 2/6.6）。故 A 视角折叠**不影响** B 视角；折叠态随窗持久化在 thread-context.json（context.md 核心 7）。

5. **events 折叠的摘要由 agent 自写**。summary 作为 method arg 传入——agent 是上下文工程的主体，它知道哪段该折、折成什么。区别于"runtime 另起一次 summarization call"：省一次调用、更连贯，且 OOC 关键状态活在 object（细节丢了去对象窗即恢复），故纯文本 summary 足够、风险低。

6. **events 折叠是读出侧投影，不动 events 序列**。thread.events 是 append-only 真相；折叠只在构造 LLM 输入时把落在某 range 内的连续渲染单元替换为一条 summary 占位、段外原样。坐标 `{fromIdx,toIdx}` 是被折 transcript 的**数组 index**（已发生项的 index 稳定，故跨轮可靠）。

7. **compress 的归属窗 = 它要折的内容所在的窗**。窗档位折该窗自己的展示内容；events 折某 thread window 的 transcript。self 视角折"我自己的 thread 历史" → 自己视角 thread window；他者视角折"与对端的会话" → 该 talk window（context.md 核心 9/10）。

8. **预算软提示（soft）**。transcript 是自己视角 thread window 的内容通道、计入预算账（context.md 核心 10）；逼近 soft 阈值时 context 给一条 `<context_budget_warning>`（含 transcript 占比）提示 agent 主动精简——**窗口可 `close`、transcript 只能 `compress(scope=events)` 折叠**，故显式指向该杠杆。

9. **应急兜底（emergency_guard，hard）**。context 估算越 hard 阈值时，框架对 transcript 做**瞬态钳制**（保留最近、丢最早、tool-pair 安全），插一条可见 marker 指向 compress。它与窗 overflow 同模型——per-round、瞬态、**不改 events、不动 win、不持久化、不生成摘要**；**不是自动推进压缩态**（持久折叠仍由 agent 主导）。这是防撑爆的安全网、非常态控制。

---

## 二、核心设计组合产生的派生能力

这些不是新增机制，而是核心设计**组合后自然涌现**。

- **统一压缩入口**：windows/events 一个 method 两 scope（核心 1+3），LLM 学一次（`exec(method="compress")`）、零派发冲突。
- **非破坏式压缩（对象化红利）**：因 context 是对象、历史是 object data（核心 2+6），compress 只是视角投影 → 可逆、丢摘要细节不丢状态。对照字符串-prompt agent：它的历史只活在对话串里、compaction 必须破坏式重写、不可逆。
- **per-view 压缩**：win 视角独立（核心 4）→ 同一长会话，creator 折叠不影响 callee 自视；两端各调各的、互不污染。
- **两种折叠粒度**：`keepTail=N`（保最近 N 条、折更早全部，对应 microcompact 用例）+ `{fromIdx,toIdx}` 点名折叠（精准清中段噪声 tool 结果）。
- **三层防溢出**：agent 主动 compress（L1）→ soft warning 提示（L2，核心 8）→ emergency 钳制兜底（L3，核心 9）。逐层降级、最末不崩、历史不丢。

---

## 三、细节补充

### 3.1 compress / expand 的 args 契约

两个 method 都带 schema、合并进窗的方法菜单（可发现）：

- `compress`：`scope`（`"windows"`|`"events"`，缺省 windows）；events 下 `keepTail`（保留末 N 条）**或** `fromIdx`/`toIdx`（点名区段，含两端）二选一，`summary`（该段摘要、agent 自写）。
- `expand`：`scope`；events 下 `at`（展开覆盖该 index 的那一段；不给则清空全部折叠）。

**能力归属（载体收敛后）**：`scope=windows`（展示档位）由**通用默认方法表**兜底（`readable/default-window-methods.ts`，每个 window 都有；避免"各 window 各自实现⇒无人实现"）。`scope=events`（折历史 transcript）**归 thread 窗**（核心 7"折叠归内容所在的窗"）：由 thread class 自声明 compress/expand（`agent/children/thread/readable/compress-events.ts`）覆盖默认表；通用层对 `scope=events` **抛错指向 thread 窗**（避免错窗静默落折叠态 → 写读不同窗静默失效）。window class 同名声明恒优先于默认表。

### 3.2 compressLevel 投影（scope=windows 读出侧）

renderer 按 win.compressLevel 投影窗内容详略：0 全文 / 1 缩略（截断 + 展开提示）/ 2 仅标题句柄。读出在 `thinkable/context/renderers/xml.ts`（`projectByCompressLevel`）。observable 侧消费该档位（window-hash）。

### 3.3 events 折叠态结构（scope=events）

折叠态 = `win.summarizedRanges: Array<{fromIdx,toIdx,summary}>`（纯类型 + 纯函数在 `_shared/utils/summarized-ranges.ts`）。约定：

- **写入侧不夹边**：compress 追加区段时只规整（排序、合并重叠/相邻），不按 transcript 长度 clamp——写时未必知道读时真实长度。
- **读出侧按真实长度 clamp + 投影**：`projectSummarizedRanges(items, ranges, renderItem, renderSummary)` 通用 over「item→渲染单元」，按真实 `items.length` 夹边、丢非法段、段内连续 items 折成一条 summary。

### 3.4 读出侧两调用点（坐标系不可混 + tool-pair 安全）

- **self 视角**：折 `thread.events`（坐标=events index），在 `buildInputItems` 构造 transcript 时投影。
- **peer/talk 视角**：折该会话窗的 messages transcript（坐标=该窗 `filterTalkMessages` 输出的 messages index），与 transcript viewport（末 N 条）干净组合。

两套坐标系**不能混**：events 折叠的 fromIdx/toIdx 是 events 坐标，messages 折叠是 messages 坐标。

**tool-pair 安全（self 视角专属）**：self 视角的 events 会渲成含 `function_call` / `function_call_output` 的
items；agent 折的任意区段若只覆盖一对 call/output 的一半，投影后会留孤儿 tool 块——provider 层
（`claude-transport.ts`）**不** sanitize，孤儿 tool_use/tool_result 会被 LLM provider 拒、本轮 think 崩。
故 events 折叠**投影前先把区段吸附到 tool-pair 安全边界**（`snapRangesToToolPairs`）：区段只覆盖配对一半
就外扩到覆盖另一半（两半要么都折、要么都留），pending call（有 call 无 output、恢复期边界）不外扩、原样
保留；吸附只调本轮投影用的 range、不改存储的折叠态（expand 仍按原 range 还原）。peer 视角折的是 messages
（无 tool 块），天然免疫、不需吸附。

### 3.5 预算口径

- transcript token 估算与窗口**同口径**（JSON 长度 / 4，`budget.ts`），避免漂移。
- `current = 窗口估算 + transcript 估算`；超 soft 报 `<context_budget_warning>`（暴露 `transcript=` 占比 + 指向 `compress(scope=events)`）。
- 窗口超 hard 由预算分配踢进 `<context_overflow>`（per-round）；transcript 超 hard 由应急钳制处理（3.6）。

### 3.6 应急钳制（transcript-clamp）

`thinkable/context/transcript-clamp.ts`：current 越 hard 时把 transcript 钳到 `(hard − 窗口估算)` 内——从尾部累加保留最近**后缀**、丢最早、至少留 floor 条；插可见 `[context_change:context_clamped]` marker。

- **tool-pair 安全**：function_call 必在其 function_call_output 之前，故保留后缀只可能出现"output 在后缀、其 call 在被丢前缀"的孤儿 output——sanitize 丢之即可（不会产生孤儿 call）。provider 层（`claude-transport.ts`）**不** sanitize 孤儿 tool_result（会被 Anthropic/OpenAI 拒），必须在此堵住。
- per-round 瞬态：不改 events、不动 win、不持久化（与窗 overflow 同模型）。

### 3.7 与旧实现的迁移映射（非设计；系统调整对照用）

| 旧概念 / 过渡态 | 归并到 |
|---|---|
| `compress` 顶层 tool / `scope=auto` 原语 | 退役——compress 是 window method，经 exec 调；稳定原语 3 个（context.md 迁移映射同） |
| events 折叠改 `thread.events` object data（`_foldedBy` 标记 + push `events_summary` 事件） | 退役/dormant——违核心 2/6（改 data 表达视角选择、不可逆）；user 路径走 `win.summarizedRanges`。`events_summary` event kind 的读出渲染暂留，无写入侧 |
| self 视角 events 折叠态曾挂 **self 门面窗**（`isSelfWindow`、非持久化、靠写盘 inline 后门、stone 冷启动有丢窗洞） | **已落（2026-06-20）**：折叠态挂**自己视角 thread 窗**的 win（`isSelfThreadWindow`、class=THREAD_CLASS_ID inline 天然持久化、免后门、builtin 类冷启动恒注册无丢窗）；self 门面窗持久化后门已删、回归纯 identity+agency |
| transcript 在预算之后无条件追加、无预算归属 | 纳入预算账（核心 8 / context.md 核心 10） |

---

## 四、cases 模拟分析

把设计放进真实运行时推演，暴露欠缺。补法多为"给已有概念加一段规则"，非引入新机制（守"简单叠加涌现"）。

### Case A — self-driven root 的自视折叠承载（已解，2026-06-20）

顶层 supervisor 这类 self-driven root thread 没有 creator，但照样有 thread.events（自视历史）要折。**载体收敛已落**：每条 thread（含 self-driven root）恰好一个**自己视角 thread 窗**（class=THREAD_CLASS_ID，`isSelfThreadWindow`），events 折叠态挂其 `win.summarizedRanges`——THREAD_CLASS_ID 是 inline 持久化的 builtin 类，故折叠态 **inline 天然落 thread-context.json、跨 reload 不丢、冷启动恒注册无丢窗洞**，无需 self 门面窗持久化后门（已删）。**self-driven root 不是特例**：它就是「空 creator 通道的 thread 窗」——creator 对话是 thread 窗内建的上游通道（root 通道为空，`hasCreatorChannel`=false → 不被 wait 当 IO 源、不触发 creator affordance）。self 门面窗回归纯 identity + agency（self.md + object methods、exec 默认目标），不再承载会话折叠。写侧 events-compress 能力归属 thread class（核心 7），agent 只在 thread 窗见到 events 折叠 → 写读自然对齐（真 LLM 实证 + 跨 job reload e2e gate）。

> 曾记于此的 **「agent 主动折叠区段切断 tool-pair 留孤儿、本轮 think 崩」** 已解决——读出侧 events 折叠
> **投影前吸附到 tool-pair 安全边界**（`snapRangesToToolPairs`，见 3.4）。不再是开放 gap。

### Case B — 折叠后 events 继续增长（坐标稳定性，低·已自洽）

折了 `[0,k]` 后 thread 继续产出新 events（index k+1、k+2…）。因 events append-only、已发生项的 index 不变，旧 range `[0,k]` 仍精确指向原区段、不被新增干扰；新 events 在段外正常渲。坐标稳定性天然成立，无 gap——记此 case 以钉死"折叠态用 append-only index 而非相对偏移"这条不变量。

### Case C — peer 视角 keepTail 的坐标系（便捷模式精度，低）

`keepTail=N` 需要 transcript 总长算出 `{fromIdx,toIdx}`。self 视角取 `thread.events.length` 精确；但 talk 窗（peer 视角）的 transcript 是 messages、长度 ≠ 本 thread 的 events.length，故在 talk 窗用 keepTail 算出的边界不准。当前已 fail-soft（写入不夹边、读出按真实 messages.length clamp），不崩、不乱折，仅 keepTail 在 talk 窗上语义不精确；peer 视角用显式 `{fromIdx,toIdx}` 完全正确。**方向**：talk 窗的 keepTail 改用该窗 messages 数算总长（让会话窗 readable 把 message count 经 ctx 传入，或 talk 窗 override compress）。

### 收敛

**Case A（自视折叠载体归属）已解（2026-06-20）**——折叠态收敛到自己视角 thread 窗（inline 持久化、含 self-driven root），写侧能力归属 thread class。Case B 已自洽（记不变量）。**Case C（talk 窗 keepTail 精度）是唯一剩余开放项**——便捷模式精度、可最后补。
