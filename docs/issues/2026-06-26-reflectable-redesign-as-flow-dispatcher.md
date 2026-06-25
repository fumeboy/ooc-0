---
title: reflectable 重设计——super session 作为 flow 变更分发器（versioned→stone PR / unversioned→pool）
status: landed
date: 2026-06-26
follows: 2026-06-26-persistable-three-layer-relocation.md
---

# reflectable 重设计：super session 作为 flow 变更分发器

## 背景 / 动机

用户指示：「忘记现有 reflectable 设计，完全重新思考」。当前 reflectable 维度的主要问题：

1. **空承诺过多**——`talk(target="super")` 未识别 alias、reflect_request 投影未注册、`new_feat_branch` / `create_pr_and_invite_reviewers` method 不存在、approval-flow / PR-Issue 持久化全是 docstring，详见 reflectable wiring survey（issue `2026-06-25-reflectable-pipeline-wiring` 未落地）。
2. **沉淀两通道与"版本化判据"脱钩**——self.md 核心 4「pool sediment（运行时事实）/ stone 变更（身份+身体+seed knowledge）二通道」按"是不是运行时事实"判，但什么是"运行时事实"模糊；issue C 立了清晰得多的判据：**字段是否版本化**——这才是 PR 流程的真正驱动力。
3. **"super 是入口"的语义不够锐**——super 当前定位是"反思 session"，但 issue C 后 flow 暂存了"所有变更"，需要一个**显式合并触发器**——super 应该被刻画为「flow 变更的分发器」，不是泛义"反思场所"。
4. **改 OOC 框架核心源码尚未闭环**（self.md 模拟推演项 4）——dogfooding 的关键环节，issue C 后 class 源码变更全在 flow 暂存，super 可统一处理。

**重设计核心思路**：
- super = **特殊 sessionId**（`SUPER_SESSION_ID = "super"`），唯一**显式合并入口**。
- 普通业务 session 任何对象不直接 commit/merge——只在 flow 暂存。
- `talk(target="super")` 是 OOC agent 触发"我要把本 session 积累的变更分发出去"的标准入口；其执行体打开 super flow 内的一个 reflect window（投影自当前对象的 super-self 分身），把变更清单 surface。
- 在 reflect window 里，agent 自己（或人类经控制面）决定哪些变更分发——版本化字段 + class 源码变更经 feat-branch PR 进 stone、非版本化字段直写 pool。
- 整条链路：**单一入口 + 单一分发器 + 双下游通道（PR / pool）**。

## 现状（锚 index.md 对应 `##` 节）

锚点：
- `## reflectable`（B 区）—— 全部核心（1-8）重写。
- `## reflectable × persistable`（D 区）—— 分发器语义化。
- `## pr / reflect_request`（E 区）—— pr 与 reflect_request 投影 class 全面落地。
- `## collaborable`（B 区）—— talk(target="super") 入口。
- `## persistable`（B 区）—— 依赖 issue C 三层重定位；本 issue 只消费"版本化字段是什么"。
- `## thread`（E 区）—— super flow POV 投影 + reflect 系 method。

涉及文件（继承 issue `2026-06-25-reflectable-pipeline-wiring.md` 现状）：
- `packages/@ooc/core/types/constants.ts:13-19`（SUPER_SESSION_ID / SUPER_ALIAS_TARGET / isSuperSessionId）
- `packages/@ooc/builtins/agent/executable/method.talk.ts:15-40`（talk 入口，未识别 super alias）
- `packages/@ooc/builtins/agent/children/thread/readable/index.ts:97-108`（缺 reflect_request decl）
- `packages/@ooc/builtins/agent/children/thread/executable/index.ts:14-21`（缺 reflect 系 method）
- `packages/@ooc/builtins/agent/children/pr/`（pr builtin 半实现 + 缺持久化）
- `packages/@ooc/core/persistable/stone-feat-branch.ts:14-20`（aggregatePrApproval 等承诺）
- `packages/@ooc/core/persistable/feat-branch.ts` + `stone-versioning.ts`（mergeFeatBranch 双源）

## 改动提案

### 改动 1：talk(target="super") 入口落地

`method.talk.ts`：
- 识别 `args.target === SUPER_ALIAS_TARGET`（"super"，trim+lowercase）。
- 路由到 `instantiate(THREAD_CLASS_ID, { sessionId: "super", calleeObjectId: ctx.object.id /* self */, ... })`——派生一条进 super session 的 thread，对端=自己。
- 同 session 多次 `talk(super)` 复用同一 super thread（幂等绑定，避免每次新建）。

### 改动 2：super flow session 隔离

