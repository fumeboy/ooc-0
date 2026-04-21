# Trait Namespace + Views + HTTP Methods

> 类型：feature
> 创建日期：2026-04-21
> 状态：todo
> 负责人：TBD

## 背景 / 问题描述

完整设计见：
- **Spec**：`docs/superpowers/specs/2026-04-21-trait-namespace-views-and-http-methods-design.md`
- **Plan**：`docs/superpowers/plans/2026-04-21-trait-namespace-views-and-http-methods.md`

（Spec + Plan 已由 Alan Kay 确认。）

核心改造：

1. **Namespace 协议**：trait 唯一键从"路径推断的 name"改为"frontmatter 显式声明的 `namespace:name`"；引入省略解析顺序 `self → kernel → library`。
2. **方法双通道**：trait 方法区分 `llmMethods` 和 `uiMethods`，分别对 LLM 调用和 UI 调用开放。
3. **Views**：新引入 `kind: "view"` 的 trait（对应 `VIEW.md`），用于注册 UI 视图，替代当前前端硬编码的 ViewRegistry。
4. **HTTP Methods**：trait 方法可映射为 HTTP endpoint，供前端 / 外部调用。

## 目标

按 Plan 的 4 个 Phase 顺序执行：

- **Phase 1**：Namespace 与 traitId 协议
- **Phase 2**：方法注册改造（llmMethods / uiMethods 分离）
- **Phase 3**：Views 机制（`kind: "view"` / `VIEW.md` / 前端 ViewRegistry 改造）
- **Phase 4**：HTTP Methods（trait 方法暴露为 HTTP endpoint）

每个 Phase 独立 commit，Phase gate 通过后再进入下一个。

## 方案

完整见 Plan 文档。此处只列 Gate 要点：

- 全量 `bun test` 0 fail
- 前端 tsc 0 error（Phase 3+ 开始要求）
- 服务端可启动（Phase 3+ 开始要求）
- 手工 smoke test：Bruce 式体验（Phase 3+ 开始要求）
- 更新 `docs/meta.md` 对应子树
- 每 Phase 结束写检查点进本文件执行记录

## 影响范围

见 Plan 文档各 Phase 的"修改文件"清单。高层：

- 后端 Trait 加载 / 方法注册 / HTTP server
- 前端 ViewRegistry 改造为 trait-view 驱动
- 所有现有 Kernel Traits 需添加 frontmatter（namespace 字段）
- 所有现有 User Traits 同上
- `docs/meta.md` 子树 5（Trait）+ 子树 6（Web UI）大幅更新

## 并行协调

- **与 user_inbox 迭代（进行中）的 server.ts 冲突**：user_inbox 追加新路由。本迭代 Phase 4 也改 server.ts。**本迭代 Phase 1-3 不碰 server.ts 无冲突；Phase 4 开始前需等 user_inbox 完成**（或提供简单 rebase 策略）。
- **与 MessageSidebar / ReflectFlow 无冲突**（文件范围不重叠）。
- **与 Thread 上下文可视化（finish）无冲突**。

## 验证标准

见 Plan 文档各 Phase 的验证节。终态要求：

- `bun test` 全绿
- 前端 tsc 0 error
- 服务端正常启动
- 至少一个完整 E2E：用户在前端触发一个 view-type trait 的方法调用 → 后端执行 → 前端展示结果
- `docs/meta.md` 同步更新

## 执行记录

### 2026-04-21 认领 + 理解摘要

- 状态：todo → doing（软链接迁移）
- 测试基线：`bun test` 484 pass / 0 fail（39 files / 1277 expect）
- 并行协调：User Inbox 迭代仍在 doing/。已读其阶段 0 结论：engine 生成 `messageId` → onTalk 第 7 个参数 → `handleOnTalkToUser` helper。本迭代 Phase 1-2 不动 onTalk / talk 分支，Phase 4 server.ts 会等 User Inbox 完成再进。

**理解摘要**（核心决策一次性归零）：

本迭代把 Trait 体系改成"显式 namespace + 统一 traitId + 双方法通道 + Views 作为 kind=view 的 trait + HTTP call_method 开放入口"。

