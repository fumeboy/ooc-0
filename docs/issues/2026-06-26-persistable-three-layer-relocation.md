---
title: persistable 三层重定位（stone=版本化 / pool=非版本化 / flow=本 session 变更暂存）
status: verified
date: 2026-06-26
---

# persistable 三层重定位：stone=版本化 / pool=非版本化 / flow=变更暂存

## 背景 / 动机

当前 persistable self.md 把三层级定位为：
- stones：静、长期身份+设计源码、git 版本管理
- flows：动、每 session 一份 git worktree 分支
- pools：积、跨 session 沉淀事实、不进 git

但**「stone 到底存什么、pool 到底存什么、flow 到底存什么」三者边界并不清**：
1. **当前 stone 不只是"源码"**——agent 把 data.self 写进 worktree 内 `self.md`（stone 路径的 working tree 副本），data 字段就这样被"半 stone 化"。
2. **当前 flow 不只是 worktree**——所有 `data.json` 缺省落 `flows/<sid>/objects/<id>/data.json`，session 结束后这份 data 等于丢了，没有沉淀通道。
3. **当前 pool 几乎没用**——只有 `sedimentKnowledge` 一条 API 写 `pools/objects/<owner>/knowledge/*.md`；memory / relations / files 等设计承诺的 pool 子目录在源码中**不存在**（`pool-object.ts` 缺失）。
4. **无"数据是否版本化"的字段级判据**——agent.self 显然版本化（它影响 agent 行为，每次改动该被测试评估）；但比如 thread 的 messages、interpreter_process 的 cwd、knowledge_base 的最近打开列表，是否版本化？没有协议判据。

**用户提出的重定位**（核心洞察）：
- **stone = 版本化数据**——OOC class 源码（自定义 method / readable / persistable / visible）+ object data 中标记了版本化的字段（如 agent.self）。版本迭代须经测试评估，须 git 管。
- **pool = 非版本化数据**——object data 中没标记版本化的字段（规则的 name、note）+ 现有的 sediment knowledge / memory / relations。随意编辑。
- **flow = 本 session 内发生变更的全部数据（版本化 + 非版本化）暂存**——session 结束（或主动触发合并）时，由 reflectable 流程把 flow 内的变更**分发**到 stone（版本化字段经 PR）与 pool（非版本化字段直写）。

**关键现实场景**（用户原话）：风控规则——规则 content 版本化（迭代需测试）、规则 name / note 不版本化（随便改）。同一 object 的 data 字段须**字段级**区分版本化与否。

## 现状（锚 index.md 对应 `##` 节）

锚点：
- `## persistable`（B 区）—— 现有三层级"静/动/积"定位、`reportDataEdit → save` 一律 flow 内非版本化写。
- `## reflectable × persistable`（D 区）—— pool sediment 直写、stone 走 feat-branch PR 二通道互斥。
- `## OOC Class/Object Model`（A 区）—— 核心 4 投影/Data 分离、A 区核心 7 持久化可自定义。
- `## agent`（E 区）—— `data.self` 写 self.md 的路径。
- `## persistable × thinkable`（D 区）—— knowledge seed/sediment 双源磁盘加载。
- `## runtime`（E 区）—— session 对象表、object 实例解析。

涉及文件：
- `packages/@ooc/core/types/persistable.ts`（`PersistableContext` / `PersistableModule`）
- `packages/@ooc/core/persistable/runtime-object-io.ts:30,106`（`saveObjectData` / `persistSession`）
- `packages/@ooc/core/persistable/common.ts:55-101`（`objectDir` / `stoneDir` / worktree 路由）
- `packages/@ooc/core/persistable/stone-worktree.ts:169-197`（`resolveStoneIdentityRef`）
- `packages/@ooc/core/persistable/reflectable.ts:21-33`（`sedimentKnowledge`）
- `packages/@ooc/core/persistable/feat-branch.ts` + `stone-versioning.ts`（mergeFeatBranch 双源——独立 issue 处理）
- `packages/@ooc/builtins/agent/persistable/index.ts:19-35`（agent self.md 写）
- 全部 `packages/@ooc/builtins/**/types.ts`（Data 类型声明，须加字段级版本化标注）
- `packages/@ooc/builtins/**/persistable/index.ts`（各自 save/load）
- `tsconfig.json` / `packages/@ooc/tsconfig.json`（装饰器开关，当前未启用）