worker / scheduler：
- `sessionId="super"` 时仍由 worker 调度，但**写路径强制走 main**（issue C 的 `sessionUsesWorktree` 排除 super 沿用）。
- super session 的 thread 持有的 `reflect_request` 窗 surface 出"分发器"方法集。

### 改动 3：reflect_request 投影 class + thread executable 加 reflect 系 method

thread/readable/index.ts:
- `window[]` 加第三个 decl `class: "reflect_request"`，`object_methods: ["scan_changes", "create_pr_for_versioned", "sediment_unversioned", "create_pr_for_class_edits"]`，`window_methods: [say, reply]` 同 talk decl。
- `computeProjectionClass`：当 thread.sessionId === SUPER_SESSION_ID 时 → 投影 `reflect_request`；否则按 issue B 的 `default` / `talk` 路由。

thread/executable/index.ts 加 4 个 method（不是 guide，参数明确）：

1. **`scan_changes()`**：扫当前对象（=反思发起者）的 flow 暂存——返回三组清单：
   - `versionedChanges: { field, oldValue, newValue }[]`（来自 `flows/<sid>/objects/<self>/data.versioned.json`）
   - `unversionedChanges: { field, oldValue, newValue }[]`（来自 `data.unversioned.json`）
   - `classEdits: { path, diff }[]`（来自 `flows/<sid>/objects/<self>/class-edits/`）
   - **issue D 关键**：清单是 reflect_request 窗的核心视图（renderer 渲入 context）。

2. **`create_pr_for_versioned(fields?: string[], title: string)`**：对指定版本化字段（缺省 = 全部）起 feat-branch PR：
   - 从 stones/main 派生 feat 分支 worktree
   - 把版本化字段当前值写入该分支对应文件（data.versioned.json / agent.self → self.md 等特殊路由）
   - commit + 算 reviewer + createPrIssue + 投递评审窗
   - 返回 prId。

3. **`sediment_unversioned(fields?: string[])`**：对指定非版本化字段（缺省 = 全部）直写 pool：
   - 把字段当前值写入 `pools/objects/<self>/data.unversioned.json`（merge）
   - 同步把 flow 暂存中这些字段标记为"已沉淀"（避免下次 scan_changes 再 surface）
   - 立刻生效，无 PR。

4. **`create_pr_for_class_edits(paths?: string[], title: string)`**：对指定 class 源码编辑起 feat-branch PR：
   - 同 versioned PR 路径，但内容来自 `flows/<sid>/objects/<self>/class-edits/`
   - 同走 reviewer + createPrIssue + 评审窗。

> 这 4 个 method 替代 issue `2026-06-25-reflectable-pipeline-wiring` 提议的 `new_feat_branch` + `create_pr_and_invite_reviewers` 二段式——本 issue 改"一步到位"（不需要 agent 手动开分支再 commit；scan_changes 给出清单，3 个分发 method 各自包办"开分支→写→commit→PR/直写"）。

### 改动 4：pr builtin 补全（持久化 + finalizer）

pr/index.ts:
- `Class` 加 `persistable: { mode: "inline" }` 或独立 save——倾向 `mode: "inline"`（PR record 随其载体 reflect thread 落盘）。
- approve / reject / comment 三 method 改后调 `onReviewerAction(prId, action)` finalizer。

新建 `core/persistable/pr-issue.ts`（按 reflectable reviewer 指引"存储底座归 core/persistable"）：
- `createPrIssue(record): PrIssueId` / `loadPrIssue(id)` / `updatePrIssue(id, patch)` — 持久化 PR 记录到 stones/main/.pr-issues/<id>.json（属 main 直写 metadata，不进 feat 分支）。
- `aggregatePrApproval(record): { approved, rejected, missing }` — 纯函数。

新建 `builtins/agent/children/pr/approval-flow.ts`（finalizer 钩子归 builtin）：
- `onReviewerAction(prId, action)`：load record → aggregate → 分流 reject / approve 两路 finalizer。
- `mergeFinalizer`：调 mergeFeatBranch + updatePrIssue → 经 reflect_request 通道通知作者 thread。
- `rejectFinalizer`：updatePrIssue → 通知作者 thread（按 reflectable 派生 2 回修 resume）。

### 改动 5：mergeFeatBranch 双源统一

继承 issue `2026-06-25-merge-feat-branch-unification` 已 decided 的方案 A（收敛到 `stone-versioning.ts` 带 invalidate 钩 async 版本，删 `feat-branch.ts` sync 版）——若该 issue 已 verified，本 issue 直接用其结果；否则把它合并落地。

