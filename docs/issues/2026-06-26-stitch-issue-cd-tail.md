---
title: 衔接 issue C/D 落地遗留：mergeFeatBranch 双源消除 + flow-scan 读真 versioned_fields
status: decided
date: 2026-06-26
follows: 2026-06-26-reflectable-redesign-as-flow-dispatcher.md
---

# 衔接 issue C/D 落地遗留：mergeFeatBranch 双源 + flow-scan 真读 versioned_fields

## 背景 / 动机

issue D `2026-06-26-reflectable-redesign-as-flow-dispatcher` verified 段显式标记三项衔接 followup，本 issue 收完前两项（属纯机械改造、无设计变更）：

1. **mergeFeatBranch 双源消除**：`core/persistable/feat-branch.ts:146` 旧 sync 版（仅 ff-merge + remove worktree）与 `core/persistable/stone-versioning.ts:290` 新 async 版（含 invalidate + sync-merged-object + cleanup）并存；新版才有 issue D 依赖的 invalidate 钩子，但旧版仍被 `tests/feat-branch.test.ts` 拉住。这是 issue `2026-06-25-merge-feat-branch-unification`（已 decided）的落地尾巴——issue D 已切到新版，但旧版未删。
2. **flow-scan.ts `getVersionedFields` 硬编码**：`core/persistable/flow-scan.ts:57-72` 当前硬编码 `_builtin/agent → ["self"]`，文件头 TODO 注释明示「issue C verified 后改读 class.versioned_fields」。issue C 已 verified、`ClassRegistry.resolveVersionedFields(classId)` seam 已就位（`runtime/object-registry.ts:300-303`），18 个 builtin 全部装配 `VERSIONED_FIELDS` 同伴常量——可直接替换硬编码。

不在本 issue 范围（另起 issue G）：
- **hydrate-snapshot conflict 检测启用**——需扩 ScanFlowChangesResult 契约 + reflect method UX 决策，属设计变更，不夹带。

## 现状（锚 index.md 对应 `##` 节）

锚点：
- `## persistable`（B 区）—— `mergeFeatBranch` 是 stone versioning 通道的合入闸；双源消除属退潮卫生。
- `## reflectable`（B 区）—— 4 reflect method 通过 scan_changes 决定字段归桶，依赖 versioned 判据。
- `## reflectable × persistable`（D 区）—— flow→stone 沉淀链路。
- `## OOC Class/Object Model`（A 区）—— OocClass.versioned_fields 字段（issue C verified）。

涉及文件：
- `packages/@ooc/core/persistable/feat-branch.ts`（整文件退役）
- `packages/@ooc/core/persistable/stone-versioning.ts:290`（新 mergeFeatBranch，保留）
- `packages/@ooc/core/persistable/flow-scan.ts:10-13,57-72`（getVersionedFields 硬编码）
- `packages/@ooc/builtins/agent/children/thread/executable/method.reflect.ts:120,211,315`（scanFlowChanges 三处调点）
- `packages/@ooc/tests/feat-branch.test.ts`（旧版唯一 caller，退役）
- `packages/@ooc/core/runtime/object-registry.ts:300-303`（resolveVersionedFields seam，复用）
- `packages/@ooc/core/persistable/index.ts:113-124`（re-export 表）

## 改动提案

### 改动 1：mergeFeatBranch 双源消除

退役整个 `core/persistable/feat-branch.ts` 文件：
- 删 `mergeFeatBranch`（旧 sync 版，:146）+ 整文件其余符号（`createFeatBranchWorktree:65` / `commitFeatAndDiff:128` / `readWorktreeFile:162` / `writeWorktreeFile:172` / `slugFromIntent:39`）。
- 这些符号在 `core/persistable/stone-feat-branch.ts` 内有同名等价实现（survey 已确认 `index.ts:113-124` re-export 的是新版），故删除安全。
- 删 `tests/feat-branch.test.ts`——唯一 deep-import `feat-branch.ts` 的 caller；其 3 个 case（slugFromIntent / commitAndDiff / merge+清 worktree）已被 `reflectable-redesign-issue-d.test.ts` + `persistable-versioned-fields.test.ts` 覆盖（survey 已确认）。
- `core/persistable/index.ts` re-export 表如有引 `feat-branch.ts` 路径的，改指 `stone-feat-branch.ts`（survey 显示 :100 已是新版、:113-124 re-export 也是新版——但需 grep 确认 barrel 是否还显式 re-export `./feat-branch.js`）。

### 改动 2：flow-scan.ts 真读 class.versioned_fields

