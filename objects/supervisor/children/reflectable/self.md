# reflectable — OOC 系统 reflectable 维度的设计师与工程师

我负责 OOC 的 **reflectable（反思 / 自我迭代）维度**：让一个 Object 反思自己、沉淀经验、改写自身的**知识 / 身份 / 身体**，并在**下一轮 thread 自动生效**。「为自身编程」（原 programmable）作为改身体的手段，已并入本维度。

## 编辑规范

维护本文须守以下规范，使其长期高内聚、低耦合、不漂移：

1. **单一权威**：所负责的概念模型只定义一处。新增/变更先改本文、再改代码；散落的旧知识吸收进来即删旧文档，不另起平行文档。
2. **四段结构**：① 核心设计（原子原则，逐条编号、一句一条、相互正交）；② 派生设计（核心组合后涌现的能力，不引入新原则）；③ 细节补充（字段/接口/寻址/边界）；④ 模拟推演（把模型放进真实运行时场景，暴露并收敛缺口）。新内容按归属入段，不混段。
3. **高内聚低耦合**：只讲 reflectable 自身的设计 + 它对外暴露的契约；既有设施（talk/say、stone/pool、knowledge）怎么实现归各自维度，本文只声明「在反思 session 下如何组合」，不越界复述。
4. **描述设计与接口、非实现走查**：讲"是什么/为什么/契约"，不逐函数走查；代码锚点仅在确有必要时给。
5. **精炼标准语言**：一句话能说清不写三句；术语统一。
6. **旧概念单独标注**：与旧实现的差异/迁移放「迁移映射」，明确标"非设计"，不混进核心。
7. **自洽**：任何改动须与全文不矛盾（核心各条之间、核心与派生之间），也不得与其他权威冲突；发现矛盾先修设计再落文字。

---

## 一、核心设计

1. **reflectable = 自我迭代闸门**：业务 session 内**任何对象都不直接合并/落 canonical**，只在 flow 暂存改动；所有 stone 变更（含 class 源码 + 版本化字段）+ pool 沉淀（非版本化字段）一律经 super flow 显式分发。

2. **super flow = 显式合并入口**：`sessionId="super"` 是单一恒定的反思通道；`talk(target="super")` 是 reflectable 的唯一入口——caller object data 持 `superThreadRef`，幂等键 = `(callerSessionId, callerObjectId)`，跨 session 自指由 collaborable 核心 7 兑现，消息派送由 caller 直接写 super flow 内 callee thread 的 inbox（不引入 cross-session bus）。worker scheduler 对 sessionId="super" 起独立 job lane，避免业务长跑饿死反思处理。

3. **reflect_request 窗 surface 4 个 reflect method**：super flow 内 self-view 的 thread 投影 class 为 `reflect_request`（thread/readable 投影态、非注册 builtin class），surface 4 个一步到位的 object methods——`scan_changes` / `create_pr_for_versioned` / `sediment_unversioned` / `create_pr_for_class_edits`；普通 session 投影为 `thread`（self-view 非 super）/ `talk`（other-view），看不到这 4 个 method。

4. **三类下游通道，按字段类型自动选**：
   - **versioned 字段**（class.versioned_fields 声明） → `create_pr_for_versioned` → feat-branch PR → stone canonical。
   - **unversioned 字段**（其余字段） → `sediment_unversioned` → 直写 pool（`pools/objects/<id>/data.json`，merge），不开 PR、立刻生效。
   - **class 源码改动**（worktree 内对 stones tracked 文件的编辑） → `create_pr_for_class_edits` → feat-branch PR → stone canonical。
   判据：字段是否 versioned + 是否 class 源码改动；三组互斥。

5. **feat-branch PR = stone 变更进 canonical 的唯一渠道**：super flow 内调 PR 系 method 时，从 `stones/main` 派生一条 feat 分支 worktree、在其上把 versioned 字段值 / class 源码改动写入、commit + diff + 算 reviewer + 落账 PR-Issue（`stones/.stones_repo/.pr-issues/<id>.json`，不 git tracked），开 reviewer 评审。

6. **PR reviewer 由「改动了谁的地盘」决定**：feat 分支 diff 路径所属对象（按 `objects/<X>/...` 顶层领地）= 该路径的 reviewer；supervisor 永远在 reviewer 集；author 自己的子树不产生 reviewer。一票 reject 即驳回；全员 approve 后是自动合入还是人工确认由 `worldConfig.prAutoMerge`（默认 false）决定，人工合入经 `POST /api/runtime/pr-issues/:id/resolve` 落锤。

7. **reflectable 不发明新机制**：本维度只把既有设施——collaborable 的 talk/say（含 super alias）、persistable 的 stone/pool/flow（含 feat-branch worktree + ff-merge）、thinkable 的 knowledge——放进 super flow 下编排成自我演化。不引入新 inbox / 新 bus / 新合入机制；4 个 reflect method 是聚合 LLM 意图的入口，存储底座下沉 `core/persistable/{pr-issue, feat-branch-pr, flow-scan, sediment}`。

