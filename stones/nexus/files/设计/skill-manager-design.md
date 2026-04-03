# skill_manager 设计思考

<!--
@ref docs/哲学文档/gene.md#G1 — implements — 万物皆对象：skill 管理能力建模为独立对象
@ref docs/哲学文档/gene.md#G7 — implements — 目录即存在：skill_manager 目录存在即服务可用
@ref docs/哲学文档/gene.md#G8 — references — 消息传递：其他对象通过 talk 请求 skill
-->

## 为什么是一个独立对象

skill-in-ooc.md 分析了 Skill 的存储方案（最终推荐 `.ooc/skills/` 共享目录），但没有回答一个问题：**谁来管理这些 skill 的下载和安装？**

三个候选方案：

| 方案 | 做法 | 问题 |
|------|------|------|
| 硬编码 | 在 kernel 代码中写死下载逻辑 | 违反最小改动原则，kernel 不应关心市场细节 |
| 用户手动 | 让用户自己下载 skill 文件放到目录 | 体验差，不符合"对象能做事"的愿景 |
| **服务型对象** | 创建 skill_manager 对象专门负责 | 符合 G1，职责清晰，其他对象通过 talk 使用 |

选择方案三，理由：

1. **符合 G1（万物皆对象）** — skill 管理本身就是一种能力，应该被建模为对象
2. **解耦** — 其他对象不需要知道市场 URL、下载协议、缓存策略等细节，只需 talk 给 skill_manager
3. **可演进** — 未来可以支持多个市场源、skill 版本管理、自动更新，都在 skill_manager 内部完成
4. **可观测** — skill_manager 的 data.json 记录了所有已安装的 skill，一目了然

## 服务型对象模式

skill_manager 是 OOC 中"服务型对象"的典型案例：

- **不主动思考** — 只在被 talk 时响应
- **不持有领域知识** — 它管理 skill 但不使用 skill
- **状态简单** — 只需记录已安装列表和市场 URL
- **shared/ 即服务** — 安装的 skill 存在 shared/ 下，理论上其他对象也可以直接读取

这个模式可以复用到其他场景：config_manager、secret_manager、log_manager 等。

## 与 skill-in-ooc.md 方案的关系

skill-in-ooc.md 推荐的 `.ooc/skills/` 共享目录方案是 skill 的**存储层**设计。
skill_manager 是 skill 的**管理层**设计。两者互补：

- skill_manager 负责从市场下载 skill 到本地（当前存在 shared/ 下）
- 未来当 `.ooc/skills/` 目录机制实现后，skill_manager 可以直接安装到那里
- skill_manager 的 shared/ 目录是过渡方案，也是最小改动方案

## 交互流程

```
researcher: talk("skill_manager", "帮我安装 deep-reading skill")
    │
    ▼
skill_manager:
    1. 访问 https://xiaping.coze.site/skill.md
    2. 解析出 deep-reading 的内容
    3. 保存到 shared/deep-reading.md
    4. 更新 data.json.installed_skills
    5. 回复: "已安装 deep-reading skill，内容已保存到 shared/deep-reading.md"
    │
    ▼
researcher: talk("skill_manager", "给我 deep-reading 的内容")
    │
    ▼
skill_manager:
    1. 读取 shared/deep-reading.md
    2. 返回完整内容
```
