---
title: dispatch 层按 view 闸 object/guide method —— 兑现 method.public 退役契约（issue M）
status: verified
date: 2026-06-26
follows: 2026-06-26-thread-runtime-dispatch-bug-fix.md
---

# dispatch 层按 view 闸 object/guide method

## 背景

issue K survey 揭出更深 leak（thread reviewer 指出）：

issue I+J 引入 `WindowViewDecl` 三视角分集 surface object_methods（default/self/super 各列允许 method 子集），issue E 时退役 `ObjectMethod.public?` 字段、明示「method 可见性 = readable.window decl 单一来源」——core/types/executable.ts:128-134 注释字面写「未列入即**不可见、不可调**」。

**但实施只兑现一半**：
- `ThreadRuntime.exec` 内 `resolveObjectMethod(ref.class, methodName)` + `resolveObjectGuideMethod(ref.class, methodName)` 两条查链**不查 view**、本类直查命中即 exec——caller 持 default-view ref 调 reply/end/todo（self view 的 surface）**实际能成功**。
- `resolveWindowMethod` 已经按 view 闸（issue K 修）—— window method / object method / guide method **dispatch 语义不一致**。

实施漂移点：survey 列出 method 三类一致性表，明确**唯一**多视角 class 是 thread；其它单视角 class（view="default"）闸完全等价 issue E 「按 readable.window control 可见性」初衷。

## 受影响

- `## executable`（B 区）—— method.public 退役契约「未列入即不可调」实施兑现
- `## readable × executable`（D 区）—— dispatch 按 surface 白名单闸
- `## thread`（E 区）—— 唯一多视角 class、闸后 reflect 4 method 业务 session 偷调被 fail-loud
- `## runtime`（E 区）—— ThreadRuntime.exec 扩 dispatch 入口校验

涉及文件：
- `packages/@ooc/builtins/agent/children/thread/runtime/thread-runtime.ts:125-145`（dispatch 入口）
- `packages/@ooc/core/runtime/object-registry.ts:236,249,269`（resolveObjectMethod / resolveObjectGuideMethod / resolveWindowView seam）
- `packages/@ooc/core/types/executable.ts:128-134`（method.public 退役注释——本 issue 兑现）
- `packages/@ooc/core/types/readable.ts:64-69`（WindowViewDecl 结构含 object_methods? + guide_methods?）

## 改动提案

### 改动 1：thread-runtime.exec 闸 object/guide method view

`thread-runtime.ts:125-145` 三段查链改造——object method / guide method 命中后追加 view surface 白名单 check：

```ts
// helper（私有）
private assertInSurface(
  ref: OocObjectRef,
  methodName: string,
  kind: "object" | "guide",
): void {
  const view = ref.window_view ?? DEFAULT_WINDOW_VIEW;
  const decl = this.registry.resolveWindowView(ref.class, view);
  if (!decl) return; // 无 decl → 单视角 class 缺省 fallback；不闸（保留兼容）
  const surface = kind === "object" ? decl.object_methods : (decl.guide_methods ?? []);
  if (!surface.includes(methodName)) {
    throw new Error(
      `[exec] method "${methodName}" not in surface of view "${view}" on class ${ref.class}`,
    );
  }
}
```

dispatch 链：
```ts
const objectMethod = this.registry.resolveObjectMethod(ref.class, methodName);
if (objectMethod) {
  this.assertInSurface(ref, methodName, "object"); // 新增 surface 闸
  return await this.execObjectMethod(ref, objectMethod, args);
}
const guideMethod = this.registry.resolveObjectGuideMethod(ref.class, methodName);
if (guideMethod) {
  this.assertInSurface(ref, methodName, "guide");
  return await this.execGuideMethod(ref, methodName, guideMethod, args);
}
// window method 已按 view 闸（issue K）—— 保留
const windowMethod = this.registry.resolveWindowMethod(
  ref.class, ref.window_view ?? DEFAULT_WINDOW_VIEW, methodName,
);
if (windowMethod) { ... }
```