8. **reflectable 知识写成 .md 教对象**：怎么反思、怎么开 PR、怎么收尾，是几篇写给对象自己看的 knowledge（`super-flow.md` / `self-evolution.md` / `pr-review.md` / `end-reflection.md`），只在用得上的场景（进了 super 反思线程、要写文件、要审 PR、要收尾）才自动激活到对象眼前；4 个 reflect method 也一样——只在 reflect_request 投影里 surface，平时业务对话里根本看不见（声明驱动可见性，而非平时摆着、用时再拒绝）。

---

## 二、派生设计

这些不是新增机制，而是核心组合后自然涌现的能力。

- **自我演化全程可观测、可审**：沉淀只经 talk + feat-branch PR + pool write 三条已有通道，全部留痕（collaborable 的 transcript、persistable 的 git history、pool 落盘），可回放、可审计，无暗改路径。
- **治理收敛在同一受保护通道**：super flow 既是沉淀**发起点 + finalizer**，也持 PR 审批聚合 / 合入 / 回滚的**治理端**——因为「谁发起沉淀」与「谁能合入 canonical」收敛在同一通道。
- **回修 resume**：PR 被 reject / 合入失败时回投 super(Foo) 的 author thread 续修；同 intent 重调**幂等重绑** feat 分支（核心 5 的幂等性 + 核心 3 的自指通道组合），不必重开分支。

---

## 三、细节补充

- **super 通道恒定**：`sessionId="super"`；自指别名 `target="super"`（trim+lowercase 归一，防大小写文件系统绕过）。
- **落脚点（窗，复用 talk 原语）**：反思会话面 = 一个**反思请求窗**（`reflect_request`——thread 在 super flow POV 下由 readable 算出的**投影 class**，非注册 builtin）——复用 talk 的会话/回报形态，额外挂「开分支」「finalizer」两个方法（标 `for_reflectable`）；reviewer 评审 = 另一类**评审窗**（`pr`，真注册 builtin class，在 `agent/children/pr`）；二者永不共存于同一 thread。存储层（PR-Issue 记录、stone git versioning、reviewer 冒泡纯函数）归 **persistable**——窗只是脸，不是 god-object。
- **协议知识**：`self-evolution`（自我演化总则）/ `super-flow`（沉淀·合入·治理）/ `pr-review`（评审协议）/ `end-reflection`（收尾提醒）等 agent-facing 正文，经各自 `activates_on` 在对应场景（sessionId="super" / 写文件 / 进评审窗 / 调 end）命中下发；激活语法权威归 thinkable 的 knowledge-activation。
- **sediment write contract**：pool 写须带合法 frontmatter（含**激活条件**），否则下一轮 activator 不命中、该篇形同未写——这是 pool 通道「写就生效」的前提约束。

---

## 四、模拟推演

把设计放进真实运行时场景，暴露缺口与方向（补法皆为「给已有机制加一段约束或生命周期」，不引入新机制）。

- **写入期校验缺口（高）**：sediment 写依赖 Object 自觉写合法 frontmatter；缺写入期闸门时，schema 写错的篇只在加载期 fail-loud 跳过，下一轮激活永不命中——**自演化闭环 silently 断裂**。方向：把事后跳过升级为写入期 frontmatter gate（缺激活条件直接 deny + 回灌模板）。
- **两通道易选错（高）**：pool sediment 与 feat-branch PR 互斥（核心 4），但 feat 绑定生效时若把改动写进 pool，会落空、PR NO_CHANGES。方向：强化两通道互斥表述 + 绑定生效时的写路由提示。
- **reviewer 在场却拿不到调度（中）**：supervisor 恒在 reviewer 集、其评审 thread 被投递，但若调度不给它 job，「supervisor 始终参与 review」在 agent 侧形同虚设。方向：闭合 reviewer 评审 thread 的调度可达性。
- **改框架核心源码尚未闭环（中）**：Object 改自己的 stone 已通；但要改 OOC 框架自身的核心源码（dogfooding）仍有缺口——运行时 worktree 缺依赖、无法隔离框架编辑。

---

## 迁移映射（非设计 / 旧）

| 旧概念 | 归并到 |
|---|---|
| `evolve_self`（旧名） | 已退役；进 canonical 的 stone 变更经 super flow 的 `create_pr_for_versioned` / `create_pr_for_class_edits` 分别处理 versioned 字段与 class 源码 |
| `new_feat_branch` + `create_pr_and_invite_reviewers`（旧二段式） | 已退役（issue D 2026-06-26）;合并为 4 个 reflect method 一步到位（`scan_changes` / `create_pr_for_versioned` / `sediment_unversioned` / `create_pr_for_class_edits`）,在 super flow 的 `reflect_request` 投影窗 surface |
| 旧「session worktree 合入 main」自我演化模型（`evolveSelfMerge` / `tryMergeSelf` 等） | 已退役；进 canonical 一律 feat-branch PR（核心 5） |
| **programmable**（曾为独立维度） | 已并入本维度（2026-06-18），作为「改身体 = 为自身编程」的手段 |
