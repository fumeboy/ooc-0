---
title: compress v2 Case E —— talk/peer 窗 compress 的折叠机制与坐标系（self 视角已闭，peer 视角待补）
status: landed
date: 2026-06-21
---

# compress v2 Case E —— talk/peer 窗 compress

> **状态 `in-review`**：已跑正式 design-workflow review fan-out（9 元素 reviewer + 完整性批评官，code-grounded）。见「review 记录」+「裁决」——方向 A 定案、待裁决 1/2/4/5/6 已裁、BLOCKER 1/2/3 转落地约束；**仍开放**：待裁决 3（坐标锚点 id-集 vs 封口-prefix）+ 补派 visible reviewer + reflect_request 折叠口径。收口后转 `decided` 再落地（耦合大单元、须人工 checkpoint）。

## 背景 / 动机

compress v2（resize/compress 协议 + summarizer fork + force-wait/clamp floor）已落地，但**只对 self 视角 thread 窗闭环**。`compress.md` §四 Case E 把 talk/peer 视角的 compress 走向列为「实现期定」的唯一剩余开放项。本 issue 要把它从「实现期定」升为**设计已定**：talk 窗的 compress 到底怎么折、坐标系是什么、是否复用 self 视角的 fork/兜底全套。

驱动力：长会话里**与对端的 talk 窗**同样会无界增长（peer/sub 的 messages transcript）。self 视角已能自动折，peer 视角今天**形同虚设**——agent 在 talk 窗调 `compress`/`resize` 不报错但零效果，是个沉默的能力空洞。

## 现状

**代码现状（已核实，v2）：**

- talk 窗**声明了** `compress`/`resize`（`builtins/agent/children/thread/readable/index.ts` 的 talk 投影 `window_methods` 与 thread/reflect_request 共用同一组方法）。
- 但二者在 talk 窗上**完全惰性**：`compress` exec 只置该窗 `win.compressIntent=true`、`resize` 只置 `win.autoCompressLevel`——而框架的唯一 summarizer 管道（`compress-fork.ts:maybeAutoCompress` → `spawnSummarizerFork` → `scheduler.ts:harvestSummarizerForks` → `maybeForceWaitForCompress`）**硬钳到 `isSelfThreadWindow(w.id)`、且只折 `thread.events` 坐标**，从不枚举 talk 窗。talk 窗的 compressIntent / autoCompressLevel 写了、持久了，却**无人消费**——死 flag。
- **读出侧反而已就绪**：talk/peer 视角的 messages 折叠投影完整且正确——`conversation-render.ts:renderTranscriptOrHandle` 非 creator 分支对 `filterTalkMessages` 输出的 messages 调 `projectSummarizedRanges`（messages 坐标、`normalizeSummarizedRanges` 按 `messages.length` 夹边、折段渲 `<events_summary>`）。**只差没有任何 producer 写 talk 窗的 `summarizedRanges`。**
- **坐标系裂口**：self 视角折 `thread.events`（events 坐标）；peer/talk 视角须折该会话窗 messages（messages 坐标，`filterTalkMessages(objectId,self,thread)` 输出）。当前 spawn/harvest 只产 events 坐标的段——即便简单把 harvest「放开」也会把 events index 写进 talk 窗的 slot、被读侧按 `messages.length` 误解，产生错位折叠。`summarized-ranges.ts:SummarizedRange` 文档注释已钉死「两坐标系不可混」。

**设计现状锚（`knowledge/index.md` ## 元素 + 维度 self.md）：**

- `## thinkable` / `## readable` / `## collaborable`（区 B）：compress 是 window method 协议、各 class 自声明无默认；talk 窗是 readable 按他者视角对 thread 的投影、含 say/inbox/outbox。
- `## readable × thinkable` / `## collaborable × thinkable`（区 D）：会话窗把归属消息收进 transcript 并报 `consumedMessageIds`，thinkable 渲染器据此从顶层 inbox/outbox 兜底剔除（「一条信息只渲一次」）。
- `## persistable × thinkable`（区 D）：折叠态随窗持久化、视角独立（inline 第三态）。
- `## thread`（区 E）：同一 thread 按视角投影成 thread/talk/reflect_request 三 window class；mode=inline 整窗随 thread-context.json 落盘。

