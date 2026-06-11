---
activates_on: {"object::root": "show_description"}
---

# root 的全局 object method 与 form 推进

## root 上注册的全局 object method

root 注册一组顶层 object method（`ROOT_METHODS`，`packages/@ooc/builtins/root/executable/index.ts:57`，每条一个 `method.*.ts`，经 `registerExecutable("root", { methods })` 注入），共 16 个：

- **do** — 派生子 thread，创建 do_object。
- **talk** — 与 user 或其他 Object 对话，创建 talk_object。
- **program** — 执行 shell / js / ts，创建 program_object（沙箱见 `packages/@ooc/builtins/program/executable/sandbox/executor.ts` + `executable/shell.ts`）。
- **plan** / **todo** — 更新 plan / 创建可见待办。
- **end** — 标记当前 thread 完成。传 `result` 时自动调 creator window 的 continue/say 把内容写进 transcript 并 auto-archive 父侧 do_window；不传则只标记本轮结束。result 是便捷糖，不是回报通道。
- **open_file** / **open_knowledge** — 把文件 / 知识载入 context。
- **write_file** — 创建或覆盖**已存在对象**的文件（落盘与版本化重定向在 file builtin，`packages/@ooc/builtins/file/executable/index.ts`）。
- **create_object** — 建一个**全新对象**的骨架（仅业务 session）：落 session worktree `objects/<newId>/{package.json,self.md,readable.md[,knowledge]}`（`method.create-object.ts`）；进 canonical 走后续 feat-branch PR 沉淀。
- **new_feat_branch** — 沉淀第一步（super flow 内）：从 main 派生一条 feat 分支 worktree 并绑进 thread，让后续 write_file 直接落 feat worktree（`method.new-feat-branch.ts`）。同 intent 重调幂等重绑（回修 resume 入口）。
- **evolve_self** — 沉淀 finalizer（super flow 内，无 edits 参数）：读 feat 分支绑定 → commit（署名 actor）→ 算 reviewer 集冒泡 → 开 PR → 投递 pr_window 给 reviewer（`method.evolve-self.ts`）。不再是 session 合入命令。
- **glob** / **grep** — 按文件名 / 内容搜索，创建 search_object。
- **example** — 构造 example_window（标准对象定义样板，`method.example.ts`）。
- **open_feishu_chat** / **open_feishu_doc** — 飞书外接（经 extendable 注册，寄生于 executable）。

> 注：原 `metaprog` method 已删。它承载的 supervisor 治理动作（resolve PR-Issue / rollback stone）已转控制面 governance 端点 `POST /api/runtime/pr-issues/:issueId/resolve` / `POST /api/runtime/stones/:objectId/rollback`（底层 `packages/@ooc/core/persistable/stone-versioning.ts` 的 `resolvePrIssue` / `rollback`），治理语义权威在 reflectable 维度；它的写动作（改自己 / 建别人 / 改别人）下放给 write_file / create_object 落 session worktree、沉淀走 feat-branch PR（`new_feat_branch` → 编辑 → `evolve_self` 开 PR）。

其它 object 也注册自己的 object method：do_object（continue/wait/close/move）、talk_object（say/wait/close）、file_object（edit/reload/set_range/close）、method_exec（refine/submit，`packages/@ooc/core/executable/windows/method_exec/index.ts:53`）。

## method 与 knowledge 经 intent trigger 协作

每个 method_exec form 在 thread 中 open 时，对应的 intent 进入命中态；knowledge frontmatter 的 `activates_on` 声明同样表达式即按需激活（如本文件顶部的 `{"object::root": "show_description"}` 让 summary 常驻、按需 `open_knowledge` 拉全文；若要在某 method form open 时全文激活则写 `{"method::root::<method>": "show_content"}`）。这是渐进式语义披露——LLM 只有真正进入某条行动路径时，才看到该路径的完整操作说明。

## form 推进流程

`exec(method="program")` args 不齐 → 系统创建 `method_exec` form → `exec(form_id, "refine", args={...})` 补参 → `exec(form_id, "submit")` 提交执行。refine / submit 是 method_exec object 上注册的两条 object method，与 do.continue / talk.say 同构。
