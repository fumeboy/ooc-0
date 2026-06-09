---
activates_on: {"window::root": "show_content"}
---

# class vs object —— 一等平级、唯一继承

OOC 把 `class` 提升为与 `object` **平级的一等概念**（2026-06-07）。两者组成相同的五件套，区别在**是否可交互**：

| | object | class |
|---|---|---|
| 五件套 | self.md / readable / executable / visible / knowledge | 同 |
| 可交互 | ✓ 可被 talk、跑 thinkloop | ✗ 不可 talk、不跑 thinkloop |
| 角色 | 可交互 Agent | 仅供 object 继承的类定义 |
| 继承 | 至多一个 class（`ooc.class`） | 可继承另一 class（单链） |

概念权威：`packages/@ooc/meta/object.doc.ts:1645`（`class_object` 节点）。

## class 是唯一继承机制

原 `prototype`（self.md frontmatter 的 stone 侧实例链）已**彻底剔除**——代码 / 文档 / 注释无兼容层。继承统一收敛到 class：stone 用 `package.json` 的 `ooc.class` 声明父类，registrar/synthesizer 读它设 `parentClass`（`packages/@ooc/meta/object.doc.ts:1629`）。

`parentClass` 三态（`object.doc.ts:1601`）：
- **undefined** → 隐式继承 `"root"`（拿到 talk / do / todo / plan / program 等通用方法）。
- **null** → 显式不继承（仅 root 自身与 method_exec）。
- **string** → 具名父类，必须已注册；`resolveMethod` 在自身 methods miss 后沿链向上找，带环检测（`seen` Set + MAX_DEPTH=64）。

## class 不可交互如何强制

seedSession 拿到 talk target 后，若是 `_builtin/<id>` 前缀（class 寻址）则抛 `INVALID_INPUT`——class 不能作对话目标（`packages/@ooc/core/app/server/modules/flows/service.ts:415`）。
