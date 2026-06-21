---
title: OocObjectInstance 剥离 window 状态 —— object 与 context window（= object ref）分离
status: verified
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

经 design-decision workflow（兼任 review fan-out）：两个结构方案（A session 全局 object 表 / B inline-vs-ref 对齐持久）+ 排序分期 + 受影响元素契约影响 + 完整性批评，全部锚 worktree `feat/object-contextwindow-split`（=main）真实代码核验。**无真冲突**。提案路径漂移已勘误：`thread-persist`/`flow-thread-context` 在 `builtins/agent/children/thread/persistable/`（非 core/persistable）。实测面：`OocObjectInstance` 32 文件、`ContextWindow/contextWindows` 61 文件（含 web）。

## 裁决

**结构：方案 B（inline-vs-ref 对齐持久）**——`OocObject {id,class,data}`（持久身份）+ `ContextWindow = InlineWindow | RefWindow`（InlineWindow 内联 object / RefWindow 仅持 objectRef）。`closable/status/title/win/createdAt/parentObjectId` 归 **window 侧**；`id/class/data` 归 **object 侧**。**投影 class 渲染期算、不入窗结构**（待裁决 #3：不并入本 issue）。

**内存解析（一锤定音）**：thread-scoped，**不引入全局/session object 表**。inline 窗 data 原地（`window.object.data`）；ref 窗经 `WindowManager.objectCache: Map<objectId,{class,data}>` 解析，多 ref 窗共享同一 data 引用（落实「共享=第二个 view」），close 末 ref evict。

**分期**：P0 并行类型(additive 零行为)+回归网 → P1 WindowManager(object/view-update 拆分 + referencedObjectId 双读 objectRef.objectId，adapter 锁 blast radius) → P2 真 objectCache + 读者迁移 + 删 self 门面窗 `class:objectId` 疤痕 → P3 持久对齐 + dogfooding 迁移 → P4 删别名/退潮/文档回流。每期独立可合入+绿。

**排序**：**现在可做**——compress-v2 已 landed、全活在 `win`（view 侧，拆分几乎不动它）。**唯一硬约束：冻结 `isSelfThreadWindow` / `w_creator_<threadId>` id 约定**（compress + lifecycle 双承重，改它无编译错静默打断）。

**closable/win/refcount 迁移**：随拆分落 window 结构；`referencedObjectId` 升级读 `objectRef.objectId`——这恰是 lifecycle phase-2「referencedObjectId 扩 member/peer」的合并项。

**buffer/view doc（2026-06-12）部分 supersede**：P1（删 SharingState[已无 live]/isSelfWindow 绕过 + struct 服从 glossary）由本 issue 接管；P2（开放类型轴）已先落；P3（builtin 三角色）+ §7 约束（HOLD tiling/不增 buffer 名词/不动 4 原语）留存、本 issue 继承。

**受影响清单补漏（completeness）**：observable/window-hash（哈希输入变 object+view 两源）、**BudgetManager token 计量新契约缺口**（一 object 多 view→token 按 object 计一次 / view 各计自己）、visible/web ~20 文件、lifecycle phase-2 耦合、collaborable、isInlinePersisted 判据。

## 裁决修正（2026-06-21，方案 B → A：统一 ref + session 对象表）

用户拍板把**目标结构**从方案 B 改为 **统一 ref + session 对象表**（接近原否决的 A，但否决理由已反转）：

- **Object（单一真相）**：一个 session 内 `objectId → 唯一一个持 data 的 ooc instance`，活在 **session 作用域对象表**。
- **ContextWindow = 纯 ref**：只持 `objectId`（指向）+ 本窗视角态（status/title/win/closable/投影 POV/createdAt/parentObjectId）。**任何窗都不持 object data**（含原 B 的 inline 窗）。
- 多窗 ref 同一 objectId → 经对象表解析到同一 instance、读同一份 data。

