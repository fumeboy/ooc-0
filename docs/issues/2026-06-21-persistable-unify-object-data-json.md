---
title: 退役 state.json 与 session 草稿，统一为 object data → 默认落 data.json
status: decided
date: 2026-06-21
---

# 退役 state.json 与 session 草稿，统一为 object data → 默认落 data.json

## 背景 / 动机

持久层当前对「一个 object 的 data 落盘」有**三套互相不自洽的命名**：

1. **默认持久化** `writeRuntimeObjectState` → 写 `objects/<path>/state.json`，内容是信封 `{id, class, data}`。
2. **自定义持久化**（如 `_builtin/example`）→ 自己的 `persistable.save` 把**裸 Data** 写 `ctx.dir/data.json`。
3. **interpreter 的 `getData/setData`** → 写第三个独立 `objects/<path>/data.json`，语义是「session 级临时草稿」，**与该 object 自身的 `data` 字段无关**。

后果（已在 supervisor 复核中确认）：

- `data.json` 一名两义：example 里它 = object 的持久 data（与 `state.json` **同概念**，仅换名换格式）；interpreter 里它 = session 草稿（**另一个概念**）。读者无法靠文件名判断语义。
- `state.json`（默认）与 `data.json`（example 自定义）是**同一角色**（`saveObjectData` 同一函数的两个分支，同目录、同输入 `instance.data`，见 `packages/@ooc/core/persistable/object-data.ts:90-99`），却两个名字。
- `example.md` 是**建 class 作者照抄的权威样板**，它示范的 `data.json` 命名会随照抄放大漂移，而非收敛。

## 现状

- `## persistable`（index.md:84 / `children/persistable/self.md:34`）：「缺省把 Data 写入 `state.json`」「inline 整窗随 `thread-context.json` 落盘、不写独立 `state.json`」。
- `## OOC Class/Object Model` 核心 7（index.md:57）：「持久化可自定义，未定义走系统默认」。
- `## filesystem / terminal / interpreter`（`children/object/knowledge/builtins/interpreter.md:51`）：InterpreterSelf `getData/setData`（flow 级 `data.json`）—— 即「session 草稿」概念的栖身处。
- `_builtin/example`（`children/object/knowledge/builtins/example.md:41,68,184,193,196`）：自定义 `save/load` 落 `ctx.dir/data.json`。
- 源码锚点：默认写盘 `core/persistable/flow-runtime-object.ts`（`writeRuntimeObjectState` / `runtimeObjectStateFile` → `state.json`）；编织点 `core/persistable/object-data.ts:72-106`（`saveObjectData` 默认 vs 自定义分支）；interpreter 草稿 IO `builtins/interpreter/children/interpreter_process/persistable/flow-data.ts`（`flowDataFile` → `data.json`，`getData/setData`）。

## 改动提案

**统一为单一概念：一个 object 的 data，默认落 `data.json`。**

1. **退役 `state.json` 概念**：默认持久化的落盘文件名从 `state.json` 改为 `data.json`。`state.json` 这个符号/词全树退役（源码 `runtimeObjectStateFile`/`writeRuntimeObjectState` 命名、index.md / 各 self.md / builtin md 引用一并清理）。
2. **interpreter 的 `getData/setData` 改为读写「它所属 ooc object（interpreter_process 实例）的 `data`」**——不再写独立的 session 草稿文件。这份 data 随统一的 persistable 路径（默认 `data.json` 或该 class 自定义 `save`）落盘。**「session 草稿」概念删除**。
3. 收敛后：默认落盘与 example 自定义落盘**同名 `data.json`、同概念**（object 的 data），只是默认 vs 自定义两条实现路径；example 不再是「异名同概念」的反例，而是「换格式/换目录」的纯净示范。

## 受影响设计元素

对照 `knowledge/index.md` 的 `##` 元素清单：

