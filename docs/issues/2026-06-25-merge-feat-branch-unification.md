---
title: mergeFeatBranch 双源统一（删 sync 版 + happy-path 测试）
status: decided
date: 2026-06-25
follows: 2026-06-25-inheritance-via-source-import-spread.md
splits:
  - 2026-06-25-reflectable-pipeline-wiring.md  # 改动 2 拆走
  - 2026-06-25-session-level-invalidate.md      # 改动 3 拆走
---

# mergeFeatBranch 双源统一 + PR resolve 闸门完整接通

## 背景 / 动机

issue `2026-06-25-inheritance-via-source-import-spread` 落地验收发现：

**真问题 1（MEDIUM 漂移）**：源码里**两个同名 `mergeFeatBranch`**——
- `packages/@ooc/core/persistable/stone-versioning.ts:290` — `async mergeFeatBranch(baseDir, branch, paths, reason)`，**带** invalidate 钩（前 issue 裁决 D7 加的，hot-reload 路径 A）
- `packages/@ooc/core/persistable/feat-branch.ts:146` — `sync mergeFeatBranch(input)`，**不带** invalidate 钩

**唯一 caller** 是 `tests/feat-branch.test.ts:11`，调用的是 **feat-branch.ts 版本**——意味着：
1. 前 issue D7 的 invalidate 钩子**永不触发**——它挂在 stone-versioning.ts 那份没人调的函数上。
2. PR merge 路径在测试与运行时不一致：测试经 feat-branch.ts，但 stone-versioning.ts 才是「权威方法」（注释明示「ff-merge feat → main + 失效 loader 缓存 → 回收 worktree」）。

**真问题 2（PR resolve 闸门未接通）**：`stone-feat-branch.ts:18` 注释引用 `aggregatePrApproval（_builtin/agent/pr 的 pr-issue.ts）` 作合入闸——**该文件不存在**。PR auto-merge 闸从未真正接通：reviewer 全员 approve 后没有任何代码触发 mergeFeatBranch。

**真问题 3（session-level reverse-binding invalidate 未实施）**：前 issue D7 裁决里 MVP 路径「merge finalizer 直接清空整个 sessionRegistry（下次 hydrate 冷启）」未实施——`mergeFeatBranch` 只清 class-level cache (`ServerLoader.invalidateStone`)、不清 running session 的 sessionRegistries。父 class 改动后所有「ooc.class=该父」的 children 的 session 实例仍持 stale class entry。

三个问题是同一线索的三段：**reflectable feat-branch PR 通道在「merge → invalidate → 反向传播」链上断了，且断点表面是「invalidate 钩没生效」、本质是「权威 mergeFeatBranch 没 caller、PR resolve 闸没人写」**。

## 现状（锚 index.md 对应 `##` 节）

锚点：
- `## reflectable × persistable`（D 区）—— feat-branch PR 通道是 stone 变更进 canonical 的唯一沉淀单元；ff-merge 完成后 trigger invalidate 的合规链路
- `## reflectable`（B 区）—— super flow `talk(target="super")` → new_feat_branch → create_pr_and_invite_reviewers → reviewer approve → merge finalizer
- `## persistable`（B 区）—— stones / flows / pools 三层
- `## runtime`（E 区）—— ServerLoader 缓存失效 / sessionRegistries 内存表

涉及文件：
- `packages/@ooc/core/persistable/stone-versioning.ts:283-323`（`async mergeFeatBranch` + invalidate 钩）
- `packages/@ooc/core/persistable/feat-branch.ts:140-160`（`sync mergeFeatBranch`）
- `packages/@ooc/core/persistable/stone-feat-branch.ts:18`（指向 `aggregatePrApproval` 的注释；该函数尚未实现）
- `packages/@ooc/builtins/agent/children/pr/`（PR builtin class——是否有 approve 流转 method / finalizer hook？）
- `packages/@ooc/tests/feat-branch.test.ts`（唯一 caller，走 feat-branch.ts）
- `packages/@ooc/core/runtime/world-runtime.ts`（持 sessionRegistries 内存表）

## 改动提案

