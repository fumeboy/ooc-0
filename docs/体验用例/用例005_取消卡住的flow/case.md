# 用例 005: 取消卡住的 Flow

## 元信息
- 覆盖功能: DELETE /api/flows/:taskId
- 前置条件: 存在一个已完成或运行中的 flow
- 优先级: P1

## 操作步骤
1. 先创建一个对话获取 taskId
```bash
RESULT=$(curl -s -X POST http://localhost:8080/api/talk/supervisor \
  -H "Content-Type: application/json" \
  -d '{"message": "你好"}' --max-time 120)
TASK_ID=$(echo $RESULT | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['taskId'])")
```

2. 用 DELETE 取消该 flow
```bash
curl -s -X DELETE http://localhost:8080/api/flows/$TASK_ID
```

3. 验证 flow 状态变为 failed
```bash
curl -s http://localhost:8080/api/flows/$TASK_ID
```

## 预期结果
- DELETE 返回 `success: true` 和 `cancelled` 数量
- 被取消的 flow 状态变为 `failed`
- flow 的 messages 中包含系统取消通知
- 所有 sub-flow 也被取消

## 检查点
- [ ] DELETE 返回 success: true
- [ ] cancelled 数量 >= 1
- [ ] flow 状态变为 failed
- [ ] sub-flow 也被取消
