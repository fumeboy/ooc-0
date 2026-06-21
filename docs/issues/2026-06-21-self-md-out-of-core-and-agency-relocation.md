---
title: self.md 持久化逻辑出 core 归 agent builtin + end/todo agency 迁 thread
status: landed
date: 2026-06-21
---

# self.md 出 core 归 agent builtin + end/todo 迁 thread

> 实现侧 spec/plan 在父仓 `docs/2026-06-21-self-md-out-of-core-and-agency-relocation-{design,plan}.md`（分支 `refactor/self-md-to-agent-builtin`，基于 `design/object-activation-lifecycle`）。本 issue 是其设计契约层的 review 留痕。

## 背景 / 动机

两处"框架 core 承担了本属 builtin/具体维度的职责"的不良设计，违反既有契约：

1. **self.md 实现错位**：`self.md` 是 agent 实例独有身份（`## OOC Class/Object Model` 核心 10），其读写实现（`core/persistable/stone-self.ts` 的 `readSelf`/`writeSelf`/`selfFile`）却长在 core；且 `createStoneObject`（`core/persistable/stone-object.ts`）给**每个** stone 写空 self.md + readable.md——非 agent object 不该有 self.md（核心 10）。这违反"core 只提供框架原语、自定义持久化逻辑归 builtin"（thread 持久化已先行下沉 thread builtin 为先例）。
2. **agency 错置**：`end`/`todo` 是 thread 作用域操作（`end` 标记 `ctx.thread` 结束、`todo` 在当前 thread 上下文造 todo 子对象），却被放进 agent 的 agency。`## OOC Class/Object Model` 核心 10 已只列 `talk`，但 `## agent`（E）仍写 agency = `talk/plan/todo/end`——文档自相矛盾。

## 现状

- `## OOC Class/Object Model` 核心 10：agent「持 talk method」「self.md 只活在 self 门面窗、不进 thinkloop instructions」。
- `## agent`（E）：「持 talk/plan/todo/end 等 agency」；「data.self 由 persistable 写入/读回 self.md，渲为 self 门面窗 self 视角内容（他者视角渲 readable.md）」。
- `## persistable`：持久化逻辑可自定义，缺省写 state.json；self.md 是 agent 的自定义持久化。
- `## readable`：Object 自己的 readable 把 Data 投影成 window；静态 readable.md 是最低优先级兜底。
- `## readable × thinkable` / `## persistable × thinkable`：self.md 的读取由 persistable stone 寻址决定、thinkable 渲进 self 门面窗。

## 改动提案

行为保持的实现搬迁（core 终态不拥有 self.md 读写实现、不自动建 self.md），**不引入新机制、不改契约语义**，只把实现归位：

1. **P1（persistable）**：`stone-self.ts` 的 `readSelf`/`writeSelf`/`selfFile` 下沉 `builtins/agent/persistable/self-md.ts`（依赖 core 的 `stoneDir`/`resolveBuiltinReadDir` 经 import，方向同 thread-json）。core 少数合法读者（renderer 经 registry 派发 / GET·PUT /self 端点 / create 流程）从 builtin import 回来。`createStoneObject` 停建空 self.md + readable.md。
2. **P2（控制面，行为保持）**：四个版本化源码编辑端点（self/readable/executable/knowledge）**全部保留**，只把 self 的 `readSelf`/`writeSelf` import 重定向到 builtin。（"端点塌为通用 stone-file-edit 原语 / class visible 改 data" 是另案，不在本 issue。）
3. **P3（readable）**：agent 新增自定义 readable module 渲 `data.self`；renderer 在 `resolveProjection` 对 self 门面窗经 `registry.resolvePersistable(inst.class).load()` hydrate（self 门面窗注入时 data 空），再交 agent readable 投影；删 renderer 默认投影里 self-view 的 readSelf 分支（peer-view 的 readReadable 留 core、通用）。
4. **P4（persistable）**：`createStone` 仅当对象是 agent（`class=_builtin/agent`）才写 self.md；非 agent displayName 降级到 objectId（前端既有降级链）。
5. **Task2（executable）**：`method.end`/`method.todo` 从 `agent/executable/` 迁 `agent/children/thread/executable/`；agent agency 收敛为 talk/plan；end/todo 注册为 thread 的 object method。

## 受影响设计元素

对照 `knowledge/index.md` 的 `##` 元素清单：

