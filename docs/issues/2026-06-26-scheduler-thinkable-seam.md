---
title: scheduler → thinkable seam 真启用（ThinkableDeps 扩 opts + scheduler 经 resolveThinkable 派发）
status: landed
date: 2026-06-26
follows: 2026-06-26-thread-cross-session-scheduling.md
---

# scheduler → thinkable seam 真启用

## 背景 / 动机

`## thinkable` 维度的设计承诺「core scheduler/thinkloop 经 `resolveThinkable(thread.class).think(deps, args)` 派发，thread builtin 实现 think」（见 `## thinkable` index.md 节、`## runtime` 节、E 区 `## thread` 节）——但 seam 当前**只有半边接通**：

- ✅ `core/runtime/object-registry.ts:310-313` `resolveThinkable(classId)` seam 实现。
- ✅ `types/thinkable.ts:32-71` `ThinkableModule<Data>.think?(deps, args)` 协议签名。
- ✅ thread builtin `builtins/agent/children/thread/thinkable/index.ts:16-30` 已实现 `think` adapter（包装 module-level think）。
- ✅ `core/runtime/refcount.ts:33` + `core/runtime/gc.ts:77` 已用 seam 调 `refs/active`。
- ❌ **scheduler.ts:19 仍 `import { think } from "./thinkloop.js"` direct call**——绕过 seam。
- ❌ 拦路点：thinkloop 的 `ThinkOptions { worldDir, onDataEdit, wakeSession }` 不在 `ThinkableDeps`，adapter 丢弃 opts。

seam 启用是 thinkable 维度的设计落实，让 core 不知 thread 是什么（thread 只是某个 `ThinkableModule` 的实现）；这也铺路未来 thread 之外的 thinkable class（虽 OOC 哲学澄清 2 已表态 thinkable 模块槽天生面向 thread 系，但 seam 启用本身是干净的退潮卫生）。

## 现状（锚 index.md 对应 `##` 节）

锚点：
- `## thinkable`（B 区）—— 「core 经 registry.resolveThinkable 派发 think」承诺
- `## runtime`（E 区）—— ObjectRegistry / ClassRegistry seam
- `## thread`（E 区）—— thread 实现 thinkable adapter
- `## collaborable × thinkable`（D 区）—— issue G 的 wakeSession 注入路径（关联 ThinkableDeps 字段扩展）

涉及文件：
- `packages/@ooc/core/types/thinkable.ts:79-84`（ThinkableDeps 协议）
- `packages/@ooc/builtins/agent/children/thread/thinkable/scheduler.ts:19,76`（直 import + direct call）
- `packages/@ooc/builtins/agent/children/thread/thinkable/index.ts:16-30`（adapter 丢 opts）
- `packages/@ooc/builtins/agent/children/thread/thinkable/thinkloop.ts:33-38`（think signature 含 ThinkOptions）
- `packages/@ooc/core/app/server/runtime/worker.ts:8,43`（runScheduler 入口）

## 改动提案

### 改动 1：扩 `ThinkableDeps` 协议加 cross-cutting opts

`core/types/thinkable.ts`:
```ts
export interface ThinkableDeps {
  llm: unknown;
  registry: unknown;
  /** 持久化 + flow 寻址用——thread think 与对端调度需。 */
  worldDir?: string;
  /** instance data 变更后通知 runtime 持久化（issue C scope=flow 写入路径）。 */
  onDataEdit?: () => Promise<void> | void;
  /** 跨 thread/跨 session 唤醒钩（issue G）；缺省 no-op + warn 兜底。 */
  wakeSession?: (sessionId: string) => void;
}
```

字段全 optional——既有 caller（refs / active）不受影响（它们不读这些字段）。

### 改动 2：thread thinkable adapter 透传 opts

`builtins/agent/children/thread/thinkable/index.ts`:
```ts
think: async (instance, deps) => {
  const llm = deps.llm as LlmClient;
  const registry = deps.registry as ObjectInsRegistry;
  await think(instance.data, llm, registry, {
    worldDir: deps.worldDir,
    onDataEdit: deps.onDataEdit,
    wakeSession: deps.wakeSession,
  });
},
```

### 改动 3：scheduler 真经 seam 派发

`builtins/agent/children/thread/thinkable/scheduler.ts`:
- **删** `import { think } from "./thinkloop.js"`。
- line 76 改为：
  ```ts
  const thinkableMod = registry.resolveThinkable(next.class);
  if (!thinkableMod?.think) {
    throw new Error(`[scheduler] no thinkable.think for class=${next.class}`);
  }
  await thinkableMod.think(
    { id: next.id, class: next.class, data: next },
    { llm, registry, worldDir, onDataEdit, wakeSession }
  );
  ```
  注意：scheduler 当前扫的 `next` 类型是 ThreadContext data（不是 OocObjectInstance）；需要重包 instance shape 或确认 adapter 接收 data only。**实测决定**。
