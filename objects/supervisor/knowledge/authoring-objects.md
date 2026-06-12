---
title: 如何建/写一个 OOC 对象（建对象 → 五件套 → 演化合入）
description: 想新建一个 OOC 对象（Agent）、写它的身份/方法/UI、或让它自我演化时看这篇；权威路径 = create_object 建骨架 + write_file 改文件 + feat-branch PR 沉淀进 canonical
activates_on:
  "object::root": "show_description"
  "method::root::create_object": "show_content"
---

# 如何建/写一个 OOC 对象

一个 OOC 对象（可交互的就是一个 Agent）= `stones/<branch>/objects/<id>/` 下持久的**五件套** + 它在 session 里被运行起来的 thinkloop。这篇讲从空到能跑的全流程：建骨架、写五件套、自我演化合入。

建/改对象进 canonical 都收敛到 feat-branch PR 沉淀模型，权威机制见 reflectable `feat-branch-pr.md`、persistable `stone-pool-flow-three-trees.md`、class `class-vs-object.md`。

## 先判定：该不该建一个新对象

多数时候答案是**不该建**——只是给已有对象加一种能力，走那个对象的 executable/knowledge 即可。真正需要新对象（尤其是 Agent）的信号：

- 它有独立、能一句话说清的领域/能力，不撞已有对象；
- 它有跨 session 状态（data.json / 产物）与领域专属知识需要随上下文激活；
- 它会被其它对象通过 talk 频繁调用，是一个有身份的协作方。

反之——无状态脚本、纯函数式工具、「给一段输入返回一段输出」——应当做 **skill**（branch 级共享 / object 级私有）而非对象；只是某个工作流的一个阶段，应当做对应对象的一条 method 或一篇 knowledge。把外部世界（飞书/notion/slack 等）接进来通常做成 extendable Window 而非对象（见 `knowledge/example-cases.md`、`ooc-glossary.md`）。

## 一句话流程

> **建新对象 = `create_object`（落 session worktree）；改已存在对象的文件 = `write_file`/`edit`；让改动进 canonical = `talk(super)` → `new_feat_branch` 开 feat 分支 → 在分支上编辑 → `create_pr_and_invite_reviewers`（finalizer）开 PR → reviewer 审批合入 main（详见 Step 3）。**

不要用 `mkdir` 手搓骨架，也不要裸 `write_file` 建新对象——新对象还没 `package.json`，`write_file` 靠它判 owner 边界会拒。

## Step 1 — 建对象骨架（create_object）

`create_object` 是建新对象的唯一 LLM 原语，**仅业务 session 可调**（super flow 是合入闸门不建身体；控制面建对象走 HTTP `POST /api/stones` 直 commit main）。它原子地把骨架落到 `flows/<sid>/objects/<newId>/`，**此刻不 commit、main 不变**。

参数（`create-object` method schema）：

- `objectId` 必填：新对象 id（≤64 字符、逐段 `[A-Za-z0-9_.-]`；嵌套子对象用 `parent/child`）。不能撞现有对象或 Builtin（supervisor / user / root）。一旦建出即永久 id，不要重命名（它会被 talk target / 关系文件 / PR-Issue 等多处持久化引用）。
- `selfMd` 必填：`self.md` 全文，第一人称身份叙述，非空。
- `readableMd` 必填：`readable.md` 全文，对外公开自述，非空。
- `knowledge` 可选：`{ "<filename>.md": "<content>" }` map，写入 `knowledge/`（seed 知识）。

```
open(method="create_object", title="建 report_writer", args={
  objectId: "report_writer",
  selfMd: "# report_writer\n我是报告撰写助手……",
  readableMd: "# report_writer\n找我做什么：把分析结论写成报告……",
  knowledge: { "report-style.md": "# 报告体例\n……" }
})
```

骨架建出后只有 `package.json`（含 `ooc.objectId` / `kind` / `type`）+ `self.md` + `readable.md`（+ 你给的 `knowledge/`）；`executable/` `visible/` 等其余件按需后续 `write_file` 补，lazy mkdir。

## Step 2 — 五件套：身份 / readable / executable / visible / knowledge

stone 持有的逻辑契约是**五件套**（object 与 class 同形态，区别只在 class 不可交互、不跑 thinkloop——见 class `class-vs-object.md`）：