**与原 B 的差**：B 让 inline 窗内联 `{class,data}`、只有 ref 窗持 ref + objectCache（**thread-scoped**）；A 是**所有窗纯 ref + 一张 session 对象表持唯一 instance**。故 **P3 已落的 `window.object={class,data}` 是过渡态**，目标要把 data 从窗彻底移到对象表、窗只剩 `objectRef`。

**为何反转「否 A」**（原因曾是：偏离大 + 行为熵增）：
- **净降熵**：消除三套并存的临时机制——「每窗一份 data 拷贝」「门面窗 data={} 渲染期现算」「跨 thread 经 state.json 做隐式共享后端 + last-writer-wins 整份覆盖」——收敛成一张表。
- **与 lifecycle 同构**：refcount 已是 **session 作用域**数引用（`countSessionReferences` 遍历可达 thread）；对象表正是 active/unactive 落点、refcount = 表项的 ref 数。A 让 split 与 lifecycle 合一；B（thread-scoped cache）反与 session-scoped refcount 错配。
- 「改一处处处见」「token 按 object 计一次」在 A 下免费成立（见 objectcache 调查：B 的 thread-scoped cache 够不着 cross-thread、而 cross-thread 才是这俩诉求的真正落点）。

**受影响设计元素**（对照 index.md，待 review fan-out 逐一核契约）：对象模型（self.md 核心 1/4/10：窗=ref、对象表、refcount 落点）/ persistable（窗持久化降纯 ref + 对象 state 单写；inline 对象如 thread 自身怎么落）/ thinkable·context（init 注入、投影渲染从对象表取 data、_renderedWindows）/ executable·window-manager（instances Map → session 对象表、dispatch self 从表取）/ collaborable（跨 thread 共享=ref 同一表项）/ observable·window-hash + BudgetManager（按 object 计）/ runtime·lifecycle（refcount=表项 ref 数）。

**待 review 解的上游问题**：
1. **snapshot vs live-ref**（context.md Case A/B 未决）：跨 thread 多窗 ref 同一对象，读**实时同一 instance**（live-ref，改即可见）还是 **copy-on-share 快照 + 失效事件**？统一 ref + 单 instance 暗示 live-ref——须确认是否接受（含并发 job 写竞争）。
2. **对象表 owner 与边界**：表挂哪（session 级 runtime handle？）、跨 thread 并发读写、与 stone/flow 持久层关系。
3. **inline 对象归宿**：thread 自身这种「随 thread-context 整存」对象，在对象表模型里是表项 + 内联持久，还是特例。
4. **过渡分期**：P3 的 `window.object` → `objectRef` 怎么分阶段（含 web/visible ~20 文件、collaborable）。

## 裁决修正 II（review fan-out 汇总，2026-06-21）

7 元素 reviewer 全判 `sound-with-conditions`、完整性批评官判 `approve-with-conditions`——**B→A 反转批准**（否 A 的「行为熵增」在统一 ref + 单 instance + 与 session-scoped refcount 同构下确实反转为净降熵；disk 早已是 A 形态 `flows/{session}/{objectId}/`，A 只是把内存对齐 disk 既有 single-owner）。三上游决议拍定、两处裁决文字纠错、四个漏列元素补登：

**三上游决议（拍定）**：
1. **snapshot vs live-ref = 按作用域二分**（锚真实并发模型：worker `Promise.all` 并发 job 各自 `readThread` 独立内存树、互不共享内存 instance）：
   - **同 job fork 子树内存树 = live-ref**（多窗 ref→同一 instance、改即可见）。单 job = 单 driver 串行推进 → **无数据竞争、本轮不引入任何锁**。这是「改一处处处见」唯一真能 fire 的地方。
   - **cross-job / cross-session / cross-object = 维持磁盘 last-writer-wins**，A 不承诺 live、物理上也做不到（两 job 各 readThread 两份内存）。**Case A 在该层仍开放**。
   - **严禁笼统宣布「A 消解 Case A」**（collaborable「作用域错配陷阱」：同 session「看起来 live」会给 cross-object 仍 last-writer-wins 制造虚假安全感）。
