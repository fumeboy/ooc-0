# Spec: kernel/README.md 重写

> 日期: 2026-03-28
> 目标: 重写 kernel/README.md，以 CS 博士的知识高度阐述 OOC 哲学，引用 Alan Kay 的 OOP 设计，介绍双 Git 仓库结构
> 读者: 中文 AI/Agent 开发者社区（技术术语保留英文）
> 风格: 平和、清楚，让思想自己说话，不炫学术

---

## 1. 整体结构

```
1. 标题 + 一句话定义
2. 哲学起源（Alan Kay → Agent 现状 → OOC 的回答）
3. 三大模块
   3.1 多对象协作体系
   3.2 思维与成长机制
   3.3 人机交互
4. 双仓库架构（图 + 说明）
5. 快速开始
6. 文档索引
```

预计总篇幅: 800-1000 字（不含代码块和 ASCII 图）。

---

## 2. 各节详细设计

### 2.1 标题 + 一句话定义

```markdown
# OOC — Object-Oriented Context

把 AI Agent 的上下文组织为「活的对象生态」。
```

简洁，不过度解释，让读者带着好奇往下读。

### 2.2 哲学起源

三层递进，约 300-400 字：

**层次 1: Alan Kay 的 OOP 原始愿景**

- 引用 Kay 1998 年名言: "I made up the term 'object-oriented', and I can tell you I didn't have C++ in mind."
- Kay 的 OOP 三个核心思想:
  - 对象是独立的计算机，不是数据容器
  - 消息传递是唯一的通信方式，不是方法调用
  - Late binding — 接收方决定如何响应消息，不是编译时绑定
- Kay 的生物学隐喻: 对象像细胞，每个细胞有完整的 DNA（身份），通过化学信号（消息）协作，细胞膜（封装）保护内部状态。整个有机体的智能从细胞的协作中涌现。

**层次 2: 当前 AI Agent 的退化**

- 我们用最强大的 LLM，却把它的上下文退化成了 Kay 批判的老路——一段不断膨胀的扁平文本，本质上就是"全局变量 + 过程调用"
- 传统 Agent 的三个结构性缺陷:
  - 无身份: 上下文没有"我是谁"的概念
  - 无边界: 所有信息混在一起，没有封装
  - 无成长: 对话结束，一切消散

**层次 3: OOC 的回答 — 从 Kay 到 Hewitt 到 OOC**

- 如果认真对待 Kay 的消息传递思想 → Agent 的上下文应该是自治对象的生态
- Carl Hewitt 的 Actor Model（1973）提供了形式化基础: 每个 Actor 有私有状态、邮箱、行为定义，只通过异步消息通信
- OOC 在此基础上加入了 Kay 没有预见到的维度: **对象能从经历中改写自身结构**（经验沉淀）。这不是 OOP，也不是 Actor Model——这是把"认知"作为一等公民的对象系统
- Smalltalk 的 late binding 在 OOC 中的体现: 对象收到消息后，由 LLM（而非编译器）决定如何响应——这是 late binding 的极致形式

### 2.3 三大模块

#### 模块一: 多对象协作体系

- 万物皆对象（G1）: OOC 中的一切实体都是对象——研究员、文件系统、项目空间、甚至世界本身
- 每个对象有身份（我是谁）、数据（我知道什么）、能力（我会做什么）、关系（我认识谁）
- 对象通过消息协作: talk（对话）、delegate（委托）、reply（回复）
- 每个对象只能看到自己的上下文，通过消息传递了解他者——这正是 Kay 所说的"封装"的真正含义
- 对象的关系汇聚成社交网络，协作从网络中涌现

#### 模块二: 思维与成长机制

- ThinkLoop: 对象通过"思考 → 输出程序 → 执行 → 反馈"的循环与世界交互
- 认知栈: 对象的运行时是一个栈，每帧同时包含"做什么"和"用什么来想"。深入子任务 = push，完成 = pop，遗忘 = pop 时释放局部信息
- Trait 是对象的自我定义单元——思考风格、行为规则、知识、方法都是 Trait
- 经验沉淀: 对象从经历中学习，通过"自我对话"（`reflect()` → ReflectFlow 审视）将有价值的经验沉淀为新的 Trait。知识 → 能力 → 直觉，Trait 在原地成长。（gene.md 中称此机制为 talkToSelf/SelfMeta，代码中实现为 `reflect()`/ReflectFlow）
- 智慧 = 帧 0 的厚度。新手需要很多帧才能完成一件事，专家的帧 0 已经内联了大量经验

