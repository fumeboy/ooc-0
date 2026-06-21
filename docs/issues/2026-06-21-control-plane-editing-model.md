---
title: OOC 控制面编辑模型 —— 通用 stone-file-edit 原语 + class visible 改 data
status: draft
date: 2026-06-21
---

# OOC 控制面编辑模型重设计

> 承接 issue `2026-06-21-self-md-out-of-core-and-agency-relocation.md` 的 §六后续架构（用户 2026-06-21 articulate）。前一 issue 把 self.md 实现归位时，明确「PUT /self 等端点存废 / 编辑下沉 visible」是独立另案——即本 issue。

## 背景 / 动机

OOC 里「编辑一个 Object」当前是一组**按文件类型硬编码的 HTTP 端点**（self/readable/server-source 各一个 PUT）。两个问题：

1. **源文件编辑是 file-type-specific 端点，而非通用原语**：putSelf/putReadable/putServerSource 三个端点逻辑同构（都经 `runVersioned`→commit），只是写的文件名不同——这是「按类型开端点」的熵增，应塌成一个 **file-agnostic 的 stone 分支文件编辑原语**（"像 GitHub 网页编辑文件并 commit、不关心编辑的是什么文件"）。
2. **没有「class 自实现的 UI 编辑」通路**：OOC 的理想是 Object 持有并演化自身 UI（visible 维度），人类经前端编辑界面 → `callMethod` → `for_ui_access` method 改该 Object 的 **运行时 data**。但当前 HTTP `callMethod` 路径**无法改 data 并持久化**（零先例），class 无法真正自实现「编辑自己」。

这两条是**正交**的：① 编辑 git 版本管理的**源文件**（A1）；② 编辑运行时 **data**（A2）。二者在 **self.md** 处交汇（self.md 既是源文件、又是 agent `data.self` 的序列化）——这是本 issue 的关键待裁决。

## 现状（锚真实代码，main 分支）

**三个版本化源码编辑端点**（逻辑同构，均经 `runVersioned`）：

| 端点 | 路由 | 写文件 | service |
|---|---|---|---|
| putSelf | `PUT /api/stones/:id/self` | `self.md` | `service.ts:246` |
| putReadable | `PUT /api/stones/:id/readable` | `readable.md` | `service.ts:258` |
| putServerSource | `PUT /api/stones/:id/server-source` | `executable/index.ts` | `service.ts:270` |

- `runVersioned`→`httpDirectMainWrite`（`persistable/stone-versioning.ts:493`）：序列化 git 队列 → 写 `stones/main/` 工作树 → `gitCommitAll`（**直 commit main**）→ sync 到 packages。注意：HTTP 编辑是**直 commit main**，非 reflectable 的 feat-branch PR 路径。
- **knowledge 编辑已迁出**：走 `PUT /api/pools/:id/knowledge/files`（pools 不进 git、**非版本化**），旧 `/stones/:id/knowledge/files` 标 deprecated。故"四端点"实为**三个版本化源文件端点 + knowledge（pools/非版本化，另一类）**。

**前端编辑 UI 现状**：self/readable/server-source **三者前端均无编辑界面**（仅 `StoneFallback.tsx` 只读展示 self/readable）；唯一有编辑 UI 的是 knowledge（经 pools 端点 + FileViewer）。

**callMethod 改 data 的能力缺口**（`service.ts:364` callMethod）：
```ts
const ctx = { object: { id, class: objectId }, args };
const self = { dir: dir(objectId) };
return normalizeMethodResult(await entry.exec(ctx, self, args));
```
对比 thinkloop 内 object method（`runtime/window-manager.ts:246` + `window-persistence.ts`）：HTTP callMethod **缺 `reportDataEdit` 注入、缺 method 返回后的 persist 触发、缺 `ctx.thread`/`ctx.runtime`**。所有现有 `for_ui_access` method（thread.say / todo.mark_done / form.refine / process.exec）都在 thinkloop 内跑、都能 `reportDataEdit`——**HTTP 侧改业务 data 并持久化是零先例**。

**self.md 二象性**：agent `persistable.save`（`agent/persistable/index.ts`）= `writeSelf(resolveStoneIdentityRef(...), data.self)`。`resolveStoneIdentityRef`（`stone-worktree.ts:169`）：business session 落 session worktree、**main 上直写文件不经 runVersioned、不 commit**。即 `data.self` 落盘**无版本化承诺**，与 putSelf 的 runVersioned commit 路径**完全分离**。

