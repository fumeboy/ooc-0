# FormManager — Form 生命周期管理器

> 跟踪活跃 form 的生命周期，驱动 trait 的激活/卸载，防止泄漏。

## Form 是什么

每次 `open` 产生一个 Form：

```typescript
interface Form {
  id: string;                 // form_id
  type: "command" | "trait" | "skill";
  command?: string;           // type=command 时
  name?: string;              // type=trait 或 skill 时
  description: string;
  status: "open" | "submitted" | "cancelled";
  activatedTraits: string[];  // 这个 form 触发激活了哪些 trait
  createdAt: number;
  threadId: string;
}
```

## FormManager 的职责

```typescript
class FormManager {
  begin(threadId, { type, command, name, description }): formId  // open
  submit(formId, args): void                                      // submit
  cancel(formId): void                                            // close 或线程 return

  getActive(threadId): Form[]                                     // activeForms
  findByCommand(threadId, command): Form | null                   // 防重复 open 同 command
}
```

## 生命周期流程

```
begin(open)
  → Form 状态 open
  → activatedTraits 记录本次 open 激活的 trait
  → 返回 formId

submit(formId, args)
  → 验证 form status == open
  → 根据 form.command 执行
  → Form 状态 → submitted
  → 释放 activatedTraits（refcount--）

cancel(formId)
  → 验证 form status == open
  → 释放 activatedTraits
  → Form 状态 → cancelled
```

## activeForms 的用途

当前线程所有 status=open 的 form 组成 `activeForms`，进入 Context 的 activeForms 字段：

```
活跃表单：
  - form_id: f_001
    type: command
    command: program
    description: "写入配置文件"
    opened_at: "10 轮前"

  - form_id: f_002
    type: trait
    name: kernel/computable/file_ops
    description: "查看文件操作 API"
    opened_at: "3 轮前"
```

让 LLM **记住**自己已 open 但未 submit 的任务，避免遗忘。

## 防止 trait 泄漏

如果没有 FormManager，可能出现：

```
open(command=program) → activateTrait(computable)
... （几十轮过去，LLM 忘了当初 open 的意图）...
线程 return → 但 trait 没人 deactivate → 永久占用内存
```

FormManager 保证：

1. 每个 form 关联 activatedTraits
2. form 结束（submit/cancel）时释放
3. 线程 return 时**所有 open form 自动 cancel**

无论 LLM 是否记得 close，trait 都会被正确释放。

## Refcount 配合

同一 trait 可能被多个 form 激活。FormManager 记录"每个 form 激活了什么"，真正的 refcount 在 `tree.ts` 的 activateTrait 内部维护：

```
form_1.activatedTraits = [computable]  → activateTrait(computable) → refcount=1
form_2.activatedTraits = [computable]  → activateTrait(computable) → refcount=2
form_1 submit → deactivateTrait(computable) → refcount=1
form_2 submit → deactivateTrait(computable) → refcount=0  （真正卸载）
```

## 与 open / submit / close 的职责划分

| 组件 | 职责 |
|---|---|
| **Tool 层**（open/submit/close 四原语） | LLM 交互接口 |
| **Engine** | 解析 tool call，分派给 FormManager |
| **FormManager** | 跟踪 form 生命周期 |
| **tree.ts** | 实际管理线程的 activatedTraits + refcount |

## 实现位置

```
kernel/src/thread/form.ts           ← FormManager 主逻辑
kernel/src/thread/engine.ts         ← 调用 FormManager 的入口
kernel/src/thread/tree.ts           ← trait 激活 / 卸载（被 FormManager 调用）
```

## 源码锚点

| 概念 | 实现 |
|---|---|
| FormManager 类 | `kernel/src/thread/form.ts` |
| Form 类型 | `kernel/src/types/thread.ts`（或 form.ts 内） |
| activateTrait / deactivateTrait | `kernel/src/thread/tree.ts` |

## 与基因的关联

- **G5**（Context 即世界）— FormManager 让 activeForms 进入 Context
- **G3**（trait 是自我定义）— Form 是 trait 激活的"触发器"