### 改动 1：mergeFeatBranch 双源统一

二选一：

**方案 A · 收敛到 stone-versioning.ts（带 invalidate 钩，async，权威）**：
- 删 `feat-branch.ts:146` 的同名 sync 版本
- `tests/feat-branch.test.ts:11` 改为 import async 版本 + await
- pros: 统一权威，invalidate 钩生效
- cons: 改测试，需要 `await` 适配

**方案 B · 收敛到 feat-branch.ts（sync 简单版）+ 把 invalidate 钩内置进 sync 版本**：
- 删 `stone-versioning.ts:290` 的 async 版本
- 把 invalidate 钩内联进 sync 版本（dynamic require 同样可以 best-effort、避循环依赖）
- pros: 测试不动；caller API 简单
- cons: invalidate 是 async 操作硬塞进 sync 函数语义不洁

倾向 **方案 A**——「ff-merge feat → main + 失效缓存 + 回收 worktree」本就是 async 操作组合，sync 是早期遗留。

### 改动 2：PR resolve 闸门完整接通

`stone-feat-branch.ts:18` 注释引用的 `aggregatePrApproval` 是设计承诺、未实施。补：

```
super flow PR resolve 闸链路：

reviewer approve / reject (in pr window method)
  → 写入 pr-issue record (persistable/pr-issue.ts)
  → aggregatePrApproval(prId) 计算合入条件
  → 全员 approve 满足 → mergeFeatBranch(branch, paths)
  → invalidate 钩生效
  → super flow finalizer 反馈给原 agent
```

具体步骤：
1. 检查 `builtins/agent/children/pr/` 当前实现——pr 是否有 `approve` / `reject` method？是否写 pr-issue？
2. 实现 `aggregatePrApproval(prId): { approved: boolean, missingReviewers: string[] }`（放 `core/persistable/pr-issue.ts` 或 `pr/pr-issue.ts`）
3. 加 PR resolve finalizer：approve 满足时自动调 mergeFeatBranch + reflect_request 窗回馈（已退役？需 review）
4. 加端到端测试覆盖：super flow open PR → reviewer approve → merge 自动触发 → invalidate 链发生

### 改动 3：session-level reverse-binding invalidate

前 issue D7 裁决说「MVP：merge finalizer 直接清空整个 sessionRegistry（下次 hydrate 冷启）」——本 issue 完成它。

具体改动：
- `mergeFeatBranch` 末尾，invalidate ServerLoader 后，**同步** invalidate 所有 active sessionRegistries 中 `ooc.class=<改动的某 class>` 的 instances（让它们下次 hydrate 走新 class）。
- API：`WorldRuntime.invalidateSessionsByClass(classIds: string[])` —— 遍历 `sessionRegistries`，每个 session 内 `objectRegistry.iterate()`，找 `inst.class ∈ classIds` 的标记 stale。
- **保守路径**（前 issue D7 MVP 建议）：直接清空全部 sessionRegistries（强行冷启）；优化后续单开 issue。

或 **更保守**：暂不实施 session-level invalidate；等真有运行时 bug 报告再做。本 issue 只做改动 1+2。**待裁决点 1**。

### 改动 4（可选）：补 PR auto-merge 端到端测试

`tests/feat-branch.test.ts` 当前只测 sync mergeFeatBranch 本身——不覆盖「reviewer approve → 自动 merge」链路。补：
- `tests/pr-resolve.test.ts`：开 stone feat-branch → 调 `aggregatePrApproval` → 触发 merge → 核 invalidate 钩跑了 → 核 main 上有 new commit

## 受影响设计元素

对照 `knowledge/index.md` 的 `##` 元素清单：

- `## reflectable`（B）—— PR resolve 闸链路是 reflectable 通道核心；本 issue 把"承诺但未实施"补成"已实施"
- `## reflectable × persistable`（D）—— 合入闸的设计契约：feat-branch PR 是 stone 变更唯一沉淀单元；本 issue 让链路真正生效
- `## persistable`（B）—— mergeFeatBranch 行为统一 + invalidate 钩生效
- `## runtime`（E）—— 改动 3 涉及 sessionRegistries 失效语义

