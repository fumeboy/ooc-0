# Meta Thought — 对新模型的深度思考与判断

作者：Alan Kay
日期：2026-03-08

本文档是对 docs/建模/ 新模型设计的系统性思考。
不是总结，而是推演——从已有设计出发，推导出尚未明确的运行时语义。

---

## 一、context.xml 的定位：设计规范 vs 运行时格式

### 判断：XML 是设计规范，运行时必须转换

context.xml 中的 `<proc>`, `<do>`, `<thought>` 等标签是给人类读的设计文档，
不应直接作为 LLM 的输入格式。理由来自项目自身的血泪教训（discussions.md）：

> LLM 看到 XML 标签后会在输出中复制它们，导致语法错误。
> 经历了多次格式迭代才稳定在 `>>> output:` 这种无闭合标记的格式上。

行为树的运行时渲染应该用缩进文本 + 状态标记：

```
调查研究"猫咪为什么喜欢纸箱的科学解释"
    搜索相关新闻 [done] → 找到 3 篇相关文章
    搜索相关生物学知识 [doing]
        (依赖: 搜索相关新闻)
    搜索相关心理学知识 [doing] ← focus
    总结信息 [todo]
```

关键设计原则：
- 无闭合标记（避免 LLM 复制）
- 缩进表达层级（自然、无歧义）
- `← focus` 标记当前焦点（简洁、醒目）
- `[done]` 节点只保留一行摘要（`→ 找到 3 篇相关文章`），详细内容不展示
- `[doing]` 和 `[todo]` 节点不展示内容（还没有内容）

focus 节点的详细上下文（messages, actions, traits）在行为树之后单独展开，
而非嵌套在树结构内部。这样树结构保持紧凑，详细信息保持完整。

---

## 二、行为树的运行时语义

### 判断：结构化 plan + process.json 持久化 + focus 光标

行为树是一种**结构化的 plan 机制**。OOC Object 可以一次性创建庞大的行为树，
然后逐步执行其中的步骤，并且可以随时调整、修改行为树的结构。

**持久化**：每个 Flow 对象拥有一个 `process.json`，记录完整的行为树结构和 focus 光标位置。
这意味着 Flow 重启后可以精确恢复到中断点继续执行。

**最大深度限制**：暂定 20 层。过深的树意味着分解粒度过细，
祖先路径的 context 累积也会过大。20 层足以覆盖绝大多数复杂任务。

**deps 的语义**：deps 表示"必须等待完成"。
如果节点 B 依赖节点 A，则 A 必须标记为 `[done]` 后 B 才能开始执行。
这是严格的前置依赖，不是"可以参考"的软关系。

### 分支决策权：LLM 驱动 + trait 引导 + 系统反馈

分支决策必须是 LLM 做的——因为只有 LLM 理解任务的语义结构。
但 LLM 需要引导，否则会出现过度分解或分解不足。

**分支的时机（应写入一个 `planning` kernel trait）**：
- 当一个步骤涉及不同的对象/领域时，应该分支
- 当一个步骤预计需要 3+ 次 action 时，应该分支
- 当一个步骤的结果需要被多个后续步骤引用时，应该分支（作为依赖点）
- 简单的顺序操作不需要分支，在当前节点直接执行

**focus 光标的移动规则**：
- 自动移动：深度优先，优先处理 `doing` 节点，然后 `todo` 节点
- 依赖感知：如果一个 `todo` 节点有 `deps`，且依赖未完成，跳过它
- 完成回退：当前节点标记 `[done]` 后，自动回退到父节点，检查下一个子节点
- LLM 可以手动移动 focus（通过输出特定指令），但默认是自动的

**系统反馈机制**：
- 如果一个节点的 actions 超过阈值（比如 10 条），系统在 output 中提示：
  "当前节点的行动记录较长，考虑是否需要拆分子步骤？"
- 这利用了已验证的规律：output 提示 > bias prompt（Exp 012 结论）

### 栈进/栈出的语义

栈进（focus 移到子节点）：
1. 子节点的详细 context 被加载（messages, actions）
2. 子节点配置的 trait 激活状态生效（只是激活配置，不是创建新 trait）
3. 父节点的详细 context 保留（因为在祖先路径上）
4. 兄弟节点的详细 context 被折叠为一行摘要

栈出（子节点完成，回到父节点）：
1. 子节点的详细 context 被回收，替换为完成摘要
2. 父节点重新成为 focus，其详细 context 恢复
3. 下一个兄弟节点的 context 开始加载
4. 父节点的 trait 激活配置恢复