| 件 | 文件 | 作用 |
|----|------|------|
| 身份 | `self.md` | 第一人称，建 input 时注入 LLM instructions |
| readable | `readable.md` 或 `readable.ts` | 对外公开介绍（其他 Object 与我 talk 时作 relation 知识注入）+ 可编程控制 LLM 侧展示 |
| executable | `executable/index.ts` | 我的 object method 源码 |
| visible | `visible/index.tsx` | 我面向人类的 UI（缺省走 Stone fallback：展示 self/readable/knowledge/recent flows） |
| knowledge | `knowledge/<slug>.md` | seed 知识，按 frontmatter `activates_on` 自动激活 |

**身份文件体例**：`self.md` 第一人称写「我是谁、我做什么、我不做什么」，第一行 `# <id>（中文名）` 作 displayName 派生源；`readable.md` 写「找我做什么、不要找我做什么」。第一行缺失 → UI fallback 到 objectId。两份都用 Object 口吻，不写开发者旁白。

### executable/index.ts —— 我的方法

object method 操作我自身的业务数据，写在 `executable/index.ts` 的 `export const window`，运行时经 `registerNewObjectType` 动态注册：

```ts
export const window = {
  methods: {
    <name>: {
      description: "...",                // 必填：LLM 面向的方法描述
      intents: ["<name>.<sub>"],         // 可选：静态 sub-intent 目录（反向索引/文档用）
      onFormChange(change, { args }) {   // 可选：省略则免表单直接 exec
        return { tip: "...", intents: [{ name: "<name>" }], quick_exec_submit: true };
      },
      schema: { /* 可选：结构化参数渲染 + fail-soft 校验 */ },
      for_ui_access: true,               // 可选：标了它，该 method 才可经 HTTP call_method 被前端/client 调（visible UI 用）；不标只给 LLM
      exec: async (ctx) => {
        // ctx：thread / self / args / form?（method.ts:147 MethodExecutionContext）
        return { ok: true, result: "...", data: {} };   // 或 { ok: false, error } 或 { ok: true, window }（constructor）；for_ui_access 方法前端从 data 取数渲染
      },
    },
  },
};
```

要点（深术语见 executable `method-and-constructor.md`、programmable `self-written-method-hot-reload.md`）：

- 字段名是 **`methods`**（不是 `commands`）；每条 entry 是头等 `ObjectMethod`，与内置 window 上的 method 同构（`description / intents? / onFormChange? / schema? / for_ui_access? / exec`）。旧 `match` / `knowledge` 字段已删，旧 `export const llm_methods` 会被 loader 硬切报错。**UI 可调机制（2026-06-11 起）= 给方法标 `for_ui_access: true`，不再有独立 `export const ui_methods` 维度**——HTTP `call_method` 只暴露 `window.methods` 里标了它的方法（`stones/service.ts` / `flows/service.ts` call_method 校验 `entry.for_ui_access===true`）。
- 返回 `MethodOutcome` 三态：`{ ok:true, result? }` | `{ ok:true, window }`（`kind:"constructor"`，manager 自动 mount 到 thread context）| `{ ok:false, error }`。method **不抛异常**，错误走结构化结果让上游 LLM 自己判断。`exec` 也可直接返回 `undefined`（成功无文本）或裸 `string`（即 result），runtime 规范化（`method.ts:56 normalizeMethodOutcome`）。
- `exec` 的 `ctx` 是 `MethodExecutionContext`（`method.ts:147`）：`thread? / self?（receiver window）/ args / form?` 等。`ctx.programSelf`（`dir / callMethod / getData / setData / getThreadLocal / setThreadLocal`）**只在 program_window 跑用户代码时由 dispatcher 注入**（`builtins/program/executable/self.ts:9`），不是普通 object method 的通用入参。
- **window method**（只控展示，如 `set_viewport`）归 readable 维度，写在 `readable.ts` 的 `registerReadable({ windowMethods })`，不写在 executable。同一 type 上同名方法不能既是 object 又是 window method，registry 注册期 fail-loud。
- **继承靠 class**：`package.json` 的 `ooc.class` 声明父类；缺省 `parentClass` 隐式继承 `"root"`，自动拿到 `talk / do / todo / plan / program / open_file / open_knowledge / glob / grep` 等通用方法，不必重复声明。prototype chain 已彻底剔除（2026-06-07）。
- **纪律**：列表/搜索类 method 必须有默认分页；`exec` 返回大 JSON 必须包大小截断（防把下轮 LLM 请求打 413）。不要把 RPC helper / 业务逻辑对外导出，全部 module-private，只通过 `methods` 暴露（要给前端/client 调的标 `for_ui_access`）；stone 内不建独立 `src/` 子目录（私有 sibling 用 `executable/_*.ts`）——`src/` 会被 LLM 当成可裸 import 的脚本，绕过 method 契约。

