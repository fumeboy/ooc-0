# DeerFlow 技术分析报告

> 来源: https://github.com/bytedance/deer-flow
> 分析日期: 2026-03-11
> 目的: 作为 OOC 系统的参考，学习其多智能体编排、上下文管理、工具系统的设计

## 一、项目概述

DeerFlow 是字节跳动开源的**通用 Agent 运行时**，基于 LangGraph + LangChain 构建。
v2.0 是一次完全重写，从"深度研究框架"演变为"电池齐全的 Agent 工具箱"。

核心定位：不是让你拼装的框架，而是开箱即用的 Agent 运行环境——内置文件系统、记忆、技能、沙箱执行和多智能体编排。

## 二、系统架构

### 三服务设计

```
┌─────────────────── Nginx (2026) ───────────────────┐
│                 统一反向代理入口                      │
└────────────────────────────────────────────────────┘
          │              │              │
   ┌──────▼─────┐  ┌────▼────┐  ┌─────▼────┐
   │ LangGraph  │  │ Gateway │  │ Frontend │
   │ Server     │  │ API     │  │ (React)  │
   │ (2024)     │  │ (8001)  │  │ (3000)   │
   └────────────┘  └─────────┘  └──────────┘
```

- LangGraph Server: 核心 Agent 运行时，线程管理，SSE 流式输出
- Gateway API (FastAPI): 模型配置、MCP、技能、文件上传、产物管理
- Frontend (Next.js): 实时聊天界面

### 中间件管道（核心架构模式）

DeerFlow 的扩展性建立在**可组合的中间件管道**上，每个中间件职责单一：

```
ThreadDataMiddleware      → 工作目录/上传/输出路径管理
UploadsMiddleware         → 文件上传处理
SandboxMiddleware         → 沙箱环境初始化
DanglingToolCallMiddleware → 悬挂工具调用清理
SummarizationMiddleware   → 上下文自动压缩（可选）
TodoMiddleware            → 任务跟踪（plan mode）
TitleMiddleware           → 对话标题自动生成
MemoryMiddleware          → 长期记忆注入
ViewImageMiddleware       → 视觉模型图片处理
SubagentLimitMiddleware   → 子智能体并发限制
ClarificationMiddleware   → 澄清中断（始终最后）
```

**关键设计**: 中间件顺序严格，有依赖关系。状态不可变，中间件返回新状态字典。

## 三、多智能体编排

### 子智能体系统

- Lead Agent（主编排器）分解任务
- Sub-Agent（专业工作者）在隔离上下文中运行
- 执行模型：后台线程池 + 实时轮询

### 并发控制（最有意思的设计）

```python
MIN_SUBAGENT_LIMIT = 2
MAX_SUBAGENT_LIMIT = 4
DEFAULT = 3  # 每次响应最多并发任务调用数
```

**双重保障策略**：
1. Prompt 层面：明确告诉 LLM 批次执行规则和示例
2. 中间件层面：`SubagentLimitMiddleware` 在模型生成后**截断**超额的 task 工具调用

这是 DeerFlow 最务实的设计——**不信任 LLM 会自觉遵守限制，用代码强制执行**。

### 子智能体上下文隔离

- 每个子智能体获得**隔离的 ThreadState**
- 只继承最小中间件集（ThreadData + Sandbox）
- 复用父级的沙箱和线程数据
- 禁止递归调用 task 工具（防止无限嵌套）

### 执行流程

```
Lead Agent 调用 task() → 创建 SubagentExecutor
  → 后台线程池异步执行（调度池3 + 执行池3）
  → 每5秒轮询完成状态
  → SSE 流式传输中间消息
  → 返回最终结果给 Lead Agent
```

## 四、状态管理

### ThreadState

```python
class ThreadState(AgentState):
    messages: list[BaseMessage]           # 核心消息
    sandbox: SandboxState | None          # 沙箱环境
    thread_data: ThreadDataState | None   # 工作目录路径
    title: str | None                     # 对话标题
    artifacts: list[str]                  # 生成的文件（去重）
    todos: list | None                    # 任务跟踪
    uploaded_files: list[dict] | None     # 上传文件元数据
    viewed_images: dict[str, ViewedImageData]  # 视觉数据
```

### 沙箱虚拟路径映射

| 虚拟路径 | 物理路径 |
|---------|---------|
| `/mnt/user-data/workspace` | `.deer-flow/threads/{id}/user-data/workspace` |
| `/mnt/user-data/uploads` | `.deer-flow/threads/{id}/user-data/uploads` |
| `/mnt/user-data/outputs` | `.deer-flow/threads/{id}/user-data/outputs` |
| `/mnt/skills` | `deer-flow/skills/` |