`compress.md`：§一核心 1/2/4/5/6/8、§3.4（两视角坐标系不可混 + tool-pair 安全 self 专属）、§四 Case E、§收敛（Case E 唯一 OPEN）。
`context.md`：核心 2（视角投影）/ 9 / 10、3.4（inbox_message 缩略 vs 全文 attention 分流）、3.7 迁移映射（self 视角已闭、talk 视角未对齐）。

## 改动提案

给 talk/peer 窗补一条**与 self 视角同构、只换坐标系（events→messages）与 seed 源**的 compress 落地，让 talk 窗 `compress`/`resize` 从惰性 flag 变为真折叠：

- **倾向方向 A（fork-summarize over messages）**：talk 窗 compress 置意图 → 框架据 talk windowId fork 一条 summarizer 子线程、seed 入该窗早期 messages 段（`filterTalkMessages` 切片）、单轮无工具出摘要 → harvest 进该窗 `win.summarizedRanges`（**messages 坐标**）。复用 `spawnSummarizerFork`/`harvestSummarizerForks`/force-wait/clamp 全套，只把「窗选择 / seed 源 / harvest 坐标」从 self-view·events 改为 talk-windowId·messages。守核心 5（摘要非 agent 自写）+「简单叠加涌现」（不引入新机制，只参数化坐标系）。
- 配套：talk 窗 `resize` 设 compressLevel（talk 窗整窗档位**真有**展示意义，区别于 self 视角 thread 窗 compressLevel 无意义改用 autoCompressLevel）。

## 受影响设计元素

对照 `knowledge/index.md` 的 `##` 元素清单（驱动后续 review fan-out）：

- `## thinkable`（区 B）—— compress 协议第二场景（peer 视角）契约补全；fork/auto-trigger/force-wait/clamp 是否扩到 talk 窗归此元素。
- `## readable`（区 B）—— talk window class 自声明 compress/resize 的语义（compressLevel 整窗档位 + summarizedRanges 折 messages 段）；window method 投影 messages-transcript、只动 win 不碰 Data。
- `## collaborable`（区 B）—— 折的是「与对端会话」的 messages（来自 say/inbox/outbox 派送）；折叠不得破坏消息方向轴语义与 inbox/outbox 真相。
- `## observable`（区 B）**[预检补漏]** —— talk compress 必产新一类 `context_compressed` 事件（现 `scheduler.ts` harvest 硬写 `scope:"events"`，talk 折须带 talk windowId + coord 标记）。动 observable「何时记、记什么」契约（context_compressed schema：talk 折填 windowIds 非空 + `coord:'messages'` + failed 必记）。**fan-out 仲裁**：badge/timeline 渲染归 `## visible`（见下）——observable 只产数据、不渲。
- `## readable × thinkable`（区 D）—— talk 折 messages 段须与 `consumedMessageIds` 去重 + attention 分流（缩略 vs 全文）共存：被折段是否仍报 consumed、折叠占位 summary 与新消息缩略提示如何并存。
- `## collaborable × thinkable`（区 D）—— 在「会话窗 transcript」上折叠，与「一条信息只渲一次」咬合的边界重审。
- `## persistable × thinkable`（区 D）**[预检纠正]** —— **不是**「state.json vs inline 待裁定」：talk 投影窗 class = `THREAD_CLASS_ID`，与 self 视角 thread 窗**同走 inline 路径**（`thread-persist.ts:isInlinePersisted` 整窗落 thread-context.json）。结论：talk 窗折叠态**复用 inline 路径、跨 reload 存活、无新增持久化分叉**；此元素仅须确认 inline 第三态契约覆盖 talk 窗折叠态（与 `## thread` 的 inline 结论一致）。
- `## thread`（区 E）—— thread 在 talk 视角下的 compress 实现（messages 坐标，对照 self 视角 events 坐标）；inline 整窗落盘口径既已覆盖。
- `## filesystem` / `## terminal` / `## interpreter`（区 E）**[预检补·显式排除]** —— tool 结果窗共享同一 transcript 折叠算子（`renderTranscriptOrHandle`/`projectSummarizedRanges`）。**本 issue 显式裁定其不在范围**：仅 talk-family 三投影 class 受影响；改动若触及 `normalizeSummarizedRanges` 夹边 / `addSummarizedRange` 写入约定，须确认不外溢到结果窗 transcript 折叠语义（防 scope 漂移）。
- `## OOC Class / Object Model`（区 A，核心 6）**[预检补]** —— talk 窗 compress 是「window method 纯函数置态、副作用由 framework 据态执行」契约在会话窗上的二次落地：talk 窗 window method 仍须保证不碰 object data（thread.events/inbox/outbox 一字不改），与同窗 `say`（object method，改 outbox）的纯度边界须守。（核心 6 边界精确化：window method 不碰 events；framework harvest 仍合法 append `context_compressed` 事件——别把核心 6 写成「compress 全链不碰 events」。）
- `## reflectable` + `## pr`（reflect_request 投影，区 B/E）**[fan-out 补漏]** —— reflect_request 是被遗漏的**第三个 talk-family 投影 class**（与 talk 共用同组 window_methods，`thread/readable/index.ts`）。范围封边「仅 talk-family 三投影」须显式纳入它；其折叠坐标/触发待与 talk 同口径裁定（reflect_request 是 self-view-super，折 events 还是 messages 待确认）。
- `## visible`（区 B）**[fan-out 补漏 + 仲裁]** —— `LoopEventBadge`/`LoopTimeline` 是 visible 渲染物（observable 产数据、visible 渲）。v1 死 reason 词表（user-compress/user-expand/idle-fold/age-fold/double-fold/cascade-fold/emergency-guard）须重写为 v2 真实词表（auto-summarized / summarizer-fork-failed / talk 折标该会话窗）+ 同步 LoopTimeline 测试。**须补派 visible reviewer**（本轮未派）。
- `## executable × readable`（区 D）**[fan-out 补漏]** —— talk 窗（THREAD_CLASS_ID 投影）同挂 `say`（object method）+ `threadCompress/threadResize`（window method），注册期同名 fail-loud 校验须确认无碰撞；agent 须能在该会话窗 `exec(method=compress)`（归属窗可达性）。
- `## app`（区 B）**[fan-out 补漏]** —— 控制面 `LoopEvent` 接口是后端 `ProcessEvent` 的 cross-package 手抄子集；context_compressed schema 改（scope→coord + windowId）+ windowsSnapshot HTTP 暴露须同步回流 app。

