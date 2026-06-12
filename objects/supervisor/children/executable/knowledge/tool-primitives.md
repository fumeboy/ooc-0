---
activates_on: {"object::root": "show_description"}
---

# 4 个稳定 tool 原语

LLM 直接看见和调用的稳定接口只有 4 个：`OOC_TOOLS = [EXEC, CLOSE, WAIT, COMPRESS]`（`packages/@ooc/core/executable/tools/index.ts:28`）。`buildAvailableTools` 当前恒返回固定四件套（`:35`）。

- **exec** — 在某 object 上调一条 method（object method 改数据 / window method 控展示，统一经 exec 分派）。args 齐全且不引入新 path/knowledge 时立即执行；否则系统创建一个 `method_exec` form，LLM 经 `exec(form_id, "refine"/"submit")` 推进。
- **close** — 关闭一个 context window（form / do / todo 等）。
- **wait** — 声明当前 thread 等待某 talk / do 的未来 IO。没有未来输入就 end，有才 wait。
- **compress** — 控制 thread 上下文体积的**元 tool**：它操纵 thread 自身（windows[] + events[]）而非某个 object 的行动。签名 `compress({ scope, targetIds?, level?, summary? })`。`scope=windows`（切 ContextWindow.compressLevel）与 `scope=events`（把 events 中段折叠为一条 events_summary、summary 由 LLM 提供）均已落地；仅 `scope=auto` 抛 not-implemented，留给 emergency_guard（`packages/@ooc/core/executable/tools/compress.ts:372`）。

## 为什么 tool surface 固定 4 个（stable_tool_surface）

LLM 直接学习的是 tool 原语。每新增能力就加 tool 会让行动面不断变化、调试与知识激活复杂化。因此**新能力优先表现为新 method 或新 object type，而不是新顶层 tool**。

compress 是 tool 而非 method 不与此冲突：method 挂在某 object 上操纵 object-local 状态，compress 操纵 thread 自身集合，没有合适的 object 可挂——与 close/wait 同属「操纵 thread 自身」类元 tool。

## form 生命周期

旧版 5 原语 open/refine/submit/close/wait 中 refine/submit 仅服务 form。迁移后：open 并入 exec；refine/submit 不再是顶层 tool，而是 `method_exec` object 上注册的两条 object method，经 `exec(form_id, "refine"/"submit")` 调用，与 do.continue / talk.say 同构（`packages/@ooc/core/executable/windows/method_exec/index.ts:21`）。