- fail-loud：`resolveThinkable` 返 undefined 或 `.think` 缺省时 throw（既有 `inst.class !== THREAD_CLASS_ID` 过滤已挡住非 thread，正常路径不应未命中——未命中即注册表损坏）。

### 改动 4：scheduler `onSchedulerTick` 顺手接通

ThinkableModule 已有 `onSchedulerTick?` 字段（但 thread builtin 没实现）。本 issue 不强求 thread 实现，但 scheduler 可在 tick 起始/结束调 `thinkableMod.onSchedulerTick?.(deps, args)` 作 lifecycle hook（thread 不实现就空跑）。**留 followup**——本 issue 仅启用 think 派发，不改 scheduler tick 形态。

### 改动 5：文档回流

- `## thinkable` 节：明示 ThinkableDeps 含 worldDir/onDataEdit/wakeSession 字段；scheduler 经 seam 派发。
- `## runtime` 节：补 resolveThinkable 现在驱动 think + refs + active 三路。
- thinkable/self.md：核心段同步、迁移映射段补「scheduler 直 import think 退役」。

## 受影响设计元素

A 区：无。

B 区：
- `## thinkable` —— ThinkableDeps 扩字段；seam 启用兑现。

D 区：
- `## collaborable × thinkable` —— wakeSession 字段从 issue G 的 ThreadRuntimeOpts 透传 ThinkableDeps（路径理顺）。

E 区：
- `## thread` —— adapter 透传 opts、scheduler 经 seam 派发。
- `## runtime` —— resolveThinkable 驱动 think 路径首次启用。

未受影响：persistable / readable / executable / collaborable / reflectable 核心契约。

## 风险与权衡

1. **fail-loud throw 是否过激**：scheduler 当前 silent skip 非 thread inst；切到 seam 后未命中 throw——但既有 `class !== THREAD_CLASS_ID` 过滤已挡住所有非 thread。reviewer 倾向 throw（fail-loud 守门）。
2. **adapter instance shape**：scheduler 持有 `next: ThreadContext` 但 adapter 期望 `instance: OocObjectInstance<ThreadContext>`——需在 scheduler 里手动包 `{ id: next.id, class: next.class, data: next }` 或改 adapter 接受 data only。**实测最小路径**。
3. **issue G wakeSession 注入路径**：当前是 worker→scheduler→thinkloop→ThreadRuntime opts 透传；本 issue 改为 worker→scheduler→ThinkableDeps→adapter→thinkloop opts——一致简化（scheduler 不再透 wakeSession 单独参数，统一进 deps）。**实测落点**。

## 待裁决点

1. **adapter 包 instance 还是改签名**：包 OocObjectInstance shape（保持协议清晰）vs adapter 收 data only（最小改动）。**倾向包 instance**——保持协议设计完整。
2. **scheduler 未命中 thinkable.think 时 throw vs silent skip**：fail-loud throw。
3. **onSchedulerTick 是否本 issue 接通**：**不接通**，留独立 followup。
4. **改动 1 ThinkableDeps 字段是否全 optional**：是——既有 refs/active caller 不读这些字段，optional 不破坏向后兼容。
5. **worldDir 字段是否真需要**：thinkloop ThinkOptions 含 worldDir，但 adapter 是否真传？实测；若 thinkloop 内部自取 worldDir 不需 caller 传，则 ThinkableDeps 也无需此字段。**最小化原则**：实测决定。

## review 记录

按 design-workflow 步骤 2 轻量 fan-out 2 reviewer（thinkable+runtime / 完整性批评官）。

### review by thinkable / runtime —— 高质量、5 项明确立场

- **ThinkableDeps 哲学定位**：thinkable 模块槽**确实** thread-specific（issue D/E 已确认），扩 worldDir/onDataEdit/wakeSession 合理；但建议改名 `ThinkableDeps → ThreadThinkableDeps` 或 jsdoc 注明 thread-only 假设，避免未来漂移。
- **fail-loud 位置**：types 层只声明 optional 不 throw（保持纯类型）；**fail-loud 在 thread builtin adapter 入 think 前断言**（最接近调用方、错误信息能定位 thread 创建 thinkable deps 漏注入）。
- **instance shape 关键建议**：think signature 收敛为 `think(data: ThreadContext, deps: ThinkableDeps)` 而非 `(instance, deps)`——scheduler 不包 fake OocObjectInstance（"反向迁就"协议）；thinkable 是能力模块、不持 instance handle；本次定下来比留尾巴好。**采纳**。
- **scheduler fail-loud throw**：silent skip 是 thinkable 系统最坏的失败模式（thread 死锁但无日志）；scheduler tick 边界外做 capability check，缺则 throw `Error('scheduler: object <id> has no thinkable.think')`。
- **onSchedulerTick** 不在本 issue 接通——属另一层 lifecycle 语义、扩面无收益；留 followup。

