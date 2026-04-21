# Thread 上下文可视化

> 类型：feature
> 创建日期：2026-04-21
> 完成日期：2026-04-21
> 状态：finish
> 负责人：Kernel+Iris（由 Alan Kay 代执行，单会话完成）

## 背景 / 问题描述

每一次 LLM 调用的 Context 都是由 `context-builder.ts` 基于当前线程在线程树中的位置构造出来的：

- **当前线程**：完整 actions 历史（process 区段）
- **祖先链**：title + summary（逐级向上）
- **子线程**：title + summary（children_summary 区段）
- **兄弟/堂兄弟**：title + summary（siblings 区段）
- **其他节点**：不可见

但外部观察者（用户、调试时的自己）**很难直觉地看到"当前线程到底看得到什么"**——要读懂必须同时心算线程树结构 + `context-builder.ts` 的规则。

我们需要一个可视化视图：**从 root 节点渲染整棵 threads tree，按当前 focus 线程的 Context 可见性给每个节点着色**。

这不仅是调试工具，也是 OOC 哲学的具象化——每个线程"看得到"的东西由结构决定，不可见的东西从不出现在它的世界里（G5 / G13）。

## 目标

1. **选中视角**：可以选中某一个 thread 作为"观察主体"（下称 focus）。
2. **全树渲染**：从 root 渲染整棵 threads tree（不只是 focus 的父链 / 子链）。
3. **可见性着色**：每个节点按它在 focus 线程 Context 中的呈现形态着色：
   - **颜色 D（detailed）**：focus 线程本身——完整 actions 历史全部可见。
   - **颜色 S（summary）**：以 title + summary 形式出现在 Context 中（祖先 / 子线程 / 兄弟）。
   - **颜色 T（title-only）**：仅 title 出现（summary 为空的场景）。*——可选分类，看 context-builder 是否区分。*
   - **颜色 N（not visible）**：不在 focus 线程的 Context 中（uncle/aunt 的子树、未关联分支等）。
4. **图例 + 说明**：视图里清楚说明每种颜色含义，鼠标 hover 节点显示具体原因（如 "祖先（第 2 层）" / "focus 的 child" / "不可见：uncle 的子树"）。
5. **切换 focus**：点击任意节点切换 focus，整树颜色实时重算。

## 方案

### 后端

`context-builder.ts` 当前只为一个线程返回最终字符串。我们需要让它**同时暴露"每个节点相对于 focus 的可见性分类"**，或者在前端独立实现一套同规则的分类器。

**选项 A（推荐）**：后端新增一个纯函数 `classifyContextVisibility(tree, focusThreadId): Record<threadId, "detailed"|"summary"|"title_only"|"hidden">`。
- 逻辑与 `context-builder.ts` 中"收集祖先 / 子节点 / 兄弟"的规则复用同一实现，避免前后端两套规则 drift。
- 通过 HTTP 接口暴露：`GET /api/flows/:sessionId/objects/:name/context-visibility?focus=:threadId` 返回分类 map。
- 如果后续 Trait Namespace 迭代落地（`docs/superpowers/specs/2026-04-21-trait-namespace-views-and-http-methods-design.md`），这个接口应该注册为 `thread` trait 的 view-type method，而不是硬编码 HTTP。**本迭代先不依赖 view 机制，用简单 HTTP endpoint 实现；Trait Namespace 落地后再迁移**。

**选项 B**：前端自己走 threads.json + thread.json 算分类。
- 缺点：规则 drift 风险。若后端 context-builder 改了规则（如引入 scope chain 深度限制、summary 折叠策略），前端要同步改。
- 优点：不增加 HTTP endpoint。
- **本迭代不采用 B**，除非调研发现后端规则访问不到某些所需数据。

### 前端

集成进现有 `ThreadsTreeView`（`kernel/web/src/features/ThreadsTreeView.tsx`）或为其新增一个 "Context 可视化" 模式。

**UI 设计**：
- 现有 threads tree 已经有节点的 status 颜色圆点（running/waiting/done/failed）。本次**不替换 status 色**——Context 可见性用独立的**背景色 / 边框色 / 侧条**表示。
- **颜色方案建议**：
  - D = 实心高亮背景（如淡紫 / 当前选中态）
  - S = 中等透明度的边框色（如淡蓝）
  - T = 细边框 + 虚线（如淡灰蓝）
  - N = 无边框 / 低饱和灰阶
- **顶部图例**：四个色块 + 说明 + focus 节点名。
- **hover tooltip**：解释该节点为什么是这个类别（引用规则 "祖先链第 N 层" / "uncle 的子树" 等）。
- **点击切换 focus**：单击节点 → focus 切到该节点 → 整树重算。
- **URL query 参数**：`?focus=<threadId>` 保持可分享链接。

**无 focus 时**：默认 focus = tree 中状态为 `running` 的叶节点；如果没有 running，用 root。

### 命名 / 位置

- 后端：`kernel/src/thread/visibility.ts`（新文件）+ `server.ts` 新增路由。
- 前端：`kernel/web/src/features/ThreadContextVisualizer.tsx`（新组件）或扩展 ThreadsTreeView 加一个 "Ctx View" 开关。

## 影响范围