## 改动提案

### A1 —— 通用 stone-branch-file-edit 原语

把 putSelf/putReadable/putServerSource 三个端点塌成一个 file-agnostic 原语：`PUT /api/stones/:id/file?path=<相对路径>`（或等价），body=content，经 `runVersioned` 写 `stones/main/objects/<id>/<path>` 并 commit。path 经白名单/穿越防护校验（限 stone 目录内）。typed 端点退役（或保留为薄 alias 一段过渡）。

### A2 —— callMethod 支持 for_ui_access method 改 data 并持久化

让 HTTP `callMethod` 路径具备 thinkloop 同等的 data-edit 持久化：load object 当前 data 注入 `self`、注入 `reportDataEdit`、method 返回后触发 `persistable.save`（复用 `saveObjectData` / `object-data.ts` 既有机制）。这样 class 的 visible 编辑界面 = 前端 → callMethod → for_ui_access method 改 data → 持久化，闭环。

## 受影响设计元素

对照 `knowledge/index.md` 的 `##` 元素清单：

- `## app`（B）—— 控制面端点：三 typed 端点塌为通用 file-edit 原语。
- `## visible`（B）—— class 自实现编辑界面经 callMethod 改 data 的通路（A2 的归宿）。
- `## executable`（B）—— `for_ui_access` object method 改 data：HTTP 侧 data-edit + 持久化触发。
- `## persistable`（B）—— 版本化写（runVersioned 的通用化）；callMethod 的 persist 触发；self.md `data.self` 落盘是否版本化。
- `## readable × visible`（D）—— `for_ui_access` 人机分流：HTTP callMethod 改 data 的契约。
- `## reflectable × persistable`（D）—— HTTP 直 commit main vs reflectable feat-branch PR 的边界（A1 的版本化写与沉淀通道的关系）。
- `## OOC Class/Object Model`（A）—— 核心 7（object method 标 for_ui_access 才可被 visible 请求）、核心 8（持久化可自定义）。
- `## agent`（E）—— self.md 二象性（源文件 vs data.self）。
- `## knowledge_base / knowledge`（E）—— knowledge 编辑已在 pools/非版本化，是否纳入通用原语（还是 pools 编辑自成一类）。

## 风险与权衡

- **self.md 双写路径**：A1（版本化文件编辑）与 A2（data→persistable.save 直写）对 self.md 各自为政——若不统一，同一份 self.md 有两条编辑路径、版本化语义不一致。
- **HTTP 直 commit main**：现有 putX 直 commit main（非 feat-branch PR），与 reflectable「stone 变更走 feat-branch PR」的沉淀纪律存在张力——通用化时要明确人类控制面编辑是否豁免该纪律。
- **callMethod 注入 thread/runtime**：A2 让 HTTP callMethod 具备改 data 能力，但它无 thread context——某些 method 依赖 ctx.thread/runtime，需明确 HTTP 侧能调哪些 for_ui_access method（纯 data-edit vs 需运行时上下文）。
- **path 白名单**：通用 file-edit 原语必须防目录穿越 + 限定可编辑文件集（不可写 package.json/.git 等）。

## 待裁决点

1. **self.md 二象性归哪条路径**：self.md 编辑走 A1（版本化文件）还是 A2（data.self → persistable.save）？若两者都要存在，如何让 persistable.save 也获得版本化 commit（让 A2 的 data 落盘复用 runVersioned），还是接受「源文件编辑版本化 / data 落盘不版本化」二分？
2. **A2 的持久化是否需版本化**：class 改 data（如 todo.status、form.tip）落 state.json 本就不进 git——A2 的 data-edit 是否一律非版本化（区别于 A1 的源文件）？agent 的 data.self 是特例（落 self.md/git）吗？
3. **A1 是否退役 typed 端点**：三 typed 端点直接删（改通用原语）还是保留薄 alias 过渡？前端无编辑 UI，删除阻力小。
4. **HTTP 编辑 vs feat-branch PR**：人类控制面经通用 file-edit 原语直 commit main 是否合理（豁免 reflectable feat-branch 纪律），还是也应走 PR？
5. **knowledge**：已在 pools/非版本化——纳入通用原语（但 pools 不进 git，与"版本化文件编辑"矛盾），还是 knowledge 编辑自成一类不并入？

## review 记录

（fan-out 后由 Supervisor 汇总各 reviewer + 完整性批评官意见）

## 裁决

（最终方案 + 落地与一致性回流清单）