- `core/persistable/flow-scan.ts`:
  - 删 `getVersionedFields(classId)` 函数（:57-72）+ 文件头相关 TODO 注释（:10-13）。
  - `scanFlowChanges` 加 `registry: ClassRegistry` 入参；内部经 `registry.resolveVersionedFields(classId)` 取字段表。
  - 或更轻：caller 预先解析 `const versioned = registry.resolveVersionedFields(classId)` 传入，`scanFlowChanges` 收 `versionedFields: readonly string[]` 入参——这条更简单（已有 caller 都在 method.reflect.ts，能拿到 registry）。
- `builtins/agent/children/thread/executable/method.reflect.ts` 三处 `scanFlowChanges` 调点（:120 / :211 / :315）改：先 `ctx.runtime.resolveVersionedFields?.(classId)` 或经 ClassRegistry 解析后传入。需暴露 `resolveVersionedFields` 给 ExecutableContext / RuntimeHandle 吗？倾向：在 RuntimeHandle 加 `resolveVersionedFields?(classId): readonly string[]` 方法（or builtin runtime/class-registry seam 已可达）。**实测确认调用路径**。
- 新增 `tests/flow-scan.test.ts`：断言 `scanFlowChanges` 对 agent / thread / todo / 自定义 class 给出正确 versioned 分桶（替代 method.reflect 层的间接覆盖）。

### 改动 3（顺手）：flow-scan.ts 文件头注释清理

文件头 TODO「issue C verified 后改读 class.versioned_fields」已兑现，注释段清掉或改为「读 ClassRegistry.resolveVersionedFields」事实描述。

## 受影响设计元素

A 区：无（不动对象模型）。

B 区：
- `## persistable` —— mergeFeatBranch 唯一通路收口（实施层）；versioned_fields 真读路径打通。
- `## reflectable` —— scan_changes 内部从硬编码迁到 registry 解析（实施层、无契约变更）。

D 区：
- `## reflectable × persistable` —— flow→stone 链路 versioned 判据 source 收口到 OocClass.versioned_fields 单一 source（实施层精修）。

E 区：
- `## thread` —— reflect method 三处 scan 调点签名微调（无契约变更）。

未受影响：所有维度核心契约、index.md 文字层。**纯实施层退潮 + 衔接**，不触动 self.md 核心条目。

## 风险与权衡

1. **删 feat-branch.test.ts 是否丢覆盖**：survey 确认其 3 个 case 已被新测试覆盖；slugFromIntent 在 stone-feat-branch.ts re-export 后由 reflectable-redesign-issue-d.test.ts 走 happy path 间接验证。可保留 1-2 个 unit test 移至 stone-feat-branch.test.ts（如有），不强求。
2. **scanFlowChanges 签名变更（加 versionedFields 入参）vs 加 registry 入参**：倾向**加 versionedFields 入参**——签名最小、不让 flow-scan 持有 registry 依赖；caller 解析后传入。
3. **method.reflect.ts 三处调点改造的 ExecutableContext 是否能拿到 registry**：实测决定；如不能直接拿，可在 RuntimeHandle 加 seam（轻 API 扩展、属 issue F 内可接受）。

## 待裁决点

1. **改动 2 签名形态**：`scanFlowChanges` 加 `registry` 还是加 `versionedFields`？倾向**加 versionedFields**（最小入侵）。
2. **改动 1 是否保留 slugFromIntent 单测**：倾向**删除**（间接由 reflectable-redesign-issue-d.test.ts 的 happy-path 覆盖；slugFromIntent 是纯字符串归一函数，逻辑足够简单）；若 reviewer 要求保留则移至 stone-feat-branch.test.ts。
3. **改动 2 是否需要新 builtin runtime seam（resolveVersionedFields 在 RuntimeHandle 上）**：实测决定，最小路径。

## review 记录

按 design-workflow 步骤 2 轻量 fan-out（改动属纯机械改造、表面小）3 个 reviewer——persistable / reflectable+thread / 完整性批评官。

### review by persistable —— 方向赞同、3 处建议

