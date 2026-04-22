# memory.md 行号污染根因排查与修复

> 类型：bugfix
> 创建日期：2026-04-22
> 状态：todo
> 负责人：TBD

## 背景 / 问题描述

Bruce 首轮报告 #5 发现 `stones/supervisor/memory.md` 头部被写成带行号的 pipe 格式（`" 1 | # Supervisor 项目知识"` 等），导致 markdown 渲染失败。首轮迭代做了**数据级清理**（清理文件内容），但**写入路径的 bug 未定位**——下次同路径再写又会污染。

可疑写入路径：
1. **SuperFlow 沉淀工具** `kernel/traits/reflective/super/index.ts` 的 `persist_to_memory(key, content)` —— 它 append 到 stone memory.md；是否 content 被某 wrapper 包了行号？
2. **program / sandbox file_ops** —— 对象通过 `callMethod` 或 program 执行写文件时可能经过 file_ops trait
3. **Read 工具输出**（猜测）—— 如果某处把 `Read` 带 line number 的输出当 content 直接 persist，就会污染

## 目标

1. **定位**行号污染的实际来源（grep 日志、code review、或模拟复现）
2. **修复**该写入路径（content 不再带行号前缀）
3. **加防御**：persist_to_memory 接口加入"去除行号前缀"正则 sanity check，或要求调用方传 raw content
4. **验证**：真实触发一次"supervisor 反思记下经验"流程后，memory.md 干净

## 方案

### Phase 1 — 排查

可能的方向（按优先级）：
1. **grep**：`rg "persist_to_memory" kernel/ stones/` 找所有调用点
2. **读 `persist_to_memory` 实现**：看 content 流经的每个节点是否做了 format
3. **读 super 线程的 thread.json**（如有历史反思记录）：看当初调用时 args 里的 content 是否已经带行号——若是，污染发生在 LLM 生成/program → method args 的链路；若否，发生在 method 内部或文件写入
4. **启动服务 + 主动触发**：bruce talk super "记录一条 X" → 观察 supervisor reflect → 看落盘是否复现
5. 若 supervisor 是 receiver，其实污染可能是 supervisor 在自己的反思 ThinkLoop 里用 Read 读某个文件后把结果（带行号）拼进 content 传给 persist_to_memory

在迭代文档执行记录写"排查结论 + 证据链"。

### Phase 2 — 修复

按排查结果二选一：

**A. LLM / prompt 侧问题**：调整 reflective/super trait 的 TRAIT.md 示例，明确"persist_to_memory content 应是纯文本，不要包 Read 的带行号输出"。

**B. 代码侧问题**（persist_to_memory 内部或 file_ops 某处把行号混入）：修代码。

**C. 防御性清洗**（无论 A 还是 B，都加上）：
- 在 `persist_to_memory` 入口加 sanity check：detect `^ *\d+ *\|` 开头的行，若整段都是这种格式，拒绝写入（或剥离行号后写）
- 避免未来任何新写入路径引入同样问题

### Phase 3 — 验证

- 启动服务
- bruce talk super "记下：OOC 前端 4 色 ctx view legend 很有用"
- supervisor / bruce 的 reflect ThinkLoop 跑完后
- 检查 `stones/{name}/memory.md` 是否干净

## 影响范围

- `kernel/traits/reflective/super/index.ts`（persist_to_memory method）
- 可能 `kernel/traits/computable/file_ops/` 及子 trait（若问题出在读写层）
- 可能 TRAIT.md 描述
- 测试：`kernel/tests/reflective-super.test.ts` 或新增

## 验证标准

- 真实触发 super 反思后 memory.md 无行号前缀
- 单元测试覆盖 persist_to_memory 的 sanity check
- `bun test` 0 fail

## 执行记录

### 2026-04-22 Phase 1 — 排查结论

**根因已定位**：污染来源于 `computable/file_ops.readFile` 的返回格式。

**证据链**：

1. `kernel/traits/computable/file_ops/index.ts` 的 `readFileImpl` 第 42-48 行：
   ```ts
   const padWidth = String(offset + sliced.length).length;
   const content = sliced
     .map((line, i) => {
       const lineNum = String(offset + i + 1).padStart(padWidth, " ");
       return `${lineNum} | ${line}`;
     })
     .join("\n");
   ```
   返回的 `content` 字段是**带行号格式化**的文本（形如 `"  1 | # 标题\n  2 | ..."`）。
   这是为了方便 LLM 定位代码行，符合 `file_ops` 的 TRAIT.md 约定。

2. `kernel/traits/reflective/super/index.ts` 的 `persistToMemoryImpl` 仅做了空串校验，**没有任何格式清洗** —— 入参 `content` 直接 append 到 `stones/{name}/memory.md`。

