---
title: OocObjectInstance 剥离 window 状态 —— object 与 context window（= object ref）分离
status: draft
date: 2026-06-21
---

# OocObjectInstance 剥离 window 状态：object 是 object，context window 是 object ref

## 背景 / 动机

对象生命周期工作（issue `2026-06-21-object-activation-lifecycle`）把「**context window 即对 object 的引用**」立为核心契约（self.md 核心 10、refcount 即数引用窗）。但实现里 `ContextWindow` 只是 `OocObjectInstance` 的别名（`packages/@ooc/core/_shared/types/context-window.ts:40` `export type ContextWindow = OocObjectInstance`）——**同一个 struct 既扛 object 身份/业务数据，又扛 window 的投影/生命周期状态**。

这正是 `docs/2026-06-12-context-window-buffer-view-redesign.md` 裁决点名的最深债：「window 命名却塌回一 struct 扛六重身份」。`closable` 放哪的讨论（放 `OocObjectInstance` 信封 vs `win`）把这条债顶到了台面——根因是**类型层没把 object 与 context window 分开**，所以任何「这是窗属性还是对象属性」都没有干净的落点。

用户提议：**object 是 object，context window 是 context window，且 context window 本质是 object ref**；从 `OocObjectInstance` 剥离 window 状态。

## 现状

- `OocObjectInstance`（`packages/@ooc/core/runtime/ooc-class.ts:77`）单结构混装三类字段：
  - **object 身份/数据**：`id` / `class` / `data`（+ persistable 落盘）。
  - **window 投影/生命周期**：`status`(WindowStatus) / `title` / `win`(投影态) / `closable` / `parentObjectId` / `createdAt`。
- `ContextWindow = OocObjectInstance`（别名，无独立类型）；`thread.contextWindows: OocObjectInstance[]`。
- 设计层（index.md `## OOC Class/Object Model` 核心 1/4/10）已把 object 与 context window **概念上分开**（核心 4：object 经 readable **投影**成 window；win 与 data 分离持久化；核心 10：context window 即引用），但**类型层没落实这条分离**——概念已分、struct 未分。
- 持久化层其实已有分离的雏形：inline class 整窗落 `thread-context.json`，独立对象落各自 `state.json`、窗只存 `_ref`（persistable self.md 核心 4）——即「窗是引用、对象数据在别处」已是持久模型，只是**运行态内存结构还没对齐**。

## 改动提案

把 `OocObjectInstance` 拆成两个正交结构（方向，细节留待裁决）：

- **object（持久身份）**：`id` / `class`（注册 class）/ `data` / persistable。一个 object 一份，跨多窗共享。
- **context window（object ref + 视角态）**：引用一个 object（`objectId`/ref）+ **本窗自己的**投影/生命周期态：投影 class（视角动态算出、可异于 object class）/ `status` / `title` / `win` / `closable`。

由此：
- 「context window 即引用」在类型层成真；refcount = 数引用同一 object 的窗，名实相符。
- `closable` / `status` / `win` 干净落在 **window** 结构（不再纠结放 object 信封还是 win）。
- **一个 object 可被多个 window 引用**（不同 thread / 同 thread 多视角）——落实 buffer/view 裁决的「共享 = 开第二个 view」，消解 SharingState/isSelfWindow 这类绕过手段。
- 与持久化 inline/`_ref` 模型对齐：inline object 随窗、独立 object 经 ref 解析。

## 受影响设计元素（对照 index.md `##` 清单）

