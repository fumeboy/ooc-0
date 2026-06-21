---
title: compress 设计（context 的信息压缩：resize 档位 + compress 意图 + fork-summarizer 自动压缩）
description: thinkable 维度关于 compress 的单一权威——核心设计 + 派生能力 + 细节补充 + cases；compress 是协议（class 自实现、无通用默认）：resize 设档位（替代 expand）/ compress 无参意图触发框架 fork summarizer 摘要历史，折叠态记 win.summarizedRanges、视角独立可持久；配预算软提示 + force-wait + clamp floor 三层兜底
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
3. **高内聚低耦合（依赖倒置）**：只讲 compress 自身 + 它对外的契约；window/预算/持久化/fork 框架"由 X 维度按接口实现，compress 不耦合其实现"。
4. **描述设计与接口、非实现走查**：讲"是什么/为什么/契约"，不逐函数走查；代码锚点仅在确有必要时给（锚文件 + 符号名、不锚易漂的行号）。
5. **精炼标准语言**：一句话能说清不写三句；术语统一（window=class；win=投影态；resize / compress=两个协议方法；compressLevel=内容窗展示档位 / autoCompressLevel=thread 窗自动压缩阈值档 / compressIntent=手动折叠意图 / summarizedRanges=折叠段 / inFlightCompress=在途 summarizer 标记）。
6. **旧概念单独标注**：与旧实现的差异/过渡态放「迁移映射」，明确标"非设计"，不混进核心。
7. **自洽**：任何改动须与全文、且与 `context.md` 不矛盾；发现矛盾先修设计再落文字。
8. **cases 用段落、场景说清**：先把场景前因后果讲清，再点出暴露的 gap 与方向。
9. **被证伪的内容即删**：某 case/gap 经推敲确认不是问题，直接删，不留半成品标注。

---

## 一、核心设计

1. **compress 是协议，不是框架塞的通用 method、更不是 tool 原语**。一切行动经 `exec`/`close`/`wait` 三原语（context.md 派生）；compress / resize 经 `exec(window_id, method=...)` 调。**不存在通用默认实现**——ooc class 在自己的 readable（`window[].window_methods`）按协议**自声明**才有该方法，且各自带自定义描述。不声明 = 该窗不可 compress/resize。`resolveWindowMethod` 沿 class 查到即用、查不到返 undefined（无默认表回退）。

2. **协议有两个方法、对应两个场景**：
   - **`resize`**：设**展示/压缩档位**（直接设档位的滑杆，替代旧 `expand` 的逆向降档）。场景=展示偏好。
   - **`compress`**：**无参意图**「我要压缩信息」（class 可自决加可选参）。场景=context 过大、需把历史折掉。
   二者正交：resize 调"怎么看"，compress 表达"压一下"。

3. **window method 是纯函数，只置态/意图、零副作用；副作用由 framework hook 执行**（context.md 核心 5/6）。故 resize 只写档位、compress 只置意图（thread 窗 = `win.compressIntent=true`）——**spawn summarizer fork 这种副作用不进 window method**，由 thinkable 框架 hook 见意图/阈值后执行。

4. **同一 resize/compress、不同 class 自实现自己的语义**：
   - **内容窗**（file/search/terminal/…）：`resize` 设 `win.compressLevel`（展示详略 0 全文 / 1 缩略 / 2 仅句柄，读出侧 `projectByCompressLevel` 投影）。
   - **thread 窗**（过程增长型）：`resize` 设 `win.autoCompressLevel`（**自动压缩阈值档**——未总结 transcript 长度超该档阈值即自动折一次）；`compress` 置 `win.compressIntent`（请求立即折一次）。
   thread 窗 self-view 渲成句柄、compressLevel 对其展示无意义，故阈值用**独立字段** `autoCompressLevel`、不复用 compressLevel（避免触动 renderer 的 display 折叠路径）。

