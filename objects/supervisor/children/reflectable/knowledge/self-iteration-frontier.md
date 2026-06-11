---
title: 自我迭代前沿 —— 层次 A 已闭 / 层次 B 三缺口
description: OOC 「用 OOC 迭代 OOC」分两个层次；问自我迭代到哪一步、dogfooding 在哪断、最小探针怎么设计时看这篇
activates_on:
  "object::root": "show_description"
---

# 自我迭代前沿

「通过运行 OOC 迭代 OOC」混了两件**范畴不同**的事，必须分清：

- **层次 A — Object 自我迭代**：Object 改自己的 stone（self.md / 自己的 executable / visible）。我（reflectable）+ programmable + persistable 共同支撑的那条闭环。
- **层次 B — 系统自我迭代（真 dogfooding）**：Object 改 **OOC 运行时源码**（`packages/@ooc/core/...`）。框架改框架。

## 层次 A：闭环成立（已验证）

`talk(super)` → super(foo) `new_feat_branch` 开 feat 分支 → 直接 `write_file`/`edit` → `evolve_self` 开 PR → reviewer 冒泡审批 → 合入 main → 下一轮新 thread 见新身份/新方法。stone executable 还能 mtime 热更（`packages/@ooc/core/runtime/server-loader.ts:78` 动态 `import(...?t=mtimeMs)`）。

证据：2026-06-11 真 LLM 端到端 **Good**——agent `create_object(bar)` → `talk(super)`（冒泡到 canonical 祖先作 actor）→ `new_feat_branch` → feat 分支 `write_file` → `evolve_self()` 开 PR（reviewers 冒泡、main 未变）→ reviewer approve → 合入 → 新 session 见新身份。A 的循环真的能闭。

## 层次 B：尚未闭过一次——三个结构性缺口

| # | 缺口 | 锚点 | 为什么断 |
|---|---|---|---|
| 1 | **边界** | `executable/windows/_shared/session-path.ts:51` | data 原语（write_file/open_file/edit）被 world-clamp（拒逃出 world 根）；OOC 核心源码在 world 之外的 repo，**没被建模成 world 内可编辑的 Object**，OOP-native 路径够不着。唯一能碰的是 `program(shell)`（`executable/program/shell.ts:7` cwd=process.cwd() 不 clamp）——非 OOP、未沙箱的逃生舱。 |
| 2 | **重载（杀手）** | `runtime/server-loader.ts` | 热更只覆盖 *stone* executable（叶子、动态 import）。核心进程启动时加载一次，改了不热更、必须重启——「改核心→看效果→再改」在进程内闭不上。 |
| 3 | **治理** | `persistable/stone-feat-branch.ts`（computeReviewerSet）+ `stone-versioning.ts`（resolvePrIssue/rollback） | reviewer 冒泡 / PR / merge / rollback 模型是 stone 形状（按对象领地算 reviewer 集）。核心源码「无主」，没有 Object 拥有它，领地/reviewer 模型不适用。 |

## 元循环地板：B 是渐近线，不是布尔

OOC 已有「自修改代码热更」的*范式*（stone executable 是动态模块）。它对 stone 成立、对核心不成立，仅因 stone 方法是**被 import 的**、核心是 **importer**。

closing B 的路径：**把越来越多框架行为推进 Object 拥有的、热更的 stone 方法里**，直到框架只剩薄内核。但永远有个**无法变成 stone 的硬内核**（加载 stone、跑 thinkloop、连 LLM）——bootstrap 循环。所以「完全自我迭代」是渐近线，与任何自举编译器一样有元循环地板。这是反射系统的本性，不是缺陷。

## B 可归约为 A

把 AgentOfX 的 stone 设成**框架源码的一个切片**（如 AgentOfThinkable 的 stone = thinkable 源码），B 就归约为 A：「Object 迭代自己的 stone，只是这个 stone 恰好是框架源码」。**ownership = 领地**，feat-branch PR / reviewer 冒泡 / 治理直接复用。三缺口因此收敛为两个真问题：

- **(1) 边界**：stone 的领土能否是 world 外的框架源码切片？（world 布局问题）
- **(2) 重载**：核心能否自重载 / 模块化到可热更？（把内核推到尽可能薄）

治理（3）随归约自动复用 A 的领地 / reviewer 冒泡模型。

## 诚实的风险

「自我迭代潜力」目前是**断言多于证明**：B 被闭合一次（哪怕一个 trivial 改动）之前，「足以自我迭代」未经检验。连迭代 OOC 本身也仍是 Claude Code 当 Supervisor + sub-agent——dogfooding 一次都没真正发生过。

## 最小 dogfooding 探针（把哲学问题变成经验问题）

选一个 trivial 框架改动（如给 `GET /api/runtime/activity` 加字段 `probeMarker`，生效与否**可机器二值判定**——live curl 看字段在不在），让一个 OOC Object 端到端走 5 阶段并各自插桩：

| 阶段 | native（OOP 原语） | 逃生舱（shell） | 预判 |
|---|---|---|---|
| 1 reach 够源码 | open_file core 路径 | shell cat repo | native **✗**（落 world 内孤儿路径/404）/ shell ✓ |
| 2 modify 改 | write_file/edit | shell sed repo | native ✗ / shell ✓ |
| 3 verify 验证 | （无 OOP gate 入口） | shell `bun tsc/test` | shell ✓ |
| 4 reload 生效 | —— | curl live server | **✗（同进程未热更）/ ✓（重启后）**——killer |
| 5 governance | talk(super)→new_feat_branch→evolve_self→PR | —— | **✗**（core 无主，领地/reviewer 不覆盖） |

三个 ✗（阶段 1/4/5）精确对应三缺口；逃生舱能勉强走完 1-3，但 4（生效）和 5（治理）即使有逃生舱也断。**一次失败的 dogfooding 实证三缺口**，比十页哲学更能定位下一个该建的能力。探针为 design（未执行），要点：用唯一 token 检测残留、改 repo 工作树后 `git checkout --` 务必复原、最好在隔离 worktree 副本里跑。

早期设计稿：`docs/ooc-6/self-iteration-frontier.md` + `docs/ooc-6/dogfooding-probe-design.md`（仍在，正被本知识吸收；内容以本篇为准）。
