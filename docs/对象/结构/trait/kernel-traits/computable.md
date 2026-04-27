# kernel/computable — 代码执行能力

> 对象通过输出 JavaScript 代码来行动。沙箱执行，返回结果。

## 基本信息

```yaml
name: kernel/computable
type: how_to_think
activates_on:
  show_content_when: [program]
description: 代码执行能力 — 文件操作、搜索、Shell 命令、数据管理
```

## 如何使用

```
open(title="执行代码", type=command, command=program, description="...")
  → form_id
refine(form_id, { code: "..." })
submit(title="执行代码", form_id)
  → 执行结果（print 的输出）
```

submit 时提交 JavaScript 代码，沙箱执行，通过 `print(...)` 收集输出。

## 核心 API

| API | 作用 |
|---|---|
| `print(...args)` | 输出结果（必须用 print，不要用 console.log） |
| `readFile(path, opts?)` | 读文件，不存在返回 null |
| `writeFile(path, content)` | 原子写文件 |
| `appendFile(path, content)` | 追加写入 |
| `listDir(path)` | 列出目录 |
| `setData(key, value)` | 写 data.json |
| `getData(key)` | 读 data.json |
| `talk(target, msg, wait=true)` | 同步等待其他对象回复 |

完整 API 在子 trait 中详细说明：

## 子 Trait

```
kernel/computable/
├── program_api       ← 完整 API 参考文档
├── file_ops          ← 文件操作详细说明（readFile / writeFile / ...）
├── file_search       ← glob / grep 详细说明
├── shell_exec        ← exec / sh 命令执行
├── web_search        ← 互联网搜索
└── testable          ← 测试执行能力
```

每个子 trait 是 Progressive Disclosure 的 Level 3 内容——在需要时通过 `open(title="加载文件操作文档", type=trait, name=kernel/computable/file_ops, description="查看 file_ops API")` 按需加载。

## 沙箱环境

`program` 在沙箱中执行，限制：

- 不能 `require` 任意 npm 模块（只有白名单 + trait 注入的方法）
- 不能访问任意文件系统（只能在当前对象目录 + Session 目录下操作）
- 不能直接访问网络（除非激活了 web_search）
- 有执行时间上限（防止死循环）

### 沙箱中可用的方法来源

1. **program_api** 提供的核心 API（readFile、setData 等）
2. **当前激活的 trait** 通过 `methods.ts` 注入的方法
3. **JavaScript 内置**（JSON、Promise、Array、String 等）

当 LLM 激活了多个 trait（如 computable + kanban），所有这些 trait 的 methods 都会出现在沙箱的全局作用域里。

## 为什么是 JavaScript

选择 JavaScript 而非其他语言的原因：

- **LLM 训练集里 JS 代码最多** → 生成质量高
- **异步模型匹配** → async/await 直接对应 OOC 的并发语义
- **JSON native** → 数据交换零开销
- **V8/Bun 快** → 沙箱开销可控

## 错误处理

沙箱抛出的错误会：

1. 进入当前线程的 actions 历史
2. 如果激活了 debuggable trait，触发 `when_error` hook 注入调试提示
3. 作为 submit 的返回结果呈现给 LLM

错误不会自动导致线程 fail——LLM 决定如何处理。

## 源码锚点

| 概念 | 实现 |
|---|---|
| Trait 定义 | `kernel/traits/computable/TRAIT.md` + 子目录 |
| 沙箱执行器 | `kernel/src/executable/` |
| 核心 API 实现 | `kernel/src/executable/api/` |
| submit(program) 处理 | `kernel/src/thread/engine.ts` |

## 与其他 trait 的组合

- **computable + debuggable** → 遇到错误时自动按四阶段调试
- **computable + verifiable** → 不能在没运行验证代码的情况下 claim 完成
- **computable + talkable** → 能跨对象调用方法（`talk(target, {method, args}, wait=true)`）

## 与基因的关联

- **G4**（对象通过输出程序来行动）— 本 trait 是 G4 的工程实现
- **G8**（Effect 与 Space）— program 的每次执行产生 Effect
