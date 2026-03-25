# obra/superpowers 深度分析

> GitHub: https://github.com/obra/superpowers
> 作者: Jesse Vincent (obra)
> 定位: AI 编码代理的技能框架 + 软件开发工作流

## 它解决什么问题

AI 编码代理（Claude Code、Cursor、Codex 等）的核心问题：跳过规划直接写代码，缺乏方法论，调试靠猜，没有质量门禁。

Superpowers 在代理启动时注入一套行为指南（"skills"），把无结构的编码变成有纪律的工程流程。

## 仓库结构

```
superpowers/
├── .claude-plugin/          # Claude Code 插件配置
├── .codex/                  # OpenAI Codex 适配
├── .cursor-plugin/          # Cursor IDE 适配
├── .opencode/               # OpenCode 适配
├── .github/                 # CI/CD
├── agents/
│   └── code-reviewer.md     # 代码审查代理 prompt
├── commands/
│   ├── brainstorm.md        # /brainstorm 命令
│   ├── execute-plan.md      # /execute-plan 命令
│   └── write-plan.md        # /write-plan 命令
├── hooks/
│   ├── hooks.json           # 会话启动时触发 session-start
│   ├── run-hook.cmd          # Windows 适配
│   └── session-start        # bash 脚本：注入 using-superpowers 技能到上下文
├── skills/                  # 14 个核心技能（详见下文）
├── tests/
├── GEMINI.md                # Gemini CLI 适配
├── gemini-extension.json
└── README.md
```

## 引导机制

### hooks/session-start

这是整个框架的入口。每次会话启动/恢复/清除/压缩时触发：

1. 定位插件根目录
2. 检查 `~/.config/superpowers/skills` 是否存在旧版技能，输出迁移警告
3. 读取 `skills/using-superpowers/SKILL.md` 内容
4. 转义为 JSON 安全字符串
5. 包装为 `EXTREMELY_IMPORTANT` 标记的上下文块
6. 根据平台（Claude Code vs Cursor）输出不同 JSON 格式注入

效果：代理一启动就知道 superpowers 框架的存在和使用方式。

### hooks/hooks.json

```json
{ "SessionStart": { "matcher": "startup|resume|clear|compact", "command": "session-start", "async": false } }
```

同步执行，确保技能在代理开始工作前就已注入。

## 14 个核心技能详解

### 技能文件结构

每个技能是一个目录：
```
skills/<skill-name>/
  SKILL.md                    # 必需：技能主文档
  supporting-file.*           # 可选：子代理 prompt、脚本等
```

SKILL.md 使用 YAML frontmatter：
```yaml
---
name: skill-name
description: "Use when... (第三人称，描述触发条件而非功能)"
---
```

### 1. Using Superpowers（框架入口）

技能优先级决策流：用户指令 > 技能规则 > 默认行为。

核心机制：
- 收到用户请求时，先检查是否有匹配的技能
- 列出常见的"合理化逃避"模式（"这个太简单不需要"、"我已经知道怎么做了"）
- 建立 red flags 清单帮助代理自检

### 2. Brainstorming（需求澄清）

**硬门禁**：在设计获批前，禁止任何实现行为（写代码、脚手架、调用实现技能）。

9 步流程：
1. 探索上下文
2. 提供可视化工具（需用户同意）
3. 每次只问一个问题，优先多选题
4. 提出 2-3 个方案
5. 逐节呈现设计，每节获批后继续
6. 写设计文档 → `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`
7. 派发 spec-document-reviewer 子代理审查（最多 5 轮）
8. 用户审批
9. 转入 writing-plans 技能

**反模式警告**：任何复杂度的项目都需要设计文档，包括 "todo list、单函数工具、配置变更"。

附带文件：
- `spec-document-reviewer-prompt.md` — 规格文档审查子代理 prompt
- `visual-companion.md` — 浏览器可视化工具指南
- `scripts/` — 辅助脚本

### 3. Writing Plans（计划编写）

将设计转化为可执行的实现计划。

核心原则：
- 每个任务 2-5 分钟可完成
- 面向"对代码库不熟悉的工程师"编写
- DRY、YAGNI、TDD

任务结构模板：
```markdown
## Task N: <name>
Files: Create: path/to/file.ts | Modify: path/to/existing.ts | Test: path/to/test.ts
- [ ] Write failing test for X
- [ ] Verify test fails
- [ ] Implement minimal code
- [ ] Verify tests pass
- [ ] Commit
```

**计划审查循环**：
- 每个 chunk（≤1000 行）写完后派发 plan-document-reviewer 子代理
- 被拒则修复后重新审查
- 超过 5 轮升级给人类

附带文件：
- `plan-document-reviewer-prompt.md` — 计划文档审查子代理 prompt

### 4. Subagent-Driven Development（子代理驱动开发）

**核心公式**：新子代理/任务 + 两阶段审查（规格 → 质量）= 高质量快速迭代