### 改动 6：sediment 通道与 pool 直写 API 收敛

把 `core/persistable/reflectable.ts` 的 `sedimentKnowledge` 改名 `appendSedimentKnowledge` 保留 knowledge 专用 API；新增通用 `writePoolUnversioned(baseDir, ownerObjectId, data)` API，被 `sediment_unversioned` method 使用。

### 改动 7：reflectable.self.md 全文重写

按"super = flow 变更分发器"重写：
1. **核心 1：reflectable = 自我迭代闸门**——所有 stone 变更（含 class 源码 + 版本化字段）+ pool 沉淀（非版本化字段）都经 super session 统一分发；business session 内**只暂存不分发**。
2. **核心 2：super session 是显式合并入口**——`sessionId="super"` 是单一恒定标识；`talk(target="super")` 是入口。
3. **核心 3：reflect_request 窗 surface 分发器方法**——scan_changes / create_pr_for_versioned / sediment_unversioned / create_pr_for_class_edits。
4. **核心 4：版本化字段经 PR / 非版本化字段直写 pool / class 源码经 PR**——三类下游通道，按字段类型自动选。
5. **核心 5：feat-branch PR 是 stone 变更进 canonical 的唯一渠道**——保留现有铁律。
6. **核心 6：PR reviewer 由"改动了谁的地盘"决定**——保留现有规则。
7. **核心 7：reflectable 不发明新机制**——复用 collaborable talk/say + persistable stone/pool/flow + thinkable knowledge。
8. **核心 8：reflectable 知识写成 .md 教对象**——保留。

### 改动 8：knowledge 文档同步

- `builtins/agent/knowledge/super-flow.md` / `self-evolution.md` 重写：教 agent 在 reflect_request 窗里调 scan_changes 看清单、再调三个分发 method。
- `end-reflection.md` 更新：end 之前考虑 talk(super) 分发。
- `pr-review.md` 不变。

### 改动 9：测试覆盖

四个 e2e：
- happy path：business session 改 self + 改 unversioned 字段 + 改 class 源码 → talk(super) → 三类各起 PR / 直写 → reviewer approve PR → merge → 反映回 main。
- reject path：PR reject → 回修 resume。
- 偷渡 fail-loud：在 business session 内试图直接 commit main（绕 super） → 拒绝。
- 幂等：同 session 多次 talk(super) 复用 super thread。

## 受影响设计元素

A 区
- `## OOC` —— 元编程主张三「Object 自我迭代」首次端到端兑现。

B 区
- `## reflectable` —— **全部核心重写**（依赖 issue C 落地）。
- `## collaborable` —— talk(super) 入口落地。
- `## executable` —— thread executable 加 4 reflect 系 method。
- `## readable` —— thread readable window 加 reflect_request decl（class="reflect_request"，与 issue B 的 default 约定并存）。
- `## persistable` —— **依赖 issue C** 的三层重定位（本 issue 的分发器消费它）。
- `## visible` —— PR resolve 控制面 endpoint（人类侧合入闸）。

C 区
- `## builtins` —— pr class 补全 + thread reflect 系 method。

D 区
- `## reflectable × persistable` —— 分发器语义全面化。
- `## readable × thinkable` —— reflect_request 窗进 super flow context。
- `## collaborable × thinkable` —— talk(super) 自指通道。

E 区
- `## thread` —— readable 投影 + executable 增 method。
- `## pr / reflect_request` —— pr 真 class 补全 + reflect_request 投影。
- `## agent` —— talk method 识别 super alias。

未受影响：thinkable / observable / app（核心契约层）。

## 风险与权衡

1. **依赖 issue C**：本 issue **必须等 C verified 后**才能开始改动 3-6（versioned/unversioned 分类才有意义）。改动 1-2-7-8 可与 C 并行（属入口/文档层）。
2. **改动 3 4 method 比 issue 2026-06-25-reflectable-pipeline-wiring 的 2 method 设计更厚**——一步到位 vs 二段式。倾向一步到位（更少 agent 心智负担、PR 创建链路收敛在 reflectable 内）。**待裁决点 1**。
3. **PR-Issue 物理存储位置**：core/persistable/pr-issue.ts 把 PR record 落 `stones/main/.pr-issues/<id>.json`——`.pr-issues/` 是 git tracked 还是 untracked？倾向 **untracked**（PR 状态变更频繁，进 git 会噪），由 .gitignore 排除。**待裁决点 2**。
4. **flow→super 触发频率**：用户是否要求每个 session end 都自动 talk(super)？倾向**手动触发**——agent 决定何时分发，没改可不调；强行 end-time 触发会让平凡 session 都走一遍分发器。
5. **session 内 self.md 直写 main 的回归**：issue C 让 agent.self 写 flow 暂存（不再直写 stone worktree 内 self.md）；改动 3 的 PR 通道把变更分发到 stone——保留 self.md 作为 stone 路径下的特殊文件名。
6. **prAutoMerge 闸**：已有 `world-config.ts:84` 的配置（默认 false）；本 issue approval-flow 接它。

