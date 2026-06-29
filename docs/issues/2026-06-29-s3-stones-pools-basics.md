---
title: S3 · stones / pools 基础(list/create + sediment knowledge)
status: draft
date: 2026-06-29
follows: 2026-06-29-web-server-reimpl-index.md
priority: P1
depends: 2026-06-29-s1-file-edit-read-primitive.md
---

# S3 · stones / pools 基础

## 背景

来自总目录 S3 项。涉及桩点 **6 个**:A1, A2, A3, A4, A5, A6(StoneFallback list)。

`packages/@ooc/web/src/domains/stones/query.ts` 含 5 个 server 函数 + StoneFallback 用 fetchStones — 都是 list/create 基础操作。

## 设计权威锚

- **`knowledge/index.md` §B `## persistable`**:三层(stones/pools/flows),字段级 versioned_fields,scope save/load
- **`## reflectable × persistable`**:stones 变更经 feat-branch PR,**但人类经 app 直 commit main 是合理豁免**(reflectable feat-branch 纪律的豁免对象)
- **`## knowledge_base / knowledge`**:seed(stone /knowledge/)+ sediment(pool /knowledge/);两源编辑落点按版本化分

## 改动提案

### endpoint 设计

`GET /api/stones`:list stones/main/objects/ 下所有目录(每条 `{ objectId, kind: class|object, baseClass? }`)

`POST /api/stones` body `{ objectId, kind?, baseClass? }`:经 versioning(worktree commit main)创建 stones/main/objects/<id>/ 骨架,落 self.md / package.json / readable.md;idempotent

`POST /api/pools/<id>/knowledge/directories` body `{ path }`:创建 pools/<id>/knowledge/<path>/ 目录

`POST /api/pools/<id>/knowledge/files` body `{ path, content }`:创建 pool sediment knowledge 文件

`PUT /api/pools/<id>/knowledge/files` body `{ path, content }`:覆盖更新 pool sediment knowledge

### 实现位置

- 新建 `packages/@ooc/core/app/server/modules/stones/` —— 已被 S1 起步,本 S3 加 list/create endpoint
- 新建 `packages/@ooc/core/app/server/modules/pools/`(pool sediment endpoints)

### 测试

`tests/stones-list-create.test.ts`:POST 创建 stone 后 stones/main/objects/<id>/ 出现 + 一个 commit;GET list 含新 stone;idempotent 已存在 returns created=false
`tests/pools-knowledge.test.ts`:POST 创建目录/文件后 pools/<id>/knowledge/ 出现;PUT 更新内容;不进 git

## 落地 commit 切分

1. `feat(server/stones): list + create endpoint`
2. `feat(server/pools): pool sediment knowledge CRUD endpoints`
3. `feat(web/stones): 解桩 A1/A2/A3/A4/A5`
4. `test: stones-list-create + pools-knowledge`

## 受影响设计元素

- `## app` server module 列表填齐 stones / pools
- `## persistable × reflectable` 实施落实(人类 direct write 豁免)

## 风险

- create stone 经 versioning 但**写 main 直 commit**(不经 feat-branch PR),需在实现处明确——人类侧专路豁免 reflectable feat-branch 纪律(`## reflectable × persistable` 铁律说明)。

## 待裁决点

1. `POST /api/stones` 是否复用 S1 的 `PUT /stones/:id/file?path=` 来落 self.md / readable.md?(推荐:是,统一 file-edit 原语;create 仅创建 dir + 写 package.json,其余 file 经 S1 通路)

## review/裁决/验收 见总目录 workflow
