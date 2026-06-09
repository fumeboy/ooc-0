---
title: 版本化布局 stones/main/objects 与 StoneRegistry 发现
description: flat / versioning 两种 stone 布局、objectId 嵌套展开、stone 发现优先级
activates_on: {"window::root": "show_content"}
---

# 版本化布局与 stone 发现

## 两种 stone 布局

- **flat layout**（ooc-6 canonical）：`stones/<objectId>/` —— 无 branch / objects 中间层。普通用户在 world 根直接放 `stones/supervisor/` 即可，不需理解 git worktree。
- **versioning layout**：`stones/<branch>/objects/<objectId>/` —— 有 `<branch>/objects/` 中间层，供 git 工作流使用（main = canonical 分支；session 分支 `session-<sid>` 的 worktree 物理落在 `flows/<sid>/`）。

`<branch>/objects/` 中间层让 `stones/<branch>/` 根本身可承载未来 world-level 持久资源（注册表、共享知识、PR-Issue 长寿存储），不必为它们造新顶级目录。LLM 提示词仍写 `stones/<self>/...`（`session-path.ts:rewriteStonesPath` 自动注入 branch 与 `objects/`）。

## objectId 嵌套展开

含 `/` 的 objectId 物理布局由 nestedObjectPath（canonical 定义 `packages/@ooc/core/_shared/types/thread.ts:85`，经 `common.ts` re-export）展开：split("/") 后 segments 间插入 `children/` marker。所以 objectId `supervisor/persistable` 落在 `stones/main/objects/supervisor/children/persistable/`（`stone-object.ts:60 ancestorObjectIds` / `:45 stoneChildrenDir`，`_shared/types/thread.ts:70 STONE_CHILDREN_SUBDIR`）。

## 路径计算函数

集中在 `packages/@ooc/core/persistable/common.ts`：

- `:61 objectDir` / `:72 threadDir` / `:87 stoneDir`（`flow-object.ts:60 sessionDir`）。
- `:144 resolveStoneDir` —— async **2-path**：canonical `stones/main/objects/<id>/` → versioning `stones/<branch>/objects/<id>/`；都不存在返回 canonical（caller 处理 ENOENT）。deprecated `<world>/packages/<id>/` 兼容层已于 2026-06-07 整体移除（含 `_deprecatedPackageDir` 与第 3 路 fallback）。
- pool 路径在 `pool-object.ts:54 poolDir`。

## StoneRegistry —— stone 权威发现（不在我这片）

发现/扫描机制 `createStoneRegistry` 物理住在 **`packages/@ooc/core/runtime/stone-registry.ts`**（runtime 维度，不是 persistable）——我只负责路径计算与 IO，发现归 runtime。但它扫的就是我定义的三类布局，记在这里供对照。

**扫描三类来源 + 优先级（first-seen wins，`rescan` `stone-registry.ts:165`）**：

1. flat layout `stones/<id>/` —— canonical，最高优先级，用户本地覆盖优先。
2. versioning layout `stones/<branch>/objects/<id>/` —— git worktree mirror（session 分支 `session-<sid>` 的 worktree 物理落 `flows/<sid>/`；扫的是 `stones/<branch>/objects/` 镜像）。
3. builtins `node_modules/@ooc/builtins/<id>/` —— 平台默认对象（仅扫白名单 `BUILTIN_OBJECT_IDS`）。

（deprecated `<world>/packages/<id>/` 扫描已于 2026-06-07 随兼容层移除——该布局无活跃使用。）

用户可在 `stones/<id>/` 下放与内置同名 object 实现本地覆盖。`StoneRegistry` 接口（`stone-registry.ts:41`）：`getDef(objectId)` / `list()` / `listByKind(kind)` / `rescan()` / `on("stone:changed", listener)` / `invalidate(objectId, files)`。（按 objectId 解析磁盘路径是我这片的 `resolveStoneDir`，不在 registry 接口上。）

与 hot-reload 集成：`runtime/hot-reload.ts` 检测 stone 文件变更调 `stoneRegistry.invalidate()`，WorldRuntime 订阅 `stone:changed` 同步失效 ServerLoader 缓存。

## Writer contract

所有 writer 只写 **canonical 路径**（readable.md / executable/index.ts / visible/index.tsx），不再双写 legacy；reader fallback 链（readable.ts → readable.md → readme.md 等）只用于读存量旧数据。
