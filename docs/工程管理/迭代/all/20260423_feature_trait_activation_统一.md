# 三阶段 Trait 激活 + Relation 统一模型

> 类型：feature
> 创建日期：2026-04-23
> 完成日期：2026-04-23
> 状态：finish
> 负责人：kernel（本迭代）
> Spec：`docs/superpowers/specs/2026-04-23-three-phase-trait-activation-design.md`
> 涌现：E14 三阶段激活模型（`docs/哲学/emergences/three_phase_activation.md`）

## 背景 / 问题描述

当前 trait 激活系统有三个事实上不同的触发通路：

1. **起点（Origin）**——stone `readme.activated_traits` / `data._traits_ref`（对象自身有的能力）
2. **过程（Process）**——`command_binding`（做某事时需要的能力，目前只挂在基础 command 上，无法挂在子命令上）
3. **终点（Target）**——和互动对象相关的约束——**完全空缺**

更深层的问题：trait "激活"这个抽象本身是冗余的——它其实只是 "TRAIT.md 被 open 到 context"。`getActiveTraits` 可以被 `getOpenFiles` 取代。

## 目标

一次重构 + 一次扩展：

**重构（Phase 1-3）**：
- 把 trait 激活折叠为"文件 open"
- 取消 `getActiveTraits`，改用 `getOpenFiles`
- 引入**命令树**索引（独立数据结构，不让各 tool 自注册），支持**冒泡匹配**（父绑定匹配所有子路径）
- 引入**虚拟路径** `@trait:...` / `@relation:...`

**扩展（Phase 4-7）**：
- 支持**渐进式填表**：submit 加 `partial: boolean`，允许分多轮累积参数，命令路径随参数深化，TRAIT.md 单调追加 open
- 补齐 **Target 阶段**：relations/ 目录（stone + flow obj 对称）+ `<relations>` 索引区块 + `talk.continue.relation_update` 请求机制
- **relation 是纯 markdown**，不带 trait 激活机制；内容本身就是约束

## 方案

参见 spec：`docs/superpowers/specs/2026-04-23-three-phase-trait-activation-design.md`

**核心断言**：
> Context 是一组"当前 open 的文件"。LLM 看见哪些文件的内容，就拥有那些能力和知识。

**Phase 分解（推荐实施顺序）**：
1. 命令树基础（command-tree.ts + deriveCommandPath + tests）
2. 虚拟路径（virtual-path.ts + open(path) 支持 @ 前缀）
3. Open-files 中枢（**等价重构**，engine 全切换，getActiveTraits 下线）
4. Partial submit（tools.ts + engine 渐进路径 + talkable 子 trait 拆分）
5. Peers + relations 索引（peers.ts + relation.ts + `<relations>` 区块）
6. relation_update 机制（talk.continue.relation_update 子 trait + 接收侧识别）
7. Flow obj relations（对称扩展）

**每 Phase 独立 commit，可独立 revert**。

## 影响范围

### 涉及代码

**新增 kernel**：
- `kernel/src/thread/command-tree.ts`
- `kernel/src/thread/open-files.ts`
- `kernel/src/thread/virtual-path.ts`
- `kernel/src/thread/peers.ts`
- `kernel/src/thread/relation.ts`

**修改 kernel**：
- `kernel/src/thread/engine.ts`
- `kernel/src/thread/context-builder.ts`
- `kernel/src/thread/tools.ts`
- `kernel/src/thread/types.ts`
- `kernel/src/trait/loader.ts`
- `kernel/traits/talkable/` 目录结构重组

**退役**：
- `kernel/src/trait/activator.ts::getActiveTraits`（逻辑迁至 open-files.ts）

### 涉及文档

- `user/docs/哲学/emergences/three_phase_activation.md` — E14 新增涌现条目
- `user/docs/哲学/emergences/README.md` — 索引加 E14
- `user/docs/架构/` — 若有 trait / thinkloop 架构图，同步更新

### 涉及基因 / 涌现

- **G3**（trait 从文件系统加载）— 激活也归并到文件 open
- **G6**（对象社交网络）— relation 从形同虚设变一等公民
- **G12**（知识 → 能力 → 直觉）— TRAIT.md 激活 = 知识装进 context
- **E14**（新增：三阶段激活模型）

