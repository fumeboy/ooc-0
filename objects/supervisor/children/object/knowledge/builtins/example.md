---
title: _builtin/example — 建 class 时照抄的最小样板 class（construct / object method / readable / persistable）
description: example 家族单一权威——以 self × 各维度透视：data={message,bumpCount} 的 self、readable 投影成单一 example 窗、executable 的 bump method、自定义 persistable 落 JSON、无 visible、非单例有 construct；它以最小代码量演示 self 的五处可自定义点，是 example.md 逐文件骨架的可运行对照
activates_on:
  "object::root": "show_description"
---

# _builtin/example

> 建一个新 ooc class 时照抄的**最小可运行样板**：用最小代码量演示 self 的五处可自定义点（readable / executable / persistable / visible / construct）。**非真实功能对象**——不被任何 agent 组合持有、不进任何业务闭环，唯一用途是给 class 维度作者照抄。
> 与 sibling `example.md`（逐文件骨架设计稿）互为印证：`example.md` 讲「新建一个 class 每个文件应该长什么样」，本 builtin 是那份骨架的可编译、可注册、可构造的对照。
> 对象模型本身（class/object、单例/非单例、construct、继承、children、投影）见 sibling `object-model.md`，本文不复述；本文只从 **self × 各维度**透视。

## 一、self（身份 / data）

- **id `_builtin/example`，`ooc.kind=class`**——一份定义/模板。
- **继承**：不写 `ooc.class` → 继承 `_builtin/root`（继承链 `example → root`）。
- **非单例 class**：注册了 construct，可按需造多个实例；每个实例投影为一个 example window。
- **角色**：纯样板 class——既非 agent（无 thinkable/talk/self.md）、也非被组合持有的 tool-object。
- **data（`types.ts`）= 这个 self 是什么**，只两字段：
  - `message: string` —— 要展示的文本（可多行）。
  - `bumpCount: number` —— 被 `bump` 累加的次数。
  - 信封字段与展示态（viewport）**不在 data**——data / 信封 / 投影态三分见 object-model.md 核心 1/4。

一句话职责：**用最小代码量同时演示 self 的五处可自定义点，供建 class 作者照抄。**

## 二、self × 各维度（核心设计）

### self × readable —— 投影成 context window

把 data 投影为单一 window class `"example"`，渲染 `<bump_count>` + `<message>`（message 按 viewport 切片、限长 8192 bytes）；该 window class 声明展示 `object_methods:["bump"]` + `window_methods:[set_viewport]`。
window method **`set_viewport`** 调整投影视口（line/column range）、写新 `ExampleWin.viewport`、不碰 data，演示 window method 四参签名 `(ctx, self, before, args)` + 返回不可变新投影态；越界校验失败即 throw（fail-loud）。viewport 协议复用 `@ooc/core/readable/viewport`，不自造。

### self × executable —— object method

**`bump`** —— 累加 `self.bumpCount`、返回 `bumped → N`，演示 object method 三参签名 `(ctx, self, args)` + 可改 self（无 args schema）。非 `for_ui_access`。

### self × persistable —— 序列化

**有自定义**——`save`/`load` 把 data 以 JSON 落在系统解析好的实例目录 `ctx.dir/data.json`，作「自定义序列化」最小参照；布局权威归 persistable 维度。

### self × visible —— UI

无自定义 → 系统默认（无 UI；样板不演示 visible）。

### self × construct —— 实例化

**非单例**，args schema `{ message?: string }`，产出初始 data `{ message: args.message ?? "(empty)", bumpCount: 0 }`；trivial class 忽略 ctx（无需 thread/worktree/spawn）。

## 三、children

无。
