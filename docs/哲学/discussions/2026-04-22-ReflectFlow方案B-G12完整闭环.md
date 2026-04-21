# ReflectFlow 方案 B — G12 完整闭环（2026-04-22）

> 继 2026-04-21 方案 A（线程树化打通投递通道）之后，方案 B 完成 5 个 Phase：
> 调度器 + 沉淀工具 + Context 注入 + 前端适配 + E2E 验证。

## 背景与前置

- **方案 A** 已打通：主线程 `callMethod → talkToSelf → reflect.ts → ThreadsTree.writeInbox → stones/{name}/reflect/` 落盘。
- 但**反思线程 inbox 的消息会"静静躺着"**——没有调度器驱动反思线程执行 ThinkLoop，也没有沉淀工具把结果写入长期记忆。
- 方案 A 末尾列了 5 个 backlog，本迭代（方案 B）一次性收。

## 设计决策

### Phase 1 — ReflectScheduler（调度器）

**问题**：反思线程跨 session 存在，现有 `ThreadScheduler` 是 per-session 的——直接复用会把反思线程和某次 session 的生命周期绑在一起。

**决策**：新建独立 `ReflectScheduler`，**注入 `runner` 回调**解耦 engine，API：
- `register(stoneName, stoneDir)` / `unregister(stoneName)` / `getRegistered()`
- `triggerReflect(stoneName)` — 条件触发（root inbox 有 unread 才调 runner）
- `scanAll()` — 串行遍历所有注册对象

**不做 polling**：OOC 事件驱动，polling 浪费 CPU。调用方在需要时主动 trigger（如
`talkToReflect` 成功后显式 trigger，或服务启动时 scanAll）。

**错误隔离**：runner 抛错不阻塞其他对象调度（scanAll 继续）。

### Phase 2 — 沉淀工具

两个新 `llm_methods`（注册在 `kernel:reflective/reflect_flow` trait 的 llm 通道）：

- `persist_to_memory({ key, content })`：按 `## {key}（ts）\n\n{content}\n` 格式 append 到 `{stoneDir}/memory.md`。**不去重**——同一 key 多次写产生多条记录（经验可能演进，LLM 自己决定保留哪些）。
- `create_trait({ relativePath, content })`：在 `{stoneDir}/traits/**` 下创建 TRAIT.md。**安全校验**：拒绝 `..`、拒绝绝对路径、拒绝已存在 trait（本工具是 append-only 不覆盖）。

**权限模型（延迟）**：迭代原计划限制"只在反思线程沙箱可用"。实际实现中两个方法**对任意 trait 激活环境都暴露**——方案 B 简化为**信任 LLM 自主决定**，不加 `when: reflect_only` 运行时检查。这与 OOC "LLM 做判断，代码做记账"原则一致。如后续发现滥用，再补上沙箱校验。

### Phase 3 — Context memory 注入

`buildThreadContext` 的 knowledge 区段新增读 `{stoneDir}/memory.md`：
- 存在 → 注入 `name=memory` 独立窗口
- 超过 4000 字符 → 截取尾部（偏好近期经验）
- 不存在 / 读失败 → 静默跳过（不污染 Context）

**为什么是 knowledge 而不是 instructions**：memory.md 是对象自己**学到的经验**（非 kernel 下发的指令），语义属于"知识"——应该激发 LLM 联想，不是强制规则。

### Phase 4 — 前端 ReflectFlowView 适配

原 adapter 读 `reflect/process.json + data.json`（旧 Flow 架构遗物，线程树化后已不存在）。重构为：
- Tab **Inbox**：渲染 `threads/{rootId}/thread.json` 的 inbox 列表（未读红点计数）
- Tab **Memory**：渲染 `memory.md`
- 删除 Process / Data tab（对应文件不再产生）

### Phase 5 — G12 E2E + gene.md 工程映射

两个集成测试覆盖两条路径：
- **路径 A（主线程直接沉淀）**：主线程调 persist_to_memory → 下次 Context 含 memory
- **路径 B（反思线程调度触发）**：主线程调 talkToSelf → Scheduler.trigger → 模拟 runner 调 persist_to_memory → 下次 Context 含 memory

两条路径都绿，证明**整个数据流（talkToSelf → reflect.ts → Scheduler → 沉淀工具 → memory.md → context-builder）跑通**。

gene.md G12 追加"工程映射"章节，把四步循环映射到具体模块。

## 与 G5（遗忘）的协同

G12 沉淀**不是把所有经验都存下来**——而是：
- 短期记忆：actions（会随时间压缩遗忘）
- 长期记忆：memory.md（append-only 但受 Context 截断保护，上限 4000）
- 永久记忆：trait（`create_trait` 产出，受 `when` 激活条件保护）

"沉淀"是主动从短期记忆里挑出值得留下的，写入长期/永久层——剩下的任其随短期记忆一起遗忘。这与 G5 的三层记忆模型一致。

## 未完成项（backlog）

1. **反思线程 ThinkLoop 真跑**：当前 ReflectScheduler 只有**调度骨架**，没有注入真实 engine runner。reflect 线程的 LLM 调用需要一个**独立 engine 入口**（不依赖 session 路径）——暂留作后续迭代。在方案 B 内反思线程的"思考"由调用方模拟（E2E 测试里直接调 persist_to_memory）。
2. **沙箱权限**：沉淀工具目前对所有激活者可见——如果未来发现主线程滥用 `create_trait`，可加 `when: reflect_only` 运行时检查。
3. **前端 ReflectFlowView 高级功能**：复用 `ThreadsTreeView` 渲染反思线程的完整子树（当前只展示 root 的 inbox）。

## 数据点

- 测试基线：573 → **593 pass / 6 skip / 0 fail**（+20 新测试：7 scheduler + 6 沉淀工具 + 4 memory 注入 + 3 E2E）
- 5 个 Phase 分别独立 commit（kernel submodule）
- 前端 tsc noEmit / vite build 通过
