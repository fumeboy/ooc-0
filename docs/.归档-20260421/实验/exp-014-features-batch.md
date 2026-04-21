# Exp 014: 8 Features Batch 体验验证

> 日期：2026-03-28
> 验证者：Bruce
> 触发：8 个新 feature 批量完成后的体验验证

## 体验场景

### 场景 A: Object UI 展示优先（Feature 1）

- 目的: 验证有自定义 UI 的对象打开时默认展示 UI Tab
- 操作: 审查 `ObjectDetail.tsx` 和 `FlowView.tsx` 的默认 tab 逻辑
- 预期: 有 `ui/index.tsx` 的对象默认展示 UI Tab，没有的展示 Readme Tab
- 实际: 完全符合预期

**体验评估:**
- 任务完成: ✅ 完成
- 结果质量: ⭐⭐⭐⭐⭐ (5/5) — 实现干净利落

**证据:**

`ObjectDetail.tsx` 第 29 行：
```typescript
const defaultTab: Tab = hasCustomUI(objectName) ? "UI" : "Readme";
```

`FlowView.tsx` 第 70-71 行：
```typescript
/* 有自定义 UI 且无外部指定 tab 时，默认展示 UI Tab */
if (found && !initialTab) setTab("UI");
```

两处逻辑一致：Stone 级别通过 `hasCustomUI()` 同步判断，Flow 级别通过异步检查 `files/ui/` 目录判断。切换对象时也会重置默认 tab（ObjectDetail 第 43 行）。

`ViewRouter.tsx` 第 110-123 行还做了更激进的处理：如果 Stone 有自定义 UI，直接用 `DynamicUI` 渲染整个视图，`ObjectDetail` 作为 fallback。这个设计很好——UI 优先不只是 tab 优先，而是整个视图优先。

---

### 场景 B: shareds -> files 重命名（Feature 2）

- 目的: 验证 `shared/` 到 `files/` 的迁移完整性
- 操作: 检查目录结构、后端代码、前端代码、API 端点
- 预期: 所有 `shared` 引用都改为 `files`
- 实际: 目录迁移完成，API 迁移完成，但代码中有残留

**体验评估:**
- 任务完成: ⚠️ 部分完成
- 结果质量: ⭐⭐⭐⭐ (4/5) — 核心功能正常，但有命名残留

**证据:**

目录层面 ✅：
- `user/stones/*/shared/` — 不存在（已全部迁移）
- `user/stones/*/files/` — bruce, iris, nexus, skill_manager, sophia 都有

API 层面 ✅：
- `server.ts` 第 446-468 行：端点已改为 `/api/stones/:name/files`
- 路径拼接使用 `join(stone.dir, "files")`

后端代码残留 ⚠️：
- `thinkloop.ts` 第 758 行：变量名 `sharedDir: flow.filesDir` — 属性名 `sharedDir` 未改
- `thinkloop.ts` 第 764 行：`self_shared_dir` — 暴露给 LLM 的变量名未改
- `thinkloop.ts` 第 766 行：`task_shared_dir` — 暴露给 LLM 的变量名未改
- `thinkloop.ts` 第 1380-1391 行：`readShared`/`writeShared` 方法仍存在（虽然标记了 deprecated）
- `registry.ts` 第 27 行：`readonly sharedDir: string` — 类型定义未改
- `world.ts` 第 225-226, 349-350 行：文档字符串中仍引用 `readShared`/`writeShared`
- `router.ts` 第 20-22, 105-128 行：`readShared`/`writeShared` 接口和实现仍使用旧名

前端代码残留 ⚠️：
- `api/types.ts` 第 152 行：类型名 `SharedFileInfo` 未改为 `FileInfo`
- `api/client.ts` 第 119 行：函数名 `fetchSharedFiles` 未改为 `fetchFiles`
- `CommandPalette.tsx` 第 26 行：变量名 `sharedFiles` 未改
- `CommandPalette.tsx` 第 376 行：注释 `{/* Shared Files */}` 未改（虽然显示文本已改为 "Files"）

**主观感受:** 目录和 API 端点的迁移做得很干净，用户面对的功能完全正常。但代码内部的命名不一致会给后续维护带来困惑——一个新开发者看到 `sharedDir` 和 `SharedFileInfo` 会以为还有个 `shared/` 目录。`readShared`/`writeShared` 标记了 deprecated 是好的，但 `self_shared_dir` 这种暴露给 LLM 的变量名应该优先改掉，因为 LLM 会按字面意思理解它。

---

### 场景 C: sessions index skill（Feature 3）

