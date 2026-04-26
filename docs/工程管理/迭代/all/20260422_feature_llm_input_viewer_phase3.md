# LLMInputViewer Phase 3 — 对比视图 + active-forms 结构化

> ⚠️ **本文档中描述的 partial submit / submit(partial=true) 机制已于 2026-04-26 退役**，
> 由 `refine` tool 取代。详见 `docs/superpowers/specs/2026-04-26-refine-tool-and-knowledge-activator.md`。

> 类型：feature
> 创建日期：2026-04-22
> 状态：finish
> 完成日期：2026-04-23
> 负责人：Opus 4.7 (1M)
> 优先级：P2

## 背景

`llm_input_structured_view.md` Phase 1+2 完成。Phase 3 对比视图 + active-forms 纳入 `<user>` 子节点留作 backlog。

## 目标

1. **对比视图**：选择两个 `llm.input.txt`（同线程 loop_N / loop_N+1 或不同线程）做结构 diff，高亮变化节
2. **active-forms 纳入 `<user>` 子节点**：engine.ts 的外部追加逻辑移入 contextToMessages，避免 active-forms 作为 `<user>` 兄弟节点存在
3. **Hover 溯源**：鼠标悬停 knowledge window 显示"它为什么被激活"（scope chain 推导 / command binding / pinned）

## 方案

### Phase 1 — active-forms 内联

- engine.ts 两处外部追加（line 877/2064）改为 buildThreadContext 入参 → contextToMessages 内部生成 `<active-forms>` 作为 `<user>` 子节点
- 更新 XML 结构测试

### Phase 2 — 对比视图

- `LLMInputViewer` 加 "Compare" 按钮
- 选择第二个文件（LRU / 同线程历史）→ 左右双栏 diff
- Node 级 diff（非行级）

### Phase 3 — Hover 溯源

- 每个 knowledge window 注入 "source" 属性（command_binding / explicit_open / always）
- UI hover 解释

## 影响范围

- `kernel/src/thread/engine.ts`（active-forms 内联 + XML 属性 source）
- `kernel/src/thread/context-builder.ts`（内置 window source 归类）
- `kernel/src/thread/open-files.ts`（trait 来源判定）
- `kernel/src/types/context.ts`（ContextWindowSource + ContextWindow.source）
- `kernel/web/src/features/LLMInputViewer.tsx`（Compare 按钮 + 双栏渲染 + source tooltip）
- `kernel/web/src/features/llm-input-diff.ts`（新：node-level path-based diff 核心）

## 验证标准

- 对比视图可用 ✅
- active-forms 位于 `<user>` 子节点 ✅
- source 属性 XML 输出 + 前端 hover 解释 ✅

## 执行记录

### 2026-04-23 — Phase 1 active-forms 内联（完成）

- commit: `1af0cc2`（kernel main）
- 改动：
  - `kernel/src/thread/engine.ts`：
    - 新增 `ActiveFormView` 接口 + `contextToMessages` 第三参数
    - `contextToMessages` 由 `function` 改 `export function`（便于 TDD 单测）
    - 在 `<user>` 子节点树里插入 `<active-forms>`（含 `<form id/command/trait>`）
    - 删除两处外部 append 逻辑（旧 line 1145-1154 + 2572-2581）
  - `kernel/tests/thread-engine-xml-structure.test.ts`：新增 2 个直接调用测试（有/无 active form）
- 测试：该文件 4 pass / 0 fail

### 2026-04-23 — Phase 3 Hover 溯源（完成）

- commit: `1518a86`（kernel main）
- 改动：
  - `kernel/src/types/context.ts`：新增 `ContextWindowSource` 枚举（11 值：always_on / thread_pinned / stone_default / command_binding / scope_chain / skill_index / memory / coverage / build_feedback / file_window / extra）
  - `kernel/src/types/index.ts`：re-export `ContextWindowSource`
  - `kernel/src/thread/open-files.ts`：
    - 新增 `determineSource` 函数，按 always_on > thread_pinned > stone_default > command_binding > scope_chain 优先级判定
    - 每个 pinned/transient window 带 source 字段
  - `kernel/src/thread/context-builder.ts`：memory/coverage/build_feedback/skill/file_window/extraWindows 各自归类 source
  - `kernel/src/thread/engine.ts`：
    - `<instruction>` / `<window>` XML 序列化加 `source="..."` 属性
    - 更新 knowledge `<knowledge>` comment 说明 source 语义
  - `kernel/web/src/features/LLMInputViewer.tsx`：
    - `SOURCE_EXPLANATION` 中文解释表
    - NodeBadges 新增 source 紫色徽标 + hover title
    - DetailPanel 属性表 source 行鼠标悬停 + 独立"来源解释"段落
    - lifespan=pinned/transient 徽标补全（📌 / ⏳）
  - `kernel/tests/open-files.test.ts`：新增 5 个单测覆盖 source 优先级
