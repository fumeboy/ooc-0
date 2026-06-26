---
title: 清除 compress 整套机制（暂退役整个上下文压缩设计、未来再补，issue L）
status: verified
date: 2026-06-26
follows: 2026-06-26-dispatch-view-surface-gate.md
---

# 清除 compress 整套机制

## 背景 / 动机

用户裁决：「compress 整体从项目和文档中清除，未来再补」。

issue M 落地时 thread reviewer + survey 一致指出：
- thread/readable/index.ts:63 `compress` window method 体内是 `return { ...before_win }` 空 noop（TODO 占位）。
- `resize` window method 写 `win.autoCompressLevel` 字段——**0 消费者**（thread render / thinkable 都不读），死字段。
- `summarize.ts` 入口空实现（`// TODO: 创建 sub thread 请求 LLM 进行总结`）。
- `core/utils/summarized-ranges.ts` 整套 SummarizedRange + projectSummarizedRanges helper——为 compress v2 折叠态服务，**当前无 caller**。
- thinkable/knowledge/compress.md 设计文档**深度详尽**但实施零兑现，自陈"summarizer fork"机制——基础设施未建。

整套机制属**设计承诺远超实施兑现**——文档+空 stub 占位、实际未运行任何压缩逻辑。退役比维护占位更干净；未来真要做 context 压缩时按当时需求重新设计、不被现有占位束缚。

## 影响面（survey 已 grep）

**源码 11 文件**：
- `packages/@ooc/builtins/agent/children/thread/readable/index.ts`：删 `compress` + `resize` 两 WindowMethod export + 3 处 window decl `window_methods` 数组移除引用。
- `packages/@ooc/builtins/agent/children/thread/readable/summarize.ts`：整文件删（空 stub）。
- `packages/@ooc/builtins/agent/children/thread/types.ts`：
  - 删 ThreadWin `summarizedRanges` 字段 + `autoCompressLevel` 字段。
  - 删 ProcessEvent `kind: "context_compressed"` variant。
  - import 删 `SummarizedRange`。
- `packages/@ooc/core/utils/summarized-ranges.ts`：整文件删（SummarizedRange / WinWithSummarizedRanges / projectSummarizedRanges helper）。
- `packages/@ooc/builtins/terminal/children/terminal_process/readable/history.ts`：删 `compressLevel?: 0|1|2` 字段。
- `packages/@ooc/builtins/terminal/children/terminal_process/readable/index.ts`：删 `resize` window method + 相关 export + window decl 引用。
- `packages/@ooc/builtins/interpreter/children/interpreter_process/readable/history.ts`：同 terminal。
- `packages/@ooc/builtins/interpreter/children/interpreter_process/readable/index.ts`：同 terminal。
- `packages/@ooc/builtins/agent/children/thread/TODO.md`：删 `tests/e2e/backend/context-compression-p0c-typed.test.ts` 提及（已不存在的 stale）。
- `packages/@ooc/core/types/permissions.ts:14` 注释清 "compress/resize" 提及。
- `packages/@ooc/core/runtime/ooc-class.ts`（如有引用——survey 命中、需 grep 具体）。

**文档 10+ 文件**（`.ooc-world-meta/stones/main/objects/supervisor/`）：
- `children/thinkable/knowledge/compress.md`：**整文件删**（compress 设计权威）。
- `children/thinkable/knowledge/context.md`：清 compress 相关段。
- `children/thinkable/self.md`：清 compress 相关段。
- `children/observable/knowledge/loop-debug.md` / `children/observable/self.md`：清 compress trace 相关。
- `children/readable/self.md`：清 compress window method 提及。
- `children/object/self.md`：清相关。
- `knowledge/ooc-philosophy.md` / `knowledge/index.md`：清 compress 顶层描述。
- supervisor/self.md：清 compress 提及。

**测试**：
- 影响面验证——grep tests/ 是否依赖 compress 任何符号？survey 暗示已无（compress 整套是 stub）。

## 改动提案

### 改动 1：源码 11 文件清

按上述清单逐个清——删 export + 删 import + 删字段 + 删 decl 引用 + 删 stub 文件。

