---
title: 版本化布局 stones/main/objects 与 StoneRegistry 发现
description: flat / versioning 两种 stone 布局、objectId 嵌套展开、stone 发现优先级
activates_on: {"window::root": "show_content"}
---

# 版本化布局与 stone 发现

## 两种 stone 布局

- **flat layout**（ooc-6 canonical）：`stones/<objectId>/` —— 无 branch / objects 中间层。普通用户在 world 根直接放 `stones/supervisor/` 即可，不需理解 git worktree。
- **versioning layout**：`stones/<branch>/objects/<objectId>/` —— 有 `<branch>/objects/` 中间层，保留给 metaprog / stone-versioning 的 git 工作流（main = canonical 分支）。

`<branch>/objects/` 中间层让 `stones/<branch>/` 根本身可承载未来 world-level 持久资源（注册表、共享知识、PR-Issue 长寿存储），不必为它们造新顶级目录。LLM 提示词仍写 `stones/<self>/...`（`session-path.ts:rewriteStonesPath` 自动注入 branch 与 `objects/`）。

## objectId 嵌套展开

含 `/` 的 objectId 物理布局由 `common.ts:21` nestedObjectPath 展开：split("/") 后 segments 间插入 `children/` marker。所以 objectId `supervisor/persistable` 落在 `stones/main/objects/supervisor/children/persistable/`（`stone-object.ts:ancestorObjectIds` / `stoneChildrenDir`，`common.ts:STONE_CHILDREN_SUBDIR`）。

## 路径计算函数

集中在 `packages/@ooc/core/persistable/common.ts`：

- `:47` objectDir / `:57` threadDir / `:72` stoneDir / sessionDir。
- `:131` resolveStoneDir —— async **3-path fallback**：flat `stones/<id>/` → versioning `stones/<branch>/objects/<id>/` → deprecated `packages/<id>/`（命中 console.warn）。
- pool 路径在 `pool-object.ts:54` poolDir。

## StoneRegistry —— stone 权威发现

`packages/@ooc/core/persistable/stone-registry.ts` 是 world 中所有 stone Object 的发现机制。

**扫描三类来源 + 优先级（first-seen wins）**：

1. flat layout `stones/<id>/` —— canonical，用户本地覆盖优先。
2. versioning layout `stones/<branch>/objects/<id>/` —— metaprog 分支产物。
3. deprecated `packages/<id>/` —— 仅 fallback，console.warn。
4. builtins `@ooc/builtins/<id>/` —— 平台默认对象。

用户可在 `stones/<id>/` 下放与内置同名 object 实现本地覆盖。关键 API：`rescan(worldBase)` / `invalidate(objectId, files?)` / `listStones()` / `resolveStoneDir(objectId)`。

与 hot-reload 集成：`runtime/hot-reload.ts` 检测 stone 文件变更调 `stoneRegistry.invalidate()`，WorldRuntime 订阅 `stone:changed` 同步失效 ServerLoader 缓存。

## Writer contract

所有 writer 只写 **canonical 路径**（readable.md / executable/index.ts / visible/index.tsx），不再双写 legacy；reader fallback 链（readable.ts → readable.md → readme.md 等）只用于读存量旧数据。
