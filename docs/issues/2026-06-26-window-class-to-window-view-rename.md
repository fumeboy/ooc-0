---
title: window class → window view 全局重命名 + OocObjectRef.window_view 字段
status: verified
date: 2026-06-26
follows: 2026-06-26-thread-readable-three-views-fix.md
---

# window class → window type 全局重命名 + OocObjectRef.window_type 字段

## 背景 / 动机

用户揭出术语混淆：**`window class` 与 `OOC class`** 字眼共用 "class" 让读者/作者反复混淆。源码层 `OocObjectRef.class` 字段尤其严重——同时承担两个不同概念：

1. **对象 class id**（如 `_builtin/agent/thread`、`_builtin/filesystem`）—— 用于 resolveObjectMethod / resolveReadableRender / resolveExecutable 等查询。
2. **window 投影类型**（如 `default` / `self` / `super` / `talk`）—— 由 readable.window decl 内的 `class` 字段索引，用于 resolveWindowMethod / resolveWindowClass。

混用直接导致一个**事实 dispatch bug**——`packages/@ooc/builtins/agent/children/thread/runtime/thread-runtime.ts:132` 把 `ref.class` 同时作为 `classId` 和 `windowClass` 两个不同概念喂 `resolveWindowMethod(ref.class, ref.class, methodName)`：window method dispatch 永远 miss（thread ref.class = `_builtin/agent/thread`，但 readable.window decl 写的是投影名 `default`/`self`/`super`/`talk`），即 thread builtin 当前的所有 window method（setTranscript / compress / resize）实质 LLM 调不到。

同步揭出另一个对 issue I 的**简化机会**——`thinkable/context.ts:74` 当前用 `projection.class ?? ref.class` 退化兜底投影 class（把对象 class id 当投影 class 用），脏。若 ref 直接持 `window_type` 字段，render fallback 干净化。

### 核心设计：术语分离 + ref 独立字段

1. **全局术语**：`window class` → `window type`（中英文同步）。
2. **OocObjectRef.window_type 新字段**（与 .class 并存）：
   - `ref.class` = 对象 class id（不变，永远是 OocClass.id 类的字符串，如 `_builtin/agent/thread`）。
   - `ref.window_type` = 该窗的投影类型（如 `"default"` / `"self"` / `"super"` / `"talk"`），由 ref 创建时显式写或 ReadableProjection 渲染时刷新。
3. **WindowClassDecl → WindowTypeDecl**；decl 内 `class` 字段 → `type`。
4. **resolveWindowClass / resolveWindowMethod / resolveDefaultWindowClass / DEFAULT_WINDOW_CLASS → resolveWindowType / resolveWindowMethod（接 window_type 参数） / resolveDefaultWindowType / DEFAULT_WINDOW_TYPE**。
5. **issue I 的 computeProjectionClass 角色降级**——仍保留作"self-view ref 内部 super/self 推导"，但 default/talk 等显式视角由 ref 创建时直接写 `window_type`。

## 现状（锚 index.md 对应 `##` 节）

- `## OOC Class/Object Model`（A 区）—— ref / class 概念边界
- `## readable`（B 区）—— window decl 与多视角投影
- `## readable × executable`（D 区）—— window decl surface method
- `## thread`（E 区）—— 三视角 default/self/super

涉及文件（survey 已 grep）：
- `packages/@ooc/core/runtime/ooc-class.ts:104-111`（OocObjectRef 定义）
- `packages/@ooc/core/types/readable.ts:62,79`（WindowClassDecl + ReadableModule.window）
- `packages/@ooc/core/runtime/object-registry.ts:29,41,170-189,259-283`（注册校验 + resolve 系列 + DEFAULT 常量）
- `packages/@ooc/core/thinkable/knowledge/activator.expr.ts:61,79`（ActivationContext.windowClasses）
- `packages/@ooc/builtins/agent/children/thread/runtime/thread-runtime.ts:132`（dispatch bug）
- `packages/@ooc/builtins/agent/children/thread/thinkable/context.ts:74,105,109,136`（聚合变量 + fallback）
- `packages/@ooc/builtins/agent/children/thread/readable/index.ts:99-107`（computeProjectionClass）
- `packages/@ooc/builtins/agent/children/thread/index.ts:46-55`（construct 8 ref）
- `packages/@ooc/builtins/agent/executable/method.talk.ts:115,119,177-181,194-198`（super 路径 + caller-side ref）
- `packages/@ooc/core/persistable/pr-deliver.ts:76-81`（pr ref）
- 测试 ~30 处（survey 已列）