**fail-loud 错误文案统一**与 `[exec] method not found on class X: Y` 形态对齐：`[exec] method "X" not in surface of view "Y" on class Z`。

### 改动 2：reflect 4 method 的 requireSuperSession 双闸门退化为冗余

reflect 系 4 method（method.reflect.ts:111,218 等）现自带 `requireSuperSession(ctx)` 闸——issue M 闸 view 后，super view 才暴露 reflect 4 method，业务 session ref（window_view=default/self）调 reflect method 经新 surface 闸先 fail-loud。

requireSuperSession 双闸门**保留作 defense-in-depth**——不删（防 dispatch 外路径绕开）。

### 改动 3：新增 dispatch surface gate 测试

新 `packages/@ooc/tests/dispatch-view-surface-gate.test.ts`：

- **case A**: caller default-view thread ref 调 reply（self surface） → throw `not in surface of view "default"`。
- **case B**: caller default-view thread ref 调 say（在 default surface） → 成功。
- **case C**: 业务 session default-view thread ref 调 scan_changes（仅 super surface） → throw（不论 requireSuperSession 双闸；新 surface 闸先 fail）。
- **case D**: super-view thread ref（window_view="super"）调 scan_changes → 经 requireSuperSession（ctx.sessionId==="super"）成功路径前置——此 case 仅验 surface 闸**通过**、不一定真执行 reflect（避免触发完整 super flow 副作用）。

### 改动 4：method.public 退役注释 + executable.self.md 兑现度更新

- `core/types/executable.ts:128-134` 注释「未列入即不可见、不可调」 → 加一句「issue M 兑现 dispatch 层 surface 白名单闸」。
- `objects/supervisor/children/executable/self.md` 在 method.public 退役段加注 issue M 兑现度。
- `objects/supervisor/knowledge/index.md` `## executable × readable` 节 + `## readable × executable` 节同步——method 三类（object/guide/window）dispatch 一致按 view 闸。

### 改动 5：兼容性回归

survey 已验证现存 tests 零回归——所有 `runtime.exec` 调用都按 decl surface 摆位：
- thread-readable-views.test.ts case D（self-view ref 调 reply）∈ self surface OK。
- thread-runtime.test.ts（_builtin/agent/todo 单视角 view=default 含 "done"）OK。
- thinkloop-e2e.test.ts（exec todo "done"）OK。
- dispatch-guide-form.test.ts（自定 stub class 全按 decl surface 摆位）OK。

无需迁移、零回归。

## 受影响设计元素

- `## executable` —— method.public 退役契约**兑现**（不可见+不可调一致）。
- `## readable × executable` —— dispatch 三类语义统一。
- `## thread` —— reflect surface 闸后业务 session 偷调被 fail-loud。
- `## runtime` —— dispatch seam 扩 helper（仅 thread-runtime 内部）。

未受影响：persistable / collaborable / reflectable / visible / observable / app 核心契约。

## 风险与权衡

1. **零回归**：survey grep 现存 tests 全 path 符合 decl surface——无需迁移、无 test 红。
2. **fail-loud 比 silent miss 更安全**：之前 caller 经 default ref 调 reply 默默成功——是隐式漏权；fail-loud 立刻暴露。
3. **multi-view class 兼容**：当前唯一多视角 class 是 thread（default/self/super 三视角）；其它单视角 class（view=default 单 decl）闸等价 issue E 初衷。
4. **resolveWindowView decl 缺失兼容**：`assertInSurface` 内 `if (!decl) return` —— 无 decl 时不闸（caller 仍能调）保留兼容，但 issue B verified 已强制单视角 class 必须有 default decl，正常路径下 decl 永远命中。这条 fallback 仅防 hot-reload 中间态。
5. **dispatch overhead**：每 exec 多一次 `resolveWindowView` 查（map lookup + array find）+ array includes check——O(decl.object_methods.length) ~ 个位数比较，性能影响可忽略。

