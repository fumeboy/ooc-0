---
activates_on: {"object::root": "show_content"}
---

# method 集生效路径与自改边界

custom window 上的 object method 有两条调用入口，共享同一份 `window.methods` 字典（字段名与 `ObjectMethod` 形状权威见 self-written-method-hot-reload）；只是入口形态不同。

## 调用路径

**路径 A：LLM 经 exec 直调（推荐）**

```
exec(window_id="<self_object_id>", method="<name>", args={ ... })
```

与 `do_window.continue` / `talk_window.say` 完全同构（window id/type 约定见 self.md）。custom dispatcher 在取出 `methods[<name>].exec` 时包一层 `programSelf` 注入到 ctx，对 manager.submit 透明。

**路径 B：ts/js sandbox 里 `self.callMethod`（脚本编排）**

```
await self.callMethod("<window_id>", "<method>", { ... })
```

只在 program 的 ts/js sandbox 内可用（`ProgramSelf.callMethod`）。不仅可调 custom window 的 method，也可调 do/talk/file 等任意 window 上已注册 method，用于一段脚本里编排多步调用。**已知边界**：`callMethod` 直接索引 `getObjectDefinition(type).methods[method]`（`self.ts:41`），不走 `resolveMethod` 沿 parentClass 链回退；继承自父 class 的 method 经此路径取不到，只能取本 class 自身声明的 method。

> 已退役：旧的 `program.callMethod / function 子模式`（`exec(method="program", args={window_id, method, ...})` 当 meta-call 通道）已删；program 现在只剩 shell/ts/js 三种语言模式（`runtime.ts:10-13`）。元调用统一收敛到上面两条。

UI / agent-native 客户端走第三条独立通道：HTTP `callMethod` → `loadUiServerMethods` 拿 `ui_methods` 字典执行（`ui_methods` 归 **visible** 维度，不归我）。`window.methods`（LLM 路径，`ObjectMethod` 形状）与 `ui_methods`（HTTP 路径，`UiServerMethod` 形状）形状不同、各写各的，不互相代替；都需要则写两份。

## 演化与生效

演化自身 self window 的标准路径：

1. 触发点（典型：reflectable 的反思请求，或显式 write_file 指令）。
2. super flow 经 `exec(method="write_file", path="stones/<self>/executable/index.ts", content="...")` 重写源码。
3. 下一次调 method 时 loader 看到 mtime 变化 → 重新 import → 新形态生效（详见 self-written-method-hot-reload）。

写新 method 须遵守 `ObjectMethod` 形状（字段构成、已删字段权威见 self-written-method-hot-reload）——清晰的 schema 与 intent 直接影响 LLM 的调用质量。

## 自改 method 集的边界（跨切未决）

- **per-object isolation**：`executable/index.ts` 在 `stones/<self>/` 下而非 `flows/<sid>/`，同一 Object 跨 session 共享同一份 self window；多 session 并发调用共享 loader 缓存，mtime 变化对所有 session 一起生效。session 特化逻辑应在 method 内经 `ctx.thread` / `self.getData` 区分，而非 fork 新 server。
- **生效需 main-canonical**：method 集 / readable 为全局 main-canonical；per-session worktree 里改的 method 须经 reflectable `evolve_self` 合入 main 后重注册才对所有 session 生效。
- **维度劈分**：自写 method 落 object method（经 `registerExecutable`，自写 `executable/index.ts` 热更）。两入口注册 / 同名 fail-loud 的完整劈分机制详见 readable 维度 knowledge/readable-registration。
- **谁可以写不由本维度规定**：programmable 只描述 *如何写* 才生效（mtime 热更条件）。路径权限 / 是否允许 super flow 自动写 → 由 reflectable.business_task_isolation + caller 显式请求决定。自改 `executable/index.ts` 当前无硬 deny——权威落点 executable/knowledge/permission.md「deny 档当前 0 项」待办。
- **HTTP 写直 commit main**：HTTP 写 stone 入口直接 commit main（`httpDirectMainWrite`），立即生效；`versionedStoneWrite` / `openMetaprogWorktree` 已于 2026-06-09 删除。