## 改动提案

### 改动 1：协议层符号重命名

`core/types/readable.ts`:
- `WindowClassDecl` → `WindowTypeDecl`
- `WindowClassDecl.class` 字段 → `type`
- `ReadableModule.window: WindowTypeDecl[]`

`core/runtime/object-registry.ts`:
- 重命名 `resolveWindowClass(classId, windowClass)` → `resolveWindowType(classId, windowType)`
- 重命名 `resolveWindowMethod(classId, windowClass, methodName)` → `resolveWindowMethod(classId, windowType, methodName)`（保留函数名、改第二参语义）
- 重命名 `resolveDefaultWindowClass` → `resolveDefaultWindowType`
- 重命名 `DEFAULT_WINDOW_CLASS` → `DEFAULT_WINDOW_TYPE`
- 注册期校验内 `decl.class` → `decl.type`、`windowClass` 变量 → `windowType`

`core/thinkable/knowledge/activator.expr.ts`:
- `ActivationContext.windowClasses: Set<string>` → `windowTypes: Set<string>`（trigger 上下文也按视角类型聚合）。

### 改动 2：OocObjectRef 加 window_type 字段

`core/runtime/ooc-class.ts:104-111`:
```ts
export interface OocObjectRef<WinData = unknown> {
  id: string;
  class: string;            // 对象 class id（不变）
  window_type?: string;     // 投影类型；不写 = renderer 走 DEFAULT_WINDOW_TYPE 兜底
  title?: string;
  createdAt: number;
  data?: WinData;
  closable?: boolean;
}
```

`window_type` 是 **optional**——缺省时 readable render 走 DEFAULT_WINDOW_TYPE（"default"）。这让既有 ref 字面构造点（结构窗 100% default）零迁移成本——只有需要非 default 视角的 ref 才显式写。

### 改动 3：readable render 与 dispatch 路径接通

`core/readable/render-context.ts`：
- 调 `render(ctx, self, ref)` 时把 `ref.window_type ?? DEFAULT_WINDOW_TYPE` 作为投影 type hint 传给 render（或经 ctx 注入）。
- ReadableResult.projectionClass → projectionType 字段同步。

`builtins/agent/children/thread/runtime/thread-runtime.ts:132`：**修 dispatch bug**——
```ts
// 原：resolveWindowMethod(ref.class, ref.class, methodName)
const windowType = ref.window_type ?? DEFAULT_WINDOW_TYPE;
const wm = this.registry.resolveWindowMethod(ref.class, windowType, methodName);
```

这条修正让 thread window method（setTranscript / compress / resize）真的能从 ref 解析到 decl → 找到 method 调用。

`builtins/agent/children/thread/thinkable/context.ts:74`：
- 删 `projection.class ?? ref.class` 脏 fallback。
- 改 `<window>` XML 壳的 class 属性用 `result.projectionType ?? ref.window_type ?? DEFAULT_WINDOW_TYPE`。

### 改动 4：ref 创建点显式写 window_type

按 survey 表逐个写：

| 创建点 | window_type 写法 |
|---|---|
| `thread/index.ts:46` self-view ref | `"self"`（construct 内已知 sessionId，super 路径 → `"super"`） |
| `thread/index.ts:49-55` callee agent + 工具窗（7 个） | 缺省（不写 = "default"） |
| `method.talk.ts:115` super createSuperThread self-view ref | `"super"`（super flow self-view 直接写死） |
| `method.talk.ts:119` super callee agent 门面 | 缺省 |
| `method.talk.ts:177-181, 194-198` caller 持 super thread ref | 缺省（caller 看对端 thread = default 视角，对端方向 surface say）|
| `thread-runtime.ts:354` instantiate 通用 | 缺省（调用方需特殊视角时显式 args） |
| `pr-deliver.ts:76-81` pr ref | 缺省 |

