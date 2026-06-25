---
title: lifecycle 测试覆盖恢复（重构窗口期消失的 active/unactive/refcount 单测与端到端测）
status: draft
date: 2026-06-25
follows: 2026-06-25-inheritance-via-source-import-spread.md
---

# lifecycle 测试覆盖恢复

## 背景 / 动机

inheritance-spread issue verified 后，supervisor 派 sub agent 重写 lifecycle.md 实施走查时发现：thread-runtime 重构窗口期（约 `bd253553` ~ `ca3c7ba6` 区间），多个生命周期机制的旧测试文件消失：

- `core/runtime/__tests__/object-lifecycle.test.ts` — 旧文件名/位置已不存在
- `thread/__tests__/fork-unactive.test.ts` — 同上
- init-windows 路径相关测试

**实测当前覆盖**（`grep -c 'unactive\|refcount' tests/thread-runtime.test.ts` = **0**）：
- 整个 `packages/@ooc/tests/` 12 个测试文件**全部** grep `unactive` / `dispatchActive` / `refcount` 0 命中
- 唯一的 `thread-runtime.test.ts` 仅 86 行、单 `describe("ThreadRuntime")`、不测 lifecycle 路径

**结论**：当前 `ThreadRuntime#dispatchActive`（`thread-runtime.ts:251`）+ `#dispatchUnactive`（`:271`）+ `refcountInSession`（`:239`）+ `removeObject`（object-registry.ts:209）这套 lifecycle 派发引擎**零回归测试**——发生回归只能靠跑 e2e 偶然发现。

这是 object self.md 核心 10「对象生命周期」契约的真实实现，零测试是设计回归风险。

## 现状（锚 index.md 对应 `##` 节）

- `## OOC Class/Object Model`（A 区）核心 10 —— `active` / `unactive` 引用计数派发
- `## runtime`（E 区）—— `ObjectInsRegistry` + `dispatchActive` / `dispatchUnactive`
- `## thread`（E 区）—— 当前 lifecycle 派发实际位置是 thread-runtime.ts（与 thread builtin 共生）
- `object/knowledge/lifecycle.md` 第六章 phase-2 清单 + 「测试归属诚实标注」段刚被 sub agent 标注

涉及代码（当前真实位置）：
- `packages/@ooc/builtins/agent/children/thread/runtime/thread-runtime.ts:140-285`（close + instantiate + dispatchActive + dispatchUnactive + refcountInSession 等）
- `packages/@ooc/core/runtime/object-registry.ts:209`（removeObject）
- `packages/@ooc/builtins/agent/children/thread/index.ts:53`（thread.unactive policy body）

## 改动提案

**只补测试、不改设计**——按 design-workflow 「不走流程」判据，这是测试增补（不动设计契约），按理不必走完整 fan-out。但由于覆盖面较大，留 issue 当事档。

### 改动 1：核心单测 `tests/object-lifecycle.test.ts`

覆盖（与 lifecycle.md 第二章对齐）：
- `refcountInSession` 计数正确（fork window 引用 / 非引用窗 0 / 退出态线程持有的窗不计）
- `dispatchActive` 在 first reference (0→1) 触发；> 1 不触发
- `dispatchUnactive` 在 refcount 归 0 触发；> 0 不触发
- `dispatchUnactive` 返回 `{delete:true}` 触发 `ObjectInsRegistry.removeObject`
- fast-path：class 不声明 active/unactive 时 0 成本（不调 resolveActive）
- self 解析：`getSessionObject` 兜底 / 内存线程树兜底（cover 当前两路径）

### 改动 2：fork-unactive 路径测试 `tests/fork-unactive.test.ts`

覆盖（与 lifecycle.md 第四章对齐）：
- 关 fork 窗 → 子线程 refcount 归 0 → unactive 钩触发
- non-terminal 子线程：往自己 messages 追加 "creator 已关闭对话窗口" 通知（不切终态、不级联）
- terminal（done/failed）子线程：钩子 return（不通知）
- 通知**即时落盘**（reload 后仍看到）
- waiting 子线程因 messages 变化被 scheduler 唤醒（如此机制仍存在）

### 改动 3：close 原语守卫测试

- `closable: false` 的结构窗（self / 自我视角 thread）—— close 原语拒关
- 可关窗 close → 同步 `contextWindows` → `referencedObjectId` 非空 → 触发 dispatchUnactive

### 改动 4（可选）：lifecycle.md 文档对齐

落地后 lifecycle.md 第六章「测试归属诚实标注」段更新——把"重构窗口期未重建"改为"已恢复，见 tests/object-lifecycle.test.ts / fork-unactive.test.ts"。

## 受影响设计元素

- `## OOC Class/Object Model`（A）核心 10 —— 仅文档对齐
- `## thread`（E） / `## runtime`（E）—— 仅测试覆盖恢复，不动设计契约

**未受影响**：A 区核心、其它 B/D/E 元素全部。

## 风险与权衡

1. **mock vs 真 ThreadRuntime**：测试可选 mock class + 真 runtime（核心机制层面）或经端到端 session（行为层面）。倾向 mock + 单测优先，端到端单点 sanity。
2. **代码可能再次重构**：lifecycle 派发当前在 ThreadRuntime 内私有方法——若未来再次外提为 core 公共函数，测试需配套迁移。但这是常规演进、不阻塞补测试。
3. **「nothing to test」陷阱**：若 sub agent 写测试时发现某机制其实在重构后行为不一致（例如 fork 子线程现在不再 push 通知到 messages），那是发现了真 bug，应另起 issue 修代码——不可为了"过测试"而把测试改成符合 buggy 行为。

## 待裁决点

1. 测试代码量 / 覆盖广度上限？建议 ~150 行/文件、覆盖 lifecycle.md 第二/四章核心路径即够。
2. 是否需要 e2e 测（如 super flow open PR → talk(super) → 关 fork → 子线程收通知 端到端）？建议留给 mergeFeatBranch follow-up issue（那边端到端测试已规划）。
3. 实施期发现「机制本身已不一致 / 已死」如何处理？另起 bug fix issue，不在本 issue 夹带。

## review 记录

（按 design-workflow，测试增补可省 fan-out。Supervisor 可直接派 AgentOfThread 实施。）

## 裁决

（待裁决后填）

## 落地验收

（待 landed 后填）
