# call_function Form 指令设计

> 日期：2026-04-12
> 状态：Draft
> 作者：Alan Kay + Claude

## 1. 背景与动机

当前 OOC 对象有两种调用 trait 方法的方式：
1. **通过 program**：`[program.submit]` → 在沙箱中写 JS 代码调用 `readFile(...)` 等
2. **通过内置指令**：`[talk.submit]`、`[return.submit]` 等硬编码指令

trait 方法只能在 `[program]` 沙箱中调用，对象必须先 begin program、写代码、submit。
对于简单的函数调用（如读一个文件），这个流程过重。

## 2. 设计目标

新增 `[call_function]` form 指令，让对象可以直接通过 form 调用任何 trait 方法，
不需要包在 `[program]` 里写代码。

## 3. TOML 格式

### 3.1 begin

```toml
[call_function.begin]
trait = "kernel/computable/file_ops"
function_name = "readFile"
description = "读取 meta.md 了解项目背景"
```

系统行为：
- 自动 `activateTrait("kernel/computable/file_ops")`（如果未激活）
- 返回 form_id
- 注入 inject action 确认

### 3.2 submit

```toml
[call_function.submit]
form_id = "f_001"
args = { path = "docs/meta.md" }
```

系统行为：
- 从 MethodRegistry 查找 `file_ops.readFile` 方法
- 执行 `readFile(ctx, "docs/meta.md")`
- 将返回值注入为 inject action（JSON 格式化）
- 引用计数 -1，如果为 0 则 deactivateTrait

### 3.3 cancel

```toml
[call_function.cancel]
form_id = "f_001"
```

## 4. 与 program 的关系

两种方式并存，对象自由选择：

| 场景 | 推荐方式 | 理由 |
|------|---------|------|
| 单个函数调用 | `[call_function]` | 简洁，不需要写代码 |
| 多步逻辑、条件判断 | `[program]` | 需要 JS 控制流 |
| 组合多个函数 | `[program]` | 一次执行多个调用 |

## 5. Parser 变更

`call_function` 作为一种 form command 类型，复用现有的 `[xxx.begin/submit/cancel]` 解析。

`FormBeginDirective` 新增可选字段：

```typescript
interface FormBeginDirective {
  command: string;        // "call_function"
  description: string;
  /** call_function 专用：目标 trait */
  trait?: string;
  /** call_function 专用：函数名 */
  functionName?: string;
}

interface FormSubmitDirective {
  command: string;        // "call_function"
  formId: string;
  params: Record<string, unknown>;  // 含 args 字段
}
```

parser 在解析 `[call_function.begin]` 时，额外提取 `trait` 和 `function_name` 字段。

## 6. Engine 处理

### 6.1 begin

```
iterResult.formBegin = { command: "call_function", trait: "kernel/computable/file_ops", functionName: "readFile", description: "..." }
    ↓
engine:
  1. FormManager.begin("call_function", description) → form_id
  2. 将 trait + functionName 存入 ActiveForm 的扩展字段
  3. await tree.activateTrait(threadId, trait)
  4. 注入 inject action
```

### 6.2 submit

```
iterResult.formSubmit = { command: "call_function", formId: "f_001", params: { args: { path: "docs/meta.md" } } }
    ↓
engine:
  1. FormManager.submit(formId) → form（含 trait + functionName）
  2. 从 MethodRegistry 查找方法
  3. 构建 MethodContext
  4. 执行函数：result = await method.fn(ctx, ...argValues)
  5. 将 result 注入为 inject action（JSON.stringify）
  6. 如果引用计数 = 0 → deactivateTrait
```

### 6.3 错误处理

- trait 不存在 → 注入错误 inject
- 函数不存在 → 注入错误 inject
- 执行异常 → 注入错误 inject（含 error message）

## 7. ActiveForm 扩展

```typescript
interface ActiveForm {
  formId: string;
  command: string;
  description: string;
  createdAt: number;
  /** call_function 专用 */
  trait?: string;
  /** call_function 专用 */
  functionName?: string;
}
```

## 8. 模块改动

| 文件 | 改动 |
|------|------|
| `thread/parser.ts` | FormBeginDirective 新增 trait/functionName 字段；解析 `[call_function.begin]` 时提取 |
| `thread/form.ts` | ActiveForm 新增 trait/functionName 可选字段；begin() 支持传入扩展字段 |
| `thread/engine.ts` | formSubmit 处理中，当 command === "call_function" 时执行函数调用逻辑 |
| `traits/base/TRAIT.md` | 可用指令列表新增 `call_function` |

## 9. 测试

| 测试 | 覆盖 |
|------|------|
| parser | `[call_function.begin]` 解析（含 trait/function_name 字段） |
| parser | `[call_function.submit]` 解析（含 args） |
| form | ActiveForm 扩展字段持久化 |

## 10. 示例

```toml
# 读取文件（简洁方式）
[call_function.begin]
trait = "kernel/computable/file_ops"
function_name = "readFile"
description = "读取项目文档"

# 系统返回 form_id，加载 file_ops trait

[call_function.submit]
form_id = "f_001"
args = { path = "docs/meta.md", limit = 100 }

# 系统执行 readFile(ctx, "docs/meta.md", { limit: 100 })
# 结果注入为 inject action
```

等价的 program 方式：

```toml
[program.begin]
description = "读取项目文档"

[program.submit]
form_id = "f_002"
code = """
const content = await readFile("docs/meta.md", { limit: 100 });
return content;
"""
```