- **Namespace**：`kernel | library | self` 三选一，frontmatter 必填。traitId = `namespace:name`（冒号分隔，旧的 `namespace/name` 斜杠风格废除）。deps 省略 namespace 时按 `self → kernel → library` 顺序解析。
- **方法注册**：从 `export const methods = [...]` 改为 `llm_methods` / `ui_methods` 两张 `Record<name, def>`。沙箱只暴露一个 `callMethod(traitId, method, args)`，删除扁平与 `trait.method` 两段式。args 永远是对象。
- **Views**：`views/{name}/{VIEW.md, frontend.tsx, backend.ts}` 三件套；VIEW.md 的 `kind: view`，与普通 trait 共用同一 loader / registry / namespace 规则。协议 `ooc://ui/` → `ooc://view/` 硬切。
- **HTTP call_method**：`POST /api/flows/:sid/objects/:name/call_method`，白名单严格（self namespace + kind=view + ui_methods + view owner 匹配）。MethodContext 新增 `notifyThread(msg)` 能写根线程 inbox 并复活 done 线程。
- **原则**：硬迁移无兼容层、TDD 红-绿-重构、每 Task 单 commit、Gate 未过不跨 Phase。

### 2026-04-21 Phase 1 完成（Namespace & traitId 协议）

**与 User Inbox 的冲突事件**：开工途中，User Inbox sub agent 做 `git stash` 把我未提交的 TS 改动打包，导致我的 Edit "看似成功但实际被吞掉"。回收方式：两次 `git stash pop` 还原全部改动。两仓不互相污染历史，Phase 1 提交落地干净。未来阶段若 User Inbox 仍在 doing，会避免碰 world.ts / engine.ts 的 talk/onTalk 路径，但不可避免需要动 engine.ts 的 program 沙箱注入。

**Kernel 仓 commits**：
- `75f8016` refactor(trait): Phase 1 namespace/traitId 协议切换（源码 + 测试）
- `0ccf1fc` refactor(traits): kernel traits TRAIT.md 迁移到 namespace:name 格式

**User 仓 commits**：
- `4b4996f` refactor(traits): library + self traits TRAIT.md 迁移到 namespace:name 格式

**关键决策**：
- traitId = `namespace:name`（冒号分隔），不是 Plan 示例里混用的 `namespace/name`。
- Plan 的 Task 1.1-1.3 合并为单 commit，因为它们在 TS 类型级强耦合（loader 返回值必须补全新字段，单独拆分无法编译）。
- loader 删除 `resolveTraitName` 旧路径推断逻辑，强制 frontmatter 声明；`loadTraitsFromDir` 递归扫描重写（更简洁）。
- `isKernelTrait` 判断由硬编码白名单集合改为 `id.startsWith("kernel:")` 前缀判断，未来新增 kernel trait 不用改代码。
- `engine.readTraitFile` 补齐 `self:` 分支（从 `stones/{name}/traits/` 读），为 Phase 3 Views 铺路。
- 非 kernel namespace 的 fixture 大量存在于旧测试中（如 `math/calc`、`test/a`、`reflect/*`）——全部改成 `library` 或 `kernel`，保持测试语义不变。

**Trait 迁移清单**：23 kernel + 44 library + 2 self = **69 TRAIT.md frontmatter** 完成迁移。

**测试基线对比**：
- Phase 1 开始前：484 pass / 0 fail / 1277 expect（39 files）
- Phase 1 完成后：502 pass / 0 fail / 1326 expect（43 files）
- 新增测试：trait.test.ts 的 namespace/kind 校验、非法 namespace 拒绝、name 含冒号拒绝等。

### 2026-04-21 Phase 2 完成（callMethod 沙箱协议）

