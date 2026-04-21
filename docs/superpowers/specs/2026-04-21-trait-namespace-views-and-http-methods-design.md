# Trait Namespace、Views 与 HTTP Methods 设计

> 日期：2026-04-21
> 状态：Draft（待 user review）
> 作用范围：kernel/src/trait、kernel/src/thread、kernel/src/server、kernel/web、kernel/traits、library/traits、stones/{supervisor 等}、flows/
> 破坏性变更：是（硬迁移，无兼容层）

---

## 1. 目标

把"对象的自我表达（UI）"和"对象的能力（Trait）"统一到同一套基础设施上，并打通"React 页面 → OOC Object 数据变更 + 线程通知"的回路。

一次性解决四件事：

1. 给 Trait 引入 **namespace**，解决"不同来源同名 trait"的歧义。
2. 把方法调用协议收敛为 **`callMethod(traitId, methodName, args)`**，取消所有扁平 / 嵌套命名方式。
3. 把对象的 UI（原 `ui/`）升级为 **Views**——本质是 `kind: "view"` 的 Trait，拥有独立物理目录和 `frontend.tsx / backend.ts / VIEW.md` 三件套。
4. 新增 HTTP 端点 `POST /api/flows/:sessionId/objects/:name/call_method`，让前端可以调用被对象显式暴露的 `ui_methods`，实现"表单提交 → 改 data → 通知 thread"闭环。
5. 升级 supervisor 的 `reporter` trait：return 时同时产出"报告文档 + 交互报告 View(可选)"，并输出 `[navigate]` 卡片引导用户。

---

## 2. 非目标

- 不引入通用 RPC / IDL / gRPC 等任何新协议层。
- 不引入 iframe 沙箱或 Web Worker 级别的前端隔离（延续当前"对象 UI 可信"假设）。
- 不做权限系统（所有调用均以当前对象自身身份运行）。
- 不对 skill / library index / feishu webhook 等侧面系统做改动。

---

## 3. 哲学依据

| 基因 | 作用 |
|---|---|
| G3 — 能力即自我立法 | Trait 与 View 同构：都是对象"自我声明能做什么"的单元 |
| G6 — 关系即网络 | namespace 把"能力来源"显式为三类：自身 / 内核 / 公共库 |
| G10 — Effect 是对外唯一通道 | HTTP `call_method` 作为"用户 → 对象 data"的 Effect 入口，走统一落盘 + 线程通知 |
| G11 — UI 即自我表达 | Views 让对象的界面与能力共用同一张方法注册表 |
| G13 — 线程树 | UI 触发的方法可以通过 `notifyThread` 向指定线程发送消息 |

---

## 4. 核心概念模型

### 4.1 Trait Namespace

**三个且仅有三个 namespace**：

| Namespace | 物理来源 | 语义 |
|---|---|---|
| `kernel` | `kernel/traits/**` | 内核能力（所有对象共享，由 kernel 提供） |
| `library` | `library/traits/**` | 公共能力库（所有对象可复用的第三方 / 用户共享能力） |
| `self` | `stones/{objectName}/traits/**` + `stones/{objectName}/views/**` | 对象私有的 trait 和 view |

**traitId 格式**：`<namespace>:<name>`

例：
- `kernel:computable`
- `kernel:talkable/ooc_links`
- `library:lark/doc`
- `self:session-kanban`
- `self:report`（view）

**解析规则**：
- TRAIT.md / VIEW.md frontmatter 中写 `namespace: kernel | library | self` 和 `name: <相对路径>`（**显式必填**，不再从物理路径推断）。
- 加载器把 `namespace:name` 组装为 traitId 并作为唯一键。
- 对象引用 trait 时可省略 namespace：`readFile` / `computable.readFile` 不再使用；统一用 `callMethod("computable", "readFile", { path })`。
  - 查找顺序：**`self` → `kernel` → `library`**，取第一个命中。
  - 有重名时：不报错，按顺序返回。