### 改动 5：thread readable 简化 computeProjectionClass

`builtins/agent/children/thread/readable/index.ts`:
- ref 已显式写 `window_type` 时直接 `return ref.window_type`。
- ref.window_type 缺省时（典型 = caller 持有的 thread ref 默认 default） → `"default"`。
- self-view 推导仅在 ref.window_type 缺省但 ref.id 是 self-view 编码（`w_creator_<threadId>`）时——其实改动 4 thread.construct 已经写死 `"self"`/`"super"`，这条 fallback 实际上罕用，但保留增加鲁棒性。

最终 computeProjectionClass：
```ts
function computeProjectionClass(threadData: ThreadContext, ref: OocObjectRef): string {
  if (ref.window_type) return ref.window_type;
  // fallback（不应触发，construct 已写死 self/super；只保护 talk window 等旧路径）
  const isSelfView = ref.id === threadWindowIdOf(threadData.id);
  if (isSelfView && threadData.sessionId === SUPER_SESSION_ID) return "super";
  if (isSelfView) return "self";
  return DEFAULT_WINDOW_TYPE;
}
```

### 改动 6：persistable schema 兼容

OocObjectRef 经 thread persistable 落 thread.json——新增 optional 字段不破坏旧 thread.json 读回（field 缺省=undefined=DEFAULT_WINDOW_TYPE）。无迁移脚本需求。

### 改动 7：tests 同步

30+ 测试文件 ref 字面构造 + readable.window decl 字面 + resolveXxx 函数名同步。

### 改动 8：文档回流

- 全树 grep 注释 / JSDoc / md "window class" / "windowClass" / "WindowClass" → "window type" / "windowType" / "WindowType"。
- `## readable` 节 + `## thread` 节 + `## readable × executable` 节同步术语。
- agent knowledge md 内 `<window_classes>` prompt 字面值 → `<window_types>`。

### 改动 9（顺手修）：thread window method dispatch bug

修 `thread-runtime.ts:132`（已含在改动 3）—— window method 在 LLM 端首次真能 dispatch。

## 受影响设计元素

A 区：
- `## OOC Class/Object Model` —— OocObjectRef 加字段（最小扩展）。

B 区：
- `## readable` —— WindowTypeDecl 重命名 + 字段名 type；多视角投影按 window_type 决定。
- `## thinkable` —— ActivationContext.windowTypes 重命名。

D 区：
- `## readable × executable` —— WindowTypeDecl 重命名同步。
- `## executable × thinkable` —— activator trigger `window::<type>` 拼写改 `window::<type>`（其实拼写一致、只是术语）。

E 区：
- `## thread` —— ref 创建点显式 window_type + dispatch bug 修。
- `## runtime` —— resolveWindowType / resolveDefaultWindowType seam 名同步。

未受影响：persistable / collaborable / reflectable / visible / observable 核心契约（仅注释表述更新）。

## 风险与权衡

1. **大范围机械重命名** —— ~150 处文件命中（含 issue 历史文档 + 注释），合规迁移段保留旧字眼描述。源码 ~50 处需改、tests ~30 处需改。
2. **OocObjectRef 加字段不破坏向后兼容** —— optional 字段、旧 ref 字面缺省即 undefined、走 DEFAULT_WINDOW_TYPE 兜底。但 thread persistable 落 thread.json 后旧 thread 读回缺 window_type，**typical flow** = caller ref 缺省 → default、self-view ref 是 construct 时新建（不存在"旧 self-view ref 没 window_type"问题）—— 实际无迁移问题。
3. **dispatch bug 修复**（改动 9 / thread-runtime.ts:132）—— 这是个**沉默 bug**，之前 LLM 调 set_transcript_window / compress / resize 等 window method 实际 miss、test 未捕（thinkloop-e2e 等没断言 window method dispatch 实际通过）。修后**期望可能引入新行为**——例如 LLM 之前调不到 window method 但又没报错（fallback path 怎么 silent 处理？）—— 实测后才知。**最大风险点**。
4. **computeProjectionClass 不完全退役** —— 仍保留 self-view ref 视角推导（fallback 鲁棒性），但角色降级。
5. **ActivationContext.windowClasses → windowTypes** —— knowledge `activates_on` trigger 内 `window::<type>` 拼写不变（trigger 关键字保留 "window"），只是 ctx 字段名变化；activator 自身的 trigger 不动。