## 改动提案

### 改动 1：协议层引入 `Versioned` 字段标注机制

**两种候选方案**（待裁决点 1）：

**方案 A · TS 装饰器（用户原提案）**

启用 TC39 Stage 3 decorators（bun 原生支持）。Data 类型声明为 class 而非 interface，字段加 `@Versioned()` 装饰器：

```ts
// builtins/agent/types.ts
import { Versioned } from "@ooc/core/persistable/decorators";

export class AgentData {
  @Versioned() self: string = "";
  notes?: string;         // 非版本化
  lastActiveAt?: number;  // 非版本化
}
```

pros: 用户原提案、语义直观、IDE 支持好。
cons: 当前仓库零装饰器使用，启用需开 tsconfig + bun 配套；Data 从 interface 转 class 影响面广（每个 builtin 的 types.ts、构造、JSON round-trip）。

**方案 B · 同伴常量声明**（推荐）

Data 保持 interface；每个 builtin 在 `types.ts` 旁导出 `VERSIONED_FIELDS: ReadonlyArray<keyof Data>` 常量：

```ts
// builtins/agent/types.ts
export interface AgentData { self: string; notes?: string; lastActiveAt?: number; }
export const VERSIONED_FIELDS: ReadonlyArray<keyof AgentData> = ["self"];
```

`Class` 装配时 `index.ts` 顺手收口：
```ts
export const Class: OocClass<AgentData> = {
  executable, readable, persistable,
  versioned_fields: VERSIONED_FIELDS,
};
```

pros: 零运行时改造、与现有 interface 风格一致、显式可查（grep 一处见全表）。
cons: 类型层面没强制（`keyof Data` 静态校验只能挡 typo，不挡漏字段）。

**倾向方案 B**：本仓哲学是「不发明 host 不需要的新机制」（index.md OOC 节哲学澄清 2）；装饰器对本场景过重。

无论 A/B，**协议契约**：
- `OocClass` 加 `versioned_fields?: readonly (keyof Data)[]`，缺省 = 空（全部字段非版本化）。
- `PersistableContext` 加 `scope: "stone" | "flow" | "pool"`（替代 `sessionId?` 隐式判定），让 save/load 显式知道写哪层。

### 改动 2：三层物理边界重定位

