# 认知 — 对象如何"知"

> 纯粹的单轮思考机制：对象**每一次**思考时看到什么、如何思考、产出什么。
> 跨轮次的"反思"、"遗忘"属于**成长**，不在此处。

## 四个子领域

| 目录 | 内容 | 对应基因 |
|---|---|---|
| [context/](context/) | Context 的组成与构建 | G5 |
| [线程树/](线程树/) | 思考的结构化作用域 | G9, G13 |
| [thinkloop/](thinkloop/) | 单轮循环的引擎 | G4 |
| [指令系统/](指令系统/) | 思考的产出形式 | G4 |

## 核心主张

### Context 即对象的全部世界（G5）

**对象不知道 Context 之外的任何事情**。每一次 ThinkLoop，LLM 能用来思考的就是 Context 里的一切——不多也不少。

Context 有 9 个组成部分，每个部分都有明确来源。详见 [context/九大组成.md](context/九大组成.md)。

### 线程树是运行时结构（G13）

对象的运行时 = 一棵**线程树**。每个节点 = 一个线程 = 一层认知作用域。

- **根线程**：由用户消息或外部 talk 创建，是任务入口
- **子线程**：由 `create_sub_thread` 创建，独立执行
- **Scope Chain**：从当前节点沿树向上收集——决定哪些 trait 被激活、哪些知识可见

线程树替代了旧的"认知栈 + 行为树"，统一为单一数据结构。

### ThinkLoop 是单轮循环（G4）

```
Context → LLM（含 tools） → Tool Call → 执行 → 新 Context → ...
```

每一轮：感知（构建 Context）→ 思考（LLM 生成）→ 行动（Engine 处理 tool call）→ 循环。

详见 [thinkloop/engine.md](thinkloop/engine.md)。

### 指令系统：open / submit / close / wait

思考的产出是 tool call。基座 trait 定义了四个 tool。详见 [指令系统/](指令系统/)。

## 与其他维度的边界

**认知** 的纯粹性体现在它**不处理**：

| 不在认知/ | 在哪里 |
|---|---|
| 反思（reflect）| [../成长/反思机制/](../成长/反思机制/) |
| 遗忘（三层记忆）| [../成长/遗忘.md](../成长/遗忘.md)（从 Context 角度提到） |
| Inbox 接收（消息来源） | [../合作/消息/](../合作/消息/) |
| 执行动作（Effect） | [../合作/基础/effect.md](../合作/基础/effect.md) |
| 线程调度 | [../合作/基础/线程树调度.md](../合作/基础/线程树调度.md) |

本维度只回答"**当前这一轮**对象是如何思考的"。

> 注：关于"三层记忆"和 "inbox 构建"，出于叙述完整性，在 context/ 的文档中会**引用**（@ref）到相关目录，但具体机制描述在对应主归属处。

## 与代码的对应

```
kernel/src/thread/
  ├── context-builder.ts   → context/
  ├── tree.ts              → 线程树/
  ├── scheduler.ts         → 线程树/调度.md（部分）+ 合作/基础/线程树调度.md（主）
  ├── engine.ts            → thinkloop/engine.md
  ├── tools.ts             → 指令系统/
  ├── form.ts              → 指令系统/form-manager.md
  ├── hooks.ts             → 指令系统 + trait 激活
  └── parser.ts            → thinkloop/（TOML 兼容）
```

## 与基因的关联

- **G4**（输出程序以行动）— thinkloop/ + 指令系统/
- **G5**（Context 即世界）— context/
- **G9**（行为树/线程树）— 线程树/
- **G13**（线程树即运行模型）— 整个认知维度的统一框架
