import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function getConfig(ctx: { sharedDir: string }) {
  const configPath = join(ctx.sharedDir, "..", "..", "..", "config", "feishu.json");
  if (!existsSync(configPath)) {
    throw new Error("飞书配置不存在，请创建 .ooc/config/feishu.json");
  }
  return JSON.parse(readFileSync(configPath, "utf-8"));
}

async function getToken(config: { appId: string; appSecret: string }): Promise<string> {
  const resp = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret }),
  });
  const data = await resp.json() as { code: number; tenant_access_token: string };
  if (data.code !== 0) throw new Error(`飞书 token 获取失败: ${JSON.stringify(data)}`);
  return data.tenant_access_token;
}

/**
 * 向飞书群或用户发送文本消息
 * @param ctx - OOC 方法上下文
 * @param chatId - 飞书 chat_id（群聊 ID）
 * @param text - 消息文本
 */
export async function sendFeishuMessage(ctx: unknown, chatId: string, text: string): Promise<string> {
  const config = getConfig(ctx as { sharedDir: string });
  const token = await getToken(config);

  const resp = await fetch(
    `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: "text",
        content: JSON.stringify({ text }),
      }),
    },
  );

  const data = await resp.json() as { code: number; data?: { message_id: string } };
  if (data.code !== 0) return `[错误] 发送失败: ${JSON.stringify(data)}`;
  return `✓ 消息已发送 (message_id: ${data.data!.message_id})`;
}

/**
 * 回复飞书消息
 * @param ctx - OOC 方法上下文
 * @param messageId - 要回复的消息 ID
 * @param text - 回复文本
 */
export async function replyFeishuMessage(ctx: unknown, messageId: string, text: string): Promise<string> {
  const config = getConfig(ctx as { sharedDir: string });
  const token = await getToken(config);

  const resp = await fetch(
    `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/reply`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        msg_type: "text",
        content: JSON.stringify({ text }),
      }),
    },
  );

  const data = await resp.json() as { code: number; data?: { message_id: string } };
  if (data.code !== 0) return `[错误] 回复失败: ${JSON.stringify(data)}`;
  return `✓ 已回复 (message_id: ${data.data!.message_id})`;
}
