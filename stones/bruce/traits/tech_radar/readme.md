---
when: "当需要进行技术评估或生成技术雷达报告时"
---

# Tech Radar 技术雷达工具

为 OOC 系统提供技术评估框架，灵感来自 ThoughtWorks Technology Radar。

## 评估维度

每项技术从 4 个维度评分（1-5）：
- **maturity**（成熟度）：技术本身的稳定性和生态完善度
- **alignment**（契合度）：与 OOC 哲学和基因体系的契合程度
- **impact**（影响力）：对系统能力的提升幅度
- **effort**（实施成本）：集成所需的工程投入（5=低成本，1=高成本）

## 雷达环分类

根据综合分数分为四环：
- **Adopt**（≥4.0）：立即采用
- **Trial**（≥3.0）：值得试验
- **Assess**（≥2.0）：持续关注
- **Hold**（<2.0）：暂缓

## 导出函数

- `assessTech(name, category, scores, rationale)` — 评估一项技术
- `classifyRing(score)` — 分数 → 雷达环
- `generateRadar(assessments)` — 生成完整雷达报告（Markdown）