- **后端**：
  - `kernel/src/thread/visibility.ts`（新）
  - `kernel/src/thread/context-builder.ts`（提取规则或导出辅助函数，减少重复）
  - `kernel/src/server/server.ts`（新 HTTP 路由）
  - 新增 `kernel/tests/thread-visibility.test.ts` 单元测试
- **前端**：
  - `kernel/web/src/features/ThreadContextVisualizer.tsx`（新）或 `ThreadsTreeView.tsx`（扩展）
  - `kernel/web/src/api/client.ts` 增加 API 调用
  - 若有样式文件，增加四个可见性配色
- **文档**：
  - `docs/meta.md` 子树 2（认知构建 Context 子树）+ 子树 6（Web UI）新增说明
  - 建议在 `docs/哲学文档/discussions.md` 加一条：「Context 可见性可视化 — G5 / G13 的具象化」
- **基因/涌现**：
  - 对 G5（注意力与遗忘）、G13（线程树）的 UI 化表达——外部观察者第一次能"直接看到"线程的视野边界。

## 验证标准

1. **后端单元测试**：
   - 构造一棵包含 root + 祖先链 + 子 + uncle + 堂兄弟的测试树
   - `classifyContextVisibility(tree, focusId)` 返回每节点的类别正确：
     - focus 自身 = "detailed"
     - 祖先（有 summary）= "summary"
     - 祖先（无 summary）= "title_only"
     - 子线程（直接子）= "summary"
     - uncle 的子树 = "hidden"
     - 兄弟 = "summary"
   - 不依赖 LLM / 外部服务，纯结构测试，`bun test` 快速绿。
2. **HTTP endpoint**：curl 测试返回结构正确。
3. **前端体验**：
   - 启动服务，触发一次带子线程的对话（参考之前 Bruce 的"写绝句"场景）
   - 打开新视图，能看到整棵树
   - 默认 focus 在 running 叶节点，颜色正确
   - 点击其他节点切换 focus，颜色实时更新
   - hover tooltip 能看到分类原因
4. **规则一致性**：至少做一次人工对照——抓取某一个线程的真实 Context 文本，与可视化标注的节点对一对，确认"Context 里提到的节点集合" = "可视化里 detailed + summary + title_only 的节点集合"。

## 依赖 / 协调

- **不阻塞**：可以与"旧 Flow 架构退役"迭代并行推进（触及的代码完全不重叠）。
- **利于之后的 Trait Namespace 迭代**：如果该迭代先落地，这里的 HTTP endpoint 应该重构为 view-type method。

## 执行记录

### 2026-04-21 实现完成

**提交（kernel submodule）**：
- `6b695d5` feat(thread): classifyContextVisibility 分类器 + 单元测试（20 pass）
- `20bbcc4` feat(server): context-visibility API endpoint
- `2be567a` feat(web): thread context visibility view

**测试基线对比**：
- 改动前：464 pass / 0 fail
- 改动后：484 pass / 0 fail（+20）

**分类器规则（对齐 context-builder.ts 后确认的边界）**：
- `detailed` = focus 自身
- `summary`   = 祖先链 ∪ focus.childrenIds ∪ 父的其他子，并且 `node.summary` 非空
- `title_only` = 同上范围但 `summary` 为空
- `hidden`    = 其他节点

关键边界：
- **uncle 不可见**。siblingSummary 只看 focus 的父节点的直接子（不看祖父的其他子）。
- **孙节点不可见**。childrenSummary 只深入一层。
- **堂兄弟不可见**（作为 uncle 的子，天然被排除）。

**前端实现方式**：扩展 `ThreadsTreeView.tsx`（未新建组件）
- 新增 "Ctx View" 切换按钮 + 4 色图例 + focus 名
- 整棵树渲染，开启 Ctx View 后每个节点按可见性着色（背景/边框/侧条/透明度）
- Hover 节点显示分类原因（"focus 自身" / "祖先链" / "focus 的直接子" / "同级兄弟" / "hidden"）
- 单击节点切换 focus，整树重算（走 API，不是前端本地算）
- 图例的四色与 status 圆点独立，不覆盖

**体验验证**：
- 触发 bruce 同时做两件事（写绝句 + 总结春天），树有 3 个节点（root + 2 子）
- 调 `GET /api/flows/s_mo8l9bvf_fca3kt/objects/bruce/context-visibility` 返回正确分类：
  - 默认 focus 选中 running 叶 `th_mo8laec3_crv6d9`（"一句话总结春天"）
  - `?focus=<root>` → 自身 detailed，两子 title_only
  - `?focus=<leaf>` → 自身 detailed，父 title_only，兄弟 title_only
- **一致性校验（铁律）**：对 3 个 focus 分别调用 context-builder 的三个 render 函数，
  抓取渲染文本中出现的节点 title，与分类器"非 hidden"集合对比，三次均一致。

**未预期发现**：无。

**未完成**：无。

**冲突情况**：与"旧 Flow 架构退役"迭代无冲突。server.ts 的新路由插在 `/* 404 */` 之前，
未触及另一个 agent 会改的 debug 接口区域。未触及 `kernel/src/flow/*`、`world.ts`、
`scheduler.ts`、`reflect_flow/*`。