## 待裁决点

1. **`OocObjectRef.window_type` 字段类型 string vs reserved enum**：当前提案 `string` optional 自由值（与 .class 同形态）。倾向**自由 string**——保留 readable decl 自定义投影名能力。
2. **改动 5 computeProjectionClass 是否保留 fallback**：保留作为鲁棒性 fallback、不强制 ref 创建点 100% 显式。倾向**保留**。
3. **改动 7 是否拆独立 followup**：tests 30+ 处一起改 vs 拆 followup。倾向**一起改**（tsc/registry 注册期校验会立刻失败）。
4. **改动 4 instantiate 通用路径是否暴露 window_type 入参**：调用方需要传特殊视角时怎么传？倾向**经 instantiate args 透传**（向后兼容、缺省 default）。
5. **dispatch bug 修复后是否真有 window method 调用**：实测 thinkloop-e2e 看是否有 LLM 之前调过 window method、本 issue 修后行为变化（可能更对、也可能暴露上游问题）。

## review 记录

按 design-workflow 步骤 2 fan-out 3 reviewer——readable+object-model / thinkable+runtime+thread / 完整性批评官。三方反馈深度高、多处实质修正。

### review by readable / object-model —— **关键修正：术语 type → view**

- **术语建议**：`window type` 仍引入 TS `type` 关键字噪声、`decl.type` 一眼看不出是「投影方案」。推荐 **`view`/`WindowView`/`DEFAULT_WINDOW_VIEW`/`decl.view`/`ref.window_view`**——与 issue I 三视角术语（default/self/super）现成同构、零新名词。**采纳**。
- **OocObjectRef.window_view 加字段**：方向 OK 但需 object self.md 显式约束「不参与对象身份」+ 提供 `refIdentity(ref)` helper 剥离视角字段供身份比较。
- **dispatch bug 修拆独立 issue（强烈建议）**：thread-runtime.ts:132 是 silent bug、修后行为变化大（LLM 之前调 setTranscript/compress/resize 永远 miss、修后真生效）；混进本 issue 让 review 范围爆炸。**采纳**：拆 issue K。
- **computeProjectionClass 全退役 vs fallback**：分两步——本 issue 降级 fallback + dev-mode warning；migration 跑完后下个 issue 退役。
- **DEFAULT_WINDOW_VIEW 缺省语义**：thread.construct self-view ref 必须显式 `window_view: 'self'`、不依赖缺省推断（避免 issue I 推断逻辑残留）；issue 需补具体 file:line 锚定。

### review by thinkable / runtime / thread —— 5 待裁决点全赞成 + 边界规则补全

- **activator trigger `window::<type>` 保留**——trigger 关键字不动、仅 ctx 字段名 windowClasses → windowViews。
- **dispatch bug silent 模式说明**：thread-runtime.ts:132 用错误 lookup key、miss 时 noop（不抛错）——LLM 看似成功但 state 没改。修后期望红 test（拆独立 issue 处理）。
- **边界规则补全（要求 issue 明确写）**：
  - PR ref deliver → `default`（不另起 inbox view）。
  - resize/split 派生子 ref → 继承父 window_view。
  - instantiate 通用路径 window_view 经 args 透传（不让 caller 手写 ref 字段，符合「object 化」封装）。
