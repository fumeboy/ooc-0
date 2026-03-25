# Traits — Kernel Trait 设计

<!--
@ref .ooc/docs/哲学文档/gene.md#G3 — extends — Kernel Trait 的具体设计
@ref .ooc/docs/哲学文档/gene.md#G13 — references — 认知栈 before/after 帧驱动 Trait 自动激活
@referenced-by src/trait/loader.ts — implemented-by
@referenced-by src/trait/activator.ts — implemented-by
@referenced-by src/trait/registry.ts — implemented-by
-->

本文档是 kernel traits 的索引。每个 trait 的详细设计见 `traits/` 子目录。

Kernel traits 是 OOC 系统的基础能力层，所有 user object 自动继承。
User object 可以用同名 trait 覆盖 kernel 版本，不同名则自动合并。
Kernel traits 不需要序列化到 user object 的持久化目录。

---

## Kernel Trait 总览

| Trait | 职责 | when | 详细文件 |
|-------|------|------|----------|
| talkable | 对外通信：方法暴露、参数查询、消息收发 | always | [talkable.md](traits/talkable.md) |
| computable | 程序执行：沙箱运行、结果反馈 | always | [computable.md](traits/computable.md) |
| persistable | 持久化：对象的文件系统操作封装 | always | [persistable.md](traits/persistable.md) |
| planning | 行为树规划：分支策略、focus 管理 | always | [planning.md](traits/planning.md) |
| object_creation | 对象创建：创建新的 OOC 对象 | 当需要创建新对象时 | — |
| web_search | 互联网搜索：所有对象具备网络访问能力 | 当需要搜索互联网信息时 | — |
| ui_template | UI 编写：指导对象创建自己的面孔 | 当对象需要创建或更新 UI 时 | [ui_template.md](traits/ui_template.md) |
| reflective | 反思与经验沉淀：从行动历史中提取模式 | 当任务完成或遇到重复模式时 | [reflective.md](traits/reflective.md) |

> **G13 认知栈的影响**：在认知栈模型中，条件 trait 的激活不再依赖 LLM 手动调用 `activateTrait()`。
> 每个栈帧的 before 元认知帧会自动分析任务需要什么 traits 并激活，after 帧在 pop 时自动停用。
> `when: always` 的 kernel traits 始终在帧 0 中，天然对所有帧可见。

---

## Trait 结构

每个 trait 是一个目录，包含：
- `readme.md` — YAML frontmatter（name, description, when）+ 正文（知识、指导、思维方式）
- `index.ts` — 可调用的方法（可选）

readme.md 的正文会在 trait 激活时注入到对象的 context 中，影响 LLM 的思考。
index.ts 中的方法**始终注册为可调用**，不受激活状态影响。

---

## 设计原则

1. **最小化**：kernel trait 只提供所有对象都需要的基础能力
2. **可覆盖**：user object 可以用同名 trait 替换 kernel 版本
3. **无副作用**：kernel trait 的方法不应产生超出自身职责的副作用
4. **自文档化**：readme.md 既是 LLM 的认知输入，也是人类的设计文档
