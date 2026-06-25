---
title: mergeFeatBranch 双源统一 + PR resolve 闸门完整接通 + reverse-binding invalidate
status: draft
date: 2026-06-25
follows: 2026-06-25-inheritance-via-source-import-spread.md
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

（待 fan-out）

## 裁决

（待裁决后填）

## 落地验收

（待 landed 后填）
