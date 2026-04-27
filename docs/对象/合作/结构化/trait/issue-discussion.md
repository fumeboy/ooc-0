# issue-discussion — 所有对象共享的 Issue 讨论 trait

> 所有对象都可以在 Issue 下评论、读取 Issue 详情。但不能改 Issue 的结构（状态、关联等）。

## 位置

实际目录：

```
kernel/traits/talkable/issue-discussion/
├── TRAIT.md
└── methods.ts
```

**注意**：虽然位于 `talkable/` 下（作为其子 trait），但它的功能更偏向"看板"。这是工程实现选择——因为评论本质是一种"消息"（写给 Issue 的消息）。

### meta.md 的描述修正

旧版 meta.md 子树 5 / 7 中的 Kernel Traits 清单把 issue-discussion 列为独立的 Kernel trait（`kernel/traits/issue-discussion/`），这与实际代码不符。实际中它是 `talkable` 的子 trait。

Phase 8 会在 meta.md 中明确修正此处。

## 核心方法

```typescript
commentOnIssue(issueId, content, mentions?): void
listIssueComments(issueId): Comment[]
getIssue(issueId): Issue
listIssues(filters?): IssueIndexEntry[]
```

**没有**创建 Issue / 改状态 / 关联 Task 的方法——这些是 session-kanban 的权限。

## 共享但受限

所有对象都能激活 issue-discussion（通过 readme 的 traits 列表或 `open(title="加载 issue 讨论能力", type=trait, name=..., description="...")`）。但只能做**有限操作**：

| 能做 | 不能做 |
|---|---|
| 评论 | 创建 Issue |
| 读 Issue | 改 Issue 状态 |
| 看参与者 | 加 / 删 participants（自动通过 mentions 添加） |
| @ 其他对象 | 直接分配 Task |

## @mention 机制

`commentOnIssue` 的 `mentions` 参数：

```typescript
await commentOnIssue("ISSUE-001", "我觉得 @alan 说的对", ["alan"]);
```

效果：

1. Comment 写入 issue-{id}.json 的 comments 数组
2. mentions 中的对象（本例 alan）收到 inbox 消息：
   ```
   [@supervisor 在 ISSUE-001 中提到你]: "我觉得 @alan 说的对"
   ```
3. 如果 alan 不在 participants，自动添加
4. Issue.hasNewInfo 不改（评论是协作不是"人类需要确认"）

## 通过 task_dir 定位

与 session-kanban 相同，issue-discussion 的方法通过 `ctx.task_dir` 知道当前 Session 目录。

## 与 talk 的区别

| 维度 | talk | issue-discussion |
|---|---|---|
| 对象 | 另一个对象 | Issue（看板条目） |
| 可见性 | 仅收发双方 | 参与者都可见 |
| 持久性 | inbox 条目（可被 mark） | Comment（不可变 append） |
| 检索 | 按时间 | 按 Issue 聚合 |

**经验规则**：
- 点对点临时沟通 → talk
- 需要跨时间、多方可见的讨论 → Issue + issue-discussion

## 典型用法

### 在 Issue 下提出观点

```typescript
await commentOnIssue("ISSUE-001", "我测试了方案 A，发现 ...", []);
```

### @ 其他对象邀请讨论

```typescript
await commentOnIssue("ISSUE-001",
  "我做了初步实验，@bruce 麻烦你用用例 010 验证一下",
  ["bruce"]
);
```

Bruce 收到 inbox 提示，进入 Issue 详情页看到完整讨论 → 执行验证 → 回来评论结果。

### 列出相关 Issue

```typescript
const issues = await listIssues({ status: "executing", participant: "alan" });
// → alan 参与的、执行中的 Issue 列表
```

## 源码锚点

| 概念 | 实现 |
|---|---|
| trait 文件 | `kernel/traits/talkable/issue-discussion/` |
| 方法实现 | `kernel/src/kanban/discussion.ts` |
| 数据存储 | `kernel/src/kanban/store.ts` |

## 与基因的关联

- **G3**（trait 是自我定义）— 所有对象通过加载此 trait 获得"讨论"能力
- **G10**（行动记录不可变）— Comment 的 append-only
- **G8**（Effect 与 Space）— Issue 是 Space 内的结构化对话