**Kernel 仓 commits**：
- `c9754bb` refactor(registry): Phase 2 MethodRegistry 改为 (traitId, method, channel) 三元键
- `646c0fe` refactor(loader): 加载 llm_methods / ui_methods 双命名导出
- `554f01c` refactor(kernel-traits): computable/* index.ts 迁移到 llm_methods 对象参数形式
- `f3bdeea` refactor(kernel-traits): plannable/kanban + talkable/issue-discussion + library_index 迁移 llm_methods
- `d7886b7` docs(kernel-traits): program_api + computable 文档对齐 callMethod 协议

**User 仓 commits**：
- `bca18ac` refactor(library-traits): http/client + git/ops 追加 llm_methods 对象导出

**关键决策**：
- MethodRegistry key 改为 `${traitId}::${methodName}::${channel}` 三元串；`llm` 和 `ui` 通道严格隔离；`buildSandboxMethods` 只返回 `{ callMethod }` 单函数。
- `callMethod(raw, method, args={})` 实现：含冒号精确匹配、不含冒号按 self → kernel → library 优先级查找；找不到时抛描述清楚的错误（含原始参数）。
- loader 过渡策略：优先读 `llm_methods` / `ui_methods` 命名映射；兼容旧 `export const methods = {...}` 走 legacyMethods → 由 registerAll 填到 llm 通道。所有现存 trait 迁移后无 legacy 遗留。
- 所有 trait 方法签名从 `fn(ctx, a, b, c)` 改为 `fn(ctx, { a, b, c })`——对象参数。**为保留既有单测不破坏**，在 file_ops/file_search/shell_exec 中追加位置参数函数导出（包装 *Impl），让 `trait-file-ops.test.ts` 等测试继续可用。
- engine.ts 沙箱注入从"扁平方法名 Object.assign"改为只注入 `{ callMethod }`。trait 切换后 callMethod 实时查 registry 自动生效，`injectTraitMethods` 保留签名但变 no-op。
- trait.test.ts 旧 buildSandboxMethods 测试（扁平/两段式 API）改为 `describe.skip`，注释指向 method-registry.test.ts。

**迁移清单**：
- 7 个 kernel trait 的 index.ts：file_ops、file_search、shell_exec、web_search、library_index、plannable/kanban、talkable/issue-discussion
- 2 个 library trait 的 index.ts：http/client、git/ops
- stones/supervisor/traits 无 index.ts（session-kanban 只有 TRAIT.md，Phase 5 Reporter 重写时统一处理）

**测试基线对比**：
- Phase 2 开始前：502 pass / 0 fail / 1326 expect（43 files）
- Phase 2 完成后：513 pass / 0 fail / 1322 expect / 6 skip（45 files）
- 新增测试：method-registry.test.ts（13 个，callMethod 单函数、双通道隔离、namespace 解析、默认 args、错误消息）、loader-methods.test.ts（4 个，llm/ui 双命名导出识别、legacy 兼容）。
- 跳过：6 个旧 trait.test.ts 里的扁平/两段式 API 测试（已被 method-registry.test.ts 覆盖）。

### 2026-04-21 中断汇报（Phase 2 结束，Phase 3 / 4 未开始）

**现状**：
- Phase 1 + Phase 2 完成（基础设施 + 方法协议），Gate 都通过。
- User Inbox 迭代已 finish（从 doing/ 消失）；MessageSidebar 迭代现在进入 doing/。
- 本 session 上下文占用较大，Phase 3（Views 加载 + DynamicUI 深度改造 + 前端 tsc/服务启动 gate）+ Phase 4（HTTP endpoint + notifyThread 端到端）+ Phase 5（Reporter 升级 + 文档同步）预计消耗仍然很大。

**Phase 3 / 4 / 5 未开始原因**：
- 严格遵守 Plan 的 "Gate 未通过不要跨 Phase + 每 Phase 小步推进" 约束。
- Phase 3 需要前端 ViewRegistry 重构（`kernel/web/src/features/DynamicUI.tsx` + `ooc-url.ts` + `OocLinkPreview.tsx`）+ 各 stones/* 下 ui/ → views/ 迁移；stones 下现在并没有真实 ui/ 目录（`find /Users/zhangzhefu/x/ooc/user/stones -type d -name ui` 返回空），Phase 3 的"迁移现有 ui/"变成空任务，只需设计新机制 + 文档说明。
- Phase 4 server.ts 改动和 MessageSidebar 迭代对 server.ts 的潜在动作需协调。

**建议**：
- **选项 A**：Alan Kay 确认后，由同一 agent 或另起 session 继续 Phase 3/4/5，沿用已提交的基础设施。
- **选项 B**：暂时保留当前迭代在 doing/，让 MessageSidebar 先完成，再进入 Phase 3/4。

---

## 迭代执行总结（Phase 1 + 2）

**Kernel 仓 commits**（按时间顺序）：
1. `75f8016` Phase 1 namespace/traitId 协议切换（源码 + tests）
2. `0ccf1fc` Phase 1 kernel traits TRAIT.md 迁移（23 个）
3. `c9754bb` Phase 2 MethodRegistry 三元键
4. `646c0fe` Phase 2 loader llm_methods/ui_methods 双命名导出
5. `554f01c` Phase 2 computable/* index.ts 迁移
6. `f3bdeea` Phase 2 plannable/kanban + talkable/issue-discussion + library_index 迁移
7. `d7886b7` Phase 2 program_api + computable 文档对齐 callMethod

**User 仓 commits**：
1. `4b4996f` Phase 1 library + self traits TRAIT.md 迁移（46 个）
2. `bca18ac` Phase 2 http/client + git/ops llm_methods 导出

**测试基线**：
| 阶段 | pass | skip | fail | files |
|------|------|------|------|-------|
| 起点 | 484 | 0 | 0 | 39 |
| Phase 1 结束 | 502 | 0 | 0 | 43 |
| Phase 2 结束 | 513 | 6 | 0 | 45 |

全流程 **0 fail**。

**迁移总数**：69 个 TRAIT.md（23 kernel + 44 library + 2 self） + 9 个 index.ts。

---

### 2026-04-21 续作认领（Phase 3/4/5）

**基线确认**：`bun test` 513 pass / 6 skip / 0 fail（45 files）——与前一 agent 交接一致。

**我理解的 Phase 3/4/5 目标**：

- **Phase 3 — Views 加载 + DynamicUI**
  - 后端 loader 已支持 VIEW.md + backend.ts（前一 agent 在 Phase 1/2 顺手带入 `kind: view` + `llm_methods` / `ui_methods`）；本轮补齐：`loadObjectViews`（扫 `stones/{name}/views/*`）+ flow 级 views 扫描 + 与 traits 一起进 registry。
  - 前端 `ooc://ui/` → `ooc://view/` 硬切：`ooc-url.ts` 类型 + 正则 + `OocLinkPreview` 分支 + `OocNavigateCard` 跳转。
  - `DynamicUI.tsx`：动态 import 路径从 `@stones/{name}/ui/index.tsx` / `@flows/{sid}/objects/{name}/ui/pages/*.tsx` → `@stones/{name}/views/{viewName}/frontend.tsx` / `@flows/{sid}/objects/{name}/views/{viewName}/frontend.tsx`。
  - 5 处调用点（`ViewRouter` / `registrations` / `FlowView` / `IssueDetailView` / `TaskDetailView`）全改。
  - `objects/index.ts`（import.meta.glob）扫描规则从 `ui/index.tsx` → `views/*/frontend.tsx`。
  - stones 下无既有 `ui/` 目录（前一 agent 已确认），迁移任务 = 空；只做新机制。
  - 示例 view：我将创建 `stones/supervisor/views/main/{VIEW.md, frontend.tsx, backend.ts}` 作为 smoke test 基础（避免改坏真实工作流时无证据）。
  - Gate：`bun test` 全绿 + 前端 `tsc --noEmit` 0 error + 服务可启动 + 前端 `build` 可通过。

- **Phase 4 — HTTP call_method endpoint + notifyThread**
  - `MethodContext` 扩展 `notifyThread(message, opts?)`：向目标对象的 root thread inbox 写 system 消息，done 线程自动复活（`ThreadsTree.writeInbox` 已有复活路径，仅需拿到实例）。
  - `POST /api/flows/:sid/objects/:name/call_method`：白名单严格（self namespace + kind=view + ui_methods + owner 匹配）。
  - 前端 `callMethod(sid, objectName, traitId, method, args)` api client 新增 + `DynamicUI` 注入闭包。
  - 集成测试：合法调用 / 白名单拦截 / notifyThread 效果。

- **Phase 5 — Reporter 升级 + 文档同步**
  - `docs/meta.md`：Trait 子树（加 namespace / kind / llm_methods/ui_methods / traitId 格式）+ Web UI 子树（`ui/` → `views/`、`ooc://ui/` → `ooc://view/`）。
  - `docs/对象/人机交互/*`、`docs/对象/结构/trait/*`、`docs/哲学文档/discussions.md` 各一条。
  - Reporter trait 重写（新 TRAIT.md + 示例 view）。
  - Bruce 体验追溯。