这就是"结构化遗忘"——不是事后压缩，而是通过树结构从源头控制信息的进出。
比旧模型的三层压缩（近期/中期/远期）更优雅，也更符合人类注意力的工作方式。

---

## 三、Traits 统一模型

### 判断：Traits 统一了 biases/codes/windows，但三种角色仍然存在

旧模型中 biases、codes、windows 是三个独立目录。
新模型将它们统一为 `traits/`，但这不意味着三种角色消失了——
它们作为 trait 的三种**使用方式**继续存在：

| 使用方式 | 来源 | 作用 | 对应旧概念 |
|---------|------|------|-----------|
| context window | 从 trait 获取 context window 信息 | 注入 LLM 的认知上下文 | windows |
| method | 从 trait 的 index.ts 获取方法定义 | 提供可调用的函数 | codes |
| bias | 从 trait 获取思维方式 | 影响 LLM 的推理风格 | biases |

OOC Object 通过配置来声明：
- 哪些 traits 提供 context window（认知来源）
- 哪些 traits 提供 methods（行为能力）
- 哪些 traits 提供 bias（思维方式）

一个 trait 可以同时扮演多种角色。比如 `error_handling` trait：
- 它的 readme.md 可以作为 context window（让 LLM 知道错误处理策略）
- 它的 index.ts 可以提供 `retryWithBackoff()` 方法
- 它的 readme.md 中的思维指导可以作为 bias

### Trait 的激活与方法注册

关键区分：**激活状态**和**方法注册**是两回事。

- **方法注册**：不管 trait 是否激活，其 index.ts 中的函数**始终被注册为可调用方法**。
  因为 trait 的 public method 可能已经对外提供（被其他对象调用），
  或者被对象自身的其他方法依赖。方法注册是静态的、全量的。

- **激活状态**：决定的是 trait 的 readme.md 是否被注入到当前 think 的 context 中，
  以及 trait 的 bias 是否影响当前的推理。激活是动态的、按需的。

这意味着：一个未激活的 trait 仍然"存在"——它的方法可以被调用，
只是它的认知内容和思维方式不会主动影响 LLM 的思考。

### 行为树节点只能配置激活，不能创建 trait

行为树的子节点**不能创建新的 traits**。Traits 只能基于 Stone/Flow Object 创建。
子节点能做的是：配置当前 Object 已有的哪些 traits 需要在该节点的 context 中激活。

这保证了 trait 的生命周期与 Object 绑定，而非与行为树节点绑定。
行为树是临时的执行结构，trait 是持久的能力单元——两者的生命周期不应耦合。

### Trait 的依赖与迭代

- **依赖**：trait 可以声明依赖其他 trait。被依赖的 trait 会自动加载。
- **迭代**：trait 迭代时不保留旧版本，直接在原版本基础上修改。
  这与 G12 的沉淀理念一致——trait 是"活的"，它在原地成长，不是版本快照。

### Trait 的加载策略

`when` 字段的三种模式：

| when 值 | 加载策略 | 示例 |
|---------|---------|------|
| `always` | 系统自动激活，每次 think 都包含 | computable |
| 自然语言条件 | 系统在 context 中展示 trait 目录，LLM 决定是否激活 | file_system, talkable |
| `never` / 无 | 只能被其他 trait 依赖或被 program 显式引用 | 内部工具 trait |

**trait 目录在 context 中的呈现**（紧凑格式）：

```
可用能力:
- file_system: 操作文件系统 (当需要读写文件时)
- talkable: 与其他对象沟通 (当需要协作时)
- search_skill: 搜索信息 (当需要查找资料时)
```

LLM 通过在 program 中调用类似 `self.activateTrait('search_skill')` 来激活。
激活后，trait 的 readme.md 内容被注入到下一轮 think 的 context 中。

---

## 四、Kernel 与 User Object 的 Trait 继承

### 判断：Kernel traits 是基础层，User object traits 继承并可覆盖

Kernel 是 OOC 系统的基础部分，约定了 OOC Object 的通用能力。
持久化、可计算、可通信等能力**应该存在于 kernel 中实现**——
它们是所有对象共享的基础设施，不是某个对象的特殊能力。

**继承规则**：

```
kernel/traits/           # 基础 traits（所有对象共享）
├── computable/          # 可计算
├── talkable/            # 可通信
├── persistable/         # 可持久化
└── ...

.ooc/stones/blueprint/traits/   # user object 的 traits
├── talkable/            # 同名 → 覆盖 kernel 的 talkable
├── part_foo/            # 不同名 → 自动合并（新增能力）
└── ...
```