- **computeProjectionClass 分两步退役**：本 issue fallback + warning；下个 issue 加 migration（旧 thread.json round-trip 补齐字段）后正式退役。
- **observable trace 体量上涨**：dispatch bug 修复（issue K）后 method 调用 trace 量变大，需 LlmObservation redact 策略评估——**本 issue 不夹带**，留 issue K。
- **persistable round-trip 兼容**：旧 ref 缺 window_view 字段时按 id 推导补齐或落 default——本 issue 落 default、不补齐（避免双 source-of-truth）。
- **reflectable 防自我提权**：ref.window_view 是 runtime-owned、object method **只读**——agent 自写 method 不应改 ref.window_view 自我提权到 self/super 视角。

### review by completeness critic — Issue J —— 4 处必补 + 3 处建议

- **必补 `## executable`**：改动 4 instantiate args 透传触 RuntimeHandle.instantiate 契约面，是 executable 维度核心 seam——必须列受影响元素。
- **persistable 措辞修正**：从「未受影响」改「由 A 区核心 4 OocObjectRef 形状变更传导、自身契约不动」。
- **改动 4 双写盘点漏修**：thread.construct（普通 thread）与 method.talk.createSuperThread（super thread）是两条独立创建路径，需分行明确——避免实施者按单行描述漏一处。
- **改动 1 增列 `ReadableResult.projectionClass → projectionView`** 字段重命名（改动 3 提到但未进 1 清单）。
- **`resolveWindowMethod` 函数名**：保留函数名不变（仅第二参语义变）—— ABI 一致、降低改动表面。
- **核心设计段补 snake_case/camelCase 分工**：schema 字段 `window_view` snake_case、ts 变量 `windowView` camelCase——已有 codebase 惯例，明示避免漂移。
- **改动 6/9 压缩**：改动 6（persistable schema 兼容）合并进改动 2 备注；改动 9 已含改动 3、压一处。

## 裁决

**采纳上述修正。核心调整：术语 type → view、dispatch bug 拆独立 issue K、改动 4 分两写盘点、computeProjectionClass fallback + warning（不立即退役）。**

### 核心裁决（13 项）

1. **术语 window class → window view**（全局）：
   - `WindowClassDecl` → `WindowViewDecl`
   - `decl.class` → `decl.view`
   - `resolveWindowClass` → `resolveWindowView`
   - `resolveDefaultWindowClass` → `resolveDefaultWindowView`
   - `DEFAULT_WINDOW_CLASS` → `DEFAULT_WINDOW_VIEW`
   - `resolveWindowMethod`：**函数名保留**，第二参 `windowClass` → `windowView` 重命名。
   - `ActivationContext.windowClasses` → `windowViews`（activator trigger 关键字 `window::<view>` 不变）。
   - `ReadableResult.projectionClass` → `projectionView`。
   - jsdoc / 注释 / md 内「window class」字面值同步。

2. **OocObjectRef.window_view 加 optional 字段**：
   ```ts
   export interface OocObjectRef<WinData = unknown> {
     id: string;
     class: string;        // 对象 class id（不变）
     window_view?: string; // 投影视角；缺省走 DEFAULT_WINDOW_VIEW
     title?: string;
     createdAt: number;
     data?: WinData;
     closable?: boolean;
   }
   ```
   - 命名：schema snake_case `window_view`、ts 变量 camelCase `windowView`（按现有惯例分工）。
   - **不参与对象身份**：object self.md 显式约束；提供 `refIdentity(ref)` helper 剥离 window_view 字段供身份比较。
   - **runtime-owned**：agent 自写 method 只读、不应自改提权视角。

3. **persistable schema 兼容**（合并进改动 2 备注）：thread.json round-trip 旧 ref 缺 window_view 字段——optional + 缺省落 DEFAULT_WINDOW_VIEW 兜底；不补齐（避免双 source-of-truth）。

