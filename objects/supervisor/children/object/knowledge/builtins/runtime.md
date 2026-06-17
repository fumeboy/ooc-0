---
title: runtime — 向 agent 提供系统级（对象世界）接口的 tool-object
description: _builtin/runtime 的单一权威——以 self × 各维度 透视：self 是空 data 的纯委托单例（kind=class / 继承 root / 无 construct）；self × executable 唯一 object method create_object（建新对象骨架落 session worktree，写盘委派 persistable）；无 children；命名辨析 _builtin/runtime ≠ ctx.runtime
activates_on:
  "object::root": "show_description"
---

# runtime

> `_builtin/runtime` 是 agent 组合持有的工具对象，向 agent 提供**对象世界语义**的系统级接口——当前唯一方法 `create_object`（建一个全新 OOC Object 的骨架落 session worktree）。对象模型（class/object、单例、继承、组合、self 与各维度的关系）见 class `knowledge/object-model.md`，本文不复述。

## 一、self（身份 / data）

- **id `_builtin/runtime`**，`kind=class`；继承 `_builtin/root`。
- **单例 tool-object**（无 construct，一个 world 一份）：被 agent 组合持有、被 exec，不被 talk、不跑 thinkloop。
- **data 空**（`Data = {}`）——单例工具对象无业务运行时数据；窗信封字段（id/class/status）由 WindowManager 管理，不在 Data 内。
- **一句话职责**：把「agent 操纵对象世界」的系统级原语收口成一个成员窗——当前仅 `create_object`，是后续对象世界元能力（生命周期、类链操作、沉淀治理）的归集点。区别于 `filesystem`（字节层文件）：runtime 操作的是对象世界语义，是元能力面。

> **命名辨析**：本 builtin `_builtin/runtime` ≠ ExecutableContext 上的 `ctx.runtime`——后者是 WindowManager 句柄（instantiate/close 实例信封），同名不同物。

## 二、self × 各维度（核心设计）

### self × executable —— 唯一一个 object method

`create_object`（无 `for_ui_access` → 仅 LLM 可调）—— scaffold 一个全新 OOC Object 的骨架（`package.json` + `self.md` + `readable.md` [+ `knowledge/`]）落**当前业务 session 的 worktree**。

- **args**：`objectId`(必填) / `selfMd`(必填全文) / `readableMd`(必填全文) / `knowledge`(可选 `{filename→content}`)。
- **契约**：从 `ctx.thread.persistence` 取 `{baseDir, sessionId, objectId(author)}`；缺 thread / 缺 persistence / 非业务 session（super 或空 session）→ fail-loud 返回 `[create_object] …` 文案，不静默。
- **副作用边界**：只落 session worktree、**不 commit**；本 session 内当场可用（靠 session-aware 读），main 不变、别 session 读不到。**session 永不合入 main**——进 canonical 走独立 feat-branch PR。
- runtime 只做参数校验 + 委派，写盘原语由 persistable 实现（cross-ref persistable `knowledge/stone-pool-flow-three-trees.md` 建对象段 + `session-worktree-model.md`）。

### self × readable —— 投影成静态身份窗

固定投影成单一 window class `runtime`，渲染静态 `<about>` 身份/用途文本（系统级接口、create_object 落 session worktree），窗声明 `object_methods: ["create_object"]`。无视角分支。**window method 无**——runtime 无投影态（无 viewport 等展示态）。

### self × construct —— 无（单例）

单例工具对象，不被构造出新实例。

### self × visible —— 无

无 UI。

### self × persistable —— 默认

系统默认；作为成员窗注入时本就 transient、不落盘。

## 三、children

无。