- `## persistable` —— 默认落盘文件名 `state.json`→`data.json`；inline 表述里的「不写独立 state.json」改写；`reportDataEdit → persistable.save` 段对 state.json 的引用（self.md:37）。**主元素**。
- `## OOC Class/Object Model` —— 核心 7「持久化可自定义/系统默认」的默认落盘指代。
- `## filesystem / terminal / interpreter` —— interpreter `getData/setData` 语义从「flow 级 data.json 草稿」改为「读写 object 自身 data」；删 session 草稿概念。**主元素**。
- `## persistable × thinkable` —— `flows/<sid>/objects/<id>/` 路径下落盘文件名的指代（如有 state.json 字样）。
- `## reflectable × persistable` —— 持久三层级中对 state.json 的任何引用。
- `## thread` —— inline 持久化「不写独立 state.json」表述（index.md:167）。
- 内置对象样板 `_builtin/example`（builtins/example.md）—— 命名示范是否仍合理（现在默认也叫 data.json，自定义示范要点改为「换目录/换格式」而非「换名」）。

## 风险与权衡

- **默认 data.json 的格式**：当前 `state.json` 写信封 `{id, class, data}`，example 写裸 `data`。统一后默认 data.json 写什么？若 `.flow.json` 已存 class/sessionId/objectId（hydration 元信息），默认 data.json 可降为裸 data、与 example 格式收敛；否则需保留信封。**需核验 `.flow.json` 是否足以承载 hydration 所需 class。**（待裁决点 1）
- **interpreter data ↔ object data 的承载**：interpreter_process 实例当前是否持久化其 `data`？`getData/setData` 改写 object data 后，落盘是否触发 `reportDataEdit`、是否与 thread inline 持久化冲突？（待裁决点 2）
- **退役遗留**：`state.json` 是高频符号，须接 `check-no-deprecated-symbols`（源码）+ `check:doc-drift`（对象树/builtin md）双 gate，避免漂移残留。
- **getThreadLocal/setThreadLocal**（线程内不持久化）是另一独立概念，**不在本次退役范围**，勿误删。

## 待裁决点

1. 统一后默认 `data.json` 写**裸 data** 还是**信封 `{id,class,data}`**？（取决于 `.flow.json` 能否独立承载 hydration 的 class）
2. interpreter `getData/setData` 映射到 object data 后的落盘触发链（`reportDataEdit` / inline 冲突）如何定？
3. 源码符号 `writeRuntimeObjectState` / `runtimeObjectStateFile` / `flowDataFile` 的改名口径（重命名还是合并）。

## review 记录

6-reviewer fan-out（每受影响元素一主人 + 完整性批评官）汇总：

**事实纠正（完整性批评官 + interpreter reviewer，决定性）**：现状第 3 条对 getData/setData 的描述失真。代码核验（`children/interpreter_process/executable/self.ts:62-71` + `init.ts:60`）：getData/setData 落盘 key = `thread.persistence.objectId`，即**持有 thread 的 agent/self 对象**（非 interpreter_process 实例），写在 **agent 的 flow 目录** `data.json`；而 interpreter_process 实例自身 data = `{history}`（走默认持久化）。「session 草稿」实为 **agent 级跨 run 共享工作记忆**，不挂在 interpreter_process 上。

**生命周期核验**：`run` 经 `ctx.runtime.instantiate(...)` 每次造**新** interpreter_process 实例（`executable/index.ts:40`）；`exec` method 在**同一 process** 上续跑、追加 history（`children/interpreter_process/executable/index.ts` execMethod）。故 process 在「同进程多 exec」间稳定、在「跨 run」间不稳定。

**persistable reviewer**：
- 默认改名对 inline 第三态无破坏，但 `contract.ts:33,35` 源码注释同表述须同步。
- 待裁决点 1 核验：`.flow.json`（`flow-object.ts:35` `class?` 字段 + `flow-object.ts:125` createFlowObject 写入 + `object-data.ts:83` 每次 save 前必写）已独立承载 class → 裸 data 可行；信封 `{id,class}` 是冗余，当前 `object-data.ts:97` `as unknown as` 强转是硬塞痕迹。裸 data 须配套改读侧 `readRuntimeObjectState`（`flow-runtime-object.ts:73-85`）返回类型 + caller 用 `.flow.json` class 重组。
- **硬冲突 ①（高）**：`stone-bootstrap.ts:73` gitignore 黑名单硬编码 `objects/**/state.json`，不同步改会让 data.json 误入 git、破坏非版本化不变量。
- **硬冲突 ②**：改名后默认 data.json 与 interpreter 草稿 data.json 同目录撞名 → step 1（改名）与 step 2（合并草稿）必须**原子同 PR**，不可只改名。
- self.md:37 句尾「落 flow / state.json」建议去文件名化改写（文件名单一权威归核心 4）。

