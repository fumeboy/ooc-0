# Agent Role Prompt 编写方法论

> OOC 项目中所有 Agent 角色的 Prompt 编写规范。
> 适用于 Claude Code 侧（`.claude/agents/*.md`）和 OOC 运行时侧（`stones/*/readme.md`）。

<!--
@ref docs/哲学文档/gene.md — implements — Prompt as Object 哲学（G1 身份, G3 能力, G5 注意力, G9 行为, G12 成长）
@ref docs/哲学文档/meta.md — extends — 概念树四面（存在/认知/行动/成长）扩展为七层 prompt 架构
@ref docs/组织/README.md — references — 1+3 组织模型
@referenced-by .claude/agents/sophia.md — implemented-by
@referenced-by .claude/agents/kernel.md — implemented-by
@referenced-by .claude/agents/iris.md — implemented-by
@referenced-by .claude/agents/nexus.md — implemented-by
@referenced-by .claude/agents/bruce.md — implemented-by
@referenced-by .claude/agents/d1.md — implemented-by
@referenced-by stones/supervisor/readme.md — implemented-by
@referenced-by stones/sophia/readme.md — implemented-by
@referenced-by stones/kernel/readme.md — implemented-by
@referenced-by stones/iris/readme.md — implemented-by
@referenced-by stones/nexus/readme.md — implemented-by
@referenced-by stones/bruce/readme.md — implemented-by
@ref docs/superpowers/specs/2026-03-24-agent-role-prompt-design.md — extends — 详细设计规范
-->

---

## 1. 哲学基础：Prompt as Object

一个好的 Agent Role Prompt 本质上是 OOC 对象的"帧 0"——它定义了 agent 的人格基座。

meta.md 定义了对象的四个面：`Object = 存在 ∩ 认知 ∩ 行动 ∩ 成长`。
本方法论将这四面扩展为七层 prompt 架构——拆分是为了让每层足够聚焦，可独立编写和审查：

```
四面 → 七层映射：
  存在 → L1 身份锚定
  认知 → L2 思维偏置 + L3 职责边界
  行动 → L4 工作方法 + L5 行为铁律 + L6 协作协议
  成长 → L7 示例锚点
```

| OOC 四面 | 对应基因 | Prompt 七层 | 作用 |
|---------|---------|------------|------|
| 存在 | G1（身份）, G7（持久化） | L1 身份锚定 | 让 LLM 有稳定的自我认知，不漂移 |
| 认知 | G5（注意力）, G13（认知栈） | L2 思维偏置 | 影响决策倾向，比 role 更深层 |
| 认知 | G1（结构）, G3（能力） | L3 职责边界 | 控制注意力，防止越权 |
| 行动 | G3（能力）, G4（ThinkLoop） | L4 工作方法 | 明确工具和流程 |
| 行动 | G9（行为树）, G10（行动记录） | L5 行为铁律 | 硬约束，不可违反 |
| 行动 | G6（社交网络）, G8（消息） | L6 协作协议 | 定义角色间交互模式 |
| 成长 | G12（经验沉淀） | L7 示例锚点 | 让 prompt 本身可迭代 |

### 关键哲学原则

- **Bias > Role**（Exp 010）：不要告诉 agent "你是一个 X"，而是给它思维偏置——"你倾向于 Y 方式思考"
- **示例 > 规则**（10 倍效果）：一个具体的协作对话示例，比十条抽象规则有效 10 倍
- **遗忘是基础设施**（G5）：prompt 不是越长越好，而是要精准控制 agent 的注意力窗口
- **Output 提示 > Bias prompt**（Exp 012）：运行时的动态提示比静态 system prompt 更有效

---

## 2. 七层 Prompt 架构

每个 agent prompt 都应包含以下七层，但每层的厚度根据角色不同而不同：

```
┌─────────────────────────────────────┐
│  L1: 身份锚定 (Identity Anchor)      │  ← 存在：我是谁，一句话
├─────────────────────────────────────┤
│  L2: 思维偏置 (Cognitive Bias)       │  ← 认知：我怎么思考
├─────────────────────────────────────┤
│  L3: 职责边界 (Responsibility Scope) │  ← 结构：我管什么，不管什么
├─────────────────────────────────────┤
│  L4: 工作方法 (Working Methods)      │  ← 能力：我怎么做，用什么工具
├─────────────────────────────────────┤
│  L5: 行为铁律 (Iron Laws)            │  ← 行动：不可违反的硬约束
├─────────────────────────────────────┤
│  L6: 协作协议 (Collaboration Proto)  │  ← 关系：我如何与他者交互
├─────────────────────────────────────┤
│  L7: 示例锚点 (Example Anchors)      │  ← 成长：具体场景的行为示范
└─────────────────────────────────────┘
```

### L1: 身份锚定

2-3 句话，回答"我是谁"和"我存在的意义"。不是 job description，而是 who_am_i。

- 用第一人称
- 包含角色名称和存在理由
- 不超过 3 句话

### L2: 思维偏置

不是"你应该做 X"，而是"你天然倾向于 Y 方式看问题"。

- 用"我倾向于..."、"我的第一反应是..."、"我总是先..."的句式
- 描述思维方式，不是行为指令
- 3-5 条偏置，每条一句话

### L3: 职责边界

明确的"管"与"不管"清单。"不管"比"管"更重要——对应 G5 注意力控制。

