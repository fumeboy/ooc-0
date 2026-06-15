---
title: interpreter — ts/js 解释器 tool-object（run → interpreter_process sandbox+history）
description: _builtin/interpreter 家族单一权威——单例 tool-object（无 construct）持 run 方法委托造 interpreter_process；child interpreter_process 是非单例进程类（独立 ts/js sandbox + history + 注入 self）
activates_on:
  "object::root": "show_description"
---

# interpreter

> ts/js 解释器 tool-object 家族：parent `interpreter` 把「跑 ts/js 脚本」收成 `run` 方法，child `interpreter_process` 是一段 sandbox 进程 + exec history。
> 对象模型（class/object、单例/非单例、construct、IS-A 继承 / HAS-A 组合、children 命名空间）见 class `knowledge/object-model.md`，本文不复述模型。
> 以设计为准；存量代码可能过期，分歧记入「五、源码现状与差异」。

## 一、是什么（核心职责）

- **`_builtin/interpreter`**：`ooc.kind=object`、无 `ooc.class` 声明，**单例 tool-object**（`OocClass` 无 `construct`，`index.ts`）。被 agent 经组合（HAS-A）持有、被 exec（非 Agent，不被 talk、不跑 thinkloop）。共享基础设施取全局单例 by-reference。**继承：设计上 tool-object 应 `parentClass=null`（不继承 root，只持自己的工具方法——见 class `self.md` 核心组合段）**；实际注册未传 `{ parentClass:null }` → 当前隐式回退继承 `_builtin/root`，是 root god-object 未拆的过渡态（详「五」）。
- 一句话职责：把「在隔离 sandbox 里跑一段 ts/js 脚本」收成一个 `run` 方法——每次 run 委托 runtime 造出一个 `interpreter_process` 子对象承载结果。
- 与 `terminal`（bash 终端）同构、平级：interpreter 跑 ts/js（in-process 动态 import sandbox），terminal 跑 bash（子进程）；两者的进程窗 history 结构、渲染、viewport window method 复用 `_shared`。

## 二、data 结构（types.ts）

- **`interpreter`**：`Data = {}`（空）。tool-object 无业务数据——只承载身份 + 方法面；窗信封（id/class/title/status/createdAt）由 runtime 管理，无投影态（`packages/@ooc/builtins/interpreter/types.ts:10`）。

## 三、能力

### object method（executable）
- **`run`**（parent interpreter）——参数 `{ language: "ts"|"js"(enum，required), lang?: 别名, code: string(required) }`；经 `ctx.runtime.instantiate("_builtin/interpreter/interpreter_process", {language, code})` 委托造一个 interpreter_process（首段脚本已在 construct 内跑完、结果进 history），返回新进程 id 文本。`ctx.runtime` 缺席时返回清晰错误文本，不抛（`packages/@ooc/builtins/interpreter/executable/index.ts:26`）。非 for_ui_access。

### window method（readable）
- parent interpreter：**无自定义 window method**——无投影态（`InterpreterWin = {}`），window 仅声明 `object_methods:["run"]`（`packages/@ooc/builtins/interpreter/readable/index.ts:23`）。

### 投影（readable）
- interpreter 投影成 class `interpreter`、content 极简（`"解释器"`）——object method 的 description 已足够，readable 不赘述（`readable/index.ts:21`）。

### visible / persistable
- parent interpreter：**无 visible / 无 persistable**——走系统默认（无 UI 详情面板、走默认序列化）。

### construct
- 单例 tool-object，**无 construct**（`OocClass` 仅 `{ executable, readable }`，`index.ts:14`）。它不被实例化为多份；其「实例」语义由 child interpreter_process 的 construct 承载。

## 四、children（命名空间从属，不继承）

