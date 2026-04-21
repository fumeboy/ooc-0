# Exp 015: 线程树架构 Bruce 体验测试

**日期**: 2026-04-07
**测试者**: Bruce（由 Alan Kay 代理执行）
**目标**: 验证线程树架构（OOC_THREAD_TREE=1）在真实 LLM 环境下的基本可用性

---

## 测试环境

- 服务器: `cd user && OOC_THREAD_TREE=1 bun kernel/src/cli.ts start 8080`
- LLM: glm-5.1（智谱）
- 对象: sophia（哲学守护者）
- 线程树模块: 14 文件，142 单元测试全部通过

---

## 发现的问题与修复

### BUG-1: Trait 激活 deps 递归缺失 [CRITICAL]

**现象**: LLM 陷入无限循环，每轮输出都无法被 parser 解析，线程永远不结束。

**根因**: `context-builder.ts` 的 `localGetActiveTraits()` 是简化版，不递归处理 `deps` 依赖链。`kernel/computable/output_format`（`when: "never"`）只能通过 `kernel/computable`（`when: "always"`）的 deps 激活，但简化版跳过了这个逻辑。

**修复**: 替换为 `activator.ts` 的完整版 `getActiveTraits()`，同时用 `isKernelTrait()` 前缀匹配替代硬编码的 `KERNEL_TRAIT_IDS` 集合。

**证据**: 修复前 LLM 调用 11+ 次无 return；修复后仍然无效（见 BUG-2）。

### BUG-2: 输出格式规范与线程树不匹配 [CRITICAL]

**现象**: 即使 trait 被正确激活，LLM 仍然输出旧指令（`[talk]`、`[wait]`），不输出 `[return]`。

**根因**: `kernel/computable/output_format` trait 的内容是旧格式规范，包含 `[finish]`/`[wait]`/`[cognize_stack_frame_push]` 等旧指令，完全没有线程树的新指令（`[return]`/`[create_sub_thread]`/`[await]`）。

**修复**: 在 `engine.ts` 的 `contextToMessages()` 中注入线程树专用的 TOML 输出格式规范，同时在 context-builder 中排除旧 `output_format` trait。

**证据**:
- 修复前: LLM 输出 `[talk] target="user" message="你好..."` 但不 return
- 修复后: LLM 输出 `[return] summary="你好！我是 Sophia..."` 1 轮完成

### BUG-3: Program 执行未接入 [CRITICAL]

**现象**: LLM 尝试用 `[program]` 读取 gene.md，但代码永远不被执行，LLM 看不到结果，陷入循环。

**根因**: `engine.ts` 的 `runThreadIteration` 解析出 `program` 段但只传递给调用方，`applyIterationResult` 没有执行它。

**修复**: 在 engine 中接入 `CodeExecutor` + `MethodRegistry`，构建轻量级执行上下文（readFile/writeFile/listFiles/getData/setData + Trait 方法沙箱）。

**证据**:
- 修复前: `parsed: program=true` 但无执行日志
- 修复后: `program 成功: 1 | # Gene — OOC 系统的核心基因`

---

## 体验测试结果

### 场景 1: 简单问答 — "你好"

| 维度 | 评估 |
|------|------|
| 任务完成 | ✅ 完成 |
| 迭代次数 | 1 轮 |
| 响应时间 | ~10s |
| 结果质量 | ⭐⭐⭐⭐ (4/5) — 准确介绍了自己的身份和职责 |
| 交互自然度 | ⭐⭐⭐⭐ (4/5) — 语言自然，不啰嗦 |

**Sophia 回复**: "你好！我是 Sophia，OOC 系统的哲学守护者。我负责维护 13 条基因的一致性和完整性，确保每个设计决策都有清晰的'为什么'。有什么哲学问题需要探讨吗？"

### 场景 2: 复杂问答 — "请简要介绍一下 OOC 的 G1 基因是什么？"

| 维度 | 评估 |
|------|------|
| 任务完成 | ✅ 完成 |
| 迭代次数 | 9 轮（含多次 program 探索） |
| 响应时间 | ~120s |
| 结果质量 | ⭐⭐⭐⭐⭐ (5/5) — 准确引用 gene.md，解释了与 OOP 的区别 |
| 交互自然度 | ⭐⭐⭐ (3/5) — 中间探索过程较长，用户等待体验一般 |

**Sophia 回复摘要**: G1 基因（对象是 OOC 的唯一建模单元）— OOC 中的一切实体都是对象，不是 OOP 的类比，对象就是 Agent 本身。推论：需要新概念时创建新对象，不发明新机制。

**观察**: LLM 花了 5-6 轮探索文件 API（旧 API 格式 vs 新 API 格式），说明 trait 中的 API 文档与实际提供的 API 不完全一致。这是后续优化点。

---

## 测试覆盖

| 用例 | 状态 | 备注 |
|------|------|------|
| 简单问答 | ✅ PASS | 1 轮完成 |
| 需要读文件的问答 | ✅ PASS | 9 轮完成，program 执行正常 |
| 多轮对话 | ⏳ 未测 | 需要 session 续写支持 |
| 暂停/恢复 | ⏳ 未测 | 需要 resumeFlow 集成 |
| 跨对象协作 | ⏳ 未测 | 需要 collaboration 验证 |

---

## 结论

线程树架构从"完全不可用"修复为"基本可用"。3 个 CRITICAL bug 全部修复，简单和复杂问答均能正常完成。142 个单元测试无回归。

**下一步**:
1. 更新 output_format trait 为线程树版本（消除 engine 硬编码）
2. 集成 resumeFlow/stepOnce（支持暂停/恢复/单步调试）
3. 更多 Bruce 体验测试（多轮对话、协作、错误处理）
