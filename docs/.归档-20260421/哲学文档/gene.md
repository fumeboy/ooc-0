# Gene — OOC 系统的核心基因

本文档定义 OOC（Object-Oriented Context）系统的核心规则。
这些规则是系统的「基因」——最小的、不可再分的原则集合。
所有上层能力都是这些基因的组合与涌现，而非额外添加的特性。

本文档是自包含的。读者不需要任何前置知识。

---

## 什么是 OOC

OOC 是一种 AI 智能体（Agent）架构。

传统 Agent 的工作方式是：人类写一段 prompt，发给大语言模型（LLM），LLM 返回文本，
程序解析文本并执行动作，然后把结果拼回 prompt，再次发给 LLM。
在这种模式下，Agent 的「上下文」是一段不断增长的文本——它是扁平的、无结构的、一次性的。

OOC 提出一个不同的模型：**把 Agent 的上下文组织为「活的对象生态」**。

在 OOC 中，不存在一段巨大的 prompt。取而代之的是一组对象——
每个对象有自己的身份、数据、行为、思维方式和关系。
对象之间可以协作、对话、创建新对象。

以下基因定义了这个模型的全部规则。

---

## G1: 对象是 OOC 的唯一建模单元

<!--
@referenced-by kernel/src/types/object.ts — implemented-by — StoneData, Talkable, Thinkable, Relation
@referenced-by kernel/src/stone/stone.ts — implemented-by — Stone 对象实例
@referenced-by kernel/src/persistence/frontmatter.ts — implemented-by — readme.md 格式
@referenced-by kernel/src/world/world.ts — implemented-by — World 本身也是对象
@referenced-by kernel/src/world/registry.ts — implemented-by — 对象注册与通讯录
@referenced-by kernel/web/src/features/ObjectDetail.tsx — rendered-by
@referenced-by kernel/web/src/features/IdentityTab.tsx — rendered-by
@referenced-by kernel/web/src/features/DataTab.tsx — rendered-by
@referenced-by kernel/web/src/components/Sidebar.tsx — rendered-by
@referenced-by kernel/web/src/store/objects.ts — referenced-by
-->

OOC 中的一切实体都是**对象（Object）**。

一个对象由以下部分组成：

| 组成部分 | 含义 | 举例 |
|---------|------|------|
| **name** | 唯一标识符 | "researcher"、"filesystem"、"world" |
| **thinkable.who_am_i** | 对自身的完整说明（仅自己可见） | "你是一个研究员，擅长信息检索和分析..." |
| **talkable.who_am_i** | 对外的简短介绍（其他对象可见） | "研究员，擅长信息检索" |
| **talkable.functions** | 对外公开的方法列表（仅名称+描述，不含参数） | [{ name: "search", description: "搜索信息" }] |
| **data** | 动态键值对数据 | { "topic": "AI safety", "progress": 0.3 } |
| **relations** | 与其他对象的有向关系 | [{ name: "browser", description: "搜索工具" }] |
| **traits** | 能力单元集合（详见 G3） | computable, talkable, file_system |

这不是面向对象编程（OOP）的类比。OOP 中的对象是程序员的建模工具；
OOC 中的对象是 Agent 的存在形式——**对象就是 Agent 本身**。

一个对象可以是数据容器（如一份配置文件），
可以是工具（如文件系统操作器），
可以是思考者（如研究员），
可以是工作区（如一个项目空间），
也可以是世界本身（管理所有其他对象的根对象）。

**推论**：当你需要在 OOC 中表达一个新概念时，不要发明新机制——创建一个新对象。

---

## G2: 对象分为两种基础形态——Stone 和 Flow

<!--
@referenced-by kernel/src/types/object.ts — implemented-by — StoneData
@referenced-by kernel/src/types/flow.ts — implemented-by — FlowData, FlowStatus
@referenced-by kernel/src/stone/stone.ts — implemented-by — Stone 静态形态
@referenced-by kernel/src/flow/flow.ts — implemented-by — Flow 动态形态
@referenced-by kernel/src/flow/thinkloop.ts — implemented-by — ThinkLoop 执行引擎
@referenced-by kernel/src/world/session.ts — implemented-by — 同一任务中 Flow 复用
@referenced-by kernel/src/world/scheduler.ts — referenced-by — Flow 状态驱动调度
@referenced-by kernel/web/src/features/FlowDetail.tsx — rendered-by
@referenced-by kernel/web/src/features/EffectsTab.tsx — rendered-by
@referenced-by kernel/web/src/store/flows.ts — referenced-by
-->

并非所有对象都需要思考能力。OOC 定义了两种基础形态：

**Stone（石头）**是纯粹的数据与逻辑载体。
它拥有 G1 中列出的所有组成部分，可以持有数据、定义方法、被其他对象调用。
但它不会主动做任何事——它没有思考能力，不会调用 LLM，不会自主行动。
Stone 就像一块刻了字的石头：信息在那里，但石头不会自己读出来。

**Flow（流）**是 Stone 在执行任务时的动态派生。
当一个 Stone 接收到任务时，系统在其 `effects/` 目录下创建一个 Flow 对象。
Flow 额外拥有：
- **思考能力**：可以调用 LLM 进行推理
- **执行能力**：可以输出程序并在沙箱中运行
- **行为树（Process）**：结构化的计划与执行跟踪（详见 G9）
- **状态机**：running → waiting → pausing → finished / failed
- **消息（messages）**：按时间顺序记录收到（in）和发出（out）的所有消息