- **同名 trait**：user object 的版本**覆盖** kernel 的版本
- **不同名 trait**：自动**合并**，user object 获得 kernel + 自身的全部 traits
- **持久化优化**：kernel traits 不需要序列化到 user object 的持久化目录。
  系统加载 user object 时，自动从 kernel 继承基础 traits，
  只有 user object 自己的 traits（包括覆盖的同名 trait）需要持久化。

这类似于编程语言中的原型链：kernel 是原型，user object 是实例。
实例可以覆盖原型的属性，也可以添加自己的属性，但不需要复制原型的全部内容。

---

## 五、Sub-flow 的精确语义

### 判断：Sub-flow 是完整的 Flow 对象，持久化在 main flow 的子目录中

Sub-flow 的机制如下：

当一个 Stone 对象接收到任务时：
1. 在 `/.ooc/flows/{task}/` 创建 **main flow**
2. main flow 执行过程中需要与其他 Stone 对象交互时，
   在 `/.ooc/flows/{task}/flows/{otherStoneName}/` 创建 **sub-flow**

关键约束：
- **所有 flow 统一在 flows/ 下**——main flow 和所有 sub-flow 都在顶层 flows/ 目录下
- **sub-flow 是完整的 Flow 对象**——拥有 process.json、data.json、context 等全部结构
- **唯一性**：同一个 Stone object 在同一个 main flow 树下只会有一个 flow 对象。
  如果 blueprint 多次与 browser 交互，不会创建多个 browser flow，而是复用同一个

```
.ooc/flows/                                    # 顶层 flows 目录
└── 2026-03-07-01_task_bar/                    # main flow
    ├── process.json                            # 行为树 + focus 光标
    ├── data.json                               # flow 数据
    ├── shared/                                 # 共享文件区（仅 main flow 拥有）
    └── flows/
        ├── browser/                            # sub-flow: browser 的完整 Flow 对象
        │   ├── process.json
        │   ├── data.json
        │   └── ...
        └── researcher/                         # sub-flow: researcher 的完整 Flow 对象
            ├── process.json
            ├── data.json
                └── ...
```

### 非对称性是正确的

Sub-flow 的持久化目录在发起者的 flows 下，
而非被交互者的 stones 下。这是正确的：

- **认知归属**：flow 记录的是行动者的认知过程，归属于发起者
- **Stone 不需要感知**：如果 browser 是纯工具型 Stone，它只被调用，不需要知道谁在用它
- **Flow 对 Flow 协作**：如果两个 Flow 互相交互，各自在自己的 flows 下有独立视角，
  通过 messages 保持一致性

### shared/ 目录

只有 main flow 拥有 `shared/` 目录。Sub-flow 复用 main flow 的 shared/。
这限定了共享范围——文件共享发生在一个具体任务内，而非全局。

---

## 六、World 的归宿

### 判断：World = .ooc/ 目录本身

World 不应该是 `.ooc/stones/world/`，而应该是 `.ooc/` 本身。

理由：World 之上没有其他对象，它控制整个 OOC 系统的所有文件。
如果 World 是 `.ooc/stones/world/`，那谁管理 `.ooc/stones/` 这个目录？
这会导致无限回归。

```
.ooc/                          # World 的持久化目录
├── readme.md                  # World 的自我说明
├── data.json                  # World 的全局配置
├── traits/                    # World 的 traits
│   ├── registry/              # 对象注册表
│   │   ├── readme.md
│   │   └── index.ts
│   ├── router/                # 消息路由
│   │   ├── readme.md
│   │   └── index.ts
│   └── lifecycle/             # 生命周期管理
│       ├── readme.md
│       └── index.ts
├── flows/                    # 所有 Flow sessions
├── stones/                   # World 管理的所有对象
│   ├── blueprint/
│   ├── browser/
│   └── ...
└── kernel/                    # 系统基础（kernel traits 等）
```

**哲学意义**：
World 的持久化目录就是 `.ooc/` 根目录，这意味着 World 的"身体"就是整个 OOC 文件系统。
这与 G7（持久化即存在）完美一致——World 的存在就是整个 .ooc/ 目录的存在。

World 不是"生态中的一个对象"，而是"生态本身"。
就像宇宙不是宇宙中的一个物体——宇宙就是所有物体存在的空间。

但 World 仍然是一个 OOC Object——它有 readme.md、data.json、traits/、flows/。
它遵循 G1（万物皆对象），只是它的持久化目录恰好是根目录。

---

## 七、G12 在新模型下的演化

### 判断：沉淀路径从"三个目录搬家"变为"trait 在原地成长"

旧模型：window → code → bias（三个独立目录，三个阶段）

新模型：trait 的有机成长——

