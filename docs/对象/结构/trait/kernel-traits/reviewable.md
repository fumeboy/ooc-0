# kernel/reviewable — 两阶段代码审查

> 先验证合规性（做对了吗），再验证质量（做好了吗）。

## 基本信息

```yaml
name: kernel/reviewable
type: how_to_think
deps: [verifiable]
description: 两阶段审查：先验证合规性（做对了吗），再验证质量（做好了吗）
```

**deps: [verifiable]** — reviewable 依赖 verifiable。激活 reviewable 会自动激活 verifiable。

## 铁律

> **合规性先于代码质量。做对了比做好了重要。**

## 两阶段审查

### Stage 1：合规审查（做对了吗）

关注点：
- **需求符合度** — 代码实现了需求描述的行为吗？
- **约束遵守** — 没有违反项目规则（如"不用 any"、"必须有测试"）？
- **副作用范围** — 没有意外修改不相关的文件？
- **Breaking change** — 没有破坏已有接口的约定？

**Stage 1 不通过**，直接拒绝。不进入 Stage 2。

### Stage 2：质量审查（做好了吗）

关注点：
- **可读性** — 变量命名清晰？关键逻辑有注释？
- **结构** — 函数长度合理？层级不过深？
- **复用** — 有没有重复代码？有没有错过已有抽象？
- **性能** — 是否有明显低效的写法？
- **鲁棒性** — 边界条件、错误路径是否都处理？

Stage 2 给出**改进建议**，不阻塞通过（合规即可 merge）。

## 为什么分两阶段

常见审查问题：reviewer 盯着"代码好不好看"、"命名对不对"，反而忽略了"这段代码根本没实现需求"。

**合规 > 质量** 强制把注意力放在"有没有做对这件事"上。只有合规通过，才讨论质量。

## 何时激活 reviewable

典型场景：
- 代码 Commit 前自检
- 对同事 PR 的审查
- 重要架构变更的设计审核

通常由**另一个对象**（如 `code-reviewer` 角色）激活此 trait 后对代码做审查。

## 无 activates_on.show_content_when

reviewable 没有 `activates_on.show_content_when`。激活方式：
- 对象主动 `open(title="加载审查能力", type=trait, name=kernel/reviewable, description="查看审查指南")`
- 在 `supervisor` 或 `code-reviewer` 的 readme 中默认激活

## 源码锚点

| 概念 | 实现 |
|---|---|
| Trait 定义 | `kernel/traits/reviewable/TRAIT.md` |
| 依赖解析 | `kernel/src/trait/loader.ts` → 处理 `deps` 字段 |

## 与其他 trait 的组合

- **reviewable + verifiable** → 依赖关系。合规审查本身需要证据
- **reviewable + debuggable** → 审查发现问题后走调试流程

## 与基因的关联

- **G10**（行动记录不可变）— 审查结果作为 action 记录
- **G12**（经验沉淀）— 审查中发现的反模式可以沉淀为 trait
