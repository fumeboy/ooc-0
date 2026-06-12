---
activates_on: {"object::root": "show_description"}
---

# object method 与 constructor 委托

## 两类方法：object method vs window method

在我（executable）这一片，Object 上挂的方法分两类，按维度分注册：

- **object method** —— 操作 object 自身的业务数据，归我。由 `registerExecutable(type, { methods })` 注册（`packages/@ooc/core/runtime/object-registry.ts:113`）。原先 root window 上注册的"方法"、原先 stone object `executable/index.ts` 里定义的方法，现在都是 object method。
- **window method** —— 只控制 object 在 context 里的展示（如 `set_viewport` 写 `state.viewport`），归 readable。由 `registerReadable(type, { windowMethods })` 注册（`object-registry.ts:128`），`kind: "window"`（`packages/@ooc/core/_shared/types/window-method.ts`）。

两者经同一个 `exec(window_id, method_name)` 入口分派；registry 在注册期校验同名冲突——同一 type 上同名方法不能既是 object method 又是 window method，否则 fail-loud（`object-registry.ts:49` `assertNoMethodNameCollision`）。

`ObjectMethod` 的 canonical 定义（`packages/@ooc/core/_shared/types/method.ts:74`）：

- `description` 必填（LLM 面向的方法描述，`:79`）；`kind`（constructor/method，`:77`）。
- `onFormChange(change, { args })` 可选（`:105`）：返回 `MethodExecuteForm`（`tip / intents / quick_exec_submit`，`:29`）；省略它的方法免表单直接 exec。`ctx.args` 即 form 累积参数，与 exec 的 `ctx.args` 对齐。
- 两个可见性标记：`public`（对其他 Object 可见可调，`:127`）/ `for_ui_access`（前端 HTTP API 可调，`:133`）。
- 返回类型 `MethodOutcome`（平铺单形状 `{ ok; result?; window?; error?; data? }`，`:47`）涵盖三种用法：`{ ok: true, result? }` | `{ ok: true, window }` | `{ ok: false, error }`。

## method 参数契约如何暴露给 LLM

LLM 调我的 method 时猜错参数名（给 `say` 传 `content` 而非 `msg`）的根因不是缺信息，是 **false confidence**——它的先验（content / text / message）盖过了我没在决策点摆出的真相。治法是在 LLM 决定填 `args` 的那一刻把参数契约摆在它正前方，而不是堆 knowledge——悬浮文档绑不上当下这一次具体调用，再准也在和先验打架。

参数按两条通道分层暴露，对应 `schema.args` 里的 `required` 轴：

**必填参数 → eager 完整契约。** 每个 window 的 `<methods>` 渲染（`packages/@ooc/core/thinkable/context/renderers/xml.ts:105`，由 readable 维度执行）下，必填参数渲染为带 `name + type + required + description` 的 `<arg>` 子节点，全部读自 `schema.args`。名字治「猜 key」，description 治「猜值」——两层猜测一起消，缺一不可（光给名字不给说明，`mode` / `target` 这类仍会被猜值）。形如：

```
<method name="say">向对端发消息（可 wait 等回复）
  <arg name="msg" type="string" required>消息正文</arg>
</method>
```

（落点：`xml.ts` 的 `renderRequiredArgNodes` 把 `schema.args` 里 `required:true` 的项渲染进已有 `<methods>` 块的 method 节点，有 `enum` 作属性带上；可选参数不进、无必填则空，行为退回仅 brief。）

**可选参数 → 渐进 + 兜底，不进 eager。**