- `## OOC Class/Object Model`（A）—— 核心 10 agency 口径（确认收敛为 talk/plan + 是否波及 §四骨架）；self.md 独有性。
- `## executable`（B）—— object method 归属：end/todo 从 agent 迁 thread，agent agency = talk/plan。
- `## readable`（B）—— 默认投影改：agent 由「无自定义 readable」改为「自定义 readable 渲 data.self」；self-view 不再走 readSelf 默认投影。
- `## persistable`（B）—— self.md 读写实现归属 agent builtin；createStoneObject 不再建 self/readable.md；与「持久化可自定义/缺省 state.json」契约的一致性。
- `## agent`（E）—— agency 列表 talk/plan/todo/end → talk/plan；self×readable（自定义 readable）；self×persistable（实现归 builtin）。
- `## thread`（E）—— thread 新增 end/todo object method（thread 作用域操作）。
- `## readable × thinkable`（D）—— self 门面窗渲染路径改（hydrate + agent readable）；附带既存漂移「self.md 进 instructions」vs 核心 10「不进 instructions」。
- `## persistable × thinkable`（D）—— self.md 读取路径：renderer 不再直接 readSelf，改 registry 派发 load。
- `## executable × readable`（D）—— window class 的 object_method surface：end/todo 由 self 门面窗移到 thread 过程窗。

## 风险与权衡

- **core→builtin import 方向**：core 已有此先例（thread-json `readThread`/`writeThread`、18 处 core 非测试源 import @ooc/builtins），非新债。
- **循环依赖**：builtin/agent 依赖 core/persistable，core 反向 import builtin/agent/persistable/self-md——与 thread 同构，ESM/bun workspace 既有此环、可运作。
- **displayName-vs-核心10 张力**：UI 给所有 object 读 self.md 首行做 displayName，与「非 agent 无 self.md」相左；本次靠降级链兜底，协议重设计另案。
- **既存文档漂移**：self.md 进 instructions（与核心 10 矛盾）——非本次引入，review 时应顺手退潮。（注：原列的「reportDataEdit code 未实现」经 review 实证**有误**——已实现，见 review 记录第 4 项，已订正移出退潮。）
- **测试**：大量测试 import readSelf/writeSelf/selfFile 自 core——行为保持 refactor，按账本最后统一改 import 路径跑绿（不删端点用例，TC-PERS-02 应继续通过）。

## 待裁决点

1. P3 取 P3b（agent 自定义 readable，已定）vs P3a（renderer 用 inst.data.self）——已定 P3b，确认对 `## readable` / `## agent` 契约表述的影响无遗漏。
2. createStoneObject 同时停建 readable.md（已定一起删）——确认对 `## readable`「readable.md 最低优先级兜底」契约无副作用（空文件本就等价不存在）。
3. 既存漂移（reportDataEdit / self.md-进-instructions）是否纳入本次退潮，还是另立 issue。

## review 记录

7 reviewer（OOC Class/Object Model · executable · readable · persistable · agent · thread · 完整性批评官）fan-out 汇总：

**🔴 实现缺口（issue 提案漏，必须补进实施）**
1. **thread/readable 必须 surface end/todo**（executable + thread）：method 迁 `thread/executable` 后，`thread/readable/index.ts` 的 `thread` 投影窗（self-view 非 super）`object_methods` 必须加 `end`/`todo`，否则注册但 LLM 不可见、静默失效。`talk`/`reflect_request` 投影窗**不** surface（end/todo 是 self-view thread 自管）。
2. **agent.md frontmatter `description`**（agent）：带 `activates_on: object::root: show_description`，直接喂 LLM，仍写 `agency talk/plan/todo/end` / 「无自定义 readable」会误导 LLM——必须同步改 talk/plan + 自定义 readable。
3. **P3 agent readable module 必带 window decl**（readable）：除渲 `data.self` 外，须声明 self 门面窗 `object_methods:[talk,plan]`，否则 agency 静默失效（现 agent 无 readable，self 门面窗 agency surface 走默认投影 window decl——P3 接管后必须显式声明，且只列 talk/plan）。

**✅ 纠正 issue 的错误断言**
4. `reportDataEdit` **已实现**（persistable + 完整性批评官实证：`core/executable/contract.ts:85` 声明、`core/runtime/window-manager.ts:253` 注入、`core/runtime/window-persistence.ts:39` 实现，多个 builtin `await ctx.reportDataEdit?.()` 在用）。issue 风险节「code 未实现」是误判，**移出退潮清单**。

