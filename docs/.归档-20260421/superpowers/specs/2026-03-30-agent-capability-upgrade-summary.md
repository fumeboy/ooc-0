# OOC Agent 能力升级 — 实施总结

> 2026-03-30 | Phase 0-3 全部完成

## 目标

让 OOC 对象具备与 Claude Code 同等的通用任务执行能力 — 文件操作、代码搜索、Shell 命令、Git 版本控制、HTTP 请求。

## 完成内容

### Phase 0：基础设施

| 改动 | 文件 | 说明 |
|------|------|------|
| MethodContext 扩展 | `kernel/src/trait/registry.ts`, `kernel/src/flow/thinkloop.ts` | 新增 rootDir/selfDir/stoneName 三个字段 |
| _traits_ref 加载 | `kernel/src/trait/loader.ts`, `kernel/src/world/world.ts` | 对象通过 data.json._traits_ref 按需引用 library trait |
| ToolResult<T> | `kernel/src/types/tool-result.ts` | 统一的工具返回类型（ok/error + context） |
| 方法可见性过滤 | `kernel/src/trait/registry.ts`, `kernel/src/flow/thinkloop.ts` | buildSandboxMethods 只注入已激活 trait 的方法 |

### Phase 1：工具 Trait（21 个方法）

| Trait | 层级 | 方法 | 文件 |
|-------|------|------|------|
| file_ops | Kernel (always) | readFile, editFile, writeFile, listDir, fileExists, deleteFile | `kernel/traits/file_ops/` |
| file_search | Kernel (always) | glob, grep | `kernel/traits/file_search/` |
| shell_exec | Kernel (always) | exec | `kernel/traits/shell_exec/` |
| git_ops | Library (_traits_ref) | gitStatus, gitDiff, gitLog, gitAdd, gitCommit, gitBranch, gitCheckout, gitPush, gitPull | `library/traits/git_ops/` |
| http_client | Library (_traits_ref) | httpGet, httpPost, httpRequest | `library/traits/http_client/` |

Stones 配置：supervisor 引用 git_ops + http_client，kernel 引用 git_ops，nexus 引用 http_client。

### Phase 2：结构化工具调用

| 改动 | 文件 | 说明 |
|------|------|------|
| [action/toolName] 解析 | `kernel/src/flow/parser.ts` | 新增 action 段落解析，JSON 参数，与 program 互斥 |
| action 执行 | `kernel/src/flow/thinkloop.ts` | 查找方法 → JSON.parse → 执行 → 记录结果 |
| action 结果呈现 | `kernel/src/context/formatter.ts` | action 结果作为 `[工具调用结果]` 显示在 LLM context 中 |
| 空 program 过滤 | `kernel/src/flow/parser.ts` | 空 program 不参与互斥判断，避免 action 被误丢弃 |
| computable 引导 | `kernel/traits/computable/readme.md` | 引导 LLM 优先使用高层工具方法 |

### Phase 3：内部思考优化

| 改动 | 说明 |
|------|------|
| 自动记忆管理 | 已有 — reflective trait 的 when_finish hook |
| 认知栈自动化 | 已有 — cognitive-style trait 的 before hook |
| 经验沉淀闭环 | 新增 — [finish] 时自动向 ReflectFlow 发送任务摘要 |
| Context 压缩 | 已有基础 — autoSummarize + focus-based forgetting |

## 测试

332 个测试全部通过（从 user/ 目录运行 `bun test`）。

新增测试文件：
- `kernel/tests/trait-file-ops.test.ts` (16 tests)
- `kernel/tests/trait-file-search.test.ts` (11 tests)
- `kernel/tests/trait-shell-exec.test.ts` (4 tests)
- `kernel/tests/trait-git-ops.test.ts` (5 tests)
- `kernel/tests/trait-http-client.test.ts` (7 tests)
- `kernel/tests/tool-result.test.ts` (3 tests)
- parser.test.ts 新增 11 个 action 相关测试

## 验证结果

| 场景 | 结果 |
|------|------|
| supervisor readFile（通过 [program]） | ✅ 成功 |
| supervisor gitStatus（通过 _traits_ref） | ✅ 成功 |
| supervisor [action/readFile] 结构化调用 | ✅ 成功（7 actions 完成，vs 之前 32 actions） |
| _traits_ref 加载 library trait | ✅ supervisor 16 traits，含 git_ops + http_client |
| 方法可见性过滤 | ✅ 未激活 trait 的方法不注入沙箱 |

## 调研参考

设计过程中调研了 5 个主流 Agent 系统：

- **Aider** — unified diff 格式，flexible patching 容错
- **SWE-agent** — ACI 哲学，控制信息密度
- **Cline** — MCP 协议标准化
- **Goose** — MCP-native，错误作为数据回传
- **OpenCode** — Bun+TS+SSE，与 OOC 架构相似

## 关键设计决策

1. **Kernel Trait 用 when: always** — 行为边界由对象 readme/bias 控制（advisory），不做系统级强制隔离
2. **_traits_ref 按需引用** — Library Trait 通过 data.json 字段声明，轻量且声明式
3. **editFile 两级容错** — 精确匹配 → trim 空白，遵循最小改动原则
4. **[action] 用 JSON 参数** — 代码内容对 YAML 不友好，JSON 解析确定性更高
5. **空 program 不参与互斥** — 避免 LLM 习惯性输出空 [program] 导致 action 被丢弃

## 相关文档

- Spec: `docs/superpowers/specs/2026-03-30-agent-capability-upgrade-design.md`
- Plan: `docs/superpowers/plans/2026-03-30-agent-capability-upgrade.md`