## 待裁决点

1. **改动 3 method 设计粒度**：4 个"一步到位"method vs 2 个"二段式"（new_feat_branch + commit_pr）。
2. **PR-Issue 存储 git tracked 与否**：tracked 利于审计回放、untracked 利于减少噪声。
3. **改动 1 同 session 多次 talk(super)** 是否幂等绑定同一 super thread。倾向**幂等**。
4. **super flow 的 thread 是否对端=自己**：本 issue 假设 calleeObjectId=self；但也可以让对端是固定的"super 系统对象"。倾向 self（reflectable self.md 核心 3「和 super 对话 ≡ 向 super session 里的自己（仍是 Foo）发消息」）。
5. **改动 7 self.md 重写 8 条核心**：是否保留现有"feat-branch PR 是 stone 变更唯一渠道"这条铁律？保留。

## review 记录

按 design-workflow 步骤 2，4 个 reviewer fan-out（reflectable / collaborable+thread / persistable / 完整性批评官）。**结论**：方向正确，但 **3 处基础设施风险**必须先裁决：(1) 跨 session inbox 派送、(2) PR-Issue 物理落点、(3) writePoolUnversioned 与 issue C 冲突。

### review by reflectable —— 4 method 通过、self.md 8 条草稿、7 处补全

**关键反馈**：
- 4 method 一步到位**强烈支持**（vs 2 段式）；输入语义对齐"扫某来源 → 决定输出通道"，与 sediment_unversioned 对称（pool 无 PR 通道，直写）。
- self.md 8 条核心草稿（采纳）。
- create_pr_for_versioned **不应自己处理 self → self.md mapping**——复用 persistable.save with `scope="stone", target_branch=featBranch`（issue C 的 schema mapping 边界）。
- **守卫位置应放 persistable/stone-* 的 commit→main 入口**（不放 filesystem.write_file，不放 resolveStoneIdentityRef）。session.flow.kind 经 thinkable context 注入，commit 时 throw `SuperSessionRequiredError`。
- prAutoMerge 必须接通 `world-config.ts:84` 既有配置（**不引入新开关**）。
- pool snapshot/回滚（transactional batch 语义）、observable trace kinds、并发 reflect（**串行 concurrency=1**）、reflect 失败回流、issue C 依赖锚定、super 自身 self.md 不可被 reflect 改、index.md ## 节同步——7 处需在 self.md 注明。

### review by collaborable / thread —— **跨 session 派送是最大风险点**

**关键反馈**：
- super alias 是 talk 的**第三种 target 形态**（peer / fork-self / **super-alias**），不是 fork——caller 在原 session、callee 在 super session、对端=self。需补到 collaborable self.md。
- 幂等键 = `(callerSessionId, callerObjectId)`（不是原稿的 calleeObjectId）；存放在 caller object data 上的 `superThreadRef?: { threadId, sessionId }` optional 字段。多次 talk(super) 复用同一 super thread——若已有 ref + 无 message → 直接返回旧 ref。
- 改动 3 thread executable 4 method 是 **object_methods**（不是 window_methods），措辞需修正：`reflect_request.object_methods: ["scan_changes", "create_pr_for_versioned", "sediment_unversioned", "create_pr_for_class_edits", "say", "reply"]`。
- 投影 ladder：caller 侧 = talk 窗（business session 内）；callee 侧 = reflect_request（仅 super flow）；与 self-view×非super=`thread`、other-view=`talk` 二维表咬合。
- **跨 session inbox 派送**（关键缺口）：现有 scheduler 是 per-session、`dispatchUnactiveIfZero` 也是 per-session——caller→callee 跨 session 派送**没有现成基础设施**。reviewer 建议：**caller 侧只持 ref、消息直接写入 super flow 内 callee thread 的 inbox**（破坏 thread inbox/outbox 对称性但避免新增 cross-session bus 基础设施）。
- scheduler super sessionId 独立 job lane（避免业务长跑饿死 super reflect 处理）。
- collaborable self.md 必加核心 7「talk(target='super') 跨 session 自指」。

### review by persistable / reflectable × persistable —— 6 处架构裁决