**🌊 该一并退潮的既存漂移（代码权威=不进 instructions，核心 10 对）**
5. 「self.md 进 LLM instructions」三处：`index.md:136`（readable×thinkable）+ `thinkable/self.md` identity 子模块 + `thinkable/knowledge/tests.md` TC-THINK-02 描述。统一为「不进 thinkloop instructions，渲为 self 门面窗 self 视角内容」。
6. `index.md:140` 幽灵函数名 `loadSelfInstructions`（代码已无此符号）。
7. `## OOC Class/Object Model` 核心（object/self.md + index.md:168 `## agent`）：核心仅列 `talk`，需补 `plan` 并显式声明 agency=talk/plan、end/todo 不属 agent agency。

**语义评估（reviewer 提请裁决）**
8. **todo 归 thread 的语义张力**（executable + thread）：`end` 改 thread 自身 Data（status=done）——归 thread 干净；`todo` 造的是 `_builtin/agent/todo` 子对象、不改 thread Data，与 plan/talk「造子对象」同构——语义上不如 end 干净。

**P3 hydrate 位置**（readable + persistable）：两 reviewer 倾向注入时（init.ts）hydrate 而非 renderer；但 `injectSelfWindowIfObjectThread` 是同步、无 registry/baseDir 入参，改注入需 async 化 + 穿参。

**其它登记**
- `## visible` / `## readable × visible`（完整性批评官漏列）：displayName 非 agent 降级靠 `fetchSelfFirstLine` 的 catch（端点 404）→ objectId，安全；visible「self.md 首行 displayName」对非 agent 永久失效但有降级链。
- `## builtins`（C）已写「除 supervisor 外 builtin 无 self.md」——与 P4 同向，措辞可精化为「class=_builtin/agent 实例才有 self.md」。
- `createObjectInSession`（`stone-create-object.ts:109-113`）`readableMd` 必填校验——非 agent 建对象是否仍强制 readable，待定。
- thread.md 既存漂移：status 缺 `canceled`（lifecycle 分支负责）、object method 清单缺 close/new_feat_branch、`session-methods.ts` 注释列 `share` 无实现。
- 锚点漂移：P3 后 `readable/self.md` 的 `xml.ts:239` 等行号、`stone-object.ts:134` 骨架注释需同步。

## 裁决

1. **end/todo 迁 thread：确认**（用户直接指令）。`todo` 归 thread 的语义张力**记录在案、维持迁移**——理由：todo 产出的 todo 对象进入**当前 thread 的 context**、是 thread 执行过程的 context 成员，归 thread 管理成立；thread.md 须补语义说明「todo 不改 thread Data，而是在 thread context 内登记 todo 对象」（与 end 改 Data 区分）。
2. **thread/readable surface end/todo：纳入实施**（Task1 扩）。`thread` 投影窗 object_methods 加 end/todo；talk/reflect_request 不加。
3. **P3 agent readable 带 window decl `object_methods:[talk,plan]`：纳入实施**（Task3 扩）。
4. **P3 hydrate 取 renderer 侧**（resolveProjection，已有 registry+persistence+async）——务实优先；注入时 hydrate 作为「实现发现更易则采」的备选，由实施者评估。
5. **退潮纳入本次**：第 5/6/7 项漂移（self.md-不进-instructions ×3 + loadSelfInstructions 幽灵 + 核心 agency 补 plan）随 Task6 一并回流。
6. **reportDataEdit 移出退潮**（已实现，issue 风险节订正）。
7. **范围外维持**：displayName 协议重设计、createObjectInSession readableMd 必填放开、thread status=canceled、share 实现——均不在本次，登记后续。

### 一致性回流清单（落地后核对，Task6）

- `object/self.md` 核心 9/10：agency=talk/plan（+ end/todo 归 thread）、self.md 实现归 agent builtin、self 门面窗经 agent 自定义 readable 渲。
- `index.md`：`## agent`（agency talk/plan + self 渲染者=agent readable）、`## builtins`（措辞精化）、`## readable × thinkable`（instructions 退潮）、`## persistable × thinkable`（loadSelfInstructions 退潮）。
- `agent.md`：frontmatter description + §一 + §二(self×executable/self×readable/self×persistable) + §三 children/thread + §四骨架（全清单见 agent reviewer，穷举）。
- `thinkable/self.md` identity 子模块 + `thinkable/knowledge/tests.md` TC-THINK-02：instructions 退潮。
- `thread.md`：object method 清单补 end/todo/close/…、todo 语义说明。
