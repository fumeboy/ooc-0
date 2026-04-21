# Agent Program 格式混淆问题

> 日期：2026-04-01
> 状态：已修复，待归档
> 优先级：HIGH
> 关联 Flow：task_20260401032449_ud6b、task_20260401164148_27n1、task_20260401170848_9nem、task_20260401180535_u1ng

---

## 问题描述

在执行飞书文档分析任务时，Agent 频繁犯语法错误。问题在 2026-04-02 的回归中升级为主链路失败；完成内核修复后，`用例009_飞书文档读取` 已重新通过。

**关联文件：**
- `flows/task_20260401032449_ud6b/flows/supervisor/process.json`

---

## 2026-04-02 回归补充

Bruce 重新执行 `docs/体验用例/用例009_飞书文档读取/` 后，主测试 flow `task_20260401164148_27n1` 一度直接失败，用户收到：

```text
[系统] 连续 5 轮未能产生有效操作，当前已执行 5/1000 轮，任务已终止。请尝试简化你的请求。
```

为定位根因，又通过暂停调试创建 `task_20260401170848_9nem`。在该 flow 的 `llm.output.txt` 中，首轮输出已经是 TOML 风格：

```toml
[thought]
content = """
... 
"""

[cognize_stack_frame_push]
title = "获取并分析飞书文档"
```

恢复执行后又继续出现：

- `Unterminated string literal`
- `exec is not defined`
- `unknown flag: --token`

说明问题已经升级为：**输出协议、可执行 program 语法、工具调用方式三者不一致**。

## 2026-04-02 修复结果

后续在内核中完成两类修复后，用例 `task_20260401180535_u1ng` 已重新通过：

1. **parser 兼容修复**
   - 支持 fenced TOML 输出
   - 支持旧 `[program]` 段内嵌 `lang = ...` / `code = """..."""`

2. **ThinkLoop 收尾修复**
   - `cognize_stack_frame_push`、`talk/user` 记为有效进展，不再误判空轮
   - `inline_before` 完成后，将已执行的 `thought/program/action/message` 与 `locals` 迁移到真实任务节点，避免重复压栈与重复执行

最终结果：

- `task_20260401180535_u1ng/flows/supervisor/data.json` 状态为 `finished`
- 用户已收到完整的飞书文档分析结果
- `wiki spaces get_node` 与 `docs +fetch` 都稳定执行成功

## 错误统计

| 错误类型 | 出现次数 | 示例 |
|---------|---------|------|
| `[/program]` 标记放错位置 | **7 次** | 手动添加结束标记 |
| `--params` 格式错误 | 2 次 | `--params token=xxx` 而非 JSON |
| 参数名错误 | 1 次 | `--token` vs `--doc` |
| 命令不存在 | 1 次 | `wiki node get` vs `wiki spaces get_node` |
| 函数不存在 | 2 次 | `activateTrait()`, `local.` 访问 |

---

## 详细分析

### 1. 输出协议混用（新的核心问题）

回归时同时出现：

- TOML 风格 `content = """` / `code = """`
- 旧 `[program]` 代码块直写
- shell 风格 `#!/bin/sh`
- 结构化 `[action/exec]`

Agent 在同一条任务链里来回切换这些格式，导致运行时有时按 TOML 解释，有时按旧格式执行，最终无法稳定收敛到正确命令。

### 2. `[/program]` 标记问题（历史核心问题）

**Agent 的错误理解：**

```
[program]
const x = 1;
print(x);
[/program]  ← Agent 错误地手动添加这个标记
```

**实际正确格式：**
Agent 只需要写内容，标记由框架自动处理。

### 3. `--params` / 命令参数格式问题

**错误：**
```bash
lark-cli wiki spaces get_node --params token=UbpdwXweyi86HHkRHCCcLPN4n8c
```

**正确：**
```bash
lark-cli wiki spaces get_node --params '{"token": "UbpdwXweyi86HHkRHCCcLPN4n8c"}'
```

### 4. 命令发现流程低效

| 步骤 | Agent 行为 | 结果 |
|------|-----------|------|
| 1 | 猜测命令 `wiki node get --token` | 失败 |
| 2 | 查看 schema `lark-cli schema wiki.spaces.get_node` | 获取正确格式 |
| 3 | 尝试 `--params token=xxx` | 失败 |
| 4 | 自我修正为 `--params '{"token": "xxx"}'` | 成功 |

---

## 根本原因

### 1. 缺少可执行的示例

trait 文档更多是规则描述，缺少可直接照抄的稳定示例。

### 2. Program / Talk / Action 多套格式说明并存且不一致

回归前，`computable` / `talkable` / context 注入 / 运行时可执行路径存在不完全一致的格式约束，Agent 容易同时学到多套协议。

### 3. before 节点执行结果未落入真实任务节点

这是本轮最终确认的关键运行时问题之一：即使 before 节点里已经拿到了有效结果，真实任务节点也可能看不到这些结果，进而继续重复压栈或重复执行。

---

## 好的方面

**系统具备可恢复性：**

- 底层飞书命令始终可用
- 修复 parser 与 ThinkLoop 后，无需修改用例即可恢复通过
- 说明问题主要集中在运行时协议兼容与结果传递，而不是外部依赖损坏

---

## 优化建议

### 短期改进

| 改进项 | 位置 | 优先级 |
|--------|------|--------|
| 保持 supervisor 当前使用的输出协议示例一致 | runtime context / trait docs | HIGH |
| 澄清 `[program]` 标记使用方式 | `computable` trait 文档 | HIGH |
| 增加 `lark/wiki` 命令示例 | trait 文档 | HIGH |
| 增加 `lark/doc` / `docs +fetch` 示例 | trait 文档 | HIGH |

### 中期改进

| 改进项 | 说明 |
|--------|------|
| 更强的解析错误提示 | 直接暴露最后一次解析失败点 |
| 命令快捷示例 | 对常见飞书读取链路提供标准模板 |
| 更好的 `--params` 报错 | 给出明确 JSON 示例 |

---

## 相关证据

### 成功执行的命令

```bash
lark-cli wiki spaces get_node --params '{"token": "UbpdwXweyi86HHkRHCCcLPN4n8c"}'
lark-cli docs +fetch --doc Z6Aqd5I37omXkDxYuVVcoFqsnWy
```

### 成功修复后的结果

```text
## 飞书文档分析结果
- 标题：【因子需求】商家_具备的行业资质名称
- 文档类型：docx (新版文档)
- 文档长度：1928 字符
...
### 分析完成 ✅
```

---

## 关联文档

- `docs/组织/体验测试工作流/bruce-workflow.md` - 体验测试工作流
- `docs/体验用例/用例009_飞书文档读取/success.md` - 最新测试结果

---

## 后续行动

- [x] 修复 parser 对嵌入式 TOML program 的兼容
- [x] 修复 before 节点结果迁移缺失问题
- [x] 回归验证 `用例009_飞书文档读取`
- [ ] 归档该问题单到已解决目录