Flow 是 OOC 中「做事情」的核心单元。
所有主动行为——思考、决策、执行、对话——都通过 Flow 完成。

**Stone 和 Flow 的关系不是「低级 vs 高级」，而是「静态 vs 动态」。**
一个复杂的工具对象（如文件系统扩展）可能是 Stone，因为它只需要被调用，不需要自主思考。
一个简单的助手对象可能需要 Flow，因为它需要理解指令并自主行动。

**一个 Stone 可以同时拥有多个 Flow**——每个任务对应一个 Flow，
它们在 `effects/` 目录下并行存在，互不干扰。

### 对象视角：Self、Session、SelfMeta

Stone 和 Flow 是系统内部术语。对对象自身而言，它感知到的是三个概念：

| 系统概念 | 对象视角 | 含义 |
|---------|---------|------|
| Stone 持久化目录 | **Self**（自我） | "我是谁"——跨越所有任务的持久身份、记忆、能力 |
| Flow 持久化目录 | **Session**（此刻） | "我现在在做什么"——当前任务的工作空间，任务结束即消散 |
| `_selfmeta` Flow | **SelfMeta** | "自我的管理者"——维护 Self 长期数据的常驻 Flow |

**Session 只能写自己的目录。** `setData`、会话记忆、文件操作都在 Session 目录下。
Session 中的一切，任务结束后不再加载到新任务的 context 中（除非写了 flow summary）。

**Self 只能通过 SelfMeta 修改。** 普通 Flow 没有任何直接写 Self 目录的 API。
想把 Session 中的收获沉淀到 Self，唯一的方式是 `talkToSelf(message)` —— 向 SelfMeta 发消息。

**SelfMeta 是同一个对象的常驻 Flow**，不是独立对象。它：
- 共享同一个 Stone 的身份（whoAmI、traits）
- 是唯一拥有写 Self 目录权限的 Flow（memory.md、data.json、traits/）
- 收到消息后，用 LLM 判断：值得沉淀吗？沉淀到哪里？
- **可以反向回复发起方**，形成双向的"自我对话"——追问、确认、拒绝

这个设计的哲学意义：**沉淀不是机械的数据搬运，而是一次自我对话。**
对象在 Session 中经历了什么、学到了什么，需要经过 SelfMeta 的审视才能成为 Self 的一部分。
就像人类的反思：不是所有经历都会变成长期记忆，只有经过"内心对话"的才会。

---

## G3: Trait 是对象的自我定义单元

<!--
@referenced-by kernel/src/types/trait.ts — implemented-by — TraitDefinition, TraitWhen, TraitMethod
@referenced-by kernel/src/trait/loader.ts — implemented-by — 从文件系统加载 Trait
@referenced-by kernel/src/trait/activator.ts — implemented-by — Trait 激活逻辑
@referenced-by kernel/src/trait/registry.ts — implemented-by — 方法全量注册
@referenced-by kernel/src/context/builder.ts — implemented-by — Trait 内容注入 context
@referenced-by kernel/src/flow/thinkloop.ts — implemented-by — Trait 元编程 API
@referenced-by kernel/web/src/features/TraitsTab.tsx — rendered-by
@referenced-by docs/哲学文档/traits.md — extended-by
-->

**Trait（特质）**是 OOC 中对象定义自身的统一机制。

Trait 不只是"能力"——它是对象用来塑造自己的一切手段。
一个 trait 可以扮演以下任意角色的组合：

| 角色 | 作用 | 举例 |
|------|------|------|
| **思考风格** | 影响 LLM 的推理方式和偏好 | "分析问题时先列 pros/cons" |
| **自我约束** | 对象为自己设定的行为规则 | "任务完成后必须记笔记" |
| **能力扩展** | 提供可调用的函数（index.ts） | search(), writeReport() |
| **信息扩展** | 注入认知上下文（readme.md） | 参考资料、领域知识 |

这四种角色的本质区别在于**作用对象**：
- 思考风格和自我约束作用于**对象自身的行为**（自治）
- 能力扩展和信息扩展作用于**对象与世界的交互**（能力）

**Trait 的来源不只是经验沉淀（G12）。** 对象可以主动为自己创建 trait：
- 从经历中提取模式 → 经验沉淀（G12 路径）
- 主动给自己立规矩 → 自我约束（自治路径）
- 被人类或其他对象教导 → 外部注入

这意味着 trait 是对象的**自我立法**机制——对象通过 trait 定义"我是什么样的存在"。

一个 trait 可以同时扮演多种角色。每个 trait 是一个目录：

```
traits/{trait_name}/
├── readme.md    # 文档：这个 trait 是什么、什么时候用、思维指导
└── index.ts     # 程序：提供可调用的方法（可选）
```

### Trait 的激活与方法注册

**激活状态**和**方法注册**是两回事：

- **方法注册**：不管 trait 是否激活，其 index.ts 中的函数**始终被注册为可调用方法**。
  因为 trait 的 public method 可能已经对外提供（被其他对象调用），
  或者被对象自身的其他方法依赖。方法注册是静态的、全量的。

- **激活状态**：决定的是 trait 的 readme.md 是否被注入到当前 think 的 context 中，
  以及 trait 的 bias 内容是否影响当前的推理。激活是动态的、按需的。

### Trait 的 when 字段

每个 trait 的 readme.md 头部声明 `when` 字段，控制加载策略：

