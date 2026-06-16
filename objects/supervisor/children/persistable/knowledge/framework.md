---
title: persistable 框架层设计 + 对 ooc object 开放的 API
description: persistable 框架层自身的机制（契约 / dispatch / 存储原语 / 持久化触发）与它向 ooc object 开放的 API 面（实现侧 persistable 契约 + 调用侧框架原语 + method 触发持久化）的单一权威；与 core-framework-vs-builtin-logic（归属判据）平级互补
activates_on: {"object::root": "show_description"}
---

# persistable 框架层设计 + 对 ooc object 开放的 API

> 本篇是 persistable 维度关于**「框架层自身是什么、它向 ooc object 开放哪些 API」**的**单一权威**。
> 与 sibling `core-framework-vs-builtin-logic.md` 是**平级互补**关系：那篇讲**归属判据**（哪段代码归 core、哪段归 builtin，为何 pr-issue 留 core）；本篇讲**框架机制 + 开放 API 面**（框架提供的契约 / dispatch / 存储原语 / 持久化触发，以及 object 实现侧与调用侧各能用到什么）。归属判据不在本篇重述，落盘三子树布局归 `stone-pool-flow-three-trees.md`、session/feat 工作树归 `session-worktree-model.md`、版本化布局与发现归 `versioning-layout-and-registry.md`。

## 编辑规范

参照 class 维度 `object-model.md` 的**四段结构**（① 核心设计 ② 派生设计 ③ 细节补充 ④ 模拟推演）与其 7 条规范（单一权威 / 高内聚低耦合·依赖倒置 / 描述设计与接口而非实现走查 / 精炼标准语言 / 旧概念单独标注「迁移映射」/ 自洽）。本篇特有约束：

- **API 面以契约+签名描述，不逐函数走查**；代码锚点仅在高漂移处给 `file.ts:符号` 形式。
- **不讲其他维度怎么用这些 API**（thread 怎么序列化归 thread builtin、投影构造归 thinkable）——本篇只声明框架开放了什么、契约是什么。

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

4. **持久化逻辑可自定义，缺省继承自基类 root**。OOC Class 可经程序自定义自己的持久化逻辑（自定义持久化文件路径与文件格式）。所有 OOC Class 的基类是 **root**；root 的持久化逻辑是把对象数据写入 `objects/<object_path>/data.json`——其中 `object_path` 可能直接对应 object id，也可能由 object id 映射为含 `/children/` 段的多级路径（对齐 object-model 核心 8 的命名空间从属：`parent/child` → `parent/children/child`）。

5. **数据变更由 object 主动报告，runtime 据此触发持久化**。OOC Object 经 Object Method 修改自己的数据；Method 接收一个 `ctx` 参数，`ctx` 具有 `dataHasChanged()` 方法。Object 在 Method 内调用 `ctx.dataHasChanged()` **主动**告诉 runtime 自己的数据已变更，runtime 据此触发该 Object 的（自定义或缺省）持久化程序刷新持久化文件。

6. **Object Method 的 ctx 提供 CreateObject API；新建 object 默认归属 parent 的 children 目录**。运行时经 `ctx` 的 CreateObject API 创建 OOC Object，被创建的 object 默认归属在创建者的 `children/` 目录下——例如全局单例 `filesystem` 创建的 file object，持久化目录默认在 `objects/filesystem/children/<fileObjectId>`。此默认归属逻辑同样由基类 **root** 提供。

7. **OOC Agent 是一种 OOC Class，可在 session worktree 内改写自己的自定义程序**。OOC Agent 是 OOC 系统的智能单元，具思考 / 执行能力（对齐 object-model 核心 9），并允许改写自己的自定义程序。例：`stones/main` 下的 `objects/agentFoo` 在 `objects/agentFoo/executable/index.ts` 自定义了方法 `MethodFoo`；运行时在 `flows/<sessionId>/`（= `stones/main` 的 worktree 分支）下，该 Agent 可编辑自己的 `objects/agentFoo/executable/index.ts` 来改变自己的行为。

