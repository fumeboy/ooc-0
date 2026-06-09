---
activates_on: {"object::root": "show_description"}
---

# class 链 knowledge 继承

object 的 knowledge 加载有**两条不同的继承轴**，loader 分两步扫描（`packages/@ooc/core/thinkable/knowledge/loader.ts`）：

## Step 1：children 嵌套 / 领域层级祖先继承（opt-in）

`stones/<branch>/objects/<ancestor>/knowledge/` 下的文件，**仅** frontmatter `inheritable: true` 才向后代 Agent 继承（`loader.ts:111`、`:117`）。这是子 Agent 的 opt-in——领域祖先选择性下放知识。

## Step 1b：class 链 seed 继承（无条件）

沿 parentClass 继承链各 class 的 knowledge 目录加载，**无条件继承、不门控 `inheritable`**（`loader.ts:129`）。class 存在即为被继承——其 seed knowledge 无条件流向 instance。closest → farthest 顺序，更近的父类 override 更远的。

> 关键区别（`loader.ts:131` 注释）：Step 1 的领域层级祖先继承是 child Agent 的 opt-in（需 `inheritable:true`），与 Step 1b 的 class 链无条件继承是**不同的轴**。

## class knowledge 目录如何解析

parentClass 链由 `registry.resolveParentClassChain(objectId)` 求得（`loader.ts:71`），每个 class id 经 `stoneKnowledgeDir` 求 knowledge 目录（`loader.ts:73`）。对 `_builtin/<id>` 前缀，`stoneKnowledgeDir`（`packages/@ooc/core/persistable/stone-object.ts:35`）经 `resolveBuiltinReadDir` 走框架包 `@ooc/builtins/<id>/knowledge/`，于是框架 class 的 seed knowledge 经 class 链无条件继承给 instance。

实证：supervisor instance 经 `ooc.class="_builtin/supervisor"` 继承框架 supervisor class 的全部 5 篇 seed knowledge（9 维度 / world-vocabulary / 治理操作等），加上 root 命令，在全新 world 的首次对话即全部加载。
