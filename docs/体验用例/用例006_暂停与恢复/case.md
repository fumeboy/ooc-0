# 用例 006: 暂停与恢复

## 元信息
- 覆盖功能: POST /api/stones/:name/pause, POST /api/stones/:name/resume
- 前置条件: 存在一个 pausing 状态的 flow
- 优先级: P1

## 操作步骤
1. 暂停一个对象
```bash
curl -s -X POST http://localhost:8080/api/stones/sophia/pause
```

2. 向该对象发消息（应在 LLM 返回后暂停）
```bash
RESULT=$(curl -s -X POST http://localhost:8080/api/talk/sophia \
  -H "Content-Type: application/json" \
  -d '{"message": "测试暂停功能"}' --max-time 120)
TASK_ID=$(echo $RESULT | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['sessionId'])")
```

3. 检查 flow 状态应为 pausing
```bash
curl -s http://localhost:8080/api/flows/$TASK_ID
```

4. 恢复执行
```bash
curl -s -X POST http://localhost:8080/api/stones/sophia/resume \
  -H "Content-Type: application/json" \
  -d "{\"flowId\": \"$TASK_ID\"}"
```

## 预期结果
- pause 返回 success: true
- flow 在 LLM 返回后进入 pausing 状态
- 暂存文件（llm.input.txt, llm.output.txt）被写出
- resume 后 flow 继续执行并完成

## 检查点
- [ ] pause API 返回 success
- [ ] flow 状态变为 pausing
- [ ] 暂存文件存在
- [ ] resume 后 flow 正常完成