## 风险与权衡

- **坐标系误植**：放开 harvest 而不换坐标会把 events index 写进 messages slot → 错位折叠（最危险的 silent-corruption）。(window-selector, seed-source, coord-system) 三元组必须**同时切**——harvest 现硬写 `windowIds:[]/scope:"events"`（`scheduler.ts`），不同步切 coord/scope 即 silent 错位。
- **peer messages 坐标 index 不稳定（fan-out 揭示，比误植更深）**：`talk-render.ts` peer 分支按 `createdAt` 跨两条 thread（各自 `Date.now()` 盖戳、无强一致时钟）合并排序——乱序/时钟偏移的对端回信可 sort **回插进已折 prefix 中部**，使 `SummarizedRange{fromIdx,toIdx}` 指向错位消息集。故 messages 侧**成员资格稳定、顺序-index 不稳定**（≠ self 视角 events 单流 append-only index 稳定）。这推翻了起草期「messages 同 events 稳定」的假设（collaborable reviewer code-ground 证伪，Supervisor 采纳）。
- **三层兜底对 talk 不对称**：force-wait + clamp floor 都 keyoff `transcriptTokens`（self 视角 message 流），对 talk 窗（计入 windows 账）不生效。talk 窗的 L3 等价兜底是**已存在的窗 overflow**（`pipeline.run` `<context_overflow>`，per-round 瞬态），**不是**把 clamp 扩到 talk。但 Case D（fork failed/orphan 清 inFlight 解 force-wait）回收路径硬钳 self 窗（`scheduler.ts` isSelfThreadWindow）——talk 折 crash 会永久 inFlight 死锁且无 clamp 等价解除，故回收必须 window-agnostic 化。
- **budget 触发信号缺位**：`budget.ts:estimateTranscriptTokens` 只覆盖 self 视角 thread 窗的 message-流 transcript；talk 窗 transcript 是 XML 窗内容、计入 windows 账（`estimateWindowsTokens`）。而 `compress-trigger.ts:shouldAutoCompress` 仅 transcript-gated（self 视角）→ **talk 窗即便撑大 windows 账也永不触发自动 fork**。自动折 talk 窗须先解决「触发信号源」。
- **机制分叉风险**：若走方向 B（显式段）会与 self 视角机制分叉、且要么 agent 自写摘要（违核心 5）要么只丢不摘（信息损失）。
- **去重连锁**：折叠占位 summary 与 consumedMessageIds / attention 分流的咬合若没想清，会出现「折了还报 consumed 被双重剔除」或「折叠段与缩略提示并存矛盾」。
- **tool-pair 安全**：peer 视角折 messages 无 function_call/output 块，天然免疫 `snapRangesToToolPairs`（`compress.md` §3.4 已述），落地须验证免疫成立、不误加吸附。