**未受影响**：A 区核心（不动对象模型）/ B.executable / B.readable / B.thinkable / B.visible / B.collaborable / B.observable / B.app / 各 builtin class 设计

## 风险与权衡

1. **改动 1 方案 A 改测试**：tests/feat-branch.test.ts 的 sync→async 适配；测试代价小。
2. **改动 2 涉及 pr builtin 实现状态未知**：需要先 review `builtins/agent/children/pr/` 当前 surface，可能 method 已写一半、需补齐。
3. **改动 3 sessionRegistry 清空可能引入性能/行为问题**：清空后下次 hydrate 重读盘——session 重启代价。MVP 路径接受。
4. **PR resolve finalizer 与 reflect_request 窗的关系**：reflect_request 是否已退役？需 review。

## 待裁决点

1. **改动 3（session-level invalidate）本轮做还是另开 issue？** 建议本轮做 MVP（清空全部 sessionRegistries），避免漂移累积。
2. **改动 1 选方案 A 还是 B？** 倾向方案 A。
3. **改动 2 的 `aggregatePrApproval` 放哪个文件？** `core/persistable/pr-issue.ts`（已存在？） vs `builtins/agent/children/pr/pr-issue.ts`（按注释暗示）。
4. **改动 4 端到端测试覆盖率要多深？** 最少 1 个 happy-path？还是含 partial approve / reject / 多 reviewer / 跨 session？

## review 记录

按 design-workflow 步骤 2 fan-out（4 个 sub agent：3 个受影响设计元素 reviewer + 1 个完整性批评官——后者首轮回答事实错位、第二轮重审无新增有效漏列，仅 prAutoMerge 等担忧在 reflectable reviewer 评论中已覆盖；以下记三个有效评论）。

### B · reflectable —— 同意但有严重担忧（issue 严重低估实施工作量）

- **核心发现**：本 issue 揭露的不是「PR resolve 闸缺一个 aggregate 函数」，而是 **reflectable 核心 5 整条链路从未被代码层接通过**——盘点 13 个环节里有 **8 处 gap**：
  - `reflect_request` 投影 class — **未实现**（thread/readable/index.ts:97-108 window 数组缺第三个 decl）
  - `new_feat_branch` thread executable method — **未实现**（agent/knowledge/super-flow.md 教 agent 调，但 thread executable 没注册）
  - `create_pr_and_invite_reviewers` thread executable method — **未实现**
  - `createPrIssue` / PR-Issue 持久化 — **未实现**（pr.approve/reject 只改 in-memory data，重启丢）
  - `aggregatePrApproval` — **未实现**（issue 已知）
  - `auto-merge finalizer` — **未实现**（async mergeFeatBranch 当前零 caller）
  - reflect_request 通道的 author 回馈 — **未实现**
  - reviewer 评审 thread 入队 — 状态未知
- **`reflect_request` 状态裁决**：**未退役**——supervisor knowledge / reflectable self.md / thread builtin 多处权威源仍在描述它；只是 `thread/readable/index.ts:97-108` 的 window 数组实现缺第三个 decl + `computeProjectionClass` 缺 super flow POV 路由。issue 改动 2 第 3 步「reflect_request 窗回馈（已退役？需 review）」应改为「补 reflect_request decl + super flow POV 路由」。
- **关键漏项 1：`prAutoMerge` world 配置闸**——reflectable self.md 核心 6 明示「自动合入或人工 checkpoint 由 world 配置 prAutoMerge 决定，默认要人确认」。issue 改动 2 第 3 步直接说 approve 满足时 auto-merge——**违反默认值契约**。落地必须 gated；默认 false 时 aggregate 满足仅打 `ready-to-merge` 标签、等人类经控制面确认。
- **关键漏项 2：路径 A vs 路径 B 偷渡测试**——前 issue D7 拍板边界（agent 不可在 session worktree 直写绕开 PR 闸）需要一个 fail-loud 测试守护。改动 4 端到端测试增第 3 项：agent 经 filesystem.write_file 在 `flows/<sid>/` 下试图直写 → fail-loud。
- **关键漏项 3：reject finalizer + 回修通道**——reflectable self.md 派生 2「回修 resume」（PR reject → 重投 super(foo) author thread + 同 intent 幂等重绑）issue 完全没提，必须含 reject finalizer。
- **接口边界一问**：`aggregatePrApproval` 应作纯函数判定逻辑放 `core/persistable/pr-issue.ts`，触发 finalizer 钩子放 builtin pr——**机制 vs 策略分层**。pr 是 reflectable 的承载窗 class，aggregate 规则归 persistable。
- **拆分建议**：本 issue 改动 2 应拆为 2a（thread surface：reflectable methods + reflect_request decl）+ 2b（PR 闸：aggregatePrApproval + auto-merge finalizer + author 回馈），改动 2b/改动 3 各自考虑另起新 issue——「一次裹太大会 land 不动」。

