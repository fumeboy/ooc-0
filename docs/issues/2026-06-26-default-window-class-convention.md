---
title: ReadableModule.window 必含 class:"default" 的 decl（统一默认投影约定）
status: verified
date: 2026-06-26
---

# ReadableModule.window 必含 class:"default" 的 decl

## 背景 / 动机

当前每个 builtin 的 `readable.window[]` 数组的 `class` 字段用「短名（去 `_builtin/` 前缀）」：
- filesystem → window class `"filesystem"`
- file → `"file"`、search → `"search"`
- knowledge → `"knowledge"`
- terminal_process → `"terminal_process"`
- ……

每个 class 的「默认投影名」=「自己的短名」，**约定隐式存在但无统一名字**。带来的问题：

1. **新建 class 时必须新起名字**——`object_methods` / `guide_methods` 引用、`computeProjectionClass` 路由、外部 visible/server callMethod 等都得知道这个名字才能配。一个 class 多一个心智负担。
2. **不可枚举的"默认"**——`resolveWindowClass(classId, projectionClass)` 没有"找不到就回退默认"的语义；renderer 想要"任意 class 都有保底投影"需要每处都知道该 class 的默认名。
3. **多视角投影易漂移**——thread 现在用 `this_thread` + `talk` 两 class，self.md / readable 文件头注释、还有 reflectable 设计承诺的 `reflect_request` 第三 class——三套命名分散在 readable.window decl、computeProjectionClass 内联 ternary、文档里。如果"默认"叫 `default`，非默认视角才另起名，多视角与单视角的协议变得一致。
4. **`_builtin/agent` 的 decl 永远不被命中**——它的 `class` 字段写全名 `"_builtin/agent"`，但 readable render 返回的 `projection.class = ctx.object.class`（= 实例 objectId 如 `supervisor`）——`resolveWindowClass("_builtin/agent", "supervisor")` 永远 miss。设计/实施漂移点（详见 readable reviewer 报告）。

**用户提案**：每个 class 必须有 `class:"default"` 的 window decl 作为默认投影；多视角时用其它名字。

## 现状（锚 index.md 对应 `##` 节）

锚点：
- `## readable`（B 区）—— 核心 5「同一 Object 多视角投影成不同 window class」+ 核心 7「静态 readable.md 名片是投影的最低优先级回退」。
- `## OOC Class/Object Model`（A 区）—— 核心 1「class 必有 four-pack」、核心 4「object 投影成 context window」。
- `## executable × readable`（D 区）—— window class decl 装配契约。
- `## thread`（E 区）—— 唯一真正多视角投影的 builtin。

涉及文件：
- `packages/@ooc/core/types/readable.ts:60-77`（`WindowClassDecl` / `ReadableModule`）
- `packages/@ooc/core/runtime/object-registry.ts:46-82`（注册校验）；同文件 `resolveWindowClass`
- `packages/@ooc/builtins/**/readable/index.ts`（**全部** readable decl）
- `packages/@ooc/builtins/agent/children/thread/readable/index.ts:86-108`（多投影路由）

## 改动提案

### 改动 1：协议层加注册期闸门

`ReadableModule.window: WindowClassDecl[]` 注册期校验：
- **必须存在** `class === "default"` 的 decl，否则 fail-loud。
- `window[].class` 在数组内**不重复**，否则 fail-loud（当前 `resolveWindowClass` 静默取第一个）。

`resolveWindowClass(classId, projectionClass)` 仍按名 find；调用方约定缺省取 `"default"`。

新增 `resolveDefaultWindowClass(classId)` registry seam，等价于 `resolveWindowClass(classId, "default")`，给 renderer / `computeProjectionClass` fallback 用。

### 改动 2：调整全部 builtin 的 window class 名

对每个 builtin，把当前单 decl（短名）的 `class` 字段改为 `"default"`。多 decl 的 builtin（thread）保留非默认视角的命名、把"主投影"改名 `default`。

具体表（已扫，见 readable survey）：

| Class id | 原 window.class | 新 window.class |
|---|---|---|
| `_builtin/filesystem` | `filesystem` | `default` |
| `_builtin/filesystem/file` | `file` | `default` |
| `_builtin/filesystem/search` | `search` | `default` |
| `_builtin/terminal` | `terminal` | `default` |
| `_builtin/terminal/terminal_process` | `terminal_process` | `default` |
| `_builtin/interpreter` | `interpreter` | `default` |
| `_builtin/interpreter/interpreter_process` | `interpreter_process` | `default` |
| `_builtin/knowledge_base` | `knowledge_base` | `default` |
| `_builtin/knowledge_base/knowledge` | `knowledge` | `default` |
| `_builtin/agent` | `_builtin/agent`（永不命中） | `default` |
| `_builtin/agent/thread` | `this_thread` + `talk` | **`default`**（自视角）+ `talk` |
| `_builtin/agent/pr` | `pr` | `default` |
| `_builtin/agent/plan` | `plan` | `default` |
| `_builtin/agent/todo` | `todo` | `default` |
| `_builtin/agent/method_exec_form` | `method_exec_form` | `default` |
| `_builtin/agent/skill_index` | `skill_index` | `default` |
| `_builtin/runtime` | `runtime` | `default` |
| `_builtin/user` | `user` | `default` |
| `_builtin/feishu_app` | `feishu_app` | `default` |

