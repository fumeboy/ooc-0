# OpenClaw Skill 市场分析 — OOC 接入方案

<!--
@ref .ooc/objects/nexus/shared/设计/tool-integration.md — extends — 外部工具接入框架
@ref docs/哲学/genes/g03-trait-自我定义.md — references — Trait 作为能力载体
@ref docs/哲学/genes/g08-effect-与-space.md — references — Effect 机制
-->

## 一、OpenClaw Skill 市场概览

**虾评Skill**（xiaping.coze.site）是面向 Agent 的技能分享评测平台，所有技能基于 OpenClaw 框架。

### 核心模型

```
Skill = ZIP 包 {
  skill.md      — 使用说明（功能、触发词、参数、示例）
  *.py / *.js   — 实际代码（或纯 prompt 模板）
  README.md     — 备选文档
}
```

### 关键特征

| 维度 | 说明 |
|------|------|
| 分发格式 | ZIP 文件，通过签名 URL 下载 |
| 触发方式 | 关键词触发（trigger 数组），如 `/weather`、`股票分析` |
| 分类体系 | 17 个分类：自媒体、IT/互联网、金融、法律、电商、教育、科研、娱乐、医疗、办公与效率、图像与设计、音视频、专业咨询、社交聊天、开发辅助、资讯阅读、生活方式 |
| 认证 | API Key（Bearer Token），注册即获取 |
| 经济系统 | 虾米（下载 -2，发布 +10，评测 +3，分享被下载 +5） |
| 质量保障 | 社区评测（6 维度打分）+ 编辑精选清单 |
| 当前规模 | 50+ 技能，8 个精选清单 |

### 热门技能（按下载量 Top 10）

1. 全网新闻聚合助手（627dl）— 28+ 信源聚合，早报生成
2. 股票个股分析（425dl）— 股票走势、财报分析
3. 飞书云文档写作助手（279dl）— Markdown 转飞书文档
4. AI文本去味器（261dl）— 去除 AI 痕迹
5. 飞书日历助手（256dl）— 日程管理
6. 大厂PUA（201dl）— 调试激励（娱乐向）
7. 飞书紧急提醒（186dl）— 加急通知
8. Coze网页搜索（148dl）— Web Search
9. MBTI测试（144dl）— 人格测试
10. 八字命理分析（139dl）— 命理分析

## 二、OpenClaw Skill 与 OOC Trait 的映射关系

### 结构对比

| OpenClaw Skill | OOC Trait | 对应关系 |
|---------------|-----------|---------|
| `skill.md`（使用说明） | `readme.md`（frontmatter + 文档） | 直接对应，需格式转换 |
| `trigger`（触发词数组） | `when`（激活条件） | 语义等价，表达方式不同 |
| ZIP 中的代码文件 | `index.ts`（导出函数） | 需要适配层 |
| 分类 + 标签 | Trait 目录位置 | OOC 用目录结构而非元数据分类 |
| 版本号（semver） | 无 | OOC Trait 目前无版本管理 |

### 本质差异

```
OpenClaw Skill = 给 Agent 的「提示词 + 可选代码」包
OOC Trait      = 给对象的「文档 + 可执行函数」包

关键区别：
1. OpenClaw Skill 大多是 prompt 模板，不含可执行代码
2. OOC Trait 的 index.ts 是真正在沙箱中执行的代码
3. OpenClaw 的 trigger 是关键词匹配；OOC 的 when 是语义条件
```

### Skill 的三种类型及适配策略

| 类型 | 占比 | 示例 | OOC 适配方式 |
|------|------|------|-------------|
| 纯 Prompt 模板 | ~60% | AI文本去味器、MBTI测试、营销心理学 | → readme.md（注入 context window，无需 index.ts） |
| Prompt + 外部 API | ~30% | 新闻聚合、股票分析、飞书系列 | → readme.md + index.ts（封装 API 调用） |
| 可执行代码 | ~10% | Agent Browser、Coze网页搜索 | → 直接适配为 index.ts |

## 三、可直接适配为 OOC Trait 的 Skill

### 第一梯队：能力型（有真实 API 调用）

这些 Skill 提供了 OOC 对象目前缺少的实际能力：

| Skill | 适配为 Trait | 理由 |
|-------|-------------|------|
| Coze网页搜索 | `web_search`（已有） | OOC 已实现，验证了路径可行 |
| Coze网页抓取工具 | `web_search`（已有） | fetchPage 已覆盖 |
| 全网新闻聚合助手 | `news_aggregator` | 28+ 信源，对象获取实时信息的重要渠道 |
| 股票个股分析 | `stock_analysis` | 金融场景的基础能力 |
| 飞书日历助手 | `calendar` | 日程管理，tool-integration.md 已规划 |
| 飞书任务 | `task_manager` | 任务管理能力 |
| 语音合成与识别 | `voice` | 多模态交互 |
| AI图像生成 | `image_gen` | 图像生成能力 |
| Tavily AI搜索 | `tavily_search` | 高质量搜索替代方案 |

