# 用例 008: 持久化验证

## 元信息
- 覆盖功能: Flow 数据持久化到 .ooc/flows/
- 前置条件: 已执行过至少一次 talk
- 优先级: P0

## 操作步骤
1. 向对象发消息并获取 sessionId
```bash
RESULT=$(curl -s -X POST http://localhost:8080/api/talk/sophia \
  -H "Content-Type: application/json" \
  -d '{"message": "持久化测试"}' --max-time 120)
TASK_ID=$(echo $RESULT | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['sessionId'])")
```

2. 检查 session 目录结构
```bash
ls -la .ooc/flows/$TASK_ID/
ls -la .ooc/flows/$TASK_ID/flows/
```

3. 检查 user flow 的 data.json
```bash
cat .ooc/flows/$TASK_ID/flows/user/data.json | python3 -m json.tool
```

4. 检查 sophia sub-flow 的 data.json
```bash
cat .ooc/flows/$TASK_ID/flows/sophia/data.json | python3 -m json.tool
```

## 预期结果
- session 目录下有 flows/ 子目录
- flows/ 下有 user/ 和 sophia/ 子目录
- 每个 sub-flow 的 data.json 包含完整的 messages、actions、status
- process.json 包含行为树状态
- updatedAt 时间戳合理

## 检查点
- [ ] session 目录存在
- [ ] user 和 sophia sub-flow 目录存在
- [ ] data.json 包含 messages 数组
- [ ] data.json 包含 actions 数组
- [ ] status 为 finished 或 waiting
- [ ] process.json 存在且有效