**关键反馈**：
- 分发器分层：thread builtin executable 4 method 负责聚合 LLM 意图，**存储底座下沉 core/persistable**（`flow-scan.ts` / `feat-branch-pr.ts` / `sediment.ts` / `class-edits.ts`）。给出 4 个具体函数签名。
- **PR-Issue 落点**：`stones/<branch>/.stones_repo/.pr-issues/<id>.json`（即贴近 bare repo / **不在 main worktree tracked tree 内**）——避免 PR-Issue 污染 canonical、避免递归歧义。**不 git tracked**，运行时元数据语义 = 与 flow inbox 同类。
- mergeFeatBranch 双源统一 inherit `2026-06-25-merge-feat-branch-unification`（已 decided）；不重复设计。
- **writePoolUnversioned 应退役**——与 issue C 冲突。改：unversioned 字段写 flow → super session 内 sediment_unversioned 才把 flow→pool promote（内部调降为私有的 _writePoolUnversioned）。
- **守卫首选 `stone-worktree.resolveStoneIdentityRef`**——`mode:"write", ref:"main"` 直接 throw，仅 mergeFeatBranch 内部 symbol 放行；次选 saveObjectData 二道闸。
- **scan_changes 增量检测机制（最大隐藏复杂度）**：维护 `.hydrate-snapshot.json` 记录"hydrate 时各对象字段 content hash"；scan 时对比 current vs snapshot 标 dirty；同时对比 stone HEAD 标 conflict。
- flow staging 物理布局对 stone/pool 不分目录，靠 metadata 区分；同一对象同一字段 stone/pool 不可共存（issue C 保证）。

### review by completeness critic — Issue D — 8 处补全

**关键反馈**：
- 漏列受影响元素：`## thinkable`（reflect_request 窗渲染 + activator）/ `## observable`（PR 4 method 观测点）/ `## app`（**HTTP API `POST /api/runtime/pr-issues/:id/resolve`** + 前端契约）/ `## knowledge`（声明 sediment 不变）/ `## filesystem`（write_file 路径白名单）/ `## runtime`（ObjectRegistry 对 super scope 识别）/ `## executable × thinkable`（4 method 的 tool description）/ `## executable × persistable`（method 视角下的 scope 感知）—— 至少 8 个补列。
- 内部自洽 3 处灰区：(1) reflect_request 新增 unversioned 字段是其自身 object data 还是 super flow thread.json 嵌入结构？（2）super 自身的 self.md 谁能改？（3）改动 4 / 改动 8 是一个聚合 approval-window 还是每 PR 一个窗？
- 术语漂移：**super session → super flow**、删"分发器"用"super flow"+"reflect_request"、approval-flow.ts 内伪代码降级为状态图。
- 行号引用统一标"落地时重抓"。
- 改动 9 4 method schema TS 类型降级为自然语言字段描述。

## 裁决

按 reviewer 反馈大幅修订。**核心裁决**：

1. **采纳 4 method 一步到位**：`scan_changes` / `create_pr_for_versioned` / `sediment_unversioned` / `create_pr_for_class_edits`——object methods（非 window methods）。

2. **超级 alias = talk 的第三种 target 形态**（collaborable 升级核心 7）：
   - `talk(target="super")` 路由到 sessionId="super" 的 thread，calleeObjectId = caller self（不引入"super 系统对象"）。
   - **幂等键** = `(callerSessionId, callerObjectId)`；caller object data 加 optional `superThreadRef?: { threadId, sessionId }` 字段；多次 talk(super) 复用同一 super thread（caller 持 ref 即重用）。
   - **caller 持 ref / 写直接进 super flow callee inbox**：避免新增 cross-session bus 基础设施；caller object data 的 superThreadRef 是单向引用，消息派送由 caller 直接写 super flow 内 callee thread 的 inbox.json。worker scheduler 经轮询发现 super session 的 inbox 增长 → 调度 super thread thinkloop（**super session 独立 job lane**避免饿死）。

3. **PR-Issue 物理落点**：`stones/<branch>/.stones_repo/.pr-issues/<id>.json`（**贴近 bare repo、不在 main worktree tracked tree 内、不 git tracked**）。

4. **退役 writePoolUnversioned**：与 issue C 决议一致——unversioned 字段写 flow，super 内 `sediment_unversioned` method 把 flow→pool promote；不另起 pool 直写 API。

