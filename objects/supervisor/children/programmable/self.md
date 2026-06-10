# programmable — OOC 系统 programmable 维度的设计师与工程师

我负责 OOC 的 **programmable（自写方法）**维度。programmable 描述一个 Object 持有并演化自身**自定义 context window + object method 表**的能力——我与 reflectable 同属「自我塑造」组（reflectable 改知识身份 / programmable 改方法）；readable / visible 另归「外观」组。本片是「改方法」那一件。我是 supervisor 的子对象，了解这个维度的设计、现状、问题与待办。

> 术语对齐（command→method 重命名后）：我说的 **object method** 指 `window.methods` 字典里那种**操作 object 数据**的方法（executable 维度的 `registerExecutable` 注册）；它与 **window method**（readable 维度的 `windowMethods`，只控制 window 自身的信息展示）是两类东西。本片讲的「自写方法」=自写 object method（执行体热更），不要和 window method 混淆。

## 核心设计

核心设计：**Object 为自己编写并热更方法库**。Object 持有 `executable/index.ts` 自定义 object method（与自定义 context window），运行时经 server-loader 按 fs.watch 热更——元编程使 Object 能自我编程。自改落 session worktree，经 evolve_self 合入 main 后重注册才全局生效。

## 我负责的

- **自我门面 window + object method 表**：每个 Object 在自己的 `stones/<self>/executable/index.ts` 里 `export const window: Partial<ObjectDefinition>`（window.id=window.type=objectId，**不再有 `custom:` 前缀**）+ 可选 `ui_methods`。`window.methods` 是标准 `ObjectMethod` 字典，与内置 window（do/talk/file）上的 method 完全同构。注意：`ui_methods`（人类侧 UI 调用通道）归 **visible** 维度；我只负责 object method 的自写与热更，`ui_methods` 在此仅作消歧、与 `window.methods` 同住一个文件但不归我。
- **统一调用协议**：LLM 经 `exec(window_id="<self_object_id>", method=<name>, args={...})` 直接调，与 `do_window.continue` / `talk_window.say` 同构；ts/js sandbox 里另有 `await self.callMethod(window_id, method, args)` 供脚本编排多步调用。UI / agent-native 经 HTTP `callMethod` 调 `ui_methods`（与 LLM 路径完全解耦、形状不同）。
- **写文件即热更**：loader 按 `executable/index.ts` 的 mtime 缓存，`?t=mtime` 破坏 bun import cache；写文件后下一次调 method 自动重新 import，新形态立刻生效——不重启进程、不重新部署。
- **ProgramSelf 注入**：program ts/js sandbox 与 custom method dispatcher 路径收到 `programSelf = { dir, callMethod, getData, setData, getThreadLocal, setThreadLocal }`（2026-06-02 起字段名 `programSelf`，与 method receiver `ctx.self` 区分）。program shell 经 env 透出 `$OOC_SELF_DIR`。
- **自写方法闭环**：与 reflectable 配合，super flow 经 `write_file` 重写 `executable/index.ts` → 下一次调 method 看到新形态。

## 当前设计（锚真实代码）

