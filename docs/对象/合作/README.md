# 合作 — 对象如何"做"与"管"

> 合作覆盖两件事：
> 1. **做**：对象对外产生影响（Effect）、与他者通信（消息）
> 2. **管**：合作的结构化组织（Issue / Task / 看板）

合并"行动"和"看板"为一个领域，是因为二者的共同本质是**对象走出自己、与他者对齐**。

## 四个子领域（按抽象度递增）

```
基础/          ← 合作的最底层机制：Effect + 线程树调度
  ↓
消息/          ← 合作的直接手段：一对一通信
  ↓
结构化/        ← 合作的组织形式：Issue / Task
  ↓
角色/          ← 合作中的特殊主体：Supervisor
```

| 子目录 | 内容 | 主要基因 |
|---|---|---|
| [基础/](基础/) | effect + 线程树调度（合作的底层） | G8, G9, G10 |
| [消息/](消息/) | talk / talk(wait=true) / return / inbox / 跨对象协作 | G8 |
| [结构化/](结构化/) | Issue / Task / Comment + 看板 trait | — |
| [角色/](角色/) | Supervisor（全局代理） | — |

## 核心主张

### Effect 是对外的唯一通道（G10）

对象不能"直接修改世界"。所有对外操作都走 Effect：
- 写文件（读写自己的目录）
- 发消息（talk）
- 创建对象（create_object）
- 外部调用（通过 trait 封装）

详见 [基础/effect.md](基础/effect.md)。

### 消息是合作的原语（G8）

talk / return 是对象间通信的核心原语；等待回复是 talk 的 `wait=true` 模式：

```
talk(target, msg)              — 异步：发送不等待
talk(target, msg, wait=true)   — 同步等待：发送后当前线程 waiting
return(summary)                — 完成线程，返回父/发起方
```

详见 [消息/](消息/)。

### 看板是 Session 级的结构化协作

Issue 和 Task 是 Session 级的跟踪单元。跨对象共享。

- **Issue** = 需求/问题讨论（多对多关联 Task）
- **Task** = 执行单元
- **Comment** = 不可变评论
- 并发写入通过 `session.serializedWrite` 串行化

详见 [结构化/](结构化/)。

### Supervisor 是全局代理

不是所有对象地位相同——Supervisor 拥有系统级特权：
- 用户消息默认路由到它
- 可访问 Session 中所有 sub-flow 的状态
- 维护 Session 看板

详见 [角色/supervisor.md](角色/supervisor.md)。

## 源码锚点

| 概念 | 实现 |
|---|---|
| Effect / Action 记录 | `kernel/src/thread/engine.ts` |
| 跨对象 talk | `kernel/src/thread/collaboration.ts` |
| 调度 | `kernel/src/thread/scheduler.ts` |
| 看板存储 | `kernel/src/kanban/store.ts` |
| 看板方法 | `kernel/src/kanban/methods.ts`, `discussion.ts` |
| Session 管理 | `kernel/src/world/session.ts` |

## 与基因的关联

- **G8**（Effect 与 Space）— 消息是一种 Effect；Session 提供 Space
- **G9**（线程树调度）— 合作的执行由调度驱动
- **G10**（行动记录不可变）— 所有 Effect 都作为 action 记录
