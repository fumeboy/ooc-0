# 用例 004: 续写对话（flowId）

## 元信息
- 覆盖功能: POST /api/talk/:objectName 的 flowId 参数
- 前置条件: 已有一个 finished/waiting 状态的 flow
- 优先级: P0

## 操作步骤
1. 先创建一个对话
```bash
RESULT=$(curl -s -X POST http://localhost:8080/api/talk/sophia \
  -H "Content-Type: application/json" \
  -d '{"message": "G1 基因是什么？"}' --max-time 120)
TASK_ID=$(echo $RESULT | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['taskId'])")
echo "taskId: $TASK_ID"
```

2. 用 flowId 续写对话
```bash
curl -s -X POST http://localhost:8080/api/talk/sophia \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"那 G2 呢？和 G1 有什么关系？\", \"flowId\": \"$TASK_ID\"}" \
  --max-time 120
```

3. 检查 flow 的消息历史是否包含两轮对话

## 预期结果
- 续写请求返回相同的 taskId
- sophia 保持上下文，回复中引用之前的 G1 内容
- flow 的 messages 数组包含两轮完整对话
- 持久化文件中消息历史完整

## 检查点
- [ ] 续写返回相同 taskId
- [ ] sophia 回复有上下文连贯性
- [ ] messages 包含两轮对话
- [ ] 持久化文件正确
