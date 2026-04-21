# Trait Namespace + Views + HTTP Methods 设计决策

> 日期：2026-04-21
> Spec：`docs/superpowers/specs/2026-04-21-trait-namespace-views-and-http-methods-design.md`
> Plan：`docs/superpowers/plans/2026-04-21-trait-namespace-views-and-http-methods.md`
> 迭代：`docs/工程管理/迭代/all/20260421_feature_trait_namespace_views.md`

## 背景

当前 Trait 体系的三个痛点：

1. **"trait name" 与 "对象 UI" 是两套平行概念**——对象的自渲染 UI（`stones/{name}/ui/index.tsx`）与它的能力（`stones/{name}/traits/*`）之间没有统一机制。UI 是硬编码路径，不能被 command 激活、不能参与 scope chain。
2. **方法调用协议混乱**：同一方法可以用 `readFile(...)` 扁平调，也可以用 `computable.readFile(...)` 两段式调，还可以 `callMethod(...)`；LLM 看到多种形态，Context 膨胀。
3. **用户前端改 data 无回路**：对象 UI 里的表单提交只能改 data 或 talk，无法直接让线程复活继续思考。G10（Effect 是对外唯一通道）在用户 → 对象方向缺了一条 HTTP Effect。

## 核心决策

### 1. 把 UI 收编为 trait 的一个子类

View = `kind: "view"` 的 Trait。物理三件套：

```
views/{viewName}/
├── VIEW.md          ← 同 TRAIT.md 结构，kind=view
├── frontend.tsx     ← React 组件默认导出（必填）
└── backend.ts       ← 可选；llm_methods / ui_methods 双导出
```

这让"自渲染 UI"与"trait 能力"共用：
- 同一个 Loader（loader.loadTrait 既接 TRAIT.md 也接 VIEW.md）
- 同一个 MethodRegistry
- 同一套 namespace + traitId 规则
- 可声明 command_binding（LLM 像激活 trait 一样激活 view 的 readme）

### 2. 显式 namespace + 统一 traitId

废除"从路径推断 name/namespace"。frontmatter 必填 `namespace: kernel | library | self` 和 `name`。
traitId = `${namespace}:${name}`（冒号分隔，取代混用的斜杠）。

省略 namespace 在 deps / callMethod 入口生效，固定顺序 `self → kernel → library`。

### 3. 方法双通道 + 单入口

- `llm_methods` → 进 `llm` channel，LLM 沙箱通过唯一函数 `callMethod(traitId, method, args)` 调用
- `ui_methods` → 进 `ui` channel，前端通过 HTTP `POST /api/flows/:sid/objects/:name/call_method` 调用
- 严格隔离：两个通道互不可见

沙箱取消所有扁平 / 两段式 / 位置参数调用。args 永远是对象。

### 4. HTTP call_method 白名单 + notifyThread

新端点 `POST /api/flows/:sid/objects/:name/call_method` 暴露"用户 → 对象 data + 线程唤醒"Effect 通道。

白名单严格：
- traitId 必须 `self:` namespace（kernel/library 不可）
- trait kind 必须 `view`（self: 的普通 trait 不可）
- method 必须在 `ui_methods`（不看 llm_methods）
- view 必须属于 URL 参数指向的对象

方法 ctx 新增 `notifyThread(msg, opts?)`：向对象的根线程 inbox 写 system 消息，done 线程自动复活，非阻塞触发 `world.resumeFlow`。

这闭合了"用户填表单 → 对象 data 变化 → 线程继续思考"的回路。

## 与基因的对齐

| 基因 | 体现 |
|---|---|
| G3 — 能力即自我立法 | Trait 与 View 同构：都是对象"自我声明能做什么"的单元 |
| G6 — 关系即网络 | namespace 把"能力来源"显式为三类：自身 / 内核 / 公共库 |
| G10 — Effect 是对外唯一通道 | HTTP call_method 作为"用户 → 对象 data"的 Effect 入口，统一落盘 + 线程通知 |
| G11 — UI 即自我表达 | Views 让对象的界面与能力共用同一张方法注册表 |
| G13 — 线程树 | UI 触发的方法可以通过 notifyThread 向指定线程发送消息复活 |

## 硬迁移原则

本重构一次性破坏以下旧路径 / 协议 / 接口，不保留兼容层：

- 所有 `ui/index.tsx` / `ui/pages/*.tsx` 加载逻辑
- 所有 `ooc://ui/` 链接协议
- 所有扁平 / 嵌套方法调用（`readFile(...)`、`computable.readFile(...)`）
- 所有 `kernel/xxx` 形式的 TRAIT.md frontmatter name（改为 namespace + name 拆分）

对应的所有测试、示例、文档、现存 stones 一次性改造到新规范。
遵守 CLAUDE.md "不考虑旧版本兼容"的总纲。

## 分阶段交付

Plan 拆为 5 个 Phase：

1. **Phase 1 — Namespace & traitId 协议**（完成于本迭代第一段）
2. **Phase 2 — callMethod 沙箱协议**（完成于第一段）
3. **Phase 3 — Views 加载与 DynamicUI**（完成于续作段）
4. **Phase 4 — HTTP call_method 端点 + notifyThread**（完成于续作段）
5. **Phase 5 — Reporter trait 升级 + 文档同步**（完成于续作段）

每 phase 独立 commit，Gate 未过不跨 phase。

## 遗留思考

- **权限系统**：当前 HTTP 端点不做权限校验（所有调用以对象自身身份运行）。未来若需要"用户 A 不能触发用户 B 的对象"，需在此加 session 认证层。
- **iframe 沙箱**：views 的 frontend.tsx 与主 App 共享 JS 上下文。"对象 UI 可信"是当前假设；未来若接受外部对象，可能需要 iframe + postMessage 隔离。
- **流式 UI 方法**：当前 ui_methods 返回一次性结果。若未来需要 "用户按住按钮 → 对象持续反馈" 的流，需要新的协议（可能是 SSE per method）。

## 执行追溯

完整执行记录（commits / 测试基线 / 决策细节）见：
`docs/工程管理/迭代/all/20260421_feature_trait_namespace_views.md`。
