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

