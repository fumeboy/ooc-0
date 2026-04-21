# 用例 011：跨 Object talk 对话

## 场景描述

验证两个 Object 之间的 talk 对话能力。supervisor 委派任务给 sophia，sophia 独立执行后将结果路由回 supervisor。

对应 spec 14.4 场景 2。

## 前置条件

- 后端启动，线程树架构默认启用
- supervisor 和 sophia 对象可用

## 操作步骤

```bash
curl -s --noproxy '*' -X POST http://localhost:8080/api/talk/supervisor \
  -H "Content-Type: application/json" \
  -d '{"message": "请让 sophia 帮我查一下 G1 基因的定义，然后把结果告诉我。"}' \
  --max-time 300
```

## 预期结果

1. supervisor 收到用户请求
2. supervisor 用 [talk] 向 sophia 发消息
3. World 路由：启动 sophia 的线程树
4. sophia 独立执行（读取 gene.md）
5. sophia 完成后结果路由回 supervisor 的 inbox
6. supervisor 汇总结果并 return
7. API 返回 status=finished，messages 包含 G1 基因定义

## 检查点

- [ ] 服务器日志出现 `[World] 跨 Object talk: supervisor → sophia`
- [ ] sophia 独立 session 创建并执行完成
- [ ] supervisor 的 messages 包含 inbound + outbound
- [ ] outbound 消息包含 G1 基因的准确定义
