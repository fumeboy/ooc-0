# 文档重组 + 名词解释表 设计文档

> 日期：2026-03-17
> 目标：重组 docs/ 目录结构，创建 definition.md 统一术语表

---

## 一、问题诊断

### 当前目录结构（11 个顶级目录）

```
docs/
├── README.md
├── OOC-投资人报告.md
├── 历史文档/          # 8 个旧文件，存档性质
├── 参考/              # 6 个外部学习笔记
├── 哲学文档/          # 核心哲学（gene, emergence, model, questions, traits + 子目录）
├── 实验/              # 33 个实验记录（exp-013 ~ exp-045）
├── 工作流/            # 2 个文件（bruce-workflow, candy-workflow）
├── 建模/              # 早期 mock 数据，已过时
├── 架构/              # 仅 1 个 README.md
├── 理想与现实/        # 2 个文件（target, state）
├── 组织/              # 5 个文件（1+3 模型）
├── 规范/              # 仅 1 个文件（cross-reference）
└── 设计/              # 4 个设计文档
```

### 问题

1. **目录过碎** — `架构/` 只有 1 个文件，`规范/` 只有 1 个文件，不值得独立目录
2. **职责重叠** — `架构/` 和 `设计/` 都是"系统怎么做"，分开放增加查找成本
3. **无阅读路径** — 新人不知道从哪开始，README 只是平铺索引
4. **无统一术语** — Stone/Flow/Trait/Process/Effect 等概念散落在多个文件中
5. **存档混杂** — `历史文档/` 和 `建模/` 都是存档但分开放
6. **目录名不一致** — `哲学文档/` 太长，其他都是两字

---

## 二、新目录结构

### 设计原则

- 按认知分层：WHY → WHAT+HOW → WHO → LEARNED
- 每个目录至少 3 个文件，避免"一个文件撑一个目录"
- 目录名简短（2-4 字）

### 目标结构

```
docs/
├── README.md              # 导航 + 阅读路径（新人指南）
├── definition.md          # 名词解释表（新建）
│
├── 哲学/                  # WHY — 为什么这样设计
│   ├── gene.md            # 13 条基因
│   ├── emergence.md       # 12 条涌现能力（索引）
│   ├── emergence/         # 涌现能力详情（12 个子文件）
│   ├── model.md           # 形式化模型
│   ├── questions.md       # 开放问题与设计决策
│   ├── questions/         # 问题详情子目录
│   ├── traits.md          # Kernel Trait 设计索引
│   ├── traits/            # Kernel Trait 详情（6 个子文件）
│   └── patches/           # 补丁设计
│
├── 系统/                  # WHAT+HOW — 架构、设计、规范
│   ├── README.md          # 系统架构总览（原 架构/README.md）
│   ├── async-messaging.md # 异步消息设计（原 设计/）
│   ├── g11-frontend.md    # 前端设计（原 设计/）
│   ├── pause-resume.md    # 暂停恢复设计（原 设计/）
│   ├── kernel-nexus-plan.md # Kernel+Nexus 计划（原 设计/）
│   └── cross-reference.md # 交叉引用规范（原 规范/）
│
├── 组织/                  # WHO — 团队与工作方式
│   ├── README.md          # 1+3 模型总览
│   ├── 哲学设计层.md      # Sophia
│   ├── 核心思想层.md      # Kernel
│   ├── 用户体验层.md      # Iris
│   ├── 生态搭建层.md      # Nexus
│   ├── bruce-workflow.md  # Bruce 体验工作流（原 工作流/）
│   └── candy-workflow.md  # Candy 体验工作流（原 工作流/）
│
├── 理想与现实/            # 目标与进度对照
│   ├── target.md          # 远景与理想场景
│   ├── state.md           # 当前项目状态
│   └── OOC-投资人报告.md  # 投资人报告（原 docs/ 根目录）
│
├── 实验/                  # LEARNED — 实验记录（不动）
│   └── exp-013 ~ exp-045
│
├── 参考/                  # 外部参考（不动）
│   └── alan_kay_oop.md 等
│
└── 存档/                  # 已过时的历史文件
    ├── 历史文档/          # 原 历史文档/（整体移入）
    └── 建模/              # 原 建模/（整体移入）
```