- **stones/main/objects/&lt;id&gt;/**：仅放**版本化数据**——OOC class 源码（types.ts / executable/ / readable/ / persistable/ / visible/ / index.ts / package.json）+ **版本化字段的当前值**。
  - 版本化字段当前值如何落？候选：(a) 每字段一文件（`fields/<field>.json`）；(b) `data.versioned.json` 单文件含所有版本化字段。倾向 (b) 单文件更易 git diff。
  - 例：agent `data.self` 现在落 `self.md`（特殊文件名 → 可读 markdown），这条特殊路由保留——`agent.persistable.save` 自己拆字段：`self` 字段 → stone `self.md`；其它非版本化字段 → pool。
- **pools/objects/&lt;id&gt;/**：放**非版本化数据**——
  - `data.unversioned.json`（默认 save 落点）
  - `knowledge/` 子目录（sediment knowledge，沿用现有）
  - 未来扩展：`memory/` / `relations/`（dormant，不在本 issue 落地）
- **flows/&lt;sid&gt;/objects/&lt;id&gt;/**：本 session 内**全部变更的暂存**——
  - `data.versioned.json`（本 session 改过的版本化字段）
  - `data.unversioned.json`（本 session 改过的非版本化字段）
  - `class-edits/`（本 session 改过的 class 源码，对应 stones/main 同名文件）
  - `.session.json` / `.flow.json` 元数据沿用
  - **session 内读取顺序**：先看 flow（本 session 改过）→ 再看 stone（版本化字段未改过则取 canonical）+ pool（非版本化字段未改过则取沉淀）。
  - flow worktree git 分支沿用——本 session 期间是 stones/main 的 git worktree，便于 stone 文件级编辑；但 session 结束**不直接 merge**——由 reflectable 分发。

**关键澄清**：flow 不再"等同 worktree"——它是**变更暂存 + 操作工作区**的合体；worktree 是其磁盘实现（让 stone 文件级编辑可达），数据级变更（data 字段）经 data.versioned.json / data.unversioned.json 标记。

### 改动 3：reportDataEdit → save 路由

`saveObjectData` 改造：
```ts
async function saveObjectData(baseDir, sessionId, ref, data, versionedFields) {
  const { versioned, unversioned } = splitByVersioned(data, versionedFields);
  // 本 session 改动全部落 flow（暂存）
  await writeFlowVersioned(baseDir, sessionId, ref.id, versioned);
  await writeFlowUnversioned(baseDir, sessionId, ref.id, unversioned);
  // 自定义 save（如 agent.persistable.save）：runtime 拆好的两部分各 invoke 一次
  if (class.persistable.save) await class.persistable.save({ ...ctx, scope: "flow" }, data);
}
```

数据读回（hydrate）：
- `loadObjectData(baseDir, sessionId, ref) = merge(stone[versionedFields], pool[unversioned], flow[overrides])`
- 自定义 load 负责合并；缺省 load 把三处文件读出来 merge。

### 改动 4：合并通道（轮廓，详细归 issue D）

session 结束（或显式 `talk(super)` 触发）时，reflectable 流程：
- 扫 `flows/<sid>/objects/<id>/data.versioned.json` 内变更字段 → 起 feat-branch PR（写入 stone 的 data.versioned.json / agent 拆字段路径）
- 扫 `flows/<sid>/objects/<id>/data.unversioned.json` 内变更字段 → 直写 pool 的 `data.unversioned.json`
- 扫 `flows/<sid>/objects/<id>/class-edits/` → 起 feat-branch PR（写入 stone 内对应源码文件）

具体 PR 合入 / 直写 pool 的 finalizer 链路落 issue D。

### 改动 5：persistable.self.md / index.md 同步

- `persistable.self.md` 三层级定位全文重写——核心 1 不变（World=持久化目录），核心 2 重新表述（stone/flow/pool 按"版本化与否+暂存"重定义），核心 4 / 核心 5 / 核心 7 同步。
- `index.md` `## persistable`、`## reflectable × persistable`、`## persistable × thinkable` 三节同步。

### 改动 6（验收）：把现有 builtin 的 data 字段做版本化标注

按规则：
- `_builtin/agent` Data：`self` 版本化；其他字段（如有）非版本化。
- `_builtin/agent/thread` Data：messages / events 非版本化（运行时事实，不是身份）；threadContext 等持久指针非版本化。
- `_builtin/filesystem/file` Data：path / content 非版本化（具体文件不是 class 身份）。
- `_builtin/knowledge_base/knowledge` Data：sediment 已落 pool/knowledge/，本身非版本化。
- 其余 builtin 默认全非版本化（无版本化字段）。

把每个 builtin 的 `VERSIONED_FIELDS` 落到 `types.ts`，`Class.versioned_fields` 装配。

## 受影响设计元素

A 区
- `## OOC Class/Object Model` —— 核心 7「持久化可自定义」延伸：缺省 save 现在按 versioned_fields 字段级分流。
- `## OOC` —— 顶层哲学层无变动。

B 区
- `## persistable` —— **三层级定义全面重写**：stone=版本化、pool=非版本化、flow=本 session 变更暂存；reportDataEdit→save 按字段分流。
- `## reflectable` —— 沉淀两通道（stone PR / pool 直写）改"分发器"语义（issue D 主体）。

D 区
- `## reflectable × persistable` —— 分发器语义。
- `## persistable × thinkable` —— knowledge sediment 写入路径仍在 pool/knowledge/（不变）。

E 区
- `## agent` —— self 字段版本化、self.md 仍是 stone 路径特殊文件。
- `## thread` —— Data 内 messages/events 非版本化；inline 模式不变（thread-context.json 仍是 thread 整窗 inline）。
- `## knowledge_base / knowledge` —— sediment 路径不变。
- `## runtime` —— session 对象表读 data 时调 mergedLoad。

C 区
- `## builtins` —— 全部 builtin 标注 `VERSIONED_FIELDS`。

未受影响：executable / readable / collaborable / thinkable / visible / observable / app（核心契约）。

## 风险与权衡

1. **磁盘布局大变**：现有 session 数据丢失风险——本仓 dogfooding world 是 `.ooc-world/`，迁移可弃旧重建；用户业务 world 需迁移脚本（本 issue 不带，留独立 chore）。
2. **flow worktree 与版本化字段的关系**：worktree 内的 `stones/main` 副本含 self.md 等 stone 文件；这些文件经 worktree 编辑时，本 session 仍在 flow 暂存（worktree 分支 commit≠合入 main）——保留现有 worktree 语义，不与版本化字段冲突。
3. **PersistableModule.scope 字段**：现有 save 都按"flow"语义实现（落 worktree）；加 scope 后是否破坏现行调用？倾向**新加 scope 字段**让 save 函数签名兼容（旧实现忽略 scope = 当 flow 处理），逐 builtin 迁。
4. **方案 A vs B 字段标注**：见改动 1 待裁决点。
5. **issue D 强耦合**：本 issue 立"分发对象"，issue D 立"分发器"——本 issue **必须先 landed** 才能 fan-out D。

## 待裁决点

1. **改动 1 方案 A vs B**：TS 装饰器 vs 同伴常量。倾向 B（不发明新机制）。
2. **改动 2 版本化字段当前值的物理文件布局**：单文件 `data.versioned.json` vs 每字段一文件。倾向单文件（git diff 友好）。
3. **改动 3 自定义 save 是否拿 split 后的 data**：runtime 拆好分两次 invoke，还是 invoke 原 data + 让 save 自己看 `ctx.scope` 决定写什么。倾向后者（让 save 更灵活，agent.self → self.md 的特殊化得以保留）。
4. **flow 暂存内的"未改动字段"如何表示**：data.versioned.json 内只写"本 session 改过的"，还是全字段都写一遍 ourput=flow 是 stone+pool 的覆盖层？倾向**只写改过的**（delta），merge 时其它字段从 stone/pool 读。
5. **session 结束时未触发合并 ⇒ flow 暂存如何处理**：保留供下次 resume？归档？删除？倾向**保留**（用户随时可触发 talk(super) 沉淀）。
6. **agent.self → self.md 特殊路由是否保留**：保留——它是 stone 路径上"特殊文件名格式"的便利，并未违反"版本化字段当前值落 stone"。

## review 记录

按 design-workflow 步骤 2，4 个 reviewer fan-out（persistable / reflectable / object-model / 完整性批评官）。**核心结论**：方向正确，**但 issue 原稿过设计**——`class-edits/` 目录、`data.{versioned,unversioned}.json` 双文件、`ctx.scope` 字段三处都属 over-engineering。reviewer 一致建议**收敛到最小路径**：VERSIONED_FIELDS 同伴常量 + ctx 内部路由 + self.md 重写。

### review by persistable —— 方向认可、3 处过设计 + 1 头号未解决

**核心反馈**：
- 同伴常量 vs 装饰器：**一致投方案 B**（同伴常量，零依赖、可枚举性强、与现有 builtin 五件套形态一致）。
- self.md 核心重写：reviewer 给出 9 条草稿（三层物理边界 / stone=canonical 版本化 / flow=变更暂存 + 运行时状态 / pool=非版本化沉淀 / 三层 hydrate merge / stone-worktree 物理结构 / PR-Issue 合入 / reflectable × persistable / save/load 路由）。
- **过设计 1**：`class-edits/` 目录与 worktree 文件系统重叠（worktree 本就承载未合入 class 源码修改），**裁决取消**——class 源码变更仍走 flow worktree 工作树（与现状一致），不另设目录。
- **过设计 2**：`data.versioned.json` / `data.unversioned.json` 双文件**缓做**——先在单个 `data.json` 内用字段约定（如 `_versioned: { ... }` 段或扁平 + VERSIONED_FIELDS 元数据查表）解决；等真有跨字段同步问题再拆物理文件。**裁决**：保持单 `data.json`，由 VERSIONED_FIELDS 在读写时分流到 stone/pool/flow 三处物理路径。
- **过设计 3**：`PersistableContext.scope` 不该写进 save 调用方签名——它是 ctx 内部根据 VERSIONED_FIELDS 元数据查表得出的内部状态。builtin save 签名保持不变。**裁决**：**runtime 多次调用 save**——每次 `ctx.scope` 不同（"versioned"→stone 路径 / "unversioned"→pool 路径 / "flow"→暂存路径），save 实现可根据 scope 决定写什么；这与对象核心 7「持久化可自定义」一致（runtime 提供 scope 维度，对象自决用哪些字段填）。
- pool 通用化担忧：反对把 pool 扩展为通用 data.unversioned.json 落点——pool 是 append-only sediment 语义、不需要 worktree 隔离；通用化会丢失 flow 隔离性 + 引入并发冲突。**裁决**：unversioned 字段**写 flow 内**（flow 隔离），不写 pool；pool 仅保留 knowledge sediment 语义。**这是对 issue 原稿的实质修订**。
- 漏点：迁移脚本（老 world VERSIONED_FIELDS 缺失 → 默认全 unversioned）/ 删字段语义（GC 流程）/ 测试基线（storybook persistable tests.md 会因路由变化失效）。

### review by reflectable —— 方向健康、6 处必补

**核心反馈**：
- C/D 拆分合理，**不要合并**（C=分发对象 / D=分发器）；C 必先 land。
- 判据从"运行时事实 vs stone 变更"改"非版本化 vs 版本化"：**实质改了 reflectable self.md 核心 4 语义；是改进，但需要同步回流到 reflectable self.md 与 index.md**。
- stone 变更范围扩到"所有 versioned 字段 + class 源码 + seed knowledge"健康，但需明确：**versioned 标记的所有权与不可变性**——agent 不能在 flow 内任意翻转某字段的 versioned 标记（避免 PR 范围不可预测）。**裁决**：VERSIONED_FIELDS 是 class definition 一部分（与 executable/readable 同级），**不可在 flow 内 mutate**；reflectable 改 VERSIONED_FIELDS 即"改 class 源码"，本身走 PR。
- `class-edits` vs `data` 字段：reviewer 同意 class-edits 是独立第三轨（与 worktree 重叠这点已采纳——裁决保留 worktree 作为 class 源码暂存载体，data 内单 json 文件作为 data 暂存载体；两条轨道在 flow 内并行）。
- `agent.self → self.md` 表述统一为"versioned 字段的持久化格式映射"（不是"路由例外"）。
- **头号缺口（必裁）**：pool 直写的内存可见性契约——current flow 内 unversioned 字段写盘后，**当前 thread 后续 method 是否立刻读到**？这是 reflectable × persistable 自我迭代可用性的关键。**裁决**：unversioned 字段写**flow 内**（非 pool）→ 同 thread 读写经 session 对象表（A 区核心 4 单实例 map）→ **write-through 立即可见**（写盘 + 同步 mutate 内存表）。session 结束后由 reflectable 分发器把 flow 内 unversioned 字段 merge 进 pool（issue D 主体）。pool 本身仍 append-only sediment 语义，pool 写直接生效但下次 hydrate 才进对象表（这是 knowledge sediment 现状，对 unversioned 字段无影响——因为 unversioned 字段写 flow 而非直写 pool）。
- 沉淀触发时机：**仅显式 talk(super) 触发分发**——不在 flow end 自动触发（避免平凡 session 都走分发器）。
- knowledge 边界：agent 在 flow 中新增的 knowledge 默认进 pool sediment（不版本化），seed knowledge 由 supervisor / reflectable 显式提升（issue D 主体）。

### review by object-model —— 通过、4 处提醒

- `OocObjectInstance{id,class,data}` 中 `data` 内存层**仍是单一 merge 后视图**（method.exec 拿到的 self 永远是完整 data）；二分仅在 save/load 时按 VERSIONED_FIELDS 路由——**裁决采纳**：内存单一、持久三层。
- 核心 7 不破坏：runtime 提供 scope 维度（"versioned"/"unversioned"），对象 save 自决填哪些字段（对象的存储自由保留）。
- OocClass 加 `versioned_fields?: readonly (keyof Data)[]` 合理；命名建议 `field_scopes` / `scoped_fields` 但 `versioned_fields` 名指意更直接、**裁决保留 versioned_fields**。
- session 对象表与多层 hydrate：必须有「**hydrate/save 一致性契约**」——hydrate 幂等且原子；save 跨 scope 时三个 scope 写入对外原子可见。**裁决**：runtime save 路径串行（一个对象的多 scope 写按顺序：先 flow 暂存（local 原子）→ session 结束（或显式分发）才传播到 stone/pool）；hydrate 顺序：stone canonical + pool sediment + flow override，flow 覆盖优先。
- 方案 B 同伴常量：与对象模型「object = data + 行为，data 是声明式 schema」一致，装饰器是 host 借喻、**裁决坚定选 B**。

### review by completeness critic — 6 处漏列 + 5 处自洽冲突 + 5 处越界

**核心反馈**：
- 漏列受影响元素：**executable / thinkable / readable / collaborable / app** 必加；filesystem / interpreter / terminal / feishu_app **每个 builtin 必逐一评估 VERSIONED_FIELDS**。
- 自洽：flow 暂存中的 unversioned 数据在 ff-merge 时**不合入主分支**（unversioned 不走 PR），由分发器在 session 结束时 merge 进 pool（issue D 主体）。这是 reflectable reviewer 已裁决的路径。
- 行号准确度：reviewer 建议加 commit hash 锚定；本 issue 不补 commit hash，落地者实测一次。
- 术语：「flow 暂存」与「flow worktree」混用——**裁决**：明确二者关系——flow worktree（git 物理）= 承载 class 源码暂存 + flow 元数据 + data.json；flow 暂存（语义）= flow worktree 内未合入 main 的所有变更（class 源码 + data 字段值）。data.json 内 versioned 字段=待 PR 合入候选；data.json 内 unversioned 字段=待 pool sediment 候选。
- 越界：方案 A vs B / data.json 物理布局 / 合并优先级 等技术决策已在裁决段拍板，移出"待裁决点"段。

## 裁决

按 reviewer 反馈大幅收敛——**取消 3 处过设计 + 接纳 6 处补全 + 头号问题（内存可见性）已澄清**。

### 裁决要点

1. **同伴常量（方案 B）**——每个 builtin types.ts 旁导出 `export const VERSIONED_FIELDS: readonly (keyof Data)[]`；`Class.versioned_fields` 在 index.ts 装配引用。**最终采纳**。

2. **三层物理布局**（**修订 issue 原稿，取消过设计**）：
   - **stone**：版本化字段的 canonical 值——存放路径仍按既有 self.md/readable.md/executable/visible 文件特殊化（如 agent.self → self.md），其余 versioned 字段落 `stones/main/objects/<id>/data.json`。
   - **pool**：仅承载 sediment 语义数据——`pools/objects/<id>/knowledge/*.md`（knowledge sediment，沿用现有 sedimentKnowledge API）。**unversioned 字段不直接进 pool**——它们写 flow 内（见下）。
   - **flow**：session 暂存 = `flows/<sid>/objects/<id>/data.json`（**单 json**，含 versioned + unversioned 字段的 working copy）+ git worktree 内的 class 源码改动。
   - **取消 `data.versioned.json` / `data.unversioned.json` 双文件**——单 data.json 内字段按 VERSIONED_FIELDS 路由。
   - **取消 `class-edits/` 目录**——class 源码改动经 worktree 文件系统直接落 stone 路径副本（与现状一致）。

3. **runtime save/load 路由**（**runtime 控制、对象配合**）：
   - `saveObjectData(baseDir, sessionId, ref, data)` 拆三步：
     ```ts
     const { versioned, unversioned } = splitByVersioned(data, class.versioned_fields ?? []);
     // 1. flow working copy（versioned + unversioned 全字段）写 flows/<sid>/objects/<id>/data.json（增量 / merge）
     await writeFlowData(baseDir, sessionId, ref.id, { ...versioned, ...unversioned });
     // 2. 自定义 save 由 runtime 多次调用，每次带不同 scope
     if (class.persistable.save) {
       await class.persistable.save({ ...ctx, scope: "flow" }, data);  // 单次 scope=flow 是最小路径；
       // 仅在 reflectable 分发时另调 scope=stone / scope=pool
     }
     ```
   - `PersistableContext.scope: "stone" | "pool" | "flow"` 字段加入——但**save 调用方在 method 内不感知**（runtime 注入），向后兼容（现有 save 实现可忽略 scope，作为默认 "flow" 行为）。
   - **save 在 method 内调用时 ctx.scope 恒为 "flow"**——业务 method 永远只写 flow（不直写 stone/pool）；只有 reflectable 分发器（issue D）才会以 scope="stone"/"pool" 调 save。

4. **hydrate 路径**：
   - 读对象 data：先读 stone canonical → 用 pool sediment 在特定 field 补充（仅 knowledge sediment 等已存在的 sediment 字段）→ flow override 覆盖 → 入 session 对象表。
   - merge 优先级：`flow > stone canonical + pool sediment merge`（flow 是 working copy，覆盖一切）。

5. **`agent.self → self.md` 特殊化保留**：作为"versioned 字段的持久化格式映射"——agent.persistable.save 按 scope 分支：
   - `scope="flow"` → 写 `flows/<sid>/objects/<id>/self.md`（worktree 内副本）+ 写 data.json 的 self 字段（双写、保持 readable）。
   - `scope="stone"` → 写 `stones/main/objects/<id>/self.md`（仅 reflectable 分发器调用）。

6. **内存可见性 = write-through**：write→flow data.json + 同步 mutate session 对象表的 instance.data；同 thread 后续 method 读 self.data 立即可见（A 区核心 4 单实例 map）。

7. **VERSIONED_FIELDS 是 class definition 一部分**：与 executable/readable 同级、归 class 源码 stone 路径；agent 改 VERSIONED_FIELDS 即"改 class 源码"，走 PR——**不可在 flow 内 mutate**。

8. **builtin VERSIONED_FIELDS 标注**（落地必做）：
   - `_builtin/agent`: `["self"]`（self 字段版本化）
   - `_builtin/agent/thread`: `[]`（全部非版本化——messages / events / status 等都是运行时事实）
   - `_builtin/agent/pr|plan|todo|method_exec_form|skill_index`: `[]`（运行时载体）
   - `_builtin/filesystem`: `[]`（file/search 子对象 path/content 非版本化）
   - `_builtin/filesystem/file`: `[]`
   - `_builtin/filesystem/search`: `[]`
   - `_builtin/terminal`: `[]`
   - `_builtin/terminal/terminal_process`: `[]`
   - `_builtin/interpreter`: `[]`
   - `_builtin/interpreter/interpreter_process`: `[]`
   - `_builtin/knowledge_base`: `[]`
   - `_builtin/knowledge_base/knowledge`: `[]`（sediment 已落 pool/knowledge/）
   - `_builtin/runtime`: `[]`
   - `_builtin/user`: `[]`
   - `_builtin/feishu_app`: `[]`（token / cache 非版本化）

9. **受影响设计元素补**：
   - `## executable`：method.exec 拿到的 self 永远是 merge 后单一视图——本 issue 不动 method 协议，但 self.md 在 executable × persistable 角加一句澄清。
   - `## thinkable`：context 渲染仍读 inst.data（merge 后视图）—— 不动协议，但 thinkable × persistable 节同步备注。
   - `## readable`：投影读 inst.data merge 视图——不动协议。
   - `## collaborable`：thread message 是 thread.data 字段一部分，标记为非版本化（thread VERSIONED_FIELDS = []）。
   - `## app`：HTTP API 不变（PUT /stones/:id/file?path= 与 method.exec 路径都不感知 scope，scope 由 runtime 内部路由）。

10. **取消"待裁决点 6 个"**——已全部裁决。

### 落地步骤（worktree `.worktree/persistable-three-layer-relocation`）

1. types/persistable.ts：`PersistableContext` 加 `scope: "stone" | "pool" | "flow"`（向后兼容，缺省 = "flow"）。
2. types/executable.ts：`OocClass<Data>` 加 `versioned_fields?: readonly (keyof Data)[]`（位置 = ooc-class.ts 而非 types/executable.ts，二选其一）。
3. core/persistable/runtime-object-io.ts：
   - `saveObjectData` 拆字段：默认按 scope="flow" 调 save；split 字段供 reflectable 分发器后续按 scope="stone"/"pool" 重调。
   - `hydrate` 路径：stone canonical + pool sediment + flow override。
4. 各 builtin types.ts 加 `export const VERSIONED_FIELDS`。
5. 各 builtin index.ts 装配 `versioned_fields: VERSIONED_FIELDS`。
6. agent persistable.save 按 scope 分支（flow=写 working copy / stone=由 reflectable 分发器调用）。
7. tests/persistable：加 split / merge / hydrate / write-through 用例。
8. 文档回流：
   - `persistable.self.md` 核心 1-N 完全重写（参考 reviewer 给的 9 条草稿，按裁决调整）。
   - `index.md` `## persistable` / `## reflectable × persistable` / `## persistable × thinkable` 三节同步。
   - `executable × persistable` 跨维度节补一句（self 是 merge 视图）。
   - `agent` self.md 补 `versioned_fields` 介绍。

### 与 issue D 关系

- C 必须先 land verified 才能开 D fan-out（D 是 C 的分发器消费方）。
- D 落地后接管"reflectable 分发器把 flow 内 unversioned 字段 merge 进 pool / versioned 字段经 PR merge 进 stone"的链路。
- C 只立"分发对象"（VERSIONED_FIELDS + scope + flow working copy）；D 立"分发器"（super session + 分发 method + PR finalizer）。

## 落地验收

### verification by issue-C reviewer（2026-06-26）

按 design-workflow 步骤 4 独立验收。结论：**verified**——核心契约全部代码落地、文档回流、质量门绿、严格对齐裁决、无 issue 外漂移。

- **文档验收**：
  - persistable self.md 一、核心设计段 9 条核心条目（World 持久化目录 / 三层级版本化分工 / VERSIONED_FIELDS 同伴常量 / scope 路由 / hydrate 顺序 / write-through / stone-worktree / feat-branch PR / agent 自写程序），逐条编号互相正交。
  - 三层物理布局清晰：stone=版本化 canonical / pool=knowledge sediment-only / flow=本 session 暂存 working copy。
  - VERSIONED_FIELDS 同伴常量 + 方案 B（"不发明 host 不需要的新机制"）明示。
  - hydrate-snapshot 机制描述（issue C 倒灌、供 issue D 消费）。
  - index.md `## persistable` / `## persistable × thinkable` / `## reflectable × persistable` / `## agent` 4 节同步。
- **代码验收**：
  - `PersistableContext.scope: "stone" | "pool" | "flow"` 加；兼容性 OK。
  - `OocClass.versioned_fields?: readonly string[]` 加。
  - 19 个 builtin VERSIONED_FIELDS 装配完整（agent=`["self"]`，其余 18 个空数组）。
  - hydrate-snapshot.ts 实现完整（recordHydrate / readSnapshot / hashField sha256）并在 hydrateSession 后真调。
  - saveObjectData 按 scope 路由（默认 scope="flow"）。
  - hydrate 顺序：stone canonical → pool（仅 knowledge sediment 不入主路径）→ flow override。
  - write-through 内存可见性（session 对象表单实例 map）已测。
  - agent.persistable.save 按 scope 分支（flow / stone / pool no-op）。
- **退潮验收**：`writePoolUnversioned` 公开 API 全仓零命中（彻底退役）；`data.versioned.json` / `data.unversioned.json` / `class-edits/` 全仓零命中（过设计无残留）。
- **漂移验收**：git diff 仅 45 个文件，全在裁决落地步骤 1-7 范围内。
- **质量门**：`bun run check:tsc` 干净；`bun test packages/@ooc/tests/persistable-versioned-fields.test.ts` = 6 pass / 0 fail / 19 expect / 277ms。

**缺口清单**（轻微，不阻塞 verified）：
1. persistable self.md 未设独立「迁移映射」段显式记录 issue 原稿过设计取消（`class-edits/` 目录 / 双 json 文件 / `writePoolUnversioned` 公开 / `PersistableContext.scope` 写进 save 调用方签名）；建议在「四、模拟推演」与「扩展点」之间加小节列出。下一 issue 顺带，不阻塞。

落地 commit：`708fc50d`（feat/persistable-three-layer-relocation 分支）。