- `## OOC Class/Object Model`（A，**核心元素**）—— 重定义 object vs context window 的类型边界；触动核心 1（class 构成）/ 核心 4（投影成 window）/ 核心 10（context window 即引用、win 与 data 分离）。
- `## thinkable`（B）—— ContextWindow 是 thinkable 的概念（LLM 看见一组 ContextWindow 对象）；context 构造管线消费它。
- `## readable`（B）—— readable 把 object **投影**成 window；`ReadableProjection{class, content}` 的 class = 投影 class（视角动态）；win 是投影态。拆分后投影的输入（object）/输出（window）类型需重定。
- `## executable`（B）—— object method（改 data）vs window method（改 win）经同一 exec-by-name 入口分派、收 `(ctx, self, …)`；`self` 是 object 数据还是 window 取决于这次拆分。
- `## persistable`（B）—— inline vs `_ref` 已是「窗=引用、数据在别处」的持久模型；内存结构对齐后两者关系更直；thread-context.json entry 形态。
- `## thread`（E）—— thread inline 窗、`thread.contextWindows`、生命周期 canceled/级联（refcount 数窗）全建在该结构上。
- 交叉：`## readable × thinkable`（ReadableProjection 消费）/ `## executable × readable`（window method on win / object method on data 的 self 分流）/ `## persistable × thinkable`。
- **关联未结清的设计**：`docs/2026-06-12-context-window-buffer-view-redesign.md`（P1 struct 服从 glossary 删 SharingState/isSelfWindow + P2 开放类型轴 + P3 builtin 三角色）——本提案是其 P1/P2 的核心；issue `2026-06-21-object-activation-lifecycle`（核心 10 的 closable/win/refcount 落点会随拆分迁到 window 结构）。

## 风险与权衡

- **重构面大**：~47 个 core+builtin 非测试文件引用 `OocObjectInstance`/`contextWindows`（WindowManager、readable/executable 分派、persistable hydrate、observable window-hash/diff、object-lifecycle、worker…）。
- **与在飞工作冲突**：compress-v2（`win.summarizedRanges`/resize/compress）正在 main 上活跃迭代、全压在当前 `win` 结构；刚落地的对象生命周期（closable/win/refcount）也建在现结构。**贸然拆会与两者大面积冲突**——须排序（很可能 compress-v2 稳定后再动）。
- **内存对象解析模型未定**：窗变成 ref 后，object 数据在内存哪解析？（per-thread/session object 表 id→object？还是 inline object 随窗、独立 object 经 ref 解析、对齐持久 inline/`_ref`？）——这是拆分能否干净落地的关键。
- **投影 class vs object class**：窗的 `class` 现在是**投影 class**（视角动态，如 thread object→talk/thread/reflect_request），异于 object 的注册 class。拆分须显式区分二者（关联 buffer/view P2 开放类型轴）。
- 非过度机制化：本质是**退潮**（拆掉一 struct 扛六身份的混装），净简化；但执行规模大，须分期 + 防回归。

## 待裁决点

1. **拆分结构形状**：object 结构 = {id, class, data}（+persistable）；window 结构 = {objectRef, 投影 class, status, title, win, closable}？`parentObjectId`/`createdAt` 归哪侧？
2. **内存对象解析**：窗=ref 后 object 数据怎么在内存被解析（全局/session object 表 vs inline 随窗+独立经 ref）——与持久 inline/`_ref` 如何对齐。
3. **投影 class 落点**：窗持「投影 class」、object 持「注册 class」——是否借此并入 buffer/view P2「开放类型轴」（runtime registry 替编译期 union）。
4. **是否 supersede `docs/2026-06-12-context-window-buffer-view-redesign.md`**：本提案与其 P1/P2 高度重叠——合并为一条工作线，还是本 issue 收编那份 doc。
5. **迁移分期 + 排序**：与 compress-v2（活跃）、对象生命周期（已落）的先后；一次大改 vs 分阶段（先并行类型、后逐模块迁移、最后删别名）。
6. **closable/win/status 迁移**：随拆分从 `OocObjectInstance` 信封迁到 window 结构（解掉触发本 issue 的 closable 落点纠结）。

## review 记录

（待 fan-out：每个受影响设计元素各派 reviewer + 完整性批评官；本 issue 触动核心元素 + 大重构面，review 应重点压「拆分形状是否自洽」「内存对象解析模型」「与 compress-v2 排序」「是否吃掉 buffer/view doc」。）

## 裁决

（待 Supervisor 汇总裁决）
