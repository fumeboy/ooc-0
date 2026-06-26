---
title: thread readable 投影修正——default(外人看)/self(自己看)/super(super flow 自看) 三视角
status: verified
date: 2026-06-26
follows: 2026-06-26-scheduler-thinkable-seam.md
---

# thread readable 投影修正：default / self / super 三视角

## 背景 / 动机

issue E 简化 thread readable 投影为 `default` + `super` 二档时**误判**：把 thread 的 self-view（thread 看自己）与 peer-view（caller/对端看 thread）合并到单 `default` 投影、共同 surface `say + reply + end + todo`。

**用户揭出的语义错误**：
- `say` 是 thread 作为 callee **向对端说**的 method——只在**对端视角**（caller 看 thread 作为对话窗）surface。
- `reply / end / todo` 是 thread **对自己**做的 method——只在**自己看自己**视角（thread 自身 thinkloop 里看自身的 self-view 窗）surface。

两者不对称——把它们合并到 default 等于让对端能调 reply/end/todo（语义错误：caller 不应该让 callee 结束自己），让 thread 自己能调 say（语义错误：thread 自己向自己说话）。

OOC 哲学：method 可见性 = readable.window surface 控制（issue E 已确立）；投影 class 应**按观察者视角分**，每视角 surface 该视角能行使的 method 子集。

## 现状（锚 index.md `##` 节）

- `## thread` E 区——thread 多视角投影
- `## readable` B 区核心 5——多视角投影；`## readable × executable` D 区——window decl surface method
- `## collaborable` B 区核心 6——say 的语义边界

涉及文件：
- `packages/@ooc/builtins/agent/children/thread/readable/index.ts`（投影 + window decl）
- `packages/@ooc/builtins/agent/children/thread/index.ts:39-47`（construct contextWindows）
- `packages/@ooc/builtins/agent/executable/method.talk.ts:115`（super thread contextWindows）
- `packages/@ooc/core/types/context-window.ts:38-45`（threadWindowIdOf / isSelfThreadWindow helper——已存在但 readable 未用）
- `.ooc-world-meta/.../children/readable/self.md` + `index.md`（issue E 期间已退役 talk decl 描述需回填）

源码意外发现（survey 已确认）：
- thread.construct 写 `{ id: calleeObjectId, class: "self", ... }` 进 contextWindows——`class:"self"` 是字面写但**没有任何注册 class 名叫 "self"**；这个 ref 实际指向 callee agent，应该 `class: "_builtin/agent"`（让 agent.readable 接管 self 门面渲染）。属次生 bug，本 issue 顺手修。
- `core/types/context-window.ts` 已存在 `threadWindowIdOf(threadId) = "w_creator_<threadId>"` + `isSelfThreadWindow(id)` helper，但 thread.construct 没创建 self-view ref（thread 自己 contextWindows 里没自身 self-view 引用）。TODO.md 计划的「id 派生 self/other 判别」未落地。

## 改动提案

### 改动 1：三视角投影 default / self / super

`thread/readable/index.ts` `window` 数组三 decl：

```ts
window: [
  {
    // default —— 对端视角（caller / peer 看 thread 作为对话窗）
    class: "default",
    object_methods: ["say"],
    window_methods: [setTranscript, compress, resize],
  },
  {
    // self —— thread 自己看自己（self-view 窗）
    class: "self",
    object_methods: ["reply", "end", "todo"],
    window_methods: [setTranscript, compress, resize],
  },
  {
    // super —— super flow self-view（self 视角扩 reflect 系 method）
    class: "super",
    object_methods: [
      "reply", "end", "todo",
      "scan_changes", "create_pr_for_versioned",
      "sediment_unversioned", "create_pr_for_class_edits",
    ],
    window_methods: [setTranscript, compress, resize],
  },
]
```

### 改动 2：computeProjectionClass 三档判定