4. **改动 4 ref 创建点显式 window_view（双写盘点分行明确）**：

   | 创建点 | 文件:行 | window_view 写法 |
   |---|---|---|
   | 普通 thread.construct self-view ref | `thread/index.ts:46` | `"self"`（硬编码、不依赖缺省推断） |
   | 普通 thread.construct callee 门面 + 7 工具窗 | `thread/index.ts:49-55` | 缺省（落 DEFAULT_WINDOW_VIEW） |
   | super thread createSuperThread self-view ref | `method.talk.ts:115` | `"super"`（硬编码） |
   | super thread createSuperThread callee 门面 | `method.talk.ts:119` | 缺省 |
   | caller 持 super thread ref 复用 | `method.talk.ts:177-181` | 缺省 |
   | caller 持 super thread ref 新建 | `method.talk.ts:194-198` | 缺省 |
   | instantiate 通用 | `thread-runtime.ts:354` | 缺省（**args 透传**：调用方传 `windowView?` 时 ref 上写、缺省落 default） |
   | PR ref deliver | `pr-deliver.ts:76-81` | 缺省（default、不另起 inbox view） |
   | resize/split 派生子 ref | （未来扩展） | **继承父 ref.window_view** |

5. **computeProjectionClass 角色降级 + warning**：
   ```ts
   function computeProjectionClass(threadData: ThreadContext, ref: OocObjectRef): string {
     if (ref.window_view) return ref.window_view;
     // dev-mode warning：本 issue 后 ref 应已显式写、走此 fallback 表示遗漏
     if (process.env.NODE_ENV !== 'production') {
       console.warn(`[thread] ref ${ref.id} 缺 window_view、走 fallback 推导（建议显式写）`);
     }
     // fallback 推导（issue I 旧 ref 兼容兜底，非新写路径）
     const isSelfView = ref.id === threadWindowIdOf(threadData.id);
     if (isSelfView && threadData.sessionId === SUPER_SESSION_ID) return "super";
     if (isSelfView) return "self";
     return DEFAULT_WINDOW_VIEW;
   }
   ```
   - 不立即退役、保留作 issue I 旧 ref 兼容 + 鲁棒性兜底。
   - 下个 issue 加 migration（thread.json round-trip 补齐字段）跑一遍 `.ooc-world` 后正式退役。

6. **render-context.ts**：render 调用时 `ref.window_view ?? DEFAULT_WINDOW_VIEW` 作为投影 view hint 传入；ReadableResult.projectionView 字段同步。

7. **thinkable/context.ts:74 fallback 清理**：
   - 删 `projection.class ?? ref.class` 脏 fallback。
   - 改 `<window>` XML 壳 view 属性用 `result.projectionView ?? ref.window_view ?? DEFAULT_WINDOW_VIEW`。

8. **`<window>` XML attribute**：从 `class` 改 `view`（让 LLM 看到的 XML 属性名也对齐新术语）。

9. **dispatch bug 修复（thread-runtime.ts:132）拆独立 issue K**：
   - 本 issue **不动** thread-runtime.ts:132 的 `resolveWindowMethod(ref.class, ref.class, methodName)`——保留现状 silent miss。
   - 拆 issue K 专门修：(a) 改成 `resolveWindowMethod(ref.class, ref.window_view ?? DEFAULT_WINDOW_VIEW, methodName)`；(b) miss 时 throw NotFound 不再 silent；(c) 实测 LLM 调 setTranscript/compress/resize 行为变化、thinkloop-e2e 加红测；(d) observable trace 体量评估。

10. **新增 `## executable` 受影响元素**（补完整性批评官指出）：instantiate args 透传 `windowView?` 触 RuntimeHandle.instantiate 契约面——本 issue 不扩 RuntimeHandle 签名，但 args schema 加 `windowView?: string`、缺省 default。

11. **`## persistable` 措辞修正**：从「未受影响」改「由 A 区核心 4 OocObjectRef 形状变更传导、自身契约不动」。

