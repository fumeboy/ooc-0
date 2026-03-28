# Claude Code Skill → OOC Trait 映射分析报告

## 1. 概念映射

| Claude Code Skill | OOC Trait | 说明 |
|---|---|---|
| Skill（技能） | Trait（特质） | 都是为 Agent 注入额外能力/行为/知识的模块化单元 |
| Skill 的 markdown 内容 | Trait 的 readme | 都是以文本形式注入 Agent 的 context window |
| Skill 的触发条件（文件匹配等） | Trait 的 when 条件 | 控制何时激活 |
| Skill 市场（OpenClaw 等） | 尚无对应 | Claude Code 已有社区生态，OOC 需要建设 |
| `.mcp.json` 工具集成 | Trait 的 code (index.ts) | 提供可调用的函数/工具 |

## 2. Claude Code Skill 系统详解

### 2.1 Skill 的本质

Claude Code 的 skill 本质上是 **markdown 文件**，被注入到 Claude 的 system prompt 中。它们不是可执行代码，而是**指令文本**——告诉 Claude 在特定场景下应该如何行为。

### 2.2 Skill 的存储位置

Claude Code 支持三级 skill 存储：

1. **项目级** — `.claude/` 目录下，随项目版本控制
   - `.claude/settings.json` — 项目配置
   - `.claude/commands/` — 项目自定义命令（slash commands）
   - `.claude/CLAUDE.md` — 项目级指令文件
2. **用户级** — `~/.claude/` 目录下，跨项目生效
   - `~/.claude/settings.json` — 用户全局配置
   - `~/.claude/commands/` — 用户自定义命令
   - `~/.claude/CLAUDE.md` — 用户级指令文件
3. **社区/市场** — 通过 OpenClaw 等平台分享和安装

### 2.3 Skill 的类型

#### 类型一：指令文件（CLAUDE.md）

```markdown
# CLAUDE.md
当用户要求写 React 组件时：
1. 使用 TypeScript
2. 使用函数组件 + hooks
3. 添加 JSDoc 注释
4. 导出类型定义
```

这类 skill 是最基础的形式——纯文本指令，自动加载到 context 中。

#### 类型二：Slash Commands

存放在 `.claude/commands/` 目录下的 markdown 文件，用户通过 `/command-name` 触发：

```markdown
# .claude/commands/review.md
请对当前文件进行代码审查，关注：
1. 类型安全
2. 错误处理
3. 性能问题
4. 可读性
输出格式：按严重程度排序的问题列表
```

#### 类型三：MCP 工具集成

通过 `.mcp.json` 配置外部工具服务器，为 Claude 提供可调用的函数：

```json
{
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_TOKEN": "..." }
    }
  }
}
```

### 2.4 Skill 的触发机制

| 触发方式 | 说明 | OOC 对应 |
|---|---|---|
| 自动加载 | CLAUDE.md 始终注入 context | when: "always" |
| 用户触发 | /command 手动调用 | 用户消息中提及 → 激活 |
| 文件匹配 | 编辑特定文件时激活 | when: "当操作 X 类型文件时" |
| 上下文推断 | Claude 自行判断是否需要 | when: 自然语言条件 |

### 2.5 OpenClaw 市场

OpenClaw 是 Claude Code skill 的社区市场：

- **发布**：开发者将 skill 打包上传
- **搜索**：按关键词、分类、热度搜索
- **安装**：一键安装到本地 `.claude/` 目录
- **版本管理**：支持 skill 的版本更新
- **评分/评论**：社区反馈机制

## 3. 触发机制差异分析

### 3.1 Claude Code 的触发模型

Claude Code 的 skill 触发是**静态 + 隐式**的：

- CLAUDE.md 始终加载（静态）
- Slash commands 由用户显式触发
- 文件匹配规则在配置中声明
- 没有运行时动态激活/失活的概念

### 3.2 OOC 的触发模型

OOC 的 trait 触发是**动态 + 显式**的：

- `when: "always"` — 始终激活（类似 CLAUDE.md）
- `when: "never"` — 手动激活
- `when: "自然语言条件"` — 运行时由 kernel 判断是否激活
- `activateTrait(name)` — 程序化动态激活
- 认知栈节点声明 traits — 进入节点时激活，离开时失活

### 3.3 关键差异

| 维度 | Claude Code | OOC |
|---|---|---|
| 激活粒度 | 会话级（整个对话期间） | 栈帧级（可以精确到某个思考步骤） |
| 动态性 | 低（主要靠预配置） | 高（运行时动态激活/失活） |
| 组合性 | 所有 skill 平铺注入 | trait 可以按认知栈层级组合 |
| 上下文管理 | 全部加载，靠模型自行过滤 | 按需加载，节省 context window |
| 自我修改 | 不支持 | 支持（createTrait/editTrait） |

