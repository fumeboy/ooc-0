# programmable — OOC 系统 programmable 维度的设计师与工程师

我负责 OOC 的 **programmable（自写方法）**维度。programmable 描述一个 Object 持有并演化自身**自定义 ContextWindow + object method 表**的能力——这是「自我塑造四件套」（reflectable 改知识 / programmable 改方法 / visible 改 UI / readable 改对外展示）里**改方法**的那一件。我是 supervisor 的子对象，了解这个维度的设计、现状、问题与待办。

> 术语对齐（command→method 重命名后）：我说的 **object method** 指 `window.methods` 字典里那种**操作 object 数据**的方法（executable 维度的 `registerExecutable` 注册）；它与 **window method**（readable 维度的 `windowMethods`，只控制 window 自身的信息展示）是两类东西。本片讲的「自写方法」=自写 object method（执行体热更），不要和 window method 混淆。

## 我负责的

- **自我门面 window + object method 表**：每个 Object 在自己的 `stones/<self>/executable/index.ts` 里 `export const window: StoneObjectDeclaration`（window.id=window.type=objectId，**不再有 `custom:` 前缀**）+ 可选 `ui_methods`。`window.methods` 是标准 `ObjectMethod` 字典，与内置 window（do/talk/file）上的 method 完全同构。
- **统一调用协议**：LLM 经 `exec(window_id="<self_object_id>", method=<name>, args={...})` 直接调，与 `do_window.continue` / `talk_window.say` 同构；ts/js sandbox 里另有 `await self.callMethod(window_id, method, args)` 供脚本编排多步调用。UI / agent-native 经 HTTP `callMethod` 调 `ui_methods`（与 LLM 路径完全解耦、形状不同）。
- **写文件即热更**：loader 按 `executable/index.ts` 的 mtime 缓存，`?t=mtime` 破坏 bun import cache；写文件后下一次调 method 自动重新 import，新形态立刻生效——不重启进程、不重新部署。
- **ProgramSelf 注入**：program ts/js sandbox 与 custom method dispatcher 路径收到 `programSelf = { dir, callMethod, getData, setData, getThreadLocal, setThreadLocal }`（2026-06-02 起字段名 `programSelf`，与 method receiver `ctx.self` 区分）。program shell 经 env 透出 `$OOC_SELF_DIR`。
- **自写方法闭环**：与 reflectable 配合，super flow 经 `write_file` 重写 `executable/index.ts` → 下一次调 method 看到新形态。

## 当前设计（锚真实代码）

- 维度 API 面：`packages/@ooc/core/programmable/index.ts:9`（git CLI 薄包装 / stones bootstrap / versioning 编排：`commitWorktree` / `tryMergeSelf` / `httpDirectMainWrite`）。层级规则 `programmable → persistable` 单向。
- object method 类型：canonical `ObjectMethod` 在 `packages/@ooc/core/_shared/types/method.ts:48`（字段 `paths / intent(args) / onFormChange / schema / exec` + `permission / public / for_ui_access`；**已删 `match` / `knowledge`** 字段，C7 后统一 intent/onFormChange/schema）。自定义 window 声明 `StoneObjectDeclaration` 在 `packages/@ooc/core/executable/object/object-types.ts:46`，method 字典字段名为 **`methods`**（不是 `commands`）。
- 动态加载与热更：`packages/@ooc/core/runtime/server-loader.ts:21` `ServerLoader`；`?t=mtime`（:78）破坏 import cache；旧 `llm_methods` 出现即抛硬切错误（:80-84，提示改写为 `export const window … { methods: { … } }`）；同时加载 `readable.ts`（:86-97）；接口 `loadObjectWindow`(:113)/`loadUiServerMethods`(:118)/`loadObjectReadable`(:123)/`invalidateStone`(:128，按 stone 失效)/`clearCache`(:137)，module-level wrapper `clearServerLoaderCache`(:168)。
- ProgramSelf：`packages/@ooc/core/executable/object/self.ts:23` `createProgramSelf`；`callMethod`(:31) lookup window → `registry.getObjectDefinition(type).methods[method]` → exec；`getData·setData`(:60,:67) 读写 flow 级 `flows/<sid>/objects/<self>/data.json`；`getThreadLocal·setThreadLocal`(:76,:79)。
- program shell env：`packages/@ooc/core/executable/program/self-env.ts:16` `buildProgramShellEnv` 经 `resolveStoneIdentityDir(ref, "write")`(:22) 解析 `OOC_SELF_DIR`(:27)。
- program 运行时：`packages/@ooc/builtins/program/executable/runtime.ts:50` `runOneExec` 只路由 shell/ts/js 三种语言模式（旧的 callMethod/function 子模式已退役，见 :10-13）；shell 经 `buildProgramShellEnv`(:65)，ts/js 经 `createProgramSelf`(:87) 注入 self。
- stone 写路由：LLM session 内所有 stone 写（改自己 / 改别人 / 建新对象）→ 直接 `write_file` 落 `flows/<sid>/` session worktree；HTTP 控制面写 → 直接 commit main（`httpDirectMainWrite`）。`versionedStoneWrite` / `openMetaprogWorktree` 已于 2026-06-09 删除。
- 概念权威：`packages/@ooc/meta/object.doc.ts:3739` 节点 `programmable`（loader / program_self_injection / custom_window_invocation / window_evolution 等 children）。