5. **scan_changes hydrate snapshot 机制**（核心缺口闭合）：
   - 每个 flow 维护 `flows/<sid>/.hydrate-snapshot.json`——hydrate 时记录每个对象每个字段的 content hash + stone HEAD commit sha。
   - `scan_changes` 对比 flow current vs snapshot → 标 dirty；同时对比 stone HEAD → 标 conflict（需 super 仲裁）。
   - hydrate 流程负责生成；ff-merge 后下次 hydrate 自然刷新；运行时物，不 git tracked。
   - 这条机制在 issue C 落地阶段一并补（issue C 没显式裁决到——本 issue D 倒灌 issue C 落地）。

6. **mergeFeatBranch 双源统一**：直接 inherit `2026-06-25-merge-feat-branch-unification`（已 decided 方案 A）；本 issue 不重复设计、不列受影响元素。

7. **守卫位置**：`stone-worktree.resolveStoneIdentityRef`——`mode:"write", ref:"main"` 直接 throw `SuperSessionRequiredError`；仅 mergeFeatBranch 内部经 symbol（如 `__merge_fast_forward_internal__`）旁路放行。次选 saveObjectData 二道闸（detect stone main path）。

8. **prAutoMerge 接通既有配置**（**不引入新开关**）：approval-flow.ts 唯一依据 `worldConfig.prAutoMerge`。

9. **PR HTTP API**：`POST /api/runtime/pr-issues/:id/resolve`（统一 approve/reject/merge 入口）—— app 维度落地。

10. **PR-Issue 与 builtin pr 分层**：
    - 存储底座 = core/persistable/pr-issue.ts（`createPrIssue` / `loadPrIssue` / `updatePrIssue` / `aggregatePrApproval`）。
    - finalizer 钩子 = `builtins/agent/children/pr/approval-flow.ts`（onReviewerAction / mergeFinalizer / rejectFinalizer）。
    - pr.approve / reject / comment 内部触发 onReviewerAction。

11. **状态机草图**（替换原稿 30 行伪代码）：
    ```
    PR-Issue 状态：pending → (人 / aggregator) → { approved → ready-to-merge → (auto / manual confirm) → merged
                                                    rejected → (notifyAuthor) → resume-author }
    ```

12. **受影响元素补**：补列 `## thinkable`（reflect_request 窗渲染 + activator 不动 source-key 模型）/ `## observable`（PR 4 method trace kinds）/ `## app`（HTTP API + web 控制面 PR 详情页）/ `## knowledge`（sediment 路径不变，声明性补列）/ `## filesystem`（write_file 路径白名单仅在 super flow scope 内放宽到 stone/.pool/）/ `## runtime`（ObjectRegistry 对 super sessionId 识别为 metadata scope）/ `## executable × thinkable`（4 method tool description 写在 thread executable）/ `## executable × persistable`（method 视角的 scope 感知由 runtime 注入，method 不感知）。

13. **术语统一**：仅用 `super flow` + `reflect_request` + `approval window` 不再用"分发器"/"super session"；术语回流时同步 self.md 与 index.md。

14. **未在本 issue 解决（留 followup）**：
    - PR-Issue 评审超时/废弃 GC 策略。
    - 同一 flow 多次 scan_changes 的去重（join open PR-Issue 视图）。
    - reflect 自己改 self.md 通过 PR 通道（一致原则；本 issue 不夹带 supervisor 自我演化用例）。
    - 并发 reflect：当前阶段 **串行 concurrency=1**；多 reflect 并发是后续问题。

### 落地步骤（worktree `.worktree/reflectable-redesign-as-flow-dispatcher`）

**前置依赖**：issue C 必须先 verified。落地分两批：

**批次 1（与 issue C 同 worktree）**：
- core/persistable/hydrate-snapshot.ts：写入 `.hydrate-snapshot.json` 的 helper。
- saveObjectData → 把 hydrate snapshot 维护接入 hydrate path。
- core/persistable/flow-scan.ts：scanFlowChanges（基于 hydrate-snapshot 增量检测）。

**批次 2（本 issue D worktree）**：

