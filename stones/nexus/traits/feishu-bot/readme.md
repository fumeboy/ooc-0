---
namespace: self
name: feishu-bot
when: "always"
---

# 飞书 Bot

连接飞书 IM，实现与外部用户的消息收发。

## 能力

- 向飞书群/用户发送文本消息：`sendFeishuMessage(chatId, text)`
- 回复飞书消息：`replyFeishuMessage(messageId, text)`

## 配置

飞书凭证存储在 `.ooc/config/feishu.json`：

```json
{
  "appId": "cli_xxxxxxxxxx",
  "appSecret": "xxxxxxxxxxxxxxxxxxxxxxxx"
}
```

## 接收消息

飞书消息通过 webhook 自动转为 OOC talk 消息投递给 nexus 对象。
Webhook 地址：`POST /api/webhook/feishu`
