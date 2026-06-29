---
title: F5 · storybook 框架现状盘点 + 推荐演进路径
status: landed
date: 2026-06-29
follows: 2026-06-29-runtime-server-web-roadmap.md
---

# F5 · storybook 框架现状 + 演进路径

## 背景

来自 roadmap `2026-06-29-runtime-server-web-roadmap.md` F5 项。用户明确说"梳理和更新 storybook"——本 issue 是「梳理」部分（现状盘点 + 推荐路径），不动代码；实际「更新」由后续 issue 推进。

## 现状（实勘 2026-06-29）

### 设计权威说什么

`docs/ooc-6/storybook/`（4 份 markdown）描述 storybook = OOC **统一能力目录 / 测试框架**：
- **Tier A**（控制面确定性、零真 LLM、可 CI gate）：每特性一个 `stories/<cap>.story.ts` 导出 `runControlPlane()`，由 `stories/_control-plane.test.ts` 收为 bun:test
- **Tier B**（agent-native、真 LLM、env-gated、过程可见）：`runAgentNative()` 对运行中 world 派任务
- 实现位置：`packages/@ooc/storybook/`
- 输出：`docs/ooc-6/storybook/dashboard.md` 覆盖矩阵 + `stories-report.md`

`stories-outline.md` 把 storybook 细化为**单元化 stories**：每条对应一个稳定预期（≤100 字）+ 锚定 OOC 设计；按 L0/L1/L<n> 分层（L0 = Persistable 落点 / L1 = Session 生命周期 / ...）。

### 代码实际状态

**`packages/@ooc/storybook/` 不存在**。整个 storybook 框架在代码侧从未建造。

**实际承担 storybook 角色的是 `packages/@ooc/tests/`**（27 个 `.test.ts` 文件、134 cases）：

| 文件 | cases | 能力覆盖 |
|---|---:|---|
| app-server | 3 | app 启动 + thread CRUD endpoint |
| dispatch-guide-form | 4 | executable guide form 引导 |
| dispatch-view-surface-gate | 5 | executable × readable surface 守门 |
| feishu | 2 | extendable 飞书接入 stub |
| flow-scan | 3 | persistable flow 扫描 |
| knowledge-activator | 9 | knowledge intent 激活 |
| **lifecycle-on-reload** | **6** | lifecycle on_reload 派发（issue 2026-06-28）|
| persistable-versioned-fields | 6 | persistable 字段级版本化 |
| persistence | 1 | persistable 基础 |
| pr-deliver | 1 | reflectable PR 投递 |
| refcount-gc | 5 | object 生命周期 refcount + GC |
| reflectable | 3 | reflectable 基础 |
| reflectable-redesign-issue-d | 12 | reflectable issue D 重设计 |
| registry | 5 | ObjectRegistry |
| registry-method-guide | 6 | method/guide 注册 cohesion |
| registry-window-default | 8 | readable window decl default 约定 |
| render-readable | 4 | readable 渲染单入口 |
| **server-lifecycle-integration** | **3** | F1 server WorldRuntime 集成（本 issue 同伴）|
| stone-hydration | 1 | persistable stone hydrate |
| thinkloop-e2e | 5 | thinkable thinkloop e2e |
| thread-readable-views | 11 | thread 三视角投影（issue I）|
| thread-runtime | 5 | thread ThreadRuntime facade |
| thread-scheduling | 6 | thread 跨 session 调度（issue G）|
| thread-window-method-dispatch | 3 | thread window method 派发 |
| tools-open | 3 | executable open tool 原语 |
| web-e2e | 2 | web build + http loop 串通 |
| window-view-issueJ | 12 | readable window_view 字段（issue J）|

**总计**：27 files / 134 cases。绝大多数能力**已被实际测试**——不是"零 storybook"，而是"storybook 框架未独立化"。

### 差距分析

