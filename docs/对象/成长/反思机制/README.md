# 反思机制

> 沉淀不是自动的。需要一个**反思者**来决定"什么值得沉淀"。这个反思者就是 **ReflectFlow**。

## 两个文档

| 文档 | 内容 |
|---|---|
| [reflect-flow.md](reflect-flow.md) | ReflectFlow 作为对象的常驻反思子对象 |
| [沉淀循环.md](沉淀循环.md) | 完整的沉淀循环：经历 → 记录 → 反思 → 沉淀 |

## 核心思想

### 沉淀 = 一次自我对话

G2 里描述过 SelfMeta：**维护 Self 长期数据的常驻 Flow**。

`reflect("请记住 X")` 并不是"直接把 X 写进 memory"。它是：

```
对象向 SelfMeta 发一条消息："请记住 X"
  ↓
SelfMeta 收到消息，用 LLM 判断：
  - 值得沉淀吗？（vs 已经知道 / 未经验证 / 太琐碎）
  - 沉淀到哪里？（memory.md / readme.md / 新 trait）
  - 沉淀形式？（原话 / 抽象提炼）
  ↓
SelfMeta 决定：写或不写
```

这个设计的哲学意义：**反思不是机械的数据搬运，而是一次自我对话**。

## 为什么反思需要"另一个视角"

如果对象直接写自己的 readme：
- **容易美化**（"我这次很成功"）
- **容易偏见**（把偶然成功当作规律）
- **容易冲动**（单次失败就推翻整个身份）

SelfMeta 是**同一个对象的另一个 Flow**——共享身份，但在另一个会话里。它可以**冷静地审视**主 Flow 的请求，做出更审慎的判断。

类比：人类睡眠后醒来，发现昨天的想法没那么重要了——时间距离让你审慎。SelfMeta 扮演这个"昨晚睡了一觉"的角色。

## 反思的触发

| 触发 | 机制 |
|---|---|
| 主 Flow 主动 `reflect(...)` | 立即发消息给 SelfMeta |
| 主 Flow return 前（reflective.when_finish） | 系统提示 LLM 考虑反思 |
| 定期检视（可选） | SelfMeta 自发审视最近的 actions |

## 反思的产物

反思可能产生：

1. **写 memory.md** — 新增一条记忆
2. **写 readme.md** — 改写身份说明（罕见，需要深思熟虑）
3. **新增 trait** — 把一个能力沉淀为 trait
4. **升级 trait** — 把 `when: never` 改为 `when: always`（能力 → 直觉）
5. **什么都不写** — 判断为"不值得"

"什么都不写"是**最常见**的产物——大部分经历是琐碎的，不值得永久记录。

## 反思的谨慎

`verifiable.when_finish` 在 return 前强制验证。ReflectFlow 也应该守住**"没有验证就不沉淀"**的底线：

```
reflect("请记住：X 方法总是有效")
  ↓
SelfMeta 审视：
  - 用过多少次？
  - 每次都有验证证据？
  - 没有反例？
  ↓
如果缺乏证据：
  拒绝沉淀，或弱化为"X 方法在 Y 条件下有效"
```

## 反思与遗忘

反思不只决定"记什么"，也决定"忘什么"。

当旧的 trait 不再有效（实验证明它导致错误），反思可能**删除或降级**它：

```
trait "always_use_try_catch_around_llm" 被证明阻止了 failure_to_success sedimentation
  ↓
reflect("请移除这个 trait")
  ↓
SelfMeta 审视：
  - 有证据吗？（verifiable 验证过）
  - 影响范围？（仅 LLM 调用）
  ↓
删除或禁用该 trait
```

这让对象**可以退化**（用更中性的词：回归）——放弃曾经沉淀但后来证明不对的经验。详见 [../遗忘.md](../遗忘.md)。

## 与其他维度的关系

- **认知**（thinkloop）：反思**使用** thinkloop——SelfMeta 也是 Flow，也跑 ThinkLoop
- **合作**（消息）：reflect() 是一次 talk 到 SelfMeta
- **存在**（readme + trait）：反思的产物是对象自身结构的改变

## 源码锚点

| 概念 | 实现 |
|---|---|
| reflective trait | `kernel/traits/reflective/` |
| reflect() API | `kernel/traits/reflective/memory_api/` |
| SelfMeta Flow | 作为特殊 Flow，机制同普通 Flow |
| Stone 写入路径 | `kernel/src/persistence/writer.ts` |

## 与基因的关联

- **G12**（经验沉淀）— 反思是沉淀的驱动器
- **G2**（Stone 与 Flow）— SelfMeta 是 Stone 的"第二 Flow"