## 待裁决点（fan-out 后状态）

1. **【机制走向】✅ 已裁：方向 A**（fork-summarize over messages，**参数化**现有 self-view 管道为 (window-selector, seed-source, coord-system) 三元组、读出侧零改、不复制第二管道）。thinkable 主人背书、否决方向 B（B 破核心 5）。
2. **【auto-trigger 范围】✅ 已裁：talk 窗仅手动 compress + 已有窗 overflow 兜底，不加 talk-side 自动触发**（talk transcript 计入 windows 账、非 transcript-gated；加 windows-side 自动触发会重新引入 transcript-gating 刻意防的 livelock）。`autoCompressLevel` 在 talk 窗上声明但 framework 暂不据它自动 spawn（仅响应显式 compressIntent）。
3. **【坐标系不变量】⚠️ 开放（唯一真设计分叉）**：起草假设「messages 同 events index 稳定」**被证伪**（peer 双流 createdAt 排序乱序回插）。须二选一：**(a) 只折「say-wait 已封口的 prefix 段」**（倾向——简单、与 events 单流封口同构）；**(b) range 用 message-id 集锚定**（不依赖 index 稳定，但改 SummarizedRange 锚点模型、影响共享算子）。
4. **【去重共存】✅ 已裁：consumed = 折叠前全量**（含被折段），折叠是纯函数读出投影、只改本窗渲染形态（全文/viewport切片/summary 三态之一），顶层 inbox/outbox 兜底不重现（守「信息只渲一次」松弛为「本窗负责其渲染」）。实现红线：不改 `index.ts` consumed 计算时机（filterTalkMessages 之后、render 之前的全量映射）。
5. **【compressLevel 双义】✅ 已裁：talk 窗不沾 compressLevel**。renderer（`xml.ts` `projectByCompressLevel`）对所有窗 class-agnostic 按 compressLevel 整窗折叠、无 projectionClass 特判 → talk 窗带 compressLevel 会 level≥2 抹掉整段 messages-folded transcript（display-fold 叠在 summarizedRanges-fold 上、silent 坍塌）。故：**compressLevel = 内容窗（file/search/…）展示档位专用**；**talk 窗折叠走 summarizedRanges、展示收放由 transcriptViewport + summarizedRanges 承担**；talk `resize` 设 `autoCompressLevel`（与 self 视角同字段、不引入第三档）。
6. **【范围封边】✅ 已裁：仅 talk-family 三投影 class**（talk + reflect_request；含 fan-out 补漏的 reflect_request），tool 结果窗（filesystem/terminal/interpreter，走各自 compressLevel display-fold）显式排除。
7. **【BLOCKER·实现约束】** harvest 的 orphan/failed 回收（Case D）+ scope 字段须随管道一并 **window-agnostic 化**（`scheduler.ts` 去 isSelfThreadWindow 硬钳、scope→`coord:'events'|'messages'`），否则 talk 折 crash 永久 inFlight 死锁且无 clamp 等价解除。

## review 记录

**正式 fan-out（9 元素 reviewer + 1 完整性批评官，code-grounded）：** 9 个 reviewer 全 `honors-with-caveats`（persistable×thinkable 为 `honors`）——方向 A 主路（参数化、读出零改、复用 fork）经代码核实成立且优雅、高度一致。完整性批评官裁 **NOT-READY-TO-裁决**，因 4 个 BLOCKER + 3 个漏列元素 + 2 处需仲裁：

