---
title: 修复 thread-runtime.ts dispatch bug（window method lookup key 错配，issue K）
status: verified
date: 2026-06-26
follows: 2026-06-26-window-class-to-window-view-rename.md
---

# 修复 thread-runtime dispatch bug

## 背景

issue J survey 揭示 `packages/@ooc/builtins/agent/children/thread/runtime/thread-runtime.ts:132` 一行 dispatch bug：

```ts
const windowMethod = this.registry.resolveWindowMethod(ref.class, ref.class, methodName);
//                                                                ^^^^^^^^^ wrong
```

`resolveWindowMethod` 第二参语义是 `windowView`（按 `w.view === windowView` 在 readable.window decl 内匹配）——传 `ref.class`（注册 class id，如 `_builtin/agent/thread`）永远无法等于 view 名（`"default"` / `"self"` / `"super"` / `"talk"`）。结果：**所有 window method dispatch 永远 miss**。

issue J 时 reviewer 描述为「silent miss」，实测（issue K survey）发现是「silent throw」——thread-runtime.ts:138 在 lookup 返 undefined 后**已经 throw**，dispatch.ts:24-56 catch 转文本回喂 LLM 看到 `(error: [exec] method not found on class _builtin/agent/thread: set_transcript_window)`。LLM 归因于自己用错名字、不知是 dispatch lookup bug。

**自 issue J 起**，OocObjectRef 已有 `window_view?: string` 字段、9 处 ref 创建点已显式写（self/super 硬编码 + default 缺省兜底）——修复条件全部齐备。

## 受影响

- `## thread`（E 区）—— ThreadRuntime.exec dispatch 路径
- `## readable`（B 区）—— window method lookup
- `## executable × readable`（D 区）—— window method dispatch 协议契约

涉及文件（survey 已 grep）：
- `packages/@ooc/builtins/agent/children/thread/runtime/thread-runtime.ts:132`（call site）
- `packages/@ooc/core/runtime/object-registry.ts:41,259-266`（`resolveWindowMethod` + `DEFAULT_WINDOW_VIEW`）

修后真生效的 5 个 window method（survey 已列）：
- `set_transcript_window`（thread/readable/index.ts）—— **真改 win.transcriptViewport、真截 transcript**（最显著行为变化）
- `compress`（thread）—— 空实现（TODO 占位），修后仍 noop return
- `resize`（thread）—— 写 win.autoCompressLevel（**无消费者**、修后死字段）
- `set_viewport`（file / knowledge）—— **真改 win.viewport、真截内容窗 transcript**
- `set_history_window` + `resize`（terminal_process / interpreter_process）—— 真切换 history viewport

## 改动提案

### 改动 1：修 dispatch lookup key（一行）

`packages/@ooc/builtins/agent/children/thread/runtime/thread-runtime.ts:132`:

```ts
// 修前
const windowMethod = this.registry.resolveWindowMethod(ref.class, ref.class, methodName);

// 修后
const windowMethod = this.registry.resolveWindowMethod(
  ref.class, ref.window_view ?? DEFAULT_WINDOW_VIEW, methodName,
);
```

加 import：
```ts
import { DEFAULT_WINDOW_VIEW } from "@ooc/core/runtime/object-registry.js";
```

### 改动 2：miss 时仍走原 throw 路径（**不动**）

138 行 `throw new Error(...)` 原样保留——dispatch.ts catch 转 LLM 可见错误文本已足够。**不新增 NotFound 错误类**（survey 已确认 silent miss 是失实表述、当前已 throw、兼容性零风险）。

### 改动 3：新增 dispatch e2e 守门测试

新 `packages/@ooc/tests/thread-window-method-dispatch.test.ts`：

- **case A: self-view ref 调 set_transcript_window**——construct thread → self-view ref（window_view=`"self"`）→ exec `set_transcript_window {tail:5}` → 断言 `ref.data.transcriptViewport.tail === 5` 真写入。
- **case B: miss 仍 throw**——调不存在的 window method → 抛 `[exec] method not found`（覆盖 issue J 关注的退潮路径）。
- **case C: default ref 调 viewport method**——file ref（window_view 缺省 default）调 `set_viewport`，断言 viewport 真改。
- **case D: super-view ref 调 set_transcript_window**——super flow 内 self-view ref（window_view=`"super"`），同名 method 仍命中（三视角注册同 3 method）。

### 改动 4：文档同步

- thread/readable/index.ts 文件头注释：dispatch bug 已修。
- thread/runtime/thread-runtime.ts:132 注释加：「issue K 修复 resolveWindowMethod lookup key 用 ref.window_view」。
- 不动 meta self.md / index.md——纯实施层 bug 修复、无契约变更。