1. types/constants.ts：SUPER_TARGET_ALIAS / isSuperSessionId 保留（已存在）。
2. core/persistable/stone-worktree.ts：resolveStoneIdentityRef 加 `mode:"write", ref:"main"` 守卫；仅 mergeFeatBranch 经 symbol 放行。
3. core/persistable/pr-issue.ts（new）：createPrIssue/loadPrIssue/updatePrIssue/aggregatePrApproval；落 `.stones_repo/.pr-issues/<id>.json`。
4. core/persistable/feat-branch-pr.ts（new）：createFeatBranchPr（聚合 commit + computeReviewerSet + createPrIssue + 投递 reviewer thread）。
5. core/persistable/sediment.ts：retire writePoolUnversioned 公开；新增 sedimentUnversioned(opts) 私有 promote API。
6. core/persistable/class-edits.ts（new）：createClassEditsPr。
7. builtins/agent/executable/method.talk.ts：识别 SUPER_TARGET_ALIAS → 走 super alias 路径（幂等 ref / 跨 session inbox 派送）。
8. builtins/agent/types.ts：AgentData 加 `superThreadRef?: { threadId, sessionId }` optional 字段；标 unversioned（不在 VERSIONED_FIELDS）。
9. builtins/agent/children/thread/readable/index.ts：window decl 加第三条 `reflect_request`；computeProjectionClass 前置 `sessionId === SUPER_SESSION_ID → reflect_request` 判定。
10. builtins/agent/children/thread/executable/index.ts：加 4 个 object methods（scan_changes / create_pr_for_versioned / sediment_unversioned / create_pr_for_class_edits）。
11. builtins/agent/children/pr/index.ts：补 persistable inline、approve/reject/comment 后触发 onReviewerAction。
12. builtins/agent/children/pr/approval-flow.ts（new）：onReviewerAction / mergeFinalizer / rejectFinalizer / notifyAuthor。
13. core/app/server/modules/runtime/pr-issues.ts（new）：HTTP `POST /api/runtime/pr-issues/:id/resolve`。
14. worker scheduler：super sessionId 独立 job lane（轮询 super flow inbox 唤醒）。
15. 文档回流：
    - reflectable.self.md 8 条核心完全重写。
    - collaborable.self.md 加核心 7（talk(target="super") 跨 session 自指）。
    - thread/readable/index.ts 注释更新 reflect_request 投影。
    - super-flow.md / self-evolution.md / end-reflection.md / pr-review.md knowledge 对齐 4 method 一步到位。
    - index.md：`## reflectable` / `## collaborable` / `## thread` / `## pr / reflect_request` / `## reflectable × persistable` / `## collaborable × thinkable` 全部回流。
16. tests/e2e：happy path / reject + 回修 / 偷渡 fail-loud / 幂等。

## 落地验收

（待 landed 后填）

## 落地（worktree `.worktree/reflectable-redesign-as-flow-dispatcher`）

按裁决执行，骨架 + 主路径 e2e 绿（PR 全自动合入链路标为 phase-2 followup）。

### 修改文件清单（按裁决 A-O 步分组）

**A — 常量**（验证已存在，无改）：
- `packages/@ooc/core/types/constants.ts`（SUPER_SESSION_ID / SUPER_ALIAS_TARGET / isSuperSessionId / THREAD_CLASS_ID 等）

**B — stone-worktree 守卫 + symbol 旁路**：
- `packages/@ooc/core/persistable/stone-worktree.ts` — 增 `MERGE_FAST_FORWARD_INTERNAL` symbol + `SuperSessionRequiredError`；`resolveStoneIdentityRef` write+main 守卫，未持 symbol → throw

**C/D/E/F — core/persistable 新模块**：
- `packages/@ooc/core/persistable/pr-issue.ts`（new）— PR-Issue 持久化底座（落 `stones/.stones_repo/.pr-issues/<id>.json`）+ 状态机类型 + `aggregatePrApproval` 纯函数
- `packages/@ooc/core/persistable/feat-branch-pr.ts`（new）— `createFeatBranchPr` 聚合 helper
- `packages/@ooc/core/persistable/flow-scan.ts`（new）— `scanFlowChanges` + `scanWorktreeClassEdits`（硬编码 versioned-fields，待 issue C verified）
- `packages/@ooc/core/persistable/sediment.ts`（new）— 私有 `_promoteFlowUnversionedToPool`（flow→pool merge）
- `packages/@ooc/core/persistable/index.ts` — re-export 新模块

**G — agent types**：
- `packages/@ooc/builtins/agent/types.ts` — `Data.superThreadRef?: { threadId, sessionId }`

**H — talk method SUPER_ALIAS**：
- `packages/@ooc/builtins/agent/executable/method.talk.ts` — 识别 target='super' 归一；创建/复用 super flow 内 self-view thread；幂等 superThreadRef；跨 session inbox 直写

**I — thread readable**：
- `packages/@ooc/builtins/agent/children/thread/readable/index.ts` — `computeProjectionClass` 前置 sessionId="super" → reflect_request；window 数组追加第三 decl

**J — thread executable 4 reflect methods**：
- `packages/@ooc/builtins/agent/children/thread/executable/method.reflect.ts`（new）— `scan_changes` / `create_pr_for_versioned` / `sediment_unversioned` / `create_pr_for_class_edits`，全部 fail-loud if sessionId ≠ "super"（双闸门）
- `packages/@ooc/builtins/agent/children/thread/executable/index.ts` — 装配 reflect methods