### B · persistable —— 部分同意（**精准 invalidate 路径 vs 全清**）

- **改动 1（双源统一）**：强 approve 方案 A（收敛 async）。`feat-branch.ts:146` sync 版**缺 invalidate + 缺 releaseWorktree**——按 self.md「ff-merge feat → main + 失效 loader + 回收 worktree」三段铁律，sync 版**事实上是 broken 的子集**。建议 issue 改动 1 措辞为「**删除** feat-branch.ts:140-160，调用方全部切到 async + await」（不是"统一签名"——那暗示双源保留）。
- **改动 3 关键反对**：「清空所有 sessionRegistries」**违反 flow-main 解耦铁律**——flow 是 main 的 fork、二者解耦；其他 session 各自停在 fork 时刻的 main HEAD，main 推进不该牵连。但**发起本次 merge 的 session 自己**的 registry 在 merge 后确实变 stale（fork base 已被覆盖）。
- **正确措辞**：`WorldRuntime.invalidateSessionByClass(initiatingSid, classIds)`——签名带 sid，**只清发起方**。前 issue D7 拍板的"直接清空全部 sessionRegistries"应在本轮顺手矫正。
- **接口边界一问回答**：「哪条路径推动了 main、哪条路径自己负责对齐；旁观者维持独立时间线」——这才是 self.md 的正解。
- **新增担忧**：
  1. invalidate 并发安全：merge 期间另一 session 正在 hot-reload 同一 class 时的 race
  2. mergeFeatBranch 需新增 sid 参数 + PR record schema 需含 originSid（当前可能没有）
  3. stone-feat-branch.ts:18 类失修注释建议本 issue 顺带跑 `grep -rn "_builtin/agent" packages/@ooc/core/persistable/` 全扫
  4. feat-branch.ts 整文件存废：若 sync mergeFeatBranch 删后只剩 plumbing，应整合到 stone-versioning.ts 或重命名 stone-worktree.ts（保留空壳是新熵增）
- **测试要求**：feat-branch.test.ts 在 happy path 之后补「merge 完成后，发起 session 的 registry 中相应 class entry 被清；同 world 另一 session 的 registry 不被清」**正负双断言**，把改动 3 语义锁死。

### E · runtime —— 部分同意（**改动 3 设计前提错位 + 应拆走独立 issue**）

