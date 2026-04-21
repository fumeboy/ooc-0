# Skill 系统 + 可观测性框架 + 指令生命周期与渐进式 Trait 加载

<!--
@ref docs/meta.md — extends — Skill 系统、可观测性、指令生命周期
@ref docs/superpowers/specs/2026-04-10-skill-system-design.md — spec
@ref docs/superpowers/specs/2026-04-11-observability-framework-design.md — spec
@ref docs/superpowers/specs/2026-04-12-command-lifecycle-progressive-trait-design.md — spec
-->

## 变更概述

**日期**: 2026-04-10 ~ 2026-04-12

**变更类型**: 新功能 + 架构重构

**影响范围**: kernel/src/skill/, kernel/src/thread/, kernel/traits/, library/skills/

---

## 一、Skill 系统

### 背景
主流 AI Agent 生态普遍采用 Skill 概念，OOC 需要兼容支持。Skill 是纯 prompt 模板，与 Trait（能力 + 方法）并列独立。

### 实现
- `kernel/src/skill/` 模块：types.ts + loader.ts + index.ts
- SKILL.md 格式：YAML frontmatter（name, description, when）+ Markdown body
- 存储位置：`library/skills/`
- 两阶段加载：启动时只读 frontmatter 生成索引，`[use_skill]` 指令触发时才读 body
- Context 注入：skill 索引作为 knowledge ContextWindow 注入
- 按需加载：engine 解析 `[use_skill]` → 读取 body → 写入 inject action

### 关键文件
- `kernel/src/skill/{types,loader,index}.ts`
- `kernel/src/thread/parser.ts` — `[use_skill]` 解析
- `kernel/src/thread/engine.ts` — useSkill 处理
- `kernel/src/thread/context-builder.ts` — skill 索引注入
- `library/skills/hello/SKILL.md` — 示例 skill
- `library/skills/calc/` — 带 Node.js 脚本的示例 skill

---

## 二、可观测性框架

### 背景
系统缺乏快速定位问题的手段。暂停时才能看到 LLM 输入输出，且恢复后文件被删除。

### 实现
- `kernel/src/thread/debug.ts` — writeDebugLoop, computeContextStats, extractDirectiveTypes
- HTTP API 动态开关：`POST /api/debug/enable|disable`，`GET /api/debug/status`
- 每轮 ThinkLoop 持久化到 `threads/{threadId}/debug/loop_NNN.{input,output,thinking,meta}.{txt,json}`
- meta.json 包含：LLM 延迟/token 统计、context 各区域字符数、激活的 trait/skill、解析出的指令类型

### 关键文件
- `kernel/src/thread/debug.ts`
- `kernel/src/thread/engine.ts` — debug 记录集成
- `kernel/src/server/server.ts` — debug API 路由
- `kernel/src/world/world.ts` — _debugEnabled 标志

---

## 三、指令生命周期与渐进式 Trait 加载

### 背景
14 个 kernel trait 全部 `when: always`，每轮 instructions 占 16K chars（53% of context），大量浪费。

### 实现

#### Form 模型
- 每个指令有 begin/submit/cancel 三阶段生命周期
- begin 时系统加载相关 trait，submit/cancel 时卸载
- 同类型 form 可并行（引用计数），不同类型也可并行
- `kernel/src/thread/form.ts` — FormManager 实现

#### 渐进式 Trait 加载
- 新增 `kernel/traits/base/TRAIT.md`（唯一 always trait，极简基座）
- 所有其他 kernel trait 改为 `when: never` + `command_binding`
- trait 通过 `command_binding.commands` 声明关联的指令
- `collectCommandTraits()` 收集需要加载的 trait
- activator 改动：`when: never` 的 trait 如果在 scopeChain 中仍可激活

#### Trait 重组
- file_ops, file_search, shell_exec, web_search, testable 移入 computable 子目录
- 指令 → trait 映射：program → computable 系列，talk → talkable，return → talkable+reflective+verifiable

#### LLM 输出格式改进
- `[thought]` 从 LLM 输出中移除，改由 thinking mode 自动记录
- parser 三层容错：提取 fence 块 → 剥离纯文本前缀 → 直接解析
- 格式错误重试：最多 3 次，追加错误提示重新调用 LLM

### 效果（debug 数据验证）

| 指标 | 重构前 | 重构后 |
|------|--------|--------|
| 空闲态 instructions | 16,607 chars | 973 chars（-94%） |
| 空闲态总 context | 31,459 chars | 9,596 chars（-70%） |
| 空闲态 tokens | 13,584 | 4,719（-65%） |
| 有效轮次比例 | 22%（2/9） | 92%（11/12） |

### 关键文件
- `kernel/src/thread/form.ts` — FormManager
- `kernel/src/thread/parser.ts` — form 解析 + 三层容错
- `kernel/src/thread/thinkloop.ts` — form 透传
- `kernel/src/thread/engine.ts` — FormManager 集成 + thinking→thought + 格式重试
- `kernel/src/thread/hooks.ts` — collectCommandTraits
- `kernel/src/trait/activator.ts` — when:never + scopeChain 激活
- `kernel/src/trait/loader.ts` — command_binding 解析
- `kernel/src/types/trait.ts` — commandBinding 字段
- `kernel/traits/base/TRAIT.md` — 极简基座
- `kernel/traits/computable/output_format/TRAIT.md` — 更新的输出格式规范