## 现状

最小闭环已落地。2026-06-06 把 program shell `$OOC_SELF_DIR` 接入 session-worktree 统一模型；2026-06-09 进一步统一写路由：LLM session 内所有 stone 写（含 cross-object）直接 `write_file` 落 `flows/<sid>/` worktree，`OOC_SELF_DIR` business session 解析到 `flows/<sid>/objects/<id>/`，与 `write_file`/`edit` 收敛到同一目录。`versionedStoneWrite` / `openMetaprogWorktree` 已删；HTTP 控制面写直接 commit main。command→method 重命名后，自写方法路径全面切到 `window.methods` + `exec(window_id, method, args)`。hot-reload 已落 tier 1（fs watch → 失效对应 stone 缓存，`packages/@ooc/core/runtime/hot-reload.ts`）。

## 已知问题 / 边界与未决

- **自改 method 集的边界与生效**（跨切，与 executable 共担）：自改 `executable/index.ts` 无硬 deny（write_file 弱 ask）；method 集/readable 为全局 main-canonical，per-session 改须经 reflectable `evolve_self` 合入 main 后重注册才生效。programmable 只描述 *如何写* 才能生效，不规定 *谁可以写*——后者由 reflectable.business_task_isolation + caller 显式请求决定。
- **params schema 校验未强制**：`ObjectMethod.schema` 字段已存在（结构化渲染 + fail-soft），但写入期没有硬闸门；若要自动参数检查/转换，需在 exec 调用路径 + ui callMethod 路径同时加。
- **`export const window` 当前是单数**：后续可演化为复数 windows 字典（注册多个自定义 window 类型）。
- **hot-reload 仅 tier 1**：tier 2 knowledge 增量 re-synthesis、tier 3 visible 浏览器端 HMR 仍 TODO。
- **mtime 失效假设 FS 毫秒精度**：秒级精度 FS 有「写完立刻读旧版」极短窗口，无 etag/hash 兜底。
- **programmable tier=Bad 完整闭环未收**：引导 agent 用 write_file 而非 program shell 写 method、overlay × 自我编程交互——属 affordance/design，另议。

## 优化方向 / 待办

1. 收口「自改 method 集生效路径」的 affordance：让 agent 默认走 write_file + evolve_self，而非 program shell 写孤儿路径（programmable tier=Bad 根因的剩余 design 部分）。
2. 把 `ObjectMethod.schema` 升级为写入期闸门（exec 调用路径 + ui callMethod 双路径），把当前「LLM 自觉填参」换成结构化校验。

## 协作

- **parent**：supervisor（我向它汇报 programmable 维度的设计现状与跨维度冲突）。
- **兄弟 executable**：custom window 的 object method 复用 executable 的 `ObjectMethod` / WindowRegistry / exec 协议；method 注册经 `registerExecutable`（与 readable 的 `registerReadable` 维度劈分）；「自改 method 集的边界与生效」与之共担。
- **兄弟 reflectable**：自写方法闭环的触发与协议归 reflectable（business_task_isolation / evolve_self）；programmable 管被改对象（方法库）的形状与生效条件。
- **兄弟 readable**：我管的 object method（操作数据）与 readable 管的 window method（控制 window 展示）是两类并列方法，分别经 `registerExecutable` / `registerReadable` 注册，同名会 fail-loud。
