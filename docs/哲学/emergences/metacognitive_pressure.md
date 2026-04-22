# E13: 元认知压力调节（Metacognitive Pressure Regulation）

**涉及基因**: G5（Context 即世界） + G12（经验沉淀） + G4（输出程序以行动）

<!--
@referenced-by kernel/traits/compact/ — implemented-by — compact trait 的 llm_methods 实现
@referenced-by kernel/src/thread/compact.ts — implemented-by — token 估算与压缩核心算法
@referenced-by docs/工程管理/迭代/all/20260422_feature_context_compact.md — references — 本能力的迭代设计
-->

## 能力描述

长时间运行的线程会累积大量 actions（文件读取、工具调用、探索性 program、重复的 inbox 通知等）。当上下文占用接近有效注意力窗口上限时，**对象能够感知这种"压力"，并主动清理工作台**：

1. **感知**：engine 在 context 末尾注入"建议 compact"提示（超 60k tokens 时）
2. **审视**：对象 `open(command="compact")` 进入审查模式，调 `list_actions()` 看清历史全貌
3. **判断**：对象自己决定哪些 action 是"已经用不上的过期探索"，哪些"结论已沉淀到 memory 不必保留原始细节"
4. **清理**：`truncate_action`（长工具返回只留前 N 行）+ `drop_action`（丢弃时必须给 20 字以上理由）+ `close_trait`（关掉不再需要的临时 trait）
5. **沉淀**：`submit compact {summary}` 一次性应用所有标记，把本阶段关键结论凝结为一条 `compact_summary` action 注入历史首条

**这是元认知能力——对象对自身认知负荷的感知与调节**。不是外部机制强制压缩，而是对象自己判断、自己写摘要、自己决定留什么丢什么。

## 为什么这是涌现

单独看各条基因无法设计出"元认知压力调节"：
- **G5** 只规定 Context 是对象的"此刻能看到的信息"——但没说对象怎么管理这个窗口
- **G12** 只规定经验沉淀通过 talk(super) 走长期记忆——但 compact 是**工作记忆**层的调节，不涉及长期存储
- **G4** 只规定对象通过输出程序来行动——但 compact 需要对象先感知"需要压缩"再发起动作

三条基因组合，加上 engine 的 token 阈值探测，**让对象自然地拥有了"感知压力 → 主动清理"的元认知回路**。这正是 E13 的独特之处：它不是"被设计的功能"，而是"基因组合 + 工程提示"中长出来的行为模式。

## 与 G5 结构化遗忘的关系

G5 说：**新模型通过行为树 + focus 光标控制信息进出，比事后压缩更优雅**。

compact **不是对 G5 的否定，而是补充**。G5 的结构化遗忘依赖"任务能被分解为子线程"——当任务自然形成树状结构，focus 切换就能实现遗忘。但某些场景下任务在**单个线程内持续演进**（持续的探索式调试、长程交互对话），这时 focus 不切换，actions 只加不减——compact 就是这类场景的兜底机制。

定位：
- **G5 行为树 focus** 是主力——日常任务组织得好就不需要 compact
- **compact 是兜底 + 元认知训练** ——让对象学会"当单线程堆积时主动清理"是一种能力

## 与 G12 长期记忆的关系

G12 的 SuperFlow：对象把**值得长期记住**的经验 `talk(super)` 沉淀到 `memory.md`，跨 session 可用。

compact 的 summary：只是**当前线程内的工作记忆整理**，不跨 session、不进 memory.md。如果对象在 compact 时发现"这个结论值得长期记住"，应该另起 `talk(super)` 沉淀到长期记忆——compact summary 只管"本阶段在做什么、走到哪了"。

两者互补：
- `reflective/super` 面向**长期**（跨会话）
- `kernel:compact` 面向**短期**（当前线程工作台）

## 观察证据（待实验）

**目标场景**：让 bruce 处理一个连续 100+ 步的调试任务，观察：
1. 第 ~50 步（~60k tokens）时 engine 是否注入提示
2. LLM 是否自主 `open(command="compact")` 响应（而非忽略提示）
3. 压缩后的 summary 是否保留了关键决策（而非只是流水账）
4. 压缩后继续工作时，LLM 对"此前做过什么"的认知是否连贯

## 反例（基因缺失时）

| 缺失基因 | 后果 |
|---|---|
| G5（无结构化 Context） | 对象看不到 actions 全貌，无从判断哪些可压 |
| G12（无 LLM 判断） | compact 退化为固定规则截断（如"只留最后 30 条"），丢失细粒度价值判断 |
| G4（无 tool 调用） | 对象无法主动发起 compact——只能被动等 engine 强制压缩 |

## 验证状态

**未验证**。当前迭代（2026-04-22）完成工程实现 + 单元测试（25 个 pass）；
待做：
- Bruce E2E 验证阈值触发 + LLM 主动响应
- 长会话样本检查 summary 质量
- 和 G12 长期记忆的联动实验（compact 时识别出值得沉淀的内容，主动 talk(super)）

## 参考

- @ref kernel/traits/compact/TRAIT.md — compact trait 的使用说明
- @ref kernel/src/thread/compact.ts — token 估算与压缩核心算法
- @ref docs/哲学/genes/g05-context-即世界.md — 结构化遗忘
- @ref docs/哲学/genes/g12-经验沉淀.md — LLM 做判断，代码做记账
- @ref docs/工程管理/迭代/all/20260422_feature_context_compact.md — 本迭代设计
