---
title: knowledge_base — agent 持有的知识库 tool-object（open_knowledge 把一篇 doc pin 成 knowledge 窗）
description: builtin 家族 knowledge_base 的单一权威定义——kind=class（单例 tool-object，无 construct，隐式继承 root）；唯一 object method open_knowledge 委托 child knowledge constructor 实例化 knowledge 窗；child knowledge 是非单例 class，其实例 = 一个 knowledge context window，按 trigger 激活进 context（激活机制见 thinkable）
activates_on:
  "object::root": "show_description"
---

# knowledge_base

> agent 组合持有的 tool-object 成员——可查询的知识存储；`open_knowledge` 把一篇 knowledge doc 作为 `knowledge` 窗引入 context。
> 对象模型（class/object、单例/非单例、construct、IS-A 继承/HAS-A 组合、children 命名空间）见 class `knowledge/object-model.md`，本文不复述模型。
> **以设计为准**：存量代码可能过期，分歧记入「五、源码现状与差异」。

## 一、是什么（核心职责）

- **ooc.kind = `class`**（`package.json:13`）；**单例 class**——无 `construct`（一个 world 一份知识库），是被 agent 组合持有、被 exec 的 **tool-object 成员**（非 Agent：不被 talk、不跑 thinkloop）。
- **继承**：注册时未给 `{parentClass}`（`register-builtins.ts:63`）→ 隐式继承 `_builtin/root`。
- **一句话职责**：作为 agent 的知识存储入口，提供 `open_knowledge`——把知识索引里的一篇 doc 显式 pin 成一个 `knowledge` 窗，使其常驻 context。它自身只是入口/委托类，**真正的「一篇知识 = 一个窗」由 child `knowledge` 承载**（store 是成员、doc 是窗，故成员类型名 `knowledge_base`、窗类型名 `knowledge`，见 `types.ts:6`）。

## 二、data 结构（types.ts）

`export interface Data {}`（`types.ts:11`）——**无业务字段**。单例、纯委托的 tool-object，数据来自 self.md / 缺省空；窗信封（id/class/title/status/createdAt）由 runtime 管理，展示态由 readable 的投影态 `win` 承载（此处也为空，见下）。

## 三、能力

- **object method（executable）**：
  - `open_knowledge`（`executable/index.ts:16`）—— 按 path pin 一篇 knowledge doc 进 context。**纯委托**：`exec` 调 `ctx.runtime.instantiate("_builtin/knowledge_base/knowledge", args)` 造一个 child `knowledge` 实例并返回其 id（`executable/index.ts:28`）；构造前置（path 解析/校验）下放给 child `knowledge` 的 construct。`ctx.runtime` 缺失则 fail-loud。无 `for_ui_access` 标记。
- **window method（readable）**：无自定义 window method（tool-object 成员不持展示态）。
- **投影（readable）**：`readable/index.ts:17` 把空 Data 投影成 `class: "knowledge_base"` 窗，content 只渲染一段身份/用途说明（`<about>` 节点）；window 声明 `object_methods: ["open_knowledge"]`、`window_methods: []`（`readable/index.ts:28`）。投影态 `KnowledgeBaseWin = {}`（`readable/index.ts:15`）。
- **visible / persistable**：均无自定义文件 → 走系统默认（无 UI 面板、系统默认持久化）。`index.ts:13` 的 `Class` 仅装配 `executable + readable`。
- **construct**：无（单例 class）。`index.ts:13` 的 `OocClass` 不含 `construct` 槽。

## 四、children（命名空间从属，不继承）

### `_builtin/knowledge_base/knowledge`（class，窗类型）

- **kind = `class`**（`children/knowledge/package.json:16`）；**非单例 class**——有 `construct`（`children/knowledge/index.ts:21`）。注册时未给 `{parentClass}`（`register-builtins.ts:49`）→ 隐式继承 `_builtin/root`（**与 parent `knowledge_base` 是命名空间从属、非继承——它不继承 knowledge_base**，符合对象模型核心 8）。
- **职责**：一篇 knowledge 文本作为 context window 的形态。其**实例即一个 `knowledge` 窗**（class 维度核心认知：注册一个窗类型 ≡ 注册一个非单例 class）；按 trigger 激活进 context、完成即卸载——**激活机制本身归 thinkable**（见 `thinkable/knowledge/knowledge-activation.md`，本文不复述）。
- **data 结构（`children/knowledge/types.ts:21`）**：`path`（索引路径，不带 .md）+ `source`（`explicit`/`protocol`/`activator`/`relation` 四类来源，缺省 explicit）+ `body`（合成来源自带正文）+ `presentation`（`full`/`summary`）+ `description`。窗信封与展示态（viewport）不在 Data 内。
- **construct（`open_knowledge` 的真正实现，`children/knowledge/index.ts:21`）**：args `{path}`；从 `ctx.thread` 取 persistence，经 `loadKnowledgeIndex` 校验 path 存在于索引（不存在/无 path 均 fail-loud），产出 `{path, source:"explicit"}` 初始 Data。
- **object method（`children/knowledge/executable/index.ts`）**：`reload`（`:18`，loader 按 mtime 自动失效，此为语义提示 no-op）、`close`（`:25`，关闭 explicit 窗；protocol/activator 来源不可 close——同为语义提示 no-op，实际 close 由 runtime 在窗层处理）。
- **window method（`children/knowledge/readable/index.ts:39`）**：`set_viewport`——只调投影态 `KnowledgeWin.viewport`（`:34`），不碰 Data、不产副作用，返回新 win。
- **投影（`children/knowledge/readable/index.ts:57`）**：`class:"knowledge"`，按 source 分支渲染——protocol/activator(full) 直渲 `Data.body`；activator(summary) 仅 description；explicit 且 body 空则回退 `loadKnowledgeIndex` 拉正文（兼容旧持久化）。正文按 viewport 切片 + 8KB 截断（`:31`）。
- **visible（`children/knowledge/visible/index.tsx`、`diff.tsx`）**：有自定义——详情面板渲染 path/source/presentation/description + markdown body；diff 组件做 frontmatter 字段级 + body 行级 diff。
- **persistable**：无自定义 → 系统默认（`children/knowledge/index.ts:4` 注明）。