5. **历史折叠的摘要由 summarizer fork 生成、非 agent 自写**（镜像 Claude Code full-compact 的 Fork Agent）。框架见 compressIntent / 超阈值即 fork 一条 summarizer 子线程：seed 入早期 transcript 段 + 指令「浓缩成摘要、直接输出正文」，**不给工具**、单轮 think 出摘要即 end。摘要 harvest 进 `win.summarizedRanges{fromIdx,toIdx,summary}`。区别于"agent 在调用里手写 summary"：agent 不必中断本职去拟摘要，压缩是后台异步过程。

6. **折叠是读出侧投影，不动 events 序列**。thread.events 是 append-only 真相；折叠只在构造 LLM 输入时把落在某 range 内的连续渲染单元替换为一条 summary 占位、段外原样。坐标 `{fromIdx,toIdx}` 是被折 transcript 的**数组 index**（已发生项 index 稳定，故跨轮可靠）。全量历史始终在 thread.events、不丢。

7. **折叠态视角独立、随窗持久化**。compressLevel / autoCompressLevel / compressIntent / summarizedRanges / inFlightCompress 都是 win（投影态），随窗实例走；同一 object 在不同视角是不同窗实例、各持自己的 win（context.md 核心 2/6）。故 A 视角折叠**不影响** B 视角；折叠态随**自己视角 thread 窗**（THREAD_CLASS_ID，inline）天然落 thread-context.json、跨 reload 不丢（context.md 核心 7/10）。

8. **compress 的归属窗 = 它要折的内容所在的窗**。self 视角折"我自己的 thread 历史" → 自己视角 thread window；他者视角折"与对端的会话" → 该 talk window（context.md 核心 9/10）。agent 只在该窗见到 compress/resize → 写读自然对齐。

9. **自动压缩（auto-trigger）= 阈值驱动的后台折叠**。每轮 think 在构造 context 后、LLM call 前，框架估算自己视角 thread 窗的**未总结** transcript token（扣已折段）；若 `compressIntent` 或 `未总结 token > threshold(autoCompressLevel)`、且**无在途 compress** → spawn summarizer fork 折早期段（保末若干条尾巴）、清 compressIntent。一次一段、不链式；折完仍超下轮再触发。

10. **三层防溢出（force-wait + clamp floor 兜底）**。L1=agent 主动 compress / 自动阈值触发（核心 9）；L2=超 hard 且有在途 compress → **force-wait**（parent 进 waiting 等 fork 折完再续，无损不丢数据）；L3=**clamp floor**（force-wait 等不及——无在途却已溢出 / fork 失败超时——时，对 transcript 做 per-round 瞬态钳制保不崩）。逐层降级、最末不崩、历史不丢。

---

## 二、核心设计组合产生的派生能力

这些不是新增机制，而是核心设计**组合后自然涌现**。

- **协议化压缩（无中心强加）**：compress/resize 是协议而非框架默认（核心 1），各 class 按自身内容形态自实现——内容窗折展示、thread 窗折历史，互不耦合；新 class 想可压缩，自声明即接入。
- **后台异步压缩（fork 红利）**：摘要由 summarizer fork 生成（核心 5），agent 主线程不被打断去拟摘要；fork 复用 thread/scheduler/wait 既有机制（同 job 内跑完、harvest 唤醒），无需新调度子系统。
- **非破坏式压缩（对象化红利）**：历史是 object data、折叠是视角投影（核心 6+7）→ 丢摘要细节不丢状态（细节去对象窗即恢复）。对照字符串-prompt agent：历史只活在对话串、compaction 必破坏式重写、不可逆。
- **per-view 压缩**：win 视角独立（核心 7）→ 同一长会话，self 折叠不影响 peer 自视；两端各调各的、互不污染。
- **档位即策略**：autoCompressLevel 一个滑杆（核心 4）把"多激进地自动压"交给 agent/class 调（0 不主动 / 1 适度 / 2 激进），无需每次手动 compress。

---

## 三、细节补充

### 3.1 两个协议方法的 args 契约

都带 schema、合并进窗方法菜单（可发现）：

- **`resize`**：`level`（`0|1|2`，必填）。内容窗设 compressLevel（file/search/knowledge/terminal_process/interpreter_process **各在自己 readable 各自实现** resize，即使实现重复——无共享实现）；thread 窗设 autoCompressLevel（`agent/children/thread/readable` 的 `threadResize`）。
- **`compress`**：**无参**（thread 窗 `threadCompress`：置 `win.compressIntent=true`）。class 可自决加可选参，但协议本身无参。