| 维度 | 设计权威 | 实际 | 差距 |
|---|---|---|---|
| 框架物理位置 | `packages/@ooc/storybook/` | `packages/@ooc/tests/` | 仅命名/组织不同 |
| Tier A 覆盖 | 9 特性 × N stories | 134 cases 散落 | **覆盖率高，缺矩阵** |
| Tier B 覆盖 | `runAgentNative()` 真 LLM 演示 | 仅 `thinkloop-e2e` mock LLM | **缺 Tier B 入口** |
| 输出 | `dashboard.md` 矩阵 + `stories-report.md` | 不存在 | **缺仪表盘** |
| 能力目录视角 | 每条 story 锚定 OOC 设计元素 | 部分 test 头注释锚 issue | **缺 design 字段索引** |
| CI gate | `bun run test:storybook` | `bun run verify`（含 tests/） | **复用现 gate，OK** |

## 推荐演进路径

按 OOC 哲学（克制熵增 / 复用先于新引入）：**不另造 `packages/@ooc/storybook/`**——它会与 `packages/@ooc/tests/` 形成双轨。应**就地升级 tests/ 为 storybook**：

### Phase A · 最小可消费（本 issue 范围内可做）

1. **生成 dashboard.md**：扫 `tests/*.test.ts` 产出覆盖矩阵（文件 → cases → 锚 issue），落到 `docs/ooc-6/storybook/dashboard.md`。本 issue 已含上表（手写）；自动化后续。
2. **每个 test 文件头注释规范化**：建议格式 `锚 issue / 设计元素 / Tier`，让 grep 能扫出能力索引。这是约定、非框架。

### Phase B · Tier B 入口（独立 issue）

3. **`packages/@ooc/storybook/agent-native/runner.ts`**：env-gated（`RUN_STORYBOOK_AGENT=1`）的 real-LLM runner，对运行中 server 派任务，抽过程轨迹。这是真新建——**与 tests/ 不冲突**（独立目录、独立 CI gating）。
4. **agent-native scenarios**：1-2 个种子场景（如 lifecycle on_reload 真热更端到端、reflectable 自我迭代 PR 流程）。

### Phase C · 覆盖矩阵自动化（独立 issue）

5. **`scripts/storybook-dashboard.ts`**：bun 脚本扫 `tests/`，结合 `git log -- <file>` 拿最近 issue 关联，自动产出 `dashboard.md`。

### Phase D · stories-outline 落地（独立 issue / 增量）

6. 按 `stories-outline.md` 把 L0-L<n> 单元化 stories 一条条匹配现 tests 的实际 case。**重点不是新写，而是为已 covered 的 case 加 L<n>-<slug> 标签**。

## 改动提案（本 issue scope）

**仅 Phase A**（最小可消费）：

1. 写 `docs/ooc-6/storybook/dashboard.md` 反映现状（手写矩阵 + 推荐演进段）—— 替代当前过期的设计文档
2. 在 `packages/@ooc/tests/README.md`（新建）说明 tests 即 storybook、约定 test 头注释格式
3. **不动任何 .test.ts 源码、不建 storybook package**

## 受影响设计元素

- `## app` —— 无影响
- 无任何维度核心 / 内置对象 / 跨维度契约影响

## 风险与权衡

- **风险**：保留 docs/ooc-6/storybook/ 设计文档可能给后人误导（觉得 packages/@ooc/storybook/ 应存在）。缓解：dashboard.md 首段明确「framework 不独立化、tests/ 即 storybook、Phase A-D 路径」。
- **权衡**：另造 packages/@ooc/storybook/ vs 就地升级 tests/。**选就地**——已 134 cases 不应推倒重来。

## 待裁决点

按用户授权独立推进，自裁决：

1. **就地升级 tests/ 还是另造 packages/@ooc/storybook/?** → 就地（避双轨）
2. **本 issue 是否只做 Phase A?** → 是（最小、独立可 verify）
3. **Tier B 真 LLM runner 何时做?** → 独立 follow-up（F5-B），优先级 < F2/F3
4. **删 docs/ooc-6/storybook 旧设计文档?** → 不删，但 dashboard.md 顶端加「设计 vs 现实」段，让后人理解差距

## 裁决

按改动提案推进 Phase A，3 步落地。涉及零 source code、纯文档；不必 worktree。

## 落地验收

（landed 后启动验收 review：（1）dashboard.md 反映实际 134 cases 矩阵；（2）tests/README.md 描述 storybook 角色 + 约定；（3）docs/ooc-6/storybook/dashboard.md 不与现实冲突；（4）后续 issue 在 tests 加 case 时自然遵守约定）
