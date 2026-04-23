# OOC 外部工具接入框架

<!--
@ref docs/哲学/genes/g03-trait-自我定义.md — extends — Trait 作为工具接入载体
@ref docs/哲学/genes/g08-effect-与-space.md — extends — Effect 机制扩展到外部世界
@ref .ooc/kernel/traits/web_search/index.ts — references — 参考实现
-->

## 架构概览

```
对象 [program] 代码
    │
    ├─ 内置 API（talk, getData, setData ...）     ← router.ts 注入
    ├─ Trait 方法（search, fetchPage ...）         ← MethodRegistry 注入
    │       │
    │       └─ index.ts 中的 export function      ← 工具实际实现
    │
    └─ 未来：更多 Trait 方法（sendEmail, runShell ...）
```

核心结论：**工具 = Trait**。不需要新的抽象层。

现有的 Trait 系统已经提供了完整的工具接入能力：
- `readme.md` → 告诉 LLM 这个工具怎么用（注入 context window）
- `index.ts` → 工具的实际代码实现（注入沙箱执行环境）
- `when` → 控制工具何时可用
- `hooks` → 工具使用前后的提示注入

web_search 就是第一个成功的工具 Trait。所有新工具都应该遵循同样的模式。

## 工具接入标准流程

### 第一步：创建 Trait 目录

```
.ooc/kernel/traits/{tool_name}/
├── readme.md      # 工具文档（frontmatter + 使用说明）
└── index.ts       # 工具实现（导出函数）
```

放在 `kernel/traits/` 下 = 所有对象可用。
放在 `.ooc/objects/{name}/traits/` 下 = 仅该对象可用。

### 第二步：编写 readme.md

```markdown
---
when: always          # 或 "never"（需要手动 activateTrait）或自然语言条件
deps: []              # 依赖的其他 trait
hooks:
  before: "使用工具前请确认..."    # 可选
---

# 工具名称

简要说明这个工具做什么。

## 可用 API

### methodName(param1, param2?)

说明、参数、返回值、示例代码。
```

### 第三步：编写 index.ts

```typescript
/**
 * 工具描述
 * @param ctx - 系统自动注入的上下文（第一个参数，对 LLM 不可见）
 * @param param1 - 参数说明
 */
export async function methodName(ctx: any, param1: string): Promise<string> {
  // 实现逻辑
  // 成功返回结果字符串
  // 失败返回 "[错误] ..." 格式字符串（不要抛异常）
}
```

关键约定：
1. 第一个参数永远是 `ctx`（MethodContext），LLM 调用时不需要传
2. 返回字符串（LLM 最容易处理）
3. 错误不抛异常，返回 `[错误] ...` 前缀的字符串
4. 网络请求设置 timeout（推荐 10-15 秒）
5. 大量返回内容要截断（防止 context 爆炸）

### 第四步：注册到系统

无需额外注册。`loadAllTraits()` 会自动扫描 `kernel/traits/` 和对象的 `traits/` 目录，`MethodRegistry.registerAll()` 会自动注册所有方法到沙箱。

**放进目录就生效，零配置。**

## 具体示例：email Trait

### 目录结构

```
.ooc/kernel/traits/email/
├── readme.md
└── index.ts
```

### readme.md

```markdown
---
when: 当需要发送或读取邮件时
hooks:
  before: "发送邮件前请确认收件人和内容，邮件发出后无法撤回。"
---

# 邮件能力

你可以通过以下 API 发送和读取邮件。

## 可用 API

### sendEmail(to, subject, body)

发送一封邮件。

- `to` — 收件人邮箱地址
- `subject` — 邮件主题
- `body` — 邮件正文（纯文本）

返回发送状态字符串。

### readInbox(limit?)

读取收件箱最新邮件。

- `limit` — 最多返回几封（默认 5）

返回邮件摘要列表文本。

## 注意事项

1. 发送邮件是不可逆操作，请在 [thought] 中确认内容无误后再发送
2. 不要发送包含敏感信息（密码、密钥）的邮件
```

### index.ts