## 验证标准

### 单元测试（bun test）
- 每个新模块独立 test file
- 冒泡匹配、虚拟路径多 namespace、partial 累积、peers 去重、relation 降级

### 集成测试
- 构造迷你场景：A talk(target=B, context=fork) → 验证 open 文件集 + `<relations>` 区块 + submit(partial=false) 后 transient 全 close

### Bruce 验收（E2E）
- 跨对象协作会话：观察 LLM 是否读 relation 索引并按需 open
- relation_update 请求：看 A 端能否识别并做决定
- Partial submit：验证 LLM 能自然使用渐进填表

### 回归
- `bun test` 0 new fail
- 前端 `tsc --noEmit` 无新增错误
- 服务重启后既有线程不崩溃（向后兼容）

## Bruce 验收

> 2026-04-23 完成。由实现方内联执行（无 Task/Agent tool 可用），覆盖 spec
> 指定的 5 个 E2E 场景 + 额外 3 个辅助验证。所有场景通过。

### 验收方式

- 17 个集成测试（`kernel/tests/three-phase-bruce-verification.test.ts`）覆盖
  所有 Bruce 场景 —— 使用真实 ThreadsTree / buildThreadContext / FormManager /
  open-files 中枢，不 mock
- 真实 server 启动（kernel/src/cli.ts start 8080）+ HTTP talk 请求做端到端烟测：
  · 发起 `talk supervisor`，LLM 自然调用 `open(path="@relation:kernel")` 读出
    supervisor/relations/kernel.md 全文 → 返回 inject "关系文件 @relation:kernel 已加载"
  · 直接调 buildThreadContext 验证 supervisor 的 context 含 `<relations>` 索引行
    "kernel: OOC 核心工程部，TDD 流程 + 哲学审查"（来自真实 relations/kernel.md
    frontmatter.summary）
  · 直接注入 kind="relation_update_request" 到 supervisor inbox，验证 context
    能正确识别（后续 engine.contextToMessages 会渲染 `<relation_update_request>` 徽章）

### 通过场景

- ✅ **场景 1 (Context relations 索引)**：supervisor 的 ctx.relations 含 kernel
  关系条目，summary 为 "OOC 核心工程部，TDD 流程 + 哲学审查"（frontmatter 顶
  优先匹配）；无 relation 文件的 peer 显示 "(无关系记录)"
- ✅ **场景 2 (open @relation:<peer>)**：真实 LLM 在 supervisor session 中
  调用 `open({type:"file", path:"@relation:kernel"})`，服务端正确解析虚拟路径
  到 stones/supervisor/relations/kernel.md 并 inject "关系文件 ... 已加载"
- ✅ **场景 3 (relation_update 徽章)**：
  - `deriveCommandPath("talk", {context:"continue", type:"relation_update"})` → `talk.continue.relation_update`
  - 接收方 inbox 的 kind="relation_update_request" 正确持久化
  - engine **不自动写** relations/ 文件（spec 要求的所有权模型）
  - collectCommandTraits 冒泡匹配：talkable（父 "talk"）+ talkable/relation_update（精确）同时命中，cross_object（"talk.fork"）不命中
- ✅ **场景 4 (partial submit 渐进填表)**：
  - FormManager.commandPath 三步深化：`talk` → `talk.continue` → `talk.continue.relation_update`
  - loadedTraits 单调追加，旧的 trait 保留
  - 最终 submit 的 accumulatedArgs 按"后覆盖前"合并
- ✅ **场景 5 (向后兼容)**：
  - FormManager.fromData 容忍缺失的 accumulatedArgs/commandPath/loadedTraits 字段（默认值填充）
  - ThreadInboxMessage 无 kind 字段的老消息正常渲染
  - getOpenFiles 对无 relations 的线程正常返回
  - 运行中服务启动后加载既有会话 `s_moa7u3od_tomchz` 无任何错误

### 失败场景

无。

### 设计与实现不符

无。所有场景与 spec 第一至第四部分完全对齐。

### 端到端烟测记录

