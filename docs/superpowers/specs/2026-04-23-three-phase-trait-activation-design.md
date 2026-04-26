# 三阶段 Trait 激活 + Relation 统一模型设计

> ⚠️ **本文档中描述的 partial submit / submit(partial=true) 机制已于 2026-04-26 退役**，
> 由 `refine` tool 取代。详见 `docs/superpowers/specs/2026-04-26-refine-tool-and-knowledge-activator.md`。

> 创建日期：2026-04-23
> 状态：已定稿，待落地
> 关联迭代：`docs/工程管理/迭代/all/20260423_feature_trait_activation_统一.md`

## 缘起

回顾当前 trait 系统，激活通路已经事实上分化出三个语义不同的触发点，但缺乏统一抽象：

| 语义 | 回答什么问题 | 现状 |
|---|---|---|
| **起点 Origin** | 我能做什么 | stone `readme.activated_traits` / `data._traits_ref` |
| **过程 Process** | 做某事注意什么 | `command_binding` |
| **终点 Target** | 影响某物时注意什么 | **空缺** |

更关键的是——三者都把"把 trait 塞进 active set"当作一个独立概念，而**事实上它只是"把 TRAIT.md 这个文件 open 到 context"的一个特例**。trait "激活"这个抽象本身可以被 "文件 open" 代替。

本 spec 做两件事：

1. **把 trait 激活机制折叠为"文件 open"**——取消 `getActiveTraits`，改用 `getOpenFiles`。三种阶段只是 open 触发规则不同。
2. **补齐 Target 阶段**——通过 relations/ 目录 + peer 索引 + relation_update 请求机制，让对象间关系成为一等公民。

## 核心断言

**Context 是一组"当前 open 的文件"。LLM 看见哪些文件的内容，就拥有那些能力和知识。**

没有 "trait 激活" 这个独立概念。所有"激活"都是"文件被 open 到 context"，由三类触发规则分别驱动：

| 阶段 | 触发规则 | 被 open 的文件 |
|---|---|---|
| Origin | 对象初始化 | stone readme 声明的 TRAIT.md |
| Process | LLM 发出 tool_use（含 partial submit） | command_binding 匹配的 TRAIT.md |
| Target | 线程涉及 peer 对象 | `<relations>` 索引 + 按需的 relation 文件 |

## 设计原则

- **llm_methods 不进 Provider tool schema**——trait 方法通过 `open(trait=X, method=Y)` 调用，始终可达；tool list 保持精简
- **TRAIT.md 是纯文本**——open 后 LLM 获得知识，不触发额外的"能力注册"
- **relation 是纯 markdown**——内容本身就是约束，不自带激活机制（放弃"relation 激活 trait"的设计）
- **最小抽象**——只留一个"文件 open 集合"的概念，三阶段各自为它贡献触发规则

---

## 第一部分 · Origin（起点）

### 触发

对象（stone 或 flow obj）初始化时，engine 读取：

- `stones/{name}/readme.md` 的 frontmatter `activated_traits: [...]`
- `stones/{name}/data.json` 的 `_traits_ref: [...]`

合并后调用 `openFile('@trait:xxx/yyy/...')` 把对应 TRAIT.md 批量 open 到本对象所有线程的 `pinned` 集合。

### 虚拟路径

`@trait:<namespace>/<name>` 解析为：

- `@trait:kernel/<name>` → `kernel/traits/<name>/TRAIT.md`
- `@trait:library/<name>` → `library/traits/<name>/TRAIT.md`（如果 library traits 目录存在）
- `@trait:self/<name>` → `stones/{self}/traits/<name>/TRAIT.md`

### 生命周期

Origin 阶段 open 的文件**在该对象生命周期内常驻**，任何线程都能看见。

---

## 第二部分 · Process（过程）

### 命令树

命令树作为**独立索引**，定义在 `kernel/src/thread/command-tree.ts`：

