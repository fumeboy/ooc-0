# SuperFlow —— 反思即对话（2026-04-22）

> 本次迭代把 2026-04-22 上午完成的"ReflectFlow 方案 B"重构为 **SuperFlow** 语义：
> 把对象的"反思线程"升级为"对象的反思镜像分身"，投递通道从专用方法调用
> 改为通用的 `talk(target="super", message)`。

## 哲学变革

**旧（方案 A/B）**：反思是一个**特殊方法调用**。
```javascript
await callMethod("reflective/reflect_flow", "talkToSelf", { message: "..." });
```
- 反思有专用 method (`talkToSelf`)、专用目录 (`reflect/`)、专用 trait (`reflect_flow`)、专用 Scheduler (`ReflectScheduler`)
- 工程上**完全独立**的一套机制，和 talk/ThreadsTree 并行

**新（SuperFlow）**：反思是一场**对话**——对象对自己的**反思镜像分身**（super）说话。
```javascript
await talk("super", "...");
```
- 复用通用 `talk` 原语；super 是 talk 的一个**特殊 target**（不是 Registry 里的对象）
- 复用通用 ThreadsTree；super 的持久化在 `stones/{name}/super/`（结构与 flow object 同构）
- 删除专用 `reflect.ts` / `reflect-scheduler.ts` / `collaboration.ts::talkToSelf`
- trait `reflective/reflect_flow` → `reflective/super`（保留 `persist_to_memory` / `create_trait` 沉淀工具；删除 `talkToSelf` 方法体）

## 为什么转型

### 1. G8 消息哲学的一致性

OOC 的 G8 说"万物皆对象、对话即通信"。既然对象的反思是"自我对话"，就应该用 `talk` 而不是专用方法。
专用方法把反思从"对话行为"降级为"数据操作"，失去了哲学纯度。

super ≈ super-ego（超我）——对象的反思版本是自己的镜像分身。
**A 对 super 说的话 = A 对自己的话**。这个比喻直接到位，不需要额外解释"什么是反思线程"。

### 2. 工程最小性

旧方案独立的 reflect.ts + reflect-scheduler.ts + collaboration.ts::talkToSelf 合计 **~200 行专用代码**。
SuperFlow 用复用替代这些：
- 投递：复用 `world.onTalk` 的特判路由（与 `target === "user"` 同级，新增 `target === "super"` 一行）
- 落盘：复用 `ThreadsTree` + `SerialQueue`（`handleOnTalkToSuper` ~60 行）
- 目录：复用 `stones/{name}/xxx/` 语义（只是子目录名从 reflect 改 super）
- Context 注入：完全不变（`context-builder.ts` 仍读 `stones/{name}/memory.md`）
- 权限隔离：**by accident** 通过 trait 激活状态实现——super 对象默认激活 `reflective/super`，
  普通对象不激活，`persist_to_memory` / `create_trait` 自然不能被普通对象越权

**净删除代码约 500 行**，净增加代码约 100 行。

### 3. 扩展性红利

super 既然是一个"对象的镜像分身"而不是"反思区"，那 super 本身也可以：
- 拥有自己的 traits（`stones/{name}/super/traits/` 定义 super 的反思风格——每个对象的 super 可以不一样）
- 拥有自己的 memory.md（super 也有长期记忆——"我过去对哪些经验做过高质量沉淀？"）
- 拥有自己的 views（UI 层可以展示 super 的状态——这一 Phase 4 已做）
- 未来可以 talk 其它对象（super 不只能被 talk，也能发起 talk——如果需要跨对象反思协作）

这些在旧方案里都不可能。

## 实现要点

### `talk(target="super")` 路由

`kernel/src/world/world.ts::_talkWithThreadTree` 的 `onTalk` 分支：
```typescript
if (target === "user")  return handleOnTalkToUser(...);
if (target === "super") return handleOnTalkToSuper(...);  // 新增
/* 否则走正常的跨 Object talk */
```

### `handleOnTalkToSuper`（`kernel/src/world/super.ts`）

职责：
1. 确保 `stones/{fromObject}/super/` 目录存在
2. 加载或创建该目录的 `ThreadsTree`（root 线程 title=`{fromObject}:super`）
3. 向 root 线程 inbox 写入消息（`source: "system"`, `from: fromObject`）
4. 返回 `{ reply: null, remoteThreadId: rootId }`—— 异步通道语义

目录锁：`SerialQueue` 按 `superDir` 串行化，不同对象互不阻塞（和旧 reflect 目录锁逻辑一致）。

### 当前阶段的限制

**super 线程不自动跑 ThinkLoop**。原因：ThreadScheduler 是 per-session 的，super 线程
跨 session 常驻，无法直接复用。独立的 super 线程调度器需要独立的迭代设计
（比 ReflectScheduler 更完整：runner 注入要直接接 engine）。

当前阶段：`talk(super, ...)` 只落盘、不触发执行；消息"静静躺在 super 的 inbox"
等待未来调度器唤醒消费。但即使不跑 ThinkLoop，**落盘本身是有价值的**——
- 人类可以在前端 SuperFlowView 看到对象累计的反思候选（Inbox tab）
- 人类可以手动触发 super 的 ThinkLoop（未来通过 UI 按钮）
- super 的 `persist_to_memory` 方法体已就绪，未来调度器接入即可打通

### E2E 体验教训

2026-04-22 跑 E2E（bruce talk(super, "记一条经验")）时，**LLM 把 "super" 当成了
"supervisor"**——把消息发给了 supervisor 对象而不是投递到自己的 super 分身。

原因：当前 bruce 的 Context 里没有 super 的知识——LLM 从未被教过 "super" 是 talk 的特殊保留字。
这给我们两个教训：
1. **`talk(super)` 通道需要在 kernel trait 的 talkable 或 readme 中明确文档化**
   （留作后续迭代，本次未做以保持最小改动）
2. **单元测试覆盖了 `handleOnTalkToSuper` 的落盘逻辑**（4 pass），通道本身已工作；
   E2E 的"通过 LLM 触发"验证降级为"落盘+通道连通性"验证

## 后续 backlog

1. **super 线程跨 session 自动调度**（接入 ThinkLoop + persist_to_memory 自动执行）
2. **talkable 增加 super 语义文档**（让 LLM 知道 talk("super", ...) 是向自己沉淀）
3. **super 的 memory 二次沉淀**（super 的 memory.md 和对象本身的 memory.md 关系需要设计）
4. **前端 SuperFlowView 增强**（手动触发 super ThinkLoop；多线程可视化 super 的反思子线程）

## 参考

- 迭代文档：`docs/工程管理/迭代/finish/20260422_refactor_SuperFlow转型.md`
- 前置迭代：`docs/工程管理/迭代/finish/20260421_feature_ReflectFlow方案B.md`（partial-finish，方案 B 实现在本次被重构）
- G12 工程映射：`docs/哲学/genes/g12-经验沉淀.md` 的"工程映射（SuperFlow）"章节
- 核心代码：
  - `kernel/src/world/super.ts`（投递落盘）
  - `kernel/src/world/world.ts::_talkWithThreadTree` 的 onTalk super 分支
  - `kernel/traits/reflective/super/`（沉淀工具 trait）
  - `kernel/src/thread/context-builder.ts` 的 memory.md 注入段
  - `kernel/web/src/router/registrations.tsx` 的 SuperFlowAdapter