补派建议：collaborable / observable reviewer 各看一眼——本 issue 改动小（wakeSession 签名/语义不变、observable 不动），**不补派**。

### review by completeness critic — Issue H —— 严重事实错误

**reviewer 显然误读了某个其它 issue 或源文件**——其 review 内容（"`(registry as any)._cache`"、"`getThinkableHandle`"、"`instantiateClaudeProvider` 缺 model 兜底"、ObjectRegistry.getThinkableHandle 返回形状等）**完全不是 issue H 内容**——issue H 是「scheduler 直 import think 改经 resolveThinkable seam 派发 + ThinkableDeps 扩 opts」。**大部分反馈忽略**。

偶然有效的建议采纳：
- **补 `## executable` 受影响元素？**——本 issue 不动 RuntimeHandle、不动 ObjectMethod、不动 ExecutableModule 协议；scheduler 的 think dispatch 与 executable 维度无交集；**不补**。
- **grep `scheduler.ts` 全文裸 cast 确认覆盖**——采纳，落地必做。
- **fail-loud 位置选定**——已由 thinkable reviewer 给出答案，无 ambiguity。

## 裁决

按 thinkable/runtime reviewer 共识落地。

### 裁决要点

1. **ThinkableDeps 扩字段**：
   ```ts
   export interface ThinkableDeps {
     llm: unknown;
     registry: unknown;
     worldDir?: string;
     onDataEdit?: () => Promise<void> | void;
     wakeSession?: (sessionId: string) => void;
   }
   ```
   - **保持名字 ThinkableDeps**（reviewer 建议改 ThreadThinkableDeps，但当前仅 thread 类用 thinkable 槽——OOC 哲学澄清 2 已确认；改名涉及所有 caller，与 issue H 最小范围不符；改名留独立 issue）。
   - **jsdoc 必须注明**：「当前 thinkable 模块槽天生面向 thread 系；worldDir / onDataEdit / wakeSession 是 thread 启动 thinkloop 的 cross-cutting opts」（reviewer 建议采纳）。
   - 字段全 optional——既有 refs/active caller 不读、不破坏向后兼容。

2. **think signature 收敛为 `(data, deps)` 而非 `(instance, deps)`**：
   - `core/types/thinkable.ts` 中 ThinkableModule.think 签名改：
     ```ts
     think?(data: Data, deps: ThinkableDeps): Promise<void>;
     ```
     （**采纳 reviewer 关键建议**——thinkable 是能力模块、不持 instance handle）。
   - 这是协议简化、不是越界——scheduler 与 adapter 都不再需要包/拆 fake instance。

3. **adapter 透传 + fail-loud 断言**：
   `builtins/agent/children/thread/thinkable/index.ts`:
   ```ts
   think: async (data, deps) => {
     // fail-loud：think 入口必备 deps
     if (!deps.worldDir || !deps.onDataEdit) {
       throw new Error('thread.think requires worldDir + onDataEdit in ThinkableDeps');
     }
     const llm = deps.llm as LlmClient;
     const registry = deps.registry as ObjectInsRegistry;
     await thinkloop(data, llm, registry, {
       worldDir: deps.worldDir,
       onDataEdit: deps.onDataEdit,
       wakeSession: deps.wakeSession,  // optional、透传 to ThreadRuntime
     });
   },
   ```
   wakeSession 不 fail-loud（issue G 已确认 optional + ThreadRuntime 内 no-op + warn 兜底）。

4. **scheduler 经 seam 派发 + capability check fail-loud**：
   ```ts
   const thinkableMod = registry.resolveThinkable(next.class);
   if (!thinkableMod?.think) {
     throw new Error(`[scheduler] no thinkable.think for class=${next.class}`);
   }
   await thinkableMod.think(next, { llm, registry, worldDir, onDataEdit, wakeSession });
   ```
   - **删** `import { think } from "./thinkloop.js"`。
   - 既有 `inst.class !== THREAD_CLASS_ID` 过滤已挡住非 thread，正常路径不会未命中——throw 即注册表损坏。

