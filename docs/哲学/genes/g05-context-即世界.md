## G5: Context 是对象每次思考时看到的全部信息

<!--
@referenced-by kernel/src/types/context.ts — implemented-by — Context, ContextWindow, WindowConfig
@referenced-by kernel/src/context/builder.ts — implemented-by — buildContext 构建
@referenced-by kernel/src/context/formatter.ts — implemented-by — Context → LLM prompt
@referenced-by kernel/src/process/focus.ts — implemented-by — 结构化遗忘（栈进/栈出）
@referenced-by kernel/src/process/render.ts — implemented-by — focus 路径详细、其余摘要
@referenced-by kernel/src/types/process.ts — implemented-by — focus 光标驱动遗忘
@referenced-by kernel/src/knowledge/activator.ts — referenced-by — KnowledgeRef 决定 context 注入内容
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