**无通用默认表 + 无共享实现**：不存在 `default-window-methods`；`resolveWindowMethod`（`object-registry.ts`）只沿 class window[] 查、查不到返 undefined。内容窗的展示折叠由各窗 class **各自实现** resize（即使实现重复——协议纯粹优先于 DRY；「共享一个 resize 实现给各类 import」= 默认表换皮，已弃）。

### 3.2 compressLevel 投影（内容窗读出侧）

renderer 按 win.compressLevel 投影窗内容详略：0 全文 / 1 缩略（截断 + 展开提示）/ 2 仅标题句柄。读出在 `thinkable/context/renderers/xml.ts`（`projectByCompressLevel`）。observable 侧消费该档位（window-hash）。

### 3.3 autoCompressLevel → 阈值映射（thread 窗）

resize 设 autoCompressLevel 0/1/2，thread 窗映射为未总结 transcript 的 token 阈值（越高档=越激进=越低阈值，`thinkable/context/compress-trigger.ts:autoCompressThreshold`）：

| autoCompressLevel | 语义 | 阈值（未总结 transcript token） |
|---|---|---|
| 0（缺省/undefined） | 不主动自动压缩（仅 force-wait/clamp 超 hard 时兜底） | = hard |
| 1 | 适度 | = soft |
| 2 | 激进 | = soft / 2 |

数值锚 `budget.ts` 现有 soft/hard。compressLevel 0 仍受 force-wait + clamp floor 兜底（超 hard 必处理），"不主动"不等于"会撑爆"。触发判定 `shouldAutoCompress`：in-flight→false；compressIntent→true；否则 `transcriptTokens > threshold`。**transcript-gated**：只看 transcript token，不看 windows（windows 超限由预算 overflow 处理、与 compress 正交，否则 windows 主导时 fork 折 transcript 无效 → livelock）。

### 3.4 events 折叠态结构 + 读出侧

折叠态 = `win.summarizedRanges: Array<{fromIdx,toIdx,summary}>`（纯类型 + 纯函数在 `_shared/utils/summarized-ranges.ts`）。

- **写入**：`harvestSummarizerForks` 经 `addSummarizedRange` 追加（规整：排序、合并重叠/相邻；不夹边——写时未必知读时长度）。
- **读出**：`projectSummarizedRanges(items, ranges, renderItem, renderSummary)` 通用 over「item→渲染单元」，按真实 `items.length` 夹边、丢非法段、段内连续 items 折成一条 summary。
- **两调用点坐标系不可混**：self 视角折 `thread.events`（events 坐标，`buildInputItems` 构造 transcript 时投影）；peer/talk 视角折该会话窗 messages transcript（messages 坐标，`filterTalkMessages` 输出）。

**tool-pair 安全（self 视角专属）**：self 视角 events 渲成含 `function_call`/`function_call_output` 的 items；折的区段若只覆盖一对 call/output 的一半，投影后留孤儿 tool 块——provider 层（`claude-transport.ts`）**不** sanitize，孤儿 tool_use/tool_result 会被 LLM provider 拒、本轮 think 崩。故折叠**投影前先把区段吸附到 tool-pair 安全边界**（`snapRangesToToolPairs`）：只覆盖配对一半就外扩到覆盖另一半（两半要么都折、要么都留），pending call（有 call 无 output、恢复期边界）不外扩、原样保留；吸附只调本轮投影用的 range、不改存储的折叠段。peer 视角折 messages（无 tool 块），天然免疫。

### 3.5 summarizer fork 机制（framework）

复用 `execFork`（thread 维度的 programmatic fork：建一条 child thread、同 session/object、`_parentThreadRef` 指 parent，child 在同 job 的 scheduler loop 内跑）。