- 目的: 验证 sessions 索引 skill 的存在和内容质量
- 操作: 读取 `user/library/skills/sessions-index.md`
- 预期: 完整的 skill 文档，包含数据获取方式和筛选能力
- 实际: 完全符合预期，质量很高

**体验评估:**
- 任务完成: ✅ 完成
- 结果质量: ⭐⭐⭐⭐⭐ (5/5) — 文档结构清晰，示例丰富，实用性强

**证据:**

文件存在于 `user/library/skills/sessions-index.md`，353 行，包含：
- frontmatter 元数据（name + description）
- 核心概念说明（Session/Sub-flow/状态定义）
- 两种数据获取方式（HTTP API + 单 Session 详情）
- 5 种筛选能力（按对象/时间/关键词/状态/组合筛选），每种都有完整代码示例
- 3 个实用场景（活动报告/失败分析/协作记录查找）
- 注意事项（性能、API 地址、时间戳格式等）

**主观感受:** 这是我见过的最好的 skill 文档之一。不是干巴巴的 API 文档，而是从"用户想做什么"出发组织内容。代码示例可以直接复制使用。唯一的小建议：场景 A 的统计代码可以封装成一个 `generateReport()` 函数，让对象更容易调用。

---

### 场景 D: langsmith 借鉴研究报告（Feature 4）

- 目的: 验证研究报告的存在和深度
- 操作: 读取 `user/docs/参考/langsmith-analysis.md`
- 预期: 有深度的分析报告，不是简单的功能罗列
- 实际: 远超预期

**体验评估:**
- 任务完成: ✅ 完成
- 结果质量: ⭐⭐⭐⭐⭐ (5/5) — 深度分析，哲学视角独到

**证据:**

305 行的完整报告，结构：
1. LangSmith 核心能力概览（三大支柱 + 六大功能）
2. 与 OOC 的对比分析（核心模型差异 + OOC 已有什么 + OOC 缺什么）
3. 可借鉴的能力清单（P0-P4，每个都有 LangSmith 启发 + OOC 融入方案 + 哲学适配）
4. 不适合借鉴的能力及原因（5 项，每项都有清晰的哲学论证）
5. 总结

**主观感受:** 这不是一份"抄功能"的报告，而是一份真正的哲学审视。每个可借鉴的能力都回答了三个问题：LangSmith 怎么做的？OOC 应该怎么做？为什么这样做符合 OOC 的哲学？特别喜欢"不适合借鉴"那一节——知道什么不该做，比知道什么该做更重要。

---

### 场景 E: 甘特图 index view（Feature 5）

- 目的: 验证 Session 的 index view 从 ChatPage 替换为甘特图
- 操作: 检查 SessionGantt 组件和 ViewRouter 路由
- 预期: `flows/{sessionId}` 路由指向 SessionGantt
- 实际: 完全符合预期

**体验评估:**
- 任务完成: ✅ 完成
- 结果质量: ⭐⭐⭐⭐⭐ (5/5) — 组件完整，交互设计合理

**证据:**

`ViewRouter.tsx` 第 130-132 行：
```typescript
if (route.type === "flow-session" && route.sessionId) {
  return <SessionGantt sessionId={route.sessionId} />;
}
```

`SessionGantt.tsx`（321 行）实现完整：
- 横轴：时间线，带刻度（`generateTicks` + `formatTime`）
- 纵轴：每行一个参与 Object，带状态指示灯和 action 计数
- 条形：按 action type 着色（thought=橙, program=蓝, inject=红, message_in=绿, message_out=青, pause=灰）
- 交互：hover 显示 tooltip（action type + 时间 + 内容预览），点击跳转到对应 FlowView
- SSE 实时更新
- 空状态处理（"暂无活动记录"）
- 图例展示

**主观感受:** 甘特图是 Session 级别的完美 index view。比 ChatPage 好太多——一眼就能看到哪些对象参与了、各自在什么时间做了什么、整体进度如何。颜色编码直观，hover tooltip 提供了足够的细节而不需要跳转。唯一的小遗憾：条形宽度固定 4px，如果 action 很密集可能会重叠。

---

### 场景 F: library build（Feature 6）

- 目的: 验证 library 对象的目录结构和内容
- 操作: 检查 `user/library/` 目录
- 预期: 完整的对象结构（.stone, readme.md, data.json, skills/, traits/, ui-components/）
- 实际: 结构完整，但 data.json 计数未同步

**体验评估:**
- 任务完成: ⚠️ 部分完成
- 结果质量: ⭐⭐⭐⭐ (4/5) — 结构正确，有一个数据不一致

**证据:**

