# Comment — 不可变评论

> Issue 下的评论。一旦创建，**不可修改**——符合 G10 的行动记录不可变原则。

## 数据结构

```typescript
interface Comment {
  id: string;                // UUID
  author: string;            // 对象名（或 "user" 表示人类）
  content: string;           // markdown
  mentions: string[];        // @提到的对象名列表
  createdAt: string;         // ISO 时间戳
}
```

存储位置：`issue-{id}.json` 的 `comments` 数组。

## 不可变性

**Comment 没有 updatedAt 字段**——它一旦创建就不能被改写。

如果需要纠正：
- 发新 comment 说明
- 旧 comment 保留不变

这让 Issue 的讨论历史**完整可追溯**——不会发生"原本说了 A，后来改成了 B，读者以为一直是 B"。

## 创建 Comment

```typescript
// 任何对象通过 issue-discussion trait
await commentOnIssue("ISSUE-001", {
  content: "我觉得应该先验证 X",
  mentions: ["bruce", "supervisor"]
});
```

系统自动填：
- id（UUID）
- author（当前对象名）
- createdAt（now）

## mentions 机制

`mentions` 是作者**主动@**的对象列表。效果：

1. **消息投递**：mentions 中的每个对象收到 inbox 消息：
   ```
   [@alan 在 ISSUE-001 中提到你] "..."
   ```

2. **参与者加入**：如果 mentioned 对象不在 Issue.participants 里，自动添加

3. **前端高亮**：评论渲染时 `@name` 显示为可点击链接

## 提取 mentions

Comment 的 content 中的 `@name` 会被自动解析为 mentions：

```
content: "我觉得 @alan 的设计好，@bruce 你怎么看？"
  → mentions: ["alan", "bruce"]
```

但显式传 mentions 更可靠（避免歧义、避免人名纯文本误识别）。

## 作者可以是人类

`author: "user"` 表示来自人类用户的评论（通过后端 API 直接写入）。

```typescript
// 后端 API
POST /api/session/{sid}/issues/{id}/comments
  → 以 author=user 添加评论
```

前端在 Issue 详情页的"评论输入框"提交时调用此 API。

## 评论的时序展示

前端按 createdAt 升序展示：

```
2026-04-21 10:00 [alan]   @supervisor 我发现了一个问题...
2026-04-21 10:05 [supervisor]   @alan 能详细说说吗
2026-04-21 10:07 [user]  看起来是线程调度的 bug
```

时序不变——因为 comments 不改写。

## 为什么不允许修改

### 诚实

如果允许修改，对象（或人类）可能在"事后"美化自己说过的话。
- "我那时候明明说的是 X" → 翻记录，确实是 X

不可变让历史是**客观事实**。

### 对 G12 的支持

G12（经验沉淀）需要真实的历史作为素材。如果评论可改，就没有"真实的历史"——只有"当前想让人相信的历史"。

## 源码锚点

| 概念 | 实现 |
|---|---|
| Comment 类型 | `kernel/src/types/kanban.ts` |
| 创建方法 | `kernel/src/kanban/discussion.ts` → `commentOnIssue` |
| 用户评论 API | `kernel/src/server/kanban.ts`（或类似） |
| 前端 | `kernel/web/src/features/IssueDetailView.tsx` → CommentsTab |

## 与基因的关联

- **G10**（行动记录不可变）— Comment 是 G10 在 UI 层的体现
- **G8**（Effect 与 Space）— 评论是结构化 Space 里的 Effect