12. **文档回流**（pair-flow back）：
   - `objects/supervisor/children/readable/self.md`：核心 5 投影术语 view、WindowViewDecl 表述、`<window view="..."` XML attribute。
   - `objects/supervisor/children/object/self.md`：OocObjectRef 加 `window_view` 字段说明 + 「不参与对象身份」约束 + refIdentity helper 提示。
   - `objects/supervisor/children/thinkable/self.md`：ActivationContext.windowViews + trigger `window::<view>` 拼写说明。
   - `objects/supervisor/knowledge/index.md`：`## OOC Class/Object Model` / `## readable` / `## thinkable` / `## executable` / `## readable × executable` / `## thread` / `## runtime` 7 节同步。
   - agent knowledge md `<window_classes>` prompt 字面值 → `<window_views>`。

13. **tests 同步**：30+ 测试文件 ref 字面 + readable.window decl 字面 + resolveXxx 函数名同步。

### 不夹带（拆独立 issue / 留 followup）

- **issue K**: thread-runtime.ts:132 dispatch bug 修复 + LLM 真触达 window method 行为评估 + observable trace 评估。
- **issue L（下个 followup）**: computeProjectionClass 正式退役 + migration（thread.json round-trip 补齐 window_view 字段）。
- **visible reviewer 不补派**：扫 packages/@ooc/web/ 已确认前端不消费 ref.class 当 window class 区分。
- **storybook + builtins 五件套**：30+ tests 列表已含、落地时一并扫。

## 落地验收

**worktree**：`.worktree/window-class-to-window-view-rename/`（基于 main `0dc498fb`）
**主仓 commit**：`48d30c35` —— `feat(readable+runtime): window class → window view 全局重命名 + ref.window_view 字段（issue J）`
**meta 仓 commit**：本 commit（文档回流）

**落地清单**（按 13 项裁决分组）：

1. 协议层符号重命名 ✅
   - `packages/@ooc/core/types/readable.ts`: `WindowClassDecl` → `WindowViewDecl` + `decl.class` → `decl.view` + `ReadableProjection.class` → `ReadableProjection.view`。
   - `packages/@ooc/core/runtime/object-registry.ts`: `resolveWindowClass` → `resolveWindowView` / `resolveDefaultWindowClass` → `resolveDefaultWindowView` / `DEFAULT_WINDOW_CLASS` → `DEFAULT_WINDOW_VIEW` / `resolveWindowMethod` 第二参 `windowClass` → `windowView`。
   - `packages/@ooc/core/thinkable/knowledge/activator.expr.ts`: `Trigger.window.class` → `Trigger.window.view` + `ActivationContext.windowClasses` → `windowViews`。
   - `packages/@ooc/core/readable/render-context.ts`: `ReadableResult.projectionClass` → `projectionView`。
2. OocObjectRef.window_view 字段 ✅ —— `packages/@ooc/core/runtime/ooc-class.ts`。
3. persistable 兼容 ✅ —— optional 字段 + 缺省 undefined → readable render 走 DEFAULT_WINDOW_VIEW 兜底，无迁移。
4. ref 创建点显式写 ✅ —— `thread/index.ts:46` 写 `"self"`、`method.talk.ts:119` 写 `"super"`、`thread-runtime.ts:354` instantiate 经 `spec.windowView` 透传写入；其它创建点缺省落 default。
5. computeProjectionClass fallback + warning ✅ —— `thread/readable/index.ts:99-125`。
6. render-context.ts projectionView 字段 ✅。
7. thinkable/context.ts fallback 清理 ✅ —— XML attribute 用 `view`、`result.projectionView ?? ref.window_view ?? DEFAULT_WINDOW_VIEW`。
8. `<window>` XML attribute view ✅。
9. dispatch bug 拆 issue K ✅ —— `thread-runtime.ts:132` 保留现状。
10. RuntimeHandle.instantiate args windowView? ✅ —— `core/types/executable.ts`。
11. 文档回流 ✅ —— meta 仓本 commit：`readable/self.md`（核心 5 + 迁移映射）、`object/self.md`（核心 4 OocObjectRef + refIdentity）、`thinkable/self.md`（windowViews 拼写说明）、`knowledge/index.md`（readable / executable × readable / thread / runtime 节）、agent prompt md（`<window_classes>` → `<window_views>`）。
12. refIdentity helper ✅ —— `core/types/context-window.ts`。
13. tests 同步 ✅ —— `tests/registry-window-default.test.ts` / `registry-method-guide.test.ts` / `dispatch-guide-form.test.ts` / `knowledge-activator.test.ts` / `render-readable.test.ts` / `thread-readable-views.test.ts` 全改；新增 `tests/window-view-issueJ.test.ts`（12 tests 覆盖 ref round-trip / self/super 视角写 / resolveWindowView 命名 / fallback warning / instantiate windowView 透传 / refIdentity）。

