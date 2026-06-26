# executable — OOC 系统 executable 维度的设计师与工程师

我负责 OOC 的**行动能力维度**。thinkable 让 Object 能思考，executable 让 Object 能进行行动。

## 编辑规范

维护本文须守以下规范，使其长期高内聚、低耦合、不漂移：

1. **单一权威**：所负责的概念模型只定义一处。新增/变更先改本文、再改代码；散落的旧知识吸收进来即删旧文档，不另起平行文档。
2. **四段结构**：① 核心设计（原子原则，逐条编号、一句一条、相互正交）；② 派生设计（核心组合后涌现的能力，不引入新原则）；③ 细节补充（字段/接口/寻址/边界）；④ 模拟推演（把模型放进真实运行时场景，暴露并收敛缺口）。新内容按归属入段，不混段。
3. **高内聚低耦合**：只专注自身设计
4. **描述设计与接口、非实现走查**：讲"是什么/为什么/契约"，不逐函数走查；代码锚点仅在确有必要时给。
5. **精炼标准语言**：一句话能说清不写三句；术语统一。
6. **旧概念单独标注**：与旧实现的差异/迁移放「迁移映射」，明确标"非设计"，不混进核心。
7. **自洽**：任何改动须与全文不矛盾（核心各条之间、核心与派生之间）；发现矛盾先修设计再落文字。

## 核心设计

1. 唯一行动方式 = 通过 tool 原语与 context window 交互。LLM 改变世界的唯一通道,是通过 tool 原语在 context window 上交互。
2. tool 原语恒为 **4 个**（issue 2026-06-26-six-refinements）:
  - **exec**（在某 window 上调一条 method —— 命中 object method 直执行;命中 guide method 跑 route → 据 `quickSubmit` 直 exec / 否则自动开 form;命中 window method 改投影）
  - **close**（关一个 window = 移除对其对象的一个引用;honor 结构窗:`closable===false` 则拒关报错;引用归零触发该对象 `unactive`,机制见 object 模型核心 10）
  - **wait**（声明等待某个 context window 的 IO 结果）
  - **open**（对目标 object 的某 method **不行使 exec**、只开一张 `method_exec_form`,**把 `want`（自然语言意图）写进 form data**;agent 在动手前显式表达「为什么调」,降低误触/掩盖意图的风险）

   open vs exec 决策表:

   | 场景 | 用 |
   |---|---|
   | 单步 method,参数齐、动作低风险 | `exec` 直执行 |
   | guide method,参数未必齐 | `exec`（自动开 form,但 form 不带 want） |
   | 高风险动作 / 跨对象副作用 / 不可逆操作 | `open`（先显式 want、refine、submit） |
   | 想把"为什么调"留在上下文给后续轮自查 | `open` |

3. 可执行的 method 分**两类**、严格分维:
  - **object method**（**单步直执行**）:参数已知、schema 描述形状、`exec` 改 object 自身数据 + 可副作用——归 executable,本维度。
  - **object guide method**（**多步引导**）:参数未必齐全,dispatch 命中即先跑 `route` 算意图:`quickSubmit=true` 直执行;否则自动开 form、用 refine 累积参数、submit 真执行——归 executable,本维度（form 类型实现见 builtin `method_exec_form`）。
  - **window method**:只调 object 在 context 里的展示态、返回不可变的新 window——归 readable 维度。
  - 三者经同一 exec-by-name 入口分派;注册时 method/guide/window method 三侧 name 全集不重名,且各 window decl 的 `object_methods`/`guide_methods` 引用必须在 ExecutableModule 内可解析（注册期 fail-loud）。

4. **方法可见性的唯一来源 = readable.window**（issue E 收口）:method 协议层**不持 `public?` 字段**——某 method 对哪些视角可见、可调,由各 `WindowClassDecl.object_methods[]` / `WindowClassDecl.guide_methods[]` 显式 surface 决定。窗 decl 未列入即不可见、不可调;协议层最小化、可见性策略由 readable 维度托管,跨维度无双权威。


## executable/index.ts —— object method / guide method

executable 维度模块 `default export` 形状：

```ts
export interface ExecutableModule<Data = any> {
  methods: ObjectMethod<Data>[];
  guides?: ObjectGuideMethod<Data>[];   // 多步引导（form 触发）
}
```

### ObjectMethod（单步直执行）

