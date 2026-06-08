---
activates_on: {"window::root": "show_content"}
---

# 命令集生效路径与自改边界

custom window 上的命令有两条调用入口，共享同一份 `window.commands` 字典；只是入口形态不同。

## 调用路径

**路径 A：直接 open custom window 的 command（推荐）**

```
exec(window_id="custom:<self>", command="<name>", args={ ... })
```

与 `do_window.continue` / `talk_window.say` 完全同构。custom dispatcher 在取出 `commands[<name>].exec` 时包一层 self 注入，对 manager.submit 透明。

**路径 B：program.callCommand 通用元操作通道**

```
exec(command="program", args={ window_id: "custom:<self>", command: "<name>", args: {...} })
```

或 ts/js exec 里 `await self.callCommand("custom:<self>", "<name>", { ... })`。callCommand 不仅可调 custom window 的命令，也可调 do/talk/file 等任意 window 上已注册命令。

UI / agent-native 客户端走第三条独立通道：HTTP `callMethod` → `loadUiServerMethods` 拿 `ui_methods` 字典执行。`window.commands`（LLM 路径，`ObjectMethod` 形状）与 `ui_methods`（HTTP 路径，`UiServerMethod` 形状）形状不同、各写各的，不互相代替；都需要则写两份。

概念权威：`packages/@ooc/meta/object.doc.ts:3900` 节点 `programmable.custom_window_invocation`。

## 演化与生效

演化自身 self window 的标准路径（`programmable.window_evolution`）：

1. 触发点（典型：reflectable 的反思请求，或显式 write_file 指令）。
2. super flow 经 `exec(command="write_file", path="stones/<self>/executable/index.ts", content="...")` 重写源码。
3. 下一次调命令时 loader 看到 mtime 变化 → 重新 import → 新形态生效（详见 self-written-method-hot-reload）。

写新命令须遵守 `ObjectMethod` 形状（exec 必填）；paths / match / knowledge 可选但建议补全——LLM 在 callCommand 模式下会看见对应 knowledge entry，写得清楚直接影响调用质量。

## 自改命令集的边界（跨切未决）

- **per-object isolation**：`executable/index.ts` 在 `stones/<self>/` 下而非 `flows/<sid>/`，同一 Object 跨 session 共享同一份 self window；多 session 并发调用共享 loader 缓存，mtime 变化对所有 session 一起生效。session 特化逻辑应在命令内经 `ctx.thread` / `self.getData` 区分，而非 fork 新 server。
- **生效需 main-canonical**：命令集 / readable 为全局 main-canonical；per-session worktree 里改的命令须经 reflectable `evolve_self` 合入 main 后重注册才对所有 session 生效。
- **谁可以写不由本维度规定**：programmable 只描述 *如何写* 才生效（mtime 热更条件）。路径权限 / 是否允许 super flow 自动写 → 由 reflectable.business_task_isolation + caller 显式请求决定。自改 `executable/index.ts` 当前无硬 deny（write_file 弱 ask）——这是 executable/programmable 共担的显式技术债。
- **HTTP 写直 commit main**：HTTP 写 stone 入口（`putSelf` / `putServerSource`）直接 commit main，立即生效；`versionedStoneWrite` / `openMetaprogWorktree` 已于 2026-06-09 删除。
