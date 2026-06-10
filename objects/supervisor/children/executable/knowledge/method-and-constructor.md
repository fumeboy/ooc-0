---
activates_on: {"object::root": "show_description"}
---

# object method 与 constructor 委托

## 两类方法：object method vs window method

在我（executable）这一片，Object 上挂的方法分两类，按维度分注册：

- **object method** —— 操作 object 自身的业务数据，归我。由 `registerExecutable(type, { methods })` 注册（`packages/@ooc/core/runtime/object-registry.ts:115`）。原先 root window 上注册的"方法"、原先 stone object `executable/index.ts` 里定义的方法，现在都是 object method。
- **window method** —— 只控制 object 在 context 里的展示（如 `set_viewport` 写 `state.viewport`），归 readable。由 `registerReadable(type, { windowMethods })` 注册（`object-registry.ts:131`），`kind: "window"`（`packages/@ooc/core/_shared/types/window-method.ts`）。

两者经同一个 `exec(window_id, method_name)` 入口分派；registry 在注册期校验同名冲突——同一 type 上同名方法不能既是 object method 又是 window method，否则 fail-loud（`object-registry.ts:52` `assertNoMethodNameCollision`）。

`ObjectMethod` 的 canonical 定义（`packages/@ooc/core/_shared/types/method.ts:48`）：

- `kind`（constructor/method，`:51`）。
- 两个可见性标记：`public`（对其他 Object 可见可调，`:94`）/ `for_ui_access`（前端 HTTP API 可调，`:100`）。
- 返回类型 `MethodOutcome` 三态联合（`:35`）：`{ ok: true, result? }` | `{ ok: true, object }` | `{ ok: false, error }`。

## constructor 委托模式

带 `kind: "constructor"` 的 method 必须返回 `{ ok: true, object: ContextWindow }`；manager 看到后把 object 插进 thread 的 contextWindows、按 isBuiltinFeature 写盘、把 window 作为 form.result 反馈给 LLM。

root 上的 `talk` / `do` / `todo` / `plan` / `program` / `open_file` / `open_knowledge` / `glob` / `grep` 已退化为**薄分发器**——只保留 paths / knowledge / match 这些 LLM 视野所需字段，`exec` 体内调 `lookupConstructor("<type>").exec(ctx)` 把构造委托给 type 自身注册的 constructor method。`lookupConstructor` 按 `kind === "constructor"` 标记索引、而非按名字（`object-registry.ts:280`）。

好处：创建 object 与调普通 method 在 ObjectMethod 这一层统一——不再需要 root 为每个 type 单写一份构造逻辑。自定义 Agent 想加 "open <agent>" 入口，只需在 methods 表挂一个 `kind: "constructor"` 的 ObjectMethod。

## 自定义 method 注册

Object 自定义 object method 通过 `executable/index.ts` 的 `export const object` 声明，运行时经 `registerNewObjectType` 动态注册到 ObjectRegistry（`object-registry.ts:173`）。method 解析沿 `parentClass` class 链回退（缺省隐式继承 `root`），class 是唯一继承机制（prototype 已于 2026-06-07 剔除）。

builtin 对象的目录形态已按维度劈分：`executable/index.ts`（object method + constructor，调 registerExecutable）+ `readable.ts`（readable hook + window method + compressView，调 registerReadable），由 barrel `index.ts` 分别 side-effect 加载（executable 不 import readable）。标准样板见 `packages/@ooc/builtins/example/`。
