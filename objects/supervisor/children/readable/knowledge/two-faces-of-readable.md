---
title: readable 的两个面 —— 静态自我介绍 vs 动态展示控制（同维同义）
activates_on:
  "object::readable": show_content
---

# readable 是同一维度的两个面，不是两个维度

历史上 readable 这个词在文档里有过两种读法，曾让人怀疑是"同名两义"：

1. **静态自我介绍面**：readable = "可被其他 Agent 阅读的（能够进行自我介绍）"，实现为 `readable.md`（原 readme.md），与 self.md 构成 Object 的双面身份。
2. **动态展示控制面**（我的对象 + 代码：`registerReadable` / window method / compressView）：readable = "Object 控制自己在 Context 中如何以 XML 形式展示给 LLM"。

## 结论：同一维度的两个面（不是两个东西）

**统一判据 = "Object 怎样被读"**。两面都回答这个问题——静态名片是"被读到的固定自述"，动态渲染是"被读到的随状态变化的展示"。

**铁证（同一渲染槽位的优先级回退）**：`resolveReadableForType` 在**同一个解析链**里依次 try **4 个块**，命中谁就渲染成**同一个 `<readable>` XML 节点**（`packages/@ooc/core/thinkable/context/renderers/xml.ts:139-172`）：

1. `registry.readable` —— builtin type 注册的动态 ReadableFn（`xml.ts:139`）。
2. `loadObjectWindow(stoneRef).readable` —— 加载的 window 上的 readable（`xml.ts:153`）。
3. `loadObjectReadable(stoneRef)` —— 磁盘 readable.ts 动态函数（`xml.ts:161`）。
4. `readReadable(stoneRef)` —— **静态 readable.md，内部再 fallback 到 legacy readme.md**（`xml.ts:169` / `stone-readme.ts:26`）。

四块全 miss 则函数返回 `undefined`，调用方再走默认渲染（title + status + methods 列表，不在本函数内）。即优先级链 `readable.ts(动态) > readable.md > readme.md(deprecated) > 默认`。**静态自我介绍是这条链的最低优先级兜底，动态 ReadableFn 是高优先级覆盖——它们写进同一个槽位，是一个维度的两个面。**

## 因此 readable 维度的完整定义

> readable = Object 怎样被「思考者（LLM）」读到。
> - 静态面：readable.md（自我介绍名片，与 self.md 双面身份）。
> - 动态面：readable.ts/renderXml（按状态算 XML）+ windowMethods（控展示状态）+ compressView（压缩态）。

上面这条统一表述（readable = Object 怎样被思考者读到，含静态 + 动态两面）即本维度的权威定义。早期有过只覆盖静态面的窄表述（"可被其他 Agent 阅读的（能够进行自我介绍）"），现已收口为本节的统一表述，不再保留窄版。
