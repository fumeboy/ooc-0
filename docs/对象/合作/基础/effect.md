# Effect — 对外作用的唯一通道

> G10：**Effect 是对象作用于世界的唯一通道。没有"直接修改世界"这回事。**

## 什么是 Effect

Effect = 对象对**外部世界**的任何影响。"外部"的定义：

- **对象自己的目录以外的文件系统**（除非是 Session 目录内）
- **其他对象**（通过 talk / 方法调用）
- **系统资源**（进程、网络、数据库）

**对象内部的修改不是 Effect**：
- 写自己的 data.json（属于自身）
- 记录 action 到 thread.json（属于自身）
- 激活 trait / 激活 form（属于自身）

## 为什么要限定 Effect 的边界

### 防止"幽灵修改"

如果对象可以直接改世界（比如直接写 `/etc/passwd`），没有机制能：
- 追溯"是谁改的"
- 撤销某次修改
- 审计行为历史

Effect 机制让所有对外影响**可追溯、可审计**。

### 支持沙箱

对象通过 program 执行代码。代码运行在沙箱中：
- 只能用 trait 提供的 API
- trait API 的实现负责把操作记入 actions

即使对象想"绕过"，沙箱不允许任意文件系统操作。

## Effect 的四种形式

### 1. 文件操作

```typescript
await writeFile(path, content)
await appendFile(path, content)
await deleteFile(path)
```

**边界**：只能操作当前对象目录、Session 目录下的文件。不能修改其他对象的目录（除非是 talk 触发）。

### 2. 创建对象

```typescript
await createObject({ name, whoAmI, traits, ... })
```

**边界**：需要 object_creation trait 激活；创建后的对象独立存在。

### 3. 发送消息

```typescript
await talk(target, message)
await talk_sync(target, message)
```

**边界**：消息投递到对方的 inbox，不直接修改对方的状态。对方如何处理由对方决定。

### 4. 外部调用

通过 library trait 封装的外部 API：

```typescript
// 假设激活了 library/browser
await searchWeb(query)

// 假设激活了 library/lark-doc
await readLarkDoc(docId)
```

**边界**：外部调用的副作用（如发邮件）同样记入 actions。

## Effect 与 Action 的关系

```
Effect（物理层面）  ──→  记录为 Action（逻辑层面）
   ↓                        ↓
 世界改变                 thread.actions 追加
```

每个 Effect 的发生都产生一个 action：

```json
{
  "type": "tool_use",
  "tool": "submit",
  "args": { "form_id": "f_001", "code": "await writeFile(...)" },
  "result": { "success": true, "path": "/path/to/file" },
  "ts": "..."
}
```

这让：
- 任何时候都能追溯"谁做了什么"
- 任何时候都能重放（部分场景）
- Context 的 `process` 字段就是 actions 历史

## G10：不可变性

**行动记录一旦写入，永不改写**。

这意味着：
- 即使发现 action 的 result 是错的，也不改
- 错误通过**新的 action**（如"纠正"action）表达
- `thread.json` 的 actions 数组是 **append-only**

### 为什么坚持不可变

- **诚实**：反思（G12）的基础是真实的历史。如果能改写历史，对象会"美化"经验
- **一致性**：并发场景下不可变更容易推理
- **审计**：Effect 的发生是**事实**，不是"可协商的意见"

## Effect 与 Space

G8 提到 "Effect 与 Space"。Space 是 Effect 发生的**物理边界**：

| Space | 含义 |
|---|---|
| 对象目录 | 对象自己的"领地"，其 Effect 可自由发生 |
| Session 目录 | 多对象合作的共享空间 |
| 外部世界 | 通过 trait 封装访问，受限 |

**不存在"全局可改的 Space"**——World 本身也是一个对象，也有自己的目录，它的 relations 也只是它自己的。

## Effect 的权限

| 操作 | 谁能做 |
|---|---|
| 写自己对象的 files/ | 对应 Flow（通过 computable） |
| 写自己对象的 data.json | 对应 Flow（需 setData） |
| 写自己对象的 readme.md | 只有 SelfMeta（通过 reflect） |
| 写其他对象的目录 | 不能（必须 talk 让对方自己改） |
| 写 Session 的 issues/ tasks/ | 所有参与 Flow（但串行化） |

## 源码锚点

| 概念 | 实现 |
|---|---|
| Effect 作为 action 记录 | `kernel/src/thread/engine.ts` |
| 沙箱 API 实现 | `kernel/src/executable/api/` |
| 权限检查 | 各 trait 的 method handler 内 |

## 与基因的关联

- **G8**（Effect 与 Space）— 本章核心
- **G10**（行动记录不可变）— Effect 的记录层面
- **G7**（目录即存在）— Effect 的边界由目录定义
