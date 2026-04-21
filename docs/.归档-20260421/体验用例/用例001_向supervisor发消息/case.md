# 用例 001: 向 supervisor 发消息

## 元信息
- 覆盖功能: POST /api/talk/supervisor
- 前置条件: OOC 服务器运行在 localhost:8080
- 优先级: P0

## 操作步骤
1. 向 supervisor 发送简单消息
```bash
curl -s -X POST http://localhost:8080/api/talk/supervisor \
  -H "Content-Type: application/json" \
  -d '{"message": "你好，请用一句话介绍你自己"}' \
  --max-time 120
```

## 预期结果
- API 返回 `success: true`
- 返回有效的 `sessionId`（格式 `session_YYYYMMDDHHMMSS_xxxx`）
- `status` 为 `finished` 或 `waiting`
- `messages` 数组包含 supervisor 的回复
- `actions` 数组包含 thought 和/或 program 类型的 action

## 检查点
- [ ] API 返回 success: true
- [ ] sessionId 格式正确
- [ ] status 不是 running（说明 flow 正常结束）
- [ ] supervisor 回复内容与其角色一致（桥梁/委派/协调）