使用条件决策树：
1. 有实现计划？→ 没有则先 brainstorm
2. 任务大多独立？→ 紧耦合则用 executing-plans
3. 工作应留在当前会话？→ 是则继续

**每任务循环**：
```
派发 implementer → 回答问题 → 实现+测试+提交+自审
  → spec reviewer 审查 → 不过则修复+重审
  → code quality reviewer 审查 → 不过则修复+重审
  → 标记完成 → 下一任务
```

**Implementer 状态处理**：
- `DONE` → 进入 spec review
- `DONE_WITH_CONCERNS` → 评估关注点，正确性问题先处理
- `NEEDS_CONTEXT` → 补充信息后重新派发
- `BLOCKED` → 评估阻塞类型（上下文不足/推理能力不够/任务太大/计划有缺陷）

**模型选择指南**：
- 机械任务（单文件、清晰规格）→ 快速便宜模型
- 集成任务（多文件协调）→ 标准模型
- 架构/设计/审查 → 最强模型

**Red Flags（12 条禁令）**：
- 永远不在 main 上开始工作
- 永远不跳过任何审查阶段
- 永远不并行派发多个 implementer
- 永远不让子代理自己读计划文件（提供全文）
- **永远不在 spec 合规通过前开始 code quality 审查**

附带文件：
- `implementer-prompt.md` — 实现者子代理 prompt（含自审清单和状态报告格式）
- `spec-reviewer-prompt.md` — 规格合规审查 prompt（逐行对比实现与需求，不信任自述）
- `code-quality-reviewer-prompt.md` — 代码质量审查 prompt（单一职责、可测试性、文件结构）

### 5. Executing Plans（计划执行）

当不使用子代理时的替代方案。在当前会话中批量执行，带审查检查点。

### 6. Test-Driven Development（测试驱动开发）

**铁律**：NO PRODUCTION CODE WITHOUT A FAILING TEST FIRST

违反后果：删除所有已写代码，从头开始。不允许保留为"参考"。

RED-GREEN-REFACTOR 循环：
1. **RED**：写一个最小测试 → 运行 → 确认失败（不是报错）→ 确认失败原因是缺少功能
2. **GREEN**：写最简代码通过测试 → 不加额外功能 → 运行 → 确认通过
3. **REFACTOR**：消除重复、改善命名、提取辅助函数 → 保持绿色

**12 条合理化反驳**：
- "太简单不需要测试" → 简单代码也会出错，测试成本极低
- "先写后测效果一样" → 后写测试回答"这做了什么"，先写测试回答"这应该做什么"
- "保留代码作参考" → 会不自觉地适配，必须删除

**Red Flags（13 条）**：
- 先写代码再写测试
- 测试立即通过（说明测试无效）
- 用"精神而非仪式"为跳过辩护

### 7. Systematic Debugging（系统化调试）

**铁律**：NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST

四阶段流程（必须顺序执行）：

1. **根因调查**：完整读错误信息 → 稳定复现 → 查 git 历史 → 在组件边界加诊断 → 从症状反向追踪数据流
2. **模式分析**：找到类似的正常工作代码 → 完整阅读 → 列出所有差异 → 记录依赖和假设
3. **假设与测试**：形成单一具体假设 → 最小变更测试一个变量 → 验证结果
4. **实现**：先写失败测试 → 实现单一根因修复 → 验证不破坏其他测试 → 失败 3 次则质疑架构

**人类伙伴信号识别**：
- "那不是没发生吗？" → 你在假设而非验证
- "它会告诉我们...吗？" → 你缺少证据收集
- "别猜了" → 你在没理解的情况下提修复

### 8. Verification Before Completion（完成前验证）

**铁律**：NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE

五步门禁：
1. 确定能证明声明的验证命令
2. 执行完整命令（新鲜的，完整的）
3. 读完整输出，检查退出码，计数失败
4. 验证输出确认声明
5. 然后才能声明

**Red Flags**：
- 使用"应该"、"可能"、"似乎"等词
- 在验证前表达满意
- 信心 ≠ 证据

### 9. Dispatching Parallel Agents（并行代理派发）

使用条件：3+ 个失败测试文件有不同根因，多个独立子系统故障。

模式：
1. 按子系统分组故障
2. 每个域派发一个代理（带约束：不要改其他域的代码）
3. 并行执行
4. 验证结果无冲突

**禁止使用场景**：故障相关、需要全局理解、探索性调试、共享状态干扰。

### 10. Using Git Worktrees（Git 工作树）

目录选择优先级：`.worktrees` > `worktrees` > CLAUDE.md 偏好 > 用户选择 > `~/.config/superpowers/worktrees/`

安全验证：项目本地目录必须在 `.gitignore` 中。

创建后：自动检测包管理器 → 安装依赖 → 运行测试基线 → 报告就绪状态。

### 11. Requesting Code Review（请求代码审查）

核心原则："Review early, review often"

触发时机：每个子代理任务后（强制）、大功能后（强制）、合并前（强制）。

