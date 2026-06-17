---
title: user — 代表人类用户的被动 object（self × 维度：面孔几乎全空）
description: builtin user 的单一权威定义，以 self × 维度透镜陈述：self=空 data、不继承（回退隐式 root）、被动（非 agent、不跑 thinkloop）；readable/executable/persistable/visible/construct 各面孔几乎全空；唯一实质面孔是 readable.md 的 inline UI token 协议——那是「向 user talk 的 agent」读的消息展示契约，不是 user 自身投影成 window
activates_on:
  "object::root": "show_description"
---

# user

> 代表人类用户在 OOC world 内的占位 object——agent `talk` 的**对端**（人类一侧），自身不跑 thinkloop。
> 对象模型（class/object、继承、构造、children、投影）见 class `knowledge/object-model.md`，本文不复述模型。

## 一、self（身份 / data）

- **`ooc.kind = object`**，**不继承**（无 `ooc.class`，回退隐式 root），但 user **不是 agent**——不取 thinkable/collaborable/reflectable，不跑 thinkloop。
- **被动 object**：既非 tool-object（无 object method、不被 exec）也非 agent（不被 talk 目标、不被调度 LLM）。只是 web 会话里代表「人类一侧」的占位实体。
- **data**：`Data = {}`——**空**。user 无任何业务字段；身份信封（id/title/status…）由 runtime/persistable 管理，不在 data 里。
- **一句话职责**：作为 agent `talk` 的对端落地点——agent 向 `user` 发的消息进入 `user.root` thread 的 inbox，由 web 控制面渲染给真人；真人在 UI 的输入作为对端回话注入会话。「user 的思考」全部由真人在 UI 完成，runtime 不为它调度 LLM。

## 二、self × 各维度（核心设计）

user 的总特征：**面孔几乎全空**——它是被动占位，没有任何会被 runtime 调度的程序逻辑。唯一实质内容是 readable.md 上的一份消息展示契约（且读者是别人，不是 user 自己）。

### self × readable
**self 自身永不投影成 self window**（不跑 thinkloop，无「user 视角的 context」）。但 self **会作为 peer object window 投影进别的 agent 的视角**——当某 agent 与 user 有过 talk（持 `talk_window(target="user")`）时，user 列为该 agent 的 talk 派生 peer。user 只被排除在**默认相邻 peer 自动发现**（sibling + 一级 children）之外，不被排除在 talk 派生 peer 之外。无 window method。

### self × executable
**object method 无**。user 不被当工具调用。

### self × persistable
无自定义。user 是实例对象，其 flow object 与 `user.root` thread 在新会话 seed 时按默认布局创建、走系统默认持久化。

### self × visible
无自定义 self UI 详情页（`visible/index.tsx` 为 no-op 占位）；user 在 UI 上的呈现是 chat panel（人类一侧），由 web 控制面承担。

### self × construct
无。user 是实例对象（`kind=object`），无 construct。

### readable.md（消息渲染协议，非 self 投影面孔）
- 定义**向 user 发消息时可用的 inline UI token 协议** `[[ui{...}ui]]`（组件如 `file-link` / `follow-ups`）。
- **读者是「向 user talk 的那一端 agent」，而非 user 自己**（user 无 LLM 读它）——语义是 user 这个对端对外暴露的**消息展示契约**，由 web 前端解析渲染（cross-ref visible）。
- 它**不是**对象模型意义上「user 自身投影成 window」的 readable——区别于 readable 维度里「object 把自己投影成 context window」那一类。

## 三、children

无 children。