| when 值 | 加载策略 | 示例 |
|---------|---------|------|
| `always` | 系统自动激活，每次 think 都包含 | computable |
| 自然语言条件 | 以一行摘要出现在 context 中，对象用 `activateTrait(name)` 按需加载完整内容 | "当需要创建新对象时" |
| `never` / 无 | 只能被其他 trait 依赖或被 program 显式引用 | 内部工具 trait |

条件 trait 的激活权在对象自己手中——对象看到摘要后决定是否需要加载。
这是 G3「自我立法」的体现：对象管理自己的认知资源。

### Trait 的依赖与迭代

- **依赖**：trait 可以声明依赖其他 trait。被依赖的 trait 会自动加载。
- **迭代**：trait 迭代时不保留旧版本，直接在原版本基础上修改。
  Trait 是「活的」，它在原地成长，不是版本快照。

### Kernel Traits 与 User Object Traits

OOC 的 trait 分为两层：

- **Kernel traits**：系统基础能力，所有对象共享（如 computable、talkable、persistable）
- **User object traits**：用户态对象自己的能力（如 part_foo、search_skill）

继承规则：
- 同名 trait：user object 的版本**覆盖** kernel 的版本
- 不同名 trait：自动**合并**，user object 获得 kernel + 自身的全部 traits
- 持久化优化：kernel traits 不需要序列化到 user object 的持久化目录

**推论**：改变一个对象的 traits，就是改变它的全部——思维方式、行为规则、知识、能力。
Trait 是 OOC 中对象「自我定义」的原子单位。

---

## G4: 对象通过输出程序来行动

<!--
@referenced-by kernel/src/flow/thinkloop.ts — implemented-by — ThinkLoop 核心循环
@referenced-by kernel/src/flow/parser.ts — implemented-by — 程序提取与指令检测
@referenced-by kernel/src/executable/executor.ts — implemented-by — 沙箱执行引擎
@referenced-by kernel/src/executable/effects.ts — implemented-by — 副作用追踪
@referenced-by kernel/src/thinkable/client.ts — referenced-by — LLM 是思考引擎
@referenced-by docs/设计/pause-resume.md — extended-by — 暂停/恢复机制
-->

对象不直接操作世界。

当一个 Flow 需要行动时，它在思考输出中写一段 JavaScript 程序。
系统提取这段程序，在安全沙箱中执行，然后把执行结果反馈给对象。

这个「思考 → 输出程序 → 执行 → 反馈 → 再思考」的循环叫做 **thinkloop**。

为什么不让对象直接操作？因为间接层带来了四个关键特性：
1. **可审计**：每段程序都记录在 process 中，人类可以回溯对象做了什么
2. **可中断**：对象可以输出 `[break]` 拒绝执行剩余程序
3. **可注入**：对象暂停时，人类可以代替对象注入程序
4. **可反思**：执行结果写回 process，对象可以从成功和失败中学习

**元编程**：对象还可以通过程序修改自己的 traits/ 目录，为自己编写新方法或新的思维方式。
具体 API 包括 createTrait/readTrait/editTrait/listTraits（CRUD）和 addWindow/getWindow/editWindow/removeWindow/listWindows（Context Window 管理）。
这意味着对象的能力边界不是固定的——它可以在运行时扩展自己。

---

## G5: Context 是对象每次思考时看到的全部信息

<!--
@referenced-by kernel/src/types/context.ts — implemented-by — Context, ContextWindow, WindowConfig
@referenced-by kernel/src/context/builder.ts — implemented-by — buildContext 构建
@referenced-by kernel/src/context/formatter.ts — implemented-by — Context → LLM prompt
@referenced-by kernel/src/process/focus.ts — implemented-by — 结构化遗忘（栈进/栈出）
@referenced-by kernel/src/process/render.ts — implemented-by — focus 路径详细、其余摘要
@referenced-by kernel/src/types/process.ts — implemented-by — focus 光标驱动遗忘
@referenced-by kernel/src/trait/activator.ts — referenced-by — 激活决定 context 注入内容
@referenced-by kernel/src/flow/thinkloop.ts — implemented-by — 每轮构建 Context
-->

**Context（上下文）**是系统为 Flow 构建的结构化输入。
每次 thinkloop 迭代时，系统根据对象的当前状态构建 Context，发送给 LLM。

**对象不知道 Context 之外的任何事情。**

Context 由以下部分组成：

| 部分 | 含义 | 来源 |
|------|------|------|
| **whoAmI** | 我是谁 | 对象的 thinkable.who_am_i + 激活的 traits 的 bias 内容 |
| **process** | 我的行为树 | 结构化的计划与执行状态（详见 G9） |
| **messages** | 我收发的消息 | 双向消息列表（direction: in/out） |
| **windows** | 我选择关注的信息 | 从激活的 traits 获取的 context window 内容 |
| **directory** | 我能联系谁 | 系统中所有其他对象的名称、简介、公开方法列表（仅名称+描述） |
| **status** | 我现在的状态 | running / waiting / pausing / finished / failed |

这个设计模拟了**有限理性（bounded rationality）**：
人类做决策时也不是基于「世界的全部信息」，而是基于「此刻能看到的信息」。
Context 就是对象的「此刻能看到的信息」。

### 注意力管理与结构化遗忘

有限理性意味着 Context 有容量上限。新模型通过**行为树 + focus 光标**（G9）
从源头控制信息的进出，而非事后压缩：

- **focus 在哪个节点**，就只加载该节点及其祖先路径的详细信息
- **兄弟节点**只保留一行摘要
- **已完成的子节点**被回收为完成摘要

