# 用例 003: 并发消息处理

## 元信息
- 覆盖功能: 多个 POST /api/talk 并发执行
- 前置条件: OOC 服务器运行
- 优先级: P0

## 操作步骤
1. 同时向 3 个不同对象发送消息
```bash
curl -s -X POST http://localhost:8080/api/talk/sophia \
  -H "Content-Type: application/json" \
  -d '{"message": "并发测试 1"}' --max-time 120 &

curl -s -X POST http://localhost:8080/api/talk/nexus \
  -H "Content-Type: application/json" \
  -d '{"message": "并发测试 2"}' --max-time 120 &

curl -s -X POST http://localhost:8080/api/talk/supervisor \
  -H "Content-Type: application/json" \
  -d '{"message": "并发测试 3"}' --max-time 120 &

wait
```

2. 检查所有 flow 状态
```bash
curl -s http://localhost:8080/api/flows
```

3. 确认没有僵尸 flow（status 不应该永久卡在 running）

## 预期结果
- 3 个请求都返回 `success: true`
- 各自的 session 互不干扰
- 没有 flow 卡在 running 状态
- 如果 LLM 并发限制导致部分失败，flow 应标记为 failed（不是 running）

## 检查点
- [ ] 3 个请求都返回响应（不超时）
- [ ] 无 null reference 错误
- [ ] 无僵尸 flow（running 状态超过 5 分钟）
- [ ] 失败的 flow 状态为 failed（不是 running）