- 改动 1 删 `feat-branch.ts` 整文件赞同，但**必须**列「旧符号 → 新符号签名对照表」，特别注意 sync→async 破坏性签名变更；reflectable reviewer 已做完此对照（见下），covered。
- 改动 2 签名形态**倾向 `scanFlowChanges(reg: ClassRegistry)`**——热更场景下 fresh 解析，避免 caller 物化快照陈旧；但 reflectable reviewer 实测路线 B 更优、不引入 RuntimeHandle 扩展。
- 担心**旧 flow 数据的兼容性**：若硬编码集合与 OocClass.versioned_fields 真读差异较大，旧落盘 flow 可能含被移除的 versioned 字段——但 survey 已确认 18 builtin VERSIONED_FIELDS 装配后唯一非空仍是 `_builtin/agent → ["self"]`，与旧硬编码完全一致；无迁移压力。
- slugFromIntent 建议**提到 `_shared/`**——不采纳，stone-feat-branch.ts 内同函数已就位、纯字符串归一无强烈共享驱动。
- feat-branch.test.ts 删除「核心断言迁到新落点」要求——经 reflectable reviewer 实测确认 3 个 case 由 reflectable-redesign-issue-d.test.ts + persistable-versioned-fields.test.ts + flow-scan 新测覆盖等价，无独立保留必要。

### review by reflectable / thread —— 实测最透彻、明确推荐

**关键实测结论**：
- **路线 B（`scanFlowChanges(versionedFields: readonly string[])`）实测最优**：method.reflect.ts:31 已有 `import { iterateSessionObjectTable }` 先例，同模块再 `import { getSessionRegistry }` 零成本；caller 预解析 `getSessionRegistry(ctx.sessionId).resolveVersionedFields(classId)` 传入，flow-scan 保持「无 runtime 依赖的算法函数」最干净。
- **不扩 RuntimeHandle**：survey + 实测三调点 `:120/:211/:315` 已拿到 classId，仅缺一步 registry resolve，直接 import 即可；不污染 RuntimeHandle 契约层（`executable.ts:9` 「最小面」立场维持）。
- **feat-branch.ts 5 符号等价性逐一对照通过**：slugFromIntent（长度阈值 48→40 但无 caller 依赖具体长度）、createFeatBranchWorktree（新版 async + enqueueSessionWrite 串行化 + WORKTREE_EXISTS 幂等强化）、commitFeatAndDiff（返回值升级含 reviewer 集 + PR payload；reflect method 经 `createFeatBranchPr` 调新版、未直调旧版）、mergeFeatBranch（新版含 invalidate 钩子）、readWorktreeFile / writeWorktreeFile（新版**不存在**，reflect method 直接用 `node:fs/promises`、不经它们）—— reflect method 与旧 feat-branch.ts **零交集**，删除安全。
- **改动 2 隐含收益**：黑名单（thread/pr/skill_index/method_exec_form/plan/todo 排除）消失——各自 VERSIONED_FIELDS = [] 让它们返空，无需显式黑名单。
- **必加 e2e wiring assertion**：单测无法捕「resolveVersionedFields 接没接通」的 wiring bug，必须在 `reflectable-redesign-issue-d.test.ts` 内补一段断言 versioned_dirty 桶非空且含 `self`。
- 顺手清 `agent/types.ts:15` TODO 注释 + `flow-scan.ts:10-13` TODO 段。
- 不夹带 `findCallerSessionId` TODO 优化（另起 issue）。

### review by completeness critic — Issue F

- **完整性批评官部分内容基于对 issue 的误读**（他把改动错读为"slug 透传 + lazy create + 元数据兜底"，实际是"mergeFeatBranch 双源消除 + flow-scan 真读 versioned_fields"）——他建议补 executable / runtime / reflectable × executable / storybook 4 元素的论据基于幻觉，**不采纳**：本 issue 不扩 RuntimeHandle（executable 契约不动）、不动 ClassRegistry seam（runtime 契约 issue C 已建好）、不动跨维度契约。
- **术语漂移提醒有效**：`versioned_fields`（概念，类的版本化字段集合）vs `VERSIONED_FIELDS`（导出常量名，运行时入口）需在 issue/落地区分；`scanFlowChanges`（函数）vs `scan_changes`（method 名）需区分——**采纳**，落地遵守。
- **改动 1 vs 改动 2 独立性**：批评官误判，实际两改动确实独立（一个删旧文件、一个换扫描数据源）——**确认独立可并行**。
- 收窄范围合理（不夹带 hydrate-snapshot conflict 检测），但要留 followup 钩子——本 issue 落地验收段显式标记 followup issue G。

## 裁决

**采纳改动 1/2/3，按 reflectable reviewer 实测路线 B 落地。**

### 裁决要点

1. **删除 `core/persistable/feat-branch.ts` 整文件**——5 符号在 stone-feat-branch.ts 内全部等价（已实测）；reflect method 经 createFeatBranchPr 调用新版、与旧版零交集；index.ts barrel 已 re-export 新版（确认 `:113-124` 指向 stone-feat-branch.ts）。