## 五、源码现状与差异（设计 vs 实现）

逐条对照 object-model.md 核心：

1. **kind / 五件套装配** —— 符合。`knowledge_base` 经 `index.ts` 一处 `export const Class`（`OocClass`）收口 executable+readable，无多余成员；`package.json.ooc` 只有 `objectId`+`kind`，无旧 `kind:"builtin"`/`type:"object"`/`instantiate_with_new_world` 等过期字段（与 example.md「存量 builtin 可能仍写旧字段」对照，本家族已是干净态）。
2. **单例/非单例（核心 3）** —— 符合。`knowledge_base` 无 construct（单例），child `knowledge` 有 construct（非单例），与对象模型一致；二者 `kind` 均 `"class"`。
3. **委托链** —— 符合且优雅。`open_knowledge` object method 与 child `knowledge` construct **共享同名 schema**（`executable/index.ts:19` vs `children/knowledge/index.ts:23`），object method 只调 `instantiate`、把 path 校验/读盘下放给 construct——职责切分清晰，是 HAS-A 成员 method 造出 child 窗的范本。
4. **builtins.md 索引一致性** —— 基本一致。索引列 `_builtin/knowledge_base`（class）+ child `knowledge`（class）（`builtins.md:38-39`）属实。索引脚注（`builtins.md:51`）称「`knowledge_base` 当前 `kind=class`（非单例 object）……若后续确认为单例则可改 `kind=object`」——**此措辞与代码及对象模型有张力（low）**：源码注释明确 `knowledge_base` 是**单例**（`index.ts:5`「单例 class」、`types.ts:8`「是单例」），按对象模型核心 3 单例 class 的 kind 仍是 `"class"`（单例≠改 kind=object，单例性由「无 construct」决定，非由 kind）。索引脚注把「单例」与「kind=object」挂钩属旧认知遗留，应订正（与 filesystem/terminal 同列讨论）。
5. **child 路径迁移（过渡态记号，非本家族缺陷）** —— `thinkable/knowledge/knowledge-activation.md:90` 仍引 `packages/@ooc/builtins/knowledge/types.ts:28`，而实际已迁至 `packages/@ooc/builtins/knowledge_base/children/knowledge/types.ts`（core 侧 import 已是新路径，`protocol.ts:12`/`activator-windows.ts:9`）。属 knowledge-activation.md 的锚点漂移，**应回流修**（不属本 doc，记此备 cross-ref）。

总评：本家族无 root god-object 式过渡债，接线已对齐 object-model.md。唯一待订正项是 builtins.md 索引脚注的「单例↔kind」措辞（low）。

## 六、倒推 ooc core 改进方向

1. **single-cardinality（单例性）缺机制化声明** —— `knowledge_base`「一个 world 一份知识库」的单例约束只活在源码注释里（`index.ts:5`/`types.ts:8`），runtime 无字段表达「此 class 单例、被 agent by-reference 注入」。这正是 builtins.md 索引脚注反复纠结「class vs object」的根因。direction：为「单例 tool-object 成员」补一个显式标识（或由「无 construct + 作组合成员」推得单例语义），让 registry 据此 by-reference 注入而非每次新建，并消除索引脚注的歧义。severity: medium。
2. **child class 的命名空间从属对 runtime 不可见** —— `register-builtins.ts:49` 与 `:63` 两条独立 `register` 调用，runtime 不知道 `_builtin/knowledge_base/knowledge` 在命名空间上从属 `_builtin/knowledge_base`（仅 id 前缀约定）。`open_knowledge` 靠硬编码全路径 `"_builtin/knowledge_base/knowledge"` 委托（`executable/index.ts:28`），parent 改名即断。direction：让 runtime 把 children 注册收敛到 parent class 之下（或由 parent id + child 短名解析），把「命名空间从属」从约定升为可校验关系。severity: low。
3. **open_knowledge 双重校验/双重 schema 的去重** —— path 存在性校验只在 child construct 做（`children/knowledge/index.ts:43`），但 object method 与 construct 各自声明了一份等价 schema（`executable/index.ts:19` / `children/knowledge/index.ts:23`），二者须手工保持同步。direction：成员 method 委托 child construct 时，让 runtime 直接复用 construct 的 schema（method 只声明委托目标），消除「同一参数契约写两遍」的漂移面。severity: low。
