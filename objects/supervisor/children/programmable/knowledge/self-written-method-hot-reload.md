---
activates_on: {"object::root": "show_content"}
---

# 自写方法的热更（write 即生效）

一个 Object 的自定义 object method 表写在 `stones/<self>/executable/index.ts`：

```ts
export const window: StoneObjectDeclaration = {
  title: "<self>",
  description: "...",
  basicKnowledge: ({ programSelf }) => "...",
  methods: {
    <name>: {
      paths: ["<name>"],
      intent: (args) => [],
      onFormChange(change, { form }) { return []; },
      schema: { /* 可选：结构化参数渲染 + fail-soft 校验 */ },
      exec: async (ctx) => { /* ctx.programSelf / ctx.thread / ctx.args */ },
    },
  },
};
export const ui_methods = { /* visible 维度，HTTP callMethod 路径 */ };
```

字段名是 **`methods`**（不是 `commands`——command→method 重命名后统一）。每条 entry 是头等的 `ObjectMethod`，与内置 window（do/talk/file）上的 method 完全同构：`paths / intent(args) / onFormChange / schema / exec(ctx)`（+ `permission / public / for_ui_access`）。注意旧的 `match` / `knowledge` 字段已删（C7 后用 intent/onFormChange/schema 取代）。canonical 类型 `ObjectMethod` 在 `packages/@ooc/core/_shared/types/method.ts:48`。

## 热更机制

加载与缓存由 `ServerLoader` 负责（`packages/@ooc/core/runtime/server-loader.ts:21`）：

- 按 `executable/index.ts` 的 mtime 缓存；mtime 未变则复用缓存条目，不重新 import。
- mtime 变化 → `import(\`${serverFile}?t=${serverMtime}\`)`（:78），`?t=mtime` query string 破坏 bun import cache，等价于强制 import 一份新模块。
- 同时加载同目录 `readable.ts`（:86-97，readable 维度的渲染函数）。
- 文件 ENOENT → 返回 undefined。
- 旧 `llm_methods` 导出出现 → 抛清晰硬切错误（:80-84，提示改写为 `export const window … { methods: { … } }`），不再静默吃掉。
- 接口：`loadObjectWindow`(:113) / `loadUiServerMethods`(:118) / `loadObjectReadable`(:123) / `invalidateStone`(:128，按 stone 失效缓存) / `clearCache`(:137)；module-level wrapper `clearServerLoaderCache`(:168，测试清缓存)。

**生效路径**：super flow 经 `exec(method="write_file", path="stones/<self>/executable/index.ts", ...)` 重写源码 → 下一次 `exec(window_id="<self_object_id>", method=<new>)` 或 ts/js sandbox 里 `self.callMethod(...)` 触发时，loader 看到 mtime 变化 → 重新 import → 新形态立刻生效。不重启进程、不重新部署。

## 主动失效（hot-reload tier 1）

lazy mtime 检查只在「下次 import」时生效。tier 1 引入主动失效（`packages/@ooc/core/runtime/hot-reload.ts`）：`HotReloadWatcher` 递归 `fs.watch` `stones/`（50ms debounce）→ 按 objectId 聚类、`classifyChange` 分类（code / view / knowledge / identity）→ emit `stone:changed` → WorldRuntime 订阅后调 `ServerLoader.invalidateStone` 失效该 stone 缓存。不在 watcher callback 里直接 reimport——executable 可能有 syntax error，留给真正的消费者下次懒加载，错误栈更准确。tier 2（knowledge 增量 re-synthesis）/ tier 3（visible 浏览器 HMR）仍 TODO。

**caveat**：按 mtime 失效假设 FS 至少毫秒精度；秒级精度 FS 有「写完立刻读旧版」极短窗口，目前无 etag/hash 兜底。