- **重大实测发现 1**：`sessionRegistries` 是 `object-registry.ts:232` 的 **module-level 进程级 const 单例**，**不**在 `WorldRuntime` 实例上（`world-runtime.ts:22-29` interface 只暴露 `serialQueue / serverLoader / stoneRegistry`，**无** sessionRegistries 字段）。issue 改动 3 写的 `WorldRuntime.invalidateSessionsByClass` API **基于错误前提**——正确形态是 `object-registry.ts` 加 module-level export。
- **重大实测发现 2**：清空 sessionRegistries 后果**不是「下次 hydrate 重读盘」**——`getSessionRegistry(sid)` miss 时只 new 空 ObjectInsRegistry + copyFrom builtinClassRegistry，**没有自动 hydrate**。`thread-runtime.ts:253/273` 的 `if (!inst) return;` 会让 thinkloop **silent 卡死、不报错**。MVP「全清」要真生效，必须同时改 `getSessionRegistry` 语义或所有 caller 前置 hydrate ——**这是个比 issue 描述大得多的工程**，不是 MVP。
- **strong 建议**：改动 3 **拆走独立 issue**（标题如 `session-level reverse-binding invalidate 设计（含 hot-reload + PR merge 双触发统一）`）。本 issue 只做 1+2+4。
- **改动 2 实测发现**：
  - `commitAndOpenPr` 也是承诺未实施（stone-feat-branch.ts 4 处注释引用、0 命中）—— PR **创建侧**也断
  - `aggregatePrApproval` 全树 0 命中 → issue 断言准确
  - PR builtin (`builtins/agent/children/pr/`) 当前只有 `index.ts / package.json / types.ts`，3 method 已实现但是 in-memory（不写持久化）
  - 改动 2 实际 scope 应扩到 P2 收尾：**`commitAndOpenPr` + `aggregatePrApproval` + `approval-flow.ts` 编排**三项一起，否则做了 aggregate 没有 caller 也是新一层死代码
- **方案 A 接口形态变化**：sync `MergeFeatInput {baseDir, branch, worktreePath}` → async `(baseDir, branch, paths, reason)`——**测试侧要补 paths 参数**+ 调用方 worktree 回收逻辑现已内置在 async 版的 `cleanupWorktreeAfterMerge`，旧测试「worktree removed」断言形态需调整。
- **paths 透传契约**：mergeFeatBranch caller 在 approval-flow 内必须从 `commitAndOpenPr` 落账的 `record.paths` 取（不能凭空构造）——否则 `extractObjectIdsFromPaths` 拿空集，invalidate 钩"成功但没清任何东西"。
- **queue 注意**：approval-flow 调 mergeFeatBranch 必须在 `enqueueSessionWrite` 或同等串行 queue 内（stone-versioning.ts:271 注释 queue-naive 假设）——并发 PR merge 会撞 git lock。
- **裁决点 3 回答**：放 `packages/@ooc/builtins/agent/children/pr/`。stone-feat-branch.ts 注释早就这么写，且 core/persistable 留纯 git 原语的不变量也支持这个选择。**待裁决点 3 实际是个伪问题**，按现有注释执行即可。
- **lifecycle 与 invalidate 分离**：清 sessionRegistries 时**不应**触发 dispatchUnactive——业务侧 cleanup 跑、但下次 hydrate 重建不会回滚，状态不自洽。正确语义 silent replace class entry。这条不变量真做改动 3 时要写入 self.md。

### 完整性批评官（首轮事实错位 → 补充结论）

首轮回答把 issue 主题读反了（把"补 aggregate"误读成"删 aggregate"），结论不可用。但顺手指出的 **`prAutoMerge` 配置 + `talk(target="super")` 入口** 两个担忧已被 reflectable reviewer 独立覆盖（漏项 1 + 新增担忧 2），无独立增补。

无新增漏列受影响元素需补。issue 当前的「受影响 / 未受影响」清单经三方 reviewer 复核**已足够准确**。

## 裁决

按 design-workflow 步骤 3，三方 reviewer fan-out 后 Supervisor 拍板：

### D1 · scope 收窄到「双源统一」一件事

原 issue 改动 1+2+3+4 实际是三件不同尺度的事:
- 改动 1（双源统一） = 小，删 sync 版本即可
- 改动 2（PR resolve 闸接通） = 大，reflectable reviewer 揭露**核心 5 整条通路 8 处 gap**
- 改动 3（session-level invalidate） = 中，runtime reviewer 揭露**设计前提错位**（sessionRegistries 是 module 单例不在 WorldRuntime；MVP 全清会 silent 卡死）

裹一起 land 不动。拆分:
- **本 issue**保留：**改动 1（删 sync 版 mergeFeatBranch）+ 改动 4 happy-path 测试**
- 改动 2 → 新 issue **`2026-06-25-reflectable-pipeline-wiring.md`**（reflectable 核心 5 通路接通）
- 改动 3 → 新 issue **`2026-06-25-session-level-invalidate.md`**（含 hot-reload + PR merge 双触发统一）