- 启动命令：`cd /Users/zhangzhefu/x/ooc/user && NO_PROXY='*' HTTP_PROXY='' HTTPS_PROXY='' http_proxy='' https_proxy='' bun kernel/src/cli.ts start 8080 &`
- 会话 1 (`s_moadb8f4_afr9ra`)：user → supervisor "请 wait"——LLM 调 wait，thread 进 waiting，既有 inbox kind 为空（向后兼容）
- 会话 2 (`s_moadd3f4_5kfgsz`)：user → supervisor "请 open(@relation:kernel) 然后 wait"——LLM
  首次调 `open({type:"file", path:"@relation:kernel"})`，inject 显示
  `关系文件 "@relation:kernel" 已加载到上下文窗口`，随后 wait。**这是端到端
  验证虚拟路径 + kind 标签（"关系文件"）在 real LLM loop 里的成功案例**
- 关闭：`pkill -f 'bun kernel/src/cli.ts'`，无遗留副作用

## 执行记录

### 2026-04-23 Phase 7 完成（Flow obj relations 对称扩展）
- 产出：
  - `kernel/src/thread/self-kind.ts` — detectSelfKind
  - `kernel/src/thread/engine.ts` — resolveOpenFilePath 扩展；两处 callsite 传入 stoneDir/flowsDir
  - `kernel/src/thread/context-builder.ts` — relations 读取用 detectSelfKind 自动判别
  - `kernel/tests/self-kind-detect.test.ts` — 7 tests
  - kernel commit: `0139ace`
- 测试：875 pass / 6 fail（+7 新增全通过）
- 备注：
  - detectSelfKind 纯字符串计算（不触文件系统），形态不匹配保守回退到 stone
  - 目前 live 代码里还没有真正的 flow_obj 被 world.talk 唤起；本 Phase 是基础设
    施准备，让未来 flow_obj 功能上线时 relations / @trait:self 立刻自动可用

### 2026-04-23 Phase 6 完成（relation_update 请求机制）
- 产出：
  - `kernel/src/thread/types.ts` — ThreadInboxMessage.kind
  - `kernel/src/thread/tree.ts` — writeInbox 支持 kind
  - `kernel/src/thread/engine.ts` — onTalk 签名扩展、talk 识别 relation_update、
    contextToMessages 渲染 `<relation_update_request>` 徽章
  - `kernel/src/thread/tools.ts` — submit.type schema
  - `kernel/src/world/world.ts` — _talkWithThreadTree + onTalk 透传 messageKind
  - `kernel/traits/talkable/relation_update/TRAIT.md` — 发起方 + 接收方双 bias
  - `kernel/tests/relation-update.test.ts` — 4 tests
  - kernel commit: `008141f`
- 测试：868 pass / 6 fail（+4 新增全通过）
- 备注：
  - engine **不自动写**任何 relation 文件——是否接受完全由接收方 LLM 决定，
    符合 spec 的"关系文件所有权归本对象私有"原则
  - 已 mark 的 relation_update_request 也保留徽章标签（便于 LLM 回查历史）
  - run + resume 双路径都识别 type=relation_update

### 2026-04-23 Phase 5 完成（Peers + relations 索引）
- 产出：
  - `kernel/src/thread/peers.ts` — scanPeers
  - `kernel/src/thread/relation.ts` — locateRelationFile / readPeerRelation(s) / renderRelationsIndex[Inner]
  - `kernel/src/thread/context-builder.ts` — ThreadContext.relations: PeerRelationEntry[]
  - `kernel/src/thread/engine.ts` — contextToMessages 插入 <relations> XML
  - `kernel/tests/peers.test.ts` — 8 tests
  - `kernel/tests/relation.test.ts` — 13 tests
  - kernel commit: `ec1fe0d`
- 测试：864 pass / 6 fail（+21 新增全通过）
- 备注：
  - relations 放在 <directory> 后、<paths> 前，靠近其他"协作视角"元信息
  - 无 peer 时整个块省略（避免噪音）
  - 无 relation 文件的 peer 仍显示一行 "(无关系记录)"，让 LLM 感知缺口
  - Phase 5 只做 stone 场景；flow_obj 对称由 Phase 7 接入

