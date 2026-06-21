# 2026-06-12 全树文档审计 · anchor-drift 检查 · README 订正

一次 Supervisor 会话的工作记录。主线：把对象树知识文档与源码重新对齐，并立起一道防漂移的常设闸门。

## 1. registry 重构文档核查（起点）

父仓 `fdc52b87`（删 `ObjectTypeRegistrar` 死表 + stone 类型注册收敛到渲染期 lazy ensure）的文档回流核验：确认对象树 `8f67798` 已配套回流 5 处死引用到 `object-windows.ts:registerStoneObjectType`，全树无 `ObjectTypeRegistrar`/`registerStone` 死表符号残留，`authoring-objects.md` 本身无引用、无需改。结论：该重构的文档闭环完整。

## 2. 全树知识文档审计（主体）

派 12 个维度 AgentOfX 并行三轴审计（源码一致性 / 可读性表意 / 信息冗余），覆盖 11 维度 children + supervisor 顶层、84 个 `.md`。

**产出**：commit `2a1e108`（已 push ooc-0），48 文件修复。问题按量级：

1. **行号锚点漂移（最大宗）**——符号名稳、行号随重构偏移 30–50 行（`think`/`buildInputItems`/`BudgetManager`/`registerExecutable`/`createStoneObject`/`resolveParentClassChain` 等数十处），一律重锚 `export const`/函数名后订正。
2. **退役符号残留**——`ui_methods`→`for_ui_access`（跨 6 维）、`prototype`、`relation` window、`method_exec_from`、`WindowSnapshotEntry.type`→`class`、`.stone.json`→`package.json`、`ContextObject` 别名表述。
3. **死文件锚点**——`basic-knowledge.ts`/`synthesizer.ts` 从未存在（实为 `interaction-core.md`/`object-windows.ts`）。
4. **源码事实漂移**——`WorldRuntime` 接口写了从未实现的 `httpHandler`/`startWorker`；app debug `?baseDir=` override 已移除却仍在文档；reflectable `pr` window 已迁入 `reflectable/pr/`。

**Supervisor 裁决的 4 个客观存疑**：visible 路径 `objects/` 段（驳回，文档对）、glossary `ContextObject` 别名表述（改）、collaborable move 可 share 列表含死概念 `relation`（改）、app `issue appendComment` 触发源（留待，疑似命名 stale）。

## 3. 立项 check:anchor-drift（防漂移闸门）

审计暴露机制缺口：最大宗的**行号漂移** `check:doc-drift` 只扫退役符号串、抓不到。新增 `scripts/check-doc-anchor-drift.sh`（父仓 `56fdb633`，挂入 `verify`）。

**设计取舍**：只验两件零误报的事——锚定 `.ts/.tsx` 文件存在、行号不越界。**有意不做符号级配对**（锚点旁反引号多是概念名而非该行导出符号，一行常并列 6+ 锚点无法可靠配对，强配高误报会污染 gate 可信度），脚本头注明缘由防后人复活。

**落地即抓到一处 agent 漏网**：`root-methods-and-forms.md` 的 `method_exec/index.ts:53`（文件仅 32 行）→ 订正 `:21`（对象树 `8a2f0c5e`）。

## 4. README 订正

父仓 `ed3e672a`。订正长期漂移：启动命令路径（`src/app/server/` → `packages/@ooc/core/app/server/`）、补 CLI `ooc dev --world ./.ooc-world` 全栈启动并警示 `--world` 缺省污染源码树、项目结构 `src/<dim>/` → `packages/@ooc/`、旧词回流（commands/readme.md/talk-Issue-do/cd web）、`.ooc-world-meta` submodule→独立 clone 注解。

## 5. 教训：工具返回不可信时必须探针核验

会话后段环境的 Bash/工具返回出现错位、重复、乱码、陈旧缓存，导致多次 commit/push 被误报为成功（实际 HEAD 未动）。根因是轻信工具返回正文。**纠正做法**：每个写操作后用带唯一标记（`BEGIN_xxx`/`END_xxx`）的独立探针命令核验真实 HEAD/status，以本地==远端 hash 比对为唯一完成判据，绝不基于返回正文断言成功。最终三个 commit 全部经此核验真实落地。

## 产出清单

| 仓 | commit | 内容 |
|---|---|---|
| ooc-0 (main) | `2a1e108` | 全树审计 48 文件 |
| ooc-0 (main) | `8a2f0c5e` | method_exec 越界锚点订正 |
| fumeboy/ooc (ooc-6) | `56fdb633` | check:anchor-drift 立项 |
| fumeboy/ooc (ooc-6) | `ed3e672a` | README 订正 |

## 遗留

- app `notifyThreadActivated` 触发源 `issue appendComment`：疑似 issue 看板移除后的命名 stale（PR-Issue 保留），待核实后回流。
- 源码侧注释漂移（非文档）：`web/.../objects/model.ts` 注释引用已删的 `meta/object.doc.ts`；`worker.ts` 可能有 issue 看板历史注释。