流程：获取 git SHA → 派发 code-reviewer 子代理 → 按严重级别处理反馈（Critical/Important/Minor）。

### 12. Receiving Code Review（接收代码审查）

**禁止表演性同意**：不允许 "Thanks for catching that!"、"Great point!"、"Let me implement that now"。

正确回应：复述需求 / 澄清问题 / 技术反驳 / 直接修复。

**来源区分**：
- 人类伙伴反馈 → 信任但仍需理解
- 外部审查者反馈 → 建议而非命令，需独立验证 5 个维度

**YAGNI 检查**：实现"专业"功能前，先搜索代码库确认是否真的在用。

### 13. Finishing a Development Branch（完成开发分支）

分支完成和集成的标准流程。（该文件内容未能获取）

### 14. Writing Skills（编写技能）

**核心理念**：编写技能就是对流程文档做 TDD。

**铁律**：NO SKILL WITHOUT A FAILING TEST FIRST

RED-GREEN-REFACTOR 用于技能：
1. **RED**：在没有技能的情况下运行压力场景 → 记录代理的行为和合理化借口
2. **GREEN**：编写技能文档针对性地反驳这些借口 → 重新运行 → 验证合规
3. **REFACTOR**：发现新的合理化漏洞 → 显式封堵 → 重测直到防弹

**CSO（Claude Search Optimization）**：
- description 字段决定 Claude 是否加载技能
- 必须描述"何时使用"而非"做什么"
- 测试发现：描述工作流会导致 Claude 按描述执行而不读全文

**Token 效率**：
- 常用技能 < 200 词
- 其他技能 < 500 词
- 用交叉引用代替重复内容

**防合理化技术**：
- 添加基础原则："违反规则的字面意思就是违反精神"
- 构建合理化对照表
- 创建 red flags 自检清单

## agents/code-reviewer.md

代码审查代理的完整 prompt。审查两个维度：
1. 规格合规（实现是否匹配需求）
2. 代码质量（清洁、可测试、可维护）

## commands/

三个用户可调用的命令：
- `/brainstorm` → 触发 brainstorming 技能
- `/write-plan` → 触发 writing-plans 技能
- `/execute-plan` → 触发 executing-plans 技能

## 与 OOC 的对比和启发

### 相似点

| 维度 | Superpowers | OOC |
|------|-------------|-----|
| 行为树/计划 | Writing Plans → 2-5 分钟任务 | Process 行为树 + focus 机制 |
| 结构化遗忘 | 每个 subagent 只看自己的任务规格 | focus 节点只看当前 actions |
| 自我定义 | Skills 定义代理行为 | Traits 定义对象能力 |
| 质量门禁 | 两阶段审查 | — |
| 并行执行 | Parallel Agent Dispatching | Scheduler 多 Flow 调度 |
| 防合理化 | 每个技能有 rationalization table + red flags | — |

### OOC 可以借鉴的

1. **两阶段审查模式** — 可以在 Flow 完成时加入验证步骤：先检查任务目标是否达成，再检查产出质量
2. **Brainstorming 前置** — 可以作为一个 kernel trait，在收到新任务时先澄清需求再规划
3. **防合理化机制** — 每个 trait 的 readme 中加入 "red flags" 和 "rationalization table"，显式封堵 LLM 的逃避路径
4. **验证铁律** — "NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE" 可以作为 computable trait 的规则
5. **CSO 思想** — trait 的 when 条件应该描述触发场景而非功能，这影响 LLM 是否正确激活 trait
6. **技能 TDD** — 用压力测试验证 trait 是否真的改变了 LLM 行为，而不是假设它会遵守

### OOC 的独特优势

1. **对象模型** — Superpowers 是纯方法论注入，没有持久化的对象概念。OOC 的 Stone/Flow 分离让对象有记忆和身份
2. **动态自我定义** — OOC 的 trait 元编程让对象在运行时创建和修改自己的能力，Superpowers 的 skills 是静态的
3. **跨对象协作** — OOC 的 talk/readShared 机制让多个对象自然协作，Superpowers 的并行代理之间没有通信
4. **结构化遗忘** — OOC 的 focus 机制是自动的上下文管理，Superpowers 靠 subagent 隔离来实现类似效果
5. **三级数据存储** — OOC 的 local/setData/persistData 提供了比 Superpowers 更精细的数据生命周期管理

## 参考来源

- [GitHub - obra/superpowers](https://github.com/obra/superpowers)
- [Superpowers: How I'm using coding agents (Oct 2025)](https://blog.fsck.com/2025/10/09/superpowers/)
- [Porting Skills to OpenAI Codex](https://blog.fsck.com/2025/10/27/skills-for-openai-codex/)
- [The Superpowers Framework - BetterStack Guide](https://betterstack.com/community/guides/ai/superpowers-framework/)
- [DeepWiki - obra/superpowers](https://deepwiki.com/obra/superpowers)