## 4. 能力差异分析

### 4.1 Claude Code Skill 能做但 OOC Trait 需要增强的

| 能力 | Claude Code | OOC 现状 | 建议 |
|---|---|---|---|
| 社区生态 | OpenClaw 市场成熟 | skill_manager 已有雏形 | 完善 skill_manager 的市场对接 |
| 一键安装 | `claude skill install xxx` | 需要手动 createTrait | 让 skill_manager 支持自动转换 |
| 项目级配置 | `.claude/` 目录约定 | 无项目级 trait 概念 | 考虑引入项目级 trait scope |
| 文件匹配触发 | 原生支持 glob 模式 | when 条件是自然语言 | 可以在 when 中支持结构化条件 |
| MCP 工具协议 | 标准化的工具调用协议 | trait code 是自由 JS | 考虑支持 MCP 协议兼容 |

### 4.2 OOC Trait 能做但 Claude Code Skill 做不到的

| 能力 | OOC Trait | Claude Code Skill |
|---|---|---|
| 自我修改 | createTrait/editTrait 运行时创建和修改 | 不支持运行时修改 |
| 认知栈绑定 | trait 绑定到思考步骤，精确控制上下文 | 无此概念 |
| 跨对象共享 | 对象间可以共享和推荐 trait | 仅限本地安装 |
| 动态激活 | activateTrait() 程序化控制 | 无运行时 API |
| 元编程 | trait 可以创建新 trait | 不支持 |
| 记忆集成 | trait + memory 协同工作 | skill 与记忆系统分离 |

## 5. 生态策略建议

### 5.1 兼容层：Claude Code Skill → OOC Trait 自动转换

设计一个转换器，让 Claude Code 社区的 skill 可以直接导入 OOC：

```
Claude Code Skill (markdown)
    ↓ 转换器
OOC Trait {
    name: 从文件名派生,
    when: 从触发条件映射,
    readme: skill 的 markdown 内容,
    code: 从 MCP 配置生成（如果有）
}
```

#### 转换规则

| Claude Code 元素 | 转换为 OOC |
|---|---|
| CLAUDE.md 内容 | readme 字段 |
| 文件名 | trait name（kebab-case） |
| slash command 的触发名 | 可以映射为 when 条件或保留为命令名 |
| MCP server 配置 | code 字段中的工具调用封装 |
| 文件匹配 glob | when 条件（结构化格式） |

### 5.2 skill_manager 增强

当前 skill_manager 已经具备基础能力（list、install、get、search）。建议增强：

1. **格式识别** — 自动识别 skill 是 Claude Code 格式还是 OOC 原生格式
2. **自动转换** — 安装时自动将 Claude Code skill 转换为 OOC trait
3. **双向同步** — OOC trait 也可以导出为 Claude Code skill 格式
4. **依赖管理** — skill 之间的依赖关系解析

### 5.3 分层生态

```
┌─────────────────────────────────────┐
│         OOC Trait 生态               │
│  ┌───────────────────────────────┐  │
│  │   OOC 原生 Trait              │  │
│  │   (支持全部 OOC 特性)          │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │   兼容层 Trait                 │  │
│  │   (从 Claude Code Skill 转换)  │  │
│  │   (支持基础特性)               │  │
│  └───────────────────────────────┘  │
│  ┌───────────────────────────────┐  │
│  │   MCP 工具 Trait               │  │
│  │   (封装 MCP 协议工具)          │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

## 6. 具体设计方案

### 6.1 Skill 导入 Trait：skill-importer

```typescript
// trait: skill-importer
// when: "当需要从 Claude Code 格式导入 skill 时"

interface ClaudeSkill {
  name: string;
  content: string;          // markdown 内容
  type: 'claude-md' | 'slash-command' | 'mcp-tool';
  trigger?: {
    fileGlob?: string;      // 文件匹配模式
    command?: string;        // slash command 名
  };
  mcp?: {
    server: string;
    command: string;
    args: string[];
    env?: Record<string, string>;
  };
}

interface OOCTrait {
  name: string;
  when: string;
  readme: string;
  code?: string;
}

function convertSkillToTrait(skill: ClaudeSkill): OOCTrait {
  const trait: OOCTrait = {
    name: toKebabCase(skill.name),
    when: mapTriggerToWhen(skill),
    readme: skill.content,
  };

  // 如果有 MCP 工具配置，生成 code
  if (skill.mcp) {
    trait.code = generateMCPWrapper(skill.mcp);
  }

  return trait;
}

