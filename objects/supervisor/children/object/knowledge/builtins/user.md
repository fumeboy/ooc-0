---
title: user — 代表人类用户的被动 object（self × 维度：面孔几乎全空）
description: builtin user 的单一权威定义，以 self × 维度透镜陈述：self=空 data、非 agent（不跑 thinkloop）；readable/executable/persistable/visible/construct 各面孔几乎全空；唯一实质面孔是 readable.md 的 inline UI token 协议——那是「向 user talk 的 agent」读的消息展示契约，不是 user 自身投影成 window
activates_on:
  "object::root": "show_description"
---

# user

> 代表人类用户在 OOC world 内的占位 object——agent `talk` 的**对端**（人类一侧），自身不跑 thinkloop。
> 对象模型（class/object、四 facet、单例/非单例、object 经 `ooc.class` 继承一个 class、children 命名空间、投影）见 `object/self.md`，本文不复述模型。

## 一、self（身份 / data）

- **`ooc.kind = object`**，无 `ooc.class`——user **不继承任何 class**，只是一个裸 object 实例：身为 object 天然有 readable/executable/visible/persistable 四个 facet，但每一面几乎全空。
- user **不是 agent**——不额外取 thinkable/collaborable/reflectable，不持 `talk`、不跑 thinkloop、无 `self.md` 身份正文。
- **被动 object**：既非 tool-object（无 object method、不被 exec）也非 agent（不被 talk 目标、不被调度 LLM）。只是 web 会话里代表「人类一侧」的占位实体。
- **data**：`Data = {}`——**空**。user 无任何业务字段；身份元信息（id/title/status…）由 runtime/persistable 管理，不在 data 里。
- **一句话职责**：作为 agent `talk` 的对端落地点——agent 向 `user` 发的消息进入与 user 的 thread inbox，由 web 控制面渲染给真人；真人在 UI 的输入作为对端回话注入会话。「user 的思考」全部由真人在 UI 完成，runtime 不为它调度 LLM。

## 二、self × 各维度（核心设计）

user 的总特征：**四 facet 几乎全空**——它是被动占位，没有任何会被 runtime 调度的程序逻辑。唯一实质内容是 readable.md 上的一份消息展示契约（且读者是别人，不是 user 自己）。

### self × readable
**self 自身永不投影成 self window**（不跑 thinkloop，无「user 视角的 context」）。但 self **会作为 peer object window 投影进别的 agent 的视角**——当某 agent 与 user 有过 talk（持向 `user` 的 thread window）时，user 列为该 agent 的 talk 派生 peer。user 只被排除在**默认相邻 peer 自动发现**（sibling + 一级 children）之外，不被排除在 talk 派生 peer 之外。无 window method。

### self × executable
**object method 无**。user 不被当工具调用。

### self × persistable
无自定义。user 是实例 object，其 flow object 与对应 thread 在新会话 seed 时按默认布局创建、走系统默认持久化。

### self × visible
无自定义 self UI 详情页（`visible/index.tsx` 为 no-op 占位）；user 在 UI 上的呈现是 chat panel（人类一侧），由 web 控制面承担。

### self × construct —— 无
user 是实例 object（`kind=object`），无 construct——不被构造出新实例。

### readable.md（消息渲染协议，非 self 投影面孔）
- 定义**向 user 发消息时可用的 inline UI token 协议** `[[ui{...}ui]]`（组件如 `file-link` / `follow-ups`）。
- **读者是「向 user talk 的那一端 agent」，而非 user 自己**（user 无 LLM 读它）——语义是 user 这个对端对外暴露的**消息展示契约**，由 web 前端解析渲染（cross-ref visible 维度 `self.md`）。
- 它**不是**对象模型意义上「user 自身投影成 window」的 readable——区别于 readable 维度里「object 把自己投影成 context window」那一类。

## 三、children

无 children。

## 程序骨架（示意）

被动 object 的真实最小布局：**只有** `package.json` + 空 `types.ts` + 一份给对端 agent 读的 `readable.md` + 一个 no-op `visible/index.tsx`。**没有 `index.ts`，没有 `executable/` / `readable/` / `persistable/` 自定义程序**——user 不持任何会被 runtime 调度的逻辑，四 facet 全走默认。design-level 示意、不必可编译。

### package.json —— `ooc.kind`（无 `ooc.class`）

```json
{
  "name": "@ooc/builtins/user",
  "type": "module",
  "ooc": {
    "objectId": "user",
    "kind": "object"
  }
}
```

- 无 `ooc.class`——user 不继承任何 class，是个裸 object 实例。
- `kind=object`——它是实例不是模板，故无 construct。

### types.ts —— object data 结构（空）

```ts
// user 无业务字段；身份元信息由 runtime/persistable 管理
export interface Data {}
```

### readable.md —— 静态消息展示契约（user 唯一的实质面孔）

user 的 readable 面是一份**静态 `readable.md`**（不是 `readable/index.ts` 动态投影 hook）：既作为 user 被投影成 peer 窗时的窗内容，又承载向 user 发消息时可用的 inline UI token 协议 `[[ui{...}ui]]`（组件如 `file-link` / `follow-ups`）。读者是「向 user talk 的对端 agent」，token 由 web 前端解析渲染（归 visible 维度）。

### visible/index.tsx —— no-op 占位

```tsx
// user 在控制面的呈现是 chat panel（人类一侧），本体无独立详情页
export default () => null
```

> user 没有 `index.ts`（无自定义 Class 程序路由）、没有 object method、不被 exec / talk-as-callee——它就是 agent `talk` 的人类对端占位，四 facet 全走系统默认。