### 改动 2：文档 10+ 文件清

- compress.md 整文件删（compress 设计权威文档）。
- 各 self.md / index.md / knowledge md 内 compress 相关段删/缩。
- 不留迁移映射段——「未来再补」意味着这是临时退役、未来重新设计可能完全不同形态、不必为现版本留映射。

### 改动 3：tool 原语数从 4 改回 3（exec/close/wait/open）—— **不动**

- compress 是 window method（exec(method="compress")），不是 tool 原语。tool 原语恒 4 个（exec/close/wait/open）不变。
- 仅 method 层退役、原语层不动。

### 改动 4：质量门

tsc 干净、全量 bun test 仍绿（compress 无测试依赖）。

### 改动 5：commit message 明示「未来再补」

不立 issue O 占位、不留 TODO 注释——「未来再补」由 git history + 本 issue 文档承载。

## 受影响设计元素

- `## thinkable`（B 区）—— compress.md 整文件删；compress 设计权威退役。
- `## readable`（B 区）—— compress / resize window method 退役；ThreadWin 字段瘦身。
- `## observable`（非维度）—— compress trace 相关清理。
- `## thread`（E 区）—— ProcessEvent context_compressed variant 退役。
- builtin process（terminal / interpreter）—— history compressLevel + resize 退役。

未受影响：executable / persistable / collaborable / reflectable / visible / runtime / app 核心契约。

## 风险与权衡

1. **数据回放**：旧 thread.json 含 `events: [{ kind: "context_compressed", ... }]` 或 `win.summarizedRanges` 等字段——hydrate 时 TS 类型层删字段、运行时 JSON 仍能 parse（无 schema 强校验）。**不阻塞 hydrate**，旧字段读出即忽略；写盘后丢失。可接受。
2. **未来再补的复用窗口**：完全清干净 vs 留一个 retired 标记的接口？倾向**完全清**——未来再补时按当时需求设计、不被遗留接口束缚（用户原话「未来再补」）。
3. **process（terminal/interpreter）也清 resize / compressLevel**：survey 显示 process readable 用 compressLevel 投影 history——本是为 process 自己设计的 v2 形态，与 thread compress 体系无强绑定。但为简单一致——**全清**（保持"compress 整体清"语义干净）。如果用户希望 process resize 保留作 history 滚动控制（独立机制、非 compress），未来用一个新 window method 名（如 set_history_size）替代。
4. **观测中断**：observable trace 内若有 compress 事件分类，清后类型缺失——同 (1) 旧 trace 数据读时 unknown 类型 graceful 降级。

## 待裁决点

1. **terminal/interpreter process 的 compressLevel + resize 是否一并清**？survey 表态全清（与"compress 整体"语义一致）。**裁决**：全清。
2. **是否补"compress 退役"迁移映射段进 thinkable/readable self.md**？倾向**不补**（git history 已记、未来再补是新设计）。**裁决**：不补。
3. **tests/ 内 compress 引用**：survey 暗示无依赖（compress 是空 stub 无测试）；落地前 grep 确认。

## review 记录

按 design-workflow 步骤 2 轻量 fan-out 1 reviewer（thinkable + readable + thread 三维度合审，用户已裁决方向、reviewer 主要校验影响面）。

### review by thinkable / readable / thread —— 强烈赞同 + 7 处补全

**核心结论**：survey 主张 + 11 源码 / 10 文档清单基本覆盖，但有 7 处必补/可调点。

**必补（落地必做）**：
- **events kind switch 兜底排查**：清 `context_compressed` ProcessEvent variant 后，必须 grep 所有 events kind switch（thread/thinkable/context + web visible timeline + observable debug-file）确认有 `default` 兜底或对 unknown kind graceful skip——否则旧 thread.json 读出 `context_compressed` 事件渲染时崩。
- **supervisor/children/object/self.md** L30 残留 compress 旁注（thinkable 模块槽举例）——补进文档清单。
- **types.ts 内部清理**：除 ProcessEvent `context_compressed` variant 外，`tool_use.toolName` 字段注释「compress 暂只保留类型位置」+ `ProcessEventCommon` 顶部 JSDoc「events 折叠历史」注释也需顺手清。