**并行安全**：User Inbox / MessageSidebar 都已 finish，server.ts 干净。我将放手干，每 Task 独立 commit。

---

### 2026-04-21 Phase 3 完成（Views 加载 + DynamicUI）

**Kernel 仓 commits**：
- `c8428d5` feat(views): Phase 3.1 VIEW.md 加载（kind=view 的 trait）
- `eff4773` refactor(protocol): Phase 3.2+3.3 ooc://ui/ 协议硬切 ooc://view/
- `5c70f88` refactor(web): Phase 3.4 DynamicUI 加载 views/{viewName}/frontend.tsx
- `c8da093` chore(web): 修复 Phase 3 gate 前置的 tsc 基线错误

**User 仓 commits**：
- `5b8fe18` feat(supervisor): Phase 3 示例 view self:main

**关键决策**：
- **loader 合并了 views 进 traits**：`loadAllTraits(objectDir, kernelDir, libraryDir?, flowObjectDir?)` 签名改写——传入 objectDir（其下 traits/ + views/ 分别扫），并接受可选 flowObjectDir 做 flow 级 views 覆盖。所有 views 以 `self:{viewName}` 形式进 trait map。
- **VIEW.md 与 TRAIT.md 共用 loader**：loader.loadTrait 支持 VIEW.md 描述文件；文件名是 VIEW.md 时 kind 自动置为 "view"（无需 frontmatter 显式）。loadObjectViews 还强制 `kind: view`（防止用户 frontmatter 错写）。
- **frontend.tsx 必须存在**：loadObjectViews 校验失败报错（views 必须可渲染）。
- **前端改造 5 处调用点**：Stone 级 UI tab 默认加载 `views/main/frontend.tsx`；Flow 级 FlowView tab 名从 `UI` 改为 `View`，自动选 `main` 或第一个 view；IssueDetailView / TaskDetailView reportPages 路径改为 `views/{viewName}/frontend.tsx`；App.tsx 默认 Session path 从 `ui/pages` 改为 `views`。
- **objects/index.ts import.meta.glob 改扫 `stones/*/views/*/frontend.tsx`**，新增 objectViews / getDefaultView / listObjectViews。
- **旧 ui/ 目录不存在**（stones 下无任何 ui/）→ 真·空迁移，无数据风险。
- **ooc://ui/ 协议硬切 ooc://view/**：server.ts resolver + ooc-url.ts type + OocLinkPreview 分支 + OocNavigateCard 跳转全部迁移。路径形态 `ooc://view/stones/{name}/views/{viewName}/` 或 `ooc://view/flows/{sid}/objects/{name}/views/{viewName}/`，尾部斜杠代表 view 目录默认指向 frontend.tsx。
- **示例 view 在 user 仓**：`stones/supervisor/views/main/{VIEW.md, frontend.tsx, backend.ts}`。frontend 显示 sessionId/objectName/callMethod 注入状态；backend 的 ui_methods.ping 为 Phase 4 HTTP endpoint 的集成测试目标。

