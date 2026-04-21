# learn-claude-code 学习笔记

> 来源：shareAI-lab/learn-claude-code
> 11 个渐进式 Session，从单循环到自治多 Agent 团队。

---

## 一、核心模式：Agent Loop

```
User → messages[] → LLM → response
                              |
                    stop_reason == "tool_use"?
                   /                          \
                 yes                           no
                  |                             |
            execute tools                    return text
            append results
            loop back ──────────────────> messages[]
```

所有 AI Agent 的本质就是这个循环。后续所有机制都是在这个循环上叠加，循环本身不变。

---

## 二、11 个 Session 的核心机制

### Phase 1: 基础循环

| Session | 机制 | 核心洞察 |
|---------|------|----------|
| s01 | Agent Loop | `while stop_reason == "tool_use"` 就是全部 |
| s02 | Tool Dispatch | 添加工具 = 添加 handler，不改循环。用 dict 路由 |

### Phase 2: 规划与知识

| Session | 机制 | 核心洞察 |
|---------|------|----------|
| s03 | TodoWrite | 外化工作记忆为结构化状态，防止上下文漂移。3 轮未更新则注入提醒 |
| s04 | Subagent | 进程隔离 = 上下文隔离。子 Agent 用全新 messages[]，只返回摘要 |
| s05 | Skill Loading | 两层注入：system prompt 放简介（低成本），tool_result 按需加载全文 |
| s06 | Context Compact | 三层压缩：micro（每轮替换旧 tool_result）→ auto（超阈值 LLM 摘要）→ manual |

### Phase 3: 持久化

| Session | 机制 | 核心洞察 |
|---------|------|----------|
| s07 | Task System | 文件系统是真正的持久层。JSON 文件 + 依赖图，不怕上下文压缩 |
| s08 | Background Tasks | daemon 线程 + 通知队列，fire-and-forget 模式 |

### Phase 4: 团队协作

| Session | 机制 | 核心洞察 |
|---------|------|----------|
| s09 | Agent Teams | JSONL 信箱实现异步通信，append 发送 / drain 读取 |
| s10 | Team Protocols | request_id 关联请求-响应，同一 FSM 模式驱动关机和审批 |
| s11 | Autonomous Agents | 空闲轮询 + 自动认领任务，无需协调者。压缩后重新注入身份信息 |

---

## 三、关键设计模式

### 1. 分层注入（Layered Injection）
- 技能加载：system prompt 放索引，tool_result 放全文
- 上下文压缩：三层递进，对模型透明
- 身份保持：压缩后自动重新注入身份块

### 2. 文件系统作为状态源（File as Source of Truth）
- 任务板：`.tasks/` 目录下的 JSON 文件
- 团队配置：`team.json`
- 信箱：JSONL 文件，append-only
- 好处：不怕上下文窗口压缩，天然持久化

### 3. 进程/线程隔离
- 子 Agent：独立进程，全新 messages[]
- 团队成员：独立线程，各自维护上下文
- 核心思想：隔离上下文 = 隔离关注点

### 4. 轮询 + 超时的自组织
- 完成任务后进入 IDLE 阶段
- 每 5s 轮询信箱和任务板
- 60s 无任务自动关闭
- 无单点故障，去中心化

### 5. 请求-响应关联
- `request_id` 将请求和响应配对
- 适用于异步消息系统中的有序交互
- 同一模式复用于不同协议（关机、审批）

---

## 四、与 OOC 项目的对比分析

### 相似之处

| 维度 | learn-claude-code | OOC |
|------|-------------------|-----|
| 核心循环 | while + stop_reason | Flow.think() + World.run_flow() thinkloop |
| 工具分发 | dict dispatch | CodeExecutor 执行 Python 程序 |
| 子任务 | Subagent（进程隔离） | 子 Flow（parent-child 关系） |
| 状态持久化 | JSON 文件 | save_object / load_object + importlib |
| 思考规划 | TodoWrite | Context.process + plan 字段 |

### OOC 的独特优势

1. **对象即 Agent**：OOC 的 Stone/Flow 不只是消息循环，而是拥有字段、方法、Bias、关系的完整对象。learn-claude-code 的 Agent 本质是函数。
2. **元编程能力**：OOC 对象可以修改自己的源代码（`_sourcecode`），实现自我演化。这是 learn-claude-code 完全没有的维度。
3. **Bias 系统**：OOC 用 Bias 描述思维方式（main/extend, pre/thinking/post），比 system prompt 更结构化、更可组合。
4. **输出程序而非调用工具**：OOC 的 Flow 输出 Python 程序来行动，而非选择预定义工具。表达能力更强。

### OOC 可以借鉴的地方

#### A. 上下文压缩（Context Compact）— 高优先级

OOC 当前没有上下文管理机制。随着多轮对话和 thinkloop 迭代，Context 会无限增长。

借鉴方案：
- **micro 压缩**：每轮 think 后，压缩旧的 process events（只保留最近 N 条完整内容，旧的替换为摘要）
- **auto 压缩**：当 Context 总 token 超过阈值时，用 LLM 生成摘要替换历史
- **实现位置**：`Context` 类增加 `compact()` 方法，`Flow.think()` 每轮调用

#### B. 团队协作与异步通信 — 中优先级

OOC 有 Chat 实现双向对话，但缺少：
- **异步信箱**：当前 Chat 是同步的。可借鉴 JSONL 信箱模式，让 Flow 之间异步通信
- **任务板**：多个 Flow 可以从共享任务板认领任务，实现自组织
- **实现位置**：World 增加 TaskBoard，Flow 增加 Inbox

#### C. 技能按需加载 — 中优先级

OOC 的 Bias 全部在创建时注入。可借鉴两层加载：
- 创建时只注入 Bias 的简介（name + 简短 description）
- 思考时按需加载完整 Bias 内容
- 减少每次 LLM 调用的 token 消耗

#### D. 身份重注入 — 低优先级（但重要）

如果实现了上下文压缩，需要确保压缩后对象的核心身份不丢失。
learn-claude-code 的做法：检测到压缩后 messages 很短时，自动插入身份块。
OOC 天然有优势：Bias 和 Context.role 是结构化的，压缩时可以保护这些字段。

#### E. TodoWrite / Nag 机制 — 低优先级

Flow 在多轮 thinkloop 中可能偏离目标。可借鉴：
- 要求 Flow 在 think 输出中显式更新进度
- 如果连续 N 轮没有更新，注入提醒到 Context

---

## 五、总结

learn-claude-code 的核心哲学：
> **模型就是 Agent，我们的工作是给它工具，然后让开。**

OOC 的核心哲学：
> **对象就是 Agent，对象拥有思维方式，对象可以改写自己。**

两者的交集在于"循环 + 工具 + 持久化"这个基础架构。OOC 在对象模型和元编程上远超 learn-claude-code，但在上下文管理、团队协作、按需加载这些工程实践上可以获得启发。

最值得优先借鉴的是**上下文压缩**（Context Compact），这是 OOC 支持长时间运行和多轮深度对话的关键缺失能力。
