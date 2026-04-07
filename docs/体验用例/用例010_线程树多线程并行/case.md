# 用例 010：线程树多线程并行执行

## 场景描述

验证线程树架构的核心能力：单 Object 创建多个子线程并行执行任务，等待全部完成后汇总结果。

对应 spec 14.4 场景 1。

## 前置条件

- 后端启动，线程树架构默认启用
- sophia 对象可用

## 操作步骤

1. 向 sophia 发送需要拆分的任务：
```bash
curl -s --noproxy '*' -X POST http://localhost:8080/api/talk/sophia \
  -H "Content-Type: application/json" \
  -d '{"message": "请分别查阅 G1、G2、G3 三条基因的定义，每条基因用一个子线程处理，最后汇总三条基因的核心要点。"}' \
  --max-time 300
```

## 预期结果

1. sophia 创建 3 个子线程（G1、G2、G3 各一个）
2. 子线程并行执行，各自读取 gene.md 提取对应基因定义
3. 子线程全部完成后，主线程被唤醒
4. 主线程汇总三条基因的核心要点并 return
5. API 返回 status=finished，messages 包含汇总结果

## 检查点

- [ ] threads.json 中有 4 个节点（1 root + 3 children）
- [ ] 3 个子线程 status=done
- [ ] 主线程 status=done
- [ ] 主线程 awaitingChildren 中的 ID 与 childrenIds 匹配（ID 映射正确）
- [ ] data.json 中 messages 包含 inbound + outbound
- [ ] outbound 消息包含 G1、G2、G3 的汇总
