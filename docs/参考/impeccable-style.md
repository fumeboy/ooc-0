# impeccable.style — AI 设计 Skill 工具包

> 来源：推文实测 + https://impeccable.style + https://github.com/pbakaus/impeccable

## 是什么

为 AI 编程助手（Claude Code、Cursor、Gemini CLI 等）增加设计能力的 Skill 包。17 个设计命令，覆盖审计、优化、风格调整等场景。

安装：`npx skills add pbakaus/impeccable`

## 推荐工作流（来自实测）

推文作者强调：**用 Claude Code 系列效果好，Codex 效果差**。

对于设计风格克制的项目，推荐流程：

1. `/teach-impeccable` — 先扫描现有组件，形成 CLAUDE.md 记忆。**不做这步会乱改你的设计**
2. `/critique` — 组件级别挑毛病。粒度太粗会泛泛而谈，建议单组件粒度
3. `/distill` — 去掉不必要的样式，精简到本质
4. `/normalize` — 保持组件间的一致性

## 全部 17 个命令

| 命令 | 用途 |
|------|------|
| `/teach-impeccable` | 一次性设置：扫描设计上下文，保存到配置 |
| `/critique` | UX 设计评审：层级、清晰度、情感共鸣 |
| `/audit` | 技术质量检查（a11y、性能、响应式） |
| `/normalize` | 对齐设计系统标准 |
| `/distill` | 精简到本质，去除冗余 |
| `/polish` | 发布前最终打磨 |
| `/clarify` | 改善不清晰的 UX 文案 |
| `/optimize` | 性能优化 |
| `/harden` | 错误处理、i18n、边界情况 |
| `/animate` | 添加有目的的动效 |
| `/colorize` | 引入策略性色彩 |
| `/bolder` | 放大平淡的设计 |
| `/quieter` | 降低过于大胆的设计 |
| `/delight` | 添加愉悦感 |
| `/extract` | 提取为可复用组件 |
| `/adapt` | 适配不同设备 |
| `/onboard` | 设计引导流程 |

命令支持可选参数定位范围，如 `/audit header`、`/polish checkout-form`。

## 对 OOC 的启发

1. **Skill 即 Trait 的外部形态**：impeccable 的每个 `/command` 本质上是一段带上下文的 prompt。OOC 的 Trait 系统（readme + code）可以实现类似能力，且更灵活（支持代码执行）
2. **teach 先行**：先学习现有风格再改动，避免 AI 按自己的审美乱改。对应 OOC 的 `activateTrait` + Context Window 机制
3. **组件级粒度**：AI 设计评审在组件级别最有效，太粗会泛泛。对应 OOC 对象的粒度设计原则
4. **渐进式流程**：critique → distill → normalize 是一个从发现问题到精简到统一的渐进流程，可以作为行为树模板
