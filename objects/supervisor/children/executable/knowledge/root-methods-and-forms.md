---
activates_on: {"object::root": "show_description"}
---

# agent 的方法面（self agency + 成员工具对象）与 form 推进

## 方法按 Object/Agent/组合 分布

行动能力不再堆在 root god-object 上，而是按 Object/Agent/组合分布（2026-06-13 起）：

**你自己（agent self 窗）的 agency** —— 注册在 `_builtin/agent` 基类（`packages/@ooc/builtins/root/executable/index.ts` 的 `AGENCY_METHODS`，`registerExecutable("_builtin/agent", …)`），具体 agent 经 `ooc.class` 继承：

- **talk** — 统一两形态创建 talk_object：target=别的对象（`"user"` 也是）⇒ peer 会话；target=自己 objectId ⇒ fork 一条同对象子线程（旧 do 并入）。
- **plan** / **todo** — 更新 plan / 创建可见待办。
- **end** — 标记当前 thread 完成。传 `result` 时自动调 creator talk_window 的 say 把内容写进 transcript；不传则只标记本轮结束。result 是便捷糖，不是回报通道。

**成员工具对象**（agent 经 `ooc.members` 持有、注入为成员窗的 tool-object，调用时 window_id 指向对应成员窗）：

- `filesystem`（`packages/@ooc/builtins/filesystem/executable/index.ts`）：**open_file** / **write_file**（落盘与版本化重定向在 file builtin）、**glob** / **grep**（按文件名 / 内容搜索，创建 search_object）。
- `terminal`（`packages/@ooc/builtins/terminal/executable/index.ts`）：**program** — 执行 shell / ts / js，创建 program_object（沙箱见 `packages/@ooc/builtins/program/executable/sandbox/executor.ts` + `executable/shell.ts`）。
- `world`（`packages/@ooc/builtins/world/executable/index.ts`）：**create_object** — 建一个**全新对象**的骨架（仅业务 session）：落 session worktree `objects/<newId>/{package.json,self.md,readable.md[,knowledge]}`；进 canonical 走后续 feat-branch PR 沉淀。
- `knowledge_base`（`packages/@ooc/builtins/knowledge_base/executable/index.ts`）：**open_knowledge** — 把一篇 knowledge 载入 context。

**root 基类自身** 只剩边缘 misc：**example**（对象定义样板，`method.example.ts`）、**open_feishu_chat** / **open_feishu_doc**（飞书外接，经 extendable 注册、寄生于 executable）。

> 沉淀方法**不在 agent 也不在 root**——`new_feat_branch` / `create_pr_and_invite_reviewers` 挂在 **reflect_request window**（`packages/@ooc/core/reflectable/reflect-request/`，标 `for_reflectable` 仅 super flow surface）：前者从 main 派生 feat 分支 worktree 并绑进 thread（让后续 write_file 直接落 feat worktree、同 intent 幂等重绑承接回修）；后者是 finalizer（读绑定 → commit 署名 → 算 reviewer 集冒泡 → 开 PR → 投递 pr_window）。机制权威见 reflectable 维度。

> 注：原 `metaprog` method 已删。它承载的 supervisor 治理动作（resolve PR-Issue / rollback stone）已转控制面 governance 端点 `POST /api/runtime/pr-issues/:issueId/resolve` / `POST /api/runtime/stones/:objectId/rollback`（底层 `packages/@ooc/core/persistable/stone-versioning.ts` 的 `resolvePrIssue` / `rollback`），治理语义权威在 reflectable 维度；它的写动作（改自己 / 建别人 / 改别人）下放给 filesystem.write_file / world.create_object 落 session worktree、沉淀走 feat-branch PR。

其它 object 也注册自己的 object method：talk_object（say/wait/close/share/talk——peer 会话 + fork 子窗两形态统一一类）、file_object（edit/reload/set_range/close）、method_exec（refine/submit，`packages/@ooc/core/executable/windows/method_exec/index.ts:21`）。

## method 与 knowledge 经 intent trigger 协作

每个 method_exec form 在 thread 中 open 时，对应的 intent 进入命中态；knowledge frontmatter 的 `activates_on` 声明同样表达式即按需激活（如本文件顶部的 `{"object::root": "show_description"}` 让 summary 常驻、按需 `open_knowledge` 拉全文；若要在某 method form open 时全文激活则写 `{"method::<type>::<method>": "show_content"}`——`<type>` 经 parentClass 类链匹配，agency 用 `method::_builtin/agent::<m>`、成员方法用 `method::world::create_object` 等）。这是渐进式语义披露——LLM 只有真正进入某条行动路径时，才看到该路径的完整操作说明。

## form 推进流程

`exec(method="program")` args 不齐 → 系统创建 `method_exec` form → `exec(form_id, "refine", args={...})` 补参 → `exec(form_id, "submit")` 提交执行。refine / submit 是 method_exec object 上注册的两条 object method，与 talk.say 同构。
