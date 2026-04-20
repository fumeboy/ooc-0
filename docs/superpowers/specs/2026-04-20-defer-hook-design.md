# Defer Hook — 运行时 Command Hook 注册

> 日期: 2026-04-20
> 状态: 设计完成

## 背景

灵感来自 Go 的 `defer` 语法。在 OOC 线程树中，线程 = 函数，`return` = 函数返回。
Object 在执行过程中经常需要"收尾提醒"——产出报告、记录状态、git commit 等。
当前 Hook 系统只支持 `before/after` 两种生命周期事件，无法绑定到具体 command。

## 设计

### 核心思路

扩展现有 `ThreadFrameHook.event` 的值域，新增 `on:{command}` 模式。
新增 `defer` command，Object 通过 `open(command=defer) + submit` 注册 hook。

### 类型变更

```typescript
// thread/types.ts — 扩展 event 类型
interface ThreadFrameHook {
  event: "before" | "after" | `on:${string}`;  // 新增 on:command 模式
  traitName: string;    // defer 注册时填空字符串
  content: string;      // 注入的提示文本
  once?: boolean;       // 默认 true
}
```

### defer command

- 注册方式: `open(type=command, command=defer)` → `submit(form_id, { command: "return", content: "..." })`
- submit 参数:
  - `command`: 目标 command 名（return/talk/program 等）
  - `content`: 提示文本
  - `once`: 可选，默认 true（触发一次后自动移除）

### 触发机制

Engine 在 submit 任意 command 时，收集当前线程 `hooks[]` 中 `event === "on:{command}"` 的条目，
将 content 合并注入到该 command 执行结果的 action 中。

注入格式:
```
>>> [defer 提醒 — {command}]
- 提醒内容 1
- 提醒内容 2
```

触发后，`once !== false` 的 hook 自动从 `hooks[]` 中移除。

### 作用域

- Hook 存储在 `ThreadDataFile.hooks[]`
- 生命周期 = 线程生命周期，线程 return 后随线程数据一起归档
- 不继承到子线程

### 不需要关联 Trait

defer 是轻量 command，不需要 command_binding 关联 trait。
Engine 直接处理，无需加载额外知识。

## 实现清单

1. `thread/types.ts` — 扩展 `ThreadFrameHook.event` 类型注释
2. `thread/tools.ts` — command enum 新增 `"defer"`
3. `thread/hooks.ts` — 新增 `collectCommandHooks()` 函数
4. `thread/engine.ts` — defer submit 处理 + command submit 时注入 hook
5. `thread/engine.ts` — TOML 路径同步处理
6. 测试