2. **对象表 owner = session 级 runtime handle（归 `## runtime` 元素）**。WindowManager 出局（per-call/per-thread、寿命/作用域都不够）；persistable 出局（磁盘层、协作非归属）；runtime 胜出（已是系统级对象操作 + create_object 入口 + refcount/lifecycle 落点）。**非永生全局表**：随单个 job 执行上下文存在、job 结束释放（化解「无限增长无 GC」）；= 磁盘 `flows/` 的运行态镜像/解析缓存，磁盘仍是真相。
3. **inline 对象（thread/todo）进表作运行态 data residence + buildEntries 仍整窗 inline 落盘**（磁盘格式冻结、option a）。thread 双角色（既 inline 会话窗、又容器自持 save/load）由 **`## thread` 元素**主人单独裁。

**两处裁决文字纠错（必修）**：
1. **token 计量**：删去「token 按 object 计一次免费成立」——**错**。批评官裁定 collaborable 对：同一 objectId 在 thread/talk 两视角渲**不同文本**（core 9 多视角投影），两份都真占 LLM context 预算、**必须按窗各计**。正确口径＝「**data 存一份（A 的真红利）但 token 仍按窗各计其渲染产物**」（budget 语义不变、改造最小：`estimateWindowTokens` 序列化「窗 ref + 经表 hydrate 的 data 投影」按窗各计、不去重）。
2. **Case A**：按上游决议 #1 作用域二分，不笼统消解。

**漏列受影响元素补登**（index.md 注册表 + self.md 成对回流）：`## runtime`（对象表 owner，本轮真漏的主人）、`## thread`（inline 归宿主人）、`## visible/web`（窗降纯 ref 后前端拿不到 data，须后端预 hydrate 下发——不可把对象表暴露到 HTTP）、`## executable × readable` 交叉契约（dispatch `self` = 对象表共享 data 引用〔object method〕/ `before_win` 仍取本窗 win〔window method〕，须显式重述防 win 误挪进表断 compress v2）。**index.md 实测零登记「对象表」——P4 落地须新增条目**。

**其他裁定**：`read_only` 不废除、降格为「未来 cross-actor share 的设计储备」（本轮只声明 in-process live-ref）；冻结点 `isSelfThreadWindow`/`w_creator_<threadId>` 全程不动；`win` 留窗侧不入表（compress v2 承重）；核心 1/4/10 **句子不改**（A 是其兑现非修订），改动落细节补充层（新增「对象表 = 实例 session 级 single-source / ContextWindow = 该实例 ref」+ self.md:71 `OocObjectInstance.closable` 改述为 window 侧字段）。

**落地前置（并发 peer 陷阱已显形）**：worktree `feat/object-contextwindow-split` 现 **6 ahead / 27 behind main**；main 已落 `ba02c165 退役 state.json → 裸 data.json`（动我 P3 改过的持久层）+ A1/A2 前端 + stone-scope。**P4 须从 rebase 到当前 main 的基线开工**（吸收 state.json→data.json，P3 的 `flow-runtime-object` state.json 翻译随之简化/作废），否则持久层冲突 + review 的 state.json 行号锚失效。

**分期（refined）**：rebase worktree→main → **P4a** runtime session 对象表 + 窗降 `objectRef` + `objectDataOf`/`classOf` 改读表（内存单点、磁盘冻结、行为安全）→ **P4b** 末-ref-evict 并进 `dispatchUnactiveIfZero` 的 `{delete}` 钩子 + 补 active init seam（lifecycle phase-2 合并）+ budget/window-hash「按窗各计」回归网先红后绿（防 ref 窗 token 塌零静默失效）→ **P4c** 退潮删别名/门面窗 `class:objectId` 疤痕 + 全树文档成对回流。每期独立绿（tsc core+thread / split-invariants / object-lifecycle / storybook 四门禁）。