支持三种沙箱模式：本地执行、Docker 隔离、Kubernetes。

## 五、记忆系统

### 双层记忆

1. **会话记忆**：过滤为用户输入 + 最终 AI 响应，排除工具消息和中间步骤
2. **长期记忆**：
   - 持久化事实 + 置信度分数
   - TF-IDF 相似度检索
   - 动态注入：`final_score = similarity × 0.6 + confidence × 0.4`

### 自动上下文压缩

- 实时监控 token 数量
- 触发条件可配置（token 数、消息数、最大 token 比例）
- 保留近期消息完整，压缩旧消息
- 维护 AI/Tool 消息对的上下文连续性

## 六、工具系统

### 三类工具来源

| 内置工具 | 配置工具 | MCP 工具 |
|---------|---------|---------|
| present_file | web_search | github |
| ask_clarification | bash | filesystem |
| view_image | read/write_file | postgres |
| task (子智能体) | str_replace, ls | brave-search |

### MCP 集成

- 支持 stdio、SSE、HTTP 三种传输
- OAuth token 流（client_credentials, refresh_token）
- 文件 mtime 缓存失效：`extensions_config.json` 变更自动重载
- 懒加载：需要时才初始化

### 技能系统（Markdown-Based）

```yaml
---
name: PDF Processing
description: Handle PDF documents
allowed-tools: [read_file, write_file, bash]
---
# 技能指令内容，注入到 system prompt...
```

**渐进式加载**：技能按需加载，不一次性全部注入，保持上下文窗口精简。

## 七、Prompt 工程

### 动态系统提示模板

```
<role> Agent 身份 </role>
{soul}              → Agent 人格（来自 agents_config）
{memory_context}    → 注入的长期记忆
<thinking_style>    → 推理指南
<clarification>     → 何时请求澄清
{skills_section}    → 已加载技能（渐进式）
{subagent_section}  → 编排指令（如启用）
<working_directory> → 文件系统路径
```

### 澄清工作流

```python
ask_clarification(
    question="具体问题",
    clarification_type="missing_info",  # ambiguous_requirement, approach_choice...
    context="为什么需要这个信息",
    options=["选项1", "选项2"]
)
```

`ClarificationMiddleware` 拦截工具调用，中断执行流，向用户提问。

## 八、对 OOC 的启发

### 值得借鉴的设计

| DeerFlow 设计 | OOC 对应/启发 |
|--------------|-------------|
| 中间件管道 | OOC 的 ThinkLoop 可以考虑类似的可组合管道，每个阶段职责单一 |
| 并发限制双重保障 | OOC 的 LLM 行为引导也应该"提示+代码"双重保障，不能只靠 prompt |
| 渐进式技能加载 | OOC 的 bias/经验注入可以按需加载，避免上下文膨胀 |
| 上下文自动压缩 | OOC 已有三区压缩（P0），思路一致，可参考其触发条件配置化 |
| 虚拟路径映射 | OOC 的对象文件系统可以借鉴，提供一致的虚拟视图 |
| 澄清中断机制 | OOC 的 replyTarget 机制（P2）可以参考其中间件拦截模式 |

### DeerFlow 的局限（OOC 的优势方向）

1. **无对象模型**: DeerFlow 的智能体是无状态的函数调用链，没有"活的对象"概念。OOC 的对象有身份、数据、行为、关系——这是根本性的差异。
2. **无经验沉淀**: DeerFlow 的记忆是事实存储，不是经验学习。OOC 的 G12 经验沉淀（知识→能力→直觉）是更高层次的智能。
3. **无涌现设计**: DeerFlow 是工程系统，不追求涌现行为。OOC 的哲学基因（gene.md）驱动涌现能力，这是本质区别。
4. **扁平编排**: Lead → Sub-Agent 是两层结构。OOC 的对象生态允许任意深度的协作关系。
5. **轮询而非事件驱动**: 子智能体完成状态靠 5 秒轮询，不够优雅。

### 核心洞察

> DeerFlow 代表了"工程优化路线"的天花板——在 LangGraph 框架内，把中间件、并发控制、上下文管理做到了很高的工程水平。
>
> 但它仍然是"人类编排 Agent"的范式：人类定义中间件顺序、并发限制、技能配置。Agent 本身没有自主进化的能力。
>
> OOC 走的是"对象自主进化"路线：对象有自己的经验、偏好、关系，能通过交互涌现出新的能力。这是两条根本不同的道路。
>
> DeerFlow 的工程实践（中间件管道、双重保障、渐进加载）值得学习，但 OOC 的哲学方向（活的对象生态）是 DeerFlow 无法触及的。
