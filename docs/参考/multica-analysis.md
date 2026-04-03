# Multica 分析：Agent-as-Teammate 模式

> 分析日期：2026-04-03
> 项目地址：https://github.com/multica-ai/multica
> 版本：0.2.0 | 协议：Apache 2.0

## 项目定位

Multica 是一个 AI-native 任务管理平台，定位类似 Linear，但把 AI Agent 作为一等公民。
核心口号："Your next 10 hires won't be human."
面向 2-10 人的 AI-native 团队。

## 技术栈

- 后端：Go 1.26（Chi + sqlc + PostgreSQL 17 + pgvector）
- 前端：Next.js 16（Zustand + shadcn/ui + TipTap + Tailwind）
- 实时通信：gorilla/websocket
- Agent 执行：调用本地 Claude Code / Codex / OpenCode CLI
- 部署：Docker + GoReleaser + Homebrew tap

## 核心设计：多态 Actor 模型

Multica 的根基是一个简单但有力的抽象——Agent 和 Member 共享同一套 Actor 接口。

数据库层面，issue 和 comment 的 actor 都是多态的：

```sql
-- issue 表
assignee_type TEXT CHECK (assignee_type IN ('member', 'agent')),
assignee_id   UUID,
creator_type  TEXT CHECK (creator_type IN ('member', 'agent')),
creator_id    UUID,

-- comment 表
author_type TEXT,  -- 'member' or 'agent'
author_id   UUID,
```

在数据模型层面，Agent 和人类没有区别——都能创建 issue、写评论、被分配任务。
前端用一个 `ActorAvatar` 组件统一渲染，看板卡片、列表行、评论区全部复用。

## Agent 的独有属性

Agent 比 Member 多出的字段，定义了"它是一个能自主工作的实体"：

| 字段 | 作用 |
|------|------|
| `instructions` | 系统提示词（Agent 的"人格"） |
| `runtime_id` | 绑定到哪个 Daemon 执行 |
| `triggers` | 什么事件触发工作（on_assign / on_comment / on_mention） |
| `max_concurrent_tasks` | 并发上限 |
| `status` | idle / working / blocked / error / offline |
| `visibility` | workspace（公开）或 private（仅 owner/admin 可用） |
| `skills` | 可复用的技能模板 |

## 触发机制

Agent 不是轮询任务，而是通过三种触发器被唤醒：

### on_assign — 被分配 issue 时

人类在看板上把 issue 拖给 Agent → 自动入队任务。
没有状态门控，因为这是人类的显式意图。

### on_comment — 有人在 issue 下评论时

人类写了一条评论 → 检查 assignee 是否是 Agent → 入队任务。

智能抑制：
- issue 状态是 done/cancelled 时不触发
- 已有 pending 任务时不重复入队（合并快速连续评论）

### on_mention — 被 @提及时

评论中 @agent-name → 解析 mention → 为被提及的 Agent 入队任务。

防重复逻辑：
- Agent 不会自己触发自己
- 如果 Agent 已经是 assignee 且已有 pending 任务，跳过
- 私有 Agent 只有 owner/admin 能 @

三个触发器都是可配置的，每个 Agent 可以独立开关。

## 任务生命周期

```
                    on_assign / on_comment / on_mention
                                │
                                ▼
┌──────────┐    claim     ┌────────────┐    start    ┌─────────┐
│  queued  │ ──────────→  │ dispatched │ ─────────→  │ running │
└──────────┘              └────────────┘             └────┬────┘
                                                         │
                                              ┌──────────┴──────────┐
                                              ▼                     ▼
                                        ┌───────────┐        ┌────────┐
                                        │ completed │        │ failed │
                                        └─────┬─────┘        └───┬────┘
                                              │                   │
                                              ▼                   ▼
                                     发布 Agent 评论        发布错误评论
                                     状态回到 idle          状态回到 idle
```

关键细节：

- **Claim 阶段**：Daemon 轮询 `/daemon/runtimes/{runtimeId}/claim`，服务端检查 `max_concurrent_tasks` 限制后分配
- **Claim 响应**包含完整上下文：Agent 的 name、instructions、skills，以及上一次的 session ID（用于恢复对话）
- **完成时**：Agent 的输出自动作为评论发布到 issue 下，`author_type: "agent"`
- **失败时**：错误信息作为 system 类型评论发布，敏感信息会被 redact

## 会话恢复

Claim 响应中包含上次的 session ID 和工作目录：

