# Questions — OOC 系统的疑问与设计决策

<!--
@ref .ooc/docs/哲学文档/gene.md — references — 设计决策围绕 G1-G13 展开
-->

本文档是索引。每个问题的详细讨论见 `questions/` 子目录。

---

## 设计决策（已解决）

| 编号 | 问题 | 状态 | 文件 |
|------|------|------|------|
| Q01 | 为什么需要 reply() 机制？ | ✅ 已解决 | [question_reply.md](questions/question_reply.md) |
| Q02 | 为什么让对象自己编写 UI？ | ✅ 已解决 | [question_ui_ownership.md](questions/question_ui_ownership.md) |
| Q03 | UI 文件为什么不在对象内存中？ | ✅ 已解决 | [question_ui_files.md](questions/question_ui_files.md) |
| Q04 | 前端为什么放在 .ooc/web/？ | ✅ 已解决 | [question_frontend_location.md](questions/question_frontend_location.md) |
| Q05 | Context 格式为什么从 XML 改为文本？ | ✅ 已解决 | [question_context_format.md](questions/question_context_format.md) |
| Q06 | 为什么给 Stone 提供 writeCode() 等方法？ | ✅ 已解决 | [question_stone_api.md](questions/question_stone_api.md) |
| Q07 | 为什么 program 块之间不共享变量？ | ✅ 已解决 | [question_program_isolation.md](questions/question_program_isolation.md) |
| Q08 | 为什么 output 格式用 `>>> output:` 而非 XML？ | ✅ 已解决 | [question_output_format.md](questions/question_output_format.md) |

## 经验教训

| 编号 | 问题 | 状态 | 文件 |
|------|------|------|------|
| Q09 | LLM 连续失败时为何不改变策略？ | 📝 经验记录 | [question_llm_retry.md](questions/question_llm_retry.md) |
| Q10 | Bias > Role 的发现 | 📝 经验记录 | [question_bias_vs_role.md](questions/question_bias_vs_role.md) |
| Q11 | Output 提示 > Bias prompt 的发现 | 📝 经验记录 | [question_output_vs_bias.md](questions/question_output_vs_bias.md) |

## 新模型已解决的旧问题

以下问题在旧模型中是未决的，新建模（2026-03-08）已给出明确答案：

| 旧问题 | 新模型的解决方案 |
|--------|----------------|
| Space 的本质矛盾 | 取消独立 Space 概念，改为 effects/{task}/shared/ 任务级共享 |
| World 违反"万物皆对象"吗？ | World = .ooc/ 根目录，是生态本身，但仍遵循 G1 |
| Thread 模型不完整 | Thread 被行为树（Process）替代，focus 光标 + 栈进栈出 |
| Flow 生命周期管理缺失 | 任务完成 = effects 目录归档 = 所有资源自动回收 |
| biases/codes/windows 割裂 | 统一为 traits/，三种角色（bias/method/window）仍存在 |
| actions 累积污染 context | 行为树的结构化遗忘：focus 控制信息进出，非事后压缩 |
| 经验沉淀路径（window→code→bias） | trait 在原地成长：readme → readme+index.ts → always-on |
| Relation 地位不清 | 简化为 _relatable 列表，纯认知记录 |
| Trait 自动激活 | G13 认知栈：before 元认知帧自动检查并激活所需 traits，不再依赖 LLM 手动调用 |
| 行为树与 Trait 系统割裂 | G13 认知栈：每个栈帧同时包含过程和思维，两者是同一帧的两面 |

## 仍然开放的问题

| 编号 | 问题 | 文件 |
|------|------|------|
| Q12 | 并发模型：多个 Flow 如何调度？ | [question_concurrency.md](questions/question_concurrency.md) |
| Q13 | 错误传播：sub-flow 失败如何影响 main flow？ | [question_error_propagation.md](questions/question_error_propagation.md) |
| Q14 | 集体智慧的涌现条件 | [question_collective_intelligence.md](questions/question_collective_intelligence.md) |
| Q15 | LLM 依赖过重的风险 | [question_llm_dependency.md](questions/question_llm_dependency.md) |
