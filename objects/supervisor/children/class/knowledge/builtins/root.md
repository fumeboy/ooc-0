---
title: root — 一切 Object 的继承链终点基类（最小 Object）
description: builtin root 家族的单一权威定义——kind=class / parentClass=null（无父）/ 单例基类无 construct；空 data；唯一 misc method example；投影成空 root 窗作 thread 顶层信封锚点；过渡态 god-object 已基本退场，残留在 knowledge 旧措辞
activates_on:
  "object::root": "show_description"
---

# root

> root 是 OOC 里**一切 Object 继承链的终点基类**——`resolveParentClassChain` 走到 `parentClass:null` 即止于此。对象模型（class/object、单例·非单例、construct、IS-A 继承、children）见 class/knowledge/object-model.md，本文不复述模型。**以设计为准**，存量代码可能过期，分歧记入「源码现状与差异」。

## 一、是什么（核心职责）

- **`ooc.kind` = `class`**（`packages/@ooc/builtins/root/package.json:16`，`objectId="_builtin/root"`）。
- **继承**：继承链**终点**——`parentClass: null`（显式不继承），由 `register-builtins.ts:42` 与 registry 的 `BASE_CLASS_ANCHORS`（`object-registry.ts:75` `["root",{parentClass:null}]`）双重锚定。所有其它 class 的 parentClass 链最终回退到它。
- **单例基类，无 construct**：root 不被实例化为某个具体业务对象，而是作为**每个 thread 隐含的顶层投影锚点**与方法/知识的回退终点。无 `construct`（`index.ts:13` 只装配 `executable` + `readable`）。
- **角色**：既非 agent（无 agency / thinkloop——已搬去 `_builtin/agent`），也非 tool-object（无文件/进程工具——在 filesystem/interpreter/terminal 成员）。它是**最小 Object 基类**：所有 Object 继承自它的最低公共契约（readable 投影 + 沿链回退的方法表 + root 级协议 knowledge）。

一句话职责：**做继承链终点的最小 Object 基类，承载 thread 顶层窗信封与全 Object 共享的 root 级协议知识。**

## 二、data 结构（types.ts）

`export interface Data {}`（`types.ts:7`）——**空 data**。root 自身无业务字段。`types.ts` 注释言明：每个 thread 隐含一个 root 投影窗（id="root"），其标题即 thread 标题，信封由 runtime 管理（`ROOT_WINDOW_ID="root"`，`_shared/types/context-window.ts:141`）。

## 三、能力

### object method（executable）

仅一个边缘 misc method（`executable/index.ts:20`）：

- **`example`**（`executable/method.example.ts:14`）—— 教学样板：经 `ctx.runtime.instantiate("_builtin/example", args)` 委托 example class 的 construct 造一个 example 子对象，返回提示文本。runtime 不可用时 fail-soft 返回提示。非 `for_ui_access`、非 `public`。

agency（talk/plan/todo/end）已搬去 `_builtin/agent`；文件/进程/飞书工具在各 tool-object 成员。root 类本体只剩此一个 misc method。

### window method（readable）

**无自定义 window method**——root 窗无投影态（`RootWin {}`，`readable/index.ts:17`），window 项 `window_methods: []`。

### 投影（readable）

`readable` 恒投影成 `class: "root"`、`content: []`（空 children，`readable/index.ts:20`）——root 窗**不显式渲染内容**：外层信封 + 调度器的 commands 块已足够表达 root 上可调命令，故让 commands 子节点自然承担。window 项声明该窗展示 root 类的 `object_methods: ["example"]`。

> root 窗在 context 里的位置：它是 thread 顶层窗（`parentObjectId` 缺省或 `="root"` 的窗都挂在它名下，`renderers/xml.ts:332`），各 protocol knowledge / skill_index / activator 窗都以 `ROOT_WINDOW_ID` 为 parentObjectId 悬挂（`thinkable/context/init.ts` / `protocol.ts:57` 等）。

### visible