2. **删除 `tests/feat-branch.test.ts`**——3 个 case（slugFromIntent / commitAndDiff / merge+清 worktree）已被 reflectable-redesign-issue-d.test.ts + persistable-versioned-fields.test.ts 等价覆盖；slugFromIntent 不单独保留单测。

3. **flow-scan.ts 改造（路线 B）**：
   - 删 `getVersionedFields(classId)` 函数（:57-72）+ 文件头 TODO 段（:10-13）+ 黑名单排除段（thread/pr/etc）。
   - `scanFlowChanges` 签名改：`(baseDir, sessionId, objectId, versionedFields: readonly string[])`——**移除原 classId 入参**（内部不再需要）。
   - caller 在 method.reflect.ts 内 `import { getSessionRegistry } from "@ooc/core/runtime/object-registry.js"`（同 `:31` 先例），调点形态：
     ```ts
     const registry = getSessionRegistry(ctx.sessionId);
     const versionedFields = registry.resolveVersionedFields(classId);
     const result = await scanFlowChanges(baseDir, sessionId, objectId, versionedFields);
     ```
   - **不扩 RuntimeHandle**（保持 executable.ts:9「最小面」立场）。

4. **method.reflect.ts 三处调点改造**（:120 / :211 / :315）：按上述形态。

5. **新增 `tests/flow-scan.test.ts`**：3 case
   - agent classId + `["self"]` versioned → self 入 versioned_dirty 桶。
   - thread classId + `[]` versioned → 全部入 unversioned_dirty 桶。
   - 自定义 dummy class with `versioned_fields: ["x"]` 注册到测试 ClassRegistry → 验证扩展性。

6. **扩 `tests/reflectable-redesign-issue-d.test.ts`**：补 wiring assertion 段——构造 agent 改 `.self` → 触发 super flow scan_changes → 断言 versioned_dirty 含 self 字段（防止 resolveVersionedFields 接错）。

7. **顺手清**（落地必做）：
   - `flow-scan.ts:10-13` TODO 段（已兑现）。
   - `agent/types.ts:15` TODO 注释「issue C verified 后须在 class.versioned_fields 显式声明」（issue C 已 verified，注释失效）。
   - `flow-scan.ts` 黑名单排除段（versioned_fields 真读后自动消失，删干净）。

8. **术语遵守**：`versioned_fields`（概念 / 小写）vs `VERSIONED_FIELDS`（常量名 / 大写）严格区分；`scanFlowChanges`（函数 / camelCase）vs `scan_changes`（reflect method 名 / snake_case）严格区分。落地代码与提交信息遵守。

9. **不在本 issue 范围**（followup）：
   - `hydrate-snapshot conflict 检测启用`——涉及 ScanFlowChangesResult 契约扩展（加 `conflicts` 字段）+ reflect method UX 决策（PR 时 base 用 snapshot stoneHead？让用户 rebase？），属设计变更——**留独立 issue G**。
   - `findCallerSessionId` TODO 优化——`method.reflect.ts:62-70` 当前返 undefined、三调用退化扫所有业务 flow——独立 issue。
   - `slugFromIntent` 提到 `_shared/`——persistable reviewer 建议、不采纳。

10. **质量门**：tsc 干净 + 新增 flow-scan.test.ts 全绿 + reflectable-redesign-issue-d.test.ts 仍绿 + 主仓 `bun test packages/@ooc/tests/` 回归零新红。

### 落地步骤（worktree `.worktree/stitch-cd-tail`）

1. 删 `packages/@ooc/core/persistable/feat-branch.ts` 整文件。
2. 删 `packages/@ooc/tests/feat-branch.test.ts` 整文件。
3. `core/persistable/index.ts` 检查 barrel re-export 表是否还有 `./feat-branch.js` 路径——若有则删；现状已是 `./stone-feat-branch.js`，应无需改。
4. `core/persistable/flow-scan.ts` 改造：删 getVersionedFields / TODO 段 / 黑名单段；签名改 versionedFields 入参。
5. `builtins/agent/children/thread/executable/method.reflect.ts` 三处调点改造（同 `:31` import 先例）。
6. `builtins/agent/types.ts:15` TODO 注释清理。
7. 新增 `tests/flow-scan.test.ts` 3 case。
8. 扩 `tests/reflectable-redesign-issue-d.test.ts` wiring assertion。
9. `bun run check:tsc` + `bun test packages/@ooc/tests/` 必须绿。
10. commit + push 到 main。

## 落地验收

（待 landed 后填）
