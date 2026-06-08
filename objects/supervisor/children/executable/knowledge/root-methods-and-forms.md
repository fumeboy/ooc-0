---
activates_on: {"window::root": "show_content"}
---

# root 的 14 个全局 method 与 form 推进

## root 上注册的全局 method

root 注册一组顶层 method（与 `packages/@ooc/builtins/root/executable/index.ts` 一致，每条一个 `method.*.ts`），共 14 个（`object.doc.ts:882`）：

- **do** — 派生子 thread，创建 do_object。
- **talk** — 与 user 或其他 Object 对话，创建 talk_object。
- **program** — 执行 shell / js / ts，创建 program_object（沙箱见 `packages/@ooc/core/executable/program/sandbox/executor.ts` + `program/shell.ts`）。
- **plan** / **todo** — 更新 plan / 创建可见待办。
- **end** — 标记当前 thread 完成。传 `result` 时自动调 creator window 的 continue/say 把内容写进 transcript 并 auto-archive 父侧 do_window；不传则只标记本轮结束（`object.doc.ts:888`）。result 是便捷糖，不是回报通道。
- **open_file** / **open_knowledge** — 把文件 / 知识载入 context。
- **write_file** — 创建或覆盖文件（落盘与版本化重定向在 file builtin，`packages/@ooc/builtins/file/executable/index.ts`）。
- **glob** / **grep** — 按文件名 / 内容搜索，创建 search_object。
- **metaprog** — supervisor 治理动作（`resolve` / `rollback`）：评审 cross-scope PR-Issue / 回滚合入。写动作（open_worktree / commit / merge / create_object）已删；LLM 改 stone 直接 write_file 落 session worktree，走 super flow evolve_self 合入。
- **open_feishu_chat** / **open_feishu_doc** — 飞书外接（经 extendable 注册，寄生于 executable）。

其它 object 也注册命令：do_object（continue/wait/close/move）、talk_object（say/wait/close）、file_object（edit/reload/set_range/close）、method_exec（refine/submit）。

## method 与 knowledge 经 trigger 协作

每个 method_exec form 在 thread 中 open 时，对应 `"command::<parent_type>::<command>"` trigger 进入命中态；knowledge frontmatter 的 `activates_on` 声明同样表达式即按需激活（`object.doc.ts:909`）。这是渐进式语义披露——LLM 只有真正进入某条行动路径时，才看到该路径的完整操作说明（command_path_activation patch，`object.doc.ts:936`）。

## form 推进流程

`exec(command="program")` args 不齐 → 系统创建 `method_exec` form（旧名 command_exec）→ `exec(form_id, "refine", args={...})` 补参 → `exec(form_id, "submit")` 提交执行（`object.doc.ts:877`）。