这是「结构化遗忘」——不是事后压缩已有信息，而是通过树结构主动控制信息的进出。
比扁平的三层压缩更优雅，也更符合人类注意力的工作方式。

**推论**：
- 改善对象的表现 = 改善它的 Context 质量
- Context windows 让对象可以主动选择「看什么」（类似于人类打开一份参考文档）
  Context window 有三种来源：静态文本、文件路径（每次思考时读取最新内容）、函数（每次思考时调用指定方法获取内容）
- Directory（通讯录）让对象知道「能找谁帮忙」，但看不到对方的内部状态
- Directory 中的方法列表**只展示名称和描述，不含参数定义**。
  调用方必须先通过 `get_object_method_param_definition(objectName, methodName)` 查看参数。
  这模拟了人类协作：你知道同事"会做数据分析"，但具体怎么提需求，得先问他。
- 真正的学习 = 从经历中提取模式（沉淀为 trait），然后安全地遗忘原始细节

---

## G6: 对象通过关系连接成网络

<!--
@referenced-by kernel/src/types/object.ts — implemented-by — Relation 类型
@referenced-by kernel/src/stone/stone.ts — implemented-by — addRelation
-->

**Relation（关系）**是对象对其他对象的认知记录。

每个对象的 `_relatable` 列表记录了它知道的其他对象：

```
_relatable: [
  { name: "browser", description: "搜索工具，可以查找网页信息" },
  { name: "filesystem", description: "文件系统操作器" }
]
```

关系是**声明式的**：它只记录一个事实，不携带逻辑、不触发行为。
「我知道 browser 存在」不意味着我会自动调用它，只意味着我知道可以找它帮忙。

---

## G7: 对象的持久化目录就是它的物理存在

<!--
@referenced-by kernel/src/persistence/reader.ts — implemented-by — readStone, readFlow, listObjects
@referenced-by kernel/src/persistence/writer.ts — implemented-by — writeStone, writeFlow
@referenced-by kernel/src/persistence/frontmatter.ts — implemented-by — readme.md 物理载体
@referenced-by kernel/src/stone/stone.ts — implemented-by — load/save/create
@referenced-by kernel/src/flow/flow.ts — implemented-by — Flow 持久化到 effects/
@referenced-by kernel/src/world/world.ts — implemented-by — .ooc/ 即 World 物理存在
@referenced-by kernel/src/world/registry.ts — referenced-by — 从 objects/ 扫描加载
@referenced-by kernel/src/trait/loader.ts — referenced-by — Trait 目录即 Trait 存在
-->

每个对象在文件系统中表现为一个目录：

```
stones/{objectName}/
├── readme.md       # 身份：thinkable.who_am_i（正文）+ talkable 信息（frontmatter）
├── index.ts        # 数据类型定义
├── data.json       # 状态：所有 fields 的键值对（Self 数据，只有 SelfMeta 可写）
├── memory.md       # 长期记忆索引（Self 记忆，只有 SelfMeta 可写）
├── traits/         # 能力单元目录（Self 能力，只有 SelfMeta 可写）
│   ├── {trait_name}/
│   │   ├── readme.md   # trait 文档（when, description, bias 内容）
│   │   └── index.ts    # trait 方法（可选）
│   └── ...
├── ui/             # 面孔：对象的 UI 展示（G11）
│   └── index.tsx   # React 组件，由对象自己编写
└── effects/        # Flow 目录：每个任务一个子目录
    ├── _selfmeta/  # SelfMeta Flow（常驻，维护 Self 数据的唯一写入者）
    └── {task_id}/  # 普通 Flow = Session（只能写自己目录下的文件）
```

这不仅是一种序列化方案。它是一个存在论声明：
**目录存在，对象就存在；目录被删除，对象就消亡。**

这带来了一个强大的特性：**人类可以直接编辑对象。**
- 修改 readme.md → 改变对象的自我认知
- 修改 traits/ 中的文件 → 改变对象的思维方式、知识、能力
- 修改 data.json → 改变对象的状态数据
- 修改 ui/index.tsx → 改变对象的面孔（展示方式）

即使系统没有运行，人类也可以通过编辑文件来「改造」对象。

### World 的特殊性

World 是 OOC 的根对象，它的持久化目录就是 `.ooc/` 本身：

```
.ooc/                          # World 的持久化目录
├── readme.md                  # World 的自我说明
├── data.json                  # World 的全局配置
├── traits/                    # World 的 traits（registry, router, lifecycle）
├── effects/                   # World 自己的任务
├── objects/                   # World 管理的所有对象
└── kernel/                    # 系统基础（kernel traits）
```

World 之上没有其他对象，它控制整个 OOC 系统的所有文件。
World 不是「生态中的一个对象」，而是「生态本身」。
但它仍然遵循 G1——它有 readme.md、data.json、traits/、effects/，它是一个 OOC Object。

---

## G8: Effect 与 Space —— 对象如何影响世界

<!--
@referenced-by kernel/src/world/router.ts — implemented-by — talk/readShared/writeShared
@referenced-by kernel/src/world/scheduler.ts — implemented-by — 多 Flow 调度与错误传播
@referenced-by kernel/src/flow/flow.ts — implemented-by — deliverMessage 异步消息投递
@referenced-by kernel/src/flow/thinkloop.ts — implemented-by — 协作 API 注入
@referenced-by kernel/src/types/flow.ts — implemented-by — PendingMessage
@referenced-by kernel/src/executable/effects.ts — referenced-by — Effect 概念
@referenced-by kernel/src/world/session.ts — referenced-by — sub-flow 机制
@referenced-by kernel/web/src/features/EffectsTab.tsx — rendered-by
@referenced-by docs/设计/async-messaging.md — extended-by
-->

