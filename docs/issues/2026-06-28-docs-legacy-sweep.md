---
title: 仓库根 docs/ 历史目录退潮 sweep（6-21 之前的设计推理痕迹一次性归档/删除）
status: landed
date: 2026-06-28
---

# 仓库根 docs/ 历史目录退潮 sweep

## 背景 / 动机

CLAUDE.md 工作素质段写：「软件开发工作就像一场潮汐，新增功能、设计就像一次涨潮，但一定伴随着一场退潮：那就是对废弃、失效的代码、文档的清理」。`docs/` 目录是 OOC 自举之前（6-21 及更早）累积的全部设计推理痕迹，目前已被对象树（`.ooc-world-meta/stones/main/objects/supervisor/`）和 docs/issues/ 流程完整接替——这是 OOC 历史上规模最大的一次退潮债务。

CLAUDE.md `## 进入项目时必读` 段（CLAUDE.md:28）已经为退潮赋予法理：「`meta/` 与 `docs/ooc-6/` 的旧设计文档正按维度吸收进对象树后逐步删除；与代码冲突时一律信代码。」`meta/` 目录在 06-28 commit `b9cbb972` 已彻底删除，**`docs/` 是该退潮闸门下尚未完成的另一半**。

## 现状

### 量级（2026-06-28 实测）

- 顶层 `docs/` 下：
  - **75 份** `.md`（仓库根直接散落的设计文档，5-08 ~ 6-21 跨 6 周累积）
  - 11 个子目录，共 **305 份** 文件（含 `.md` / `.ts` / `.json` / `.log` / `.html` / `.png` / `.tsx`）
  - **187 份** `.md` 总计
- 各子目录规模（按文件数 / 体积）：

  | 子目录 | 文件数 | 体积 | 性质 |
  |---|---:|---:|---|
  | `docs/round-14-experience/` | 84 | **12M** | 6-15 体验官 round-14 截图 + 驱动脚本 + raw log（一次性产物） |
  | `docs/superpowers/{plans,specs,status}/` | 54 | 864K | 5-08 ~ 5-31 计划/规格/状态 三类文档 |
  | `docs/round-5-experience/` | 33 | **3.4M** | 体验官 round-5 截图 + raw log（一次性产物） |
  | `docs/plans/` | 26 | 564K | 5-12 ~ 5-22 各种 plan |
  | `docs/refactor_0604/` | 11 | 300K | 6-04 一次重构的过渡产物 |
  | `docs/ooc-6/` | 8 | 80K | **保留** — CLAUDE.md:129 引用其 `storybook/` 作为 storybook 框架设计权威 |
  | `docs/brainstorms/` | 6 | - | 5 月 brainstorm |
  | `docs/solutions/` | 5 | - | 早期方案 |
  | `docs/meta_refactor/` | 2 | - | 6-09 meta 包重构记录 |
  | `docs/recordings/` | 1 | - | sentry-factor 录像 |
  | `docs/ooc-8/` | 0 | - | **空目录** |

### 时间线

- 整个 `docs/` 最后一次有 git commit **= 2026-06-21**（最末 commit `8cb54530 docs: A2 前端消费方 + stone-scope 原则实现计划(6 phase)`）
- 自 06-22 起所有设计推理迁入 `.ooc-world-meta/stones/main/docs/issues/`，截至今天 06-28 该目录已积 39 份 issue，覆盖 P~A 多维度收口
- `docs/` 自此**完全静止**——无人再读、无人再写、无人再链回

### 引用核查（被引用风险）