**落地进度**：
- [x] **P0-a** 并行 draft 类型（`OocObject`/`WindowView`/`InlineWindow`/`RefWindow`/`ContextWindowSplit`，additive 未启用、alias 不动，tsc 绿）—— `context-window.ts`（worktree 520e62ef）。
- [x] **P0-b** 回归网 `split-invariants.test.ts`（refcount / window-hash content-sensitivity / WindowManager round-trip 不丢 win，4 绿）（79bbed85）。
- [x] **P1** 独立对象窗自描述 `objectRef` + `referencedObjectId` 双读（= lifecycle phase-2「扩到 member 窗」合并；additive+adapter 兼容；行为安全：无 member active/unactive body→fast-path）。gate：tsc core+thread 0 / split-invariants+object-lifecycle+thread 42/0 / storybook 64/0（7876260a）。
- [x] **P2a** `objectDataOf`/`classOf` accessor —— 读者取 object data/class 的收敛点（worktree f7a48181，零行为）。
- [x] **P2b** 29 文件读者迁移到 accessor（bdbd0463，纯路由零行为；WindowManager seam / hydrate / mutation alias 正确未迁；tsc 无新错 / 773 测 / storybook 64/0）。
- [x] **P3（struct flip，crux）—— landed**（worktree 4bdcbed5）：**对象身份 `data`/`class` 从窗信封顶层收进 `object:{class,data}` 子对象**，与窗视角态（id/title/status/createdAt/parentObjectId/win/closable/objectRef 留顶层）结构分离 = 用户「剥离」那一刀。`objectDataOf(w)=w.object.data` / `classOf(w)=w.object.class`，29 读者站点不动。**磁盘格式不变**：thread-context.json inline entry / 独立对象 state.json 仍平铺 `{class,data}`，buildEntries 写盘 `.object`→平铺、hydrate 读盘平铺→`.object`，翻译于持久边界；新增显式 `InlineThreadContextEntry` 磁盘类型。**零行为**：每窗各持自己 `.object` 副本。捎带修 `hasCreatorChannel` 潜伏 bug（原读裸 `w.data`，flip 后恒 undefined→恒 false）。
  - **决策：语义变更拆出 P3**。原 P3「option c：objectCache 让 ref 窗共享同一 `.object` 指针」会改 mutation 可见性 + token 计量（**语义变更**），与「剥离」（纯结构）不同质——拆到 P4 单独验证（勿过度机制化：split 目标不依赖共享）。
  - **id 二元已解**：thread 一条只一个 inline 窗；talk/reflect_request 渲染期投影、非独立存窗。ref 窗 id=objectId（现 1:1）。
  - 独立验收：4 门禁绿（tsc 无新错 / core+thread 773 / storybook 64 / no-deprecated）+ 全 cast-hidden 站点（flow-runtime-object/window-hash/talk-delivery/wait/grep-impl）逐一核为 accessor-safe + 磁盘平铺写读两端一致。
