# kernel/object_creation — 创建新对象的指南

> 一个合格的 OOC 对象需要清晰的自我定义。创建对象时，你需要为它编写 whoAmI。

## 基本信息

```yaml
name: kernel/object_creation
type: how_to_interact
when: never
command_binding: [create_sub_thread]
description: 创建新对象或完善对象身份的指南
```

**注意**：meta.md 子树 5 中未列出此 trait。本目录的 README 已补充。后续 meta.md 会同步修正。

## 为什么关联 create_sub_thread

在 OOC 中，**创建新对象**通常是一个子任务——需要一个专门的子线程来：
1. 设计对象的 whoAmI（身份定义）
2. 选择合适的 traits
3. 生成初始 readme.md 和 data.json
4. 创建对象目录

`create_sub_thread` 触发此 trait 激活，让子线程获得"如何设计一个对象"的指导。

## whoAmI 的结构

object_creation 的 TRAIT.md 强调：一个好的 whoAmI 应该包含：

### 1. 身份与定位
我是谁？我的核心职责是什么？

### 2. 能力与边界
我能做什么？不能做什么？

### 3. 风格与偏好
我如何沟通？什么事我会主动做，什么事我会拒绝？

### 4. 背景知识
我知道什么？我的知识在哪些领域有深度？

### 5. 目标与价值观
我看重什么？成功对我来说意味着什么？

## 典型创建流程

```
用户：创建一个"代码评审助手"对象

supervisor（根线程）:
  open(type=command, command=create_sub_thread)
  submit({
    title: "创建代码评审助手",
    description: "..."
  })
  → 子线程继承 supervisor 的 scope，加载 object_creation trait

子线程（设计师）:
  - 根据需求设计 whoAmI
  - 选择 traits（kernel/reviewable + kernel/verifiable + ...）
  - 生成 readme.md 内容
  - 调用 createObject 方法
  - return("创建完成: stones/reviewer")

supervisor 收到子线程 return，展示结果给用户
```

## createObject 方法

object_creation trait 提供：

```typescript
await createObject({
  name: "reviewer",
  whoAmI: "你是一个代码评审助手...",
  talkable: {
    whoAmI: "代码评审助手",
    functions: [{ name: "review", description: "审查代码" }]
  },
  traits: ["kernel/base", "kernel/reviewable", "kernel/verifiable"],
  relations: []
});
// → 创建 stones/reviewer/ 目录 + readme.md + data.json
```

## 身份完善

object_creation 不只用于新建——也用于**完善已有对象的 whoAmI**：

```
用户：帮我完善 alan 的 whoAmI，加一些关于他对哲学的偏好

supervisor:
  open(command=create_sub_thread)
  submit({ title: "完善 alan 身份", ... })
```

子线程读取现有 readme，分析缺失部分，向用户确认新内容，通过 SelfMeta 写回。

## 源码锚点

| 概念 | 实现 |
|---|---|
| Trait 定义 | `kernel/traits/object_creation/TRAIT.md` |
| createObject 方法 | `kernel/traits/object_creation/methods.ts`（如有） |
| 目录创建 | `kernel/src/persistence/writer.ts` |

## 与其他 trait 的组合

- **object_creation + plannable** → 创建对象本身是一个规划任务
- **object_creation + library_index** → 从 library 挑选合适的 traits 装配

## 与基因的关联

- **G1**（数据即对象）— 创建新概念 = 创建新对象
- **G7**（目录即存在）— 对象创建 = 创建目录 + 初始化文件