### D2 · 改动 1 措辞收紧

按 persistable reviewer 强 approve + runtime reviewer 实测：

- **删除** `packages/@ooc/core/persistable/feat-branch.ts:140-160` 的 sync `mergeFeatBranch`（不是「统一签名」——那暗示双源保留）
- `tests/feat-branch.test.ts:11` 切到 `packages/@ooc/core/persistable/stone-versioning.ts:290` 的 async 版本 + `await`
- **接口形态变化必须显式记入实施 PR**：sync `MergeFeatInput {baseDir, branch, worktreePath}` → async `(baseDir, branch, paths, reason)`。测试要补 `paths` 参数；worktree 回收逻辑已内置在 async 版的 `cleanupWorktreeAfterMerge`——旧 `gitWorktreeRemove` 断言不再需要。
- **feat-branch.ts 整文件存废核查**：删 mergeFeatBranch 后该文件还剩什么？若只剩 create/list/cleanup 类 plumbing，整体并入 stone-versioning.ts 或重命名 stone-worktree.ts——保留空壳是新熵增。

### D3 · 改动 4 happy-path 测试范围

只 1 个测试 case：`open feat-branch → write file → commit → mergeFeatBranch (async) → 核 main HEAD 推进 + spy defaultServerLoader.invalidateStone 调用 = objectIds 数`。
- 验证 D7 invalidate 钩**真正生效**（之前挂在 async 版上零 caller 永不触发，本 issue 第一次让它被调用）
- partial approve / reject / 多 reviewer / 跨 session 端到端全部留给 reflectable-pipeline-wiring issue

### D4 · paths 透传契约（落地约束）

mergeFeatBranch caller 必须从 PR record 的 `paths` 字段取（不能凭空构造）——否则 `extractObjectIdsFromPaths` 拿空集、invalidate 钩"成功但没清任何东西"。

本 issue 范围内**没有真 PR 闸 caller**（那是新 issue A 的事），所以本 issue 改动 4 测试里 paths 由测试 setup 显式构造。但实施 PR 注释要写明这条契约约束、给下游 issue A 提示。

### D5 · queue 注意

approval-flow 调 mergeFeatBranch 必须在 `enqueueSessionWrite` 或同等串行 queue 内（stone-versioning.ts:271 注释 queue-naive 假设）——本 issue 改动 1 不动 caller，但实施 PR 注释要写明并发风险。

### D6 · 实施分期

- **P1（≤0.5 天 · 在 worktree）**：
  - 删 `feat-branch.ts:140-160` sync mergeFeatBranch
  - feat-branch.ts 整文件存废核：若只剩 plumbing 整合到 stone-worktree.ts 或 stone-versioning.ts
  - 切 `tests/feat-branch.test.ts` 到 async 版 + 补 paths 参数
  - 加 happy-path invalidate 钩 spy 断言
  - `bun run verify` 全绿

- **P2（≤0.5 天 · 对象树文档）**：
  - 改 `## persistable` self.md / index.md 描述 `mergeFeatBranch` 行为：唯一权威是 async 版、ff-merge + invalidate + worktree cleanup 三段铁律

### D7 · worktree 隔离

涉及 `packages/@ooc/core/persistable/`，按 design-workflow 在 `.worktree/merge-feat-branch-dedup/` 开 worktree。

### 不在本 issue 范围

- reflectable 核心 5 通路（new_feat_branch / create_pr_and_invite_reviewers / pr-issue 持久化 / aggregatePrApproval / auto-merge finalizer / reflect_request decl / author 回馈 / reject 回修）→ 见 `2026-06-25-reflectable-pipeline-wiring.md`
- session-level invalidate（含 sessionRegistries 归属重设计 + getSessionRegistry miss 语义 + hot-reload/PR merge 双触发统一）→ 见 `2026-06-25-session-level-invalidate.md`
- `prAutoMerge` world 配置闸 → 归 reflectable-pipeline-wiring
- reviewer 评审 thread 调度可达性 → 归 reflectable-pipeline-wiring

## 落地验收

（待 landed 后填）