- [x] **rebase → 当前 main**（worktree 6 ahead/0 behind，base 32c0a72e）：吸收 `ba02c165 state.json→data.json` + A1/A2 + stone-scope；冲突解 8 文件（模式=main 结构 + 我的 accessor 路由）；门禁全绿（详见 memory）。安全网 `backup/split-pre-rebase`。
- [x] **P4a（session 对象表，B→A 核心）—— landed**（worktree 1d9083b7）：`core/runtime/session-object-table.ts`——一个 session（内存线程树）内 `objectId → 唯一持 data 实例`（identity map，挂根 thread `_objectTable`，runtime-only/job-scoped/非永生）；ContextWindow=对它的引用，内存 `window.object` 解析为指向表项的共享引用、磁盘仍持 `objectRef`（持久格式不变）。`WindowManager.fromThread`+`instantiate` 收敛窗 object 到表单一实例；`removeObjectFromSession` 末-ref-evict 删表项（核心 10 无悬空引用）。**工程取舍**：`.object` 留内存（共享指针）→ `objectDataOf`/budget/window-hash/persistence/29 读者**全不变**，批评官两高危项（ref 窗 token 塌零/hash 丢内容敏感）自动不发生。回归网 `session-object-table.test.ts`（5 pass：共享/live-ref/不误共享/evict/objectKeyOf）。gate：tsc 非 web 空/core+thread 757 pass 0 fail/storybook 64/0。
- [x] **P4b —— 并入 P4a（无新代码）**：末-ref-evict 已在 P4a；budget/window-hash 在共享指针下「按窗各计」即现状语义、无需改（裁决 II 纠错已确认 token 按窗各计、非去重）；**active init seam dormant**（无 facade class 有 active body，fast-path no-op，延后到首个 active body 出现）。
- [x] **P4c 文档成对回流 —— landed**（ooc-0）：index.md 核心 4（新增 session 对象表 single-source + window=ref）+ `## runtime`（对象表 owner 登记）；object self.md 新增「### 对象表与引用（核心 4）」细节补充（含 live-ref 作用域二分 / token 按窗各计 / read_only 降储备 / **现状诚实：表多 1:1 待 objectId 去重**）；`knowledge/lifecycle.md` 新增「五、session 对象表」实施走查。doc-drift + no-deprecated 门禁绿。
  - **退役（验收退潮 gap，已补）**（worktree 5e99dbd6）：P0-a 当初为**方案 B** 引入的 5 个 draft 类型（`OocObject`/`WindowView`/`InlineWindow`/`RefWindow`/`ContextWindowSplit`）= B→A 反转后零 importer 死代码、注释按已否决的 objectCache/P2/P3 路线图——已删，并把 `objectDataOf`/`classOf` 注释改方案 A 口径（`.object`=指向 session 对象表单一实例的共享引用）。
  - **暂留（非阻塞、harmless）**：`ContextWindow=OocObjectInstance` 别名按现结构语义正确未删；self 门面窗 `class:objectId` 在单例 object=class 模型下正确、未删；均记为后续独立退潮。
  - **executable × readable 交叉契约 enrich（验收 gap，已补）**：index.md `## executable × readable` 显式重述 B→A 下 `self`=对象表共享 data 引用 / `before_win`=本窗 win（不入表）。

## 落地验收（design-workflow step 4）

并发派 4 验收官（代码 / 文档 / 退潮 / 漂移）对照本 issue 承诺独立核：**代码 verified**（session-object-table + 接线 + 回归网真在，门禁亲跑绿）/ **文档 verified**（index.md↔self.md↔lifecycle.md 成对一致、无过度宣称）/ **退潮 gaps-found→已补**（死 draft 类型，见上）/ **漂移 verified**（无提案外夹带；shared-pointer-vs-字面-pure-ref 取舍已诚实标注；表 1:1/inert 边界陈述属实）。低优记录：① issue 内 P0-a..P3 commit hash 经 rebase 重写已失效——以合入 main 后的 `git log` 为准（不逐一追旧 hash）；② tsc 门禁需前端 node_modules 装好环境复跑（缺 deps 时 .tsx 误红，非 split 引入）。所有 gap 已补、无残留 → **verified**。

> 状态：**B→A verified（P0–P4 + rebase + 验收补缺全 landed）**。窗=ref + session 对象表（一 objectId 一持 data 实例）的**结构与解析层**已钉死、全绿、文档成对回流、验收无残留缺口。**诚实边界**：跨窗 data 真实共享当前稀有（独立对象每 open 新 id、门面窗 data 空 → 表多 1:1），本期是结构地基；让共享真正生效需后续「稳定/去重 objectId」（独立 issue）。**已合入 main**：FF @`8e3be4f5`（合前并发陷阱核查通过〔主工作区 on main / 干净 / 无 MERGE_HEAD〕，merged 主工作区门禁复跑绿〔tsc 非 web 空 / core+thread 757 pass 0 fail / no-deprecated OK〕；8 commit P0a..退潮，base d54dd0b3）。