```go
if prior, err := h.Queries.GetLastTaskSession(...); err == nil {
    resp.PriorSessionID = prior.SessionID.String
    resp.PriorWorkDir   = prior.WorkDir.String
}
```

这让 Agent 能在同一个 issue 上进行多轮对话——人类评论 → Agent 回复 → 人类追问 → Agent 基于之前的上下文继续工作。

## 前端体验

### 看板/列表

Agent 和人类在 assignee picker 中并列显示，私有 Agent 带锁图标。
Board card 和 list row 用同一个 `ActorAvatar` 组件渲染，视觉上完全对等。

### 实时执行卡片

Agent 工作时，issue 页面通过 `agent-live-card.tsx` 实时展示：
- 工具调用（文件读写、命令执行）
- 思考过程
- 输出文本
- 耗时和工具调用计数
- 取消按钮

通过 WebSocket 事件驱动：`task:message`、`task:completed`、`task:failed`、`task:dispatch`。

### 权限模型

- 私有 Agent：只有 owner/admin 可以分配和 @mention
- 公开 Agent：任何 workspace 成员可以分配
- 在 assignee picker 和 mention 解析时统一校验

## 架构总结

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
│   Next.js    │────→│  Go Backend  │────→│   PostgreSQL     │
│   Frontend   │←────│  (Chi + WS)  │←────│   (pgvector)     │
└──────────────┘     └──────┬───────┘     └──────────────────┘
                            │
                     ┌──────┴───────┐
                     │ Agent Daemon │  （本地运行，自动检测 CLI）
                     │ Claude/Codex │
                     └──────────────┘
```

核心模块：
- `internal/handler/` — HTTP 处理器（issue, comment, agent, daemon）
- `internal/service/task.go` — 任务生命周期编排
- `internal/realtime/hub.go` — WebSocket 广播
- `internal/daemon/` — 本地 Agent 运行时
- `pkg/agent/` — 统一 Agent 后端接口（Claude, Codex, OpenCode）

## 对 OOC 的启发

### Multica 做得好的

1. **多态 Actor 模型**：`actor_type + actor_id` 的设计极其简洁，让 Agent 在组织层面和人类完全对等
2. **事件驱动触发**：on_assign / on_comment / on_mention 三种触发器覆盖了主要交互场景
3. **智能去重**：合并快速连续评论、防止自触发、pending 任务去重
4. **会话恢复**：通过 session ID 实现多轮对话，Agent 不会每次从零开始
5. **实时可见性**：WebSocket 驱动的执行卡片让人类能看到 Agent 在做什么

### Multica 的局限（OOC 的机会）

1. **Agent 内部是黑盒**：直接调用 CLI，没有认知架构。OOC 的 ThinkLoop + 认知栈提供了内部结构
2. **instructions 是静态的**：系统提示词不会随经验改变。OOC 的对象身份是动态的——会随经验改写 readme.md
3. **没有经验沉淀**：Skill 是人工创建的模板，不是 Agent 自己从经历中提炼的。OOC 的 G12 沉淀循环解决这个问题
4. **没有对象间自主协作**：Agent 之间不能直接对话，必须通过人类在 issue 上 @mention。OOC 的 talk/delegate 机制支持对象间自主通信
5. **没有自我反思**：Agent 完成任务就结束了，不会回顾自己的表现。OOC 的 ReflectFlow 提供了这个能力

### 本质差异

- Multica 解决的是"如何让团队用上 AI Agent"（外部视角 / 调度层）
- OOC 解决的是"如何让 AI Agent 本身变聪明"（内部视角 / 认知层）

Multica 的 `instructions` 字段是静态的系统提示词，OOC 的对象身份是动态的——会随经验改写。
这是两个系统最本质的差异。

### 可借鉴的具体设计

| Multica 设计 | OOC 可借鉴方向 |
|-------------|---------------|
| 多态 Actor（actor_type + actor_id） | OOC 的 Stone 已经是统一模型，但缺少"人类 Actor"的概念 |
| 触发器系统（on_assign/comment/mention） | OOC 的消息投递是即时的，但缺少"事件触发"的声明式配置 |
| 任务队列 + 并发控制 | OOC 的 Scheduler 是轮转调度，可以参考 max_concurrent_tasks 的思路 |
| 会话恢复（session ID） | OOC 的 Flow 天然支持多轮，但跨 session 的上下文恢复可以更好 |
| 实时执行可视化 | OOC 的 SSE 已有 flow:action 事件，可以做类似的实时卡片 |