**interpreter reviewer**：
- interpreter_process 无 persistable 自定义、走默认（`writeRuntimeObjectState`），非 transient 非 inline；`exec` 已调 `reportDataEdit` → 落盘链现成，改造无需新增触发。
- getData/setData 映射到 object data 时须裁子决策：摊平进 `data`（污染 history 投影）vs 收进 `data.userData` 子字段（推荐，隔离 history 与 user scratch）。
- getThreadLocal/setThreadLocal（`self.ts:73-79`，thread.threadLocalData，不持久化）确认零误伤、保留。
- 落地遗漏：删整个 `persistable/flow-data.ts` + import + `__tests__/flow-data.test.ts`；改 `executable/self.ts:21-23,34-37`、`types.ts:6`、`flow-data.ts` 的 doc 注释口径。

**object-model + thread reviewer**：
- `## OOC Class/Object Model` self.md/index.md 两投影**均无 state.json、零回流**，建议从受影响降为「确认无影响」；核心 7「系统默认」保持抽象不指名文件。
- `## thread` inline 机制不受卷入，但「不写独立 state.json」一句须成对改写（index.md:167 + persistable/self.md:34），推荐「不单独落 `data.json`」。
- 暗礁：裁决点 1 裸 data 后，object↔class 绑定载体从落盘文件转移到 `.flow.json`——须守住对象模型核心 1（重建实例必知其 class）。
- 归属陷阱：`children/object/knowledge/builtins/` 下 example.md/interpreter.md 物理在 object 目录树，设计归属却是各自元素，勿误派给 object model 主人回流。

**交叉元素 reviewer**：`## persistable × thinkable`（index.md:143 仅目录粒度、buildPathsItem `context/index.ts:543` 只注入目录无文件名）+ `## reflectable × persistable`（feat-branch PR 只碰 tracked stone，不碰 untracked data 落盘）经核**均无 state.json/草稿引用、改名不波及**，从受影响降为「已核验无影响」。

**example reviewer**：源码本就写裸 data 落 data.json、**零代码改动**；全部工作在 example.md 措辞。统一后默认与 example 同名同目录，「换名/换目录」教学点失效——示范要点须迁到**格式轴**。裁决点 1 选裸 data → 默认与 example 连格式都一致，example persistable facet 失去对照，须改演别的（如 load 容错/迁移）或在措辞上点明「自定义机制本身（接管 save/load）」而非格式差异。example.md 6 处措辞需改（头注/二节 line 41/四节 line 68,192；代码 line 193,196 路径**保持不变**）。

**完整性批评官——补漏（issue 受影响清单缺口）**：
1. 【高】漏列 gitignore 黑名单 `stone-bootstrap.ts:73`（同 persistable reviewer 硬冲突①）。
2. 【高】漏列 builtin knowledge `packages/@ooc/builtins/supervisor/knowledge/three-fold-persistence.md:61` 把「data.json=session 草稿」当 live 教，须回流。
3. 【中】漏列测试/story 改造：`tests/integration/multi-round-multitask.integration.test.ts`（setData 跨轮）、storybook `visible.story.ts` / `collaborable.story.ts` / `L4_collaborable.stories.ts` / `L0_world.stories.ts` 的 state.json 断言。
4. 【中】漏列 `## visible` / `## readable × visible`：默认落盘是 `visible-server-dispatch.ts:78-79` persistable.save 系统默认分支的实际落点（A2 data-edit 链）；visible 文档无 state.json 字面、无需改 self.md，但须确认改名不破 A2 契约。
5. 退潮 gate 须配白名单：source gate 裸加 `state.json` 会海量误报历史注释，须精确模式 + SKIP 白名单；doc-drift gate 加 `state.json` + 「session 草稿」概念词（其退役标记放行机制对合法解释句生效）。
6. 符号 `STATE_JSON` 常量不存在（issue 术语漂移，实为散字面量）。

## 裁决

**用户拍板（2026-06-21）：**