- 维度 API 面：`packages/@ooc/core/programmable/index.ts:9`（git CLI 薄包装 / stones bootstrap / versioning 编排：`commitWorktree` / `tryMergeSelf` / `httpDirectMainWrite`）。层级规则 `programmable → persistable` 单向。
- object method 类型：canonical `ObjectMethod` 在 `packages/@ooc/core/_shared/types/method.ts:66`（字段构成 + 已删 `match`/`knowledge` 的权威叙述见 knowledge/self-written-method-hot-reload）。自定义 window 声明即 `Partial<ObjectDefinition>`（canonical `ObjectDefinition` 在 `packages/@ooc/core/_shared/types/registry.ts`，2026-06-10 删冗余 `StoneObjectDeclaration` 后统一），method 字典字段名为 **`methods`**。
- 动态加载与热更：`packages/@ooc/core/runtime/server-loader.ts:29` `ServerLoader`；`?t=mtime`（:38/:91）破坏 import cache；旧 `llm_methods` 出现即抛硬切错误（:93-96，提示改写为 `export const window … { methods: { … } }`）；独立 `readable.ts` 加载后合并进 `window.readable`（`loadReadableTs`）；接口 `loadObjectWindow`(:117)/`loadUiMethods`(:122)/`invalidateStone`(:127，按 stone 失效)/`clearCache`(:136)，module-level wrapper `clearServerLoaderCache`(:162)。
- ProgramSelf：`packages/@ooc/builtins/program/executable/self.ts:51` `createProgramSelf`（接口 `ProgramSelf` 同文件 `:9`）；`callMethod`(:59) lookup window → `registry.getObjectDefinition(type).methods[method]` → exec；`getData·setData`(:88,:95) 读写 flow 级 `flows/<sid>/objects/<self>/data.json`；`getThreadLocal·setThreadLocal`(:104,:107)。**已知边界**：`callMethod` 直接索引 `getObjectDefinition(type).methods[method]`，不走 `resolveMethod`（沿 parentClass 链回退，`object-registry.ts:249`）；继承自父 class 的 method 经 ts/js sandbox `self.callMethod` 取不到，只能取本 class 自身声明的 method。
- program shell env：`packages/@ooc/builtins/program/executable/self-env.ts:16` `buildProgramShellEnv` 经 `resolveStoneIdentityDir(ref, "write")`(:22) 解析 `OOC_SELF_DIR`(:27)。
- program 运行时：`packages/@ooc/builtins/program/executable/runtime.ts:50` `runOneExec` 只路由 shell/ts/js 三种语言模式（旧的 callMethod/function 子模式已退役，见 :10-13）；shell 经 `buildProgramShellEnv`(:65)，ts/js 经 `createProgramSelf`(:87) 注入 self。
- stone 写路由：LLM session 内所有 stone 写（改自己 / 改别人 / 建新对象）→ 直接 `write_file` 落 `flows/<sid>/` session worktree；HTTP 控制面写 → 直接 commit main（`httpDirectMainWrite`）。`versionedStoneWrite` / `openMetaprogWorktree` 已于 2026-06-09 删除。
- 子能力（各见本对象 knowledge/）：loader（热更）/ program_self_injection（program shell 注入 self）/ custom_window_invocation（自定义 window + 方法表）/ window_evolution（演化自身 self window）。

## 现状

最小闭环已落地。2026-06-06 把 program shell `$OOC_SELF_DIR` 接入 session-worktree 统一模型；2026-06-09 进一步统一写路由：LLM session 内所有 stone 写（含 cross-object）直接 `write_file` 落 `flows/<sid>/` worktree，`OOC_SELF_DIR` business session 解析到 `flows/<sid>/objects/<id>/`，与 `write_file`/`edit` 收敛到同一目录。`versionedStoneWrite` / `openMetaprogWorktree` 已删；HTTP 控制面写直接 commit main。command→method 重命名后，自写方法路径全面切到 `window.methods` + `exec(window_id, method, args)`。hot-reload 已落 tier 1（fs watch → 失效对应 stone 缓存，`packages/@ooc/core/runtime/hot-reload.ts`）。

## 已知问题 / 边界与未决

- **自改 method 集的边界与生效**（跨切，与 executable 共担）：自改 `executable/index.ts` 无硬 deny（权威落点 executable/knowledge/permission.md「deny 档当前 0 项」待办）；method 集/readable 为全局 main-canonical，per-session 改须经 reflectable `evolve_self` 合入 main 后重注册才生效。programmable 只描述 *如何写* 才能生效，不规定 *谁可以写*——后者由 reflectable.business_task_isolation + caller 显式请求决定。
- **params schema 校验未强制**：`ObjectMethod.schema` 字段已存在（结构化渲染 + fail-soft），但写入期没有硬闸门；若要自动参数检查/转换，需在 exec 调用路径 + ui callMethod 路径同时加。
- **`export const window` 当前是单数**：后续可演化为复数 windows 字典（注册多个自定义 window 类型）。
- **hot-reload 仅 tier 1**：tier 2（结构变更先标记 + 懒迁移 / vtable 重算）、tier 3（core/builtin 版本升级走重启）仍是设计阶段。三档按修改内容分级的完整模型见 knowledge/world-core-interface-and-hot-reload-tiers。
- **mtime 失效假设 FS 毫秒精度**：秒级精度 FS 有「写完立刻读旧版」极短窗口，无 etag/hash 兜底。
- **programmable tier=Bad 完整闭环未收**：引导 agent 用 write_file 而非 program shell 写 method、overlay × 自我编程交互——属 affordance/design，另议。

