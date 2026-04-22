# Relation — 有向连接

## 数据结构

```typescript
interface Relation {
  name: string;           // 目标对象的 name
  description: string;    // 这个关系的语义描述
  // 可选字段
  direction?: "out" | "in" | "both";  // 默认 "out"
}
```

存储位置：对象 readme.md 的 frontmatter：

```yaml
---
relations:
  - name: filesystem
    description: "可以读写文件、搜索代码"
  - name: browser
    description: "可以搜索互联网"
  - name: supervisor
    description: "上级，向其汇报进展"
---
```

## 关系的语义

### description 至关重要

`description` 不是装饰。它是 LLM 在思考时**理解关系含义**的唯一来源。

好的描述：
- `"可以读写文件、搜索代码"` → LLM 知道需要文件操作时 talk 这个对象
- `"上级，向其汇报进展"` → LLM 知道进度更新要通知这个对象

差的描述：
- `"相关对象"` → 空洞，LLM 不知道何时用
- `"filesystem"` → 只是名字，没有能力说明

### direction 的三种取值

| 值 | 含义 | 典型用法 |
|---|---|---|
| `out`（默认） | A 知道 B | 单向引用：我可以调用它 |
| `in` | B 也知道 A | 明确声明双向关系 |
| `both` | 双向等价 | 对等协作（如 peer reviewer） |

实践中大多数关系是 `out`，因为"我知道你"不必然"你知道我"。

## 关系 vs 其他引用

OOC 中有三种"对象间的指向"，不要混淆：

| 类型 | 存储位置 | 用途 |
|---|---|---|
| **relations** | readme.md frontmatter | 对象的长期社交圈 |
| **mentions** | 对话中的 @ 引用 | 此次消息涉及的对象 |
| **ooc:// 链接** | 正文里的 markdown 链接 | 临时引用某对象 / 文件 |

关系是**持久的、结构化的**；mentions 和 ooc:// 是**临时的、对话级别的**。

## 关系 → Context 的路径

对象思考时，它的 relations 会进入 Context：

```
readme.md.relations
    ↓
Context.directory
    ↓
LLM 看到：
  你拥有这些关系：
  - filesystem: 可以读写文件...
  - browser: 可以搜索互联网...
```

详见 [../../认知/context/九大组成.md](../../认知/context/九大组成.md) 中 `directory` 部分。

## 关系的动态性

关系不是"建立一次就永远存在"。对象可以：

### 添加关系

```typescript
// 通过 talk 向 SuperFlow 提交沉淀请求（SuperFlow 审视后决定写入）
await talk({
  target: "super",
  content: "请沉淀关系：name=new-helper, description=新的辅助对象"
});
```

只有 SelfMeta（SuperFlow）才能写 Stone 级 readme。普通 Flow 不能直接改 Stone 的 relations。

### 移除关系

类似，需要经过 SelfMeta 审批。

### 关系的"陈旧检测"

如果一个 relation 指向的对象**已不存在**（目录被删除），该关系称为"孤立"——
系统会保留引用（不自动清理），但访问时会提示"目标对象不存在"。

## 跨 Session 的关系

relations 在 **Stone 级** readme 中，因此**跨 Session 持久**。
Flow 级没有独立的 relations——Flow 继承自 Stone 的关系。

## 源码锚点

| 概念 | 实现 |
|---|---|
| 类型定义 | `kernel/src/types/object.ts` → `Relation` |
| frontmatter 解析 | `kernel/src/persistence/frontmatter.ts` |
| Context 注入 | `kernel/src/thread/context-builder.ts` |

## 与基因的关联

- **G6**（关系即网络）— 本文档的核心
- **G1**（数据即对象）— 关系作为对象的数据之一
