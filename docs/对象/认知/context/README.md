# Context — 对象的全部世界

> G5：Context 是对象每次思考时看到的全部信息。
> **对象不知道 Context 之外的任何事情。Context 就是对象的全部世界。**

## 为什么 Context 这么重要

传统 Agent 的 context = 一段不断增长的 prompt。问题：
- 容量无限扩展，最终 OOM
- 无结构，LLM 难以定位关键信息
- 一次性，不同任务之间没有隔离

OOC 的 Context = **一个结构化的对象**，由 9 个字段组成，每个字段有明确来源和容量上限。

## 四个子领域

| 文档 | 内容 |
|---|---|
| [九大组成.md](九大组成.md) | Context 的 9 个字段各自的来源与语义 |
| [scope-chain.md](scope-chain.md) | 作用域链：沿线程树向上收集 |
| [三层记忆.md](三层记忆.md) | long-term / session / recent 三层记忆 |
| [pause.md](pause.md) | 人机协作检查点（暂停与恢复） |

## 九大组成概览

```
Context
├── whoAmI              ← stones/{name}/readme.md
├── instructions        ← 激活的 kernel trait 的 TRAIT.md（系统指令）
├── knowledge           ← 激活的 library/user trait 的 TRAIT.md（知识窗口）
├── parentExpectation   ← 线程树节点的 title + description
├── process             ← 当前线程的 actions 历史
├── inbox               ← 未读消息（含 messageId）
├── activeForms         ← FormManager 中的活跃 form 列表
├── directory           ← 对象的目录列表（包括 relations）
└── childrenSummary     ← 子线程完成摘要
```

## Context 的三个容量管理机制

### 1. 渐进式 Trait 加载（按需激活）

不是所有 trait 都始终注入。`command_binding` 驱动的按需激活让 Context 精简。
详见 [../../结构/trait/渐进式激活.md](../../结构/trait/渐进式激活.md)。

### 2. 三层记忆（时间维度压缩）

- **long-term**：永久保存（readme + memory.md）
- **session**：当前任务的笔记
- **recent**：最近 N 轮的完整记录

历史 actions 不全部注入——只有 recent 被完整保留，更早的会被压缩或遗忘。
详见 [三层记忆.md](三层记忆.md)。

### 3. Scope Chain（空间维度过滤）

线程树向上收集时，只有作用域内的 trait / 知识可见。子线程不会自动看到兄弟线程的 actions。
详见 [scope-chain.md](scope-chain.md)。

## Pause — 检查点机制

Engine 可以在 LLM 返回后、执行前暂停，让人类介入：

- 写出 `llm.input.txt`（本轮 Context）
- 写出 `llm.output.txt`（LLM 原始输出）
- 人工修改后恢复 → 读取 llm.output.txt 作为实际输出执行

详见 [pause.md](pause.md)。

## 源码锚点

| 概念 | 实现 |
|---|---|
| Context 构建 | `kernel/src/thread/context-builder.ts` |
| ContextData 类型 | `kernel/src/types/context.ts` |
| Scope Chain | `kernel/src/thread/tree.ts` |
| 三层记忆 | `kernel/src/thread/context-builder.ts`（各 memory 收集函数） |

## 与基因的关联

- **G5**（Context 即世界）— 本目录核心
- **G13**（线程树即运行模型）— Context 按线程构建