`visible/index.tsx` 存在但 `WindowDetail` 返回 `null`（`visible/index.tsx:5`）——root 窗无 UI 详情面（与空投影一致）。

### persistable

**无自定义 persistable**——走系统默认（`index.ts` 的 `Class` 不含 persistable 槽，注释 line 5「不自定义 persistable」）。

### construct

**单例基类，无 construct**——root 不按需造实例；其唯一「实例」是每个 thread 隐含的 root 顶层窗（信封由 runtime 管理，非经 construct 产出）。

### root 级协议 knowledge（随框架包发布，全 Object 共享）

root 包带 `knowledge/`（随框架发布、经 `protocol.ts` 按各篇 `activates_on` 注入；root 是基类故这些是**全 Object 的共享协议切片**）：

- **`pr-review.md`** —— 看到 pr_window 时如何评审 feat-branch PR（approve/reject/request_changes）；`activates_on: object::pr`。评审机制细节归 reflectable，本文不复述。
- **`search.md`** —— search_window（filesystem.glob/grep 的结果窗）上 open_match / set_results_window / close 的用法；`activates_on: object::search`。窗本身是 `_builtin/filesystem/search`。
- **`self-evolution.md`** —— 自我演化协议：write_file 改 self.md/readable/executable/visible、记忆走 pool write-through、身份/身体改动走 super flow feat 分支 PR。`activates_on: object::root` + `method::filesystem::write_file`。该机制权威归 reflectable / persistable（stone-feat-branch + evolve_self），本文只记其作为 root 协议 knowledge 的归属。

## 四、children

root **无 children**（家族说明确认）。它是 parent of nothing，仅作继承终点。

## 五、源码现状与差异（设计 vs 实现）

逐条对照 object-model.md 核心设计核验：

1. **kind/继承（核心 1/2）符合**：`kind=class`、`parentClass=null` 双锚（package.json:14-17、register-builtins.ts:42、object-registry.ts:75）；继承链终点语义在 `resolveParentClassChain`（object-registry.ts:135）落实。**无偏离。**

2. **无 self.md（核心 9/迁移映射）符合**：root 是 class 且非 agent，目录无 self.md（`ls` 确认）。**无偏离。**

3. **「root god-object 未拆」——class/self.md:54 的断言相对 executable 源码已过期（应修索引/self.md，非改 root 源码）**：
   - class/self.md:54 与 builtins.md 仍写「root 仍与成员重复持有 file/program 工具」。但 `executable/index.ts:20` 的 root method 列表**只剩 `exampleMethod`**——agency 已搬 `_builtin/agent`（agent/executable/index.ts talk/plan/todo/end）、飞书接入已收口 feishu_app、文件/进程工具在 filesystem/interpreter/terminal 成员。`grep open_file/write_file/grep/glob packages/@ooc/builtins/root` 在 root **源码内无命中**（仅 knowledge 文档措辞提及）。`makeRootDelegator` 在**全部 `.ts`（源码 + `__tests__`）已零引用**——仅残留于旧规划 doc（`docs/refactor_0604/`、`docs/next_todo.md`）与 class/self.md:48 的 exec 路由措辞。
   - 结论：**method 层的 god-object 重复已基本退场**——root 源码已是瘦基类。class/self.md「未拆/仅移除一步就破约 30 个测试」的现状描述应回流更新（标注：**索引/self.md 过期，应修**）。残留的过渡痕迹见下条。

4. **过渡态残留：root knowledge 旧措辞（应修，轻）**：`knowledge/self-evolution.md` 把 `write_file`/`open_file` 当作 root-context 直调命令叙述，且示例用**已退役符号** `export const window = { methods: {...} }`（self-evolution.md:44，dict 形态）+ `exec(window_id="custom:<self>", …)`（self-evolution.md:18-19、59；`custom:` 前缀退役见 thinkable/context/init.ts:169）——这是旧的 custom-method 注入形态，与现 ooc class `executable/index.ts` 的 `export default {methods:[ObjectMethod...]}`（array + default export）+ `OocClass` 装配不符。属退役符号 doc 未回流（与 [[feedback_deprecated_symbol_doc_drift]] 同类）；当前 `check:doc-drift` 跑 OK、并不拦这两个模式。**应修**：重写为现 class 装配口吻 + 补 FORBIDDEN_PATTERNS。

