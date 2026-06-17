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

1. **reflectable = 自我迭代，不发明新机制**：它是把既有设施——collaborable 的 **talk/say 投递**、persistable 的 **stone/pool**、thinkable 的 **knowledge**——放进一个**受保护的反思 session** 下协同的结果。本维度只定义「在反思 session 下，这些设施如何组合成自我演化」，不重新实现它们。

2. **super session = 受保护的反思通道**：OOC 系统提供一个恒定名为 **super** 的特殊 flow session，专门承载 Object 的反思线程，处理 flow→stone / flow→pool 的经验沉淀与自我演化。它是沉淀**闸门 + 通道**，不是业务执行通道——不在其中跑业务任务。

3. **入口 = 和 super 对话（自指别名）**：Object Foo 触发自我迭代，靠 `talk(target="super")`——经 collaborable 投递翻译为「派进自己的 super 分身」。**和 super 对话 ≡ 向 super session 里的自己（仍是 Foo）发消息**；对话内容说明哪些知识 / 能力 / 身体要沉淀。

4. **两条沉淀通道，互斥、力度不同**：
   - **pool sediment（运行时事实）**：memory / relations 等运行时自动产生的事实知识，**直写 pool**——不分支、不 PR、写就生效，下一轮新 thread 即刻看见。
   - **stone 变更（身份 / 身体 / seed knowledge）**：任何进 canonical 的 stone 改动，一律走 **feat-branch PR**（核心 5）。
   判据是「这是运行时事实、还是 stone 变更」

5. **feat-branch PR = stone 变更进 canonical 的唯一沉淀单元**：super(Foo) 从 `stones/main` 派生一条 **feat 分支 worktree**，在其上直接编辑要沉淀的改动，再发起合入流程。两个动作：**开分支**（从 main 派生 feat 分支、绑定本反思 thread，使后续写落 feat worktree）+ **finalizer**（commit 署名 actor、算 reviewer 集、开 PR、投递评审窗）。

6. **谁来审这条 PR，由它改动了谁的地盘决定**：一条 feat 分支改到了哪些对象的领地，就请那些领地的主人来审；supervisor 永远在审核人之列。改自己名下（含自己的 children）的东西，不需要别人审、自己也不审自己。只要有一人 reject 就打回，所有审核人都 approve 才算通过；通过后是自动合入、还是等人点一下确认，由 world 配置（`prAutoMerge`）决定，默认要人确认。

7. **谁来真正落这次沉淀，看发起者站不站得住**：发起反思的对象如果自己已经是 canonical（在 main 里有正式身份），就自己来落，自我演化前后逐字节对得上。如果发起者是这次 session 里刚建、还没进 main 的新对象，它没资格直接动 canonical，就顺着 parent 往上找最近一个 canonical 的祖先，由这个祖先替它落（一路找不到就落到 supervisor）。这样 PR 的署名总是个站得住的对象，作者校验自然过。

8. **怎么反思、怎么开 PR、怎么收尾，是写成知识教给对象的，不写死在代码里**：这些步骤是几篇写给对象自己看的知识，只在用得上的场景（进了 super 反思线程、要写文件、要审 PR、要收尾）才自动出现在它眼前。那几个专门用来沉淀的方法也一样——只在 super 反思线程里露面，平时的业务对话里根本看不见（靠「只在反思场所显示」这条声明，而不是平时摆着、用时再拒绝）。

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
| `evolve_self`（旧名） | `create_pr_and_invite_reviewers`——「commit + 开 PR + 邀 reviewer」的 finalizer，**不再是** session 合入命令 |
| 旧「session worktree 合入 main」自我演化模型（`evolveSelfMerge` / `tryMergeSelf` 等） | 已退役；进 canonical 一律 feat-branch PR（核心 5） |
| **programmable**（曾为独立维度） | 已并入本维度（2026-06-18），作为「改身体 = 为自身编程」的手段 |