- **spawn**（`thinkable/context/compress-fork.ts:spawnSummarizerFork`）：seed 入 parent `events[fromIdx..toIdx]` 序列化 + 指令；child 标 `isSummarizer`；置 parent `win.inFlightCompress={forkThreadId,fromIdx,toIdx}`（**与 spawn 同次写回**，防双 spawn 双记）；spawn 后移除 parent 侧 fork 子窗（summarizer 不进会话）。
- **child 跑**：summarizer fork **不给工具**（`thinkloop` 对 `isSummarizer` 不挂 tools），单轮 think 的首条 text 即 `endSummary`、随即 done。
- **harvest**（`scheduler.ts:harvestSummarizerForks`，每 tick 顶部、先于 emitChildEndNotifications）：对带 `inFlightCompress` 的线程找其 forkThreadId 子——done→读 `child.endSummary` 记 summarizedRanges + push 可见 `[context_change:context_compressed]` 事件（silent-swallow ban）+ 清 inFlight；failed→关本窗自动压缩（`autoCompressLevel=0` 防反复 spawn-fail livelock）+ 可见 note + 清 inFlight；orphan（child 不存在）→清 inFlight；之后若 parent 在本 compress 上 waiting → 直接翻 running 唤醒（内部回收，不靠 inbox 污染）。`emitChildEndNotifications` 对 `isSummarizer` child 跳过（不写 peer 会话）。

> 持久化：`win.summarizedRanges` / `win.inFlightCompress` 随 THREAD_CLASS_ID inline 整窗落 thread-context.json，跨 reload 存活（reload 后 harvest 仍能找回 fork、force-wait 仍生效）。

### 3.6 force-wait + clamp floor（超 hard 兜底）

- **force-wait**（`compress-fork.ts:maybeForceWaitForCompress`，thinkloop 在 buildInputItems 后调）：有 `inFlightCompress` 且 transcript 超 hard → parent 进 waiting（`waitingOn="compress:"+forkId`），return 本轮；fork 折完 harvest 唤醒、下轮重 render 已折叠未超则正常跑。**无损**（不丢数据，只等）。
- **clamp floor**（`thinkable/context/transcript-clamp.ts`）：force-wait 之下的最后兜底。current 越 hard 且 force-wait 未能压到 hard 下（无在途 / fork 失败超时）时，把 transcript 钳到 `(hard − 窗口估算)` 内——保留最近**后缀**、丢最早、tool-pair 安全；插可见 `[context_change:context_clamped]` marker。per-round 瞬态、**不改 events、不动 win、不持久化、不生成摘要**（与窗 overflow 同模型）；不是自动推进折叠态。

### 3.7 预算口径

- transcript token 估算与窗口**同口径**（JSON 长度 / 4，`budget.ts`），避免漂移。
- `current = 窗口估算 + transcript 估算`；超 soft 报 `<context_budget_warning>`（暴露 `transcript=` 占比 + 指向 `exec(method="compress")` 无参意图与 `resize` 调档位）。
- 窗口超 hard 由预算分配踢进 `<context_overflow>`（per-round，与 compress 正交）；transcript 超 hard 由 force-wait / clamp floor 处理（3.6）。

### 3.8 与旧实现的迁移映射（非设计；系统调整对照用）

| 旧概念 / 过渡态 | 归并到 |
|---|---|
| compress 作"框架塞的通用 window method"、挂**通用默认表** `default-window-methods`（`resolveDefaultWindowMethod`/`DEFAULT_WINDOW_METHODS`） | 退役——compress/resize 是**协议**，class 自声明；`resolveWindowMethod` 无默认回退。内容窗展示折叠改各窗**各自实现** resize |
| 内容窗 display-resize 共享实现 const `displayResize`（5 类 import 同一份） | 退役（2026-06-21）——「共享一个实现给各类 import」是默认表换皮、违协议纯粹；各窗 class 各自实现 resize（允许重复） |
| `expand`（逆向降档 window method，`threadExpand`） | 退役——由 `resize(level)` 直接设档位取代（升降合一为滑杆） |
| `compress` 带 `scope`（windows/events）+ `keepTail`/`fromIdx`/`toIdx`/`summary` 参（agent 自写摘要） | 退役——compress 无参意图；折哪段由框架定（保末尾若干条）、摘要由 summarizer fork 生成；`scope` 全链消失（内容窗 vs thread 窗由 class 自实现区分） |
| 应急 clamp 作"唯一同步兜底"独立存在 | 重定位为 **force-wait 之下的 clamp floor**（优雅路径=force-wait + fork-summarize；clamp 是其下最后保不崩） |
| events 折叠改 `thread.events` object data（`_foldedBy` 标记 + 写 `events_summary` 事件） | 退役——违核心 6（改 data 表达视角选择、不可逆）；折叠走 `win.summarizedRanges` 投影 |
| self 视角 events 折叠态曾挂 **self 门面窗**（`isSelfWindow`、靠写盘 inline 后门、冷启动丢窗洞） | 已落（Case A，2026-06-20）：折叠态挂**自己视角 thread 窗**（`isSelfThreadWindow`、THREAD_CLASS_ID inline 天然持久化、冷启动恒注册无丢窗）；self 门面窗回归纯 identity+agency |