```ts
export const COMMAND_TREE = {
  talk: {
    _match: (args) => args.context,
    fork: {},
    continue: {
      _match: (args) => args.type,
      relation_update: {},
      question_form: {},
    },
  },
  open: {
    _match: (args) => args.command ? "command" : args.path ? "path" : null,
    command: {},
    path: {},
  },
  program: {
    _match: (args) => args.language,
    shell: {},
    ts: {},
  },
  submit: {
    _match: (args) => args.command,
    compact: {},
    talk: {},
    // 每个可 submit 的 form 类型一个节点
  },
  return: {},
};

function deriveCommandPath(toolName: string, args: Record<string, any>): string;
```

派生规则：从根据 `toolName` 入树，沿途用 `_match(args)` 下潜，每层拼 `.` 分隔符，直到 `_match` 返回 `null` / `undefined` 或节点无 `_match`。

### Trait 绑定

Trait 在 frontmatter 声明：

```yaml
command_binding:
  commands:
    - "talk"                      # 冒泡匹配所有 talk.*
    - "talk.fork"                 # 只在 fork 激活
    - "submit.compact"
```

### 冒泡匹配算法

LLM 发 tool_use 派生路径 `P`，对每个 trait 的 `command_binding.commands` 列表 `B`：

```
trait 被激活 ⇔ ∃ b ∈ B 使得 P == b 或 P 以 (b + ".") 开头
```

**父绑定匹配子路径；不互相抑制**。多个匹配的 TRAIT.md 全部 open。

### 渐进式填表（partial submit）

form 三态：

```
open(command="X")                  → empty     (TRAIT.md 按初始路径 open)
submit(..., partial=true)          → partial   (TRAIT.md 按新路径追加 open，旧的保留)
submit(..., partial=false)         → closed    (form 执行，全部绑定 TRAIT.md close)
```

每次 partial submit 后：
- engine 根据累积 args 重新派生命令路径
- 新增匹配的 TRAIT.md 追加到 `transient` 集合（单调追加，不摘除）
- form 状态持久化到 `thread.formState`

close 时批量清空 `transient` 中因当前 form 引入的 TRAIT.md。

**超时 GC 暂不做**——form 长期 partial 状态允许，LLM 自己负责关表。

### open/close 时序

**TRAIT.md 在 LLM 下一轮决策之前 open**，不是 tool_use 执行时——要让 LLM 看见约束再决策：

```
engine:
  用户 turn 结束 / tool_use 结果回来
    → 基于最新 tool_use / submit 派生命令路径
    → 更新 pinned + transient 集合
    → 构建下一轮 context（含所有 open 文件）
    → 调 LLM
```

### Sticky vs Transient

- `open` / `submit` 类 tool → sticky=true，TRAIT.md 需显式 close 或 form 完结才释放
- `talk` / `think` / `program` 类 tool → sticky=false，transient 只对下一轮有效

---

## 第三部分 · Target（终点）

### Peer 发现

每轮构建 context 前，engine 扫描**当前线程**（不含祖先）的 actions：

```
peers = {
  ∪ tool_use.args.target      # A 主动对外的
  ∪ message_in.from            # 对外来信的发信方
} - {self}
```

### Relations 目录

```
stones/{self}/relations/{peer}.md      # 持久对象
flows/{sid}/objects/{self}/relations/{peer}.md  # flow obj（对称支持）
```

**所有权**：`relations/` 归所属对象私有（权限控制接口预留，当前不强制）。peer 不能直接写入此目录，只能通过 `talk.continue.relation_update` 发请求。

**归属**：以发起方为准——stone A talk 给 flow obj F，relation 写在 `stones/A/relations/F.md`；flow obj F talk 给 stone A，写在 `flows/{sid}/objects/F/relations/A.md`。

**创建**：按需——默认不存在，对象首次觉得需要登记时才创建。

### Relation 文件结构

```markdown
---
summary: 一行式概述（显示到索引行）
tags: [engineering, kernel]
last_updated: 2026-04-23
updated_by: supervisor
---

# 与 {peer} 的关系说明

## 协作规矩
- ...

## 历史要点
- ...
```