- **BLOCKER 1（坐标+scope 同切）**：三元组必须同时切，否则 events 坐标写进 talk messages slot → silent 错位（→ 待裁决 1/7）。
- **BLOCKER 2（window-agnostic 回收 + talk L3=窗 overflow）**：force-wait/clamp 是 transcript-only，talk L3 是已存在的窗 overflow；Case D 回收须去 self-view 硬钳（→ 待裁决 7、风险段）。
- **BLOCKER 3（talk≠compressLevel）**：renderer class-agnostic double-fold（→ 待裁决 5）。
- **BLOCKER 4（peer messages index 不稳定）**：collaborable code-ground 证伪「同 events 稳定」（→ 待裁决 3）。
- **漏列元素**：reflect_request（第三 talk-family 投影）/ visible（badge 渲染，非 observable）/ executable×readable（同名校验+归属窗可达）/ app（LoopEvent 手抄+windowsSnapshot HTTP）——已补入「受影响设计元素」。
- **Supervisor 仲裁 2 矛盾**：(A) badge 渲染契约主人 = **visible**（observable 只产数据），二者成对回流但分属不同元素，须补派 visible reviewer；(B) 坐标稳定性 thinkable vs collaborable **采纳 collaborable**（messages index 不稳，证据：talk-render.ts createdAt 跨双流排序）。

## 裁决（Supervisor 部分裁决，2026-06-21）

**方向定案**：采纳方向 A（参数化、非复制）。待裁决 1/2/4/5/6 已裁（见上）；BLOCKER 1/2/3 已转为落地约束（待裁决 7 + 风险段）。

**仍须收口才能转 `decided`**：
1. **待裁决 3（坐标锚点）唯一真分叉**——id-集锚定(b) vs 只折已封口 prefix(a)。需 Supervisor 终选（倾向 a）。
2. **补派 visible reviewer**（badge v2 词表）——本轮漏派。
3. reflect_request 折叠口径（events vs messages）确认。

**落地清单（决议后，归各维度 AgentOfX，是耦合大单元、须真 LLM 多线程验证 + 人工 checkpoint，勿盲落）**：
- thinkable/thread：`compress-fork.ts`/`scheduler.ts` 窗定位 isSelfThreadWindow → 三元组参数化（self=threadWindowIdOf·events / talk=peer windowId·messages·filterTalkMessages seed）；harvest 遍历所有带 inFlightCompress 的窗 + window-agnostic 回收；scope→coord。
- readable/thread：threadResize 按投影 class 分流（self/talk→autoCompressLevel，**不碰 compressLevel**）；window method exec 体保持纯置 flag（核心 6，加 verify 钉死）。
- observable：context_compressed schema scope→`coord:'events'|'messages'` + windowIds talk 折非空 + failed 必记。
- visible：LoopEventBadge/Timeline v2 词表重写 + 测试。
- 文档成对回流：compress.md（§3.5 三元组 / §四 Case E 升「已解」/ 核心 9 talk 不进 auto-trigger / 核心 10 talk L3=窗 overflow 不对称 / 核心 4 talk resize→autoCompressLevel / 新增「单调历史窗→fold·当前真相窗→overflow」框架原则）+ index.md 各 `##` 元素成对。
- 验证：真 LLM talk 折端到端 + 跨 job reload（talk 窗 summarizedRanges/inFlightCompress inline 持久）+ crash-orphan 回收不死锁。

**框架原则（fan-out 强背书，可独立先回流）**：命名「**单调历史窗 → 持久 summarizer-fold；当前真相窗 → 瞬态 relevance-overflow**」为 compress.md 显式核心原则 + index.md `## thinkable` 成对——它是 transcript-gated 与窗 overflow 正交背后的隐含原则显式化，让新增长窗自归类（退潮、非熵增）。

## 裁决修订（top-view 再审，2026-06-21 —— supersedes 上「部分裁决」的方向 A）

用户「再想 top-view」触发对**方向 A 前提本身**的质疑 + 3-agent code-ground 验证（overflow/viewport 足够性 + reflect_request 性质 + 对抗审查），结论 **ADOPT-PARTIAL 重构**：

**核心翻转：不建 talk-fold。** summarizer-fold 本质是**自我视角**能力（管理 agent 自己那条无界 append-only 主历史 `thread.events`，单写者、index 稳）。talk 窗 transcript 是 `filterTalkMessages` 跨双流 `createdAt` 重排的**派生视图**（index 不稳；且 `harvestSummarizerForks` 从不写 talk 窗）。方向 A 的 4 个 BLOCKER 正是「把自我历史的 fold 硬套派生会话视图」的代价信号——honest 读法是 **cost > value，不建**（与 fan-out 不冲突：BLOCKER 即信号）。