**关键修正（裁决点 2 改投反对）**：
- **不补完整迁移映射段** ≠ **完全不留痕**——reviewer 反对完全不留痕（"未来再补"语义会让 6 月后回归者无据可考、可能重走老路）。建议 **thinkable/self.md + context.md 各留一行简短标记**：「`compress` 子能力已整体退役（issue L, 2026-06-26）——context 压缩待重新设计」。一行、不展开。
- **readable/self.md 旧 Wave4 时代 `compressView` / `CompressViewHook` 迁移映射保留**——与本轮无关、删了破坏历史轨迹。

**完全支持**：
- terminal/interpreter process compressLevel + resize **全清**（compress.md 核心 2 明示 resize 是协议第一支；compressLevel 0 消费者；process 自带 set_history_window 走 viewport 路径独立、功能等价）。
- `resize` 名字现在删干净——未来重新设计大概率全新形态（用户原话）、预占名违反语义。
- tests/ 全无依赖（grep 0 命中）—— 安全清。

**可调（哲学举例 / 综述）**：
- supervisor/knowledge/ooc-philosophy.md L21,34,41 三处理论举例（哲学论证里拿 compress / compressLevel 举例）——**保留无害**，但可换中性词（viewport / transcriptViewport）避免依赖待退役术语。
- index.md L76,78,86 三处 compress 提及（thinkable + executable 综述段）：thinkable 综述段「context 是稀缺资源、有一套专门的压缩机制（compress）需注意」整段删；executable 段「compress 是 window method 而非原语」改「tool 原语恒 4 个」即可不提 compress。
- supervisor/self.md L34「OOC 3 个基础 tool ... compress 不是原语」清旁注、改 tool 原语数为 4 个。

**深符号确认 0 残留**：reviewer 亲手 grep `harvestSummarizerForks` / `spawnSummarizerFork` / `buildSummarizerSeed` / `maybeAutoCompress` / `maybeForceWaitForCompress` / `shouldAutoCompress` / `projectByCompressLevel` / `compress-trigger.ts` / `transcript-clamp.ts` 等 9 个深符号——**全套 0 命中**。compress.md 锚回的实施文件根本不存在——确认 "设计承诺远超实施兑现" 属实。

**activates_on / trigger 协议不动**：knowledge md 内 `activates_on` 不触 compress（grep 0 命中）—— 激活协议侧无连带退潮。

**docs/ 旧 plan 不在本 issue scope**：`docs/2026-06-*compress-*` 系列旧设计文档（CLAUDE.md 已声明逐步删）—— 不必本 issue 处理；若需可独立 followup。

## 裁决

**采纳全部清理 + 7 项补全 / 关键修正**。

### 核心裁决

1. **源码清理 11+ 文件**（按 reviewer 补全后）：
   - 删 `thread/readable/summarize.ts` 整文件。
   - 删 `thread/readable/index.ts` 内 `compress` + `resize` WindowMethod export + 3 处 window decl `window_methods` 数组移除引用。
   - 删 `thread/types.ts` 内 `ThreadWin.summarizedRanges?` + `autoCompressLevel?` + ProcessEvent `kind: "context_compressed"` variant + import `SummarizedRange` + `tool_use.toolName` 注释 compress 提及 + `ProcessEventCommon` 顶部 JSDoc 折叠态历史段。
   - 删 `core/utils/summarized-ranges.ts` 整文件。
   - 删 `terminal/children/terminal_process/readable/history.ts` 内 `compressLevel?: 0|1|2` 字段。
   - 删 `terminal/children/terminal_process/readable/index.ts` 内 `resize` WindowMethod + window decl 引用。
   - 同样改 `interpreter/children/interpreter_process/readable/{history,index}.ts`。
   - 删 `thread/TODO.md` 内 stale 测试文件名提及。
   - 清 `core/types/permissions.ts:14` JSDoc compress/resize 提及。
   - 清 `core/runtime/ooc-class.ts:45` JSDoc compress 钩子举例（如有）。