### 4.2 TRAIT.md / VIEW.md 的 frontmatter

```yaml
---
namespace: kernel           # 必填，kernel | library | self 三选一
name: computable            # 必填，namespace 下的相对名（可含 / 分级）
kind: trait                 # 可选，trait | view，默认 trait
type: how_to_interact       # 原有字段保留
when: never                 # 原有字段保留
description: 代码执行能力
command_binding:
  commands: ["program"]
deps: []
---
```

### 4.3 View：`kind: "view"` 的 Trait

物理目录：

```
stones/{name}/views/{viewName}/
├── VIEW.md           ── 同 TRAIT.md 结构，kind: view
├── frontend.tsx      ── 默认导出 React 组件
└── backend.ts        ── 方法注册模块
```

Flow 级 Views 路径：

```
flows/{sid}/objects/{name}/views/{viewName}/
├── VIEW.md
├── frontend.tsx
└── backend.ts
```

View 与普通 Trait 共享：
- 同一个 Loader（区分 `kind` 字段）
- 同一个 MethodRegistry
- 同一套 namespace 和 traitId 规则
- 可声明 `command_binding`（LLM 可像普通 trait 一样激活）

View 独有的：
- `frontend.tsx`（通过 Vite 动态 import 渲染）
- `ui_methods`（专门暴露给前端 HTTP 调用）

### 4.4 方法注册：`llm_methods` vs `ui_methods`

`backend.ts`（View）或 trait 的 `index.ts`（普通 Trait）导出：

```typescript
import type { TraitMethodDef } from "@kernel/types";

export const llm_methods: Record<string, TraitMethodDef> = {
  parseReport: {
    description: "解析一份报告文件，返回结构化摘要",
    params: [
      { name: "path", type: "string", description: "报告文件路径" },
    ],
    fn: async (ctx, { path }) => {
      const content = await Bun.file(path).text();
      return { content };
    },
  },
};

export const ui_methods: Record<string, TraitMethodDef> = {
  submitForm: {
    description: "用户提交表单，写入 data 并通知 thread",
    params: [
      { name: "email", type: "string" },
      { name: "role", type: "string" },
    ],
    fn: async (ctx, { email, role }) => {
      ctx.setData("form.email", email);
      ctx.setData("form.role", role);
      ctx.notifyThread(`[UI] 用户提交了表单：email=${email}, role=${role}`);
      return { ok: true };
    },
  },
};
```

**严格隔离**：

| 调用通道 | 可调用 | 不可调用 |
|---|---|---|
| 沙箱 `callMethod()` | `llm_methods` | `ui_methods` |
| HTTP `/call_method` | `ui_methods`（且必须来自目标对象的 `self:*` view） | `llm_methods`、kernel/library 的任何方法、其他对象的方法 |

### 4.5 统一方法调用协议（沙箱内）

```typescript
// 唯一调用形式
await callMethod(traitId: string, method: string, args: object): Promise<any>

// 例
await callMethod("kernel:computable", "readFile", { path: "foo.md" });
await callMethod("computable", "readFile", { path: "foo.md" });  // 省略 namespace
await callMethod("self:report", "parseReport", { path: "report.md" });
```

**args 永远是对象**。取消：
- 扁平命名（`readFile(...)`）
- 两段式命名（`computable.readFile(...)`）
- 位置参数调用

### 4.6 HTTP `call_method` 端点

```
POST /api/flows/:sessionId/objects/:name/call_method
Content-Type: application/json

{
  "traitId": "self:report",      // 必须 self namespace
  "method": "submitForm",         // 必须在 ui_methods
  "args": { "email": "a@b.c" }
}
```

**响应**：

```json
{
  "success": true,
  "data": {
    "result": { "ok": true }
  }
}
```

**白名单规则（后端强制）**：