`frontmatter.summary` 是索引行显示内容；无 frontmatter 则 fallback 正文首行；再 fallback 文件名。

### 索引行展示

context 末尾新增 `<relations>` 区块：

```xml
<relations>
  <peer name="kernel">OOC 核心工程部，TDD 流程 + 哲学审查</peer>
  <peer name="sophia">哲学设计部，所有 G/E 编号变更必经</peer>
  <peer name="bruce">（无关系记录）</peer>
</relations>
```

**无 relation 文件时也显示**——让 LLM 感知"存在但未登记"的缺口。

### 按需加载

LLM 通过 `open(path="@relation:<peer>")` 读全文。虚拟路径 `@relation:X` 解析为自己的 `relations/X.md`。

### Relation_update 请求（B → A）

B 发起：

```
talk(
  target="A",
  context="continue",             # 或 "fork"
  type="relation_update",
  msg="请在 relations/{B}.md 里登记：..."
)
```

派生路径：`talk.continue.relation_update`

- 发送侧：`talkable/relation_update/TRAIT.md` 的 bias（如何说明请求）被 open
- 接收侧：A 的 thread 收到 message_in 带 `kind: "relation_update_request"`，context 里用特殊徽章渲染：
  ```xml
  <relation_update_request from="kernel" ts="...">
    请在 relations/kernel.md 里登记：...
  </relation_update_request>
  ```
- A 自主决定：完全接受 / 部分接受 / 拒绝。**engine 不做任何自动写入。**

### 边界情形

- peer 被重命名：relation 文件悬空 → 索引行标 `（已消失）`
- peer 不存在但 A 曾 talk 过：实操中 talk 阶段应失败；若仍残留，索引行显示 `（未知对象）`
- A 首次接触 B，无历史：peer 在集合但 relation 缺失 → 索引行 `（无关系记录）`

---

## 第四部分 · 统一激活中枢

### 新核心函数

```ts
// kernel/src/thread/open-files.ts
export function getOpenFiles(thread: ThreadNode, stone: StoneData): OpenFiles {
  return {
    pinned: [
      ...resolveOriginFiles(stone),           // origin 阶段
      ...thread.openFiles.pinned,              // 显式 open 的
    ],
    transient: [
      ...resolveProcessFiles(thread.latestToolUse, thread.formState),  // process 阶段
    ],
    inject: [
      renderRelationsIndex(scanPeers(thread), stone),  // target 阶段的索引行
    ],
  };
}
```

### Thread 数据扩展

```ts
interface ThreadDataFile {
  // ... 现有字段
  openFiles?: {
    pinned: string[];      // 持久 open 的文件路径（含虚拟路径）
    transient: string[];   // 本轮 tool_use 引入的；下轮前被清掉
  };
  formState?: {
    command: string;
    args: Record<string, any>;
    partial: boolean;
  };
}
```

### Tool 扩展

- `submit` 增加 `partial: boolean` 参数（默认 false）
- `open` 支持 `path` 参数，其值可为虚拟路径（`@trait:xxx` / `@relation:xxx`）或普通文件路径
- 其他 tool 无变化

---

## 落地 Phase 分解

| Phase | 范围 | 对外可见 |
|---|---|---|
| **1. 命令树基础** | `command-tree.ts` + `deriveCommandPath` + 单测 | 否 |
| **2. 虚拟路径** | `virtual-path.ts` + `open(path)` 支持 `@trait:` `@relation:` | 否 |
| **3. Open-files 中枢** | `open-files.ts` 实现 origin + process 两路；engine 切换；`getActiveTraits` 下线 | **行为等价切换** |
| **4. Partial submit** | `tools.ts` 加 partial；engine 处理渐进路径；talkable 子 trait 拆分 | 是 |
| **5. Peers + relations 索引** | `peers.ts` + `relation.ts` + context 里 `<relations>` 区块 | 是 |
| **6. relation_update 机制** | `talk.continue.relation_update` 子 trait + engine 识别 request 类 message_in | 是 |
| **7. Flow obj relations** | 对称扩展 flow obj 目录 | 是 |