## 待裁决点

1. **assertInSurface decl 缺失时是否 fail-loud 还是 fallback 不闸**：倾向**fallback 不闸**（兼容 hot-reload 中间态、单视角 class 必有 default decl 由 issue B cohesion 校验兜底）。
2. **case D 实测覆盖范围**：是否真触发 super flow 完整副作用（commit + PR + reviewer）？倾向**仅 surface 闸通过**、不真执行 reflect（避免 e2e 重型）。
3. **reflect requireSuperSession 双闸门是否退役**：保留作 defense-in-depth（防 dispatch 外路径），不删。

## review 记录

按 design-workflow 步骤 2 fan-out 2 reviewer——executable+thread+readable×executable / 完整性批评官。

### review by executable / thread / readable × executable —— LGTM + 关键补全

- **方向 (a) 闸 view 强支持**：上轮 issue K 时本 reviewer 揭出此 leak、(b) 等于承认上轮 review 失效；零回归 + method 三类一致 + fail-loud > silent miss。
- **assertInSurface helper 放 thread-runtime.ts 私有**（YAGNI、分层清晰、查表归 registry/策略归 dispatch）。
- **decl 缺失 fallback 不闸 + 加 dev-mode warn**：survey 建议合理，issue B verified 单视角 cohesion 校验已挡正常路径、fallback 仅防 hot-reload 中间态；加 warn 防 silent allow 隐患（与 issue M 自陈 fail-loud 哲学呼应）。
- **reflect requireSuperSession 双闸门保留 + thread.self.md 明文化双闸门关系**：surface 闸前置 + ctx 闸后置 = defense-in-depth；避免后续 reviewer 反复问「是否冗余」。
- **case 测试设计**：A/B/C/D 覆盖矩阵合理；**补 case E** 留 reflectable followup（caller 持 super-view ref 但 ctx.sessionId 业务 session 调 reflect → surface 闸通过 + requireSuperSession fail）——不在本 issue scope。
- **case D 显式构造 super-session**：mock `thread.sessionId = SUPER_SESSION_ID` 或 stub method.exec 为 no-op，确保断言锚在 surface 闸而非 requireSuperSession。
- **`runtime.callMethod` / `runRoute` / `execGuide` 连带 leak 必查**（h.1 关键）：method 间互调路径是否走 ThreadRuntime.exec 同一入口？若不走则是 method.public 退役契约第二个 leak。落地前 grep 必做。
- **storybook tier-A 隐式假设排查**（h.2）：grep `packages/@ooc/storybook/` 内 runtime.exec 路径有无 caller 持 default-view ref 调 self surface 假设——落地前必做。
- **method_exec_form default decl surface 完整性**（h.3）：form 自己注册 `refine` / `submit`，form 的 default decl 必须含两个 method 名——落地前 grep 确认。
- **index.md `## readable × executable` 节加 "dispatch 闸 surface invariant" 明文条目**——契约硬要求，防未来添新 method 类重蹈本 issue 覆辙。
- **executable.self.md 迁移映射段加 issue M 兑现注释**——method.public 退役条目末加「dispatch 层 surface 闸由 issue M 兑现」对仗。

### review by completeness critic — Issue M —— 漏列 3 处 + 改动 1 越界 + fallback warn