object method **可改 object 数据、可产生副作用**；参数已知，调用即 exec。

example:
```ts
import type { ExecutableContext, ObjectMethod } from "<runtime>/executable";
import type { Data } from "../types.js";

const appendMethod: ObjectMethod = {
  name: 'appendMethod',
  description: "Append a line to the note.",
  schema: { text: { type: "string", required: true, description: "要追加的一行" } },
  exec: async(ctx: ExecutableContext, self: Data, args: any) => {
    self.body = self.body ? `${self.body}\n${args.text}` : String(args.text);
    return {
      message: `appended → ${self.body.length} chars`,
      data: { ok: true },
    }
  },
};
```

接口定义:

```ts
/**
 * object method 定义（单步直执行模板）。
 *
 * - name        : 方法名（dispatch 入口；同 class 内 method/guide/window method 三侧不可重名）
 * - description : LLM 面向的方法描述（必填）
 * - schema      : 可选参数 schema（结构化渲染 + fail-soft 校验）
 * - permission  : 权限谓词（allow / ask / deny）
 * - exec        : (ctx, self, args) → 结果（`ObjectMethodResult` / 裸 string / void）；**可改 self、可副作用**
 *
 * 注：method 不再持 `intents` / `route`——多步引导语义已迁至 `ObjectGuideMethod`。
 *     method 协议层**不再持 `public?`**——方法可见性唯一来源 = readable.window decl（核心 4，issue E）。
 *     method 只管 LLM 侧行动；人机分流移交 visible 维度的 visible/server 模块（ctx 无 thinkloop thread）。
 */
export interface ObjectMethod<Data = any, Args = any> {
  name: string;
  description: string;
  schema?: MethodCallSchema;
  permission?: (args: Record<string, unknown>) => "allow" | "ask" | "deny";
  exec: (
    ctx: ExecutableContext,
    self: Data,
    args: Args,
  ) => ObjectMethodResult | string | void | Promise<ObjectMethodResult | string | void>;
}
```

### ObjectGuideMethod（多步引导）

guide method **服务于「调用即开 form、逐轮 route 澄清意图直至 submit」**。dispatch 命中即跑 `route` 算 `ObjectMethodIntents{tip, intents, quickSubmit}`：

- `quickSubmit=true` ⇒ 参数已齐、直接执行（与单步 method 等价）。
- 否则 ⇒ runtime 自动实例化 `_builtin/agent/method_exec_form` 把 form ref 返给 tool call，agent 后续经 `refine` 累积参数 + 重跑 route 刷新 tip/intents，最后 `submit` 真执行。

接口定义:

```ts
export interface ObjectGuideMethod<Data = any, Args = any> {
  name: string;
  description: string;
  intents: { name: string; description: string }[];      // 该 guide 可能产生的全部意图（必有；静态先验）
  permission?: (args) => "allow" | "ask" | "deny";
  route: (ctx, self, args) => ObjectMethodIntents | Promise<ObjectMethodIntents>;  // 必有
  exec: (ctx, self, args) => ObjectMethodResult | string | void | Promise<...>;
}

// ObjectMethodIntents
// 类似现实中的电子表单：填几个参数、给出新的填表项与提示、继续填，直到可以提交。
// guide.route 算出 intents，runtime 据此决定开 form 还是直接 submit。
// route 计算出的 tip 作为 tool call 结果回灌，intents 用于激活关联 knowledge（见 thinkable `intent::` trigger）。
export interface ObjectMethodIntents {
  tip?: string,
  intents?: string[]
  quickSubmit?: boolean
}

export interface ObjectMethodResult {
  message?: string;
  data?: any;
  err?: string;
  refs?: OocObjectRef[];   // exec 产出的新对象引用（runtime 据此挂窗 / 把 form ref 回给 tool call）
}
```

> **协议字段删除**（issue E 收口）:`ObjectGuideMethod` 不再持 `schema?` —— guide 的总参数空间形态由 `route` 输出的 `ObjectMethodIntents` 在每次迭代中按当下需补的子集动态给出,静态 schema 与 form 渐进语义重复。也**不持 `public?`**（与 ObjectMethod 同源,可见性归 readable.window）。

### 填表式渐进式执行（form）—— guide 触发链

把"一次填齐参数才能执行"变成"渐进填表"，逐轮补齐再提交。像填电子表单——填几项、给出提示与新填项，继续填、继续提示，直到可提交。

