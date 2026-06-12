---
activates_on: {"object::root": "show_description"}
---

# _builtin/ 寻址与 instantiate_with_new_world

## 框架 builtin class 的 `_builtin/<id>` 寻址（as-built）

实现时复用既有 `_builtin/<id>` 前缀（而非新引入 `class:<id>`）作 class 寻址：

- **磁盘读走框架包**：`_builtin/<id>` 的五件套读自运行进程的 `@ooc/builtins/<id>` 包（`Bun.resolveSync(...)`），不 vendor 进 world——builtin 随框架代码发布，与 world 目录无关。解析在 `resolveBuiltinDir`（`packages/@ooc/core/persistable/builtin-dir.ts:15`）与读路径专用的 `resolveBuiltinReadDir`（`builtin-dir.ts:35`）。
- **instance/class 磁盘分离**：bare id（如 `supervisor`）不再走框架包——它是 `objects/<id>` 下实例化的普通 object，五件套读自己的实例目录。`resolveBuiltinReadDir` 在 `_stonesBranch != null` 或非 `_builtin/` 前缀时返回 undefined，caller 回退 `stoneDir`（`builtin-dir.ts:39`），避免 class 遮蔽同名 instance 磁盘。
- **registry**：`_builtin/<id>` 直接作 class 键注册，空 methods 隐式继承 root（`ensureBuiltinClassRegistered`，`packages/@ooc/core/thinkable/context/object-windows.ts:36`）。ObjectRegistry 的 store 原生支持任意字符串键，无需改数据结构；instance 经 `ooc.class="_builtin/<id>"` 得链 `instance → _builtin/<id> → root`，键不同名，无自引用 break。

## instantiate_with_new_world

class 的 `package.json` 声明 `ooc.instantiate_with_new_world=true` 时（`packages/@ooc/core/app/server/bootstrap/instantiate-classes.ts:48`），world bootstrap **幂等**实例化：

- 若 `objects/<id>/` 已存在 → 跳过（保住用户对实例 self.md 的改动，`:51`）。
- 否则建 object：拷贝 class self.md 为 own 身份、写 `ooc.class="_builtin/<id>"`、commit on main（走 stone-versioning worktree → ff merge）（`:58`）。

`supervisor` 即此类 class（`packages/@ooc/builtins/supervisor/package.json`：`ooc.kind=class`、`instantiate_with_new_world=true`）——每个新 world 自动拥有一个 supervisor object，不再需要 listStones 特殊逻辑。

## own 身份 / 共享行为

只有 self.md 在实例化时拷快照（own 身份、不跟框架升级）；其余四件套的行为经 parentClass 链**活继承** class（框架升级自动生效，除非 own 覆盖）。trade-off：框架改 method 语义后旧 self.md 快照可能描述旧契约（身份-行为漂移，缓解未做）。