**阶段 0：无 trait**
经验只存在于 actions 历史中。尚未被识别为值得沉淀的模式。

**阶段 1：只有 readme.md 的 trait**（≈ 旧模型的 window）
```
traits/error_handling/
└── readme.md    # 记录：遇到 API 超时时，应该先检查网络再重试
```
对象"知道"这个经验，但还没有封装为可执行的能力。
readme.md 在 trait 被激活时注入 context，影响 LLM 的思考。

**阶段 2：readme.md + index.ts 的 trait**（≈ 旧模型的 code）
```
traits/error_handling/
├── readme.md    # 更新：包含使用指南和适用场景
└── index.ts     # 封装：retryWithBackoff(fn, maxRetries) 函数
```
对象"会做"这件事——有了可调用的方法。
readme.md 告诉 LLM 什么时候用，index.ts 提供具体实现。
注意：index.ts 中的方法一旦存在就始终注册为可调用，不受激活状态影响。

**阶段 3：trait 成为核心思维的一部分**（≈ 旧模型的 bias）
```
traits/error_handling/
├── readme.md    # 进化为思维指导：包含 bias 级别的推理策略
└── index.ts     # 成熟的工具方法集
```
trait 的 `when` 变为 `always`，readme.md 中的内容从"知识"进化为"直觉"。
这个 trait 不再需要被"激活"——它已经是对象思维的一部分。

**关键区别**：旧模型的沉淀是"搬家"（从 windows/ 搬到 codes/ 再搬到 biases/），
新模型的沉淀是"成长"（trait 在原地从 readme-only 长出 index.ts，再进化为 always-on bias）。
trait 迭代时不保留旧版本，直接在原版本基础上修改——这是活的成长，不是版本归档。

---

## 八、kernel/object.ts 的 base 接口

### 判断：三元组是正确的最小集，kernel 负责扩展通用能力

当前 base 接口定义了三个核心维度：
- `_thinkable`：有内在认知（对内的 who_am_i）
- `_talkable`：有外在接口（对外的 who_am_i + functions）
- `_relatable`：有关系网络（知道其他对象的存在）

这三个维度回答了"什么使一个东西成为 OOC 对象"的本质问题。

Kernel 作为 OOC 系统的基础部分，负责在 base 之上提供通用能力的实现。
持久化、可计算等能力**应该在 kernel 中实现**，通过 kernel traits 提供给所有对象：

```
kernel/
├── object.ts              # base 接口定义
└── traits/
    ├── persistable/       # 持久化能力（G7）
    ├── computable/        # 程序执行能力（G4）
    ├── talkable/          # 通信能力（G6/G8）
    ├── planning/          # 行为树规划能力
    └── ...
```

base 接口是"对象是什么"，kernel traits 是"对象能做什么"。
前者是本体论，后者是能力论。两者都属于 kernel 层。

---

## 九、Flows 与 Flow 的生命周期

每个任务对应一个 flows 子目录，目录结构即 Flow 的物理存在：

```
.ooc/flows/
└── 2026-03-07-01_task_bar/     # 一个任务 = 一个 main flow
    ├── process.json             # 行为树 + focus
    ├── data.json                # flow 数据
    ├── shared/                  # 共享文件区（仅 main flow）
    └── flows/                   # sub-flows
        └── browser/             # browser 的 flow（完整 Flow 对象）
```

任务完成后，整个 session 子目录可以归档或删除，shared/ 随之清理。
这解决了 Flow 生命周期管理的问题（discussions.md 中提到的"Flow 何时销毁"）：
**任务完成 = session 目录归档 = 所有相关资源自动回收**。

---

## 十、总结判断

新模型的核心改进——traits 统一、行为树、flows 物理化——
不是对旧模型的修补，而是对 OOC 认知架构的重新奠基。

最关键的突破是**行为树 + focus 光标 + process.json**。
它把 G5（Context/有限理性）从"被动的信息压缩"升级为"主动的注意力控制"。
这是从"记忆管理"到"认知架构"的质变。

实现优先级建议：
1. kernel 层：base 接口 + kernel traits（persistable, computable, talkable, planning）
2. 行为树运行时：process.json 格式、focus 移动规则、栈进栈出、渲染格式
3. Trait 系统：加载/激活机制、方法注册、依赖解析、kernel/user 继承
4. World 对象化：.ooc/ 作为 World 的持久化目录，registry/router/lifecycle traits
5. Sub-flow 机制：main flow 创建、sub-flow 创建与复用、shared/ 管理
6. G12 重新实现：trait 的阶段性成长（readme → index.ts → always-on bias）