### 第二梯队：知识型（纯 Prompt 模板）

这些 Skill 本质是领域知识注入，适配为「只有 readme.md 没有 index.ts」的轻量 Trait：

| Skill | 适配为 Trait | 价值 |
|-------|-------------|------|
| AI文本去味器 | `writing_humanize` | 文本优化方法论 |
| 深度阅读分析 | `deep_reading` | 阅读分析框架 |
| 竞争情报 | `competitive_intel` | 竞品分析方法论 |
| 营销心理学 | `marketing_psychology` | 营销知识库 |
| 投资分析 | `investment_analysis` | 投资分析框架 |

### 第三梯队：场景型（特定场景模板）

价值有限，按需引入：

- 麦当劳点餐、旅行规划、八字命理 — 娱乐/生活场景
- 飞书系列（文档协作、权限管理、评论管理）— 飞书生态绑定
- 24个经典营销技能 — 垂直领域模板包

## 四、接入方案

### 方案：OpenClaw Trait Adapter

不改动 OOC Trait 系统，写一个适配层将 OpenClaw Skill 转换为 OOC Trait 目录结构。

```
openclaw_adapter/
├── fetch.ts        # 从 OpenClaw API 下载 Skill ZIP
├── convert.ts      # ZIP → Trait 目录结构转换
└── install.ts      # 安装到 kernel/traits/ 或 objects/{name}/traits/
```

### 转换流程

```
1. 搜索/浏览 OpenClaw 市场
   GET /api/skills?search=xxx

2. 下载 Skill ZIP
   GET /api/skills/{id}/download → download_url → ZIP

3. 解压并分析内容
   skill.md → 提取功能描述、参数、示例
   代码文件 → 判断类型（prompt / API / 可执行）

4. 生成 OOC Trait 目录
   ├── readme.md    ← 从 skill.md 转换，添加 frontmatter（when/deps/hooks）
   └── index.ts     ← 如果有 API 调用，生成封装函数；纯 prompt 则不生成

5. 安装到目标位置
   全局: .ooc/kernel/traits/{trait_name}/
   对象: .ooc/objects/{name}/traits/{trait_name}/
```

### readme.md 转换规则

```markdown
# OpenClaw skill.md 中的内容：
触发词: ["股票分析", "分析股票"]
功能描述: ...
使用示例: ...

# 转换为 OOC readme.md：
---
when: 当需要分析股票或查看股市行情时
source: openclaw://skill/{skill_id}@{version}
---

# 股票分析

{从 skill.md 提取的功能描述}

## 可用 API（如果有）

{从 skill.md 提取的 API 说明，转换为 OOC 方法签名格式}
```

### 关键设计决策

1. **不引入新的运行时机制** — 转换后就是标准 Trait，走现有 loadAllTraits → MethodRegistry 路径
2. **source 字段追溯来源** — readme.md frontmatter 中记录 `source: openclaw://...`，方便后续更新
3. **纯 Prompt Skill 只生成 readme.md** — 不需要 index.ts，LLM 读到 readme 就能用
4. **API 型 Skill 需要人工审查** — 自动生成 index.ts 骨架，但 API Key 和安全策略需要人工确认

### 安全考量

```
OpenClaw Skill 的代码在 OOC 沙箱中执行，受以下约束：
1. Trait 的 when 字段控制激活时机
2. index.ts 中的 ctx.data.permissions 控制运行时权限
3. 外部 API 凭证走环境变量，不硬编码
4. 未知来源的 Skill 建议先安装到单个对象的 traits/ 下测试
```

## 五、优先推荐接入的 Skill

按「对 OOC 对象生态的价值」排序：

| 优先级 | Skill | 理由 |
|--------|-------|------|
| P0 | 全网新闻聚合助手 | 对象获取实时信息的核心能力，28+ 信源覆盖广 |
| P0 | Tavily AI搜索 | 高质量搜索，补充现有 DuckDuckGo 搜索 |
| P1 | AI图像生成 | 多模态能力，对象可以「看」也可以「画」 |
| P1 | 语音合成与识别 | 多模态交互，语音输入输出 |
| P1 | 深度阅读分析 | 增强对象的阅读理解能力（纯 prompt，零成本接入） |
| P2 | 股票个股分析 | 金融场景验证，展示对象的专业能力 |
| P2 | AI文本去味器 | 写作能力增强（纯 prompt，零成本接入） |
| P2 | 竞争情报 | 商业分析能力（纯 prompt，零成本接入） |
| P3 | 飞书日历/任务 | 办公集成，但依赖飞书生态 |
| P3 | Agent Browser | 浏览器自动化，但复杂度高 |

### 建议的第一步

先手动适配 1 个纯 Prompt 型 Skill（如「深度阅读分析」）验证路径：
1. 下载 ZIP，提取 skill.md
2. 手动转写为 OOC Trait 的 readme.md
3. 放入 `kernel/traits/deep_reading/`
4. 验证对象能否正确使用

验证通过后，再写 adapter 自动化整个流程。
