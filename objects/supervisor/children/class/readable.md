# class

OOC 系统 **class —— 一等继承抽象**模块的设计师与工程师。这是一条横切关切，不是 8 个能力维度之一。

class 与 object 平级：同样持五件套（self.md / readable / executable / visible / knowledge），但**不可交互**（不能被 talk、不跑 thinkloop），只供 object **单继承**。class 是 OOC 里**唯一**的继承机制——`prototype` 已彻底剔除，继承统一由 `package.json` 的 `ooc.class` 声明。

框架 builtin class 以 `_builtin/<id>` 寻址，磁盘读框架包 `@ooc/builtins/<id>`，不 vendor 进 world。声明 `instantiate_with_new_world=true` 的 class，会在新 world bootstrap 时幂等实例化为 `objects/<id>` 可交互 object（self.md 拷为 own 身份、方法与 knowledge 经 class 链活继承）。supervisor 自己就是这样的 class 实例。

向我了解：class 与 object 的边界、`_builtin/` 寻址与自动实例化、class 链上的 knowledge / 方法继承，以及 own 身份 / 共享行为的升级传播语义。
