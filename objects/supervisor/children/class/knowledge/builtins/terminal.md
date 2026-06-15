---
title: terminal — bash 终端 tool-object（方法 run；child terminal_process=bash 进程）
description: _builtin/terminal 家族单一权威——kind=object 单例 tool-object、无 data、object method run、child terminal_process（非单例 class，bash 子进程 + history）；投影成只读身份窗
activates_on:
  "object::root": "show_description"
---

# terminal

> bash 终端 tool-object：被 agent 组合持有、被 exec（不被 talk、不跑 thinkloop）。其唯一 object method `run` 跑一段 bash 脚本，造出 child `terminal_process`（bash 子进程 + history）作为结果窗。
> 对象模型（class/object、单例/非单例、construct、IS-A 继承 / HAS-A 组合、children 命名空间、`_builtin/<id>` 寻址）见 class `knowledge/object-model.md`，本文不复述模型。
> **以设计为准**：存量代码部分接线已过期（旧 self.md「side-effect 注册」comment、stale 测试 API、parentClass 未显式 null），分歧逐条记入「五、源码现状与差异」。

## 一、是什么（核心职责）

- **ooc.kind = `object`**（`package.json` `ooc.kind:"object"`，`packages/@ooc/builtins/terminal/package.json:13`）——声明为实例而非类定义。
- **继承**：tool-object，设计上 `parentClass=null`（无 agency、不继承 root god-object）。**实测注册未显式置 null**（见差异 §5.2）。
- **单例 tool-object**：一个 world 一个终端，被多个 agent 共同持有（成员 by-reference 单例注入）；无 construct（`index.ts` 只装配 executable/readable，`terminal/index.ts:13`）。
- **不是 Agent**：无 talk/plan/todo 等 agency，只持自己的工具方法面 `run`。一句话职责：把「跑 bash」收成一个可被 exec 的成员对象，每次调用造出一个 bash 进程窗。

> 同形家族：`filesystem`（文件系统）、`interpreter`（ts/js 解释器）也是这种「单例 tool-object + child=进程/资源窗」结构。terminal 与 `interpreter` 几乎完全同构（一个 bash、一个 ts/js），其 child 共用 `_shared/executable/process-*` 与 `_shared/visible/process-*`（cross-ref：interpreter.md）。

## 二、data 结构（types.ts）

`interface Data {}`（`terminal/types.ts:10`）——**空对象**。terminal 自身无业务运行时数据，只承载身份 + 方法面；状态全在它造出的 child `terminal_process` 上。窗信封（id/class/title/status/createdAt）由 runtime 管理，不在 Data。

## 三、能力

### object method（executable）

- **`run`**（`terminal/executable/index.ts:20`）——跑一段 bash 脚本。schema：`{ code: string (required) }`。不改 self（Data 空），副作用 = 经 `ctx.runtime.instantiate("_builtin/terminal/terminal_process", { code })` 造一个 child `terminal_process`（首次 exec 已跑完、结果进其 history），返回 `terminal_process 已创建（<id>）` 提示串。`ctx.runtime` 缺失则 fail-loud throw。**非 for_ui_access**（无 UI 请求标记）。

### window method（readable）

无自定义 window method（terminal 无投影态可调，`TerminalWin {}` 空，`terminal/readable/index.ts:17`）。

### 投影（readable）

投影成单一 window class `terminal`（readable 返回的 `class:"terminal"`，`terminal/readable/index.ts:21`）：渲染一段静态 `<about>` 身份/用途文本（「终端对象…run 跑一段 bash 脚本…造出 terminal_process」），window 声明 `object_methods: ["run"]`（`terminal/readable/index.ts:33`）、无 window method。不随视角变化（无业务数据/视口）。

### visible / persistable / construct

- **visible**：无（terminal 自身无 UI；进程详情面板在 child terminal_process 上）。
- **persistable**：无自定义，走系统默认（Data 空，无需序列化，`terminal/index.ts` 注释明示不写 persistable）。
- **construct**：无——单例 tool-object 即其唯一实例，无 construct。

## 四、children（命名空间从属，不继承）

### `_builtin/terminal/terminal_process`（kind=class，非单例）

bash 进程窗——terminal.run 造出的结果对象。一个 world 可有多个 terminal_process。

- **data**（`children/terminal_process/types.ts:14`）：`{ history: ProcessExecRecord[] }`。每次 exec 一段 bash 追加一条 `ProcessExecRecord`（`{ execId, language:"shell", code, output, ok, startedAt }`，类型 + 输出格式化收在 `@ooc/builtins/_shared/executable/process-record.ts`，与 interpreter_process 共用）。
- **construct**（`children/terminal_process/index.ts:16`）：非单例 class，schema `{ code: string (required) }`；`exec(ctx, args)` 经 `runBashExec(ctx.thread, code)` 跑一遍 bash、把结果作为 history 首条返回 `{ history: [record] }`。无 thread context 或空 code 则 fail-loud throw。
- **object method**（`children/terminal_process/executable/index.ts`）：
  - `exec`：在本进程窗再跑一段 bash，`self.history = [...self.history, record]` 追加，调 `ctx.reportDataEdit?.()` 上报。
  - `close`：关窗，无副作用（runtime 据返回值置 close 投影态）。
