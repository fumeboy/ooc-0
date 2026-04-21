# 结构化 / trait

> 实现看板操作的两个 trait。

## 两个 trait

| Trait | 位置 | 谁能用 | 能做什么 |
|---|---|---|---|
| [session-kanban](session-kanban.md) | `stones/supervisor/traits/session-kanban/` | Supervisor 专属 | 创建/更新 Issue 和 Task（结构性操作） |
| [issue-discussion](issue-discussion.md) | `kernel/traits/talkable/issue-discussion/` | 所有对象共享 | 评论、读取、@mention |

## 权限模型

```
Supervisor   ──能──→ 创建 / 改状态 / 关联
其他对象     ──能──→ 评论 / 读取 / @
用户（API）  ──能──→ 评论 / 查看（自动 reset hasNewInfo）
```

## 并发保护

三方写入通过 `session.serializedWrite` 串行化。详见 [../并发写入.md](../并发写入.md)。