```ts
function computeProjectionClass(
  threadData: ThreadContext,
  ref: OocObjectRef,
): string {
  const isSelfView = ref.id === threadWindowIdOf(threadData.id);
  if (isSelfView && threadData.sessionId === SUPER_SESSION_ID) return "super";
  if (isSelfView) return "self";
  return "default";
}
```

readable render 改：

```ts
readable: (_ctx, self, win) => {
  const projectionClass = computeProjectionClass(self.data, win);
  // ...
}
```

注意 readable.readable 的 `ctx` 不持渲染请求方信息，但 `win` 是 OocObjectRef（即被渲的 ref 自身），用 `win.id` 与 `threadWindowIdOf(self.data.id)` 比对——self-view ref 的 id = `w_creator_<threadId>`、peer-view ref 的 id 是别的（caller 持有的 ref id 是另一套）。

### 改动 3：thread.construct 加 self-view ref

`thread/index.ts:39-47`：
```ts
contextWindows: [
  // thread 自己的 self-view ref（self 视角看自身）
  {
    id: threadWindowIdOf(threadId),
    class: "_builtin/agent/thread",  // 自身 class，触发 thread.readable 投影 self
    createdAt: Date.now(),
    closable: false,
  },
  // callee agent 的 self 门面窗（agent.readable 渲身份）
  {
    id: args.calleeObjectId as string,
    class: "_builtin/agent",  // 修：原 "self" 字面是 bug
    createdAt: Date.now(),
    closable: false,
  },
  // ... 其它 builtin 工具窗
],
```

类似地修 `method.talk.ts:115` super thread.construct 的 contextWindows。

### 改动 4：method.talk.ts super 路径同步 + caller 持 thread ref

caller agent 调 talk 创建对端 thread 后，caller 自己的 contextWindows 需挂一个对该 thread 的 ref（class=`_builtin/agent/thread`，id=对端 threadId）——这个 ref **不是** self-view（id 不是 `w_creator_<threadId>`），所以会投影 `default`，surface `say`——caller 经此 ref 调 `say` 向对端发消息。**这是 collaborable say 的正确路径**。

实测当前 talk 是否已挂此 ref——可能需补。

### 改动 5：method.say.ts / reply.ts 调用方约束（无代码改动、文档明示）

- `say` 现在只在 default 窗（caller 调）被命中——逻辑上 `from: "caller"`（caller 发起）。
- `reply` 现在只在 self/super 窗（thread 自己调）被命中——逻辑上 `from: "callee"`。
- 这与现有实现一致（method.say.ts:30 `from: "caller"`，reply.ts `from: "callee"`），但 readable surface 修后才真正生效——之前 default 同时 surface 两者、caller/callee 都能错调。

### 改动 6：transcript 渲染——保持单 transcript + author prefix

readable render 内 transcript 渲染**不变**——单 transcript 模型仍按 `m.from === "caller" ? "[caller:]" : "[callee:]"` 渲。各视角看 transcript 内容相同，只是 surface method 集不同。

### 改动 7：文档回流

- `## thread` E 区：三视角描述更新（default 对端 / self 自己 / super 反思扩 self）。
- `## collaborable` 核心 6：「say 写入本 transcript 后唤醒对端 session」措辞保持，加注「say 仅在 default 窗 surface（对端视角），reply 仅在 self/super 窗 surface（自看视角）」。
- thread/readable/index.ts 文件头注释更新。

## 受影响设计元素

- `## thread`（投影 class 重新 3 档）
- `## readable`（多视角投影核心 5 兑现度）
- `## readable × executable`（每视角 surface method 子集）
- `## collaborable`（say/reply 方向语义与 surface 对齐）

未受影响：thinkable / executable / persistable / runtime / reflectable 协议层（仅 reflect method 的 surface 位置由 super 投影 surface 不变）。

## 风险与权衡