### 改动 3：thread 多投影路由对齐

`packages/@ooc/builtins/agent/children/thread/readable/index.ts:86-108`：
- `computeProjectionClass(...)` 现内联 ternary `win.class === "this_thread" ? "this_thread" : "talk"` → 改为 `win.class === "talk" ? "talk" : "default"`（self thread 看自己=default，与对端会话=talk）。
- `reflect_request` 投影 class 不在本 issue 落地（属 issue D）。

### 改动 4：调用方更新

- `ReadableProjection.class` 各 builtin 渲染返回值同步改：返回 `"default"` 或 `"talk"`（thread 多视角时）。
- 凡硬编码引用旧短名的地方（如 `_builtin/agent/readable/index.ts:42` 返回 `ctx.object.class` 的设计漂移）一并修：agent 自己的 readable 应返回 `"default"`，不是 objectId（漂移点已修）。

### 改动 5：文档更新

- `index.md` `## readable` 核心 5 / 核心 7 段附注：「默认投影 class 名固定为 `"default"`；多视角时用其它名字」。
- `readable.self.md` 核心段同步补充。
- `executable × readable` 节 D 区：注册期闸门新增「必含 default」。

## 受影响设计元素

A 区
- `## OOC Class/Object Model` —— 核心 1「class 必有 four-pack」语义边角：readable 内必有 default decl（强约束细化）。

B 区
- `## readable` —— 核心 5 加默认投影固定名约定；注册期闸门加强。

D 区
- `## executable × readable` —— window decl 装配契约 + 注册校验

E 区
- `## thread` —— 多投影命名调整（此 thread 视角=default + talk）。

C 区
- `## builtins` —— 全部 builtin readable decl 命名同步调整。

未受影响：thinkable / persistable / collaborable / reflectable / visible / observable / app 等。

## 风险与权衡

1. **window class 名硬编码扫描**：所有引用旧短名的地方需要找全（其它源码、knowledge、test、e2e）；漏一处则投影 miss。**对策**：grep 一遍各旧名字符串字面值，逐处 fix。
2. **thread 命名调整影响 reflect_request 演进**：本 issue 把 `this_thread` 改 `default`，issue D 落地 reflect_request 时新增 `reflect_request` decl；两 issue 顺序无关、可并行。
3. **`_builtin/agent` decl 名修复顺带做**：原 `class:"_builtin/agent"` 形同虚设，改 `default` 后 readable render 返回也得改为 `"default"`，否则 isSelf 走旁路展示 method 的 hack 还在但 decl 路径终于可命中。

## 待裁决点

1. **`"default"` 名是否可改**：是否用 `"self"` / `"main"` / `"_"`？倾向 **default** —— 语义清晰、与"按视角投影出别的 class"对比明显，且不会与任何业务概念冲突。
2. **registry 闸门是否同时校验 `object_methods` / `guide_methods` 引用悬空**：本 issue 顺手做？倾向**做**——一并扫一次 readable decl 的引用完整性更省事。但若 issue A 已加 guide_methods，此校验在 issue A 落地后补；本 issue 只 ensure default 存在 + class 唯一。

## review 记录

按 design-workflow 步骤 2，4 个 reviewer fan-out（readable / object-model / thread / 完整性批评官）。结论：方向正确，**但 thread 改名是关键裁决点**——supervisor knowledge 多处既有「thread 窗 / talk 窗 / reflect_request 窗」三视角并列具名表达，把自视角改名 `default` 会破坏三视角对称。reviewer 强烈建议「**单视角 class 默认 = default**；**多视角 class 各视角具名、不取默认**」。

### review by readable —— 通过、附 7 处补全

- 用 `"default"` 作为默认投影 class 名**合理且不破坏多视角**——它给"未指明 class 时默认投哪个"这条本就存在的隐式问题一个显式命名；多视角 class 仍可同时声明 default + 其它具名视角。
- 必须明确：`default` 是 reserved keyword；每个对象 readable decl 必有且只有一个 default decl（落地者在 readable self.md 显式声明该约束）。
- 改动 1 `resolveDefaultWindowClass` 找不到 default class 时应 **fallback 到 `readable.md` 名片**（兑现 readable 核心 7 最低优先级回退）。
- isSelf 旁路（agent 看自己时直接展示 method）保留语义，但建议**未来**改为显式 `self` class——本 issue 不夹带，留下后续 issue。
- `resolveDefaultWindowClass` seam 放 readable 维度（runtime 是 consumer）。
- 改动 5 文档扫描范围扩大到 thinkable knowledge / storybook stories / e2e 任务脚本 / builtin `readable.md` 名片 / shorthand 文档。

