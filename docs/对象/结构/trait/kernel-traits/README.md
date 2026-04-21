# Kernel Traits — 内置能力清单

> Kernel Traits 是所有对象共享的基础能力。它们定义了"作为 OOC 对象意味着什么"。

## 两层结构

Kernel Traits 分两层：

```
基座层（when: always）        ← 始终注入
  └── kernel/base             ← 指令系统基座

能力层（when: never）         ← 按需加载（command_binding 驱动）
  ├── kernel/computable       ← 代码执行
  ├── kernel/talkable         ← 对象间通信
  ├── kernel/reflective       ← 反思与沉淀
  ├── kernel/verifiable       ← 认识论诚实
  ├── kernel/plannable        ← 任务规划
  ├── kernel/debuggable       ← 系统化调试
  ├── kernel/reviewable       ← 代码审查
  ├── kernel/library_index    ← Library 资源查询
  └── kernel/object_creation  ← 创建新对象
```

## 基座层

**[base](base.md)** — 指令系统基座（四原语：`open`、`submit`、`close`、`wait`）。是唯一的 always trait。

## 能力层

按主要功能分组：

### 思考与执行

| Trait | 触发 command | 简述 | 详细 |
|---|---|---|---|
| **computable** | `program` | JavaScript 代码执行 + 沙箱 API | [computable.md](computable.md) |
| **plannable** | `think`, `set_plan` | 任务拆解、子线程规划（think 统一 fork/continue 子线程） | [plannable.md](plannable.md) |
| **debuggable** | (无 command_binding，手动激活) | 系统化调试四阶段流程 | [debuggable.md](debuggable.md) |
| **reviewable** | (无 command_binding) | 两阶段代码审查（合规 + 质量） | [reviewable.md](reviewable.md) |

### 交流与协作

| Trait | 触发 command | 简述 | 详细 |
|---|---|---|---|
| **talkable** | `talk`, `talk_sync`, `return` | 对象间消息传递 | [talkable.md](talkable.md) |
| **object_creation** | `think` | 创建新对象的指南 | [object-creation.md](object-creation.md) |

### 成长与诚实

| Trait | 触发 command | 简述 | 详细 |
|---|---|---|---|
| **reflective** | `return` | 经验沉淀、ReflectFlow 驱动 | [reflective.md](reflective.md) |
| **verifiable** | `return` | 没有验证就不做完成声明 | [verifiable.md](verifiable.md) |

### 资源查询

| Trait | 触发 command | 简述 | 详细 |
|---|---|---|---|
| **library_index** | `program` | 查询 Library 公共 trait 与 UI 组件 | [library-index.md](library-index.md) |

## 组合效应

Kernel Traits 单独看只是能力单元，组合起来定义了一个"合格的 OOC 对象"：

```
computable × talkable    = 能协作执行的智能体
computable × reflective  = 能从错误中学习的智能体
reflective × verifiable  = 不会把幻觉沉淀为经验的智能体
plannable × debuggable   = 会分解任务且会自查的智能体
完整组合                  = 最小可行的、能自我进化的 OOC 对象
```

## 激活策略

- **always**: 基座层（base）始终加载
- **never**: 能力层默认不加载，通过 `command_binding` 或 `open(type=trait)` 按需激活

`when: never` 不意味着"永不激活"——意思是"不主动加载"。实际上能力层 trait 被频繁激活，只是激活时机由 command_binding 或 LLM 主动触发。

## hooks 机制

部分 trait 定义了 hooks，在特定时机注入提示：

- `reflective.when_finish` — 结束任务前提示"回顾学到了什么"
- `verifiable.when_finish` — 结束前提示"提供验证证据"
- `debuggable.when_error` — 遇到错误时提示"按四阶段调试"

这些 hooks 由 Engine 在对应事件触发时注入 Context。

## 源码锚点

| 概念 | 路径 |
|---|---|
| 所有 kernel traits | `kernel/traits/` |
| trait 加载 | `kernel/src/trait/loader.ts` |
| command_binding 处理 | `kernel/src/thread/hooks.ts` |

## 与基因的关联

- **G3**（trait 是自我定义）— kernel traits 是系统提供的"自我定义词汇表"
- **G12**（经验沉淀）— reflective + verifiable 是沉淀机制的核心
- **G13**（线程树即运行模型）— 所有 kernel traits 的激活由线程树调度