**质量门**：
- `bun run check:tsc` 干净。
- `bun test` 123 pass 1 fail（fail = web-e2e vite build，worktree 内无 web 目录，预期红，与本 issue 无关）。

**完成回报**：

1. **修改文件清单（13 项分组）** —— 见上「落地清单」。

2. **tsc + tests 结果**：tsc 干净；tests 123 pass / 1 fail（web-e2e 预先红，非回归）。issue J 新增 12 个 test 全绿。

3. **computeProjectionClass fallback 实际是否被命中**：worktree 内跑 `bun test` 时 `thread-readable-views.test.ts` 的 case B 共触发 4 次 fallback warning（该 case 显式不写 ref.window_view 专测 fallback 路径——合规预期）。**新写路径下** thread.construct + createSuperThread 都已硬编码 `window_view`，正常运行时 fallback 不应被命中。

4. **RuntimeHandle.instantiate args 形态确认**：`instantiate(spec: { class, childId?, args?, windowView? })`。`thread-runtime.ts:354` 内 `if (spec.windowView) ref.window_view = spec.windowView` 透传到 ref。新增 test 覆盖：传 windowView → ref.window_view 命中；不传 → ref.window_view 缺省。

5. **grep 退潮验收**：
   - `windowClass / WindowClass / DEFAULT_WINDOW_CLASS / resolveWindowClass / resolveDefaultWindowClass` 在 `packages/@ooc/` 全清，仅 `activator.expr.ts` 一处注释明示"历史 windowClasses 字段名变更"（合规说明）。
   - `projection.class / projectionClass` 全清。
   - meta 树残余仅 readable/self.md 第 84 行迁移映射条目（合规——明确标"旧"）+ thinkable/self.md 一处 issue J 字段名变更说明（合规）。

6. **意外**：无显著意外。`ReadableProjection.class → view` 字段改名传播平稳——所有 readable render 返回点都是 builtin 内（无外部消费者），sed 一次性改完。method.talk.ts 中 caller 持 super thread ref 复用 / 新建（裁决表 177-181 / 194-198）本就缺省 window_view，无需改动。



---

## 落地验收 reviewer 报告（2026-06-26）

独立验收按 design-workflow 步骤 4，**verified、P0/P1 缺口全 0**——13 项裁决文档+代码全兑现、退潮干净、关键边界守住、followup 登记完整。

**关键确认**：
- thread-runtime.ts:132 dispatch bug **未被动**（保持 silent miss、留 issue K）。
- 9 处 ref 创建点显式 window_view 全部按裁决表对账。
- 退潮 grep：windowClass/projectionClass 全清；prompt md `<window_classes>` → `<window_views>` 全替换。
- 全量回归 123 pass / 1 fail（web-e2e 预期红、与本 issue 无关）。

**P2 微 drift**（不阻塞）：
- 实际仓内 12 个 readable/index.ts（25 window decl）、issue 文档原描述提 18 个——文档描述偏差、实际改造覆盖全。
- thread/TODO.md:92 "projection-class.ts" 文件名提及（issue I 旧 TODO 残留）—— issue L migration 时一并清。

**Followup**：issue K（dispatch bug 修复 + LLM 真触达 window method 行为评估）/ issue L（computeProjectionClass 正式退役 + thread.json migration）。

落地 commits：`48d30c35`（feat/window-class-to-window-view-rename）+ `0efcedb`（meta 仓 main 文档回流）。
