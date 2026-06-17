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

1. 唯一行动方式 = 通过 tool 原语与 context window 交互。LLM 改变世界的唯一通道，是通过 tool 原语在 context window 上交互。
2. tool 原语恒为 3 个：
  - exec（在某 window 上调一条 method）
  - close（关一个 window）
  - wait（声明等待某个 context window 的 IO 结果）
3. 可执行的 method 分两类、严格分维：
  - object method 改 object 自身数据、可产副作用（归 executable，本维度）；
  - window method 只调 object 在 context 里的展示态、返回不可变的新 window（归 readable 维度）
  - 二者经同一 exec 入口分派；注册 context window 时保证 window method 与 object method 不会有同名冲突。
  4. 


## executable/index.ts —— object method

object method **可改 object 数据、可产生副作用**。

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
 * object method 定义。
 *
 * - name        : 方法名（dispatch 入口；同 class 内 object/window method 不可重名）
 * - description : LLM 面向的方法描述（必填）
 * - schema      : 可选参数 schema（结构化渲染 + fail-soft 校验）
 * - for_ui_access: 是否可经前端 HTTP API（visible UI）请求（见 object-model 核心 6）
 * - public      : 是否对 peer object 可见可调
 * - for_reflectable: 是否仅在 super flow（反思 session）下 surface
 * - exec        : (ctx, self, args) → 结果文本（或 undefined）；**可改 self、可副作用**
 */
export interface ObjectMethod<Data = any, Args = any> {
  name: string;
  description: string;
  schema?: MethodCallSchema;
  permission?: (args: Record<string, unknown>) => "allow" | "ask" | "deny";
  for_ui_access?: boolean;
  public?: boolean;
  for_reflectable?: boolean;

  intents?: {name: string, description: string}[]
  route?: (ctx: ExecutableContext, self: Data, args: Args) => ObjectMethodIntents;
  exec: (
    ctx: ExecutableContext,
    self: Data,
    args: Args,
  ) => Promise<ObjectMethodResult>;
}

// ObjectMethodIntents
// 类似于现实中我们填写的电子表单
// 要提交行动前，发起一个表单
// 填几个参数，然后给出新的填表项并给出提示，然后继续填，然后继续提示，直到表单填写完毕再提交
// OOC 系统的 Object Method 也支持这个模式，如果 Object Method 定义了 route，那么方法执行时，会先执行 route 取得意图
// 同时在 上下文中，会创建一个 ObjectMethodForm window, 用于显示表单，这个 window 具有 refine 方法用于继续填充调整参数，具有 submit 方法用于提交表单
// route 计算出的 tip 会作为 tool call 结果返回，计算出的 intents 会用于激活关联的知识
export interface ObjectMethodIntents {
  tip?: string,
  intents?: string[] // 从 args 推导的行为意图
  quickSubmit?: boolean // 无需再主动对表单执行 submit 方法，立刻执行
}

export interface ObjectMethodResult {
  message?: string;
  data?: any;
  err?: string
}
```

### 填表式渐进式执行

OOC Object 的 Object Method 支持渐进式执行

类似于现实中我们填写的电子表单
要提交行动前，发起一个表单
填几个参数，然后给出新的填表项并给出提示，然后继续填，然后继续提示，直到表单填写完毕再提交

example:
```ts
import type { ExecutableContext, ObjectMethod } from "<runtime>/executable";
import type { Data } from "../types.js";

const appendMethod: ObjectMethod = {
  name: 'CreateOrUpdate',
  description: "create or update record.",
  schema: { 
    content: { type: "string", required: true, description: "record content" },
    id: { type: "string", required: false, description: "record id" },
  },
  intents: [
    {name:"create", description: "create record"},
    {name: "update", description: "update record"},
  ],
  route: async(ctx: ExecutableContext, self: Data, args: any) => {
    if (args.arg1 == "" && args.arg2 == "") {
      return {
        tip: "需要补充参数 content，可选参数 id, 留空表示新建，非空表示更新",
        intents: [], 
      }
    }

    if (args.id == "") {
      return {
        intents: ["create"], 
      }
    } else {
      return {
        intents: ["update"], 
      }
    }    
  },
  exec: async(ctx: ExecutableContext, self: Data, args: any) => {
    if (args.content == "") {
      return {
        err: "content 为空，无法创建或更新"
      }
    }
    
    if (args.id == "") {
      return {
        message: "record created",
        data: { ok: true },
      }
    }
    
    return {
      message: `record updated`,
      data: { ok: true },
    }
  },
};
```
