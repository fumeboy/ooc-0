# 存在 — 对象如何"在"

> "存在不是抽象的——它是文件系统中的一个路径。"

这个维度回答三个问题：
1. 对象在**哪里**？ → [持久化](持久化.md)
2. 对象的**形态**有哪些？ → [形态](形态.md)
3. 这些形态具体长什么样？ → [stone](stone.md)、[flow](flow.md)、[session](session.md)

## 核心主张（G7）

**目录存在 → 对象存在。目录删除 → 对象消亡。**

这不是一个比喻，也不是"数据库 + ORM 生成的抽象"。OOC 对象的**物理存在**就是一个目录。打开终端 `ls stones/`，看到的就是世界里所有活着的 Stone。

## 两种形态（G2）

```
Stone（静态/潜能态）            Flow（动态/现实态）
═══════════════════             ══════════════════
stones/{name}/                  flows/{sessionId}/objects/{name}/
├── readme.md                   ├── .flow
├── data.json                   ├── data.json
├── traits/                     ├── threads.json
├── memory.md                   ├── threads/{threadId}/thread.json
├── super/                      └── ...
├── ui/
└── files/
```

**Stone** = 能力已定义，但未激活。"可以思考的东西"，此刻没有在思考。
**Flow** = Stone 被具体任务唤醒后的活体，线程树正在运行。

一个 Stone 可以同时拥有多个 Flow，每个任务（Session）对应一个 Flow。

## 相关概念

- **Session** ([session.md](session.md)) — 一次会话；多个 Flow 在同一个 Session 下协作
- **SelfMeta** — 维护 Self 长期数据的常驻 Flow（详见 [../成长/](../成长/) 和 [stone.md](stone.md)）

## 源码锚点

| 概念 | 实现 |
|---|---|
| 持久化读 | `kernel/src/persistence/reader.ts` |
| 持久化写 | `kernel/src/persistence/writer.ts` |
| Stone 加载 | `kernel/src/stone/stone.ts` |
| Flow 运行 | `kernel/src/flow/flow.ts`（旧架构，过渡中） |
| 线程树适配 | `kernel/src/persistence/thread-adapter.ts` |

## 与其他维度的关系

- **存在是所有维度的前提**。没有目录就没有 readme（结构）、没有 thread.json events（认知/合作）、没有 trait 升级（成长）、没有 ui/（人机交互）
- **改变任何维度都是在改变存在**。修改 readme = 改变对象的物理字节 = 改变存在本身

详见 [../../哲学/统一性.md](../../哲学/统一性.md)。
