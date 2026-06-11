---
activates_on: {"object::root": "show_description"}
---

# 自写方法的热更（write 即生效）

一个 Object 的自定义 object method 表写在 `stones/<self>/executable/index.ts`：

```ts
export const window = {
  methods: {
    <name>: {
      description: "...",                // 必填：LLM 面向的方法描述
      onFormChange(change, { args }) {   // 可选：省略则免表单直接 exec
        return { tip: "...", intents: [{ name: "<name>" }], quick_exec_submit: true };
      },
      schema: { /* 可选：结构化参数渲染 + fail-soft 校验 */ },
      for_ui_access: true,               // 可选：标了它该方法才可经 HTTP call_method 被前端调
      exec: async (ctx) => { /* ctx.thread / ctx.self / ctx.args */ },
    },
  },
};
```

字段名是 **`methods`**（不是 `commands`——command→method 重命名后统一）。每条 entry 是头等的 `ObjectMethod`，与内置 window（do/talk/file）上的 method 完全同构：`description / intents? / onFormChange? / schema? / exec(ctx)`（+ `permission? / public? / for_ui_access?`）。`description` 必填；`onFormChange(change, { args })` 返回 `MethodExecuteForm`（`tip / intents / quick_exec_submit`），省略它的方法免表单直接 exec。旧 `paths` / `intent(args)` / `match` / `knowledge` 字段已删。**UI 可调机制（2026-06-11 起）= 给方法标 `for_ui_access: true`，不再有独立 `export const ui_methods` 维度**——HTTP `call_method` 只暴露 `window.methods` 里标了它的方法。`exec` 的 `ctx`（`MethodExecutionContext`，`method.ts:147`）= `thread? / self? / args / form?`；`ctx.programSelf`（`dir / callMethod / getData / setData / getThreadLocal / setThreadLocal`）只在 program_window 跑用户代码时由 dispatcher 注入（`builtins/program/executable/self.ts:9`）。canonical 类型 `ObjectMethod` 在 `packages/@ooc/core/_shared/types/method.ts:74`。

## 热更机制

加载与缓存由 `ServerLoader` 负责（`packages/@ooc/core/runtime/server-loader.ts:25`）：

- 按 `executable/index.ts` 的 mtime 缓存；mtime 未变则复用缓存条目，不重新 import。
- mtime 变化 → `import(\`${serverFile}?t=${serverMtime}\`)`（:87），`?t=mtime` query string 破坏 bun import cache，等价于强制 import 一份新模块。
- 只读具名 `export const window`（`mod.window`，:95）；同时加载同目录 `readable.ts`（:96，readable 维度的渲染函数），合并进 `window.readable`。
- 文件 ENOENT → 返回 undefined。
- 旧 `llm_methods` 导出出现 → 抛清晰硬切错误（:89-93，提示改写为 `export const window … { methods: { … } }`），不再静默吃掉。
- 接口：`loadObjectWindow`(:109) / `invalidateStone`(:114，按 stone 失效缓存) / `clearCache`(:123)；module-level wrapper `clearServerLoaderCache`(:144，测试清缓存)。readable.ts 合并进 `loadObjectWindow` 的 `window.readable`，无独立 `loadObjectReadable` / `loadUiMethods` 出口（ui_methods 维度已废）。

**生效路径**：super flow 经 `exec(method="write_file", path="stones/<self>/executable/index.ts", ...)` 重写源码 → 下一次 `exec(window_id="<self_object_id>", method=<new>)` 或 ts/js sandbox 里 `self.callMethod(...)` 触发时，loader 看到 mtime 变化 → 重新 import → 新形态立刻生效。不重启进程、不重新部署。

## 主动失效（hot-reload tier 1）

lazy mtime 检查只在「下次 import」时生效。tier 1 引入主动失效（`packages/@ooc/core/runtime/hot-reload.ts`）：`HotReloadWatcher` 递归 `fs.watch` `stones/`（50ms debounce）→ 按 objectId 聚类、`classifyChange` 分类（code / view / knowledge / identity）→ emit `stone:changed` → WorldRuntime 订阅后调 `ServerLoader.invalidateStone` 失效该 stone 缓存。不在 watcher callback 里直接 reimport——executable 可能有 syntax error，留给真正的消费者下次懒加载，错误栈更准确。tier 2（knowledge 增量 re-synthesis）/ tier 3（visible 浏览器 HMR）仍 TODO。

**caveat**：按 mtime 失效假设 FS 至少毫秒精度；秒级精度 FS 有「写完立刻读旧版」极短窗口，目前无 etag/hash 兜底。