**K/L — pr builtin + finalizer**：
- `packages/@ooc/builtins/agent/children/pr/index.ts` — 加 inline persistable；approve/reject/comment 内部触发 `onReviewerAction`
- `packages/@ooc/builtins/agent/children/pr/approval-flow.ts`（new）— `onReviewerAction` / `mergeFinalizer` / `rejectFinalizer` / `notifyAuthor` / `resolvePrIssueByHuman`；接通 worldConfig.prAutoMerge

**M — HTTP route**：
- `packages/@ooc/core/app/server/modules/runtime/index.ts` — `POST /api/runtime/pr-issues/:id/resolve` + `GET /api/runtime/pr-issues/:id`

**N — worker scheduler**：
- 已是 per-sessionId 队列（`packages/@ooc/core/app/server/runtime/worker.ts`），super 自然独立 lane，无改动

**O — 测试**：
- `packages/@ooc/tests/reflectable-redesign-issue-d.test.ts`（new）— 11 test cases 覆盖 4 个核心路径（fail-loud / 幂等 / happy-path 状态机 / reject）

**P — 文档回流（.ooc-world-meta）**：
- `objects/supervisor/children/reflectable/self.md` — 8 核心全文重写
- `objects/supervisor/children/collaborable/self.md` — 加核心 7（talk(super) 跨 session 自指）
- `objects/supervisor/knowledge/index.md` — `## reflectable` / `## collaborable` / `## pr / reflect_request` 同步
- `packages/@ooc/builtins/agent/knowledge/super-flow.md` — 追加 issue D 4-method 新章节

### 测试结果

- **tsc**：`bun run check:tsc` 绿
- **新测试**：`reflectable-redesign-issue-d.test.ts` 11 pass / 0 fail（38 expect calls）
- **回归**：`bun test packages/@ooc/tests/` 49 pass / 1 fail（fail 项 `web-e2e.test.ts` 为预存基线问题——vite build 在该环境不可用，与本 issue 无关，已 stash 验证）

### 与 issue C 衔接（hydrate-snapshot / scan_changes）

**简化版**：本 worktree 基于 main 不带 issue C 改动，故：
- `flow-scan.getVersionedFields` 硬编码 `_builtin/agent` & 派生类 → `["self"]`，其他 → 空；带 TODO 标记 `verified 后改读 class.versioned_fields`。
- 不维护 `flows/<sid>/.hydrate-snapshot.json`；scan_changes 直接 flow data.json vs stone canonical 比对。
- 不做 conflict 检测（vs stone HEAD）。

### 显式 followup

1. **PR-Issue GC**：评审超时 / 长期 pending 的回收策略。
2. **scan_changes 去重**：join open PR-Issue 视图避免重复打 PR。
3. **reviewer thread 投递**：当前 createPrIssue 落账，但未实例化 pr window 进 reviewer 的 thread context；reviewer 需经磁盘 read PR-Issue / HTTP API 操作。
4. **并发 reflect**：当前 concurrency=1（默认序行），多反思 thread 并发是后续问题。
5. **issue C 同步**：issue C verified 后改 `getVersionedFields` 读 class.versioned_fields；启用 hydrate-snapshot；启用 conflict 检测。
6. **完整 self-evolution.md / end-reflection.md 改写**：本 issue 只对 `super-flow.md` 加 4-method 章节；其他 agent-facing knowledge 文档全面重写待后续。
7. **PR 自动合入链路 end-to-end e2e**：当前 happy-path 测 PR-Issue 状态机；从 thread.exec 调 method → feat-branch create + commit + merge 的完整 LLM-free e2e 需要 ensureStoneRepo（git 2.20 `--bare -b` 不支持）解决。

### 意外问题

1. **resolveStoneIdentityRef 守卫与 agent.persistable.save 互动**：守卫严格执行后，super session 内任何 agent.self mutation 都会触发 throw（agent.persistable 调 resolveStoneIdentityRef("write")）——这是正确行为（super session 内不应直接 mutate stone main），但意味 super flow 内的 agent.self 编辑只能经 4 reflect method 走 PR 通道，不能旁路。本 issue 测试不涉及此场景。

2. **`git init --bare -b main` 不支持 git 2.20**：测试环境 git 版本过老，绕开方式是 mkdir 骨架 + 不真做 git 操作；happy-path e2e 仍验证了 PR-Issue 状态机闭环，但完整 mergeFeatBranch 路径需新版 git 才能跑。