### `_builtin/interpreter/interpreter_process`（class，非单例）
- 一段 ts/js 解释进程窗。`ooc.kind=class`，**非单例**——`Class.construct`（`children/interpreter_process/index.ts:22`）。construct 即 parent `run` 委托的目标：取 `ctx.thread` 必需、`normLang(args)` + `code` 必需，经 `runInterpreterExec` 跑首段脚本，返回 `{ history: [record] }`（首条 ProcessExecRecord 进 history）。
- **data**：`Data = { history: ProcessExecRecord[] }`（每次 exec 一条记录，`children/interpreter_process/types.ts:16`）。`ProcessExecRecord`（`execId/language/code?/output/ok/startedAt`）与 terminal_process 共用，收在 `@ooc/builtins/_shared/executable/process-record.ts:9`。
- **object method**：
  - `exec`——在已开窗的进程内再跑一段 ts/js，结果 push 进 `self.history`、`ctx.reportDataEdit?.()` 通知重持久化（`children/interpreter_process/executable/index.ts:25`）。
  - `close`——关窗（无副作用，runtime 处置信封 status，`:50`）。
- **window method**：`set_history_window`——调 history 视口（tail N / 固定 range），返回新 ProcessWin、不碰 Data；history_* 前缀 remap 到 core transcript viewport，与 terminal_process 复用 `makeSetHistoryWindowMethod`（`_shared/executable/process-readable.ts:68`）。默认视口末 10 次 exec。
- **投影**：class `interpreter_process`，content 经 `renderProcessHistory(self.history, win)` 渲染（history 摘要 + 最近一条 full output，`children/interpreter_process/readable/index.ts:18`）。
- **visible**：有自定义详情面板（`visible/index.tsx`，复用 `_shared/visible/process-detail`）+ diff 组件（`visible/diff.tsx`，复用 `_shared/visible/process-diff`）。
- **persistable**：无自定义，走系统默认。
- **sandbox 与注入的 `self`**（机制权威在 programmable `knowledge/interpreter-self-and-shell.md`，本文不复述）：`runInterpreterExec`（`children/interpreter_process/executable/runtime.ts:27`）把 ts/js 写 tmp `.mjs` → in-process `import(...?t=id)` 执行（`sandbox/executor.ts`），console 进 stdout、`_result_` 进 returnValue、异常解析行号。脚本内经 `createInterpreterSelf(stoneRef, thread, runtime?)` 注入的 `self`（`executable/self.ts:44`）可 `callMethod`（经 RuntimeHandle 跨窗调任意 object method）/ `getData`/`setData`（flow 级 data.json）/ `getThreadLocal`/`setThreadLocal`（线程内跨 exec 共享、不持久化）；无 persistence 时 self 为 null。

## 五、源码现状与差异（设计 vs 实现）