5. **迁移映射自身过期（object-model.md:92，应修）**：object-model.md 迁移段称「`instantiate-classes.ts` 的旧 flag 待回流移除」。但 `bootstrap/instantiate-classes.ts:51-52` 已无 `instantiate_with_new_world`，改为 `pkg?.ooc?.kind !== "object"` 判定（Wave 4 裁决落地）。迁移映射应回流标「已完成」。（非 root 文件，但与 root 作为基类的实例化路径相关，记此供索引修订。）

6. **types.ts 信封注释符合**：`types.ts:1-7` 注释「每个 thread 隐含一个 root 投影窗 id="root"，标题即 thread 标题，runtime 管理信封」与 `ROOT_WINDOW_ID` / `renderers/xml.ts:332` 的顶层挂载逻辑一致。**无偏离。**

## 六、倒推 ooc core 改进方向

- **direction**：把「root 已瘦成最小基类」这一事实回流进 class/self.md:54 + builtins.md 的 root 条目（移除「god-object 未拆/移除一步破 30 测试」的过期现状），并补一条「method 层重复已退场，残留仅 knowledge 措辞」。**rationale**：设计权威与源码已分歧，索引若继续宣称 god-object 会误导后续维度设计师在不存在的重复上做减法。**severity**: medium。

- **direction**：重写 `builtins/root/knowledge/self-evolution.md`，剔除退役符号 `export const window={methods:{}}` / `exec(window_id="custom:<self>")`，改用现 ooc class `executable/index.ts`（`export default {methods:[ObjectMethod]}`）+ `OocClass` 装配口吻；并把 write_file/open_file 措辞从「root 命令」校正为「filesystem 成员方法」。同时把这两个退役模式加进 `check-doc-deprecated-drift.sh` 的 FORBIDDEN_PATTERNS——**当前 `check:doc-drift` 跑 OK、并不拦它们**（脚本里 `export const window` 反被当作正确替代形态，`custom:` 前缀未登记；`custom:` 退役见 thinkable/context/init.ts:169）。**rationale**：root knowledge 是**全 Object 共享**的协议切片（root 是基类，经 protocol.ts:57 注入所有 thread），旧措辞会把退役 API 教给每一个 agent；当前防回流网兜不住，须既改 md 又补 pattern。**severity**: high。

- **direction**：回流 object-model.md:92 迁移映射——`instantiate-classes.ts` 旧 flag 已移除（现按 `ooc.kind` 判），标「已完成」并删该待办。**rationale**：迁移段宣称「待回流移除」的事项已做完，留着属虚假待办。**severity**: low。

- **direction**：清理残留的 `makeRootDelegator` 措辞——它在**全部 `.ts`（源码 + `__tests__`）已零引用**，仅遗留在 class/self.md:48 的 exec 路由描述与旧规划 doc（`docs/refactor_0604/`、`docs/next_todo.md`）。回流 class/self.md:48，把「本体经 `makeRootDelegator` 委托同一条 constructor 链」改成现实路径（registry `resolveMethod` 沿 parentClass 链）。**rationale**：root 委托链已收敛到 registry resolveMethod 沿 parentClass 链；设计文档仍把已退场的 helper 当 live 描述会掩盖真实解析路径、阻碍 god-object 完全退场的验证。**severity**: low。

- **direction**：destruct/init 契约（`ooc-class.ts:48-50`）对 root 这种单例基类语义未定——root 永驻、无销毁/启动周期。**rationale**：契约已声明 init/destruct 但「单例基类不参与 World 启动 init / 不被 destruct」这一边界未在任何 doc 钉死，机制实现时遍历调 init 需显式跳过 root 类。**severity**: low。
