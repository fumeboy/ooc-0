# kernel/verifiable — 认识论诚实

> 没有 verifiable，对象会自欺。

## 基本信息

```yaml
name: kernel/verifiable
type: how_to_think
when: never
activates_on:
  paths: [return]
description: 证据先于结论，完成前必须运行验证，禁止凭记忆声称通过
```

## 铁律

> **没有新鲜的验证证据，不做任何完成声明。**

违反这条规则的字面意思就是违反它的精神。没有例外、没有捷径、没有"我很确定"。

## when_finish hook（验证门禁）

verifiable 定义了最严格的 hook：任何时候对象要 `return`，系统先注入三个问题：

```
[验证门禁] 你即将声明完成。回答以下问题：
1. 你运行了什么验证命令？（必须是本轮执行的，不是之前的）
2. 输出是什么？（引用具体输出，不是"测试通过了"）
3. 输出是否支持你的结论？

如果任何一项答不上来，先运行验证再 [finish]。
```

这迫使对象在 return 之前，要么：
- 确实运行了验证（有代码、有输出、有具体结果）
- 或者诚实承认"我没验证，但我认为..."

## 为什么需要这个

LLM 有一个常见缺陷：**凭记忆声称完成**。

典型案例：
- 改了代码，记得以前类似场景测试通过 → 声称测试通过（没跑新代码）
- 改了配置，相信 LLM 理解是对的 → 声称配置正确（没跑验证）
- 改了多处，用"大概率"推断 → 声称整体完成（没全量测试）

这些行为把**未经验证的判断**沉淀为**经验**，让对象越来越相信自己的幻觉。

verifiable 的 when_finish hook 就是给"完成"之前加一道门。不通过门禁的 return 会被拦下。

## 与 reflective 的配合

reflective 和 verifiable **都** activates_on.paths 含 `return`。二者配合：

```
open(command=return)
  ├── 激活 talkable（如何传递结果）
  ├── 激活 reflective（沉淀有价值的经验）
  └── 激活 verifiable（证据门禁）
```

`verifiable.when_finish` 的 `once: true`——每个 return 周期只注入一次。
`reflective.when_finish` 的 `once: false`——每一轮都提醒。

## 子 Trait

verifiable 目前没有子 trait。它的语义足够简单——"有证据再说完成"。

## 源码锚点

| 概念 | 实现 |
|---|---|
| Trait 定义 | `kernel/traits/verifiable/TRAIT.md` |
| Hook 注入 | `kernel/src/thread/hooks.ts` |
| once 语义 | `kernel/src/thread/engine.ts` |

## 与其他 trait 的组合

- **verifiable + computable** → 有能力运行验证，也有义务
- **verifiable + reflective** → 不把未验证的结论沉淀为经验（G12 的健康前提）

## 与基因的关联

- **G12**（经验沉淀）— 沉淀的前置条件是真实
- **G10**（行动记录不可变）— 验证命令的输出作为不可改的证据
