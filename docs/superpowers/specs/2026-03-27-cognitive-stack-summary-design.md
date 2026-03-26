# 认知栈摘要增强 — 结构化 artifacts 保留

## 问题

当认知栈帧弹出（`stack_return`）时，LLM 提供的摘要往往只有一句结论性文字（如"已完成分析"），丢弃了下文有用的中间结果（搜索数据、计算结果、收到的回复等）。导致父帧继续思考时走偏或重复计算。

## 设计

### 1. stack_return 支持结构化参数

当前：
```javascript
stack_return("已完成分析")  // 只有一句话
```

增强后：
```javascript
// 简单模式（向后兼容）
stack_return("已完成分析")

// 结构化模式
stack_return("已完成分析", {
  sophia_reply: "G5 和 G12 不矛盾，是互补的选择机制...",
  key_refs: ["G5", "G12"],
  search_result: "找到 3 篇相关文档"
})
```

第二个参数 `artifacts` 是可选的 `Record<string, unknown>`。

### 2. artifacts 存入 locals

`stack_return` 执行时，将 artifacts 写入当前节点的 `locals`：

```typescript
// thinkloop.ts — stack_return 实现
fn: (summary?: string, artifacts?: Record<string, unknown>) => {
  // ... 现有逻辑 ...

  // 将 artifacts 存入节点 locals（pop 后父帧可通过作用域链访问）
  if (artifacts && typeof artifacts === "object") {
    if (!focusNode.locals) focusNode.locals = {};
    Object.assign(focusNode.locals, artifacts);
  }

  const ok = completeProcessNode(process, process.focusId, summary ?? "");
  // ...
}
```

### 3. 父帧通过 locals 访问 artifacts

`stack_return` 时，artifacts 写入**父节点**的 locals（不是当前节点），因为 pop 后 focus 回到父节点，当前节点不在作用域链上。

```typescript
// thinkloop.ts — stack_return 实现
fn: (summary?: string, artifacts?: Record<string, unknown>) => {
  // ... 现有逻辑 ...

  // 将 artifacts 写入父节点 locals（pop 后父帧可直接访问）
  if (artifacts && typeof artifacts === "object") {
    const parent = getParentNode(process.root, focusNode.id);
    if (parent) {
      if (!parent.locals) parent.locals = {};
      Object.assign(parent.locals, artifacts);
    }
  }

  const ok = completeProcessNode(process, process.focusId, summary ?? "");
  // ...
}
```

父帧中直接通过 `local.key` 访问：
```javascript
// 父帧中
const reply = local.sophia_reply;  // 来自已完成子帧的 artifacts
```

不需要改作用域链逻辑——artifacts 已经在父节点的 locals 中。

### 4. 行为树渲染增强

已完成节点的渲染从：
```
[✓] 分析 OOC 哲学 (已完成分析)
```

增强为（当有 artifacts 时）：
```
[✓] 分析 OOC 哲学 (已完成分析) [artifacts: sophia_reply, key_refs, search_result]
```

只显示 artifact 的 key 列表，不展开值（避免 context 膨胀）。LLM 需要时通过 `local.key` 访问。

### 5. computable trait 文档指导

在 `kernel/traits/computable/readme.md` 的 `stack_return` 文档中增加摘要技巧：

```markdown
### stack_return 摘要技巧

好的摘要 = 结论 + 关键中间产物。

**反模式**：
- `stack_return("已完成")` — 太空洞，下文不知道完成了什么
- `stack_return("分析了 G5 和 G12")` — 只有动作，没有结论

**正确做法**：
- 结论要具体：`stack_return("G5 和 G12 不矛盾，是互补的选择机制")`
- 有中间结果时用 artifacts 保留：
  ```javascript
  stack_return("G5 和 G12 不矛盾", {
    analysis: "G5 管遗忘（出口），G12 管沉淀（入口），作用于信息生命周期的不同阶段",
    evidence: "gene.md 第 200-250 行"
  })
  ```
- artifacts 的 key 要有语义：用 `sophia_reply` 而非 `data1`
- 只保留下文可能需要的：搜索结果、计算输出、收到的回复、关键路径
- 不保留过程性信息：思考过程、尝试失败的方案
```

## 文件变更

| 文件 | 变更 |
|------|------|
| `kernel/src/flow/thinkloop.ts` | `stack_return` 支持第二个 `artifacts` 参数，写入 `focusNode.locals` |
| `kernel/src/process/render.ts` | 已完成节点渲染时显示 artifact keys |
| `kernel/traits/computable/readme.md` | 新增摘要技巧文档 |

## 向后兼容

- `stack_return("summary")` 单参数调用完全兼容
- 不改变 `ProcessNode` 类型（artifacts 存入已有的 `locals` 字段）
- 不改变作用域链计算逻辑