```typescript
/**
 * email —— 邮件收发 kernel trait
 *
 * 通过 SMTP/IMAP 提供邮件能力。
 * 凭证从环境变量读取：OOC_EMAIL_USER, OOC_EMAIL_PASS, OOC_EMAIL_SMTP, OOC_EMAIL_IMAP
 */

/**
 * 发送邮件
 * @param to - 收件人邮箱
 * @param subject - 邮件主题
 * @param body - 邮件正文
 */
export async function sendEmail(
  ctx: any,
  to: string,
  subject: string,
  body: string,
): Promise<string> {
  // 1. 权限检查
  const allowed = checkPermission(ctx, "email:send");
  if (!allowed) return "[错误] 当前对象没有发送邮件的权限";

  // 2. 参数校验
  if (!to || !to.includes("@")) return "[错误] 无效的邮箱地址";
  if (!subject) return "[错误] 邮件主题不能为空";

  // 3. 从环境变量读取凭证
  const user = process.env.OOC_EMAIL_USER;
  const pass = process.env.OOC_EMAIL_PASS;
  if (!user || !pass) return "[错误] 邮件服务未配置（缺少环境变量）";

  // 4. 发送（实际实现用 nodemailer 等库）
  try {
    // await transporter.sendMail({ from: user, to, subject, text: body });
    return `邮件已发送给 ${to}，主题: ${subject}`;
  } catch (err: any) {
    return `[错误] 发送失败: ${err?.message ?? String(err)}`;
  }
}

/**
 * 读取收件箱
 * @param limit - 最多返回几封（默认 5）
 */
export async function readInbox(ctx: any, limit: number = 5): Promise<string> {
  const allowed = checkPermission(ctx, "email:read");
  if (!allowed) return "[错误] 当前对象没有读取邮件的权限";

  // ... IMAP 实现 ...
  return "收件箱（0 封新邮件）";
}

/** 权限检查（读取对象的 permissions 数据） */
function checkPermission(ctx: any, permission: string): boolean {
  const perms = ctx.data?.permissions as string[] | undefined;
  if (!perms) return false;
  return perms.includes(permission) || perms.includes("*");
}
```

## 安全模型

### 三层防线

```
第一层：Trait 激活控制（when 字段）
  │  when: "never" → 对象必须手动 activateTrait 才能用
  │  when: "当需要..." → LLM 判断是否激活（readme 注入 context）
  │  when: "always" → 始终可用
  │
第二层：运行时权限检查（index.ts 内部）
  │  工具函数内部检查 ctx.data.permissions
  │  敏感操作（发邮件、删文件、执行命令）必须有对应权限
  │  权限存储在对象的 stone.data.permissions 数组中
  │
第三层：环境变量隔离
     凭证不硬编码，从 process.env 读取
     未配置的工具自动降级为"服务未配置"错误
```

### 权限约定

| 权限标识 | 含义 |
|---------|------|
| `email:send` | 发送邮件 |
| `email:read` | 读取邮件 |
| `shell:exec` | 执行终端命令 |
| `fs:write` | 写入文件系统 |
| `fs:read` | 读取文件系统 |
| `http:fetch` | 发起 HTTP 请求 |
| `*` | 所有权限（仅限受信任对象） |

权限通过 `persistData("permissions", ["email:send", "email:read"])` 设置，或由 Supervisor 在创建对象时写入。

### 敏感工具的额外约束

对于高风险操作（shell:exec、fs:write），建议：
1. readme.md 的 `hooks.before` 注入确认提示
2. index.ts 内部做参数白名单/黑名单过滤
3. 操作结果写入审计日志（`ctx.print("[audit] ...")`)

## 与现有系统的关系

| 现有机制 | 工具框架如何复用 |
|---------|---------------|
| Trait loader (`src/trait/loader.ts`) | 零改动。自动扫描加载工具 Trait |
| MethodRegistry (`src/trait/registry.ts`) | 零改动。自动注册工具方法到沙箱 |
| CodeExecutor (`src/executable/executor.ts`) | 零改动。工具方法在沙箱中直接调用 |
| EffectTracker (`src/executable/effects.ts`) | 可选。工具方法的副作用由 Trait 自己 print |
| buildExecutionContext (`src/flow/thinkloop.ts`) | 零改动。Trait 方法自动注入 |
| CollaborationAPI (`src/world/router.ts`) | 无关。工具是能力扩展，不是协作通道 |

**总改动量：0 行后端代码。** 只需要创建新的 Trait 目录。

## 执行模型

工具调用在 `[program]` 段落中执行，和现有 API 完全一致：

```
[thought]
用户让我发一封邮件给 alice@example.com。

[program]
const result = await sendEmail("alice@example.com", "会议通知", "明天下午3点开会");
print(result);
talk("邮件已发送: " + result, "user");

[wait]
```

不需要新的段落格式。`[program]` 已经是通用的执行环境。

## 推荐的下一步工具

按实用性排序：

| 工具 | Trait 名 | 复杂度 | 依赖 |
|------|---------|--------|------|
| 终端命令 | `shell` | 低 | 无（child_process） |
| 文件读写 | `filesystem` | 低 | 无（node:fs） |
| HTTP 请求 | `http_client` | 低 | 无（fetch） |
| 邮件收发 | `email` | 中 | nodemailer / imapflow |
| 浏览器控制 | `browser` | 高 | playwright |
| 日历管理 | `calendar` | 中 | Google Calendar API |

每个工具都是一个独立的 Trait 目录，互不依赖，可以按需逐个实现。