**测试基线对比**：
- Phase 3 开始前：513 pass / 6 skip / 0 fail / 45 files
- Phase 3 完成后：518 pass / 6 skip / 0 fail / 46 files（新增 view-loader.test.ts 5 tests）

**Gate 验证**：
- [x] `cd kernel && bun test` 全绿
- [x] `cd kernel/web && bun run tsc --noEmit` 0 error（修掉 4 项 pre-existing 基线噪音）
- [x] `cd kernel/web && bun run build` 通过（dist/ 产出）
- [x] 服务端可启动（curl /api/stones 200 OK）
- [x] Example view 加载：`loadObjectViews(/stones/supervisor)` 返回 `[self:main (view) uiMethods=[ping]]`

**Phase 3 → Phase 4 准备**：
- 方法注册表已支持 ui channel；现有 MethodContext 已有 setData/getData/print/sessionId/filesDir/rootDir/selfDir/stoneName。
- notifyThread 需要拿到 world + ThreadsTree 实例；Phase 4 会在 MethodContext 扩一个字段（或直接通过闭包从 world 注入）。

---

### 2026-04-21 Phase 4 完成（HTTP call_method + notifyThread）

**Kernel 仓 commits**：
- `52422cd` feat(server): Phase 4 HTTP call_method endpoint + notifyThread