目录结构 ✅：
```
library/
├── .stone          ← 对象标记文件（0 字节）
├── data.json       ← 对象数据
├── readme.md       ← 对象身份定义
├── skills/         ← 13 个 skill 文件
├── traits/         ← 空目录
└── ui-components/  ← 空目录
```

readme.md ✅：完整的身份定义，包含 whoAmI、functions 列表、职责说明、目录结构、三类资源说明、与 Skill Manager 的关系、设计哲学。

data.json ⚠️：
```json
{"skills_count": 0, "traits_count": 0, "ui_components_count": 0}
```
但 `skills/` 目录下实际有 13 个 .md 文件。`skills_count` 应该是 13（或 12，排除 index.md）。

readme.md 中的小问题 ⚠️：
第 31 行写着 `readShared("library", "skills/xxx.md")`，但 `readShared` 已经被标记为 deprecated。应该更新为新的文件访问方式。

---

### 场景 G: library index kernel trait（Feature 7）

- 目的: 验证 kernel trait 提供的 library 资源查询方法
- 操作: 检查 `kernel/traits/library_index/` 目录
- 预期: readme.md + index.ts，包含 listLibrarySkills, readLibrarySkill, listLibraryTraits, searchLibrary
- 实际: 完全符合预期

**体验评估:**
- 任务完成: ✅ 完成
- 结果质量: ⭐⭐⭐⭐⭐ (5/5) — 实现简洁，API 设计合理

**证据:**

`kernel/traits/library_index/index.ts`（96 行）包含 4 个方法：
1. `listLibrarySkills(ctx)` — 列出所有 skill（过滤 index.md，去掉 .md 后缀）
2. `readLibrarySkill(ctx, name)` — 读取指定 skill 内容（支持带/不带 .md 后缀）
3. `listLibraryTraits(ctx)` — 列出所有公共 trait（只返回目录名）
4. `searchLibrary(ctx, keyword)` — 全文搜索 skills 和 traits（大小写不敏感，返回匹配行）

`kernel/traits/library_index/readme.md`（49 行）：
- `when: always` — 所有对象都自动加载
- 清晰的使用说明和代码示例
- 资源类型表格

**主观感受:** 这个 trait 的设计很克制——只提供查询能力，不提供写入能力。这符合 library 的定位：library 是只读的公共资源库，写入应该通过 skill_manager 或直接操作。`searchLibrary` 返回格式化字符串而非结构化数据，对 LLM 友好。

---

### 场景 H: 并发 focus cursor（Feature 8）

- 目的: 验证同一 Process Tree 内多节点并发执行的实现
- 操作: 审查 ThinkLoop、Scheduler、Flow 的并发相关代码
- 预期: 完整的 fork/join/finish 线程模型
- 实际: 实现完整，设计巧妙

**体验评估:**
- 任务完成: ✅ 完成
- 结果质量: ⭐⭐⭐⭐⭐ (5/5) — 架构设计优雅，最小侵入

**证据:**

**类型定义**（`types/process.ts` 第 71-92 行）：
```typescript
interface ThreadState {
  name: string;        // 线程名称
  focusId: string;     // 当前聚焦的节点 ID
  status: "running" | "yielded" | "finished";
  signals: Signal[];   // 待处理的 signal 队列
}

interface Process {
  root: ProcessNode;
  focusId: string;     // @deprecated 由 threads 替代
  threads?: Record<string, ThreadState>;
  todo?: TodoItem[];
}
```

**ThinkLoop 的线程切换**（`thinkloop.ts` 第 134-158 行）：
- `syncThreadFocusIn()`: 迭代开始前，将 `process.focusId` 切换到线程的 `focusId`
- `syncThreadFocusOut()`: 迭代结束后，将变化同步回线程状态
- 设计巧妙：所有读取 `process.focusId` 的现有代码无需修改

`syncThreadFocusOut` 在三处调用：
- 第 555 行：每轮迭代结束后的正常保存
- 第 570 行：达到最大轮次时
- 第 574 行：函数返回前

**Scheduler 的并发调度**（`scheduler.ts` 第 131-162 行）：
- `_getActiveThreads(flow)`: 获取所有 status="running" 的线程
- 多线程时：`Promise.all` 并发发起多个 `runThinkLoop`，每个传入不同的 `threadId`
- 单线程时：走原有的单次 `runThinkLoop` 路径
- 结果合并：遍历所有线程的 `persistedData`，合并到 stone.data

**LLM 可用的线程 API**（`thinkloop.ts` 第 1262-1323 行）：
- `fork_threads(nodeIds)`: 为多个节点各创建一个线程，线程名 `t_{nodeId}`
- `join_threads(threadNames)`: 检查所有指定线程是否都 finished
- `finish_thread()`: 标记当前线程为 finished