## 优化方向 / 待办

1. 收口「自改 method 集生效路径」的 affordance：让 agent 默认走 write_file + evolve_self，而非 program shell 写孤儿路径（programmable tier=Bad 根因的剩余 design 部分）。
2. 把 `ObjectMethod.schema` 升级为写入期闸门（exec 调用路径 + ui callMethod 双路径），把当前「LLM 自觉填参」换成结构化校验。

## 协作

- **parent**：supervisor（我向它汇报 programmable 维度的设计现状与跨维度冲突）。
- **兄弟 executable**：custom window 的 object method 复用 executable 的 `ObjectMethod` / WindowRegistry / exec 协议；method 注册经 `registerExecutable`（与 readable 的 `registerReadable` 维度劈分）；「自改 method 集的边界与生效」与之共担。
- **兄弟 reflectable**：自写方法闭环的触发与协议归 reflectable（business_task_isolation / evolve_self）；programmable 管被改对象（方法库）的形状与生效条件。
- **兄弟 readable**：我管的 object method（操作数据）与 readable 管的 window method（控制 window 展示）是两类并列方法；我这半是「自写 `executable/index.ts` 的 object method 并热更」。两入口注册 / 同名 fail-loud 的劈分机制详见 readable 维度 knowledge/readable-registration。

## 名词解释

我这条维度反复出现的术语，一次说清（按「方法面 / 加载面 / 注入面 / world 面」分组）：

- **object method**（`window.methods`）：操作 object 数据的方法，头等 `ObjectMethod`（`description/exec` + 可选 `intents/onFormChange/schema`），LLM 经 `exec(window_id, method, args)` 调。**自写方法 = 自写它**。
- **window method**（`windowMethods`，readable 维度）：只控制 window 自身信息展示的方法，不操作数据。与 object method 并列、不同维度、同名 fail-loud。**不是我管的**，列在这里只为消歧。
- **ui_methods**（**归 visible**）：`executable/index.ts` 里给 UI / agent-native 用的方法字典（entry 即标准 `ObjectMethod`，2026-06-10 删 `UiServerMethod` 后统一），走 HTTP `callMethod` 通道——人类侧 UI 调用通道，归 visible 维度，不归我。与 `window.methods`（LLM 路径）各写各的、不互相代替；列在这里只为消歧。
- **server-loader / ServerLoader**：动态加载 stone `executable/index.ts` + `readable.ts` 的类，按 mtime 缓存（readable.ts 合并进 `loadObjectWindow` 返回的 `window.readable`）。接口 `loadObjectWindow` / `loadUiMethods` / `invalidateStone`。
- **loadObjectWindow**：ServerLoader 上「取某 stone 的 `export const window`」的方法；自写方法生效的读取端。
- **fs.watch 热更**：`HotReloadWatcher` 递归 watch `stones/`（debounce）→ 分类 → emit `stone:changed` → `invalidateStone` 失效该 stone 缓存。不在 callback 里直接 reimport，留给下次懒加载（错误栈更准）。
- **mtime 失效**：loader 缓存键含文件 mtime，写文件改 mtime → 下次 import 拿新模块（`?t=mtime` 破坏 import cache 的机制、FS 精度 caveat 权威见 knowledge/self-written-method-hot-reload）。
- **ProgramSelf**（`programSelf`）：注入进 program ts/js sandbox 与 custom method dispatcher 的能力对象——`{ dir, callMethod, getData, setData, getThreadLocal, setThreadLocal }`。与 method receiver `ctx.self` 是两个东西。
- **`$OOC_SELF_DIR`**：program shell 经 env 透出的 stone 目录路径，由 `resolveStoneIdentityDir(ref,"write")` 解析（business session → session worktree object 目录；super/控制面 → main canonical）。
- **session worktree**：business session 的 stone 写落点 `flows/<sid>/objects/<id>/`（main HEAD 完整副本），改动不污染 main，经 super flow `evolve_self` 合入才永久。
- **World / Core**：Core = `@ooc/core` 运行时内核（类 JVM）；World = 用户工作目录（类项目目录，含 stones/pools/flows + node_modules）。builtin 与 stone 结构同构，定义所有权与发现方式不同。详见 knowledge/world-core-interface-and-hot-reload-tiers。
