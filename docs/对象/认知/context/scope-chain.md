# Scope Chain — 作用域链

> 线程树的当前节点沿树**向上**收集，决定哪些 trait 被激活、哪些知识可见。

## 基本规则

```
根线程 (traits: A, B)
    ↓
 子线程 (traits: C)
    ↓
 孙线程 (traits: D)
```

孙线程的**作用域**是：`A + B + C + D`（向上收集全部）。

不同于"环境变量继承"——这不是简单的 inherit，而是**作用域栈**：每个节点的激活 trait 加到栈里，子节点可见，退出节点时弹出。

## 作用域的边界

### 子节点可见父节点的

- 激活的 trait（Progressive Disclosure 的全部 Level）
- 作用域内的 skill

### 子节点**不可见**的

- 父节点的 `process`（actions 历史）
- 父节点的 `inbox`
- 父节点的 `activeForms`（父的 form 子不能 close）
- 兄弟节点的任何状态

这保证了子线程的独立性——它有自己的思考历史，不被父/兄的状态污染。

### 父节点可见子节点的

- **childrenSummary**：子线程完成摘要
- 子线程 return 的结果（通过 inbox）

父不能直接读子的 actions——只能通过 return summary。

## 为什么这么设计

### 共享能力，隔离状态

**Trait 是共享的**：如果父线程有 computable，子线程也该有——子线程是父线程委派的子任务，继承能力是合理的。

**actions / inbox 是隔离的**：如果子线程能看到父线程的全部历史，Context 会爆炸；而且子线程应该专注于自己的子任务，不应被父线程的细节干扰。

### 子线程的"输入输出对齐"

子线程像一个函数：
- 输入 = parentExpectation（父传给它的任务描述）
- 输出 = return summary（子传回父的结果）

作用域链保证"能力传递"，但"状态隔离"保证"子线程是纯粹的"——给同样的输入，得到同样的输出。

## 实现机制

### 激活时标记归属

`activateTrait(name, ownerThread)`：

```typescript
function activateTrait(name: string, thread: Thread) {
  thread.activatedTraits.add(name);
  // ...
}
```

每个激活都绑定到一个**具体线程**。

### 构建 Context 时沿树收集

`buildContext(threadId)`：

```typescript
const scopeChain = [];
let current = threads.get(threadId);
while (current) {
  scopeChain.unshift(current.activatedTraits);  // 从根到当前
  current = threads.get(current.parentId);
}
const fullTraits = flat(scopeChain);
```

这样，孙线程构建 Context 时，看到祖-父-己的全部激活 trait。

### 线程结束时清理

当线程 `return` 或 `failed`，其 activatedTraits 被释放（refcount--）。如果某 trait 的 refcount 归零，它从全局 activatedTraits 移除，Context 中消失。

## 与激活机制的配合

Scope Chain 是**读取侧**；渐进式激活（command_binding）是**写入侧**：

```
子线程 open(command=program)
  → activateTrait(computable) ON 子线程
  → 子线程的 Context 中，computable 的 Level 1 注入
  → 孙线程启动时，孙线程的 Context 也会看到 computable（通过 scope chain 向上）
```

这意味着：**父的能力对子可见，但子的能力对父不可见**（子的 trait 激活时父线程可能还没启动新一轮 Context 构建）。

## 特殊情况：`inherit_scope: false`

`create_sub_thread` 时可选 `inherit_scope: false`：

```typescript
create_sub_thread({
  title: "...",
  description: "...",
  inherit_scope: false  // 子线程不继承父的 trait
})
```

这种子线程是**完全独立**的——只有 base 激活，其他 trait 都要它自己 `open`。

典型场景：创建一个"独立身份"的子任务（如 review 一个未知的 PR，不想被父线程的 domain knowledge 影响）。

## 源码锚点

| 概念 | 实现 |
|---|---|
| 作用域链遍历 | `kernel/src/thread/tree.ts` → `getScopedTraits()` |
| Context 构建整合 | `kernel/src/thread/context-builder.ts` |
| inherit_scope 参数 | `kernel/src/thread/engine.ts`（处理 create_sub_thread） |

## 与基因的关联

- **G13**（线程树即运行模型）— scope chain 是线程树的核心语义
- **G3**（trait 是自我定义）— 能力传递通过 scope chain 实现