- **talk compress 现在就是死路径（code 实证）**：`harvestSummarizerForks` 只写 `isSelfThreadWindow`；talk 窗的 compressIntent/autoCompressLevel 无人消费。退掉它是**退潮死 flag**，不是丢能力（建 talk-fold 反是净新工作：新 harvest target + per-talk auto-trigger + messages-index fold）。
- **talk 压缩兜底已足且非破坏**：(i) window-overflow（per-window，护多窗 count 膨胀）+ (ii) transcriptViewport（末 N/区间）+ (iii) inbox/outbox 持久、`set_transcript_window` 可拉回任意早期段。唯一窄缺口=单条长高相关 1:1 talk 窗想「摘要早期留近期」——低频 + 可经 viewport 拉回恢复，不值得为它扛 index 不稳。

**验证纠偏（必守）：**
1. **只退 talk 投影的 compress/resize**；**thread + reflect_request 保留**——reflect_request 是 `isSelfThreadWindow`、events-based、index 稳，summarizer-fold 完全适用（初版误把它和 talk 同列，纠正）。net：thread+reflect_request 留 `[setTranscriptWindow, compress, resize]`；talk 仅留 `[setTranscriptWindow]`。
2. **撤 double-fold 论据**：code 证 `threadResize` 写 autoCompressLevel 非 compressLevel，`projectByCompressLevel` 在 thread/talk 投影不触发——double-fold 现不可达。承重论据=index 不稳 + fold 冗余 + 死路径。
3. **drop index→id 锚点改造**（原待裁决 3 的 b 选项 + 计划项）：其唯一强理由（折派生不稳视图）随 talk-fold 退役而蒸发；幸存 fold 消费者（thread+reflect_request）全 events-index 稳。本身是一次退潮（砍掉计划中机制）。
4. **待裁决 3（坐标锚点 a/b）作废**（无 talk-fold 即无坐标问题）。

**框架原则（更锋利）**：summarizer-fold = 自我主历史窗（thread/reflect_request，append-only 单流）；展示档位 compressLevel = 内容窗（各自实现，已落）；派生会话视图（talk）= overflow + viewport，**不 fold**。

**落地（须用户裁定「翻 Case E 方向」后，归各维度、paired 回流——是小退潮非耦合大单元）**：
- readable/thread：talk decl 删 `threadCompress`/`threadResize`（保 `setTranscriptWindowMethod`）；thread + reflect_request decl 不动。
- 回归 grep：storybook L2 / `resolveWindowClass` / method 发现激活 无别处假设三投影都带 compress/resize。
- 文档成对回流：compress.md Case E 改「不建 talk-fold + self-view-only fold 原则」+ 撤 index→id follow-up；context.md / index.md 各 `##` 成对。
- 风险与成本**远低于方向 A**（无 4 BLOCKER、无 summarizer 子系统扩展）。

**待用户拍板**：采纳本重构（翻 Case E：方向 A→不建 talk-fold + 退 talk 惰性方法）即把 Case E 从「耦合大难题」收敛为「一次小退潮 + 一条更锋利原则 + drop 一个计划机制」。

## 落地（用户采纳 2026-06-21，status=landed）

用户采纳重构。已落地：
- **代码**（worktree 分支 `refactor/compress-v2-ebb-displayresize`）：`thread/readable/index.ts` talk decl 删 `threadCompress/threadResize`（保 `setTranscriptWindowMethod`）；thread + reflect_request 不动。回归 grep 净（import 不悬空、无测试/storybook/resolveWindowClass 假设三投影都带 fold）。tsc 编辑面零新错、thread 19 pass、core thinkable 0 fail、storybook 64 pass。
- **文档**（本仓 ooc-0）：compress.md 核心 4（三类窗框架原则 + fold 专属自我主历史窗）/ 核心 6/8 / §3.4 / §四 Case E（已解·不建 talk-fold）/ 收敛（全 case 收敛无开放项）成对回流；index→id 改造取消记入。
- 未做（不需要）：index.md/context.md/thinkable self.md 无错误 talk-fold 断言、无需改。
- visible badge v2 词表（observable×visible 漂移）= **独立 issue**，不属本 case（self-view v2 reasons 早已存在、与 talk-fold 无关）；留作后续退潮。