OOC 中一切变化都是**影响（Effect）**。
Effect 有三种方向，它们共同定义了对象与世界的关系：

### 三种 Effect

**我→我（Self-Modification）**

对象的 Flow 在自己的持久化目录中行动，修改自己的 traits/、data.json。
产生影响的是我，受到影响的也是我。这就是**元编程**——对象改变自身。

**它→我（Receiving Influence）**

其他对象如何影响我。按主体性保留程度从高到低：

| 方式 | 机制 | 主体性 |
|------|------|--------|
| 消息（talk） | 信息写入我的 messages | 完全保有——我决定如何回应 |
| 公开方法调用 | 触发我设计的接口 | 预先行使——我定义了接口行为 |
| 共享环境变化 | 我感知到 shared/ 中的文件变化 | 感知保有——我决定如何解读 |

**我→它（Exerting Influence）**

我如何影响其他对象。三种方式：
1. **消息**：talk(target, message) — 最尊重对方主体性
2. **方法调用**：target.method(args) — 使用对方预定义的接口
3. **共享文件**：写入 shared/ 目录 — 间接影响

### Effects 目录

每个任务的 Flow 在 `effects/{task_id}/` 下拥有一个 `shared/` 目录，
作为该任务范围内的共享文件区。只有 main flow 拥有 shared/，sub-flow 复用它。

---

## G9: 行为树是 Flow 的结构化计划与执行机制

<!--
@referenced-by kernel/src/types/process.ts — implemented-by — ProcessNode, Process, TodoItem
@referenced-by kernel/src/process/tree.ts — implemented-by — 节点 CRUD + appendAction
@referenced-by kernel/src/process/focus.ts — implemented-by — focus 光标移动规则
@referenced-by kernel/src/process/render.ts — implemented-by — 行为树文本渲染
@referenced-by kernel/src/flow/thinkloop.ts — implemented-by — 行为树 API 注入
@referenced-by kernel/src/context/builder.ts — referenced-by — 行为树渲染为 process 文本
@referenced-by kernel/web/src/features/ProcessView.tsx — rendered-by
@referenced-by docs/设计/async-messaging.md — extended-by — TodoList + 中断机制
-->

旧模型中，Flow 的执行线索是 Thread——一个递归的子线程结构。
新模型用**行为树（Process）**替代 Thread，提供更强大的计划与注意力管理能力。

### 行为树的本质

行为树是一种**结构化的 plan 机制**。Flow 可以：
- 一次性创建庞大的行为树，然后逐步执行
- 随时调整、修改行为树的结构
- 通过 focus 光标控制当前关注的节点

每个 Flow 对象拥有一个 `process.json`，记录完整的行为树结构和 focus 光标位置。

### Focus 光标与注意力控制

行为树的每个节点有状态：`[todo]`、`[doing]`、`[done]`。
**focus 光标**指向当前正在处理的节点。

**focus 移动规则**：
- 深度优先，优先处理 `[doing]` 节点，然后 `[todo]` 节点
- 依赖感知：如果节点有 `deps`（必须等待完成），且依赖未完成，跳过
- 完成回退：当前节点标记 `[done]` 后，回退到父节点，检查下一个子节点
- LLM 可以手动移动 focus

**栈进/栈出语义**：

栈进（focus 移到子节点）：
1. 子节点的详细 context 被加载（messages, actions）
2. 子节点配置的 trait 激活状态生效
3. 兄弟节点的详细 context 被折叠为一行摘要

栈出（子节点完成，回到父节点）：
1. 子节点的详细 context 被回收，替换为完成摘要
2. 父节点的 trait 激活配置恢复
3. 下一个兄弟节点的 context 开始加载

这就是 G5 中「结构化遗忘」的具体实现。

### 行为树节点与 Trait 激活

行为树的子节点**不能创建新的 traits**。Traits 只能基于 Stone 对象创建。
子节点能做的是：配置当前 Object 已有的哪些 traits 需要在该节点的 context 中激活。

### 约束

- 最大深度：20 层
- deps 语义：必须等待依赖节点完成后才能开始
- process.json 同时记录行为树结构和 focus 光标位置

---

## G10: 行动记录是不可变的事件历史

<!--
@referenced-by kernel/src/types/flow.ts — implemented-by — Action, ActionType
@referenced-by kernel/src/flow/flow.ts — implemented-by — recordAction
@referenced-by kernel/src/flow/thinkloop.ts — implemented-by — 记录 thought/program 事件
@referenced-by kernel/src/process/tree.ts — implemented-by — appendAction 挂载到节点
@referenced-by kernel/src/types/process.ts — referenced-by — actions 字段
@referenced-by kernel/web/src/features/ProcessView.tsx — rendered-by
-->

Flow 的每一次行动都被记录为一个不可变的事件：

| 事件类型 | 含义 |
|---------|------|
| thought | 一次思考输出 |
| program | 一段程序及其执行结果 |
| message_in | 收到一条消息 |
| message_out | 发出一条消息 |
| pause | 被暂停 |
| inject | 被注入内容 |

这些事件按时间顺序记录，构成 Flow 的完整行为历史。
行为树的每个节点拥有自己的 actions 列表，随 focus 的进出而加载/回收。