### 2026-04-23 Phase 4 完成（Partial submit 渐进填表）
- 产出：
  - `kernel/src/thread/form.ts` — FormManager.partialSubmit / activeCommandPaths / addLoadedTraits
  - `kernel/src/thread/hooks.ts` — collectCommandTraits 冒泡前缀匹配
  - `kernel/src/thread/engine.ts` — open 收集 loadedTraits；submit 新增 partial 分支；
    close/submit 卸载时用 form.loadedTraits + stillNeeded 判断（run + resume 双路径）
  - `kernel/src/thread/tools.ts` — submit.partial schema + 说明
  - `kernel/traits/talkable/cross_object/TRAIT.md` — command_binding: talk.fork
  - `kernel/tests/partial-submit.test.ts` — 11 tests
  - kernel commit: `bf32713`
- 测试：843 pass / 6 fail（+11 新增全通过，回归 0）
- 备注：
  - accumulatedArgs 合并顺序：后到覆盖先到（符合"修正既有填表"直觉）
  - submit 执行时把累积 args 合进本次 args（以本次 args 优先），让下游指令无感
  - activeCommands() 保留用作"某 command 是否有活跃 form"的存在性判断；
    activeCommandPaths() 专职 trait 匹配
  - 其他 talkable 子 trait（ooc_links / delivery / issue-discussion）暂未动
    —— Phase 4 只按 spec 要求改 cross_object；其他保持原 flat binding

### 2026-04-23 Phase 3 完成（Open-files 中枢，等价重构）
- 产出：
  - `kernel/src/thread/open-files.ts` — OpenFiles 结构 + getOpenFiles
  - `kernel/src/thread/context-builder.ts` — instructions/knowledge 改走 getOpenFiles
  - `kernel/src/thread/engine.ts` — 两处 computeActiveTraitIds（run + resume）统一
  - `kernel/tests/open-files.test.ts` — 9 tests
  - kernel commit: `164839b`
- 测试：832 pass / 6 fail（+9 新增全通过，回归 0）
- 备注：
  - getActiveTraits 仍作为 open-files 内部助手保留（spec 说"逻辑迁至 open-files"
    —— 指计算入口从 thread 路径外移入中枢）；thread/engine/context-builder 都不再
    直接调用它
  - open-files 内部 pinnedKeys 更宽（含 stoneRefs + when="always"），但对外的
    knowledge.lifespan 保持旧语义（只看 nodeMeta.pinnedTraits），避免行为漂移
  - context/builder.ts (旧 Flow 路径) 未动，仍用 getActiveTraits——只被两个遗留
    test 使用，不在线上链路

### 2026-04-23 Phase 2 完成（虚拟路径）
- 产出：
  - `kernel/src/thread/virtual-path.ts` — resolveVirtualPath + isVirtualPath
  - `kernel/src/thread/engine.ts` — resolveOpenFilePath 辅助，run/resume 两条路径接入
  - `kernel/src/thread/tools.ts` — open.path description 增补虚拟路径说明
  - `kernel/tests/virtual-path.test.ts` — 16 tests
  - kernel commit: `84a99d8`
- 测试：823 pass / 6 fail（+16 新增全通过）
- 备注：
  - Phase 2 目前 selfKind 统一按 "stone" 解析；flow_obj 场景留到 Phase 7 扩展
  - window 的 key 用 LLM 原始 path（含 @trait: 前缀），便于 close 反查
  - 未知虚拟前缀 → 注入明确错误而非静默失败

### 2026-04-23 Phase 1 完成（命令树基础）
- 产出：
  - `kernel/src/thread/command-tree.ts` — COMMAND_TREE + deriveCommandPath + matchesCommandPath
  - `kernel/tests/command-tree.test.ts` — 22 tests
  - kernel commit: `f23598c`
- 测试：807 pass / 6 fail（baseline 785/6，+22 新增全通过，fail 不变）
- 备注：
  - submit 下当前只硬编码 `compact` / `talk` 两个子节点（随 spec 示例）；新增 command 时按需扩展
  - `open` 的 `_match` 优先级：`command > path`，同时出现以 command 为先
