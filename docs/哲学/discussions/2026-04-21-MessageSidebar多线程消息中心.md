# MessageSidebar 从单对话窗到多线程消息中心

> 日期：2026-04-21
> 相关迭代：`docs/工程管理/迭代/all/20260421_feature_MessageSidebar_threads视图.md`
> 相关基因：G6（社交网络）、G8（消息）、G11（可见性）

## 背景

MessageSidebar 原本是"右侧固定和 supervisor 对话"的单一面板。从 user 视角看只能看到一个线程——其他线程里发生了什么、谁对我说过话，user 都看不到。

随着前置迭代 `user-inbox` 完成，后端提供了 `GET /api/sessions/:sid/user-inbox` 引用式收件箱，前端第一次有了"给 user 的消息流"的真相索引。MessageSidebar 正是承接这一能力的前端容器。

## 设计主张

1. **MessageSidebar 是 user 的消息中心，而不是某对象的对话窗**
   - 默认行为：对 supervisor 发起对话（保留原先"supervisor 是 user 的入口"的直觉）
   - 但 Body 可以查看任何线程的 process——view = process + currentThreadId 解耦
   - Header 的 threads 切换按钮打开"双栏消息列表"，类似 iMessage 的会话列表

2. **引用式数据 + 前端反查**（与 user-inbox 哲学一致）
   - 后端只给 `[{threadId, messageId}]` 索引
   - 前端自行 walk subFlows，按 threadId 定位节点、按 messageId 反查正文
   - 正文只有一份真相（发起线程的 thread.json.actions），不复制

3. **对象聚合 > 线程聚合**
   - 右栏不是"所有发给 user 的线程"平铺，而是按对象卡片聚合
   - 一个对象反复给 user 发消息 → 合并为一个会话卡片 + 展开内层 thread 列表
   - 符合人类社交直觉：我们记得"这个人和我说了些什么"，而不是"这几条消息分别属于哪几个线程"

4. **未读持久化——先 localStorage，后端后续做**
   - 本迭代不改 user-inbox 后端（该迭代明确留了 `read_state` 扩展位）
   - 前端 localStorage key = `ooc:user-inbox:last-read:{sid}`，value = 已读 messageId 数组
   - 切到某 thread 时自动 mark 该 thread 下所有 messageId 为已读
   - 后续独立迭代把 read-state 迁到后端（跨设备同步、持久化到 flows/{sid}/user/data.json）

5. **懒创建 supervisor thread**
   - MessageSidebar mount 时不主动 POST 创建空 thread
   - supervisor 已有 root thread → auto-select 为 currentThreadId
   - supervisor 尚无 thread → 空状态提示 "向 supervisor 发起对话"
   - 用户首次发送消息时 `talkTo("supervisor", msg)`，后端自动建 root；SSE 刷新后前端把新 root id 设为 currentThreadId

## 和基因的关系

- **G6（社交网络）**：user 第一次拥有"同时看所有对我说的话"的视图；对象之间的 talk 不再只存在于各自 thread 里，也通过 user inbox 汇聚到 user 这一节点
- **G8（消息）**：前端第一次把"消息流"与"线程树"的双重视角同时暴露给 user——线程树继续承担对象内 context 结构，消息流承担"谁何时对我说了什么"的人类直觉维度
- **G11（可见性）**：引用式 inbox 让 user 对消息的可见性是 read-only 投影；线程真相仍在对象侧，user 不构成新的 source of truth

## 偏离原方案的地方

- 原方案设想后端"mark read"API；为避免引入新 server endpoint，本迭代用 localStorage 代替（留给后端 read-state 独立迭代）
- Body 的 timeline 过滤逻辑放弃了"walk 整个 supervisor process"，改为只渲染 currentThreadId 节点自身的 actions——子线程有自己的入口，不在父线程 Body 里平铺

## 遗留

- 后端 user inbox read-state：跨设备同步问题
- threads list 排序策略：当前按最新消息时间；未来可按 object 权重（比如 pinned 对象置顶）
- 同一对象的"多 thread"展开交互：目前点击卡片展开，下一步可以考虑卡片内直接显示展开状态（省一次点击）