**推论**：Process 是对象的「传记」——它记录了对象做过的一切，
是反思、学习、审计的基础。

---

## G11: UI 是对象的面孔

<!--
@referenced-by kernel/src/server/server.ts — referenced-by — API 提供对象数据给前端
@referenced-by kernel/src/server/events.ts — referenced-by — SSE 实时推送
@referenced-by kernel/web/src/App.tsx — implemented-by — 前端整体布局
@referenced-by kernel/web/src/features/ObjectDetail.tsx — implemented-by — 对象详情页
@referenced-by kernel/web/src/features/ProcessView.tsx — implemented-by — 行为树可视化
@referenced-by kernel/web/src/features/IdentityTab.tsx — implemented-by
@referenced-by kernel/web/src/features/DataTab.tsx — implemented-by
@referenced-by kernel/web/src/features/TraitsTab.tsx — implemented-by
@referenced-by kernel/web/src/features/EffectsTab.tsx — implemented-by
@referenced-by kernel/web/src/features/FlowDetail.tsx — implemented-by
@referenced-by kernel/web/src/components/Sidebar.tsx — implemented-by
@referenced-by kernel/web/src/hooks/useSSE.ts — referenced-by
@referenced-by docs/设计/g11-frontend.md — extended-by
-->

对象的 `ui/` 目录是它的「面孔」——决定自己如何被人类看见。

UI 不是外部系统强加的展示方式，而是对象「自我表达」的一部分。
对象最了解自己的数据结构和功能，因此由对象自己决定如何呈现。

对象通过 `ui_template` kernel trait 获得编写 UI 的能力（方法 + 指导），
UI 文件本身存储在 `ui/index.tsx`——它与 readme.md（身份）、data.json（状态）平级，
是对象的顶层组成部分，不是某个 trait 的附属品。

前端通过扫描 `objects/*/ui/index.tsx` 动态加载每个对象的 UI。

---

## G12: 经验沉淀——对象如何从经历中学习

<!--
@referenced-by kernel/src/types/trait.ts — referenced-by — Trait 是经验沉淀的载体
-->

经验沉淀是 OOC 的学习机制，也是 trait 创建的主要路径之一（另见 G3 中 trait 的其他来源）。
在新模型中，沉淀路径是 **trait 的有机成长**：

**阶段 0：无 trait**
经验只存在于 actions 历史中。尚未被识别为值得沉淀的模式。

**阶段 1：只有 readme.md 的 trait**（知识）
对象「知道」这个经验。readme.md 在 trait 被激活时注入 context，影响 LLM 的思考。

**阶段 2：readme.md + index.ts 的 trait**（能力）
对象「会做」这件事。有了可调用的方法。
注意：index.ts 中的方法一旦存在就始终注册为可调用，不受激活状态影响。

**阶段 3：trait 成为核心思维的一部分**（直觉）
trait 的 `when` 变为 `always`，readme.md 中的内容从「知识」进化为「直觉」。
这个 trait 不再需要被「激活」——它已经是对象思维的一部分。

**关键区别**：旧模型的沉淀是「搬家」（从 windows/ 搬到 codes/ 再搬到 biases/），
新模型的沉淀是「成长」（trait 在原地从 readme-only 长出 index.ts，再进化为 always-on）。
trait 迭代时不保留旧版本，直接在原版本基础上修改——这是活的成长，不是版本归档。

**学习循环**：
经历 → 记录(G10) → 反思 → talkToSelf → SelfMeta 审视 → 沉淀为 trait(G12) → 结构化遗忘(G5/G9) → 更高效的思考

沉淀不是 Flow 直接写 Stone，而是通过 SelfMeta 的"自我对话"完成。
这保证了沉淀的质量——SelfMeta 会判断、合并、去重，避免 Self 数据膨胀。

---

## Sub-flow 机制

当一个 Stone 的 main flow 需要与其他 Stone 对象交互时，
在 main flow 的 `flows/` 子目录下创建对方的 sub-flow：

```
stones/blueprint/
└── effects/
    └── {task_id}/              # main flow (blueprint 自己的)
        ├── process.json         # 行为树 + focus
        ├── data.json
        ├── shared/              # 共享文件区（仅 main flow 创建该目录, 子 flow 复用）
        └── flows/
            ├── browser/         # sub-flow: browser 的完整 Flow 对象
            └── researcher/      # sub-flow: researcher 的完整 Flow 对象
```

关键约束：
- Sub-flow 是完整的 Flow 对象（拥有 process.json、data.json 等）
- 同一个 Stone 在同一个 main flow 树下只会有一个 flow 对象
- Sub-flow 的持久化目录在发起者的 effects 下（认知归属于发起者）
- Sub-flow 复用 main flow 的 shared/ 目录

---

## G13: 认知栈——对象的统一运行模型

<!--
@referenced-by kernel/src/flow/flow.ts — implemented-by — Flow 即忙碌的栈
@referenced-by kernel/src/process/focus.ts — implemented-by — focus 移动 = push/pop
@referenced-by kernel/src/trait/activator.ts — implemented-by — before 帧的 trait 激活
@referenced-by kernel/src/context/builder.ts — implemented-by — 作用域链 → Context
-->

对象的运行时本质是一个**认知栈（Cognitive Stack）**。

### 混合栈：过程与思维是同一帧的两面

传统设计将"做什么"（行为树）和"用什么来想"（Trait 系统）分开管理。
但认知的真实结构不是这样——**每一个行动步骤天然携带它需要的知识和思维方式**。