1. **issue E 已 verified 又改投影 class 数量** —— 这是修语义 bug，不是设计反复。承认 issue E 当时的"二投影简化"做错了。
2. **`win.id` 用作 self-view 判据需 thread.construct 真正注入 self-view ref**（改动 3）——否则 win.id 永远不是 `w_creator_<threadId>`，所有渲染都走 default。改动 3 是 1+2 的前置。
3. **`{ id: calleeObjectId, class: "self" }` bug 修复**——`class:"self"` 字面值在 class registry 内无注册，当前应该走 placeholder fallback（survey 揭示 renderReadable 档 3）。改 `class: "_builtin/agent"` 后正确触发 agent.readable 渲身份。**这是次生 bug，本 issue 顺手清**。
4. **caller 侧的 thread ref**（改动 4）——needs survey 实测当前 talk 是否已挂；如未挂、本 issue 应补。
5. **现有 tests 可能依赖旧 default surface 含 reply/end/todo**——dispatch 路径需重测，可能需 tests 更新。

## 待裁决点

1. **self vs super 是否需要"super 包含 self"建模**：当前提案 super decl 平铺 self 的 3 method + 4 reflect method = 7 method。是否值得引入 decl 继承？倾向**不引入**（OOC 协议层无继承机制），平铺接受。
2. **改动 4 caller thread ref**：实测后决定是否本 issue 包含或独立 issue。
3. **`class:"self"` bug 修复**：本 issue 顺手 vs 独立 issue。倾向**顺手**——它与 self-view 投影逻辑直接相关、不顺手修后续读者读 `class:"self"` 还以为是某个 readable 视角名。

## review 记录

按 design-workflow 步骤 2 轻量 fan-out 2 reviewer（readable+thread+collaborable / executable+runtime）。**两 reviewer 共揭关键 blocker：**

### review by readable / thread / collaborable —— 方向正确、3 处关键建议

- **三视角语义正确**：default(对端看)/self(自己看)/super(self+reflect) 与 collaborable 核心 6/7 一致。
- **super 包含 self 全集**：surface = reply + end + todo + 4 reflect method（非"替换"）。
- **`class:"self"` 字面 bug 是 issue E 前遗留**：无任何注册（class registry 0 命中）；改 `_builtin/agent/thread`（不是 `_builtin/agent`——issue 原稿写错，self-view ref 指向 thread 自己、不是 agent；agent 的 self 门面窗已是另一条 ref `{ id: calleeObjectId, class: "_builtin/agent" }`）。
- **改动 4 caller 持对端 thread ref 必须包含本 issue**：collaborable 闭环（caller 经 ref 调 say）的必要动作，与改动 1-3 同源。
- **self-ref 物理 vs 虚拟**：建议**虚拟派生**（readable 渲时按 id 派生 self-view、不进 contextWindows 物理存储）以避免 GC/dispatch 隐患——但虚拟派生与"contextWindows 是 ref source-of-truth"哲学冲突；采用**物理写入 + 配套 GC 过滤**更干净。
- **issue E 关系**：issue E 内容渲染（按 author 渲 prefix）保留，本 issue 在其上增加 surface 投影层；两者正交。

### review by executable / runtime —— blocker：refcount 自指必须过滤

- **关键 blocker**：改动 3 thread.construct 加 self-view ref 进自身 contextWindows 后，computeRefcount 会把 self-ref 计入 → thread 永远 refcount ≥1 → issue G 的 unactive GC 完全失效。
- **修复必须配套本 issue 落地**：`packages/@ooc/core/runtime/refcount.ts` 加 self-ref 过滤——通用 guard「引用者 inst.id === 被算 targetId 时跳过自指边」（不限 thread，对所有 class 一致）。
- **scheduler dispatch 不受影响**：scheduler 经 `iterateSessionObjectTable` 扫 inst.class、不读 contextWindows——OK。
- **method dispatch 不受影响**：LLM tool call `exec(window_id=w_creator_<threadId>, method=reply)` 经 ThreadRuntime 查窗 → resolveObjectMethod → 调 reply method，路径完整。
- **persistable 影响**：thread.json schema 写入 self-view ref 是合法的 contextWindows entry；cold-load 后 refcount 行为依赖 (a) guard 落地。
- **observable trace**：self-view 渲染会让 thinkloop trace 多出 self.md 全文 dump、体积膨胀——非阻塞、留观察。

