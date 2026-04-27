# 结构 — 对象由什么组成

> 对象不是原子的。它由若干组件构成，每个组件回答一个"对象有什么"的问题。

## 结构总览

```
身份（G1） ── 我是谁？
  ├── thinkable.who_am_i   — 内在自我
  └── talkable.who_am_i    — 外在自我

数据（G1） ── 我当前在处理什么？
  └── data.json            — 动态键值对

能力（G3） ── 我能做什么？
  └── trait                — 可组合、可进化、自约束

关系（G1, G6） ── 我与谁相关？
  └── relation             — 有向连接、局部知识
```

## 四个组件

| 组件 | 回答的问题 | 详细 |
|---|---|---|
| **身份** | 我对自己的认知 | [身份.md](身份.md) |
| **数据** | 我当前持有的动态信息 | [数据.md](数据.md) |
| **能力** | 我能做的事，以及如何做 | [trait/](trait/) |
| **关系** | 我与其他对象的连接 | [关系/](关系/) |

## 核心主张

### 1. 身份是双面的（G1）

对象对自己有两种认知：
- **对内**（`thinkable.who_am_i`）— 完整的自我说明，仅自己可见
- **对外**（`talkable.who_am_i`）— 简短介绍 + 公开方法，是社交网络中的"名片"

这个双面结构让对象既能有丰富的内在世界，又能在对外协作时保持简洁。

### 2. Trait 是自我立法（G3）

Trait 不是"外部赋予的功能"，而是**对象定义"我如何思考、我遵守什么规则"**。

一个对象可以：
- **组合** trait（叠加多个能力）
- **进化** trait（从 readme-only → 默认激活 → 内化为直觉）
- **自约束**（trait 限制自己的行为边界）

### 3. 关系是局部的（G6）

**对象只知道自己的关系列表**。没有"全局关系图"——关系散布在每个对象的 readme.md 里。

World 是所有对象关系的汇聚，但**World 也不是全知的**——它只知道自己与其他对象的直接关系。

### 4. 所有组件都在 readme.md 中引用

```markdown
---
who_am_i: "..."
talkable:
  who_am_i: "..."
  functions: [...]
traits:
  - kernel/base
  - kernel/computable
relations:
  - name: browser
    description: "可以搜索互联网"
---
```

即：**身份 + 数据 + 能力 + 关系**都是通过 readme.md 的 frontmatter 或引用的文件来定义的——没有"另外的结构数据库"。

## 源码锚点

| 概念 | 实现 |
|---|---|
| 身份数据结构 | `kernel/src/types/object.ts` → `StoneData.thinkable / talkable` |
| readme.md 解析 | `kernel/src/persistence/frontmatter.ts` |
| Trait 加载 | `kernel/src/trait/loader.ts` |
| 方法注册 | `kernel/src/trait/registry.ts` |
| 关系 | `kernel/src/types/object.ts` → `StoneData.relations` |

## 与基因的关联

- **G1**（数据即对象）— 本层所有组件都是对象的"内部数据"
- **G3**（trait 是自我定义单元）— trait/ 子领域的核心
- **G6**（关系即网络）— 关系/ 子领域的核心
