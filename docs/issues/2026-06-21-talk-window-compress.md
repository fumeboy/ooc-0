---
title: compress v2 Case E —— talk/peer 窗 compress 的折叠机制与坐标系（self 视角已闭，peer 视角待补）
status: draft
date: 2026-06-21
---

# compress v2 Case E —— talk/peer 窗 compress

> 起草期已做 code-ground + 完整性预检（非正式 fan-out）：3-agent workflow 锚定真实代码核实 talk 窗 compress 现状 + 对照 index.md 映射受影响元素 + 完整性批评官纠偏。结论并入下文「受影响设计元素」与「待裁决点」（含 critic 的 3 处补漏 + 1 处纠正）。正式 review fan-out 待裁决前另起。

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
- `## observable`（区 B）**[预检补漏]** —— talk compress 必产新一类 `context_compressed` 事件（现 `scheduler.ts` harvest 硬写 `scope:"events"`，talk 折须带 messages 坐标 / talk windowId）并改 windowsSnapshot 的 compressLevel 落点（`window-hash.ts:buildWindowsSnapshot`）。动 observable「何时记、记什么」契约 + 其 web 渲染分支（`LoopEventBadge`/`LoopTimeline` 按 kind+reason 上色）。
- `## readable × thinkable`（区 D）—— talk 折 messages 段须与 `consumedMessageIds` 去重 + attention 分流（缩略 vs 全文）共存：被折段是否仍报 consumed、折叠占位 summary 与新消息缩略提示如何并存。
- `## collaborable × thinkable`（区 D）—— 在「会话窗 transcript」上折叠，与「一条信息只渲一次」咬合的边界重审。
- `## persistable × thinkable`（区 D）**[预检纠正]** —— **不是**「state.json vs inline 待裁定」：talk 投影窗 class = `THREAD_CLASS_ID`，与 self 视角 thread 窗**同走 inline 路径**（`thread-persist.ts:isInlinePersisted` 整窗落 thread-context.json）。结论：talk 窗折叠态**复用 inline 路径、跨 reload 存活、无新增持久化分叉**；此元素仅须确认 inline 第三态契约覆盖 talk 窗折叠态（与 `## thread` 的 inline 结论一致）。
- `## thread`（区 E）—— thread 在 talk 视角下的 compress 实现（messages 坐标，对照 self 视角 events 坐标）；inline 整窗落盘口径既已覆盖。
- `## filesystem` / `## terminal` / `## interpreter`（区 E）**[预检补·显式排除]** —— tool 结果窗共享同一 transcript 折叠算子（`renderTranscriptOrHandle`/`projectSummarizedRanges`）。**本 issue 显式裁定其不在范围**：仅 talk-family 三投影 class 受影响；改动若触及 `normalizeSummarizedRanges` 夹边 / `addSummarizedRange` 写入约定，须确认不外溢到结果窗 transcript 折叠语义（防 scope 漂移）。
- `## OOC Class / Object Model`（区 A，核心 6）**[预检补]** —— talk 窗 compress 是「window method 纯函数置态、副作用由 framework 据态执行」契约在会话窗上的二次落地：talk 窗 window method 仍须保证不碰 object data（thread.events/inbox/outbox 一字不改），与同窗 `say`（object method，改 outbox）的纯度边界须守。

## 风险与权衡

- **坐标系误植**：放开 harvest 而不换坐标会把 events index 写进 messages slot → 错位折叠（最危险的 silent-corruption）。必须新增 talk-windowId·messages 坐标的独立选择/seed/harvest 路径。
- **budget 触发信号缺位**：`budget.ts:estimateTranscriptTokens` 只覆盖 self 视角 thread 窗的 message-流 transcript；talk 窗 transcript 是 XML 窗内容、计入 windows 账（`estimateWindowsTokens`）。而 `compress-trigger.ts:shouldAutoCompress` 仅 transcript-gated（self 视角）→ **talk 窗即便撑大 windows 账也永不触发自动 fork**。自动折 talk 窗须先解决「触发信号源」。
- **机制分叉风险**：若走方向 B（显式段）会与 self 视角机制分叉、且要么 agent 自写摘要（违核心 5）要么只丢不摘（信息损失）。
- **去重连锁**：折叠占位 summary 与 consumedMessageIds / attention 分流的咬合若没想清，会出现「折了还报 consumed 被双重剔除」或「折叠段与缩略提示并存矛盾」。
- **tool-pair 安全**：peer 视角折 messages 无 function_call/output 块，天然免疫 `snapRangesToToolPairs`（`compress.md` §3.4 已述），落地须验证免疫成立、不误加吸附。

## 待裁决点

1. **【机制走向·主待决】** talk 窗 compress 走方向 A（fork-summarize over messages，复用 self 视角全套、只换坐标/seed）还是方向 B（显式段）？建议 A。
2. **【auto-trigger 范围】** 鉴于 talk 窗 transcript 计入 windows 账、非 transcript-gated，自动折 talk 窗须新增触发信号源——是引入 talk 窗自动阈值（autoCompressLevel + 一个 windows-side 信号），还是 talk 窗**仅手动 compress + 预算 overflow 兜底**（不自动）？
3. **【坐标系不变量】** messages 坐标的 append-only 稳定性是否与 events 坐标同等成立（Case C 不变量在 messages 侧是否成立——已发生 message 的 index 是否稳定）？
4. **【去重共存】** 折叠占位 summary 与 consumedMessageIds / attention 分流如何咬合（被折段是否仍上报 consumed）？
5. **【compressLevel 双义】** talk 窗 compressLevel（整窗档位有展示意义）与 self 视角 thread 窗（compressLevel 无意义、改用 autoCompressLevel）是「同字段不同语义」还是须分字段——避免 renderer display 折叠路径在 talk 窗误触？
6. **【范围封边】** 确认 tool 结果窗（filesystem/terminal/interpreter）不在本次范围（仅 talk-family）。

## review 记录

（正式 fan-out 后由 Supervisor 汇总各受影响元素 reviewer + 完整性批评官意见。起草期 code-ground + 完整性预检结论已并入上文。）

## 裁决

（最终方案 + 落地与一致性回流清单。）