5. **scheduler / thinkloop / worker 闭包透传**：
   - worker.ts 仍单点构造 wakeSession 闭包（issue G 既有）；
   - scheduler opts 已含 wakeSession（issue G 已扩 SchedulerOptions）；
   - 本 issue 改动：scheduler 把 wakeSession + worldDir + onDataEdit 一并放进 ThinkableDeps 调 adapter（替代当前直传 thinkloop ThinkOptions）。
   - thinkloop module-level `think` signature 不变（adapter 内部调），但 thinkloop 不再被 scheduler 直 import。

6. **onSchedulerTick 不接通**：留 followup（lifecycle hook 设计另起 issue）。

7. **落地前 grep 验收**：grep `scheduler.ts` 全文确认无遗漏裸 import（采纳完整性批评官唯一有效建议）。

8. **不补派 reviewer**：本 issue 改动小（wakeSession 注入路径仅形态调整、签名/语义不变；observable trace 不动；collaborable 仍是 say→scheduleSession 协议层不感知 dispatch 改造）。

### 落地步骤（worktree `.worktree/scheduler-thinkable-seam`）

1. core/types/thinkable.ts：
   - ThinkableDeps 加 worldDir? / onDataEdit? / wakeSession? optional 字段 + jsdoc。
   - ThinkableModule.think 签名改 `(data: Data, deps: ThinkableDeps)`。
2. builtins/agent/children/thread/thinkable/index.ts:
   - adapter `think: (data, deps) => { 断言 + cast + 调 thinkloop }`。
3. builtins/agent/children/thread/thinkable/scheduler.ts:
   - 删 `import { think } from "./thinkloop.js"`。
   - dispatch 改 `registry.resolveThinkable(next.class)?.think(next, deps)` + capability check fail-loud。
4. 检查现有 `core/runtime/refcount.ts` + `core/runtime/gc.ts` 用 seam 调 refs/active 的 caller——确认不破坏（应不破坏：active/refs 签名不变）。
5. tests/thinkloop-e2e.test.ts：现有直 import `think` 的单元测试不动（绕过 scheduler、测 module-level think 自己）；scheduler→think e2e 测应仍绿（runScheduler 公共签名不变）。
6. 文档回流：
   - thinkable/self.md：ThinkableModule.think 签名更新；ThinkableDeps 扩字段 + thread-only 假设说明；迁移映射段补「scheduler 直 import think 退役」。
   - index.md `## thinkable` 节 + `## runtime` 节 + `## thread` 节（adapter 形态）同步。
7. 质量门：tsc 干净 + 全量 bun test 不引入新红。

### 不在本 issue 范围（followup）

- onSchedulerTick lifecycle hook 设计（独立 issue）。
- ThinkableDeps → ThreadThinkableDeps 改名（独立轻量 issue）。
- 未来 thread 之外 thinkable class 的探讨（如有需求）。

## 落地验收

（待 landed 后填）

## 落地记录

- 源代码 commit：worktree `.worktree/scheduler-thinkable-seam` 分支 `feat/scheduler-thinkable-seam` 上 `feat(thinkable): scheduler 经 resolveThinkable seam 派发 think（issue H）`。
- 修改文件清单：
  - `packages/@ooc/core/types/thinkable.ts`：ThinkableModule.think 签名改 `(data, deps)`；ThinkableDeps 扩 `worldDir? / onDataEdit? / wakeSession?` + jsdoc 标 thread-only。
  - `packages/@ooc/builtins/agent/children/thread/thinkable/index.ts`：adapter 入口 fail-loud 断言 worldDir+onDataEdit 必备；解 deps 调 thinkloop module-level think；移除多余 `OocObjectInstance` 引入。
  - `packages/@ooc/builtins/agent/children/thread/thinkable/scheduler.ts`：删 `import { think } from "./thinkloop.js"`；改经 `registry.resolveThinkable(THREAD_CLASS_ID)` 派发 + capability check fail-loud（thinkable 模块缺失即注册表损坏）。
  - `packages/@ooc/tests/thinkloop-e2e.test.ts`：scheduler 测补 `worldDir + onDataEdit` stub 适配新 adapter 契约。
- 质量门：`bun run check:tsc` 干净；`bun test packages/@ooc/tests/` 94 pass / 1 fail（仅 web-e2e 预先红，与本 issue 无关）。
- grep 验收：`grep -rn 'import.*\bthink\b.*from.*thinkloop' packages/@ooc/` 仅命中 `thread/thinkable/index.ts`（adapter 本身的 module-level wrap，按设计保留）；scheduler 已 0 命中。
- 文档回流（meta 仓 main 分支）：`supervisor/children/thinkable/self.md`（think 签名 + ThinkableDeps 字段表 + 迁移映射）；`supervisor/knowledge/index.md` `## thinkable / ## runtime / ## thread` 同步。