### visible/index.tsx —— 我的 UI（可选）

要被人类直接看见才写；props 至少接 `{ sessionId?, objectName?, callMethod? }`，`callMethod(name, args)` 经 HTTP `call_method` 调 `window.methods` 里标了 `for_ui_access` 的方法（未标的只给 LLM）。不写则走 Stone fallback。深术语见 visible child。

### knowledge —— seed 知识（可选但推荐）

`knowledge/<slug>.md` 用 frontmatter `activates_on` 决定何时被激活（三类 trigger：`window::<type>` / `method::<type>::<method>` / `super`），值 `show_description` | `show_content`。关系认知放在 `knowledge/relations/<peer>.md`，与该 peer talk 时自动连同对方 `readable.md` 一起激活。seed（人类预置、进 git）与 sediment（运行时沉淀、不进 git、落 pool）的区别见 `knowledge/ooc-glossary.md`。

### skills —— 可复用操作模式（可选）

多步骤工作流 / 大块协议 / 需要辅助文件的复杂操作，封装成 `skills/<name>/SKILL.md`（+ references/scripts）。双层：branch 级 `stones/<branch>/skills/<name>/`（跨对象共享）/ object 级 `objects/<self>/skills/<name>/`（仅自己可见，同名时优先）。LLM 通过 `skill_index` window 看索引按需 `open_file` 进入。三选一准则：knowledge=被动激活（协议补全）、method=调用即执行（明确函数操作）、skill=主动选择（复杂工作流）。

## Step 3 — 沉淀进 canonical（feat-branch PR）

业务 session 的 `session-<sid>` worktree 是纯运行时派生物，**永不合并回 main**——session 内 `write_file`/`edit` 当场可用（靠 session-aware 读），但与「进 canonical」是两件事。让改动永久进 main 走 feat-branch PR：

- `talk(target="super")` → super flow → `new_feat_branch`：从 main 派生一条 feat 分支 worktree 并绑进 thread（绑定覆盖路由让后续 write_file 直接落 feat worktree）。
- 在 feat 分支上直接 `write_file`/`edit` 编辑五件套。
- `create_pr_and_invite_reviewers`（finalizer，无 edits 参数）：commit（署名 actor）→ `computeReviewerSet` 冒泡算 reviewer 集（变更触及路径的顶层领地 owner ∪ supervisor，author 不自审）→ 开 PR → 投递 pr_window 给 reviewer。
- reviewer 经 pr_window `approve`/`reject`/`request_changes` 审批；全 approve → ready-to-merge → `.world.json prAutoMerge`（缺省 false=人工 `/resolve{merge}`）闸合入 main。
- 下一轮新 thread 自动看见 main 上的落盘内容。

**热更**：`executable/index.ts` 写完后 loader 按 mtime 失效缓存，下一次调该方法自动 re-import，不重启进程（深机制见 programmable `self-written-method-hot-reload.md`）。结构性改动（改 self.md 身份、重组模块、设计 UI 主页）建议先 `talk(target="super")` 想清楚再写。

## 验证

- HTTP：`GET /api/stones` 列表含新 objectId；`/api/stones/<id>/self` 返回 self.md。
- Web：Welcome 的 talk target 含新对象 displayName；`/stones/<id>` 走 Stone fallback 或自定义 visible 页。
- 真实协作链路：从 Welcome 起 session、target 选新对象、发一句，能看到 assistant 回复。
- 自验证 session 用 `_test_<agent>_<ts>` 前缀，跑完清理。
