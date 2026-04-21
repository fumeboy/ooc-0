# 统一 title 语义 + 旧 Flow 清理决策

> 讨论日期：2026-04-21  | 状态：已结论（本日落地为代码）
> 相关迭代：`工程管理/迭代/all/20260421_feature_统一title参数清理child_title.md`
> 前置讨论：`2026-04-21-自叙式行动标题与TOML路径退役.md`（同日上午）
> 发起人：Alan Kay

## 问题陈述

上一轮迭代（20260421 title 参数）落地时，为了让 tool-call 的 `title` 能同时覆盖 create_sub_thread 的子线程名场景，临时引入了 `child_title` 字段 + `args.child_title ?? args.title` 的 fallback 逻辑。结果：

- submit 的 schema 里两个语义近似的字段（`title` = 行动标题，`child_title` = 子线程名）并存；
- engine 两处 create_sub_thread 分支都要做一次 `?? fallback`；
- trait 文档里还要专门解释"什么时候用哪个"；
- CLAUDE.md 的"不考虑旧版本兼容"原则被违反——既然是新设计，就不该先做兼容再"以后改"。

**同时**：上轮遗留 17 个 fail test（OOC_API_KEY 缺失、旧 Flow pause/resume、git trait CWD 依赖）没有处理，形成技术债。

## 关键观点

### 观点 A — 对 create_sub_thread 来说，tool call 的 title 天然就是新子线程的名字

**论点**：语义上，「这次 tool call 在做什么」和「要创建的子线程是什么」是**同一件事**，不需要两个字段。

例如：`submit(title="分析任务", command="create_sub_thread", ...)` 读起来天然就是"创建一个叫'分析任务'的子线程"——把 title 同时当作新节点的名字，不产生歧义。

相反，如果硬要区分"行动标题"（描述本次 submit）和"子线程名"（描述被创建的对象），在 create_sub_thread 这个 case 下只会制造冗余：LLM 要写两段基本一样的文字，观察者看两处内容基本一致的信息。

**收益**：
- schema 减少一个字段，token 成本下降；
- engine 去掉 fallback 分支，代码更直；
- TRAIT.md 说明从"区分 title 和 child_title"改为"title 即子线程名"，一句话。

### 观点 B — 旧 Flow 架构清理放到独立迭代

**论点**：调研发现旧 Flow 架构 **不是完全死代码**——`Flow` 类被线程树架构**反向依赖**（`_wrapThreadTreeResult` 把线程树结果包装成 Flow 返回给 HTTP 层），`ReflectFlow` 机制（对象常驻自我对话）的线程树等价物尚未实现，server.ts 的 debug 接口也依赖 `Flow.load`。

彻底退役旧 Flow 需要做四件事：
1. 为线程树设计新的 session 落盘格式（替代 Flow.load 的使用）；
2. 为 ReflectFlow 写线程树等价物；
3. 重写 server.ts 的 `/pending-output`、`/debug-mode` 接口；
4. 重写 world.ts 的 talkToSelf / replyToFlow。

每一项都是独立工作量级，合起来几乎是重写 world/session 模块。把这 4 件事塞进"清理 child_title"迭代违反"最小改动"原则，且会稀释本次迭代的聚焦度。

**决策**：本迭代阶段 B 仅产出调研报告（写入迭代文档），旧 Flow 退役列为独立迭代。

### 观点 C — 失效测试按根因分三类处理，能修尽修，不能修明确 skip

**论点**：17 个 fail 混在一起长期不处理，会让 `bun test` 的信号噪音被稀释——"总有几个在 fail 但不要紧"是危险的心智。

三类根因的处理优先级：
1. **环境依赖类**（OOC_API_KEY、CWD）→ 能修则修，测试不应依赖全局 env；
2. **代码/测试不一致类**（renderThreadProcess 空 actions）→ 修测试对齐当前实现（后者是合理设计）；
3. **旧 Flow 架构细节类**（thinkloop pause/resume、inline_before）→ 阶段 B 决定不修旧 Flow，所以 `test.skip` + 注释明确原因。

**结果**：17 fail → 1 skip + 0 fail。skip 数可视为"Flow 退役独立迭代的 backlog 计数"。

## 已达成的共识

1. **create_sub_thread 只用一个 title 字段**。废除 `child_title` 和 `args.child_title ?? args.title` fallback。这次 tool call 的行动标题就是子线程的名字，同一字段双重含义但语义不冲突。
2. **旧 Flow 架构保留，独立迭代退役**。meta.md 的架构过渡说明更新为描述当前双轨现实（线程树默认 + 旧 Flow 被反向依赖）。
3. **失效测试要么修要么 skip，不能长期漂浮**。skip 必须带中文注释说明去向。
4. **不先做兼容再重构**。CLAUDE.md 原则：有新设计就一步到位，不要留"过渡字段"给未来的自己打扫。这一条的反面教材是上轮的 child_title。

## 未决问题

1. **旧 Flow 退役什么时候做？** 调研清单已成型（重新设计 session 格式 + ReflectFlow 线程树等价物 + server.ts debug 接口 + world 的 talkToSelf/replyToFlow）。建议单独 brainstorm 一次，确认线程树架构下 ReflectFlow 的模型（可能是"reflect"专用 root thread？），再开迭代。
2. **LLM 对统一后 title 的使用质量**：上轮体验验证里 bruce 的 5 个 tool call 标题都还算贴切。本轮再验证一次（创建子线程场景），观察 LLM 是否会在 title 里写冗长信息试图塞进"行动 + 子线程名"两个点——目前观察：title = "子线程1：写一首春天的现代自由诗" 这种格式已经自然融合了两个语义，没有卡壳。
3. **skip 的失效测试**是否在 Flow 退役迭代中一起删除？倾向于"删"——旧 Flow 退役意味着 thinkloop 本身消失，这些测试无处可测。届时 skip → 删除一步到位。

## 后续动作

- [x] 本次落地：commit `709edc4`（阶段 A 代码）+ `f053adc`（阶段 C 测试清理）。
- [ ] 开独立迭代"旧 Flow 架构退役"，依据本次调研清单设计方案。
- [ ] 下次对象协作场景中观察 LLM 的 title 质量：是否能区分"行动"和"子线程名"？如果观察到偶发混淆，加 bias 引导。

## 与前置讨论的关系

本讨论推翻了 `2026-04-21-自叙式行动标题与TOML路径退役.md` 中"观点 C：child_title 作为新字段 + title fallback"这一渐进方案。原方案的判断是"schema 演化采用渐进式"——但实测两个字段的冗余很快显现，LLM 在训练上不需要"渐进"，直接给一个干净字段更好。教训：**schema 的演化不等同于 API 的版本迁移，LLM 没有历史调用需要兼容**。

前置讨论关于 title 参数本身价值（G5 注意力痕迹、G11 UI 自我表达）的结论不变。