### 变更汇总

| 操作 | 文件/目录 | 说明 |
|------|----------|------|
| 重命名 | `哲学文档/` → `哲学/` | 缩短目录名 |
| 合并入 `系统/` | `架构/README.md` | 改为 `系统/README.md` |
| 合并入 `系统/` | `设计/*.md`（4 个文件） | 移入 `系统/` |
| 合并入 `系统/` | `规范/cross-reference.md` | 移入 `系统/` |
| 合并入 `组织/` | `工作流/*.md`（2 个文件） | 移入 `组织/` |
| 移入 `理想与现实/` | `OOC-投资人报告.md` | 从 docs 根目录移入 |
| 移入 `存档/` | `历史文档/`、`建模/` | 整体移入 |
| 删除空目录 | `架构/`、`设计/`、`规范/`、`工作流/`、`历史文档/`、`建模/` | 合并后清理 |
| 新建 | `definition.md` | 名词解释表 |
| 重写 | `README.md` | 新的导航 + 阅读路径 |

---

## 三、README.md 阅读路径设计

新的 README.md 提供三条阅读路径：

### 路径 1：快速了解（5 分钟）
1. `definition.md` — 核心术语速查
2. `哲学/gene.md` — 13 条基因（只看表格）
3. `系统/README.md` — 架构总览图

### 路径 2：深入理解（30 分钟）
1. `哲学/gene.md` — 完整阅读 13 条基因
2. `哲学/emergence.md` — 12 条涌现能力
3. `系统/README.md` — 架构 + 数据流
4. `理想与现实/target.md` — 远景目标

### 路径 3：参与开发
1. 路径 2 全部
2. `哲学/model.md` — 形式化模型
3. `系统/` 下所有设计文档
4. `组织/README.md` — 1+3 模型
5. `哲学/questions.md` — 开放问题

---

## 四、definition.md 术语表设计

### 设计原则

- 按认知层次排列：哲学概念 → 数据结构 → 运行时 → 持久化
- 每个术语一行定义，不超过两句话
- 标注对应基因编号（G1-G13）和涌现编号（E1-E12）
- 英文名 + 中文名并列，方便搜索

### 文件结构