- dispatch 入口在 `resolveObjectMethod` 不命中、`resolveObjectGuideMethod` 命中时进入 guide 路径，**先跑 route 算意图**：
  - `quickSubmit=true` ⇒ 直接执行 guide.exec（与单步 method 同路径）。
  - 否则 ⇒ runtime 自动 `instantiate(_builtin/agent/method_exec_form, { targetObjectId, guideName, accumulatedArgs:args, currentTip, currentIntents })`，把 form ref 作为 `refs:[formRef]` 返给 tool call。
- **form 自身是一个对象**（持累积参数 + 填表态），注册两条 object method 供调用：
  - `refine`：把新参数 merge 进累积参数（可多轮），并重跑 guide.route 刷新 `currentTip` / `currentIntents`；执行失败的 form 经 refine 可复活回可提交态。
  - `submit`：经 runtime `execGuide`（**不走 dispatch、跳过 route**）调 guide.exec；成功返回结果、失败把 err 留在 `lastError`、可继续 refine 重试。
- form readable 投影 `context` 段含 `target_object` / `guide` / `accumulated_args` / `current_tip` / `current_intents` / `last_error` 子节点——LLM 看 form 窗即知全貌。
- **route 算出的 `intents` 驱动渐进式知识激活**：所有 form 的 `currentIntents` 合并进 thinkable `ActivationContext.activeIntents`，由 `intent::<name>` trigger 激活关联 knowledge（机制见 thinkable）。phase-1 简化版按全 form 合并；phase-2 按 form objectId 作 source-key 分组替换 + 撤销，避免 form 关后旧 intents 残留。

example（route 据已填参数算意图：缺 `content` 时只回提示不执行；齐了按有无 `id` 分流 create / update）：
```ts
import type { ExecutableContext, ObjectGuideMethod } from "<runtime>/executable";
import type { Data } from "../types.js";

const createOrUpdate: ObjectGuideMethod = {
  name: 'CreateOrUpdate',
  description: "create or update record.",
  schema: {
    content: { type: "string", required: true, description: "record content" },
    id: { type: "string", required: false, description: "record id" },
  },
  intents: [
    { name: "create", description: "create record" },
    { name: "update", description: "update record" },
  ],
  route: async(ctx: ExecutableContext, self: Data, args: any) => {
    if (!args.content) {
      return {
        tip: "需要补充参数 content，可选参数 id, 留空表示新建，非空表示更新",
        intents: [],
      }
    }
    return { intents: args.id ? ["update"] : ["create"] };
  },
  exec: async(ctx: ExecutableContext, self: Data, args: any) => {
    if (!args.content) return { err: "content 为空，无法创建或更新" };
    return args.id
      ? { message: "record updated", data: { ok: true } }
      : { message: "record created", data: { ok: true } };
  },
};
```

## 迁移映射

- 旧 `ObjectMethod.intents` / `ObjectMethod.route` → **删**,迁至独立 `ObjectGuideMethod`（issue 2026-06-26-object-guide-method-split）。method 退回纯「单步直执行」。
- 旧 `ObjectMethod.public` / `ObjectGuideMethod.public` → **删**(issue E)——方法可见性唯一来源 = readable.window decl 白名单。
- 旧 `ObjectGuideMethod.schema` → **删**(issue E)——总参数空间由 route 输出的 ObjectMethodIntents 动态给出,与静态 schema 重复。
- 旧 3 tool 原语 → **4 tool 原语**(issue E)新增 `open`(objectId, methodName, want):不行使 exec、只开 form + 注入 want。
- 旧 `method_exec_form.data.targetMethod` → `guideName`(构造期 alias 兼容旧 `targetMethod` 字段一段时间);旧 `tip`/`intents` → `currentTip`/`currentIntents`;新增 `want?: string`(open 原语注入)。
- runtime `runRoute(targetObjectId, methodName, args)` 签名内部参数名义改 `guideName`——resolve guide 而非 method。新增 `execGuide(targetObjectId, guideName, args)` 给 form.submit **跳过 dispatch** 直调 guide.exec(避开递归开 form);新增 `RuntimeHandle.open(objectId, methodName, want)`。
- WindowClassDecl 加 `guide_methods?: string[]`(与 `object_methods` 平级,注册期同等 fail-loud cohesion 校验)。
- `for_reflectable` 不存于协议层——历史 self.md 描述移除。