### review by object-model —— 通过、4 处提醒

- 核心 1「class 必有 four-pack」不延伸（不把 default 闸门写进核心 1）；本约定归 readable 维度。
- 多视角投影与 `ooc.class` binding 正交；default 不强制对象身份 binding。
- `resolveDefaultWindowClass` 与本类直查一致；`extendClass` 通过 source spread 在子 class 物理 export default 时闸门照过——无沿链 fallback。
- WindowClass 命名是 per-class scoped，跨 class 同名 default 不冲突。

### review by thread —— **方向有保留**：thread 自视角不该叫 default

**关键发现**：
- grep 全树证实 `"this_thread"` 字面值仅在 thread/readable/index.ts 3 处出现；外部代码、agent knowledge、tests、storybook 均零命中——改名物理面干净。
- **但** supervisor knowledge `## thread`（index.md:96/126/173）、agent.md:63 多处用「thread / talk / reflect_request 三种 window class」表达——3 个视角并列具名，把自视角降级为「兜底默认」破坏三视角对称。
- reviewer 推荐：**保留 thread 自视角命名 `thread`，不改 default**。三视角对等命名：`thread` / `talk` / `reflect_request`。
- registry 闸门修订建议：**单视角 class 默认 decl 名 = `default`**（强约束）；**多视角 class 不强制 default**（豁免）；或同等表述「至少有一个 decl + default 是单视角约定（非强制）」。
- 落地必做：grep 所有 ContextWindow ref 派生点，验证 talk-view 的 `class` 字段都写 `"talk"`。
- 路由扩展接缝：本 issue B 改动 3 段尾应声明「reflect_request 在 issue D 接入第三档；B/D 顺序无关」。

### review by completeness critic — 6 处需补 + 内部自洽 + 术语漂移

- 漏列受影响元素：**visible**（前端 React renderer 是否按 class 派发？unknown class fallback 行为？）、**persistable**（win 持久化是否含 class 字段？老 flow 重放 schema 兼容？）、**reflectable**（reflect_request 与 default 的优先级）、**thinkable**（context renderer 是否硬编码 class）、**app**（HTTP wire format 是否始终写 class）。
- 内部自洽：必须明文写「default 与显式 class 优先级规则」+「唯一 resolution point」，避免 reflect_request window 落库漏写 class 被 default 吞掉。
- 术语统一：window.class（字段） / default 约定（规则） / default class 值（字符串 `"default"`） 三者命名要分离。

## 裁决

**采纳改动 1-5，但闸门规则按 thread reviewer 建议放宽：**

1. **闸门规则修订**：
   - **单视角 class（window[] 长度=1）**：该 decl 的 `class` 字段**必须**为 `"default"`，注册期 fail-loud。
   - **多视角 class（window[] 长度>1）**：**至少有一个 decl** 的 `class` 字段为 `"default"`，**或**所有 decl 各持具名 class（无 default decl 允许）—— 二选一。
   - 这条规则的逻辑：默认投影是"未指明时给哪个"的兜底，单视角自然=default；多视角 class 通常每条都有具名语义（`talk` / `reflect_request` / `diff` / `blame`），不强求兜底——若调用方未指明 class 而该 class 又没 default decl，则 fail-loud（"必须显式指定 class"）。
   - `resolveDefaultWindowClass(classId)` 查 default decl；找不到时回退 `readable.md` 名片（兑现 readable 核心 7）；都无落 placeholder。

2. **thread 自视角保留 `thread` 命名**（不改 default）：
   - `_builtin/agent/thread` window[] 三视角并列具名：`thread`（自视角）+ `talk`（对端会话）+ `reflect_request`（super flow POV，**由 issue D 落地**）。
   - 本 issue 仅做：把 `this_thread` 改名 `thread`（**减少术语漂移**——与 supervisor knowledge 一致）。
   - computeProjectionClass 路由：`win.class === "talk" ? "talk" : "thread"`（仅二档，reflect_request 由 issue D 在前面 push 一档）。

3. **其余 17 个 builtin 单视角全部改名为 `default`**（按 issue 原 改动 2 表执行，唯一改动：thread 行从 `this_thread + talk → default + talk` 改为 `this_thread + talk → thread + talk`）。

4. **`_builtin/agent` decl 漂移修复**：原 `class:"_builtin/agent"` 改 `class:"default"`，readable render 返 `"default"` 同步——isSelf 旁路保留，未来另起 issue 改为显式 `self` class。