2. **文档清理（meta 仓）**：
   - **`children/thinkable/knowledge/compress.md` 整文件删**。
   - **`children/thinkable/knowledge/context.md` 清 compress 相关段**——核心 10 / 3.5 / 3.7 迁移映射 / `compress_request` event variant 表 / compressLevel 视角参数等 8 处全清；末尾留 1 行简短退役标记指 issue L。
   - **`children/thinkable/self.md` 末尾留 1 行简短退役标记**指 issue L、删主体 compress 段。
   - `children/readable/self.md` 旧 Wave4 时代 `compressView` / `CompressViewHook` 迁移映射**保留**（reviewer 修正）。
   - `children/observable/knowledge/loop-debug.md` / `children/observable/self.md` 清 compress trace 相关。
   - `children/object/self.md` L30 残留 compress 旁注清。
   - `knowledge/ooc-philosophy.md` L21,34,41 中性词替换（viewport / transcriptViewport 替代 compress 举例）。
   - `knowledge/index.md` L76,78,86 thinkable + executable 综述段清 compress 提及；tool 原语数表述统一为 4 个不提 compress。
   - `objects/supervisor/self.md` L34 tool 原语数改 4、清 compress 旁注。
   - `objects/supervisor/children/thread/...` 内 compress 提及一并清（reviewer 提到 thread 维度 self.md 也波及）。

3. **events kind switch 兜底排查**（落地必做）：
   - grep `thread/thinkable/context/` + `web/` + `observable/` 所有 events kind switch case 分支，确保 `default` 兜底 / unknown kind graceful skip。
   - 旧 thread.json 含 `kind:"context_compressed"` 事件读回应不崩、graceful 忽略。

4. **tool 原语恒 4 个（exec/close/wait/open）不动**——compress 是 window method、不是 tool 原语；本 issue 仅退役 method 层、原语层不变。

5. **质量门**：tsc 干净、全量 bun test 仍绿（127 测试 / 0 fail 基线、清后不引入新红）。

6. **commit message 简洁**：「retire compress mechanism (issue L) —— 整套退役、未来再补」；不立 issue 占位、不留 TODO 注释。

### 不夹带

- `docs/2026-06-*compress-*` 旧 plan 系列（CLAUDE.md 已声明逐步删）—— 可作独立 followup。
- 未来真做 context 压缩时按当时需求重新设计，不预设接口形状。

## 落地验收

**verified（2026-06-26）**——独立 verification reviewer 核对 6 项裁决全兑现。

- **裁决 1 源码 11 文件清完整性**：✅ thread/readable index.ts (compress + resize 删 + 三视角 decl 引用清) / summarize.ts 整删 / types.ts (ProcessEvent variant + ThreadWin 2 字段 + JSDoc 折叠段) / core/utils/summarized-ranges.ts 整删 / terminal+interpreter process readable 双 4 文件 / TODO.md + permissions.ts + ooc-class.ts 3 注释清。
- **裁决 2 events kind switch 兜底**：✅ `grep context_compressed packages/@ooc/` 0 命中；旧 thread.json 含此 kind 读出走 graceful skip。
- **裁决 3 文档清理 9 文件 + compress.md 整删**：✅ thinkable/self.md + context.md 各留 1 行简短退役标记指 issue L；readable Wave4 时代 compressView 迁移映射保留；observable / object / ooc-philosophy / index.md / supervisor.self.md 同步清。
- **退潮验收**：✅ packages/@ooc/ grep 0 命中；meta 仓全树仅 2 处退役标记 + 1 处 readable Wave4 映射。
- **tool 原语数全树一致 4 个**：✅ executable/self.md + index.md + supervisor.self.md 同步 "4 个 (exec/close/wait/open)"。
- **质量门**：tsc 干净；全量 133 pass / 0 fail（base main）。worktree 内 web-e2e.test.ts 因缺 packages/@ooc/web/ 目录失败，与本 issue 无关、合 main 后自然过。
- **零 followup 占位、零新增 TODO 注释**：commit message 显式声明、grep 确认。

落地 commits：`6288c3d6`（feat/retire-compress-mechanism 分支）+ `b7e1516`（meta 仓 main，已 push）。
