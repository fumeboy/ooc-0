---
title: readable 维度的装配与注册
activates_on:
  "object::root": "show_description"
---

# readable 怎么装配进一个 class

readable 是一个 class 的维度模块，与 executable / persistable 并列。它不单独注册——和其它维度一起收口进 class 的 `index.ts`。

## 一处 `export const Class` 装配

每个 ooc class 的 `index.ts` 把各维度模块装配成 `OocClass`（`packages/@ooc/core/runtime/ooc-class.ts:47`）：

```
export const Class = { construct?, executable, readable, persistable }
```

- `readable` —— 本维度模块（`ReadableModule`，`~~packages/@ooc/core/readable/contract.ts:78~~（已删除）`）：`readable` 投影函数 + `window` 投影 class 声明。
- `executable` —— object method（改 Data / 副作用）。
- `persistable` —— 自定义序列化（省略走系统默认）。
- `construct` —— 仅非单例 class 注册（产出新实例初始 Data）。

readable 物理上自成一文件（`readable/index.ts` 的 default export），`index.ts` import 进来挂到 `Class.readable`。最小样板见 `packages/@ooc/builtins/example/`（types / executable / readable / persistable 分文件，index.ts 一处装配）。

## 单入口 `register`

class 经唯一入口注册进 registry（`packages/@ooc/core/runtime/object-registry.ts:60`）：

```
register(cls: OocClass)
```

- class id 归一（strip `_builtin/` 前缀，使带/不带前缀命中同一键）。
- 已存在则**合并**模块字段（新模块覆盖、未传字段保留），支持窗类型分多次 side-effect import 增量补全 + 测试 seedFrom。
- 注册期校验 object method ↔ window method 不同名，fail-loud——同一 class 上重名会让 exec-by-name dispatch 歧义。
- **不持父类指针**：OOC Class 协议层不内建继承元数据，registry 只持扁平的 class 表（对象模型核心 2）。

builtin 包经 side-effect import 各自 `register` 自己的 class；think / exec / render 默认用 `builtinRegistry` 单例，per-world / 测试经 `createObjectRegistry()` seedFrom 拿到等价集合。

## 本类直查解析（不沿继承链）

`ooc.class` 是 object→class 的**单跳实例 binding**，**不是** class→class 继承链——OOC Class 协议层不内建任何继承 dispatch 机制（对象模型核心 2）。渲染 / dispatch 期，readable 相关解析都**只查本类**，无 fallback、无 chain walking：

- `resolveReadable(classId)`——取本 class 的投影模块。
- `resolveWindowMethod(classId, name)`——取本 class 的 window method。
- `resolveWindowClass(classId, projectionClass)`——取本 class 某投影 class 的声明（展示哪些 object method + window method）。

子类要复用父 class 的 readable，经**源码 import + spread** 表达（对象模型核心 2）：子 class 的 `readable/index.ts` 写 `import parent from "..."; export default { ...parent, window: [...parent.window, myWin] }`——继承在源码层显式表达、注册期就是扁平结果。运行时无继承链，行为可预测；父改后由 PR merge → `invalidateStone` 重新 spread 注册子（沿用现有 hot-reload 推模式）。
