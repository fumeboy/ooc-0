# 关系 — 对象的有向连接

> G6：对象通过关系连接成网络。
> 但这不是一张"全局关系图"——每个对象只知道自己的关系列表。

## 两个层面

| 层面 | 内容 |
|---|---|
| [relation.md](relation.md) | 关系的基本性质：有向连接、局部知识 |
| [社交网络.md](社交网络.md) | 所有对象的关系如何汇聚成网络 |

## 核心主张

### 关系是对象的一部分

每个对象的 readme.md 里有 `relations` 字段：

```yaml
relations:
  - name: browser
    description: "可以搜索互联网"
  - name: filesystem
    description: "可以读写文件"
```

这段数据是**对象自己**的——它属于对象的内部结构，不是系统维护的外部索引。

### 关系是有向的

A → B 不意味着 B → A。
Alan 知道 Bruce（relations 里有 bruce），不代表 Bruce 也知道 Alan。

两个对象若要双向沟通，各自的 readme 都要写对方。

### 关系是局部的（局部知识原则）

**对象只知道自己的 relations 列表**。没有任何 API 可以查"谁 relation 指向了我"。

这有两个重要含义：
- 对象之间是**松耦合**的——A 不关心谁在引用它
- 社交网络的"全景图"只能在**系统层**（World）通过扫描所有 readme 获得

### World 也不是全知的

World 是所有对象的根容器，但它**也只是一个对象**——它也只知道自己的 relations。

```yaml
# world 的 readme.md
relations:
  - name: supervisor
    description: "..."
  - name: alan
    description: "..."
```

扫描所有对象的 relations → 得到全局关系图——**但这是系统工具做的**，不是 World 的特权。

## 为什么这样设计

### 局部知识 → 可扩展

全局索引有两个问题：
1. 加对象要更新索引
2. 索引可能与真实状态不一致

局部知识让每个对象**自给自足**——它读自己的 readme 就够了。

### 有向 → 语义丰富

对称关系（A ↔ B）丢失了"谁主动依赖谁"的信息。
有向关系保留了这个语义：Alan → Bruce 意味着"Alan 可能主动找 Bruce"。

### 关系带描述

`description` 字段是**自然语言**——让 LLM 理解"这个关系用来做什么"。不只是"A 和 B 有关"，而是"A 可以通过 B 做 X"。

## 与其他维度的关系

- **关系是 Context 的一部分**：对象思考时，relations 作为 `directory` 的一部分进入 Context（[../../认知/context/](../../认知/context/)）
- **关系是合作的前提**：对象通过 talk 沟通时，target 必须在 relations 里（或动态发现，见 [../../合作/](../../合作/)）
- **关系可以演化**：对象通过反思可以更新自己的 relations（[../../成长/自我修改.md](../../成长/自我修改.md)）

## 源码锚点

| 概念 | 实现 |
|---|---|
| Relation 类型 | `kernel/src/types/object.ts` → `Relation` |
| readme 解析 | `kernel/src/persistence/frontmatter.ts` |
| 全局扫描 | `kernel/src/world/registry.ts` |

## 与基因的关联

- **G1**（数据即对象）— 关系是对象的数据之一
- **G6**（关系即网络）— 本章核心
