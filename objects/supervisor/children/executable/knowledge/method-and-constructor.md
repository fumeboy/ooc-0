---
activates_on: {"window::root": "show_content"}
---

# Method 与 constructor 委托

## Command 与 Object Method 归一为 Method（2026-05-28）

原「Window Command」与「Object Method」两个概念合并，统一称 **Method**（`object.doc.ts:751`）：

- 原 window 上注册的 command 现在是 builtin object 的 method。
- 原 stone object `executable/index.ts` 中定义的方法也是 object 的 method。
- canonical 定义 `ObjectMethod`（`packages/@ooc/core/_shared/types/method.ts:48`）含 `kind`（constructor/method，`:51`）+ 两个可见性标记：`public`（对其他 Object 可见，`:94`）/ `for_ui_access`（对前端 API 可调用，`:100`）。
- 返回类型 `MethodOutcome` 三态联合（`:35`）：`{ ok: true, result? }` | `{ ok: true, object }` | `{ ok: false, error }`。

## constructor 委托模式

带 `kind: "constructor"` 的 method 必须返回 `{ ok: true, object: ContextObject }`；manager.submit 看到后把 object 插进 thread 的 contextWindows、按 isBuiltinFeature 写盘、把 window 作为 form.result 反馈给 LLM（`object.doc.ts:1564`）。

root 上的 `talk` / `do` / `todo` / `plan` / `program` / `open_file` / `open_knowledge` / `glob` / `grep` 已退化为**薄分发器**——只保留 paths / knowledge / match 这些 LLM 视野所需字段，`exec` 体内调 `lookupConstructor("<type>").exec(ctx)` 把构造委托给 type 自身注册的 constructor method。`lookupConstructor` 按 `kind === "constructor"` 标记索引，而非按名字（`object.doc.ts:1577`）。

好处：创建 object 与调普通 method 在 ObjectMethod 这一层统一——不再需要 root 为每个 type 单写一份构造逻辑。自定义 Agent 想加 "open <agent>" 入口，只需在 methods 表挂一个 `kind: "constructor"` 的 ObjectMethod。

## 自定义 method 注册

Object 自定义 methods 通过 `executable/index.ts` 的 `export const object`（旧名 `window`）声明，运行时经 `registerNewObjectType` 动态注册到 ObjectRegistry（`REGISTRY` Map，`packages/@ooc/core/extendable/_shared/registry.ts`）。method 解析沿 `parentClass` class 链回退（缺省隐式继承 `root`），class 是唯一继承机制（prototype 已于 2026-06-07 剔除，`object.doc.ts:1629`）。