```markdown
# OOC 名词解释

> 本文件是 OOC 所有核心概念的统一术语表。
> 按认知层次排列：哲学 → 数据 → 运行时 → 持久化。

## 哲学概念（13 条基因）

| 编号 | 英文 | 中文 | 定义 |
|------|------|------|------|
| G1 | Object | 对象 | OOC 的基本单元，拥有身份、数据、行为、关系 |
| G2 | Stone / Flow | 石头 / 流 | 对象的两种存在形态：Stone 是静态持久体，Flow 是动态执行体 |
| G3 | Trait | 特质 | 对象的自我定义单元，包含思维方式、约束、能力、知识 |
| G4 | Program Action | 程序行动 | 对象通过输出 JS 程序来行动，而非直接操作 |
| G5 | Context & Attention | 上下文与注意力 | 每次思考的结构化输入；有限理性通过注意力聚焦实现 |
| G6 | Relation | 关系 | 对象对其他对象的声明式认知记录 |
| G7 | Persistence as Existence | 持久化即存在 | 对象的文件系统目录就是它的物理存在 |
| G8 | Effect & Space | 影响与空间 | 三个方向：自我修改、接受影响、施加影响 |
| G9 | Behavior Tree | 行为树 | 带焦点游标的结构化计划机制 |
| G10 | Action Record | 行动记录 | 不可变的事件历史（thought/program/message/pause/inject） |
| G11 | UI as Face | UI即面孔 | 对象通过自定义 React 组件表达自我 |
| G12 | Experience Sedimentation | 经验沉淀 | 从行动中提炼模式，结晶为 Trait（Phase 0→1→2→3） |
| G13 | Cognitive Stack | 认知栈 | 统一运行时模型：对象是栈，帧包含任务和认知 |

## 涌现能力（12 条）

| 编号 | 英文 | 中文 | 定义 | 验证状态 |
|------|------|------|------|---------|
| E1 | Self-Evolution | 自我进化 | 对象基于经验创建/修改自己的 Trait | 基础验证 |
| E2 | Multi-Perspective | 多视角思考 | 激活不同 Trait 组合，从不同角度思考 | 未验证 |
| E3 | Ecosystem Collaboration | 生态协作 | 多对象通过消息、共享文件、方法调用协作 | 部分验证 |
| E4 | Memory & Reflection | 记忆与反思 | 维护长期记忆，从行动中提取模式 | 基础验证 |
| E5 | Plan-Execution Separation | 计划执行分离 | 先创建行为树，再逐步执行 | 已验证 |
| E6 | Human-AI Collaboration | 人机协作 | 人类可暂停、注入、编辑；对象可请求人类输入 | 部分验证 |
| E7 | Knowledge Objectification | 知识对象化 | 知识成为拥有身份、数据、方法的对象 | 未验证 |
| E8 | Progressive Capability | 渐进式能力获取 | 通过 Trait 成长阶段逐步获得能力 | 已验证 |
| E9 | Distributed Attention | 分布式注意力 | 多个并发 Flow 独立管理注意力 | 未验证 |
| E10 | Death & Legacy | 死亡与遗产 | 对象删除后，Trait 可被其他对象继承 | 未验证 |
| E11 | Effect Cycle | Effect循环 | 自我修改→执行→记录→反思→沉淀→改进思考 | 未验证 |
| E12 | UI Emergence | UI涌现 | UI 从数据结构和自我表达需求中涌现 | 部分验证 |

## 核心数据结构

### 对象层

| 术语 | 定义 | 基因 |
|------|------|------|
| **StoneData** | 静态对象的完整数据：name, thinkable, talkable, data, relations, traits, memory | G1 |
| **Thinkable** | 对象的完整自我描述（仅自己可见）：whoAmI | G1 |
| **Talkable** | 对象的外部介绍：whoAmI（简短）+ functions（公开方法） | G1 |
| **Relation** | 有向关系：name（目标对象）+ description | G6 |

### 动态层

| 术语 | 定义 | 基因 |
|------|------|------|
| **FlowData** | 动态对象的完整数据：sessionId, stoneName, status, messages, process, actions | G2 |
| **FlowStatus** | 状态机：running / waiting / pausing / finished / failed | G2 |
| **Action** | 不可变事件记录：type, timestamp, content, result, success | G10 |
| **ActionType** | 事件类型：thought / program / message_in / message_out / pause / inject | G10 |
| **PendingMessage** | 异步消息队列条目：id, from, content, replyTo, timestamp | G8 |

### Trait 层

| 术语 | 定义 | 基因 |
|------|------|------|
| **TraitDefinition** | 完整 Trait：name, when, readme, methods, deps, hooks | G3 |
| **TraitWhen** | 激活策略：always / never / string（自然语言条件） | G3 |
| **TraitHookEvent** | 生命周期钩子触发点：before / after / when_finish / when_wait / when_error | G3 |
| **Kernel Trait** | 系统基础能力（computable, talkable 等），所有对象继承 | G3 |
| **User Trait** | 对象特有 Trait，同名时覆盖 Kernel Trait | G3 |

### 行为树层

| 术语 | 定义 | 基因 |
|------|------|------|
| **Process** | 行为树：root（根节点）+ focusId（焦点游标）+ todo（队列） | G9 |
| **ProcessNode** | 树节点：id, title, status, children, deps, actions, traits | G9 |
| **NodeStatus** | 节点状态：todo / doing / done | G9 |
| **Focus Cursor** | 行为树中的当前焦点指针，驱动注意力和上下文加载 | G9 |

### 上下文层

| 术语 | 定义 | 基因 |
|------|------|------|
| **Context** | 结构化 LLM 输入：name, whoAmI, process, messages, actions, instructions, knowledge | G5 |
| **ContextWindow** | 知识窗口：name + content，注入到上下文中 | G5 |
| **DirectoryEntry** | 目录条目：对象的外部介绍（name, whoAmI, functions） | G5 |

## 运行时概念

| 术语 | 定义 | 基因 |
|------|------|------|
| **ThinkLoop** | 核心循环：构建上下文→LLM思考→解析输出→执行程序→记录行动→重复 | G4 |
| **World** | 根对象：管理所有对象、LLM 客户端、任务会话、调度器 | — |
| **Scheduler** | 多 Flow 编排器：注册 Flow，运行 ThinkLoop 轮次，处理错误传播 | — |
| **Router** | 消息路由：跨对象通信的中间层 | G8 |
| **Registry** | 对象注册表：从 objects/ 目录加载所有 Stone | G7 |
| **CodeExecutor** | 沙箱执行器：将 LLM 输出的 JS 代码写入临时文件并执行 | G4 |
| **Directive** | LLM 输出中的控制指令：[break], [wait] 等 | G4 |

## 特殊概念

| 术语 | 定义 | 基因 |
|------|------|------|
| **Self** | 对象跨所有任务的持久身份（认知栈的 frame 0） | G2, G13 |
| **SelfMeta** | 特殊常驻 Flow，维护 frame 0；唯一可写 Stone 持久数据的 Flow | G2, G13 |
| **Session** | 当前任务的工作空间（Flow 目录）；任务结束后丢弃（除非总结） | G2 |
| **Sub-flow** | 在主 Flow 的 flows/ 目录中创建的其他对象的 Flow | G8 |
| **Shared Directory** | 任务内的 shared/ 文件夹，用于对象间文件交换 | G8 |
| **Structured Forgetting** | 已完成节点被替换为摘要的机制 | G5 |
| **Trait Growth** | 四阶段进化：Phase 0（无）→ 1（readme）→ 2（readme+code）→ 3（always-on） | G12 |
| **Mirror** | 自我观察窗口，展示近期行动和模式供反思 | G5 |
| **Effect** | 世界中的任何变化；三个方向：自我修改、接受影响、施加影响 | G8 |

## 持久化

| 术语 | 定义 | 基因 |
|------|------|------|
| **Object Directory** | `.ooc/objects/{name}/`：readme.md, data.json, traits/, effects/, ui/ | G7 |
| **Effects Directory** | `.ooc/objects/{name}/effects/`：所有 Flow 目录（每个任务一个） | G7 |
| **Kernel Directory** | `.ooc/kernel/`：系统基础 Trait | G7 |
| **Frontmatter** | readme.md 中的 YAML 元数据（talkable 信息、traits 列表） | G7 |
```

