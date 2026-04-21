# 用例 007: 边界错误处理

## 元信息
- 覆盖功能: API 错误处理
- 前置条件: OOC 服务器运行
- 优先级: P1

## 操作步骤
1. 向不存在的对象发消息
```bash
curl -s -X POST http://localhost:8080/api/talk/nonexistent \
  -H "Content-Type: application/json" \
  -d '{"message": "hello"}'
```

2. 发送空消息
```bash
curl -s -X POST http://localhost:8080/api/talk/supervisor \
  -H "Content-Type: application/json" \
  -d '{}'
```

3. 用不存在的 flowId 续写
```bash
curl -s -X POST http://localhost:8080/api/talk/sophia \
  -H "Content-Type: application/json" \
  -d '{"message": "test", "flowId": "task_nonexistent"}'
```

4. 取消不存在的 flow
```bash
curl -s -X DELETE http://localhost:8080/api/flows/task_nonexistent
```

## 预期结果
- 不存在的对象: 返回错误信息，不崩溃
- 空消息: 返回"缺少 message 字段"
- 不存在的 flowId: 返回错误信息
- 取消不存在的 flow: 返回 cancelled: 0

## 检查点
- [ ] 所有错误请求返回合理的错误信息
- [ ] 服务器不崩溃
- [ ] 不产生僵尸 flow
- [ ] HTTP 状态码合理（400/404/500）