**关键实现**：
- `POST /api/flows/:sid/objects/:name/call_method`：
  - 请求体 `{ traitId, method, args }`
  - 响应 `{ success: true, data: { result } }` / `{ success: false, error }`
- **白名单层叠校验**（失败即返回，错误消息明确）：
  1. `traitId` 必须非空字符串 → 400
  2. `method` 必须非空字符串 → 400
  3. `traitId.startsWith("self:")` → 403 "只允许调用 self: namespace 的 traitId"
  4. 对象存在 → 404
  5. loadObjectViews(stone.dir) + flow 级 views + loadTraitsFromDir(self) → Map<traitId, entry>；未命中 → 404
  6. `entry.kind === "view"` → 403 "不是 kind=view"
  7. `view.uiMethods[method]` 存在 → 403 "未在 ui_methods 中声明"（列出可用方法）
  8. 方法执行抛错 → 500（含 error.message）
- **notifyThread 实现**：
  - 定位根线程 `ThreadsTree.load(objFlowDir).rootId`
  - 记录调用前 root 状态；writeInbox 写入（status=unread）；若调用前是 done，writeInbox 内部已有 revival 逻辑（done → running）
  - 复活后 `world.resumeFlow(objectName, sid).catch(...)` 非阻塞触发 scheduler
  - 若无线程树（flow 不存在）→ 打 warn，不抛错（方法本体仍然执行）
- **stone.save()**：方法修改 `stone.data` 后持久化；save 失败记 warn 但不回滚响应（方法语义已生效）
- **前端 `callMethod` 与 DynamicUI 集成**：
  - api/client.ts 新增 `callMethod<T>(sid, obj, traitId, method, args): Promise<T>`（post 返回 `body.result`）
  - DynamicUI 自动注入 callMethod 闭包（componentProps 含 sessionId+objectName 且未显式传 callMethod 时）；对 stone 级 view 不注入（sessionId 为空）

**测试覆盖**（tests/server-call-method.test.ts，7 tests）：
- 合法：self:demo submit → 200 + result + inbox 写入 + root 从 done 复活 running
- 403：kernel: 命名空间
- 403：self: 命名空间但 kind=trait（非 view）
- 403：方法只在 llm_methods 不在 ui_methods
- 404：view 不存在
- 400：缺 traitId
- 500：方法抛错

**测试基线对比**：
- Phase 4 开始前：518 pass / 6 skip / 0 fail / 46 files
- Phase 4 完成后：525 pass / 6 skip / 0 fail / 47 files（+7 新）

**手工 curl smoke**（supervisor + self:main ping）：
```bash
POST /api/sessions/create  → { sessionId: "s_mo8qbx20_in4p5k" }
POST /api/flows/s_mo8qbx20_in4p5k/objects/supervisor/call_method
  { traitId: "self:main", method: "ping", args: { from: "curl-smoke" } }
→ { success: true, data: { result: { ok: true, from: "curl-smoke", at: 1776782341678 } } }

POST /api/flows/.../call_method
  { traitId: "kernel:computable", method: "readFile", args: { path: "x" } }
→ 403 { success: false, error: "只允许调用 self: namespace 的 traitId" }
```

**Gate 验证**：
- [x] `bun test` 全绿（525 pass）
- [x] 服务启动 + 手工 curl 合法/非法调用行为符合预期
- [x] MessageSidebar 迭代的 server.ts 未冲突（我的改动在新 match 块内追加，未动 talk/flows/memory 等既有路由）

---

