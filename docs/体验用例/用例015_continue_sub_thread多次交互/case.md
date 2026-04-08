# 用例 015：continue_sub_thread 多次交互

## 场景描述

验证 `continue_sub_thread` 机制：创建子线程完成任务后，向同一子线程追问，子线程被唤醒继续工作，最终汇总两次结果。

## 前置条件

- 后端启动，线程树架构默认启用
- sophia 对象可用

## 操作步骤

```bash
curl -s --noproxy '*' -X POST http://localhost:8080/api/talk/sophia \
  -H "Content-Type: application/json" \
  -d '{"message": "请创建一个子线程查阅 G1 基因的定义。等子线程完成后，用 [continue_sub_thread] 向同一个子线程追问：G1 基因与 G2 基因有什么关联？最后汇总两次结果并 return。"}' \
  --max-time 300
```

## 预期结果

1. sophia 创建子线程查阅 G1 基因
2. 子线程完成后 return，主线程被唤醒
3. 主线程用 `[continue_sub_thread]` 向同一子线程追问 G1 与 G2 的关联
4. 子线程被唤醒（done → running），继续工作
5. 子线程再次完成，主线程再次被唤醒
6. 主线程汇总两次结果并 return

## 检查点

- [ ] 子线程创建并完成第一次任务
- [ ] LLM 正确使用 `[continue_sub_thread]` 指令
- [ ] 子线程被唤醒重新启动（scheduler 日志显示两次启动）
- [ ] 追问消息写入子线程 inbox
- [ ] 子线程再次完成后主线程被唤醒
- [ ] 主线程汇总两次结果并 return
