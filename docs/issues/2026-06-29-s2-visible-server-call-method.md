---
title: S2 · visible/server callMethod(A2 通路 + 仅 flow scope)
status: landed
date: 2026-06-29
follows: 2026-06-29-web-server-reimpl-index.md
priority: P0
---

# S2 · visible/server callMethod

## 背景

来自总目录 S2 项。涉及桩点 **1 个**:F2(ObjectClientRenderer.callMethodFor)。看似小,但**这是 visible 维度第二条通路(A2)的核心**:人类编辑 object data。

## 设计权威锚

**`knowledge/index.md` §B `## visible`**:
> Object **持有并演化自身 UI 页面 + 自实现「给 UI 用的服务端 API」**。除 tsx UI 外,class 经 `<ObjectDir>/visible/server/index.ts` 实现 for-ui 服务端 API(ctx 有 world / session / object-self、**无 thinkloop thread**;改 data → persistable.save 非版本化),由 `index.ts` 与 executable / readable / persistable 一并注册;HTTP `/call_method` dispatch 到此 — **仅 flow scope**(`POST /api/flows/:sid/:oid/call_method`),stone scope 只读、不调 object 程序。

**`visible/self.md` ## 核心设计**:
> 前端经 `/call_method` 调 Object `<ObjectDir>/visible/server/index.ts` 提供的 for-ui 服务端 API 交互(人类侧专路,ctx 有 world / session / object-self、无 thinkloop thread,改 data → persistable.save)。

**两条正交编辑通路(visible/self.md)**:
- ① 编辑源文件 → app `PUT /stones/:id/file?path=`(S1,版本化)
- ② 编辑 data → callMethod 到 class **自写 visible/server for-ui method**(本 S2,非版本化)

## 现状

### web 桩点

ObjectClientRenderer.callMethodFor 桩化(F2):
```ts
const response = await TODO_async<{ ok; data?; result?; error? }>(
  `POST /api/${target.scope === "stone" ? "stones/<id>" : "flows/<sid>/<oid>"}/call_method ...`,
);
```

桩 TODO 注意写了**新设计 callMethod 仅 flow scope**(stone /call_method 已移除)——这是设计权威 vs ooc-6 实现的关键分歧点。

### 当前 builtin visible/server 现状

实勘 `packages/@ooc/builtins/`:**0 个** builtin 实现 visible/server 模块。`OocClass.visible: VisibleServerModule` 槽位定义存在(`core/types/visible-server.ts`),`ObjectRegistry.resolveVisibleServer` 存在,但全部 builtin Class 装配都不传 visible 字段。

这是 **issue F3 待做**(原 roadmap),本 S2 含其代表性实现。

## 改动提案

### 1. 实现 flows module callMethod endpoint(`app/server/modules/flows/api.call-method.ts`)

`POST /api/flows/:sid/:oid/call_method`:
- body: `{ method: string; args?: object }`
- backend 流程:
  1. hydrateSession(baseDir, sid)
  2. getSessionRegistry(sid).getObject(oid) 取目标 inst
  3. resolveVisibleServer(inst.class) 取 visible/server 模块
  4. visible/server.methods.find(m => m.name === method) → 不存在 fail-loud
  5. 构造 VisibleServerContext { sessionId, worldDir, self.data } (无 thinkloop thread)
  6. await method.exec(ctx, args)
  7. 经 persistable.save 持久化(scope="flow" 非版本化)
  8. response: `{ ok: true; data?: <method return>; result?: string }`
- 错误时 `{ ok: false; error: string }` + 适当 HTTP 状态码

### 2. 在代表性 builtin 实现 visible/server

按设计权威,选 **`_builtin/agent/children/thread`** 作首批范例:
- 文件:`packages/@ooc/builtins/agent/children/thread/visible/server/index.ts`
- VisibleServerModule.methods:
  - `markRead(args: { messageId: string })`:把某 message 标已读(改 data.readMessageIds)
  - `mute(args: { until?: number })`:暂时静音 thread 通知(改 data.mutedUntil)
