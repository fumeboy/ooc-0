# open — 打开上下文

> 声明"我要做什么"，系统加载相关知识并返回 `form_id`。

## 三种类型

| type | 用途 | 加载内容 |
|---|---|---|
| `command` | 执行指令（program / talk / return 等） | command 关联的 trait |
| `trait` | 加载 trait 知识 | 指定 trait 的 readme |
| `skill` | 加载 skill 内容 | 指定 skill 的 SKILL.md |

## command 类型

```typescript
open({
  type: "command",
  command: "program",
  description: "写入配置文件"
})
// → { form_id: "f_001" }
```

### 参数

- `command` (必填): 指令名称（`program` / `talk` / `talk_sync` / `return` / `create_sub_thread` 等）
- `description` (必填): 描述此次 open 的目的（用于 activeForms 展示、便于回看）

### 效果

1. FormManager 创建一个 form（type=command, command=X, status=open）
2. 通过 `collectCommandTraits(X)` 找到所有 `command_binding` 包含 X 的 trait
3. 对每个 trait：`activateTrait(trait, threadId)`，refcount++
4. 下一轮 Context 构建时，激活的 trait 的 readme 注入 `instructions / knowledge`

### 为什么需要 open 而非直接调用

很多 Agent 系统"直接 tool call"就能执行。OOC 为什么要 open + submit 两步？

**答：分离"声明意图"和"执行"**。两步之间：
- Context 有机会**包含**该指令的知识（让 LLM 参考准确的 API 签名再 submit）
- 可以 **close 取消**（发现选错了命令）
- 支持 **defer hook**（在 submit 之前注入提示）

## trait 类型

```typescript
open({
  type: "trait",
  name: "kernel/computable/file_ops",
  description: "需要详细的文件操作 API"
})
// → { form_id: "f_002" }
```

### 参数

- `name` (必填): trait 的完整路径名
- `description` (必填): 为何加载

### 效果

直接 `activateTrait(name, threadId)`。trait 的 readme 进入 Context 的 `knowledge`（Progressive Disclosure 的 Level 3）。

**无需 submit**——trait 是知识窗口，不是可执行的指令。close 时卸载。

### 典型用法

当 LLM 在 Level 2 看到子 trait 描述后，决定激活某个子 trait：

```
父 trait computable 已激活，Level 2 中看到：
  - file_ops: 文件操作详细说明
  - shell_exec: shell 命令执行

LLM: 我要写文件，需要完整的 file_ops 文档
  → open(type=trait, name=kernel/computable/file_ops)
```

## skill 类型

```typescript
open({
  type: "skill",
  name: "claude-api"
})
// → { form_id: "f_003" }
```

### 参数

- `name` (必填): skill 的名称

### 效果

加载 `library/skills/{name}/SKILL.md` 的全部内容到 Context。

### trait vs skill

| 维度 | trait | skill |
|---|---|---|
| 位置 | kernel/library/stone 三层 | 主要在 library/skills/ |
| 有方法？ | 可以（methods.ts） | 通常只有文档 |
| 有 command_binding？ | 可以 | 无 |
| 用途 | 长期能力 | 按任务加载的专项指南 |

skill 更像"可按需加载的 markdown 文档"，trait 更像"带有代码的能力单元"。

## form_id

open 返回 `form_id`，后续 submit / close 必须带此 id：

```typescript
const { form_id } = await open(...)
await submit({ form_id, ...args })
await close({ form_id })
```

form_id 让系统跟踪"哪个 form 属于哪次 open"，避免参数混乱。

## 同时 open 多个

一个线程可以同时持有多个 open 的 form：

```
open(command=program, description="写配置") → f_001
open(command=program, description="写日志") → f_002
open(type=trait, name=library/browser) → f_003
```

activeForms 字段会展示这些 form。submit 时按 form_id 区分。

## 附加 mark 参数

任意 tool call（包括 open）都可以附带 `mark`：

```typescript
open({
  type: "command",
  command: "program",
  description: "...",
  mark: { id: "msg-123", action: "ack" }  // 同时确认消息 msg-123
})
```

详见 [mark.md](mark.md)。

## 源码锚点

| 概念 | 实现 |
|---|---|
| open tool 定义 | `kernel/src/thread/tools.ts` |
| handleOpen | `kernel/src/thread/engine.ts` |
| collectCommandTraits | `kernel/src/thread/hooks.ts` |
| FormManager.begin | `kernel/src/thread/form.ts` |
