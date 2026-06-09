---
activates_on: {"window::root": "show_content"}
---

# method 集生效路径与自改边界

custom window 上的 object method 有两条调用入口，共享同一份 `window.methods` 字典（注意是 `methods`，不是 `commands`——command→method 重命名后统一）；只是入口形态不同。

## 调用路径

**路径 A：LLM 经 exec 直调（推荐）**

```
exec(window_id="<self_object_id>", method="<name>", args={ ... })
```

与 `do_window.continue` / `talk_window.say` 完全同构。window.id=window.type=objectId，**不再有 `custom:` 前缀**（2026-06-01 Object Unification 起）。custom dispatcher 在取出 `methods[<name>].exec` 时包一层 `programSelf` 注入到 ctx，对 manager.submit 透明。

**路径 B：ts/js sandbox 里 `self.callMethod`（脚本编排）**

```
await self.callMethod("<window_id>", "<method>", { ... })
```

只在 program 的 ts/js sandbox 内可用（`ProgramSelf.callMethod`）。不仅可调 custom window 的 method，也可调 do/talk/file 等任意 window 上已注册 method，用于一段脚本里编排多步调用。

> 已退役：旧的 `program.callMethod / function 子模式`（`exec(method="program", args={window_id, method, ...})` 当 meta-call 通道）已删；program 现在只剩 shell/ts/js 三种语言模式（`runtime.ts:10-13`）。元调用统一收敛到上面两条。

UI / agent-native 客户端走第三条独立通道：HTTP `callMethod` → `loadUiServerMethods` 拿 `ui_methods` 字典执行。`window.methods`（LLM 路径，`ObjectMethod` 形状）与 `ui_methods`（HTTP 路径，`UiServerMethod` 形状）形状不同、各写各的，不互相代替；都需要则写两份。

概念权威：`packages/@ooc/meta/object.doc.ts:3915` 节点 `programmable.custom_window_invocation`。

## 演化与生效

演化自身 self window 的标准路径（`programmable.window_evolution`，`object.doc.ts:3948`）：

1. 触发点（典型：reflectable 的反思请求，或显式 write_file 指令）。
2. super flow 经 `exec(method="write_file", path="stones/<self>/executable/index.ts", content="...")` 重写源码。
3. 下一次调 method 时 loader 看到 mtime 变化 → 重新 import → 新形态生效（详见 self-written-method-hot-reload）。

写新 method 须遵守 `ObjectMethod` 形状（`exec` / `paths` / `intent` 必填）；`schema` / `onFormChange` / `permission` 可选但建议补全（旧的 `match` / `knowledge` 字段已删）——清晰的 schema 与 intent 直接影响 LLM 的调用质量。

## 自改 method 集的边界（跨切未决）

- **per-object isolation**：`executable/index.ts` 在 `stones/<self>/` 下而非 `flows/<sid>/`，同一 Object 跨 session 共享同一份 self window；多 session 并发调用共享 loader 缓存，mtime 变化对所有 session 一起生效。session 特化逻辑应在 method 内经 `ctx.thread` / `self.getData` 区分，而非 fork 新 server。
- **生效需 main-canonical**：method 集 / readable 为全局 main-canonical；per-session worktree 里改的 method 须经 reflectable `evolve_self` 合入 main 后重注册才对所有 session 生效。
- **维度劈分**：object method（操作数据）经 `registerExecutable` 注册，readable 的 window method（控展示）经 `registerReadable` 注册（`runtime/object-registry.ts:115,131`）；二者同名会 fail-loud。自写 method 落的是前者。
- **谁可以写不由本维度规定**：programmable 只描述 *如何写* 才生效（mtime 热更条件）。路径权限 / 是否允许 super flow 自动写 → 由 reflectable.business_task_isolation + caller 显式请求决定。自改 `executable/index.ts` 当前无硬 deny（write_file 弱 ask）——这是 executable/programmable 共担的显式技术债。
- **HTTP 写直 commit main**：HTTP 写 stone 入口直接 commit main（`httpDirectMainWrite`），立即生效；`versionedStoneWrite` / `openMetaprogWorktree` 已于 2026-06-09 删除。