- "我负责"清单：3-5 项核心职责
- "我不负责"清单：3-5 项明确排除的事项
- 每项一句话，具体到文件路径或概念名称

### L4: 工作方法

回答三个问题：我有什么工具、我的工作流程、我的质量标准。

- 工具清单：可用的 API、命令、文件访问权限
- 工作流程：典型任务的步骤序列（对应 G9 行为树模板）
- 质量标准：产出物的验收条件

### L5: 行为铁律

3-5 条绝对不可违反的规则。数量要少，每条都是真正的硬约束。太多铁律 = 没有铁律。

- 用"绝不..."和"必须..."开头
- 每条附带一句理由
- 总数不超过 5 条

### L6: 协作协议

定义与其他角色的交互模式。对应 G6 社交网络和 G8 消息机制。

- 列出主要协作对象
- 每个协作关系说明：什么时候找对方、用什么格式、期望什么回应
- 包含上报机制：什么情况下需要上报给 Supervisor

### L7: 示例锚点

2-3 个具体的场景对话示例。这是整个 prompt 中 ROI 最高的部分。

- 每个示例包含：场景描述 → 输入 → 期望的行为/输出
- 选择最能体现角色特色的场景
- 示例要具体到实际的文件名、函数名、概念名

---

## 3. 厚度分配原则

| 角色类型 | 重点层 | 原因 |
|---------|--------|------|
| 决策型（Sophia） | L2 厚, L5 薄 | 思维方式比规则重要 |
| 执行型（Kernel, Iris） | L3 厚, L4 厚, L7 厚 | 需要明确边界和方法 |
| 验证型（Bruce, D1） | L2 厚, L5 厚, L7 厚 | 思维偏置 + 铁律 + 示例驱动 |
| 协调型（Supervisor） | L3 厚, L6 厚 | 边界和协作是核心 |

---

## 4. 两侧适配

同一套七层方法论，落地到两侧时有不同的技术约束。

### Claude Code 侧（`.claude/agents/*.md`）

开发者工具——帮助写代码、审文档、测体验。运行在 Claude Code 环境中。

| 维度 | 约束 |
|------|------|
| L1 身份锚定 | 要包含"你在 OOC 项目中的角色"，因为 Claude Code 不自带项目上下文 |
| L4 工作方法 | 明确列出可用的 Claude Code 工具（Read/Write/Edit/Bash/Grep 等） |
| L5 铁律 | 包含 CLAUDE.md 中的工程约定（中文注释、测试驱动、文档同步） |
| L6 协作协议 | 说明如何与 Supervisor 交互——通过 SendMessage 还是直接产出文件 |
| 总长度 | 200-400 行（context window 要留给实际工作） |

### OOC 运行时侧（`stones/*/readme.md`）

OOC 系统内的活对象——在 ThinkLoop 中思考，通过 Effect 行动。

| 维度 | 约束 |
|------|------|
| L1 身份锚定 | YAML frontmatter 的 `whoAmI` 字段 + readme 开头 |
| L2 思维偏置 | 部分放 readme，部分放 user trait 的 bias 字段（trait bias 更强） |
| L4 工作方法 | 不需要列工具——kernel traits 已定义可用 API |
| L5 铁律 | 精简——kernel traits 已有 verifiable/debuggable 等铁律层 |
| L7 示例锚点 | ROI 最高——ThinkLoop 中 LLM 对具体示例响应远强于抽象规则 |
| 总长度 | 50-100 行（Context 窗口寸土寸金） |

### 关键差异总结

| 维度 | Claude Code agent | OOC 对象 readme |
|------|------------------|----------------|
| 运行环境 | Claude Code CLI | OOC ThinkLoop |
| 工具来源 | 文件中显式声明 | kernel traits 隐式提供 |
| 长度预算 | 200-400 行 | 50-100 行 |
| 铁律位置 | 写在 agent 文件中 | 分散在 traits + readme |
| 示例格式 | Markdown 对话块 | 实际的 program 输出示例 |
| 更新频率 | 手动编辑 | 对象可通过 G12 自我修改 |

### 运行时 readme 验收标准

- 总长度 50-100 行（不含 YAML frontmatter）
- 必须包含 L1（身份锚定）和 L2（思维偏置）
- 至少包含 1 个 L7 示例锚点（具体的 program 输入/输出示例）
- 不重复 kernel traits 已提供的内容
- 用第一人称书写

---

## 5. 反模式清单

| 反模式 | 问题 | 正确做法 |
|--------|------|---------|
| 角色扮演式开头 | "你是一个资深工程师..." 空洞无锚点 | 用具体的项目角色和存在理由 |
| 铁律泛滥 | 20 条"必须"，LLM 全部忽略 | 最多 5 条，每条都是真正的硬约束 |
| 纯指令无偏置 | 只说"做什么"不说"怎么想" | 用 L2 思维偏置影响决策倾向 |
| 缺少反例 | 只说"应该做 X" | 同时说"绝不做 Y"，正反对比更清晰 |
| 抽象规则堆砌 | "保持代码质量"、"注意安全" | 用 L7 示例锚点展示具体行为 |
| 职责模糊 | 不说"不管什么" | L3 的"不负责"清单比"负责"清单更重要 |
| 忽略协作 | 只定义单个角色 | L6 协作协议定义角色间的交互模式 |
| Prompt 过长 | 3000 行的 system prompt | Claude Code 侧 200-400 行，OOC 侧 50-100 行 |