- **必补受影响元素**：`## readable`（B 区，surface 物理寄居 readable.window）/ `## reflectable`（B 区，reflect 4 method 闸点变化、双闸门退化为冗余）/ `## executable × thinkable`（D 区，exec 原语 dispatch 语义变化）。建议作 wider check 加 `## thinkable`（弱波及、tool call 失败事件折入形态变）。
- **改动 1 TS 实施代码越界**：issue 内嵌 ~50 行完整 TS 实现属实施层——保留以便落地者参考、但 self.md 回流时只写契约 + 签名片段。**采纳**作 落地阶段约束。
- **assertInSurface fallback 加 dev-mode warn**（与 executable reviewer 一致）：避免 silent allow 与本 issue 自陈 fail-loud 哲学相左。
- **case D 待裁决点 2** 拍板：仅 surface 闸通过、不真触 reflect 副作用（mock ctx.sessionId=SUPER 但 stub method.exec / requireSuperSession 不阻塞）。
- **行号锚定准确**（thread-runtime.ts:125-145 / object-registry.ts:236,249,269 / executable.ts:128-134 / readable.ts:64-69）—— 全 verified。
- **术语「surface」** 建议补入 `knowledge/ooc-glossary.md` 防后续语用漂移——本 issue 内文档回流顺手补。

## 裁决

**采纳全部改动 + 6 项关键补全**。

### 核心裁决

1. **改动 1 thread-runtime.exec 闸 object/guide method view（保留）**：
   - 新增 `assertInSurface(ref, methodName, kind: "object" | "guide")` 私有 helper。
   - decl 缺失 fallback **不闸 + 加 dev-mode `console.warn`**（与 thread/readable/index.ts:108-110 同 pattern）。
   - dispatch 链 object/guide method 命中后追加 `this.assertInSurface(ref, methodName, "object" | "guide")` 调用。
   - 错误文案统一：`[exec] method "X" not in surface of view "Y" on class Z`。

2. **改动 2 reflect requireSuperSession 双闸门保留**（defense-in-depth）：
   - 不删既有 requireSuperSession 调用。
   - thread.self.md / reflectable.self.md 加注双闸门关系（surface 闸前置 + ctx 闸后置）。

3. **改动 3 测试（A/B/C/D 四 case）**：
   - **case A**: caller default-view thread ref 调 reply → throw surface not-in 文案。
   - **case B**: caller default-view thread ref 调 say（在 default surface）→ 成功。
   - **case C**: 业务 session default-view thread ref 调 scan_changes（仅 super surface）→ throw。
   - **case D**: super-view thread ref（window_view="super"）调 set_transcript_window —— surface 闸通过；mock thread.sessionId=SUPER 避免 requireSuperSession 阻塞、stub method.exec no-op。
   - **case E 拆 reflectable followup**：caller 持 super-view ref 但 ctx.sessionId 业务 session 调 reflect → 双闸门 defense-in-depth 回归覆盖。

4. **改动 4 method.public 退役注释 + executable.self.md 兑现度更新**：
   - core/types/executable.ts:128-134 注释加 issue M 兑现度。
   - executable/self.md 迁移映射段加「dispatch 层 surface 白名单闸由 issue M 兑现」对仗。
   - **index.md `## readable × executable` 节加 "dispatch 闸 surface invariant" 明文条目**（method 三类一致按 view 闸）。

5. **改动 5 落地前必须的 4 处 grep 排查**（执行后写入 issue 落地段）：
   - **(i) `runtime.callMethod`**: method 间互调是否走 ThreadRuntime.exec 同一入口？若不走 → method.public 退役契约第二 leak。
   - **(ii) `runRoute`**: form.refine 路径是否走 dispatch？survey 已知 runRoute 不调 exec、只算 intents；不闸 surface 合理。
   - **(iii) `execGuide`**: form.submit 跳 dispatch 直调 guide.exec——issue J 注释明示是有意设计（避递归开 form）；不闸 surface 合理。issue 风险段补一句说明。
   - **(iv) storybook tier-A**: `grep -r 'runtime\.exec' packages/@ooc/storybook/`——确认无 caller 持 default-view ref 调 self surface 假设。
   - **(v) method_exec_form default decl**: form 的 default decl 必须含 `["refine", "submit"]`——确认完整。