认知栈的每一帧同时包含过程和思维：

```
栈帧 4: [发现引用有误 | 文献检索经验]
栈帧 3: [引用一篇论文 | 那篇论文的内容]
栈帧 2: [写第三章 | 第三章领域知识]
栈帧 1: [写论文 | 学术写作规范]
栈帧 0: [存在 | Self + Kernel Traits]
```

这就是计算机的调用栈——每个 stack frame 同时包含指令指针（过程）和局部变量（数据/知识）。
从来没有人把它们分成两个栈。

### 对象 = 栈

- **Stone（静止态）** = 只有帧 0 的栈——身份和基础能力在那里，但没有动态帧
- **Flow（运行态）** = 帧 0 之上压入了动态帧的栈——正在做事
- **SelfMeta** = 帧 0 的维护者——其他 Flow pop 时把有价值的东西交给 SelfMeta，由它决定是否写入帧 0

G2 说 Stone 和 Flow 是两种形态。在栈模型里，它们不是两种东西——
**Stone 是空闲的栈，Flow 是忙碌的栈**。同一个栈，不同时刻。
SelfMeta 是帧 0 的守门人——普通 Flow 只能读帧 0，不能写；
想修改帧 0（Self），必须通过 `talkToSelf` 与 SelfMeta 对话。

### 作用域链

内层帧可以访问外层帧的内容，就像 JavaScript 的闭包：

- 帧 0（Self + Kernel Traits）对所有帧可见——这是"我是谁"
- 帧 N 的 traits 和 knowledge 对帧 N+1 可见
- 内层帧可以 shadow（覆盖）外层帧的同名内容

**Context（G5）不是"拼接"出来的，而是作用域链自然继承的。**
Context 就是从当前帧到帧 0 的所有可见内容的并集。

### before/after：非递归元认知帧

每个栈帧的 push/pop 伴随两个特殊的元认知帧：

```
push 栈帧 N:
  ├─ :before (元认知帧，不触发 hook)
  │    → 检查任务需要什么 traits → 激活
  │    → 加载相关 knowledge
  │    → 准备局部变量
  ├─ 主体执行 (正常帧，可以继续 push/pop)
  └─ :after (元认知帧，不触发 hook)
       → 这一帧有价值吗？→ 沉淀为 trait (G12)
       → 清理局部变量
       → 停用本帧激活的 traits
```

类比 CSS 伪元素：`:before` 是元素的一部分，但不是独立元素——
它不能再有自己的 `:before`。这天然解决了 hook 的无限递归问题。

before/after 的本质是**元认知**——不是"思考问题"，而是"思考如何思考"。
人类也有这个：开始做事前花一瞬间想"我需要什么"，做完后花一瞬间想"我学到了什么"。
但你不会对"我需要什么"再想"我需要什么来想我需要什么"——它天然终止。

**非递归不是工程限制，而是认知的真实结构。**

### 遗忘 = pop，智慧 = 帧 0 的厚度

- **遗忘**：栈帧 pop 时，该帧的局部信息退出 context。不是"丢失"，是"归位"。
- **经验沉淀（G12）**：pop 时如果该帧有价值，通过 `talkToSelf` 将其交给 SelfMeta，
  由 SelfMeta 审视后提炼为帧 0 的新 trait 或记忆。
  就像编译器的函数内联——调用太频繁的函数，直接展开到调用者里。
- **智慧**：新手需要 push 很多帧才能完成一件事；
  专家的帧 0 已经内联了大量经验，同样的事只需要很浅的栈。
  **智慧 = 帧 0 的厚度。**

### 对象间通信 = 跨栈的 push

A 给 B 发消息，本质是：A 的某一帧执行了一个操作，导致 B 的栈被 push 了一帧。
这就是 Actor Model（Carl Hewitt, 1973），也是 Alan Kay 的 Smalltalk 的本质。

### 统一效果

认知栈模型统一了六条基因的底层机制：

| 基因 | 在栈模型中的解释 |
|------|----------------|
| G2（Stone/Flow） | 空闲栈 vs 忙碌栈，SelfMeta = 帧 0 的守门人 |
| G3（Trait） | 帧的局部变量（思维部分） |
| G5（Context/遗忘） | 作用域链 + pop |
| G9（行为树） | 栈的 push/pop 结构 |
| G11（UI） | 帧 0 的外在表达 |
| G12（经验沉淀） | 高频帧通过 SelfMeta 内联到帧 0 |

---

## 基因树

```
G1 (万物皆对象)
 ├── G2 (Stone vs Flow) ── 对象的两种形态
 │    └── G4 (程序行动) ── Flow 如何行动
 │         └── G10 (事件历史) ── 行动的不可变记录
 ├── G3 (Trait 自我定义) ── 对象如何定义自身
 │    └── G5 (Context 与注意力) ── 思考的输入与结构化遗忘
 │         └── G9 (行为树) ── 计划与注意力控制
 ├── G6 (Relation 关系) ── 对象如何连接
 ├── G7 (持久化即存在) ── 对象如何存在
 ├── G8 (Effect 与 Space) ── 对象如何影响世界
 ├── G11 (UI 自我表达) ── 对象如何呈现自己
 ├── G12 (经验沉淀) ── 对象如何从经历中学习
 │    ├── 连接 G4 — 通过程序行动创建新 trait
 │    ├── 连接 G7 — trait 持久化到文件系统
 │    ├── 连接 G3 — 经验沉淀为 trait（G12 是 trait 创建的路径之一）
 │    └── 连接 G5 — 沉淀后通过行为树结构化遗忘
 └── G13 (认知栈) ── 对象的统一运行模型
      ├── 统一 G2 — Stone = 空闲栈，Flow = 忙碌栈
      ├── 统一 G3 — Trait = 栈帧的局部变量（思维部分）
      ├── 统一 G5 — Context = 作用域链，遗忘 = pop
      ├── 统一 G9 — 行为树 = 栈的 push/pop 结构
      └── 统一 G12 — 经验沉淀 = 高频帧内联到帧 0
```