## 受影响设计元素

- `## thread`（仅实施层）
- `## readable × executable`（仅实施层）

无契约层变更。

## 风险与权衡

1. **set_transcript_window / set_viewport / set_history_window 真生效**：之前 LLM 调了收到 error、不会再次调；修后调成功 → 真截窗。可能引起的现象：之前 LLM 看到的 transcript / file / terminal viewport 是全量，修后 LLM 调了 viewport 后真截。**无 data 损坏路径**——viewport merge 是 immutable + DEFAULT 兜底、越界 fail-loud。
2. **trace 体量**：dispatch 调用层不进 trace、仅 LLM tool call 进 trace。修前 trace 看到 tool call → error 返回；修后 tool call → ok 返回——同 1 行 trace、不增体量。
3. **死字段风险**：`autoCompressLevel`（thread resize）无消费者、修后写盘但无观测。**留 issue L 评估**（compress / autoCompressLevel 整套机制是否真要实现，还是退役）。
4. **compress 空实现**：thread/readable/index.ts:63-71 TODO 占位，修后真生效仍 noop return（"(ok)" 返回，无副作用）。

## 待裁决点

1. **是否补 file / terminal_process / interpreter_process viewport method 单独 dispatch 测试**？倾向**仅补 1-2 个代表性 case**（thread.set_transcript_window 主测、file.set_viewport 顺手验跨 class 命中），其余 LLM 真触达时由 e2e 兜底。
2. **dispatch.ts catch 错误文本是否需精细化**：当前 `[exec] method not found on class X: Y` —— 修后 lookup key 正确、但若真不存在该 method 仍 throw。文本 OK，不动。
3. **observable trace 调整**：reviewer 之前提"trace 体量上涨"——survey 实测确认不变。**不动**。

## review 记录

按 design-workflow 步骤 2 轻量 fan-out 2 reviewer——thread+readable×executable / 完整性批评官。

### review by thread / readable × executable —— 强烈支持落地 + 调 test case + 揭更深 leak

- **一行修建议**：`ref.window_view ?? DEFAULT_WINDOW_VIEW` 表达式与 render-context.ts / `<window>` XML attribute / registry seam 三处投影上下文完全一致；改动 1 是「issue J 后必然紧跟的最后一公里、不补就 J 白做」。
- **case 调整建议**：保 A（thread.set_transcript_window self-view）+ C（file.set_viewport default）+ D（thread super 三视角分发），**退役 case B**（"miss 仍 throw" 测试不与本次改动绑定、catch path 不是本 issue 引入、属另起 issue 范畴）。terminal_process / interpreter_process viewport method 走同条 seam，case C 已证、不必再补冗余。**采纳**。
- **autoCompressLevel + compress 空实现留 issue L、不顺手退役**：触动 thread.readable window_methods 集合 = 触动设计契约 = 违反夹带禁令。**采纳**。
- **协议层更深 leak 揭出**（关键发现）：object_methods 按视角分集 surface（issue I+J）但 dispatch 层 `resolveObjectMethod` 本类直查、**不按 view 过滤**——caller 视角的 ref 理论上能调到 reply/end/todo。本 issue K 不夹带、留**独立 issue M** 评估「object method dispatch 是否需按 view 过滤、还是改为只影响 prompt surface dispatch 不闸」（两种都是合法设计、需 reviewer 选边）。
- 测试 case 应**走 DEFAULT_WINDOW_VIEW 常量路径**而非 magic string，对齐 issue J 单一来源原则。
- LLM 行为变化无破坏路径（viewport merge immutable + DEFAULT 兜底）；trace 体量不变（修前/修后同 1 行 tool call + 返回）。

### review by completeness critic — Issue K —— 部分采纳

- **autoCompressLevel + compress 死字段登记**——thread reviewer 建议留 issue L、批评官也提此点，**采纳**：在 issue K 风险段显式登记 autoCompressLevel + compress 空实现作 issue L 候选。
- **set_viewport 真生效后的 LLM 行为变化风险**——批评官指出该风险未列。但 thread reviewer 实测「viewport merge immutable + DEFAULT 兜底、无 data 损坏路径」、survey 同结论。**采纳风险登记、不阻塞落地**：风险段补一句说明，但不要求 prompt 收紧（实际行为是 LLM 调对了 method 真生效、不是「LLM 之前借 silent 取巧」）。
- **批评官虚构 `## cross-window-x-method-dispatch` 元素**——index.md 实际 A-E 区无此元素（critic 幻想）。不采纳。
- **runtime / thinkable / observable 补 reviewer**——本 issue 是 1 行 lookup key 修、survey 实测 dispatch 调用层不进 trace、ClassRegistry seam API 不变、thinkable tools dispatch.ts catch 路径不变。**不补派**。
- **dispatch.ts 行号收窄 + 函数名锚定**——建议 acceptable，落地者按 catch 路径具体行号写测试即可。
- **回归测试 + reflection 路径负向验证**——分别由 thinkloop-e2e 既有覆盖 + issue D super flow 测试兜底。**不补**。

