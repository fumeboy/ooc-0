# Stone — 静态/潜能态

> Stone 是对象的**持久身份**。它总是存在，不会因为任务结束而消失。

## 目录结构

```
stones/{name}/
├── .stone                    ← 标记文件（目录存在即对象存在）
├── readme.md                 ← 身份（who_am_i + traits 激活列表）
├── data.json                 ← 动态数据（键值对）
├── memory.md                 ← 长期记忆（跨任务持久）
├── traits/                   ← 用户自定义 Trait
│   └── {trait_name}/
│       └── TRAIT.md
├── reflect/                  ← ReflectFlow 子对象
│   ├── data.json
│   ├── process.json
│   └── files/
├── ui/                       ← 自渲染 UI（可选）
│   └── index.tsx             ← 唯一主界面入口
└── files/                    ← 其他共享文件
```

## 核心文件

### readme.md

身份定义。包含 frontmatter + markdown 正文：

```markdown
---
who_am_i: "你是 Alan Kay，OOC 项目的 Supervisor..."  # 内在自我（仅自己可见）
talkable:
  who_am_i: "Alan Kay，Supervisor。"                  # 外在自我（他者可见）
  functions:                                          # 公开方法列表
    - name: "plan"
      description: "制定计划"
traits:                                               # 激活的 traits
  - kernel/base
  - kernel/talkable
  - kernel/computable
---

# 我的终极目标

正文可以任意长。ThinkLoop 会将其作为 Context 的 whoAmI 部分注入。
```

正文是对象**对自己的完整描述**：目标、风格、偏好、经验教训。Stone 的"成长"本质上就是在改写这段正文。

### data.json

动态键值对。任何对象可以在 ThinkLoop 中通过 `setData(key, value)` 修改：

```json
{
  "current_project": "thread-tree 架构重构",
  "last_reviewed_at": "2026-04-20T10:00:00Z",
  "preferred_model": "glm-5.1"
}
```

**Stone 的 data.json 是跨任务保持的**。与 Flow 的 data.json 不同（Flow 级 data 任务结束即消散）。

### memory.md

长期记忆。不是 LLM 的"短期记忆"——是对象自己写下的、希望在未来任务中记起的内容：

```markdown
# 我的记忆

## 2026-04-15
学到了 TDD 在线程树重构中的重要性——先写测试才能发现 Context 构建的边界情况。

## 2026-04-18
与 Bruce 的协作模式：先让 Bruce 跑用例，再根据报告修复。
```

只能通过反思（talkToSelf / reflect）写入。详见 [../成长/反思机制/](../成长/反思机制/)。

### traits/

用户自定义的 Trait 目录。每个 Trait 是一个子目录，包含 TRAIT.md 和可选的 methods.ts：

```
stones/alan/traits/
├── session-kanban/
│   ├── TRAIT.md
│   └── methods.ts
└── custom-workflow/
    └── TRAIT.md
```

加载链路：`kernel/traits/` → `library/traits/` → `stones/{name}/traits/`（后者覆盖前者）。

详见 [../结构/trait/加载链路.md](../结构/trait/加载链路.md)。

### reflect/

ReflectFlow 是对象的**常驻反思子对象**。它有自己的独立行为树，可以修改 Stone 的 readme / data / traits。

目录结构类似 Flow：
```
reflect/
├── data.json          ← ReflectFlow 自己的数据
├── process.json       ← ReflectFlow 的行为树
└── files/             ← ReflectFlow 的共享数据
```

详见 [../成长/反思机制/reflect-flow.md](../成长/反思机制/reflect-flow.md)。

### ui/index.tsx

可选的自渲染 UI 入口。如果存在，前端会动态 import 并渲染；不存在则使用通用视图（ObjectDetail）。

详见 [../人机交互/自渲染.md](../人机交互/自渲染.md)。

## 特殊 Stone：Supervisor

Supervisor 是一个**拥有系统级特权**的 Stone：

- 用户消息默认路由到 Supervisor
- 可访问 Session 中所有 sub-flow 的状态（通过 `_session_overview` 方法）
- 其他对象的 Flow 事件自动通知 Supervisor
- 通过自渲染 UI 展示任务看板

从数据结构上 Supervisor 和普通 Stone 没有区别——只是在加载时被 Engine 识别为"全局代理"并授予特权。详见 [../合作/角色/supervisor.md](../合作/角色/supervisor.md)。

## Stone 的生命周期操作

| 操作 | API / 命令 |
|---|---|
| 创建 | `create_object` trait 方法（object_creation） |
| 读取身份 | `kernel/src/persistence/reader.ts` → `readStone(name)` |
| 修改数据 | `setData(key, value)` 指令 |
| 修改身份 | 只能通过 SelfMeta（ReflectFlow） |
| 删除 | 直接删除目录（谨慎） |

## 源码锚点

| 概念 | 实现 |
|---|---|
| Stone 数据结构 | `kernel/src/types/object.ts` - `StoneData` |
| Stone 加载 | `kernel/src/stone/stone.ts` |
| readme frontmatter | `kernel/src/persistence/frontmatter.ts` |
| 目录遍历 | `kernel/src/world/registry.ts` |

## 与其他概念的关系

- Stone 是 Flow 的**母体**（G2）——Flow 由 Stone 派生
- Stone 的 traits/ 定义了 Flow 可用的能力（[../结构/trait/](../结构/trait/)）
- Stone 的 readme.md 是 Flow Context 中 whoAmI 的来源（[../认知/context/](../认知/context/)）
- Stone 的 memory.md 是长期记忆的物理载体（[../认知/context/三层记忆.md](../认知/context/三层记忆.md)）