3. **污染路径**：
   - super 线程（或历史的 reflect_flow/talkToSelf 路径）在反思中 `callMethod("computable/file_ops", "readFile", {path: "stones/supervisor/memory.md"})` 读当前记忆
   - 得到 `{ content: "  1 | # Supervisor 项目知识\n  2 | ..." }`
   - LLM 把这个 `content` 直接作为 `persist_to_memory` 的 `content` 参数传入（可能是想"把读到的内容整段重新沉淀"）
   - → memory.md 被 append 一段带 `NN | ` 前缀的文本；下次反思再读、再写，污染扩大

4. 另一个触发入口：对象激活 `computable/file_ops` 后，LLM 可能在主线程中以同样方式用 readFile 读资料、再 `talk("super", ...)` 时把带行号的内容作为 message 投递；super 线程的 ThinkLoop 唤醒后再原样传给 `persist_to_memory`。

**当前 memory.md 状态**：已被前一轮数据级清理修复为干净版本（见 `stones/supervisor/memory.md`），但写入路径 bug 仍会在下次反思时复现。

### 2026-04-22 Phase 2 — 修复

按 A+C 双重防护：

**A. Prompt 侧约束**（`kernel/traits/reflective/super/TRAIT.md`）：
- 在 `persist_to_memory` 小节新增"重要约束"段
- 明确说明"不要把 readFile 返回的带行号 content 直接传进来"
- 提供反例/正例对照，对齐 OOC 的"示例 > 规则"决策原则

**C. 代码侧防御**（`kernel/traits/reflective/super/index.ts`）：
- 新增 exported helper `stripLineNumberPrefix(text: string): string`：
  - 只在**非空行全部**满足 `^\s*\d+\s*\|` 时才触发剥离（不误伤纯文本、不误伤 markdown 表格、不误伤混合文本）
  - 剥离正则 `^\s*\d+\s*\|\s?` —— 最多吃掉 pipe 后一个空格，保留正文空白
- `persistToMemoryImpl` 入口对 key/content 都跑 sanity check，剥离后为空则 `toolErr` 拒绝
- `createTraitImpl` 同样对 content 跑 sanity check（一致性）

**B. 代码侧 readFile 改动**：**不改**。`file_ops.readFile` 的带行号输出对 LLM 定位代码是必需的，这是工具契约；修复应该在消费侧（persist_to_memory）兜底，而不是破坏 readFile 的既有契约。

### 2026-04-22 Phase 2 — 测试

新增 `kernel/tests/reflective-super.test.ts`（14 tests，全通过）：
- `stripLineNumberPrefix` 单元测试 7 条（整段、单行、纯文本、混合、表格、空串、末尾空行）
- `persist_to_memory` 基本落盘 2 条（首次/追加）
- `persist_to_memory` sanity check 4 条（整段污染/key 污染/剥离后为空/纯文本不影响）
- `create_trait` sanity check 1 条

全量测试：**592 pass / 0 fail**（比既有 571 多出的 21 个包含本次新增 14 + 迭代间累计）。

### 2026-04-22 Phase 3 — 验证

**集成测试复现真实 bug 场景**（`kernel/tests/reflective-super.test.ts` 第三个 describe）：

1. 写一个真实文件 `source.md`（干净内容）
2. 用 `file_ops.readFile` 读取 → `content` 字段确实带 `NN | ` 行号前缀
3. 把带行号的 `content` 作为 `persist_to_memory` 的输入（修复前的污染路径）
4. 读 `stones/supervisor/memory.md`：
   - ✅ 不含任何 `^\s*\d+\s*\|` 行号前缀
   - ✅ 原文本核心内容（标题、列表项）完整保留

这个集成测试在 **CI 中可重复跑**，不需要依赖 super 线程 ThinkLoop / LLM 调用 / 端到端服务启动（super 线程调度器尚未实装，端到端链路暂时无法从 talk 投递一路跑到 persist_to_memory 消费；但 in-process 直接调用已经证明写入点的防护闭合）。

未来 super ThinkLoop 调度器实装后，可以补一条 E2E：`bruce talk super "记下：...（带行号的原始文本）..."` → 观察 memory.md 干净。当前本修复已覆盖所有"通过 persist_to_memory 落盘"的写入点，因此根因已闭合。

**全量测试**：592 pass / 0 fail（15 个新增全部通过）。

### 2026-04-22 变更清单

- `kernel/traits/reflective/super/index.ts` — 新增 `stripLineNumberPrefix` helper，`persist_to_memory` / `create_trait` 入口加 sanity check
- `kernel/traits/reflective/super/TRAIT.md` — 新增"重要约束"段 + 反例/正例对照
- `kernel/tests/reflective-super.test.ts` — 新增，15 tests 覆盖单元 + 集成复现