从 G1 出发：
- 对象需要区分静态和动态 → G2（Stone/Flow）
- 对象需要定义自身 → G3（Trait 是自我定义的原子单位）
- 思考需要输入 → G5（Context 是认知边界，行为树控制注意力）
- 复杂任务需要计划 → G9（行为树是结构化的 plan + 注意力控制）
- 思考需要行动 → G4（通过程序行动）
- 行动需要记录 → G10（不可变事件历史）
- 对象需要连接 → G6（Relation 是认知记录）
- 对象需要存在 → G7（持久化目录是物理存在）
- 对象需要影响世界 → G8（Effect 定义三种影响方向）
- 对象需要表达自己 → G11（UI 是自我表达）
- 对象需要从经历中学习 → G12（经验沉淀：trait 的有机成长）
- 以上机制需要统一的运行模型 → G13（认知栈：混合栈 + 作用域链 + before/after）

---

## 分层解释执行网络

12 条 Gene 不是独立的规则列表。它们构成一个**分层解释执行网络**——
对象的每一次行动，都是从抽象到具体的逐层展开。

### 展开方向（抽象 → 具体）

```
Layer 0: Self (G1)       who_am_i = "我是一个研究员"
         │               最抽象的身份声明
         ▼
Layer 1: Traits (G3)     computable + talkable + plannable + reflective + ...
         │               身份展开为具体的思维方式和能力
         ▼
Layer 2: Plan (G9)       createPlan → [收集信息, 分析数据, 撰写报告]
         │               能力展开为具体的任务结构
         ▼
Layer 3: Step (G9)       focus → "收集信息"
         │               结构展开为具体的执行动作
         ▼
Layer N: Code (G4)       print(getData("source")); talk("helper", "请帮我查...")
                         动作展开为可直接执行的程序
```

每一层都是上一层的**解释执行**：Self 不知道怎么做事，Traits 告诉它怎么想；
Traits 不知道做什么，Plan 把任务拆成结构；Plan 不知道怎么执行，Step 聚焦到具体动作。
这和编译器的 lowering 同构：高级语言 → IR → 机器码。

### 回溯方向（具体 → 抽象）

展开网络有一个逆向路径——**反思与经验沉淀**（G12）：

```
执行结果 (G10)  →  自观察 (Mirror)  →  模式识别  →  沉淀为 Trait (G12)  →  回到 Layer 1
   具体的记录        看到自己在做什么     发现可复用的模式    抽象为新的能力        改变未来的展开
```

### 统一的解释器

虽然每一层有不同的数据结构（StoneData、TraitDefinition、Process、ProcessNode），
但真正的"解释器"只有一个：**LLM + Context（G5）**。

每轮 ThinkLoop，Context 把所有层投影到同一个平面：

| Context 区域 | 对应层 | 来源 |
|-------------|--------|------|
| SYSTEM (who_am_i) | Layer 0: Self | G1 |
| INSTRUCTIONS | Layer 1: Traits | G3 |
| PROCESS | Layer 2-N: Plan/Steps | G9 |
| ACTIONS | 执行现场 | G10 |
| KNOWLEDGE (mirror) | 自观察 | G5 + G12 |

LLM 同时看到所有层，一步完成从抽象到具体的展开。
这就是为什么 Context 是 OOC 的认知边界——它不只是"输入"，它是整个展开网络的运行时快照。

### Trait Hooks：层间转场的检查点

Trait 可以在展开网络的关键转场点声明 hooks：

| Hook | 转场 | 作用 |
|------|------|------|
| `before_finish` | 执行 → 完成 | 触发逆向回溯（反思、验证） |
| `before_wait` | 执行 → 等待 | 保存进度、验证中间产出 |
| `on_error` | 执行 → 失败 | 触发系统化调试 |

Hooks 利用 "Output 提示 > Bias prompt" 的发现（Exp-012），
将提示注入到 program output 而非 system prompt，确保 LLM 响应。

### 两个循环

```
展开循环（正向）：Self → Traits → Plan → Step → Code → Effect
沉淀循环（逆向）：Effect → Record → Mirror → Reflect → talkToSelf → SelfMeta → Self

合在一起：
G1 → G3 → G9 → G4 → G10
 ↑                      │
 └── G12 ←── G5/Mirror ─┘
      ↑
   SelfMeta (帧 0 守门人)
```

**G5（注意力/遗忘）和 G12（经验沉淀）构成了 OOC 的「学习循环」：**
经历 → 记录(G10) → 反思 → talkToSelf → SelfMeta 审视 → 沉淀为 trait(G12) → 结构化遗忘(G5/G9) → 更高效的思考

这就是 OOC 的全部规则。
G1-G12 定义了系统的各个方面，G13 提供了统一的运行模型——
认知栈将过程、思维、遗忘、学习统一到一个结构中。
所有更复杂的能力——自我进化、多视角思考、对象协作、人机协作——
都是以上基因的组合与涌现。