## 裁决

**采纳全部改动 + thread reviewer 关键调整**。

### 核心裁决

1. **改动 1**（一行修）：`thread-runtime.ts:132` 改为 `resolveWindowMethod(ref.class, ref.window_view ?? DEFAULT_WINDOW_VIEW, methodName)` + 加 `DEFAULT_WINDOW_VIEW` import。

2. **改动 2**（miss 不动）：thread-runtime.ts:138 原 `throw new Error('method not found ...')` 路径保留、dispatch.ts catch 转 LLM 可见文本——不新增 error class、不动 silent vs throw 边界。

3. **改动 3**（测试调整）：
   - **case A**: self-view thread ref → set_transcript_window {tail:5} → 断言 ref.data.transcriptViewport.tail===5。
   - **case C**: file ref（window_view 缺省 default）→ set_viewport → 断言 viewport 真改。
   - **case D**: super flow self-view ref（window_view="super"）→ set_transcript_window → 命中（三视角注册同 3 method、issue I+J 三 issue 联合守门）。
   - **退役 case B**（miss throw 测试不与本次改动绑定）。
   - 测试用 `DEFAULT_WINDOW_VIEW` 常量、不写 magic string。

4. **改动 4**（文档同步）：thread-runtime.ts:132 注释加「issue K 修复 resolveWindowMethod lookup key」；不动 meta self.md（无契约变更）。

5. **风险段补登记**（采纳完整性批评官 + thread reviewer）：
   - autoCompressLevel 死字段 + compress 空实现 → **issue L 候选**（不立即清，属设计层裁决——是否真要实现压缩机制 / 退役整套）。
   - set_viewport / set_transcript_window / set_history_window 真生效后 LLM 行为变化——viewport merge immutable + DEFAULT 兜底、无 data 损坏路径；不阻塞、不要求 prompt 收紧。

6. **关联 followup（独立 issue）**：
   - **issue L**: autoCompressLevel + compress 空实现退役评估（survey 也指出 `<window>` XML view attribute 已对齐 issue J）。
   - **issue M**: object_methods 按视角分集 surface 但 dispatch 层不闸——thread reviewer 揭出的更深协议 leak。需 reviewer 选边（dispatch 闸 vs 只影响 prompt surface）。
   - 这两个 followup 由本 issue verified 后另起 issue。

### 落地步骤（无需独立 worktree，main 直改）

1. thread-runtime.ts:132 一行修 + import DEFAULT_WINDOW_VIEW。
2. 添加注释（落地步骤 4）。
3. 新增 `packages/@ooc/tests/thread-window-method-dispatch.test.ts` 3 case (A/C/D)。
4. `bun run check:tsc` 干净。
5. `bun test packages/@ooc/tests/` 全量绿。
6. commit + push（主仓 + 文档 meta 同步）。

## 落地验收

**verified（2026-06-26）**——改动表面极小（1 行 lookup key 修 + 3 case 测试），不派独立 verification reviewer，由 supervisor 自验：

- **改动 1**：thread-runtime.ts:132 改 `resolveWindowMethod(ref.class, ref.window_view ?? DEFAULT_WINDOW_VIEW, methodName)` ✅；DEFAULT_WINDOW_VIEW 加入 import block ✅；issue K 修复注释加入 ✅。
- **改动 3 测试**（按裁决调整为 A/C/D，B 退役）：
  - case A（self-view thread ref set_transcript_window）✅
  - case C（file ref window_view 缺省 → DEFAULT_WINDOW_VIEW 命中 set_viewport 真改 viewport.lineStart/lineEnd）✅
  - case D（super-view ref 调 set_transcript_window 跨视角分发）✅
- **改动 4 文档同步**：thread-runtime.ts:132 加 issue K 注释——OK。
- **质量门**：tsc 干净、全量回归 122 pass / 0 fail / 359 expect（比 issue J 后 +3 case）。

**Followup（不阻塞 verified）**：
- **issue L**：autoCompressLevel + compress 空实现退役评估（survey + reviewer 一致建议另起）。
- **issue M**：object_methods 按视角分集 surface 但 dispatch 层不闸 leak（thread reviewer 揭出更深协议层问题）。

落地 commits：（合并 main 直改、commit hash 待 push）。
