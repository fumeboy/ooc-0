# Trait — 对象的自我立法

> G3：Trait 是对象的**自我定义单元**。不是外部赋予的功能，而是对象定义"我如何思考、我遵守什么规则"。

## 核心特性

Trait 有三个基本特性：

1. **可组合** — 多个 trait 叠加形成复合能力（computable × talkable = "能协作执行"）
2. **可进化** — 从 readme-only → always-on → 内化为直觉（G12 成长路径）
3. **自约束** — trait 可以限制对象的行为边界（如 verifiable："没有验证就不做完成声明"）

## 子领域

| 文档 | 内容 |
|---|---|
| [定义结构.md](定义结构.md) | TraitDefinition 的字段与语义（含 namespace/kind/双方法通道） |
| [树形与分级加载.md](树形与分级加载.md) | 树形嵌套 + 三层 Progressive Disclosure |
| [加载链路.md](加载链路.md) | kernel → library → stone(trait + view) 四层加载与覆盖 |
| [渐进式激活.md](渐进式激活.md) | command_binding 驱动的按需激活 |
| [方法注册.md](方法注册.md) | MethodRegistry 三元键 + callMethod 沙箱协议 |
| [../../人机交互/自渲染.md](../../人机交互/自渲染.md) | Views：kind=view 的 Trait（UI + ui_methods） |
| [kernel-traits/](kernel-traits/) | 内置 Kernel Traits 清单 |

## 核心区分

### Trait vs Plugin vs Tool

| 概念 | OOC 术语 | 特点 |
|---|---|---|
| **Tool** | 指令（command） | 对象可以调用的原子操作（open/submit/close/talk 等） |
| **Trait** | 能力单元 | 一组相关的知识 + 方法，可组合加载 |
| **Skill** | 技能（按需加载） | 独立的 markdown 内容，open(type=skill) 时加载 |

Trait 是**知识 + 方法 + 约束**的打包。Tool 是 Trait 暴露出来的可调用操作。

## 三层加载策略

Trait 的激活不是"全部加载"或"按需加载"的二元选择，而是**三级渐进**：

```
Level 1 ── 精简注入（always-on 父 trait 的精简 TRAIT.md）
Level 2 ── 子 trait 描述可见（active 父 trait 的子 trait 一行描述）
Level 3 ── 按需激活（open(type=trait) 或 command_binding 加载完整内容）
```

这让 Context 只注入"当前必需"的知识，避免巨大的系统提示词。

详见 [树形与分级加载.md](树形与分级加载.md)。

## 命名规范（2026-04-21 更新）

Trait 的唯一标识 **traitId = `${namespace}:${name}`**（冒号分隔；`namespace ∈ {kernel, library, self}`）：

```
kernel:base                         ← Kernel trait
kernel:computable                   ← Kernel trait
kernel:computable/file_ops          ← kernel:computable 的子 trait（name 含 / 分级）
kernel:talkable/ooc_links           ← kernel:talkable 的子 trait
library:lark/doc                    ← Library trait
self:reporter                       ← 对象私有 trait
self:main                           ← 对象的 View（kind=view）
```

**省略 namespace**（在 deps / callMethod 入口等处可用）：
- 查找顺序固定 `self → kernel → library`，取第一个命中
- 例：`callMethod("computable", "readFile", { path })` → 优先找 `self:computable`，其次 `kernel:computable`

## 双方法通道（2026-04-21 引入）

每个 trait 可导出两张方法表，严格隔离：

| 通道 | 来源 | 可被调用 |
|---|---|---|
| `llm_methods` | `index.ts` / `backend.ts` 导出 | LLM 沙箱内 `callMethod(traitId, method, args)` |
| `ui_methods` | 同上 | 前端 HTTP `POST /api/flows/:sid/objects/:name/call_method` |

详见 [方法注册.md](方法注册.md) 和 [../../人机交互/自渲染.md](../../人机交互/自渲染.md)。

## Kernel Traits 两层结构

内置的 Kernel Traits 分两层：

- **基座层**（when: always）— 始终注入，目前只有 `kernel/base`
- **能力层**（when: never，command_binding 驱动）— 按需加载

详见 [kernel-traits/README.md](kernel-traits/README.md)。

## 与其他概念的关系

- Trait 定义了对象的**能力**（"做什么")
- 具体**行动**通过 trait 暴露的指令进行（[../../认知/指令系统/](../../认知/指令系统/)）
- trait 的**沉淀**（readme-only → always-on）由 SuperFlow 驱动（[../../成长/反思机制/](../../成长/反思机制/)）

## 源码锚点

| 概念 | 实现 |
|---|---|
| Trait 类型 | `kernel/src/types/trait.ts` |
| 加载器 | `kernel/src/trait/loader.ts` |
| 方法注册 | `kernel/src/trait/registry.ts` |
| 激活/卸载 | `kernel/src/thread/tree.ts` → `activateTrait` / `deactivateTrait` |
| command 关联 | `kernel/src/thread/hooks.ts` → `collectCommandTraits` |

## 与基因的关联

- **G3**（trait 是自我定义单元）— 本章核心
- **G12**（经验沉淀）— trait 的演化路径：从 readme-only 到直觉
- **G13**（线程树即运行模型）— trait 的激活范围由线程树 scope chain 决定