1. `traitId` namespace 必须是 `self`。
2. 目标 traitId 必须是 `kind: "view"`（不能用 `self:` 的普通 trait）。
3. method 必须存在于该 view 的 `ui_methods`（不看 `llm_methods`）。
4. 该 view 必须属于参数 `:name` 指向的对象（通过加载路径判断）。

任一校验失败 → 4xx + 明确 error。

**执行语义**：

- 后端注入 MethodContext：`data`（实时视图）、`setData`、`getData`、`print`、`sessionId`、`selfDir`、`rootDir`、`stoneName`、`notifyThread`。
- 方法的 `notifyThread(message, opts?)`：向 sessionId 下当前对象的根线程 inbox 写一条 system 消息，自动复活 done 线程。是否调用完全由方法内部决定。
- 方法返回值原样写回响应 `data.result`。
- 抛错 → 500 + error message。

### 4.7 前端 API

`kernel/web/src/api/client.ts` 新增：

```typescript
export async function callMethod(
  sessionId: string,
  objectName: string,
  traitId: string,
  method: string,
  args: object,
): Promise<any>;
```

`@ooc/api/client` 导出供 `frontend.tsx` 使用。

### 4.8 DynamicUI 改造

- 原 `ooc://ui/{path}` → **`ooc://view/{path}`**（协议级改名）
- 原加载路径：`ui/index.tsx`、`ui/pages/*.tsx` → **统一：`views/{viewName}/frontend.tsx`**
- DynamicUI 组件 props 新增 `{ callMethod }` 绑定（已闭包注入 sessionId + objectName）。
- View 通过 `VIEW.md` 而非路径约定识别（目录下必须有 `VIEW.md` 才是合法 view）。

---

## 5. 源码影响面（硬迁移清单）

### 5.1 Kernel 后端

| 路径 | 改造 |
|---|---|
| `kernel/src/types/trait.ts` | `TraitDefinition` 加 `namespace: "kernel"\|"library"\|"self"`、`kind: "trait"\|"view"`、`llmMethods` / `uiMethods` 两张映射 |
| `kernel/src/trait/loader.ts` | 三源加载 → 显式 namespace 校验；加载 VIEW.md（kind=view）；加载 `index.ts` / `backend.ts` 的 `llm_methods` + `ui_methods` 两张表 |
| `kernel/src/trait/registry.ts` | key 改为 `(traitId, methodName)`；`buildSandboxMethods` 只暴露 `callMethod(traitId, method, args)` 单函数；删除扁平命名和 `traitName.methodName` 两段式；llm/ui 严格分两张表 |
| `kernel/src/trait/activator.ts` | `traitId(trait) = ${namespace}:${name}`；namespace 省略解析走 self→kernel→library |
| `kernel/src/thread/hooks.ts` | `collectCommandTraits` 支持 view |
| `kernel/src/thread/form.ts` | 按 traitId 加载（含 view） |
| `kernel/src/server/server.ts` | 新增 `POST /api/flows/:sid/objects/:name/call_method`；`ooc://ui/` resolver 改为 `ooc://view/` |
| `kernel/src/world/world.ts` | 可能需要暴露 "向线程 inbox 写消息" 的内部 API（供 `notifyThread` 调用） |

### 5.2 Kernel Traits（全量改造）

所有 `kernel/traits/**/TRAIT.md`：

1. frontmatter 的 `name` 去掉 `kernel/` 前缀（例：`kernel/computable` → `computable`）。
2. 新增 `namespace: kernel` 字段。
3. 所有 `deps: ["kernel/xxx"]` 改为 `deps: ["kernel:xxx"]` 或省略 namespace 的 `["xxx"]`。
4. 所有 `command_binding` 保持不变。

所有 `kernel/traits/**/index.ts`（如果存在）：

- 原来导出的 `methods: TraitMethodDef[]` → 改为 `export const llm_methods: Record<string, TraitMethodDef>`。
- 普通 trait 不导出 `ui_methods`（或导出空对象）。

### 5.3 Library Traits

同 kernel 改造，namespace 改为 `library`。`name` 保持原值（如 `lark/doc`）。