## 裁决

**采纳改动 1-5 + 配套 refcount guard + caller 持对端 ref 包含本 issue。**

### 核心裁决

1. **三视角投影 default / self / super**（surface 按视角分集，内容渲染保持单 transcript + author prefix）。

2. **super 视角 = self 全集 + 4 reflect method**（继承 self 不替换；OOC 协议层无 decl 继承机制，平铺 7 method）。

3. **改动 3 self-view ref 物理注入 + 配套 refcount self-ref 过滤**（必须同 PR 落地）：
   - `thread/index.ts` construct 加 `{ id: threadWindowIdOf(threadId), class: "_builtin/agent/thread", closable: false, createdAt: Date.now() }` 进 contextWindows 首位。
   - `method.talk.ts` super 路径 createSuperThread 同步加 self-view ref。
   - **配套 `core/runtime/refcount.ts` 加通用 self-ref 过滤**：
     ```ts
     for (const inst of iterObjects(table)) {
       if (inst.id === targetObjectId) continue;  // skip self-ref edges
       const refs = thinkable?.refs?.(inst.data) ?? [];
       count += refs.filter(r => r.id === targetObjectId).length;
     }
     ```
   - 同步注释 + persistable / runtime self.md 加 self-ref 语义说明。

4. **`class:"self"` 字面 bug 修复**（顺手清）：thread.construct + method.talk.ts 的 callee agent ref `{ id: calleeObjectId, class: "self" }` → `{ id: calleeObjectId, class: "_builtin/agent" }`。这是 callee agent 的 self 门面窗（agent.readable 渲身份），class 应是 agent 注册 class、不是字面 "self"。

5. **改动 4 caller 持对端 thread ref（纳入本 issue）**：
   - 现状实测：survey method.talk.ts 当前 caller 侧路径——peer 创建对端 thread 后，是否挂 thread ref 进 caller.contextWindows？
   - 若未挂——本 issue 补：talk method exec 末尾 push `{ id: targetThreadId, class: "_builtin/agent/thread", closable: false, createdAt: Date.now() }` 进 caller(self).contextWindows。caller 经此 ref 调 say（投影 default、surface say）。
   - 若已挂——确认 class/closable 字段正确，可能仍需修。

6. **computeProjectionClass 三档**：
   ```ts
   function computeProjectionClass(threadData: ThreadContext, ref: OocObjectRef): string {
     const isSelfView = ref.id === threadWindowIdOf(threadData.id);
     if (isSelfView && threadData.sessionId === SUPER_SESSION_ID) return "super";
     if (isSelfView) return "self";
     return "default";
   }
   ```

7. **method 鲁棒性快检**（落地前必做）：grep `executable/method.*.ts` 确认无"调用者 ≠ self thread"的隐式假设；method.say / reply 调用者无关、OK。

8. **新增受影响设计元素**：`## runtime`（refcount.ts 加 self-ref guard）+ `## persistable`（thread.json schema 写入 self-view ref）；observable 影响留观察、不在本 issue scope。

9. **tests**：扩 `tests/thread-scheduling.test.ts` 或新增 `tests/thread-readable-views.test.ts`：
   - case A: thread.contextWindows 内 self-view ref 存在 + id 形如 `w_creator_<threadId>`。
   - case B: computeProjectionClass 三档分别命中 default/self/super。
   - case C: refcount 自指 ref 不计入（thread.contextWindows 含 self-ref 但 computeRefcount(sessionId, threadId) 返 0 当无外部引用）。
   - case D: dispatch reply 经 self-view ref id 触发 → resolveObjectMethod 命中 → exec。

10. **文档回流**：thread/readable/index.ts 文件头注释 + `## thread` E 区 + `## readable` 核心 5 兑现 + `## collaborable` 核心 6 注解。

### 不夹带

