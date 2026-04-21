# 用例 016 验证通过

## 测试时间
2026-04-20

## 测试结果
全部 6 个检查点通过。

## Session
- Session: s_mo7d2nb9_q28mgd
- Thread: th_mo7d2nbs_2w4zmq
- 执行轮次: 6 轮，24 个 actions

## 检查点

- [x] actions 中有 `[defer] 已注册 on:return 提醒`
- [x] actions 中有 `>>> [defer 提醒 — return]`
- [x] return summary 包含收获/总结（"defer 提醒引导我先做了任务关键收获总结"）
- [x] 线程正常完成（thread_return 存在）
- [x] hooks[] 已清空（once=true 的 hook 被移除）
- [x] LLM 在决策前看到 defer 提醒（sophia 在 submit return 之前就主动响应了提醒）

## 关键验证

第一次测试发现时序问题：defer 提醒在 return 之后才注入。
修复后，defer 提醒在 Context 构建时通过 `<defers>` 区域展示。
sophia 的 thinking 和 text 明确表明她在 submit return 之前就看到了提醒并据此行动。
