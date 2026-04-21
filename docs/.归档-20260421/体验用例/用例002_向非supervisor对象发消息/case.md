# 用例 002: 向非 supervisor 对象发消息

## 元信息
- 覆盖功能: POST /api/talk/:objectName（非 supervisor）
- 前置条件: OOC 服务器运行，sophia/nexus 等对象已注册
- 优先级: P0

## 操作步骤
1. 向 sophia 发送消息
```bash
curl -s -X POST http://localhost:8080/api/talk/sophia \
  -H "Content-Type: application/json" \
  -d '{"message": "你好，请用一句话告诉我 G1 基因是什么"}' \
  --max-time 120
```

2. 向 nexus 发送消息
```bash
curl -s -X POST http://localhost:8080/api/talk/nexus \
  -H "Content-Type: application/json" \
  -d '{"message": "你好，一句话介绍你自己"}' \
  --max-time 120
```

3. 检查 supervisor 是否收到通知（非 supervisor 对象的消息会触发 notifySupervisor）
```bash
curl -s http://localhost:8080/api/flows | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), indent=2))"
```

## 预期结果
- sophia 和 nexus 都返回 `success: true`
- 各自的回复内容与角色一致
- supervisor 收到异步通知（不阻塞主请求）
- 不会出现 null 错误或孤儿 session

## 检查点
- [ ] sophia 返回 success: true
- [ ] nexus 返回 success: true
- [ ] 两个 flow 的 status 都不是 running
- [ ] 无 null reference 错误
- [ ] supervisor 的 notifySupervisor 不影响主请求
