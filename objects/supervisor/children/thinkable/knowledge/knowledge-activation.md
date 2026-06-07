---
title: knowledge 激活协议（双源加载 + activates_on trigger）
description: thinkable 如何双源加载知识并按 activates_on trigger 渐进激活，含 window::root always-on 修复
activates_on:
  "window::root": "show_content"
---

# knowledge：双源加载 + trigger 渐进激活

Object 持有的 markdown 知识不是一次全喂——按 `activates_on` trigger 在合适时机渐进激活，控制每轮 context 体积。

## 双源加载（`packages/@ooc/core/thinkable/knowledge/loader.ts:56`）

`loadKnowledgeIndex()` 从两个源加载，并沿祖先 / parentClass 继承链合并：

- **stone seed**：`stones/<branch>/objects/<self>/knowledge/`（设计期写定、进 git）
- **pool sediment**：跨 session 沉淀的事实（不进 git）

同 idPath 冲突时 sediment 胜出 + console.warn。

## 激活级别（`knowledge/activator.ts:26`）

`computeActivations()` 对每篇知识按当前 thread 求激活级别：

- `show_description`：只露 title + description
- `show_content`：展开正文进 context

多 trigger 命中取 max。

## trigger 求值（`knowledge/triggers.ts:201`）

`evaluateTrigger()` 是纯函数，求值 `activates_on` 的五类 trigger：**object / method / objectId / super / intent**。

### window::root always-on（关键修复）

`window::root` 被文档化为「root window 每个 thread 都有，等价任何时候」。但 root 是 manager 提供的**虚拟隐式父 window**，从不 push 进 `thread.contextWindows`——若按扫窗口匹配 `type==="root"` 的 open window 则**永不命中**，导致沉淀的 memory 永不激活、召回闭环静默断（reflectable harness 发现）。

修复：object case 特判 `trigger.objectType === "root"` → 直接 `return true`（`knowledge/triggers.ts:211`，链路注释 :206-:210）。一处特判，不动 parse 路径，坐实文档承诺。

## 出厂身份作废

每轮注入框架序言「你是谁：身份只由 self.md 定义」（`knowledge/basic-knowledge.ts:18`）——防止 LLM 即兴演角色，身份唯一来源是 self.md。

## 未决：死知识

无 `activates_on` frontmatter 的 pool knowledge 永不自动激活；写错 schema 的 sediment 仅 warn 跳过。靠 LLM 自觉，缺统一写入期闸门 / 巡检。这是 thinkable 当前最高价值的待办。