- **window method**（`children/terminal_process/readable/index.ts:22`）：`set_history_window`（`history_tail` / `history_start` / `history_end` 调 history 渲染视口，只动投影态 `ProcessWin.historyViewport`、不碰 Data），由 `_shared/executable/process-readable.ts` 工厂产出，与 interpreter_process 共用。
- **投影**：window class `terminal_process`，body = `renderProcessHistory(self.history, win)`（history 摘要按视口截取 + 最近一条 full output；默认末 10 条）。
- **visible**：有——`visible/index.tsx`（详情面板 `ProcessWindowDetail`）+ `visible/diff.tsx`（`ProcessWindowDiff`），均复用 `_shared/visible/process-*`。
- **persistable**：无自定义，走系统默认（history 是纯 JSON）。
- **bash 执行细节**：`runBashScript`（`children/terminal_process/executable/shell.ts:10`）经 `Bun.spawn(["bash","-c",code])`，cwd=`process.cwd()`、30s timeout、stdout/stderr/exitCode 经 `formatShellResult` 格式化；`buildBashEnv` 透出 `OOC_SELF_DIR`（经 `resolveStoneIdentityDir(ref,"write")` 解析 session worktree object 目录，让脚本可稳定定位 stone 目录）。

## 五、源码现状与差异（设计 vs 实现）

### §5.1 符合设计

- kind=object（`package.json:13`）、空 Data、无 construct、单例 tool-object 形态、object method `run` 委托造 child、child terminal_process 非单例 + construct + exec/close + set_history_window 投影态隔离——均与 object-model.md 核心 1/3/4/5/8 一致。
- child 注册键 `_builtin/terminal/terminal_process`（`runtime/register-builtins.ts:57`）以 parent id 为前缀，符合核心 8「children 命名空间从属」。
- terminal 无 self.md（非 agent 实例），符合核心 9 + 迁移映射「self.md 只属 agent 实例」。

### §5.2 偏离 / 过渡态

- **`parentClass` 未显式 null（应修，过渡态可接受）**：class `self.md` 与 builtins 索引声明 tool-object（filesystem/terminal）`parentClass=null`（不继承 root），但 `register-builtins.ts:60` 注册 `_builtin/terminal` **未传 `{ parentClass: null }`** → `parentClass===undefined` → 链解析回退到 `root`（`object-registry.ts:145`）。对比同文件 `feishu_chat`/`feishu_doc` 显式 `{ parentClass: null }`（`:70-71`）、root 显式 null（`:42`）。后果：terminal **仍继承 root god-object 的全部工具方法**（root 未拆——class self.md「过渡态：root god-object 未拆」§现状）。注：agency（talk/plan）在 `_builtin/agent` 层、不在 root，故 terminal 仍不获得 agency；但「tool-object 不继承 root」这条设计**当前不成立**，是 root 收敛重构（self.md 优化方向 3）落地前的过渡态。
- **`terminal_process` child 设计上不继承 terminal**（核心 8：children 不继承 parent，仅命名空间从属），但注册 `_builtin/terminal/terminal_process`（`:57`）同样未显式 `parentClass:null` → 隐式继承 root。属同一 root-未拆过渡态。
- **stale 测试（应修）**：`__tests__/terminal.test.ts` 全部 3 个用例 **fail**——调用已删除的 registry API `getObjectDefinition` / `resolveMethod` / `def.methods.run`（现 API 为 `getClass` / `resolveObjectMethod` / `resolveConstructor`），且断言「run 经 registerWindowClass 注册」这一已废弃的 side-effect 注册模型（现注册集中在 `runtime/register-builtins.ts`）。这是「大重构延后修测试」记账状态，非功能缺陷。
- **旧 comment 漂移（应修）**：`index.ts` 头注 `// side-effect: registerWindowClass`（在测试里）描述的「import 包触发 side-effect 注册」机制已被集中式 `register-builtins.ts` 取代——comment 过期。

## 六、倒推 ooc core 改进方向

1. **register 应据 OocClass / package.json 自动判定 parentClass，而非散落在 register-builtins.ts 手工传 meta**（severity high）——terminal 漏传 `{ parentClass: null }` 直接导致设计上的 tool-object 被悄悄挂上 root（无报错、无门控）。tool-object 的「非继承」语义应由 class 自身声明（如 package.json `ooc.class:null` 或 OocClass 显式 marker）并被 registrar 读取，避免「忘记传 meta = 静默继承 root」的失配。
2. **root god-object 拆分阻塞 tool-object 边界落地**（severity medium）——只要 root 仍持 file/program 等工具方法，terminal「不继承 root」无论是否传 null 都意义有限（继承链终点仍是冗余工具面）。core 需把 agency 收敛到 `_builtin/agent`、工具方法收敛到各 tool-object，再移除 root 同名方法（self.md 优化方向 3 已识别，实测移除一步破约 30 个测试，需分阶段）。
3. **`ctx.runtime.instantiate` 是 tool-object 造 child 的唯一通道，但契约弱**（severity medium）——terminal.run 仅靠 `if (!ctx.runtime) throw` 防御，constructor 缺 thread context 时在 child 层才 throw（`terminal_process/index.ts:26`）。core 应把「tool-object 方法 → instantiate child class」收成一等委托原语（带 thread/runtime 句柄完整性校验 + 统一错误），而非每个 tool-object 各写一遍守卫。
4. **stale 测试随 registry API 重命名无 gate 拦截**（severity low）——`getObjectDefinition`/`resolveMethod` 删除后，引用它们的 builtin __tests__ 静默失效（运行才 fail，不进 typecheck gate）。core 的 registry 公共 API 变更应有跨 builtins 包的引用审计（如 check:doc-drift 同款符号扫描），避免测试与文档断言一起漂。
