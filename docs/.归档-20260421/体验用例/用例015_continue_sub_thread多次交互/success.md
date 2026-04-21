# 用例 015 验证结果

> 日期：2026-04-09
> 验证者：Bruce（Alan Kay 代理）
> 结果：PASS

## 场景

验证 `continue_sub_thread` 多次交互机制：create → await → continue → await → return。

## 执行证据

**session**: `s_mnq8uqyl_xe5aei`

**线程树结构**：
- `th_mnq8uqyo_omsuyz`: sophia 主线程 (done)
- `th_mnq8uzil_mc6pdj`: 查阅 G1 基因定义 (done)

**关键 action 日志**（主线程）：
```
thought: 用户要求一个三步流程：1. 创建子线程查阅 G1 2. continue_sub_thread 追问 3. 汇总
create_thread: [create_sub_thread] 查阅 G1 基因定义 → th_mnq8uzil_mc6pdj
thought: 子线程已完成...用 continue_sub_thread 追问 G1 与 G2 的关联
message_out: [continue_sub_thread] → th_mnq8uzil_mc6pdj: 请进一步查阅 G2 基因...分析 G1 与 G2 的哲学关联
thread_return: [return] ## 汇总结果：G1 基因定义及 G1-G2 关联分析
```

**Scheduler 日志**：
```
[ThreadScheduler] 启动线程循环 th_mnq8uzil_mc6pdj (sophia)  ← 第一次启动
[ThreadScheduler] 唤醒线程 th_mnq8uqyo_omsuyz               ← 子线程完成，唤醒主线程
[ThreadScheduler] 启动线程循环 th_mnq8uqyo_omsuyz (sophia)  ← 主线程重启
[ThreadScheduler] 启动线程循环 th_mnq8uzil_mc6pdj (sophia)  ← continue_sub_thread 唤醒子线程
```

**最终 return 内容**：
- G1 基因完整定义（对象是唯一建模单元）
- G2 基因完整定义（Stone/Flow 双形态）
- G1-G2 关联分析

## 检查点

- [x] 子线程创建并完成第一次任务
- [x] LLM 正确使用 `[continue_sub_thread]` 指令
- [x] 子线程被唤醒重新启动（scheduler 日志显示两次启动）
- [x] 追问消息写入子线程 inbox
- [x] 子线程再次完成后主线程被唤醒
- [x] 主线程汇总两次结果并 return

## 修复记录

验证过程中发现 scheduler `_startThread` 不允许重启已有 tracker 的线程，
导致 `continue_sub_thread` 唤醒的子线程无法重新启动。
修复：改为检查 `_activeLoops` 而非 `_trackers`。
