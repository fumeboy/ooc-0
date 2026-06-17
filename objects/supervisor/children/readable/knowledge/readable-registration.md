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

- `readable` —— 本维度模块（`ReadableModule`，`packages/@ooc/core/readable/contract.ts:78`）：`readable` 投影函数 + `window` 投影 class 声明。
- `executable` —— object method（改 Data / 副作用）。
- `persistable` —— 自定义序列化（省略走系统默认）。
- `construct` —— 仅非单例 class 注册（产出新实例初始 Data）。

readable 物理上自成一文件（`readable/index.ts` 的 default export），`index.ts` import 进来挂到 `Class.readable`。最小样板见 `packages/@ooc/builtins/example/`（types / executable / readable / persistable 分文件，index.ts 一处装配）。

## 单入口 `register`

class 经唯一入口注册进 registry（`packages/@ooc/core/runtime/object-registry.ts:103`）：

```
register(classId, Class, { parentClass })
```

- class id 归一（strip `_builtin/` 前缀，使带/不带前缀命中同一键）。
- 已存在则**合并**模块字段（新模块覆盖、未传字段保留），支持窗类型分多次 side-effect import 增量补全 + 测试 seedFrom。
- 注册期校验 object method ↔ window method 不同名，fail-loud（`object-registry.ts:53`）——同一 class 上重名会让 exec-by-name dispatch 歧义。

builtin 包经 side-effect import 各自 `register` 自己的 class；think / exec / render 默认用 `builtinRegistry` 单例，per-world / 测试经 `createObjectRegistry()` seedFrom 拿到等价集合。

## 沿继承链解析

object 经 ooc.class 单跳继承一个 class。渲染 / dispatch 期，readable 相关解析都沿"self 优先、单一父类次之、首个命中胜出"：

- `resolveReadable(classId)`（`object-registry.ts:202`）——取投影模块。
- `resolveWindowMethod(classId, name)`（`object-registry.ts:191`）——取 window method。
- `resolveWindowClass(classId, projectionClass)`（`object-registry.ts:223`）——取某投影 class 的声明（展示哪些 object method + window method）。

当前无自定义 object 覆盖框架 class 的 readable，这条回退链尚未被真正行使——详见 self.md「模拟推演」。