### 维护规则

1. 新增概念时，必须同步更新 definition.md
2. 术语表中的定义是"权威定义"，其他文档引用时应保持一致
3. 每个术语最多两句话，详细说明链接到对应的哲学/设计文档

---

## 五、实施步骤

### Phase 1：创建新结构（无破坏性）
1. 创建 `docs/definition.md`
2. 创建 `docs/系统/` 目录
3. 创建 `docs/存档/` 目录

### Phase 2：移动文件
4. `mv docs/哲学文档/* docs/哲学/`（重命名目录）
5. `mv docs/架构/README.md docs/系统/README.md`
6. `mv docs/设计/*.md docs/系统/`
7. `mv docs/规范/cross-reference.md docs/系统/`
8. `mv docs/工作流/*.md docs/组织/`
9. `mv docs/OOC-投资人报告.md docs/理想与现实/`
10. `mv docs/历史文档/ docs/存档/历史文档/`
11. `mv docs/建模/ docs/存档/建模/`

### Phase 3：清理
12. 删除空目录：`架构/`、`设计/`、`规范/`、`工作流/`
13. 删除旧 `哲学文档/` 目录（已移到 `哲学/`）

### Phase 4：更新引用
14. 重写 `docs/README.md`（新导航 + 阅读路径）
15. 更新 `CLAUDE.md` 中的文档路径引用
16. 更新 `.claude/rules/cross-reference.md` 中的路径
17. 全局搜索 `docs/哲学文档/` → `docs/哲学/` 等旧路径，逐一替换
18. 更新代码文件中的 `@ref` 路径

### Phase 5：验证
19. 运行 cross-ref 检查，确认无断裂引用
20. 确认所有文档链接可达
