# 用例 013：derive_from_which_thread 按需回忆

## 场景描述

验证 `derive_from_which_thread` 参数：先创建子线程完成任务，再创建派生子线程基于前者的结果继续工作。

对应 spec 14.4 场景 4（按需回忆）。

## 前置条件

- 后端启动，线程树架构默认启用
- sophia 对象可用

## 操作步骤

```bash
curl -s --noproxy '*' -X POST http://localhost:8080/api/talk/sophia \
  -H "Content-Type: application/json" \
  -d '{"message": "请先创建一个子线程查阅 G1 基因的定义，等它完成后，再创建一个派生子线程（使用 derive_from_which_thread 参数指向第一个子线程的 ID），让派生子线程基于 G1 的定义分析它与 OOP 的区别。最后汇总两个子线程的结果。"}' \
  --max-time 300
```

## 预期结果

1. sophia 创建第一个子线程查阅 G1 基因
2. 第一个子线程完成后，sophia 看到其 ID 和 summary
3. sophia 创建派生子线程，`derive_from_which_thread` 指向第一个子线程 ID
4. 派生子线程继承第一个子线程的执行历史
5. 主线程汇总两个子线程的结果并 return

## 检查点

- [ ] 第一个子线程创建并完成
- [ ] LLM 正确使用 `derive_from_which_thread` 参数
- [ ] 派生子线程创建成功
- [ ] 主线程汇总结果并 return