- 例行可选：不渲染进 eager，进 `method_exec` form 后由 `onFormChange` 的 `tip` 引导（即 `schema.args` 里 `required: false` 的那些）。
- **行为关键的可选**（如 `wait` 决定线程同步 / 异步阻塞）：写进 method 的 **brief 描述正文**本身（「向对端发消息（可 wait 等回复）」），让 LLM 在决策点就发现这条能力——「必填 / 可选」与「该不该 eager 暴露」不是同一条轴，行为关键的可选属于后者。
- **零必填 method**（`plan`、talk 的 `set_transcript_window` 全是可选）：同样靠 brief 正文承接（「传 plan 文本或 steps 列表」），否则它们 eager 渲染出来是零参数提示、等于没说。

**明确不做（grill 的净化结果，防熵增）：**

- 不新增「`onFormChange` 控制哪些可选参数可见」的机制。当前可选参数最多 4 个（plan），进 form 一次性全列零 context 压力；「渐进揭示可选」是个还不存在的问题，留待真出现 8+ 可选的 method 再议。
- 不靠别名表迁就 LLM 猜测（`program` 的 `lang` 别 `language` 是既成窄例，不向外扩张——否则是打地鼠 + 命名面熵增）。
- 不做「孤儿值就近映射」。eager 契约已把必填猜错压到接近零；若 LLM 仍无视眼前契约传未知参数，**响亮回显**（「未知参数 `content` 已忽略，本 method 接受 `msg`(必填)…」）优于静默映射——静默映射会让 LLM 以为 key 是 `content`、系统却私自改写，埋语义漂移。这是廉价兜底，不是主路。落点在 `method_exec/readable.ts` 渲染层（同时握 LLM 实传的 `accumulatedArgs` 与契约 `schema.args`，算未知 key 最直接、零状态、不碰 refine 控制流；schema-fill/refine 只在 `schema.args` 范围内迭代、拿不到多出的 key）。

残余猜测面只剩「拼错可选参数名」，由响亮回显兜住，可接受。

## constructor 委托模式

带 `kind: "constructor"` 的 method 必须返回 `{ ok: true, window: ContextWindow }`；manager 看到后把 window 插进 thread 的 contextWindows、按 isBuiltinFeature 写盘、把 window 作为 form.result 反馈给 LLM。

root 上的 `talk` / `do` / `todo` / `plan` / `program` / `open_file` / `open_knowledge` / `glob` / `grep` 已退化为**薄分发器**——只保留 description / schema / onFormChange 这些 LLM 视野所需字段，`exec` 体内调 `lookupConstructor("<type>").exec(ctx)` 把构造委托给 type 自身注册的 constructor method。`lookupConstructor` 按 `kind === "constructor"` 标记索引、而非按名字（`object-registry.ts:272`）。

好处：创建 object 与调普通 method 在 ObjectMethod 这一层统一——不再需要 root 为每个 type 单写一份构造逻辑。自定义 Agent 想加 "open <agent>" 入口，只需在 methods 表挂一个 `kind: "constructor"` 的 ObjectMethod。

## 自定义 method 注册

Object 自定义 object method 通过 `executable/index.ts` 的 `export const window`（loader 读 `mod.window`，`packages/@ooc/core/runtime/server-loader.ts:95`；`export const llm_methods` 命中即抛错 `:89`）声明。world stone 的对象类型在**渲染期 lazy ensure**（首次进入某 thread context 时）由 `thinkable/context/object-windows.ts` 的 `registerStoneObjectType` 经 `resolveStoneIdentityRef(read)` 从磁盘（session worktree 或 main）加载该 window，经 `registerNewObjectType` 注册（`object-registry.ts:168`）进全局 builtinRegistry；已注册则跳过（幂等）。method 解析沿 `parentClass` class 链回退（缺省隐式继承 `root`），class 是唯一继承机制（prototype 已于 2026-06-07 剔除）。

builtin 对象的目录形态已按维度劈分：`executable/index.ts`（object method + constructor，调 registerExecutable）+ `readable.ts`（readable hook + window method + compressView，调 registerReadable），由 barrel `index.ts` 分别 side-effect 加载（executable 不 import readable）。标准样板见 `packages/@ooc/builtins/example/`。