**Flow.recordActionAt**（`flow.ts` 第 264-276 行）：
- 支持向指定节点记录 action（而非只能记录到当前 focusId）
- 并发线程各自记录到自己的 focus 节点

**主观感受:** 这是整批 feature 中设计最优雅的一个。核心洞察是：不改变 ThinkLoop 的内部逻辑，只在入口和出口做 focusId 的切换。这意味着所有现有的 Context 构建、trait 激活、action 记录逻辑都自动适配并发。`Promise.all` 的并发模式简单直接。

有一个潜在风险值得注意：并发线程共享同一个 `flow` 对象的 `process` 数据。如果两个线程同时修改 process tree（比如都调用 `create_plan_node`），可能会有竞态条件。目前 `maxIterations: 1` 限制了每个线程每轮只执行一次，降低了风险，但如果未来放开这个限制需要考虑加锁。

---

## 发现的问题

### Issue 1 (MEDIUM) — shareds -> files 代码命名残留

- 类型: 代码一致性
- 位置: 多处（见场景 B 证据）
- 描述: 目录和 API 端点已迁移为 `files`，但代码内部的变量名、类型名、接口名仍大量使用 `shared` 命名
- 影响: 不影响功能，但影响代码可读性和维护性。特别是 `self_shared_dir`/`task_shared_dir` 这种暴露给 LLM 的变量名，LLM 会按字面意思理解
- 触发方式: 阅读代码即可发现
- 关键位置:
  - `kernel/src/trait/registry.ts:27` — `sharedDir` 类型定义
  - `kernel/src/flow/thinkloop.ts:764-766` — `self_shared_dir`/`task_shared_dir` 暴露给 LLM
  - `kernel/web/src/api/types.ts:152` — `SharedFileInfo` 类型名
  - `kernel/web/src/api/client.ts:119` — `fetchSharedFiles` 函数名
- 状态: ❌ 待修复

### Issue 2 (LOW) — library data.json 计数未同步

- 类型: 数据不一致
- 位置: `user/library/data.json`
- 描述: `skills_count: 0` 但实际有 13 个 skill 文件
- 影响: 如果有代码或 LLM 读取 data.json 来判断 library 内容数量，会得到错误信息
- 触发方式: `cat user/library/data.json`
- 证据: `{"skills_count": 0, "traits_count": 0, "ui_components_count": 0}`
- 状态: ❌ 待修复

### Issue 3 (LOW) — library readme.md 引用已废弃的 readShared

- 类型: 文档不一致
- 位置: `user/library/readme.md:31`
- 描述: 文档中写着 `readShared("library", "skills/xxx.md")`，但 readShared 已标记 deprecated
- 影响: 对象按文档指引使用 readShared 会收到 deprecated 警告
- 触发方式: 阅读 readme.md
- 状态: ❌ 待修复

### Issue 4 (LOW) — 甘特图 action 条形可能重叠

- 类型: 体验不佳
- 位置: `kernel/web/src/features/SessionGantt.tsx:275`
- 描述: 条形宽度固定 4px，当 action 时间戳非常接近时条形会完全重叠
- 影响: 密集 action 区域可能看不清具体有多少个 action
- 触发方式: 一个对象在短时间内产生大量 action
- 状态: ⚠️ 低优先级

### Issue 5 (LOW) — 并发线程潜在竞态条件

- 类型: 潜在风险
- 位置: `kernel/src/world/scheduler.ts:137-152`
- 描述: 并发线程共享同一个 `flow` 对象的 `process` 数据，`Promise.all` 并发执行时如果两个线程都修改 process tree 可能产生竞态
- 影响: 目前 `maxIterations: 1` 限制了风险，但未来放开时需要注意
- 触发方式: 两个并发线程同时调用 `create_plan_node` 或 `fork_threads`
- 状态: ⚠️ 低优先级（当前有 maxIterations:1 保护）

## 总体评估

这批 8 个 feature 的整体质量很高。从用户视角看，最有感知的改进是甘特图 index view（终于能一眼看到 Session 全貌了）和 library 体系（对象有了公共资源库）。从架构视角看，并发 focus cursor 的设计最令人印象深刻——用最小的侵入实现了真并发，体现了"最小改动"的决策原则。

主要的遗留问题是 `shared -> files` 的命名迁移不彻底，功能层面没问题但代码层面不一致。建议在下一个 commit 中做一次彻底的命名清理。library 的 data.json 计数不同步是个小问题，但体现了"数据和现实脱节"的风险——如果 library 的 skill 数量变化了，data.json 不会自动更新。
