# E9: 分布式注意力

**涉及基因**: G9(行为树) + G8(Effect) + G5(Context)

当多个 Stone 的 Flow 同时工作时，系统的「注意力」是分布式的：
- blueprint 的 main flow 聚焦于整体任务规划
- browser 的 sub-flow 聚焦于信息搜索
- writer 的 sub-flow 聚焦于内容生成

每个 Flow 的 Context 只包含自己行为树 focus 节点范围内的信息。
它们通过 messages 和 shared/ 协作，但不共享内部状态。

这模拟了人类团队的工作方式：
每个人专注于自己的领域，通过会议和接口协作。

## 新模型的变化

- 行为树的 focus 光标让每个 Flow 的注意力更加精确
- Sub-flow 机制让协作关系物理化（可以看到谁在和谁交互）
- 每个 Flow 独立的 process.json 让注意力状态可持久化

## 验证状态

未验证。依赖并发调度（P4）。
