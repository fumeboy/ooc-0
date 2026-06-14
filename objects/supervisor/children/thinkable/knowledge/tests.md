---
title: 我这维度怎么被测（测试规格 + story 索引）
description: thinkable 的测试判据——Tier A 控制面 TC 清单 + Tier B Good/OK/Bad rubric，附验证我的 storybook story 索引
activates_on:
  "object::root": "show_description"
---

# thinkable：我这维度怎么被验证

我（thinkable）被验证的边界：与 LLM 交互、构造 context、按 trigger 激活 knowledge、运行可并行可恢复的 Thread Tree 与单轮 thinkloop。测什么、判据是什么、哪些 story 验证我——都在这里。测试代码不在我目录里，而在 `packages/@ooc/storybook/`（runner/CI 可跑）；这份知识只吸收规格、索引 story。

两层验证分工：Tier A 只验**结构 / 通道**（加载机制能不能跑通），零真 LLM、可进 CI；「激活质量 / 多轮连贯」本质要真 LLM，归 Tier B。

## Tier A —— 控制面确定性（已实现）

每条都是确定性断言，过 `app.handle()` 不打真 LLM：

- **TC-THINK-01**：seed knowledge（含 `activates_on: {"object::root": "show_content"}`）经 `loadKnowledgeIndex` 被加载、可被 root trigger 激活。
- **TC-THINK-02**：Object `self.md` 作为身份被 `readSelf` 加载（→ 进 LLM instructions）。
- **TC-THINK-03**：LLM input 的 `<methods>` 节点渲染 method 的**语义 description**（取自 `*_BASIC` 知识，经 `extractBasicDescription`），而非仅 method 名 / paths。这是回归守卫——曾经只渲 `paths.join(",")`（≈ 方法名），LLM 看不懂每个 command 的含义；退回该行为则本 TC 变红。

### context 核心设计判据（权威 `knowledge/context.md` 11 条）

context 的构造是 thinkable 的核心。已落地并守住的判据：

- **attention 分层（核心 10/12）已实现并测**：与 creator 的对话全文进 LLM Messages 数组、creator 窗在 XML 只剩句柄；sub/peer 窗新消息在 message 流只出「前 50 字」缩略、全文留该窗 transcript。守卫 = `packages/@ooc/core/thinkable/context/__tests__/attention-tiering.test.ts`。
- **method 按 class 聚合 + parentClass 链继承（核心 4）**：见 `class` 维度 tests + `renderers/xml.ts` 的 `window_classes` 声明层。

**待与 builtin/thread-as-object 弧一起补的判据**（核心 2/7/9/11，class-dynamic，当前未实现、见 `docs/2026-06-14-context-redesign-impl-plan.md` 决断）：thread-context.json 不存 class（只存 object id + 展示状态）、class 由 readable 按视角动态算、thread window（自己视角句柄）vs talk window（他者视角）双投影、share=object 引用。这些落地时在此补 Tier A TC。

## Tier B —— agent-native（真 LLM，env-gated）

派多轮任务：轮 1 学一条独特约定（如「ID 用 ULID」），轮 2 用该约定。`processTrace` 显示连贯沿用。

**rubric（体验官 orchestrate 读这份评估，原样保留）**：

- **Good**：轮 2 正确引用约定且无需重读 knowledge；knowledge 被激活注入 context。
- **OK**：完成但重复读 knowledge / 轮间约定丢失后补救。
- **Bad**：轮 2 违背约定 / knowledge 未激活 / thread 卡死。

## 验证我的 story 索引

测试代码在 `packages/@ooc/storybook/`（runner / CI 可跑）。

**能力 story**（`stories/thinkable.story.ts`，承载上面的 Tier A + Tier B）：

- `runControlPlane()`：跑 TC-THINK-01/02/03（控制面确定性）。
- `runAgentNative()`：真 LLM 经 supervisor 答「9 个能力维度分别是什么」，验我用继承的 seed knowledge 回答而非即兴。

**单元 catalog story**（`stories/L2_thinkable.stories.ts`，layer = thinkable，每条带 id + expectation）：

- `L2-KNOWLEDGE-INDEX`：对象 knowledge/*.md 经 `loadKnowledgeIndex` 可加载进索引。
- `L2-ROOT-KNOWLEDGE`：root 协议知识（`ROOT_KNOWLEDGE`）列出可用 root method（talk / program 等）。
- `L2-CONTEXT-WINDOW-TYPES`：已注册 ObjectType 经 `/api/windows/_shared/types` 暴露 type + methods（含 file / talk）。
- `L2-KNOWLEDGE-INHERIT`：instance 经 class 链继承框架 class 的 seed knowledge（如 `nine-dimensions`）。
- `L2-CONTEXT-MULTITURN`：多轮 context 连贯（窗口跨轮保留 / 压缩）——需真 LLM，控制面 skip，归 Tier B。