- 测试：open-files 14 pass / 0 fail

### 2026-04-23 — Phase 2 对比视图（完成）

- commit: `b4e354f`（kernel main）
- 新增：
  - `kernel/web/src/features/llm-input-diff.ts`（~190 行）
    - `nodeKey` 按 `attrs.name > attrs.id > attrs.command > tag+idx` 生成
    - `computeNodeDiff(leftRoots, rightRoots)` 返回 `{ left: Map<id, status>, right: Map<id, status> }`
    - 四状态：unchanged / added / removed / changed；父节点按子树级联
  - `kernel/tests/llm-input-diff.test.ts`：6 unit test 覆盖相同/增/删/内容变/属性变/key 优先级
- 改动：
  - `kernel/web/src/features/LLMInputViewer.tsx`：
    - 抽 `ViewerPane` 组件（左右共用）
    - 顶栏加 "Compare" 按钮 → 切换后列 `fetchSessionTree(sessionId)` 中的 `.input.txt` 文件（排除自身）
    - `<select>` 下拉选第二文件 → 异步加载 raw → 解析 → `computeNodeDiff` 算 diffMap
    - 双栏布局：左右各一个 ViewerPane，同步传 diffMap 到对应侧
    - TreeNode 按 diff status 加背景色（绿/红/琥珀）+ 小徽标（+ / − / ~）+ title="diff: added/removed/changed"
    - 对比模式下自动展开所有差异节点的祖先路径
    - 顶栏图例条（颜色说明）
    - `extractSessionId(path)`：从 `flows/<sid>/...` 抽 sessionId
    - `collectInputTxtFiles(FileTreeNode)`：递归筛选文件树
- 测试：llm-input-diff 6 pass
- 构建：`bun run build` 成功

### 最终测试基线

- 新增测试：2 (xml-structure) + 5 (open-files) + 6 (llm-input-diff) = **13 new tests pass**
- 全量：**1033 pass / 10 skip / 6 fail**（fail 全为 pre-existing http_client 端口 19876 问题，非本迭代引入）

### diff 算法选择

**Node-level path-based diff，不做行级 diff**。理由：
- XML 本身已是结构化数据，节点级对齐给出的是"语义 diff"（哪个 trait 被引入/移除、哪个 inbox 新增一条）
- 行级 diff 遇到 Markdown 表格/代码块内容会产生无意义的噪音
- 算法朴素 O(N)：每层用 Map 按 key 对齐一次，不需要 LCS/Myers 级别复杂度
- 不引入 diff 库（如 diff / jsdiff），避免增加 bundle

### Source 枚举最终值

11 个值（见 types/context.ts::ContextWindowSource）：

| source | 语义 |
|-------|------|
| always_on | Trait when="always" 声明的常驻 |
| thread_pinned | 当前线程显式 open(type=trait) pin |
| stone_default | stone.data._traits_ref 声明 |
| command_binding | open(type=command) / partial submit 动态激活 |
| scope_chain | 祖先线程 traits 静态声明 |
| skill_index | available-skills 索引窗口 |
| memory | stone/memory/index.md 或 legacy memory.md |
| coverage | bun test --coverage 结果 |
| build_feedback | world.hooks 失败反馈 |
| file_window | open(type=file) 文件内容 |
| extra | engine 调用方 extraWindows 注入 |

优先级（同时命中多项时取最精确）：always_on > thread_pinned > stone_default > command_binding > scope_chain。

### 挂起问题 / backlog

- Compare 选择控件用 `<select>`，未做文件树 picker（迭代文档明确"朴素即可"）
- 未做跨 session compare（只列当前 session 的文件）——后续如需再扩
- 未在 Playwright 端跑 E2E（本环境 Playwright 受限）——建议 Bruce 或用户手动在前端验证