| 引用方 | 命中数 | 性质 |
|---|---:|---|
| 源代码 `packages/@ooc/` | **0** | 完全无依赖 |
| 对象树 `.ooc-world-meta/.../objects/` | **0**（仅 1 处 `lifecycle.md:100` 引 `docs/issues/` 是相对 `.ooc-world-meta/stones/main/docs/issues/`，**不引仓库根 docs/**） | 零真实跨界引用 |
| 仓库根 `CLAUDE.md` | 1 处（CLAUDE.md:129 引 `docs/ooc-6/storybook/dashboard.md` + `framework-design.md`） | **仅 `docs/ooc-6/storybook/` 是活引用，其余无引用** |
| `docs/` 内部互引 | 大量 | 内部封闭引用网，对外零依赖 |

**结论**：除 `docs/ooc-6/storybook/` 外，整个 `docs/` 目录对当前 OOC 系统是**孤岛**——删除不影响任何 live 代码、对象树、CI gate。

### 与对象树的关系

`docs/` 大量文档承载的设计已被对象树吸收：

- `docs/superpowers/specs/2026-05-08-thinkable-llm-client-design.md` → 现在 `objects/supervisor/children/thinkable/self.md` 是权威
- `docs/2026-06-21-object-activation-lifecycle-design.md` → 现在 `objects/supervisor/children/object/knowledge/lifecycle.md` 是权威（落地经 `.ooc-world-meta/stones/main/docs/issues/2026-06-21-object-activation-lifecycle.md`）
- `docs/refactor_0604/persistable.md` → 现在 `objects/supervisor/children/persistable/self.md` 是权威
- `docs/2026-06-14-context-redesign-impl-plan.md` → 由 issue C/D/E/N 等多 issue 落地，对象树各 self.md 已吸收

**对象树是当前唯一设计权威**（CLAUDE.md `## 进入项目时必读` 段反复强调）；`docs/` 历史推理与对象树冲突时按 CLAUDE.md 法理「**与代码冲突时一律信代码、设计冲突一律信对象树**」。

## 改动提案

### 总原则

**「保留 1 个、归档 0 个、删除其余」** —— 一次性手术清退。

### 三档分类

**A · 保留**（活引用、当前权威）：

- `docs/ooc-6/storybook/` 整目录（4 份文件）—— CLAUDE.md:129 活引用，storybook 框架设计权威

**B · 删除**（与对象树重复、被 issue 覆盖、一次性产物）：

- `docs/` 根目录 75 份 `.md` 全部删除（5-08 ~ 6-21 散落设计文档）
- `docs/superpowers/`（54 份，5-08 ~ 5-31 spec/plan/status）
- `docs/plans/`（26 份）
- `docs/refactor_0604/`（11 份）
- `docs/round-14-experience/`（84 份，含 12M 截图与 raw log）
- `docs/round-5-experience/`（33 份，含 3.4M 截图与 raw log）
- `docs/brainstorms/`（6 份）
- `docs/solutions/`（5 份）
- `docs/meta_refactor/`（2 份）
- `docs/recordings/`（1 份）
- `docs/ooc-8/`（空目录）
- `docs/ooc-6/` 下 4 份顶层 `.md`（`index.md` / `class-abstraction.md` / `dogfooding-probe-design.md` / `self-iteration-frontier.md`）—— **仅保留其 `storybook/` 子目录**

合计预计删除：约 300 份文件、约 17M 体积。

**C · 不动**：本仓库其他任何路径。

### 不引入归档分支

历史推理痕迹**仍由 git 历史持有**——任何被删文件可经 `git log --all --diff-filter=D -- docs/<path>` 找回。不另开 `archive/` 分支或单独 archive 目录——避免熵增、避免「半活半死的副本」。

### 同步 CLAUDE.md

CLAUDE.md:28 现状描述：「`meta/` 与 `docs/ooc-6/` 的旧设计文档正按维度吸收进对象树后逐步删除」—— 落地后改写为「`meta/` 与 `docs/` 旧设计文档已吸收进对象树并清退（commit `<sha>`），仅保留 `docs/ooc-6/storybook/` 作为 storybook 框架设计权威。」

## 受影响设计元素

对照 supervisor `knowledge/index.md` 的 `##` 元素清单，本提案是**纯仓库卫生**——不动任何设计元素的契约。但若放宽到「设计权威源」层面：

- `## 对象树 / supervisor` —— 本提案显式确认对象树是 OOC 系统设计的唯一权威；删除 `docs/` 是兑现「权威单源」的物理动作。

无任何维度核心 / 内置对象 / 跨维度契约被改动。

## 风险与权衡

### 真实风险（可控）

1. **历史推理可追溯性**：删除后，若想读 5-8 ~ 6-21 期间某个设计的推理过程，得回到具体 commit 看历史 file。
   - 缓解：git 历史完整保留；任何被删 path 都能经 `git log --all --diff-filter=D -- <path>` 或 `git show <sha>:<path>` 拿回。
   - 实际收益：对当前/未来工作而言，「对象树 + docs/issues/」已是完整设计权威；回看 `docs/` 历史推理是**罕用场景**，不值得每次都付目录浏览的认知税。

2. **若有未对象树吸收完毕的设计**：理论上可能存在某些设计仅活在 `docs/` 而未被对象树吸收。
   - 缓解：本 issue review 阶段，**派一个 sub agent 做 sweep 前的 sanity check**——按维度（thinkable / executable / readable / persistable / collaborable / reflectable / visible / observable / app）抽样扫 `docs/` 找「对象树未吸收的设计」，回流后再删。
   - 兜底：删除经 `git rm`，commit 标题清晰 → 真发现遗漏 7 天内 revert 简单。

3. **CLAUDE.md 文本一致性**：上述「与对象树冲突时一律信代码」论断在 `docs/` 删除后变得**没有失活物可对照**，文案需相应更新。
   - 落地动作明确：commit 同步改 CLAUDE.md:28。

### 权衡选择

- 「**全删** vs 部分保留」：部分保留=熵增（必须给每个保留项写"为什么留"），最终演变为新的 `docs/legacy/` 子树，不解决问题。**全删（除 storybook/）最干净**。
- 「**一次删完** vs 分多次按维度灰度」：分多次=拖长退潮、容易死在一半。`docs/` 既已完全静止（06-22 起零 commit）、源码与对象树零依赖，**一次删完最干净**。
- 「**保 round-* 体验报告**（有截图、可作 e2e demo）vs 删」：体验报告价值 = 截图 + log，对应 round 的实际 e2e 价值已经被对象树 `objects/supervisor/knowledge/example-cases.md` 吸收 + `tests/e2e/web-e2e.test.ts` 持续验证。截图本身 15M、不进未来工作流；**删**。

## 待裁决点

1. **是否真要全删 docs/ 根 75 份 .md 与全部子目录（除 docs/ooc-6/storybook/）？**
   - 推荐：是。
   - 替选：保留 `docs/round-*-experience/` 作 e2e 历史 demo——但其价值已被 `tests/e2e/` 替代。

2. **是否同步更新 CLAUDE.md:28？**
   - 推荐：是，作为本 issue landed 时的 commit 同步动作。

3. **sweep 前 sanity check 是否必做？**
   - 推荐：必做，且作为本 issue review 阶段的必修动作（派 sub agent 按维度扫一遍找「对象树未吸收的设计」），结果归入本 issue review 段。这是「涨潮必退潮」的体面退潮——而非粗暴清场。

4. **删除颗粒度：是 `git rm -rf docs/`（保留 docs/ooc-6/storybook/）还是按子目录分批 commit？**
   - 推荐：**一次 `git rm` 删完，但分 3 个 commit** —— (a) 删 docs/ 根 .md 75 份，(b) 删大子目录（round-* + superpowers + plans + refactor），(c) 删剩余小目录 + 改 CLAUDE.md:28。便于回滚定位、commit message 信息密度高。

## review 记录

### 2026-06-28 完整性批评官 sanity check（supervisor 亲自执行）

按 review fan-out 派一个完整性批评官即可（无具体设计元素受影响）。Supervisor 亲自抽样扫 `docs/` 找「对象树未吸收的设计 / 工程惯例 / 方法论」，结果：

**A · 已被对象树充分吸收（安全删）**：
- 维度设计类（thinkable/executable/readable/persistable/collaborable/reflectable/visible/observable/app）→ 全部由 `objects/supervisor/children/<dim>/self.md` + `knowledge/` 承接，对象树是当前唯一权威
- 5-08 ~ 6-21 全部 spec/plan/design `.md` → 后续 issue（特别是 06-25 issue A~P 大规模收口）已完整覆盖；行号锚的源码审计报告（如 `2026-06-10-cognitive-audit-report.md`）已对当前代码失对照价值
- 5 月 brainstorms drafting 需求 → 已落地为对象树
- `round-5-experience/` / `round-14-experience/` 体验报告 → 价值已被 `objects/supervisor/knowledge/example-cases.md` + `tests/e2e/web-e2e.test.ts` 吸收
- meta_refactor 2 份 → meta 包已 06-28 删除（commit `b9cbb972`），refactor 工作流痕迹

**B · 真实风险点（需补承接后再删）—— 仅 2 处**：

1. **`docs/solutions/conventions/` 5 份**（工程惯例集）：
   - `llm-tool-handlers-fail-loud-2026-05-15.md` —— "LLM 工具 handler 必须 fail loud"
   - `reuse-before-introducing-new-concepts-2026-05-17.md` —— "复用先于新引入"
   - `llm-perception-as-api-contract-2026-05-17.md` —— "LLM 感知面即 API 契约"
   - `verify-as-you-go-2026-05-15.md` —— "verify each link as you create it"
   - `meta-concept-graph-2026-05-15.md` —— "meta concept graph"
   - **实际状态**：这些惯例**已经在对象树多处实践**（fail-loud 在 executable/self.md / knowledge/builtins/filesystem.md / 多处 issue；克制熵增在 issue 推理段反复体现；"复用先于" 是 06-25 inheritance-via-source-import-spread 的决策依据），**但没有集中归集成「工程惯例知识」**
   - 风险：删后这些惯例失去文字载体，仅靠散落实践不便新成员/sub agent 引用
   - **建议补位**：本 issue landed 前先派 sub agent 写一份 `objects/supervisor/knowledge/engineering-conventions.md`（或归入现有 `engineering-harness.md`），把这 5 条惯例归集，**再删 conventions/**

2. **`docs/methodology-cluster-rooting.md`**（工程方法论）：
   - 内容："把分散 Issue 收敛到根因层" 的方法论：当 backlog ≥ ~30 且多处 facet 同根时启动 cluster rooting，3 条契约 + 10 根因模型
   - **实际状态**：对象树无承接；当前 design-workflow.md 是「issue → review → 裁决 → 验收」单 issue 流程，**没有专门讲「多 issue 收敛到根因层」**
   - 风险：删后这套方法论失活；但 06-25 以来 issue 流程已稳定运行，cluster rooting 用得少（每个 issue 都单独 fan-out）
   - **建议补位**：本 issue landed 前先派 sub agent 把方法论吸收进 `objects/supervisor/knowledge/design-workflow.md` 末尾「关联方法」段（简短引用即可），**再删 methodology-cluster-rooting.md**

**C · 完整确认**：除 B 段 2 处外，无其他「对象树未吸收的设计」漏网。

### sanity check 结论

整体提案 **OK**，但落地路径需调整：从「一次性删除 + 改 CLAUDE.md」改为「**先补 2 处承接点 → 再做删除**」三步走。

## 裁决

### 落地路径（三步）

**Step 1 · 补承接点**（约 30-60 分钟）：
- 写 `objects/supervisor/knowledge/engineering-conventions.md`：归集 5 条工程惯例（fail-loud / reuse before introducing / LLM perception as API contract / verify-as-you-go / concept graph 双向锁定）；锚回对象树和源码现行实践
- 在 `objects/supervisor/knowledge/design-workflow.md` 末尾加「关联方法 · cluster rooting」段：简述「多 issue 收敛到根因层」触发条件 + 3 契约 + 10 根因模型
- 在 `knowledge/index.md` 索引段加上 `engineering-conventions` + `design-workflow.cluster-rooting` 引用

**Step 2 · 三个删除 commit**：
- (a) 删 `docs/` 根目录 75 份 `.md`
- (b) 删大子目录：`round-5-experience/` + `round-14-experience/` + `superpowers/` + `plans/` + `refactor_0604/` + `ooc-6/` 顶层 4 份（保 `ooc-6/storybook/`）
- (c) 删剩余小目录：`brainstorms/` + `solutions/` + `meta_refactor/` + `recordings/` + `ooc-8/`（空）

**Step 3 · 同步 CLAUDE.md**：CLAUDE.md:28 改为「`meta/` 与 `docs/` 旧设计文档已吸收进对象树并清退（commit `<sha>`），仅保留 `docs/ooc-6/storybook/` 作为 storybook 框架设计权威。」

合计：
- 保留：`docs/ooc-6/storybook/` 4 份
- 新写：`engineering-conventions.md` 1 份 + 修 2 份现有（`design-workflow.md` + `index.md`）
- 删除：约 300 份 / 约 17M
- 净效果：**对象树 +1 份承接，仓库根 -300 份历史推理痕迹**

### 不引入归档分支

历史仍由 git 持有，`git log --all --diff-filter=D -- <path>` 可追溯任何被删文件。

### 涉及源代码变更？

否——仅文档（对象树 + 仓库根）+ CLAUDE.md 修改。**无需 `.worktree/<slug>` 分支**。

## 落地验收

（待 landed 后启动验收 review：确认（1）docs/ooc-6/storybook/ 完整保留 / 其他全删；（2）CLAUDE.md:28 文案同步更新；（3）verify gate 仍绿；（4）git history 仍可经 `git log --all --diff-filter=D` 追溯被删文件）

---

**Supervisor 备注**：本 issue 由 06-28 三轮文档卫生（commit `68100be2` / `b9cbb972` / meta repo `2701601`）自然引向，归属同一退潮闸门。如不裁决 + 不落地，`docs/` 静止漂移会持续——「涨潮必退潮」的法理无法兑现。建议尽快走 review 流程裁决。
