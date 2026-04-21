# GitAgent 分析 — 对 OOC 的参考价值

> 来源：https://github.com/open-gitagent/gitagent (spec v0.1.0)
> 分析时间：2026-03-26

## 项目定位

GitAgent 是一个 framework-agnostic 的 AI Agent 定义标准——用 git repo 描述一个 agent 是什么，而不管它怎么跑。核心理念："clone a repo, get an agent"。

## 核心结构

最小要求两个文件：
- `agent.yaml` — manifest（name, version, model, compliance）
- `SOUL.md` — 身份与人格

可选层：
- `RULES.md` — 硬约束
- `DUTIES.md` — 职责分离策略
- `skills/` — 可复用能力模块（采用 Agent Skills 开放标准）
- `tools/` — MCP 兼容的工具定义
- `workflows/` — 多步骤确定性流程（DAG + 模板变量）
- `knowledge/` — 参考文档（带 index.yaml 索引：标签、优先级、always_load）
- `memory/` — 跨会话持久状态（MEMORY.md 200 行上限 + archive/）
- `hooks/` — 生命周期钩子（JSON stdin/stdout 协议）
- `agents/` — 子 agent 定义（递归）
- `compliance/` — 合规制品（FINRA/SEC/Federal Reserve）
- `config/` — 环境配置覆盖

## 与 OOC 的关键对比

### 相似点

| GitAgent | OOC | 说明 |
|----------|-----|------|
| `SOUL.md` | `readme.md` | 身份定义 |
| `skills/` | `traits/` | 能力模块 |
| `memory/MEMORY.md` | `memory.md` | 持久记忆 |
| `agents/` | `stones/` | 子 agent 组合 |
| `agent.yaml` | `data.json` | 元数据 manifest |
| `.gitagent/` (gitignore) | `flows/` (gitignore) | 运行时状态 |
| Progressive Disclosure 3 层 | Trait description + readme 分层 | 按需加载 |

### 本质差异

| 维度 | GitAgent | OOC |
|------|----------|-----|
| 定位 | 静态定义标准 | 活的运行时系统 |
| 通信 | 声明式 delegation | 实时 talk()/delegate()/reply() |
| 执行 | 无运行时（交给框架） | ThinkLoop + 行为树 + 沙箱 |
| 状态 | 无 Flow 概念 | Stone/Flow 二象性 |
| 哲学 | 合规驱动（FINRA/SEC） | 基因驱动（13 条基因） |
| 互操作 | 多框架导出（Claude/OpenAI/CrewAI） | 封闭生态 |

## 值得借鉴的设计

### 1. agent.yaml manifest schema（优先级：高）

gitagent 的 manifest 有严格的 JSON Schema 验证。OOC 的 `data.json` 比较松散，可以参考定义明确的 schema：
- 必填字段（name, version, description）
- 可选字段（model, runtime, tags, metadata）
- 验证规则（引用的 traits 必须存在、hooks 脚本必须存在等）

### 2. knowledge/index.yaml 文档索引（优先级：高）

gitagent 给文档打标签、设优先级、标记 `always_load`。OOC 的 docs/ 目前没有结构化索引。可以在 `docs/` 下加一个 `index.yaml`：
```yaml
documents:
  - path: 哲学文档/gene.md
    tags: [philosophy, core]
    priority: high
    always_load: true
  - path: 哲学文档/emergence.md
    tags: [philosophy, emergence]
    priority: medium
```

### 3. hooks 生命周期标准化（优先级：中）

gitagent 定义了 `on_session_start`、`pre_tool_use`、`post_response`、`on_error` 等系统级事件，用 JSON stdin/stdout 协议。OOC 的 trait 有 `before/after` hooks，但只在 ThinkLoop 内部。可以扩展为系统级事件。

### 4. workflow 声明式定义（优先级：中）

gitagent 的 `workflows/*.yaml` 用 DAG 描述多步流程（步骤依赖 + 模板变量 `${{ steps.X.outputs.Y }}`）。OOC 的行为树更灵活但也更隐式。可以支持声明式 workflow 作为行为树的简化入口。

### 5. export/import 互操作（优先级：低）

gitagent 能导出为 system-prompt、claude-code、openai、crewai 格式。OOC 未来如果要让对象在其他框架中运行，可以参考这个思路。也可以反过来——支持 import gitagent 格式的 agent 为 OOC stone。

## 不需要借鉴的

- **合规框架**（FINRA/SEC/Federal Reserve）— OOC 不面向金融监管场景
- **RULES.md / DUTIES.md 分离** — OOC 的 readme.md 已经把身份、规则、职责统一在一个文件里，更符合"对象即文件"的哲学（G1）
- **静态 delegation 声明** — OOC 已经有更强大的运行时消息路由和 Scheduler

## 结论

GitAgent 本质上是一个"agent 的 package.json"——声明式、可移植、可版本化。OOC 走得更远，是一个活的对象生态。两者不冲突：OOC 可以兼容 gitagent 格式作为对象的静态导出/导入格式，实现互操作。

最有价值的借鉴是 **manifest schema 验证** 和 **knowledge 文档索引**，这两个能直接提升 OOC 的工程质量。