1. **退役 state.json 概念**：默认持久化落盘文件名 state.json → `data.json`，全树退役 state.json 符号/字面量。
2. **默认格式 = 裸 data**（待裁决点 1）：`.flow.json` 已独立承载 class，默认 data.json 写裸 data、与 example 收敛为同概念同格式。配套改读侧 `readRuntimeObjectState` 返回类型 + caller 用 `.flow.json` class 重组（守对象模型核心 1）。
3. **getData/setData 限制为 interpreter_process 自己的 data**（待裁决点 2）：不再越界写 agent flow 目录，改为读写本 process 实例自身 data。「session 草稿」（agent 级跨 run 共享）概念**删除**——跨 run 共享随之消失（这正是被消除的草稿）；同 process 跨 exec 共享保留。user scratch 收进 `data.userData` 子字段，隔离 history 投影。
4. step 1（改名）与 step 3（草稿合并）**原子同 PR**。

**落地清单（成对回流 + 退潮）：**

源码（worktree `.worktree/persistable-unify-object-data-json`）：
- [ ] `core/persistable/flow-runtime-object.ts`：state.json → data.json（文件名常量 + `runtimeObjectStateFile`/`writeRuntimeObjectState`/`readRuntimeObjectState` 改名为 …ObjectData 口径）；写裸 data、删信封 + `as unknown as` 强转；读侧返回类型改裸 data。
- [ ] `core/persistable/object-data.ts`：默认分支写裸 data；注释 state.json → data.json（line 6,60,68）。
- [ ] `core/persistable/contract.ts:33,35`：inline 契约注释同步。
- [ ] `core/persistable/stone-bootstrap.ts:73` + `common.ts:56,91`：gitignore 黑名单 `objects/**/state.json` → `objects/**/data.json`。
- [ ] `core/persistable/index.ts:34,86,87`：注释回流（删 stone-data/session-scoped data.json 旧叙述）。
- [ ] `core/app/server/modules/_shared/visible-server-dispatch.ts:78-79`：默认落盘随改名（A2 链不破）。
- [ ] interpreter：删 `children/interpreter_process/persistable/flow-data.ts` 整文件 + `executable/self.ts:2` import；getData/setData 改读写 process 实例 `data.userData`（经 ctx/self 而非 thread.persistence）+ `reportDataEdit`；改 `self.ts:21-23,34-37`、`types.ts`（加 `userData?`）注释。
- [ ] interpreter_process Data 类型：`{ history; userData?: Record<string,unknown> }`。
- [ ] 测试：删 `children/interpreter_process/__tests__/flow-data.test.ts`；改 `tests/integration/multi-round-multitask.integration.test.ts`（跨轮→同 process 跨 exec，或退役该断言）；改 storybook 4 story 的 state.json 断言 → data.json；persistable `__tests__/*` 中 state.json 字面。
- [ ] 退潮 gate：`scripts/check-no-deprecated-symbols.sh` 加 `state.json` 落盘字面量精确模式 + SKIP 白名单；`check:doc-drift` 加 `state.json` + 「session 草稿」。

对象树（push ooc-0）：
- [ ] `children/persistable/self.md:34`（默认 state.json → data.json + inline「不单独落 data.json」）、`:37`（去文件名化改写）。
- [ ] `index.md:86`（`## persistable` 综述）、`:167`（`## thread` inline 成对改写）。
- [ ] `children/object/knowledge/builtins/example.md`：6 处措辞（示范要点迁离格式轴、改演「接管 save/load 机制本身」；代码路径不变）。
- [ ] `children/object/knowledge/builtins/interpreter.md:51`：getData/setData 改「读写本 process 实例自身 data（userData 子字段）、随默认 data.json 落盘」；删「flow 级 data.json 草稿」暗示。
- [ ] `packages/@ooc/builtins/supervisor/knowledge/three-fold-persistence.md:61`：删「data.json=session 草稿」live 叙述。
- [ ] review 记录里两交叉元素（persistable×thinkable / reflectable×persistable）+ `## OOC Class/Object Model` 标「已核验无影响」、不动。

**worktree 分支**：`.worktree/persistable-unify-object-data-json`（源码仓根）。

## 落地验收

（`landed` 后由 Supervisor 汇总验收 reviewer 意见：文档/代码是否如约改造、成对回流是否漏一边、退役是否清干净、有无提案外漂移；缺口补完则标 `verified`）
