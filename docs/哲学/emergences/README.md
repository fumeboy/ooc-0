# 12 条涌现能力

> 单个基因是简单的规则。但当它们组合时，会涌现出远超各部分之和的能力。
> 这些能力**不是被设计出来的**，而是从基因中"长出来"的。

## 涌现总览

| 编号 | 能力 | 依赖基因 | 验证状态 | 详细 |
|---|---|---|---|---|
| E1 | 自我进化 | G3, G7, G12 | 基础验证（Exp 012） | [self_evolution.md](self_evolution.md) |
| E2 | 多视角思考 | G1, G5, G6 | 未验证 | [multi_perspective.md](multi_perspective.md) |
| E3 | 对象生态协作 | G1, G6, G8 | 部分验证（Exp 009） | [collaboration.md](collaboration.md) |
| E4 | 记忆与反思 | G5, G10, G12 | 基础验证（Exp 012） | [memory_reflection.md](memory_reflection.md) |
| E5 | 计划与执行分离 | G4, G9 | 已验证（Exp 008） | [plan_execution.md](plan_execution.md) |
| E6 | 人机协作 | G8, G11 | 部分验证 | [human_ai.md](human_ai.md) |
| E7 | 知识的对象化 | G1, G3 | 未验证 | [knowledge_object.md](knowledge_object.md) |
| E8 | 渐进式能力获取 | G3, G12 | 已验证（Exp 005） | [progressive_capability.md](progressive_capability.md) |
| E9 | 分布式注意力 | G5, G13 | 未验证 | [distributed_attention.md](distributed_attention.md) |
| E10 | 对象的死亡与遗产 | G7, G12 | 未验证 | [death_legacy.md](death_legacy.md) |
| E11 | Effect 循环 | G8, G10 | 未验证 | [effect_cycle.md](effect_cycle.md) |
| E12 | UI 涌现 | G1, G11 | 部分验证 | [ui_emergence.md](ui_emergence.md) |
| E13 | 元认知压力调节 | G5, G12, G4 | 未验证（2026-04-22 实装） | [metacognitive_pressure.md](metacognitive_pressure.md) |

> 另有（Progressive Disclosure：树形 Trait + 三层加载）待从当前实现中提炼。

## 验证状态定义

| 状态 | 含义 |
|---|---|
| **已验证** | 有实验或用例证明该能力真实出现，且与哲学描述一致 |
| **基础验证** | 能力存在，但尚未全面测试 |
| **部分验证** | 某些场景下出现，未达到稳定涌现 |
| **未验证** | 理论上应当涌现，尚无实验 |

## 如何阅读

每个涌现文档采用统一结构：

1. **能力描述** — 这是什么样的涌现
2. **依赖基因** — 哪些基因共同产生了它
3. **观察证据** — 在哪些场景下观察到
4. **反例** — 如果某条基因被移除，能力是否消失
5. **验证实验** — 哪些 exp-* 实验涉及它

## 与基因的关系

涌现能力只定义"现象"和"依赖"，不规定"实现"。当一条涌现被验证后：

- 如果与基因吻合 → 写入 `对象/` 相关领域文档
- 如果与基因冲突 → 触发基因修订流程（走 [../discussions/](../discussions/)）
- 如果未出现 → 审查基因组合是否足够支持该涌现