#### 模块三: 人机交互

- 持久化即存在（G7）: 对象的目录就是它的物理存在。人类可以直接编辑 readme.md 改变对象的身份，编辑 traits/ 改变它的思维方式
- Pause 机制: 对象暂停时，系统写出完整的 Context 和 LLM 输出。人类可以查看思考过程，修改输出，然后恢复执行
- UI 是对象的面孔（G11）: 对象自己决定如何被人类看见，编写自己的 React 组件
- 即使系统没有运行，人类也可以通过编辑文件来"改造"对象——这是最直接的人机协作

### 2.4 双仓库架构

ASCII 图展示 user repo + kernel submodule 结构:

```
ooc/                          ← user repo（用户仓库，git 根）
├── .env                      ← 环境变量（API Key）
├── kernel/                   ← git submodule（内核仓库）
│   ├── src/                  ← 后端（TypeScript, Bun）
│   ├── web/                  ← 前端（React + Vite）
│   ├── traits/               ← Kernel Traits（基础能力）
│   └── tests/                ← 测试
├── docs/                     ← 文档（哲学、架构、设计）
├── stones/                   ← 对象持久化目录
└── flows/                    ← 会话数据
```

设计理由（简要说明）:
- 用户数据与内核代码分离: stones/、flows/、docs/ 属于用户，kernel/ 属于系统
- 独立版本控制: 用户仓库记录对象的成长历史，内核仓库记录系统的演进
- 无损升级: 更新 kernel submodule 不影响用户的对象和文档
- 统一入口: 从 user repo 根目录执行所有命令

### 2.5 快速开始

```bash
# 克隆（含 kernel submodule）
git clone --recursive <repo-url>

# 安装后端依赖
cd ooc && bun install

# 安装前端依赖
cd kernel/web && bun install && cd ../..

# 配置 API Key
echo "ANTHROPIC_API_KEY=your-key" > .env

# 启动服务
bun kernel/src/cli.ts start 8080
```

### 2.6 文档索引

指向关键文档的链接表:

| 文档 | 路径 | 内容 |
|------|------|------|
| 核心基因 | `docs/哲学文档/gene.md` | 13 条基因——OOC 的全部规则 |
| 涌现能力 | `docs/哲学文档/emergence.md` | 基因组合涌现的高阶能力 |
| 概念树 | `docs/meta.md` | 完整概念结构与工程子树 |
| 组织结构 | `docs/组织/` | 1+3 组织模型（Sophia/Kernel/Iris/Nexus） |

---

## 3. 写作约束

- 语言: 中文为主，技术术语保留英文（Object, Stone, Flow, Trait, ThinkLoop, Context, Actor Model 等）
- 风格: 平和、清楚，不堆砌术语，让概念自己发光
- Alan Kay 引用: 自然融入叙事，不刻意炫学
- 篇幅: 800-1000 字正文 + 代码块/图表
- 不包含: 内核 Traits 表格（太细节）、技术栈列表（放在文末一行即可）
- 文末一行: `TypeScript · Bun · Claude API · React · Vite`

---

## 4. 与现有 README 的差异

| 维度 | 现有 README | 新 README |
|------|------------|-----------|
| 哲学深度 | 无 | Alan Kay OOP → Hewitt Actor → OOC |
| 结构 | 散点列举 | 三大模块叙事 |
| 仓库说明 | 旧的 .ooc/ 单仓库结构 | 双仓库 + submodule |
| 项目结构图 | 只有 src/ | user repo + kernel submodule 全景 |
| 快速开始 | 过时命令 | 正确的 bun kernel/src/cli.ts 命令 |
| 文档索引 | 指向 .ooc/docs/ | 指向 docs/（user repo 下） |
