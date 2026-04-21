<!--
@ref docs/哲学文档/meta.md — extends — 子树 5 Trait 架构
@ref docs/哲学文档/gene.md#G3 — implements — Trait 自我定义单元升级
@ref docs/哲学文档/gene.md#G13 — references — 认知栈作用域链（activateTrait 已实现）
@ref kernel/src/trait/loader.ts — designs — frontmatter description 解析
@ref kernel/src/context/builder.ts — designs — progressive disclosure 注入
-->

# Trait 架构升级 — 吸收 Superpowers 精华

## 背景

研究了 [superpowers](https://github.com/obra/superpowers) 的 13 个 skills 和 skill-creator 框架后，
发现 OOC trait 系统与 superpowers skill 系统高度同构，但缺少两类能力：

1. **机制层**：context 效率（全量注入 vs 分层加载）
2. **内容层**：工程纪律类 trait（验证、调试、测试、审查的编码化约束）

注：运行时按需激活（`activateTrait`）已在 `kernel/src/flow/thinkloop.ts` 中实现，
存储在 `node.activatedTraits`，`computeScopeChain` 已合并。本 spec 不重复设计。

核心洞察：superpowers 最有效的模式不是流程图，而是**反合理化表**（rationalization → counter）。
每个 skill 列出 agent 会尝试的偷懒借口并显式禁止。这个模式应成为 OOC trait 的标准结构。

---

## Part 1: Trait 机制升级 — Progressive Disclosure

**问题**：4 个 always-on kernel trait（computable 13KB + talkable 8.6KB + reflective 6.5KB + verifiable 1.5KB）占 ~30KB context。

**方案**：新增 `description` frontmatter 字段，分层注入。

**TraitDefinition 类型变更**：
```typescript
interface TraitDefinition {
  name: string;
  when: TraitWhen;
  description: string;  // 新增：一行摘要，~50字
  readme: string;
  methods: TraitMethod[];
  deps: string[];
  hooks?: { [K in TraitHookEvent]?: TraitHook };
}
```

**Frontmatter 示例**：
```yaml
---
when: always
description: "思考-执行循环核心 API，Program 语法和方法定义"
---
```

**注入策略**：

所有已加载 trait 的 description 组成 trait catalog，作为 knowledge window 注入：

```
## Available Traits
- [active] computable: 思考-执行循环核心 API，Program 语法和方法定义
- [active] talkable: 对象间通信协议，talk/delegate/reply
- plannable: 任务拆解和行为树规划能力
- testable: TDD 红绿重构循环
- reviewable: 两阶段代码审查
```

完整 readme 只在 trait 被激活且处于 focus 路径时注入。

没有 description 的 trait fallback 到注入完整 readme（向后兼容）。

**文件变更**：
- `kernel/src/types/trait.ts` — TraitDefinition 新增 description 字段
- `kernel/src/trait/loader.ts` — 从 frontmatter 解析 description
- `kernel/src/context/builder.ts` — 构建 trait catalog window，focus trait 注入完整 readme
- `kernel/src/context/formatter.ts` — 可能需要新增 trait catalog 渲染区域

**always-on trait 与 progressive disclosure 的交互**：

`when: always` 的 trait 也遵循 progressive disclosure：
- 始终在 trait catalog 中显示（标记 `[active]`）
- 只有当 trait 处于 focus 路径时才注入完整 readme
- "focus 路径"定义：scope chain 中显式声明的 trait，或 focus 节点的 `activatedTraits`
- 对于 `when: always` 但不在 focus 路径的 trait（如 reflective 在编码任务中），只注入 description

这意味着 computable 和 talkable 在大多数场景下仍会注入完整 readme（因为几乎所有节点都需要它们），
但 reflective、verifiable 等在非相关场景下只占一行 description。

**注**：`activateTrait(name)` 运行时激活已在 `kernel/src/flow/thinkloop.ts:1290` 实现，
存储在 `node.activatedTraits`，`kernel/src/process/cognitive-stack.ts:33-35` 的 `computeScopeChain` 已合并。
本 spec 不重复设计此功能。

---

## Part 2: 现有 Kernel Traits 增强

### 2a. `verifiable` — 吸收 verification-before-completion

**来源**：superpowers/verification-before-completion

**当前状态**：只有一行 hook 提示。

**增强**：
- hook 升级为验证门禁（3 个必答问题）
- readme 新增反合理化表
- 新增 description

```yaml
---
when: always
description: "证据先于结论。完成前必须运行验证，禁止凭记忆声称通过。"
hooks:
  when_finish:
    inject: |
      [验证门禁] 你即将声明完成。回答以下问题：
      1. 你运行了什么验证命令？（必须是本轮执行的，不是之前的）
      2. 输出是什么？（引用具体输出，不是"测试通过了"）
      3. 输出是否支持你的结论？
      如果任何一项答不上来，先运行验证再 [finish]。
---
```

反合理化表：

| 借口 | 现实 |
|---|---|
| "我刚才已经验证过了" | 代码可能在验证后又改了。重新运行。 |
| "这个改动太小不需要验证" | 小改动引入的 bug 最难发现。 |
| "测试通过了" | 引用具体输出。"通过了"不是证据。 |
| "我很确定这是对的" | 确定性不是证据。运行验证。 |

### 2b. `debuggable` — 吸收 systematic-debugging

**来源**：superpowers/systematic-debugging

**增强**：readme 重写为 4 阶段调试流程 + 反合理化表。

四阶段：
1. **根因调查** — 收集证据，对比 working vs broken，禁止在理解根因前改代码
2. **假设形成** — 基于证据提出 1-3 个可证伪假设
3. **最小验证** — 一次只测一个假设
4. **修复** — 先写失败测试复现 bug，再修复

反合理化表：

| 借口 | 现实 |
|---|---|
| "我知道问题在哪，直接修" | 你猜的。先收集证据。 |
| "试试这个改动看看" | 随机修改不是调试。先理解根因。 |
| "重启/清缓存就好了" | 这是绕过，不是修复。根因还在。 |
| "改了 3 次还不行，换个方案" | 3 次失败说明你不理解根因。回到 Phase 1。 |

### 2c. `plannable` — 吸收 brainstorming + writing-plans

**来源**：superpowers/brainstorming + writing-plans

**增强**：readme 重写为规划纪律 + 任务拆解规范 + 反合理化表。

核心纪律：
- 超过 3 步的任务先拆解再动手
- 拆解粒度：每个子任务 2-5 分钟可完成
- 每个子任务有明确验证标准
- 行为树节点 title 动词开头，子节点按依赖排序

反合理化表：

| 借口 | 现实 |
|---|---|
| "这个很简单不需要规划" | 简单任务是未检查假设最多的地方。 |
| "我边做边想" | 边做边想 = 边做边返工。 |
| "先写代码再重构" | 先写错再改 ≠ 规划。 |

---

## Part 3: 新增 Kernel Traits

### 3a. `testable` — 吸收 test-driven-development

**来源**：superpowers/test-driven-development

```yaml
---
when: 当任务涉及编写或修改代码时
description: "RED-GREEN-REFACTOR 循环。测试先于代码，失败先于通过。"
deps: [verifiable]
hooks:
  before:
    inject: "提醒：如果你要写代码，先写测试。先看到测试失败。"
---
```

核心流程：RED（写失败测试）→ GREEN（最小代码通过）→ REFACTOR（清理，测试仍通过）

反合理化表：

| 借口 | 现实 |
|---|---|
| "先写代码再补测试" | 补的测试只验证你写了什么，不验证该写什么。 |
| "这个函数太简单不需要测试" | 简单函数组合出复杂 bug。 |
| "测试会拖慢速度" | 没测试的代码拖慢的是调试速度。 |
| "测试立刻通过了" | 从未失败的测试证明不了任何事。 |

### 3b. `reviewable` — 吸收 requesting/receiving-code-review

**来源**：superpowers/requesting-code-review + receiving-code-review

```yaml
---
when: 当完成一个功能或修复后，需要审查质量时
description: "两阶段审查：先验证合规性（做对了吗），再验证质量（做好了吗）。"
deps: [verifiable]
---
```

两阶段：
1. **合规审查** — 对照需求逐项检查，每个需求点是否实现且测试
2. **质量审查** — 可读性、边界情况、性能安全、是否过度工程

反合理化表：

| 借口 | 现实 |
|---|---|
| "代码能跑就行" | 能跑 ≠ 正确。审查发现的是你没想到的。 |
| "我自己审查过了" | 自己审查自己 = 确认偏误。 |
| "这次改动太小不需要审查" | 小改动的审查成本也小。没理由跳过。 |

---

## 不纳入的 Superpowers 模式

| 模式 | 原因 |
|---|---|
| dispatching-parallel-agents | OOC 的 delegate() 已覆盖 |
| subagent-driven-development | OOC 的对象协作已覆盖 |
| using-superpowers | 元技能，OOC 用 trait catalog 替代 |
| writing-skills | 映射到 reflective trait 的经验结晶 |
| skill-creator eval loop | 当前 trait 数量少，手动验证够用，后续再引入 |

---

## 实现优先级

1. **P0**: Progressive disclosure（description 字段 + 分层注入）— 立即降低 context 开销
2. **P0**: verifiable 增强 — 最高 ROI 的纪律约束
3. **P1**: debuggable、plannable 增强 — 重写 readme，保留现有 API 示例
4. **P2**: 新增 testable、reviewable — 新 trait 文件

## 标准约定

- 反合理化表统一标题：`## 常见的合理化借口`
- 列头统一：`借口 | 现实`
- 每个 kernel trait 必须包含 `description` frontmatter 字段
- 增强现有 trait 时保留原有的 API 使用示例和实操指导