- 装配:thread/index.ts 加 `visible: visibleServer` 字段

**(范例为主,具体 method 由具体 class 设计;本 issue 重点是 server 路径打通,non-thread builtin 的 visible/server 留独立 follow-up)**

### 3. ObjectClientRenderer 桩点接通

`callMethodFor` 解桩:
```ts
function callMethodFor(target: ClientTarget) {
  if (target.scope === "stone") {
    // 设计裁决:stone client 只读;callMethod 仅 flow scope。
    return async () => {
      throw new Error("[visible] stone client is read-only; callMethod requires flow scope");
    };
  }
  return async (method: string, args: object = {}) => {
    return requestJson(endpoints.flowCallMethod(target.sessionId, target.objectId), {
      method: "POST",
      body: JSON.stringify({ method, args }),
    });
  };
}
```

### 4. test 覆盖

新增 `tests/visible-server-call-method.test.ts`(本 S2 主测试):
- thread builtin 注册 visible/server,methods 含 markRead
- POST /api/flows/<sid>/<oid>/call_method body={ method: "markRead", args: {...} } 成功
- backend 真改 data + persistable.save(scope="flow") 命中
- 不存在的 method → 400 + error
- stone scope 调 stone callMethod → 路径不存在或拒绝(stone-only)
- ctx.world/session/self 注入正确

## 落地 commit 切分

1. `feat(server/flows): 实现 POST /api/flows/<sid>/<oid>/call_method dispatch 到 visible/server`
2. `feat(builtins/thread): 实现 visible/server 模块含 markRead/mute 范例 method`
3. `feat(web/clients): 解桩 ObjectClientRenderer.callMethodFor 接通 flow callMethod;stone scope 拒调`
4. `test: 加 visible-server-call-method.test.ts 4 case 覆盖`
5. `docs: dashboard.md 加 S2 case;visible 维度覆盖 0 → 4+`

## 受影响设计元素

- `## visible` 维度(self.md):**第一次落地** visible/server 模块的代码实证
- `## visible × app` 交叉:实现 `/call_method` 路径
- `## visible × persistable` 交叉:visible/server 改 data → persistable.save 非版本化
- `## thread` builtin:首批 visible/server 范例

## 风险与权衡

- **风险 1**:stone client 只读裁决可能让 ooc-6 web 中 stone client 上的可点击 method 报错。需要排查 web 端是否真有 stone client 调 method 的 UI(ObjectClientRenderer 的 callMethodFor 已设计为按 scope 分流;只要不传 stone scope 即可)。
- **风险 2**:thread 选作 visible/server 首批范例 — 但 thread 是高频且复杂 builtin,改造可能引入 regression。**缓解**:仅加 visible 字段(纯加非改),不动 thread.executable / readable / persistable / thinkable;tests 隔离测。
- **权衡**:visible/server 是否需要 `for_ui_access` 等标记? — 设计权威说**该标记已退役**;visible/server 自身就是人类侧专路,无需标记。

## 待裁决点

1. **首批 visible/server 范例选哪几个 builtin?** — 推荐 thread + agent 自身 + 1 个内容窗 builtin(如 todo / plan / search)
2. **具体 method 含义?** — 推荐 thread.markRead/mute + agent.todoComplete + 待具体需求驱动。**本 issue 仅 thread.markRead/mute,其余 follow-up issue**

## review 记录

(待 fan-out:visible 维度 reviewer + builtins reviewer + completeness 批评官扫"是否漏了 visible 与其他维度的交叉")

## 裁决

(待)

## 落地验收

(landed 后:
1. POST /api/flows/<sid>/<oid>/call_method 路径真接通
2. thread builtin 注册了 visible/server 字段,代码可见
3. 4+ test case 通过
4. ObjectClientRenderer F2 桩点解桩,stone scope 显式拒调
5. visible 维度 dashboard 覆盖 0 → 4+ cases)