每个 Phase 独立 commit。Phase 3 是等价重构，必须确保所有现有测试通过再继续。

---

## 文件清单

### 新增

**kernel：**
- `kernel/src/thread/command-tree.ts`
- `kernel/src/thread/open-files.ts`
- `kernel/src/thread/virtual-path.ts`
- `kernel/src/thread/peers.ts`
- `kernel/src/thread/relation.ts`

**user：**
- `user/docs/哲学/emergences/three_phase_activation.md` — E14 涌现条目

**测试：**
- `kernel/tests/command-tree.test.ts`
- `kernel/tests/open-files.test.ts`
- `kernel/tests/virtual-path.test.ts`
- `kernel/tests/peers.test.ts`
- `kernel/tests/partial-submit.test.ts`
- `kernel/tests/relation-update.test.ts`

### 修改

- `kernel/src/thread/engine.ts` — 替换 `getActiveTraits` 调用链；处理 `partial`；注入 `<relations>`
- `kernel/src/thread/context-builder.ts` — 渲染 open 文件集 + `<relations>` 区块
- `kernel/src/thread/tools.ts` — submit 加 `partial`；open 支持虚拟路径
- `kernel/src/thread/types.ts` — `ThreadDataFile` 加 `openFiles`、`formState`
- `kernel/src/trait/loader.ts` — `command_binding.commands` 保持字符串数组，语义变为"前缀路径"
- `kernel/traits/talkable/` — 拆分：`talkable/` (绑 `talk`) + `talkable/cross_object/` (绑 `talk.fork`) + `talkable/relation_update/` (绑 `talk.continue.relation_update`)

### 退役

- `kernel/src/trait/activator.ts::getActiveTraits` — 等价逻辑迁至 `open-files.ts`

---

## 测试策略

### 单元

- 每个新模块独立 test file
- 覆盖：冒泡匹配边界、虚拟路径多 namespace、partial submit 累积语义、peers 去重、relation 缺失优雅降级

### 集成

- 构造迷你场景：A talk(target=B, context=fork) → 验证 open 文件集 + `<relations>` 区块 + submit(partial=false) 后 transient 全 close

### E2E（Bruce 验收）

- 跨对象协作会话，观察 LLM 读 relation 索引并按需打开
- 引入 relation_update 请求，看 A 端能否识别并做决定
- 验证 partial submit 的渐进路径是否能让 LLM 自然使用

---

## 迁移与兼容

- `getActiveTraits` 仅 engine 内部使用，外部无 API 断裂
- `command_binding.commands` 语义从"完整匹配"扩展为"前缀匹配"——向后兼容
- submit 加 `partial` 默认 false——旧调用不变
- thread.json 新增字段对旧文件视为空，engine 容忍

---

## 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| getActiveTraits 退役隐含依赖 | 中 | Phase 3 单独 commit，全量跑 test |
| 命令树硬编码在 TS const | 低 | 未来可改 YAML，当前硬编码安全 |
| peer 扫描每轮 O(n) | 低 | 可缓存；先不优化 |
| relation frontmatter.summary 缺失 | 低 | 严格 fallback 链 |
| LLM 困惑 partial 选择 | 中 | talkable TRAIT.md 补示例；partial=false 默认 |
| relation_update 徽章被忽略 | 中 | 接收侧 TRAIT.md 要求 A 至少评论一句（接受/拒绝/推迟） |

---

## 关联基因 / 涌现

- **G3**（trait 从文件系统加载）— 本设计把 trait 激活也归并到"文件 open"，加强 G3
- **G6**（对象社交网络）— Target 阶段让 relation 成为一等公民
- **G12**（知识 → 能力 → 直觉）— TRAIT.md 激活 = 把"能力" 装进 context 的知识层
- **E14 三阶段激活模型**（新增涌现）— origin/process/target 的统一叙事

---

## 座右铭

> The best design is when there's nothing left to take away.

去掉"激活"抽象本身，就是这次的 take away。