- **`package.json` 字段干净**：parent `ooc:{ objectId, kind:"object" }`、child `kind:"class"`——已符合 object-model.md 细节补充（`ooc.kind` 声明 class/object），无 example.md 警示的旧 `kind:"builtin"`/`type:"object"`/`instantiate_with_new_world`。（`packages/@ooc/builtins/interpreter/package.json:11`、`children/interpreter_process/package.json:15`）严格说 child 仍带 `dependencies`（`_shared` + react），属真实构建依赖、非过渡态。
- **单例 / 非单例分层正确**：parent 单例无 construct、child 非单例有 construct——与 class `self.md`「非单例 class 的实例 = 一个 context window」「注册窗类型 ≡ 注册非单例 class」一致；construct 放在 `index.ts` 的 `Class`（不是 example.md 警示的 executable 旧位）。**应作 cross-ref 修正（非本家族源码）**：programmable `knowledge/interpreter-self-and-shell.md` 的代码锚仍写**旧扁平路径** `packages/@ooc/builtins/interpreter_process/...` 与旧签名 `createInterpreterSelf(stoneRef, thread, registry?)`；实际已迁入 `interpreter/children/interpreter_process/...`、第三参为 `runtime?: RuntimeHandle`（`executable/self.ts:44`）。该 sibling doc 的锚已漂移，需回流。
- **stale 测试 import（应修）**：`packages/@ooc/core/executable/__tests__/process.test.ts:8` `import { runExec as executeInterpreterRun } from "@ooc/builtins/interpreter/executable/index.js"`——interpreter executable 并无 `runExec` 导出（只 default + 内部 `run` method object），引用名已死，属退役符号未回流。
- **registry 以 class 键注册（符合）**：`register-builtins.ts:58/61` 把 `_builtin/interpreter`（单例 tool-object）与 `_builtin/interpreter/interpreter_process`（非单例）都注册为 registry class 键——`_builtin/<id>` 直接作 class 键、符合 class `self.md`「builtin = class（`_builtin/<id>` 寻址）」。
- **`parentClass` 未显式 null（偏离 / 过渡态，应修）**：class `self.md` 核心组合段声明 tool-object（filesystem/terminal/interpreter）`parentClass=null`（不继承 root），但 `register-builtins.ts:61` 注册 `_builtin/interpreter` **未传 `{ parentClass:null }`** → `parentClass===undefined` → 链解析回退到 `root`（`object-registry.ts` `resolveParentClassChain`）。同文件 `feishu_chat`/`feishu_doc` 显式 `{ parentClass:null }`（`:70-71`）、root 显式 null（`:42`）。后果：interpreter **仍继承 root god-object 的全部工具方法**——与 sibling terminal 同症，属 root 未拆过渡态（class `self.md` 核心「过渡态：root god-object 未拆」），功能正确、可接受。child `_builtin/interpreter/interpreter_process`（`:58`）同样未显式 `parentClass:null` → 隐式继承 root（children 设计上仅命名空间从属、不继承 parent，故落到 root）。

## 六、倒推 ooc core 改进方向

- **register 应据 OocClass / package.json 自动判定 parentClass，而非手工传 meta**：interpreter 漏传 `{ parentClass:null }`（`register-builtins.ts:61`）直接导致设计上的 tool-object 被悄悄挂上 root god-object——无报错、无门控（同 sibling terminal）。direction：tool-object 的「非继承」语义应由 class 自身声明（如 `package.json` `ooc.class:null` 或 OocClass 显式 marker）并被 registrar 读取，避免「忘记传 meta = 静默继承 root」的失配。severity: high。
- **退役符号未全树回流（drift gate 漏网）**：interpreter 同时暴露两处 drift——sibling 设计 doc 的旧扁平路径/旧签名锚（`interpreter-self-and-shell.md`）+ 测试里的死 import（`process.test.ts:8` 的 `runExec`）。direction：children 命名空间重组（87793f06）后未做「锚 + import 全树回扫」；`check:doc-drift` 应纳入对 `packages/@ooc/builtins/**` 旧扁平路径的精确模式，测试 import 应纳入 `check-no-deprecated-symbols`。severity: medium。
- **construct 与 method 入参 schema 重复声明**：interpreter_process 的 `construct`（首 exec）与 `exec` method 各自手写一份几乎相同的 `{language, lang, code}` schema + `normLang`（`index.ts:22` 与 `executable/index.ts:25`），parent `run` 又复制第三份。direction：core 缺「construct = 首次 method 调用」的统一收口——run/construct/exec 三处 schema 应单一来源（如 construct 复用 exec 的 schema、normLang 共享）。severity: low。
- **单例 tool-object 的「无业务数据」投影偏弱**：interpreter 投影 content 仅 `"解释器"`，method 菜单全靠 object method description 撑。direction：core readable 对「纯方法面 tool-object」可提供标准投影模板（自动从 window 声明的 object_methods 渲染可调菜单），免每个 tool-object 各写贫瘠 content。severity: low。
- **runtime 句柄缺席的两种降级不一致**：parent `run` 在 `ctx.runtime` 缺席时**返回错误文本**（`executable/index.ts:37`），child construct 在 `ctx.thread` 缺席时**throw**（`index.ts:33`）。direction：core 应统一 construct/method 在前置运行时环境缺席时的失败语义（fail-loud throw vs 软返回），避免同一能力链两端表现分裂。severity: medium。