---

## 四、cases 模拟分析

把设计放进真实运行时推演，暴露欠缺。补法多为"给已有概念加一段规则"，非引入新机制（守"简单叠加涌现"）。

### Case A — self-driven root 的自视折叠承载（已解，2026-06-20）

顶层 supervisor 这类 self-driven root thread 没有 creator，但照样有 thread.events（自视历史）要折。**载体收敛已落**：每条 thread（含 self-driven root）恰好一个**自己视角 thread 窗**（class=THREAD_CLASS_ID，`isSelfThreadWindow`），折叠态挂其 win——THREAD_CLASS_ID 是 inline 持久化的 builtin 类，故折叠态 **inline 天然落 thread-context.json、跨 reload 不丢、冷启动恒注册无丢窗洞**，无需 self 门面窗持久化后门（已删）。**self-driven root 不是特例**：它就是「空 creator 通道的 thread 窗」，resize/compress/auto-trigger 一视同仁。self 门面窗回归纯 identity + agency。

### Case B — summarizer fork 自身可能超 budget（低·已界定）

summarizer fork 只 seed「被折的早期段」（非全 context），单轮 input 大→output 小（compaction 本质），通常可接受。若该段本身超 hard：首版**单段、过大段不再细分**（log 标注）；clamp floor 兜底保不崩。方向：实现期可加 seed 截断 / 分批，非首版。

### Case C — 在途 compress 期间 events 继续增长（坐标稳定性，低·已自洽）

fork 折 `[0,k]` 期间 parent 继续产新 events（index k+1…）。因 events append-only、已发生项 index 不变，harvest 写回的 range `[0,k]` 仍精确指向原区段、不被新增干扰；新 events 段外正常渲。force-wait 期间 parent 不产新 events（已 waiting），更无歧义。坐标稳定性天然成立——记此 case 钉死"折叠用 append-only index 而非相对偏移"这条不变量。

### Case D — fork 失败 / orphan 的死锁规避（已解）

server crash 后 `win.inFlightCompress` 残留而 fork 丢，或 summarizer fork 自身 failed。若不处理，force-wait 会永久卡 parent（等一个不会回的 fork）。**已解**：harvest 端 failed→关本窗自动压缩（防反复 spawn-fail livelock）+ 清 inFlight；orphan（child 不存在）→清 inFlight 解除 force-wait；之后 clamp floor 兜底超 hard。bootstrap 重入兜底唤醒。

### Case E — peer/talk 窗的 resize/compress（便捷模式精度，低）

talk 窗 compressLevel 真有展示意义（整窗档位）+ summarizedRanges 折 messages 段。首版**优先保证 self-view thread 窗主路**；talk 窗保留 resize（设档位）+ compress（折 messages）。talk 窗 compress 走 fork-summarize over messages 还是显式段，实现期定。坐标用该窗 messages 数算总长（非 thread.events.length）。

### 收敛

**Case A（自视折叠载体归属）已解（2026-06-20）**；**Case D（fork 失败/orphan 死锁）已解**（harvest 清 inFlight + clamp floor）。Case B 已界定（首版单段 + clamp 兜底）、Case C 自洽（记不变量）。**Case E（talk 窗 compress 精度/走向）是唯一剩余开放项**——便捷模式、可最后补，不挡 self-view 主路。
