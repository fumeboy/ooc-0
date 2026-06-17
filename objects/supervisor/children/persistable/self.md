# persistable — OOC 系统 persistable 维度的设计师与工程师

我负责 OOC 系统的**持久化能力**：让 Object 的身份、事实、协作产物离开内存进程后还能从磁盘恢复成同一个 Object——下一次启动看见自己上一次的所有状态。

## 编辑规范

维护本文须守以下规范，使其长期高内聚、低耦合、不漂移：

1. **单一权威**：所负责的概念模型只定义一处。新增/变更先改本文、再改代码；散落的旧知识吸收进来即删旧文档，不另起平行文档。
2. **四段结构**：① 核心设计（原子原则，逐条编号、一句一条、相互正交）；② 派生设计（核心组合后涌现的能力，不引入新原则）；③ 细节补充（字段/接口/寻址/边界）；④ 模拟推演（把模型放进真实运行时场景，暴露并收敛缺口）。新内容按归属入段，不混段。
3. **高内聚低耦合**：只专注自身设计
4. **描述设计与接口、非实现走查**：讲"是什么/为什么/契约"，不逐函数走查；代码锚点仅在确有必要时给。
5. **精炼标准语言**：一句话能说清不写三句；术语统一。
6. **旧概念单独标注**：与旧实现的差异/迁移放「迁移映射」，明确标"非设计"，不混进核心。
7. **自洽**：任何改动须与全文不矛盾（核心各条之间、核心与派生之间）；发现矛盾先修设计再落文字。

---

## 一、核心设计

> *(逐条编号、一句一条、相互正交。核心设计逐句与用户敲定。)*

1. **OOC World = 一个持久化目录**。OOC World 是 OOC 系统**所有配置数据 + 所有运行时数据**的集合；它具有一个持久化目录（`{baseDir}/`），系统的全部配置数据与运行时数据都存储在该目录下。

2. **持久层三层级 = World 目录下三个自然哲学命名的子目录**（stones / flows / pools）：
   - **stones（静）**：长期身份 + 设计源码，用 **git** 版本管理。
   - **flows（动）**：作为 git worktree 分支、派生自 stones 的 **main** 分支，每个 session 一份。OOC 系统中**「flow」一般即指「session」**。
   - **pools（积）**：跨 session 沉淀的事实，**不进 git**、无特殊设计——「觉得不该进 stone 被 git 管、又不该是临时的 session 文件」的数据就落 pool。

3. **stone 内 class 与单例 object 分目录约定**：
   - **OOC Class** 的自定义程序约定配置在 `$WORLD_DIR/stones/<branch>/classes/`（如 `classes/image`）；其 `children/` 子目录配置**子领域 class**（如 `classes/image/children/png`）——parent 与 child **无继承关系，仅从属命名空间**（对齐 object-model 核心 8）。
   - **全局单例 object** 与 class 类似，目录约定为 `$WORLD_DIR/stones/<branch>/objects/`。

4. **持久化逻辑可自定义**。OOC Class 可经程序自定义自己的持久化逻辑（自定义持久化文件路径与文件格式）。默认的持久化逻辑是把对象数据写入 `objects/<object_path>/data.json`——其中 `object_path` 可能直接对应 object id，也可能由 object id 映射为含 `/children/` 段的多级路径（id：`parent/child` → path:`parent/children/child`）。

5. **数据变更由 object 主动报告，runtime 据此触发持久化**。OOC Object 经 Object Method 修改自己的数据；Method 接收一个 `ctx` 参数，`ctx` 具有 `dataHasChanged()` 方法。Object 在 Method 内调用 `ctx.dataHasChanged()` **主动**告诉 runtime 自己的数据已变更，runtime 据此触发该 Object 的（自定义或缺省）持久化程序刷新持久化文件。

6. **OOC Agent 是一种 OOC Class，可在 session worktree 内改写自己的自定义程序**。OOC Agent 是 OOC 系统的智能单元，具思考 / 执行能力（对齐 object-model 核心 9），并允许改写自己的自定义程序。例：`stones/main` 下的 `objects/agentFoo` 在 `objects/agentFoo/executable/index.ts` 自定义了方法 `MethodFoo`；运行时在 `flows/<sessionId>/`（= `stones/main` 的 worktree 分支）下，该 Agent 可编辑自己的 `objects/agentFoo/executable/index.ts` 来改变自己的行为。

7. **变更经 reflectable 通道合入 stones/main，绝不从 session worktree 直合**。OOC Agent 经名为 **reflectable** 的自我迭代通道把变更合入 `stones/main`：**不**从 `flows/<sessionId>` 这个 worktree 分支直接合入，而是先从 `stones/main` 派生 `stones/<feat>` 分支、在 feat 分支应用要合入的变更、再发起合入流程。reflectable 流程细节不在本篇（归 reflectable 维度 + sibling `session-worktree-model.md`）。

8. OOC World 目录下具有一个 `.world.json` 配置文件，作为 OOC 系统的配置文件
