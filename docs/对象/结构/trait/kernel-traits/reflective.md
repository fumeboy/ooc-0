# kernel/reflective — 反思与沉淀

> 没有 reflective，对象不会成长。

## 基本信息

```yaml
name: kernel/reflective
type: how_to_think
when: never
activates_on:
  paths: [return]
description: 经验结晶与自我反思，SuperFlow 驱动的持续学习
```

## 核心能力

reflective 提供**沉淀通道**：让对象在任务结束时把有价值的经验写回 Self。

三种沉淀方式：

```typescript
talk({ target: "super", content: "请记住：用 try/catch 包裹 LLM 调用会阻断 failure_to_success sedimentation" })
// → 写入 Self memory.md

talk({ target: "super", content: "请保存：key=preferred_model, value=glm-5.1" })
// → 更新 Self data.json

talk({ target: "super", content: "请沉淀为 trait：..." })
// → SuperFlow 可能创建新的 stone trait
```

`talk(target="super")` 经由 `world.ts` 的 onTalk 特判路由到 SelfMeta（对象的常驻反思子对象）。SelfMeta 审视后决定是否真正沉淀。

## when_finish hook

reflective 定义了 `when_finish` hook——当对象准备 return（结束线程）时，自动注入提示：

```
在结束任务前，请花一轮思考回顾：
1. 这个任务中你学到了什么新东西？
2. 有什么值得长期记住的？用 talk(target="super") 告诉你的 SuperFlow：
   - 重要的事实或经验 → talk(target="super", content="请记住：...")
   - 需要持久化的数据 → talk(target="super", content="请保存：key=..., value=...")
   - 可复用的行为模式 → talk(target="super", content="请沉淀为 trait：...")
3. 需要更新会话记忆（updateSessionMemory）吗？
4. 请用 updateFlowSummary 写一句话摘要。
```

这让"反思"成为**每次任务的默认尾声**，而不是需要主动记起的额外步骤。

## 子 Trait

```
kernel/reflective/
├── memory_api           ← 记忆 API（Flow Summary, Self/Session）
└── super                ← SuperFlow 角色定义
```

### memory_api

定义三种记忆层级：
- **Flow Summary** — 一句话摘要，用于 Session 首页展示
- **Session Memory** — 当前会话的笔记（flows/{sid}/memory.md）
- **Self Memory** — 长期记忆（stones/{name}/memory.md）

只有通过 talk(target="super") 才能写 Self Memory；其他两个 Flow 可以直接写。

### super

定义 SuperFlow 作为一个对象角色应该如何工作：
- 收到 talk(target="super") 消息后如何判断"值得沉淀吗"
- 如何写 readme / data / memory / traits
- 何时创建新 trait（用户指令 vs 自动判断）

## 沉淀循环

reflective 是沉淀循环的入口：

```
经验（thread.json actions）
  → talk(target="super") 调用
  → SelfMeta 审视
  → 选择性写入 readme / data / memory / traits
  → 下次任务 Context 中身份/能力已改变
```

详见 [../../../成长/反思机制/](../../../成长/反思机制/) 和 [../../../哲学/两个循环.md](../../../哲学/两个循环.md)。

## 与其他 trait 的组合

- **reflective + verifiable** → 不把幻觉沉淀为经验（沉淀前必须有验证证据）
- **reflective + plannable** → 规划经验可以沉淀为新的 trait

## 源码锚点

| 概念 | 实现 |
|---|---|
| Trait 定义 | `kernel/traits/reflective/TRAIT.md` + 子目录 |
| when_finish hook 处理 | `kernel/src/thread/engine.ts` / `hooks.ts` |
| SuperFlow 运行 | 作为特殊 Flow，机制同普通 Flow |
| talk(target="super") 路由 | `kernel/src/world/world.ts` 的 onTalk 特判，落盘到 `stones/{fromObject}/super/` |

## 与基因的关联

- **G12**（经验沉淀）— 本 trait 是 G12 的核心工程实现
- **G10**（行动记录不可变）— 反思材料来自 actions 历史