8. **变更经 reflectable 通道合入 stones/main，绝不从 session worktree 直合**。OOC Agent 经名为 **reflectable** 的自我迭代通道把变更合入 `stones/main`：**不**从 `flows/<sessionId>` 这个 worktree 分支直接合入，而是先从 `stones/main` 派生 `stones/<feat>` 分支、在 feat 分支应用要合入的变更、再发起合入流程。reflectable 流程细节不在本篇（归 reflectable 维度 + sibling `session-worktree-model.md`）。

---

## 二、派生设计

*(待核心设计定稿后补——框架机制 + API 组合后涌现的能力，不引入新原则。预期收纳：*
- *系统默认持久化 = 「不实现 persistable」的自然退化（核心组合，非独立机制）；*
- *eager 触发 vs 周期/边界落盘 floor 的关系；*
- *inline vs 独立对象两种落盘形态由同一契约的 `mode` 分流。)*

---

## 三、细节补充

*(API 面清单——核心设计定稿后据其收口字段/签名。预期四类：)*

### 3.1 object 实现侧契约（object 写 `persistable/index.ts` 时实现的面）
- `PersistableModule { mode?, save?, load? }`：object 自定义序列化的 default export。
- `PersistableContext { baseDir, objectId, sessionId?, threadId?, dir }`：save/load 收到的定位三元组 + 默认序列化目录。
- 缺省语义：不导出 persistable → 系统默认 state.json。
- `mode:"inline"` 语义：data 随所属 thread 的 thread-context.json 内联落盘、不写独立 state.json。

### 3.2 object 调用侧框架原语（object 的 save/load / method 可 import 的 core 面）
- 路径计算：`objectDir` / `threadDir` / `stoneDir`、`toJson`。
- 默认 data IO：`writeRuntimeObjectState` / `readRuntimeObjectState`、`saveObjectData` / `loadObjectData`。
- 串行写：`enqueueSessionWrite`。
- session-aware 身份解析：`resolveStoneIdentityRef` + `readSelf` / `writeSelf`（身份层读写纪律）。
- 事实层 IO：pool（`csv-pool` / `pool-object`）、flow data（`flowDataFile`）。

### 3.3 runtime 侧 dispatch（框架据 object 的声明解析）
- `registry.resolvePersistable(classId)` / `isInlinePersisted(classId)`：沿继承链解析 object 自声明的 persistable，不硬编码。

### 3.4 持久化触发 API（method 报告自己改了数据 → 触发落盘）
- *(待核心设计定稿——`ExecutableContext` 暴露的触发面、object-driven 主动报告 vs framework-driven 边界 floor 的契约。)*

---

## 四、模拟推演

*(待核心设计定稿后补——把框架放进真实场景逐 case 暴露 gap。预期 case：*
- *一个 object method 改 own data 后如何落盘（默认 vs 自定义 vs inline）；*
- *冷恢复 hydrate 时框架如何据 dispatch 还原 object data；*
- *UI for_ui_access method 在无 thread/runtime live 实例时的落盘路径；*
- *崩溃点与 floor 的关系——哪些改动在 tick 边界外丢失。)*

---

## 迁移映射（非设计 / 旧）

*(待核心设计定稿后据实收口。预期收纳的旧概念退役记录：)*
- **class 与单例 object 分目录（核心 3）= design-ahead-of-code**：核心 3 定 class 落 `stones/<branch>/classes/`、单例 object 落 `stones/<branch>/objects/`（双目录）。**现状代码是单目录** `stones/<branch>/objects/<id>/`（`common.ts:144` `resolveStoneDir`），class/object 同住、靠 `package.json` 的 `ooc.kind` 字段区分（见 `versioning-layout-and-registry.md`）。落地核心 3 须改 `resolveStoneDir` + stone 发现（`runtime/stone-registry.ts`）+ 迁移现有 world，并回流 `versioning-layout-and-registry.md`。
- *`PersistableModule.container = {write, read, writeSnapshot}`：thread 专属容器契约，已退役并入标准 `save`/`load`（为实现偶然性套命名）。*
- *registry `isBuiltinFeature` 标志位：已退役，inline 策略改由 class 自声明 `persistable.mode` 解析。*
- *`reportContextEdit` / 其他 framework-driven eager 触发：*待核心设计裁决后据实记录。**
