---
title: readable 的两个面 —— 静态自我介绍 vs 动态投影（同维同义）
activates_on:
  "object::root": "show_description"
---

# readable 是同一维度的两个面，不是两个维度

历史上 readable 这个词有过两种读法，曾让人怀疑是"同名两义"：

1. **静态自我介绍面**：readable = "可被其他 Agent 阅读的（能够进行自我介绍）"，实现为 `readable.md`，与 self.md 构成 Object 的双面身份。
2. **动态投影面**（Object class 的 `readable` 模块：投影函数 + window method）：readable = "Object 把自己投影成 context window 给 LLM 看"。

## 结论：同一维度的两个面（不是两个东西）

**统一判据 = "Object 怎样被读"**。两面都回答这个问题——静态名片是"被读到的固定自述"，动态投影是"被读到的随 Data/视角变化的展示"。

**铁证（同一投影槽位的优先级回退）**：渲染器算一个 object 实例的投影时，在**同一条回退链**里依次 try，命中谁就渲染成**同一个 `<readable>` 投影**（`resolveProjection`，`packages/@ooc/builtins/agent/children/thread/thinkable/context/renderers/xml.ts:285`）：

1. `resolveReadable(inst.class)?.readable(ctx, inst.data, inst.win)` —— class 的动态 readable 投影（沿继承链解析；`:251`）。
2. 回退读盘 `readReadable(stoneRef)` —— **静态 readable.md**（无 Class.readable 时；`:268`）。
3. 都无 → placeholder 投影（`:284`）。

即优先级链 **动态 readable 投影 > 静态 readable.md > placeholder**。**静态自我介绍是这条链的最低优先级兜底，动态投影是高优先级覆盖——它们写进同一个 `<readable>` 槽位，是一个维度的两个面。**（fail-soft：任何一步抛错都不崩 think loop，落 placeholder。）

## 因此 readable 维度的完整定义

> readable = Object 怎样被「思考者（LLM）」读到。
> - 静态面：readable.md（自我介绍名片，与 self.md 双面身份）。
> - 动态面：`readable(ctx, self, win)` 投影函数（按 Data + 视角算出投影 class 与 content）+ window method（调投影态 win）。

上面这条统一表述（readable = Object 怎样被思考者读到，含静态 + 动态两面）即本维度的权威定义。早期有过只覆盖静态面的窄表述（"可被其他 Agent 阅读的（能够进行自我介绍）"），现已收口为本节的统一表述，不再保留窄版。
