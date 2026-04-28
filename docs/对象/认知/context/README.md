# Context — 对象的全部世界

> G5：Context 是对象每次思考时看到的全部信息。
> **对象不知道 Context 之外的任何事情。Context 就是对象的全部世界。**

## 为什么 Context 这么重要

传统 Agent 的 context = 一段不断增长的 prompt。问题：
- 容量无限扩展，最终 OOM
- 无结构，LLM 难以定位关键信息
- 一次性，不同任务之间没有隔离

OOC 的 Context = **一组结构化信息窗口 + 一条 process events 消息流**。信息窗口放入 system prompt，process events 作为独立 LLM messages 输入。

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
├── creator             ← thread creator：user、外部对象，或自己在另一个线程中的过程
├── processEvents       ← 当前线程的 process events 历史（独立 messages）
├── inbox               ← 未读消息（含 messageId）
├── activeForms         ← FormManager 中的活跃 form 列表
├── directory           ← 对象的目录列表（包括 relations）
└── childrenSummary     ← 子线程完成摘要
```

## LLM Input 拆分

每轮 LLM 输入分两层：

1. **system prompt：`<context>` 信息窗口**
   - identity / instructions / knowledge
   - task / creator / plan / inbox / activeForms / directory / relations / status
   - 这些信息描述“当前世界长什么样”，不再混入完整历史。
2. **process event messages：上下文变化历史**
   - `llm_interaction`：LLM 交互过程，例如 `message_in`、`message_out`、`text`、`tool_use`
   - `context_change`：上下文变化提示，例如 `inject`、`program`、`plan`、`create_thread`、`thread_return`

这样做接近 Claude Code / Codex 的输入组织方式：稳定规则和状态由 system/developer 层承载，历史交互作为可裁剪的 transcript/messages 进入模型。

## Context 的三个容量管理机制

### 1. 渐进式 Trait 加载（按需激活）

不是所有 trait 都始终注入。`activates_on.show_content_when` 驱动的按需激活让 Context 精简。
详见 [../../结构/trait/渐进式激活.md](../../结构/trait/渐进式激活.md)。

### 2. 三层记忆（时间维度压缩）

- **long-term**：永久保存（readme + memory.md）
- **session**：当前任务的笔记
- **recent**：最近 N 轮的完整记录

历史 process events 不全部注入——只有 recent 被完整保留，更早的会被压缩或遗忘。
详见 [三层记忆.md](三层记忆.md)。

### 3. Scope Chain（空间维度过滤）

线程树向上收集时，只有作用域内的 trait / 知识可见。子线程不会自动看到兄弟线程的 events。
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
| Context 构建 | `kernel/src/thinkable/context/builder.ts` |
| LLM Messages 构造 | `kernel/src/thinkable/context/messages.ts` |
| Context 类型 | `kernel/src/thinkable/context/builder.ts` |
| Scope Chain | `kernel/src/thinkable/thread-tree/tree.ts` |
| 三层记忆 | `kernel/src/thinkable/context/builder.ts`（各 memory 收集函数） |

## 与基因的关联

- **G5**（Context 即世界）— 本目录核心
- **G13**（线程树即运行模型）— Context 按线程构建
