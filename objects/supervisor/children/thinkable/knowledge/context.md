---
title: context 的构成（你看到的世界）
description: ContextWindow=Object 的胖指针；context 三段(身份/环境/消息流)+三原语；attention 分层；thread 间通信唯一动词 talk(target/fork/share)
activates_on:
  "object::root": "show_description"
---

# context：你每轮看到的世界

你每轮看到的 context = **身份 + 一组 ContextWindow + 消息流**。

## ContextWindow = Object 的胖指针

每个窗是某个 Object 的**胖指针**：除了指向哪个 Object（id / class），还持有控制本窗**如何展示**的信息（viewport、压缩档…）。窗有两个各自独立、各自可缺的面：

- **content**（你能看的）+ **method**（你能做的）。谁都不是"主"；两面皆空则窗退化为纯句柄（仅 id/class/title/status）。
- 方法**不写在窗上**——按 class 在 `<window_classes>` 声明一次，沿 parentClass 链解析（子类自动继承父类方法）。
- **同一份信息只渲一次**：内容缺省落 placeholder，或外移到别处呈现（自身身份 → instructions、会话 → 消息流）。

## 三段 + 三原语

- **instructions**：你的 self.md（你是谁；唯一身份来源）。
- **`<context>` 环境**：窗结构 + 方法契约——一份环境快照，引用着读。
- **消息流**：会话 + 动作（原生顺序，重点 attend）。
- **三原语**：`exec`（在某窗上调一条 method）/ `close` / `wait`。`compress` 不是原语——它是"调整展示"的**窗方法**（与 file 窗 `set_viewport` 同类），经 `exec(method="compress")` 调用。

## attention 分层：会话渲在哪，由主次决定

- 与 **creator**（创建本 thread 的派活方——user 或 parent thread）的对话 = **主要 attention** = 全文走消息流；creator 窗在 `<context>` 里只剩句柄。
- 与 **sub / peer**（子线程 / 旁路对象）的对话 = **次要 attention** = 全文留在该窗的 transcript；消息流只出一条"新消息提示"。
- 判据是 `isCreatorWindow`，**与 creator 是 user 还是 parent thread 无关**——任何线程都把"创建它的派活方"当主线。

## thread 间通信：唯一动词 talk

`exec` 是**同步**在场调用；跨 thread 通信只有一个**异步**动词 **talk**（开线程 + 通话）。

- **`talk(target, title, fork?, share?)`** —— 创建 `target` 的**一条新 thread**：
  - `target` = 某 objectId（**可为自己**）：自己 → 子线程（同 job）；peer → 跨对象会话；`super` → 反思分身。
  - `fork?` = 一个**已有 thread id（该 thread 必须属于 target）** → 新 thread **复用该 thread 的全部 context windows**（即 fork 那组胖指针；快照拷贝，之后各自演化）。
  - `share?` = `[{ window_id, mode: "ref" | "move" }]` → 把我 context 里的窗共享给新 thread 传上下文（ref=只读引用 / move=移交，复用通用 SharingState）。
- **`say(msg, wait?, share?)`** —— 在已有 talk 窗上发消息（`share` 可在发消息时顺带共享窗）。

子→父回信走 creator 窗的 `say`。**`do`（fork 子线程）= `talk(target=自己)`，已并入 talk**；旧 `move` / `continue` 并入 `say` / `share`。
