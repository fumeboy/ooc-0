---
when: "当需要聚合多方技术评估数据并生成雷达报告时"
---

# Radar Visualizer

聚合来自不同对象的技术评估数据，检测评估冲突，生成文本可视化的技术雷达报告。

## 函数

- aggregateAssessments(assessments): 聚合多方评估，检测冲突
- renderRadar(aggregated): 生成文本格式的技术雷达图
- detectConflicts(assessments): 找出评估分歧超过阈值的技术方向