- visible 前端 self-view UI 表现（self.md 全文 dump）—— followup。
- observable trace 膨胀 dedup —— followup（影响小、留观察）。
- callee 反向持 caller ref（双向引用）—— followup（本轮单向已满足 collaborable 闭环）。

## 落地验收

worktree: `.worktree/thread-readable-three-views-fix`(基 main `2d099380`)

### 修改文件清单

**裁决 1（三视角 + computeProjectionClass 三档）**：
- `packages/@ooc/builtins/agent/children/thread/readable/index.ts` —— 重写 window decl 为 default/self/super 三档,新增 `computeProjectionClass(threadData, ref)` 三档判定（export 供测试），import `threadWindowIdOf`，文件头注释改写。

**裁决 2-3（thread.construct + method.talk.ts super 路径加 self-view ref + 修 class:"self" bug）**：
- `packages/@ooc/builtins/agent/children/thread/index.ts` —— construct 在 contextWindows 首位 push self-view ref（id=`threadWindowIdOf(threadId)`,class=`_builtin/agent/thread`），callee agent ref class 由字面 `"self"` 改为 `"_builtin/agent"`。
- `packages/@ooc/builtins/agent/executable/method.talk.ts` —— super 路径 createSuperThread 内 contextWindows 同步加 self-view ref + 修 callee `class:"self"` → `"_builtin/agent"`，import `threadWindowIdOf`。

**裁决 4（refcount self-ref guard）**：
- `packages/@ooc/core/runtime/refcount.ts` —— computeRefcount 遍历时 `if (inst.id === objectId) return;` 跳过自指 inst；JSDoc 文件头与函数注释补 self-ref guard 语义。

**裁决 5（caller 持对端 thread ref）**：
- 普通 talk 路径(`method.talk.ts` 末尾 `ctx.runtime.instantiate`)经 ThreadRuntime.instantiate 内 `this.thread.contextWindows.push(ref)` **已自动挂**对端 thread ref 进调用者 thread 的 contextWindows——无需改动。
- super 路径跨 session：caller 与 super-thread 不在同一 session 表内，挂进 caller-thread.contextWindows 不会被 resolve（getObject 跨 session 不通），改用 `superThreadRef` 字段做幂等键；本 issue 不补 super 路径的 caller-side ref。

**裁决 6（computeProjectionClass）**：合并入裁决 1。

**self-view ref resolve 配套**（落地中浮现，参见"意外"段）：
- `packages/@ooc/builtins/agent/children/thread/runtime/thread-runtime.ts` —— `objectDataOf(ref)` 内对 self-view ref（`isSelfThreadWindow(ref.id) && ref.id === threadWindowIdOf(thread.id)`）短路返 `this.thread`；execObjectMethod / execGuideMethod 内 `instance?.data ?? {}` 改用 `this.objectDataOf(ref) ?? {}` 统一路径，import `isSelfThreadWindow / threadWindowIdOf`。
- `packages/@ooc/builtins/agent/children/thread/thinkable/context.ts` —— `renderWindow(ref, registry, thread)` 增 thread 参数；对 self-view ref 短路直调本 thread `readable.readable(thread, ref)`，跳过 renderReadable 的 inst lookup（避免 self-view id 在 session 表无对应 inst 导致 data 空）。

**裁决 9（tests）**：
- `packages/@ooc/tests/thread-readable-views.test.ts` —— 新增,覆盖 case A/B/C/D（11 个 test）。
- `packages/@ooc/tests/registry-window-default.test.ts` —— 更新 thread window decl 断言（default 仅 say、self 含 reply/end/todo、super 加 reflect method）。

**裁决 10（文档回流，独立 commit 进 meta 仓）**：
- `.ooc-world-meta/.../supervisor/knowledge/index.md`：`## thread` 改写三视角描述 + self-view ref id 编码；`## collaborable` 补 say/reply 方向语义+ surface 闸门校齐；`## readable` 加多视角投影按 surface method 分集（thread 典型例）+ thread 三视角具名；`## runtime` 加 refcount self-ref guard 描述。
- `.ooc-world-meta/.../children/readable/self.md` 核心 5 加多视角按 surface 分集 + thread 三视角具名；样板节更新。
- `.ooc-world-meta/.../children/collaborable/self.md` 核心 6 加 say/reply 方向语义 + surface 闸门校齐。