### 5.4 Self Traits 和 Views

| 对象 | 旧路径 | 新路径 |
|---|---|---|
| supervisor 主 UI | `stones/supervisor/ui/index.tsx` | `stones/supervisor/views/main/{frontend.tsx, backend.ts, VIEW.md}` |
| supervisor reporter | `stones/supervisor/traits/reporter/TRAIT.md`（保留，重写内容） | 同左 |
| supervisor session-kanban | `stones/supervisor/traits/session-kanban/` | frontmatter 加 `namespace: self`、`name: session-kanban`；`index.ts` 改 `llm_methods` |
| supervisor 报告 | 原 `flows/{sid}/objects/supervisor/ui/pages/report.tsx` | `flows/{sid}/objects/supervisor/views/{reportName}/frontend.tsx` 等 |
| 其他对象的 ui/ | 统一迁 views/ | — |

### 5.5 Web 前端

| 路径 | 改造 |
|---|---|
| `kernel/web/src/features/DynamicUI.tsx` | 路径解析改走 `views/{viewName}/frontend.tsx`；alias 命名同步 |
| `kernel/web/src/lib/ooc-url.ts` | `ooc://ui/` → `ooc://view/`，类型字面量改名 |
| `kernel/web/src/components/OocLinkPreview.tsx` | UI type 字面量同步改 view |
| `kernel/web/src/api/client.ts` | 新增 `callMethod(sessionId, name, traitId, method, args)` |
| `kernel/web/src/lib/navigate-parser.ts` | 无需改动（协议层透明） |
| `kernel/web/src/features/**` | 任何硬编码 `ui/` 的查找 / fallback 改为 `views/` |

### 5.6 文档

| 文档 | 改造 |
|---|---|
| `docs/meta.md` | 工程子树更新：`ui/` → `views/`；ooc 协议章节改 `ooc://view/`；trait 子树加 namespace 和 kind |
| `docs/对象/人机交互/自渲染.md` | 全面重写：从"UI 自渲染" → "Views：UI 与方法的统一表达" |
| `docs/对象/人机交互/ooc-protocol.md` | 协议列表改名 |
| `docs/对象/结构/trait/**` | 加入 namespace 概念、VIEW 作为 kind 的说明、llm_methods/ui_methods 双通道 |
| `docs/对象/结构/trait/kernel-traits/*.md` | 所有 trait 引用改为新 traitId 格式 |

---

## 6. Reporter Trait 升级细节

### 6.1 新 TRAIT.md（`stones/supervisor/traits/reporter/TRAIT.md`）

frontmatter：

```yaml
---
namespace: self
name: reporter
when: never
command_binding:
  commands: ["return", "talk"]
---
```

核心提示（示例）：

- **return / talk 时** 可以产出两种资产：
  1. 报告文档：`files/reports/{name}.md`（纯 markdown，人眼可读）
  2. 交互报告 View：`views/{name}/{frontend.tsx, backend.ts, VIEW.md}`
- 可以在 return summary / talk 消息末尾输出导航卡片：
  ```
  [navigate title="报告文档" description="..."]ooc://file/flows/{sid}/objects/supervisor/files/reports/{name}.md[/navigate]
  [navigate title="交互报告" description="..."]ooc://view/flows/{sid}/objects/supervisor/views/{name}/[/navigate]
  ```

### 6.2 示例 backend.ts

```typescript
import type { TraitMethodDef } from "@kernel/types";

export const ui_methods: Record<string, TraitMethodDef> = {
  submitFeedback: {
    description: "用户对报告给出反馈",
    params: [
      { name: "rating", type: "number" },
      { name: "comment", type: "string" },
    ],
    fn: async (ctx, { rating, comment }) => {
      ctx.setData(`feedback.${Date.now()}`, { rating, comment });
      ctx.notifyThread(`[UI] 用户提交反馈：评分=${rating}, 评论=${comment}`);
      return { ok: true };
    },
  },
};

export const llm_methods = {};
```

