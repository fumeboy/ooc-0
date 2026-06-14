---
activates_on: {"object::root": "show_description"}
---

# 3 个稳定 tool 原语

LLM 直接看见和调用的稳定接口只有 3 个：`OOC_TOOLS = [EXEC, CLOSE, WAIT]`（`packages/@ooc/core/executable/tools/index.ts:28`）。`buildAvailableTools` 当前恒返回这 3 个（`:35`）。

- **exec** — 在某 object 上调一条 method（object method 改数据 / window method 控展示，统一经 exec 分派）。args 齐全且不引入新 path/knowledge 时立即执行；否则系统创建一个 `method_exec` form，LLM 经 `exec(form_id, "refine"/"submit")` 推进。
- **close** — 关闭一个 context window（form / do / todo 等）。
- **wait** — 声明当前 thread 等待某 talk / do 的未来 IO。没有未来输入就 end，有才 wait。

`compress`（信息压缩）**不是原语**——它是"调整信息展示"的 **window method**（与 file 窗 `set_viewport` 同类），经 `exec(method="compress")` 调；exec 体内拦截分派到压缩实现。签名 `compress({ scope, targetIds?, level?, summary? })`。`scope=windows`（切 ContextWindow.compressLevel）与 `scope=events`（把 events 中段折叠为一条 events_summary、summary 由 LLM 提供）均已落地；仅 `scope=auto` 抛 not-implemented，留给 emergency_guard（`packages/@ooc/core/executable/tools/compress.ts:372`）。

## 为什么 tool surface 固定 3 个（stable_tool_surface）

LLM 直接学习的是 tool 原语。每新增能力就加 tool 会让行动面不断变化、调试与知识激活复杂化。因此**新能力优先表现为新 method 或新 object type，而不是新顶层 tool**。

`compress` 正是这条原则的落地：调整信息展示属于「window 上的一个 method」，没有必要占独立原语位，故经 `exec(method="compress")` 走统一行动入口，原语恒为 exec / close / wait 三个。

## form 生命周期

更早曾有 open/refine/submit/close/wait 五个顶层入口（已退役），其中 refine/submit 仅服务 form。迁移后：open 并入 exec；refine/submit 不再是顶层 tool，而是 `method_exec` object 上注册的两条 object method，经 `exec(form_id, "refine"/"submit")` 调用，与 do.continue / talk.say 同构（`packages/@ooc/core/executable/windows/method_exec/index.ts:21`）。**现稳定原语恒为 exec / close / wait 三个。**