### 质量门

- `bun run check:tsc`：**OK,干净**。
- 新增 `tests/thread-readable-views.test.ts`：**11 pass / 0 fail**。
- 关键回归 `thread-scheduling.test.ts` + `reflectable-redesign-issue-d.test.ts` + `refcount-gc.test.ts`：**23 pass / 0 fail**。
- 全量 `bun test packages/@ooc/tests/`：**105 pass / 1 fail / 315 expect**——唯一 fail 是 `web-e2e.test.ts`,预先红（vite build failed,与本 issue 无关）。

### grep 验收

- `grep -rn 'class:\s*"self"' packages/@ooc/`：4 处命中均为**注释/文档说明**或 readable.window decl 的 self 投影 class 名（合法），**实际 ref field 上的 `class:"self"` bug 命中 0**。
- `grep -rn 'threadWindowIdOf\|isSelfThreadWindow' packages/@ooc/`：thread/readable + thread/index + method.talk + thread/runtime + thread/thinkable/context 五处使用 helper，符合裁决预期（thread/runtime 与 thinkable/context 是 self-view resolve 配套新增）。

### 意外

落地中发现 **self-view ref 的 id（`w_creator_<threadId>`）与 thread inst id（`threadId`）不同**——session 对象表里没 id 为 `w_creator_<threadId>` 的 inst，导致：
1. **渲染阶段**：`renderReadable` 调 `registry.getObject(ref.id)` 找不到，data 退化为 `{}`,thread.readable.readable 拿到 `self.data.messages = undefined` 报错（thinkloop-e2e 4 个 test 一开始全红）。
2. **dispatch 阶段**：`ThreadRuntime.exec(selfViewId, "reply")` 内 `instance?.data ?? {}` 同样退化,reply method 拿空 data 工作不了。

修法：在 thread builtin 内部对 self-view ref 做**短路解析**——`ThreadRuntime.objectDataOf` 和 `thinkable/context.renderWindow` 内识别 `isSelfThreadWindow(ref.id) && ref.id === threadWindowIdOf(thread.id)` 时直接返/用 thread 自身 data,不走 session 表 lookup。core renderReadable 通用入口保持不变（不知 self-view 概念），特殊语义局限在 thread builtin 内,符合"哪个维度的特殊性归哪里"的原则。

这部分配套未在 issue 提案中显式列出,但**是裁决 3 + 裁决 9 case D 落地的必要前置**——没有它 self-view ref push 进 contextWindows 后 thinkloop 直接挂掉。已在 issue 落地清单段补记。

无其它意外。computeProjectionClass signature 改动（`(sessionId: string) → (threadData: Data, ref: OocObjectRef)`）只在 thread/readable/index.ts 内部 caller,未牵连其它文件,export 后供新测试用。


---

## 落地验收 reviewer 报告

按 design-workflow 步骤 4 独立验收（2026-06-26）。结论：**verified，P0/P1 缺口全 0**——10 项裁决文档+代码全兑现、退潮干净、质量门绿（107 pass / 0 fail）。

self-view 短路解析（thread-runtime + thinkable/context）评为**必要前置而非漂移**：self-view ref id 是窗约定（`w_creator_<threadId>`）、session 表内无对应 inst，core renderReadable 通用 lookup 会落 placeholder；把短路放 thread builtin 内是thread 特殊性归 thread的正确处置，未污染 core。

无 P0/P1 缺口；P2 文档建议（test 文件头加 issue 锚链、JSDoc 风格统一）不阻 verified。

Followup（按裁决留出）：visible self-view UI 表现 / observable trace dedup / 双向引用——独立 issue。