6. **受影响设计元素补**：
   - `## readable`（B 区）—— surface 物理寄居 + 单一来源契约兑现。
   - `## reflectable`（B 区）—— reflect 4 method 双闸门关系明文化。
   - `## executable × thinkable`（D 区）—— exec 原语 dispatch 语义统一。
   - 不补 `## thinkable`（弱波及、tool call 错误透传无契约变更）。

7. **术语「surface」入 glossary**：knowledge/ooc-glossary.md 补一条「surface = readable.window decl 内 object_methods/guide_methods/window_methods 列表，决定 LLM 经 view ref 能看到 + 能调到哪些 method」。

8. **改动 1 内 TS 完整代码**保留 issue 内供落地者参考，但**self.md 回流仅写契约 + 签名片段**——本约束强约束落地者。

### 落地步骤（main 直改、无独立 worktree）

1. thread-runtime.ts:118-146 加 assertInSurface helper + dispatch 链 2 处调用。
2. 5 处 grep 排查（runtime.callMethod / runRoute / execGuide / storybook / method_exec_form）—— 把结果写入 issue 落地段。
3. 新增 `tests/dispatch-view-surface-gate.test.ts` 4 case (A/B/C/D)。
4. core/types/executable.ts:128-134 注释更新。
5. `bun run check:tsc` + 全量 `bun test` 干净绿。
6. commit + push（主仓 + meta 同步）。
7. meta 仓 self.md 回流（executable / readable / reflectable / index.md 4 节 + glossary）。

## 落地验收

**verified（2026-06-26）**——改动表面小（~50 行 helper + 2 行 dispatch 链调用 + 4 case 测试），不派独立 verification reviewer，由 supervisor 自验：

**5 处 grep 排查结果**（裁决 5 必做项）：
- **(i) `runtime.callMethod`**：内部 `this.exec(...)` ✅ —— 自动得益于 surface 闸。
- **(ii) `runRoute`**：不调 exec、只算 intents ✅ —— 不闸合理（无 dispatch 副作用）。
- **(iii) `execGuide`**：form.submit 跳 dispatch 直调 guide.exec ✅ —— issue J 有意设计（避递归开 form）、form 内部递归调不构成新越权面。
- **(iv) storybook**：目录不存在（已废）✅。
- **(v) method_exec_form default decl**：`object_methods: ["refine", "submit"]` ✅ 完整。

**改动 1 assertInSurface helper 落地**（thread-runtime.ts:160-182）：
- 私有 helper、(ref, methodName, "object"|"guide") 签名。
- decl 缺失 fallback 不闸 + dev-mode `console.warn`（hot-reload 中间态兼容）。
- 错误文案：`[exec] method "X" not in surface of view "Y" on class Z`。
- dispatch 链 object/guide method 命中后调用（thread-runtime.ts:127, 132）。

**改动 2 reflect requireSuperSession 双闸门保留**——defense-in-depth、未删。

**改动 3 测试 4 case 全绿**（tests/dispatch-view-surface-gate.test.ts）：
- case A（default-view 调 reply）throw ✅
- case B（default-view 调 say）surface 闸过 ✅
- case C（default-view 调 scan_changes）throw（surface 先于 requireSuperSession）✅
- case D（super-view 调 set_transcript_window，issue K+M 联合）✅

**质量门**：tsc 干净、全量回归 126 pass / 0 fail / 363 expect（+4 case vs issue K）。

**Followup**：
- **issue N（reflectable）**：case E reflect requireSuperSession defense-in-depth 回归覆盖（super-view ref 业务 sessionId 调 reflect → surface 通过 + requireSuperSession fail）。
- **glossary**：术语「surface」入 `knowledge/ooc-glossary.md` —— 文档回流任务、不阻塞 verified。
- **meta self.md 回流**：executable.self.md + reflectable.self.md 双闸门关系明文 + index.md `## readable × executable` 加 "dispatch 闸 surface invariant" 条目。

落地 commits：（待 push）。