### 6.3 示例 frontend.tsx

```tsx
import React, { useState } from "react";
import { callMethod } from "@ooc/api/client";

export default function ReportView({ sessionId, objectName }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [done, setDone] = useState(false);

  const submit = async () => {
    await callMethod(sessionId, objectName, "self:report", "submitFeedback", {
      rating,
      comment,
    });
    setDone(true);
  };

  if (done) return <div>已收到反馈，supervisor 已被通知。</div>;

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {/* 表单字段 */}
      <button type="submit">提交</button>
    </form>
  );
}
```

---

## 7. 兼容性

**无兼容层**。本重构一次性破坏以下旧路径 / 协议 / 接口：

- 所有旧 `ui/index.tsx`、`ui/pages/*.tsx` 加载逻辑
- 所有 `ooc://ui/` 链接
- 所有扁平 / 嵌套方法调用（`readFile(...)`、`computable.readFile(...)`）
- 所有 `kernel/xxx` 形式的 TRAIT.md name（改为 namespace + name 拆分）

对应：所有测试、示例、文档、既有 stones 目录一次性改造到新规范。CLAUDE.md 明确"不考虑旧版本兼容"，遵守。

---

## 8. 测试策略

每个 phase 伴随 `bun test` 覆盖：

| Phase | 关键测试 |
|---|---|
| 1 | TRAIT.md 加载后 traitId 是 `namespace:name` 格式；重名按 self→kernel→library 解析；非法 namespace 报错 |
| 2 | sandbox 只暴露 `callMethod`；旧调用方式被移除；`callMethod` 解析 traitId；省略 namespace 解析正确 |
| 3 | VIEW.md 加载后 `kind === "view"`；`frontend.tsx` / `backend.ts` 存在性校验；`ui_methods` / `llm_methods` 互斥 |
| 4 | `POST /api/.../call_method` 白名单（非 self / 非 view / 非 ui_method 一律 403）；`notifyThread` 写入 inbox 并复活线程；方法返回值原样回传 |
| 5 | supervisor reporter 产出两份资产 + 两张 [navigate] 卡片；前端可加载交互报告 View；提交表单后 data 更新 + 线程被复活 |

---

## 9. 实现 Phase（供 writing-plans 拆解）

1. **Phase 1 — Namespace & traitId 协议**：类型定义、loader、registry、activator；全量改造 kernel / library / stones 下所有 TRAIT.md 的 frontmatter；测试。
2. **Phase 2 — callMethod 沙箱协议**：删除旧命名；只保留 `callMethod(traitId, method, args)`；全量改造所有 trait index.ts → `llm_methods`；program 沙箱注入改造；测试。
3. **Phase 3 — Views 加载与 DynamicUI**：VIEW.md loader；`views/` 目录识别；DynamicUI / `ooc://view/` 协议切换；所有 stones 现有 ui/ 迁移到 views/；测试。
4. **Phase 4 — HTTP call_method 端点**：后端 endpoint + 白名单；`notifyThread` API；前端 `callMethod` client；端到端测试。
5. **Phase 5 — Reporter trait 升级 + 文档同步**：新 TRAIT.md、示例 View、报告文档生成；更新 `docs/meta.md`、`docs/对象/人机交互/*`、`docs/对象/结构/trait/*`；Bruce 体验验证。

每个 phase 独立可交付、独立可回滚（在未合并到主线时）。

---

## 10. Spec 自检

- [x] 无 TBD / TODO
- [x] 三个 namespace、双方法表、硬迁移、两张卡片等关键决策都有明确结论
- [x] 没有内部矛盾（llm/ui 互斥；view 是 kind=view 的 trait；HTTP 只暴露 self 的 ui_methods）
- [x] 范围足够单一（trait 基础设施 + views + HTTP method + reporter 升级）
- [x] 没有歧义（"省略 namespace" / "硬迁移" / "白名单" 都写死规则）
