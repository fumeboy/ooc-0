# 三阶段 Trait 激活 + Relation 统一模型

> 类型：feature
> 创建日期：2026-04-23
> 状态：todo
> 负责人：TBD
> Spec：`docs/superpowers/specs/2026-04-23-three-phase-trait-activation-design.md`

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

## 执行记录

（初始为空）