function mapTriggerToWhen(skill: ClaudeSkill): string {
  if (skill.type === 'claude-md') return 'always';
  if (skill.trigger?.fileGlob) {
    return `当操作匹配 ${skill.trigger.fileGlob} 的文件时`;
  }
  if (skill.trigger?.command) {
    return `当用户使用 /${skill.trigger.command} 命令时`;
  }
  return 'never';  // 默认手动激活
}
```

### 6.2 when 条件增强：支持结构化条件

当前 OOC trait 的 when 字段是纯自然语言。建议扩展支持结构化格式：

```typescript
// 当前：纯自然语言
when: "当用户讨论 React 相关话题时"

// 增强：支持结构化条件（向后兼容）
when: {
  // 自然语言条件（保持兼容）
  description: "当用户讨论 React 相关话题时",
  // 结构化条件（可选，用于精确匹配）
  match: {
    keywords: ["react", "jsx", "component", "hooks"],
    fileGlob: "*.tsx",           // 兼容 Claude Code 的文件匹配
    messageContains: "React",     // 消息内容匹配
  }
}
```

这样既保持了 OOC 的灵活性（自然语言条件），又能兼容 Claude Code 的精确匹配模式。

### 6.3 MCP 协议兼容层

为 OOC trait 的 code 层增加 MCP 协议支持：

```typescript
// trait: mcp-bridge
// when: "当 trait 需要调用 MCP 工具时"

// 将 MCP tool call 封装为 OOC 可调用的函数
function createMCPTool(serverConfig: MCPServerConfig) {
  return {
    async call(toolName: string, params: Record<string, any>) {
      // 1. 启动 MCP server（如果未运行）
      // 2. 通过 stdio/SSE 发送 tool call
      // 3. 返回结果
    },
    async listTools() {
      // 列出 MCP server 提供的所有工具
    }
  };
}
```

### 6.4 Trait Scope 扩展

借鉴 Claude Code 的三级存储，为 OOC 引入 trait scope：

```
Trait Scope 优先级（高 → 低）：

1. 栈帧级（Frame Scope）
   - activateTrait() 或 create_plan_node 的 traits 参数
   - 仅在当前认知栈节点有效

2. 对象级（Object Scope）
   - 对象自身的 traits/
   - 跨任务持久存在

3. 系统级（System Scope）  ← 新增
   - 全局共享的 trait
   - 所有对象可用
   - 类似 Claude Code 的用户级 skill

4. 项目级（Project Scope）  ← 新增
   - 绑定到特定项目/工作空间
   - 类似 Claude Code 的 .claude/ 目录
```

## 7. 实施路线图

### Phase 1：基础兼容（1-2 周）

- [ ] 实现 skill-importer trait，支持 Claude Code markdown skill → OOC trait 转换
- [ ] 增强 skill_manager，支持格式识别和自动转换
- [ ] 编写转换测试用例

### Phase 2：触发机制增强（2-3 周）

- [ ] when 字段支持结构化条件（向后兼容）
- [ ] 实现文件 glob 匹配触发
- [ ] 实现关键词匹配触发

### Phase 3：MCP 兼容（3-4 周）

- [ ] 实现 mcp-bridge trait
- [ ] 支持 MCP server 的启动和管理
- [ ] 支持 MCP tool call 的封装

### Phase 4：生态建设（持续）

- [ ] Trait scope 扩展（系统级、项目级）
- [ ] OOC trait → Claude Code skill 反向导出
- [ ] 社区 trait 市场建设

## 8. 总结

Claude Code 的 skill 系统和 OOC 的 trait 系统在设计哲学上高度一致——都是通过模块化的方式为 AI Agent 注入能力。但两者在实现层面有显著差异：

**Claude Code Skill** 更像是「配置文件」——静态、声明式、依赖平台解析。它的优势在于简单直观和已有的社区生态。

**OOC Trait** 更像是「活的基因」——动态、可编程、可自我修改。它的优势在于灵活性和与认知栈的深度集成。

最佳策略不是二选一，而是**兼容并蓄**：
1. 通过兼容层吸收 Claude Code 社区的 skill 资源
2. 保持 OOC trait 的独特优势（动态激活、元编程、认知栈绑定）
3. 在 MCP 协议层面建立互操作性
4. 长期建设 OOC 自己的 trait 生态

OOC 的 trait 系统在架构上是 Claude Code skill 的超集。我们要做的不是追赶，而是在兼容的基础上发挥自身优势。