5. **注册期校验扩展**（与 issue A 共享落地）：
   - window decl 自身 `class` 不重复（修复 resolveWindowClass 静默取第一个）。
   - 单视角 default 强约束 / 多视角 default-or-all-named 二选一。
   - 留 issue A 的 `object_methods` / `guide_methods` 引用悬空校验同侧补。

6. **受影响设计元素补**：
   - `## visible`（前端 React renderer 按 class 派发 fallback 策略与 server 端 default 约定对齐——若不强制对应，二者各自处理）。
   - `## persistable`（win 持久化 schema 不涉及 class 字段；不补）。
   - `## reflectable`（reflect_request 与 default 是不同视角，issue D 落地时验证不冲突——本 issue 内仅在「与 issue D 的关系」段说明）。
   - `## thinkable`（context renderer 透传 projection.class，无硬编码——`thinkable/context.ts:50` 即原样写出 XML class 属性；不补）。
   - `## app`（HTTP wire format 现已写 class 字符串，不强制写 default；不补）。

7. **文档扫描扩面**：
   - supervisor knowledge `## thread`（index.md:96/126/173）、agent.md:63 表述对齐——继续用「thread / talk / reflect_request」三视角名（不改）。
   - `readable.self.md` 三、四段补「单视角默认 = default / 多视角无强制」约定 + `default` 是 reserved keyword + readable.md 名片回退优先级。
   - 各 builtin 的 `readable.md` 名片（如有）检查是否硬编码 class 名（grep 一遍）。
   - storybook readable.story.ts 加单视角 default 闸门用例 + 多视角豁免用例。

**落地步骤**（worktree `.worktree/default-window-class-convention`）：

1. core/runtime/object-registry.ts：注册期校验扩展（单视角强 default / 多视角豁免 / class 唯一）。
2. core/runtime/registry seam：加 `resolveDefaultWindowClass(classId)`（找不到 → 读 `readable.md` 名片 → null）。
3. 17 个 builtin readable/index.ts 改 window[] 的 class 字段为 `default`（thread 用 `thread`）。
4. 17 个 builtin readable render 返回 `projection.class = "default"`（thread 自视角 `"thread"`，对端 `"talk"`）。
5. thread/readable/index.ts：computeProjectionClass 改 `win.class === "talk" ? "talk" : "thread"`；window decl 改为两条具名 `thread` + `talk`。
6. `_builtin/agent` decl 漂移修复：class 改 `default`，render 返 `default`。
7. tests/registry.test.ts 加用例。
8. 文档回流（pair-flow）：readable/self.md 三、四段 + index.md `## readable` 节同步。

**与其它 issue 关系**：
- **issue A 共享**：注册期校验扩展同侧补；可在同 worktree 或独立 worktree，分次落地皆可。
- **issue D（reflectable redesign）**：D 落地 reflect_request decl 时往 thread window[] 加第三条 `reflect_request`，computeProjectionClass 前置 super sessionId 判定 → 投影 reflect_request；不影响 B 的 default 约定。

## 落地验收

### verification by issue-B reviewer（2026-06-26）

按 design-workflow 步骤 4 独立验收。结论：**verified**——代码落地完整、质量门绿、退潮干净、无漂移。

- **文档验收**：裁决 1-7 每条对账；闸门规则（单视角强 default / 多视角豁免 / class 字段唯一）真实施；thread 保留 `thread` 名（不改 default）真做；`_builtin/agent` decl 漂移修复真做；self.md 三段补「default 是 reserved keyword + readable.md 名片回退 + 单视角强约束/多视角豁免」三条契约；index.md `## readable` / `## executable × readable` 已同步。
- **代码验收**：
  - 19 个 builtin readable decl `class` 字段全 `"default"`（thread 两条 `thread`+`talk`）；render 返回 projection.class 也对齐。
  - thread/readable/index.ts 三处 `"this_thread"` 全清；computeProjectionClass 改 `win.class === "talk" ? "talk" : "thread"`。
  - registry `assertReadableWindowCohesion` + `resolveDefaultWindowClass` + `DEFAULT_WINDOW_CLASS` 常量齐。
- **退潮验收**：worktree `packages/` 内 `"this_thread"` 0 命中；旧短名（"filesystem"/"file"/"search" 等）作为 window class 字面值 0 命中；`"_builtin/agent"` 作为 window class 字面值 0 命中。
- **漂移验收**：21 个文件全在 issue 提案范围内（runtime + 19 builtin readable + 1 新测试）；无 thread 路由/readable 渲染/persistable 等域外改动。
- **质量门**：`bun run check:tsc` 干净；`bun test packages/@ooc/tests/registry-window-default.test.ts` = 8 pass / 0 fail / 14 expect / 277ms。

落地 commit：`46534b0c`（feat/default-window-class-convention 分支）。
