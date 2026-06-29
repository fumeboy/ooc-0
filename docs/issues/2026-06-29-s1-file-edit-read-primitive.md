---
title: S1 · 通用 file-edit / file-read 原语(A1 通路 + read 对称)
status: decided
date: 2026-06-29
follows: 2026-06-29-web-server-reimpl-index.md
priority: P0
---

# S1 · 通用 file-edit / file-read 原语

## 背景

来自总目录 S1 项。涉及桩点 **10 个**(最多): A7 + E1 + E2 + F1 + F3 + F4 + F5 + D1 + D2 + D3。

ooc-6 web 期望读 stones/pools/flows 下文件,但**用了多套不一致 endpoint**:
- `GET /api/stones/<id>/self`(读 self.md 文本) → 应统一到 file 原语
- `GET /api/stones/<id>/readable`(读 readable.md) → 同上
- `GET /api/tree?scope=&path=` → 列树
- `GET /api/tree/file?path=` → 读 world 内某文件
- `GET /api/file/read?path=` → 读任意本机文件(LLM file_window 视角)
- `GET /api/objects/:scope/:objectId/client-source-url`(读 visible/index.tsx absPath/fsUrl)

## 设计权威锚

**app/self.md L16**:
> **源文件编辑收口为单一 file-edit 原语**: 编辑某 Object 的源文件经一个 file-agnostic 的版本化原语 `PUT /api/stones/:id/file?path=<相对路径>`(body=content,经 runVersioned 直 commit main)— 替代按文件类型开端点(self / readable / executable-source 三个 typed PUT 退役)。path 经三层防护: `safeKnowledgePath`(拒 NUL/绝对/`..`) + **白名单**(仅 `self.md` / `readable.md` / `executable/index.ts` / `visible/index.tsx` / `knowledge/*.md`) + `ensureInside`(限 stone 目录内)。

**index.md §B `## visible`**:
- `GET /api/objects/:scope/:objectId/client-source-url`:client-source-url endpoint 是当前权威(`app/server/modules/ui/api.client-source-url.ts`)
- 前端经此拿 `{ absPath, fsUrl }`,经 `/@fs/${absPath}` 动态 import

## 改动提案

### 1. 实现 stones module(`app/server/modules/stones/`)

**`PUT /api/stones/:id/file?path=<relative>`**(单一 file-edit 原语):
- body: `{ content: string }`
- 三层 path 防护(白名单文件 + safeKnowledgePath + ensureInside stone 目录)
- 经 `runVersioned` 直 commit main(豁免 reflectable feat-branch 纪律,人类=canonical 主权者)
- response: `{ ok: true; objectId; path; commit?: { sha; message } }`

**`GET /api/stones/:id/file?path=<relative>`**(对称 read,新):
- 同白名单 + path 防护
- response: `{ content: string; etag?: string }`
- **替代 ooc-6 时代专用 `/api/stones/:id/self` 与 `/api/stones/:id/readable`**

**桩点接通**:
- A7(StoneFallback 读 self/readable): 改用 `GET /api/stones/:id/file?path=self.md` 与 `?path=readable.md`
- E1(fetchSelfFirstLine): 同上
- E2(usePeerReadable): 同上

### 2. 实现 ui module 的 client-source-url(`app/server/modules/ui/api.client-source-url.ts`)

设计权威说应有,文档锚 `visible/self.md`。

`GET /api/objects/:scope/:objectId/client-source-url?sessionId=&page=&file=`:
- scope=stone: 读 `stones/main/objects/<id>/visible/index.tsx` 的 absPath/fsUrl;legacy 回退 `client/index.tsx`;`?file=diff` 查 `visible/diff.tsx`
- scope=flow: 读 `flows/<sid>/objects/<id>/client/pages/<page>.tsx`;需 sessionId+page query
- 文件不存在 → 404 NOT_FOUND
- response: `{ absPath: string; fsUrl: string }`

**桩点接通**:F1(ObjectClientRenderer.resolveClientSource)、F3(ClientWithSourceToggle.fetchClientSource)、F4(resolveWindowDiff)、F5(resolveWindowVisible)

### 3. 实现 tree + file-read endpoint(可选 — D1/D2/D3 桩点)

`GET /api/tree?scope=stones|pools|flows&path=`:
- 列指定 scope 下目录子树(FileTreeNode 嵌套结构)
- 初版整树返回(world 不大);未来懒加载

`GET /api/tree/file?path=`:
- 读 world 内 baseDir 限定的某文件全文

`GET /api/file/read?path=&maxBytes=`:
- 读**任意**本机文件(LLM file_window 视角,不受 baseDir 隔离)
- 部署需 path 白名单(本 issue 仅 dev 用)

**桩点接通**:D1/D2/D3

### 4. testing

加 `tests/stones-file-primitive.test.ts`(S1 主测试):
- PUT 走 versioning 后, `stones/main` 多一个 commit
- PUT 路径白名单外 → 400
- GET 读回原内容
- GET 不存在的 path → 404
- diff scope 读 `visible/diff.tsx`

加 `tests/ui-client-source-url.test.ts`:
- stone scope 返回 absPath + fsUrl
- flow scope 含 sessionId + page
- 文件不存在 → 404

## 落地 commit 切分

1. `feat(server/stones): 实现 stones module 含 PUT/GET file-edit 原语 + 三层 path 防护`
2. `feat(server/ui): 实现 ui module 含 client-source-url endpoint`
3. `feat(server/tree+file): 实现 tree + file/read endpoints(D1-D3 桩点接通)`
4. `feat(web/stones+files+objects+clients): 解桩 A7/E1/E2/F1/F3/F4/F5/D1/D2/D3,接通新 endpoint`
5. `test: 加 stones-file-primitive + ui-client-source-url + tree-file 三套测试`
6. `docs: dashboard.md 加 S1 系列 case;app/self.md 更新 client-source-url 实施细节`

## 受影响设计元素

- `## app` (app/self.md):server module 列表填齐 stones / ui / 部分 tree+file
- `## visible × app` 交叉:client-source-url 协议落实
- 无核心维度契约改动 — 都是设计权威已说应有的实现

## 风险与权衡

- **风险 1**:白名单文件列表如果太严(如禁 `types.ts`),agent 改 types 时无法走 file-edit 原语 → 必须走 `filesystem.write_file` agent 侧(本就 worktree 走 PR)。app/self.md 已说过此分工。
- **风险 2**:`/api/tree` 整树返回对超大 world 性能不行 — 设计权威已记入未决问题。初版接受。
- **权衡**:GET file 是否需要 etag/conflict-detection? 初版不需要(单用户控制面);未来如果多用户编辑同一文件再加。

## 待裁决点

1. **是否同步实现 D1-D3(tree/file/read)?** 或仅做 A7/E1/E2/F1-F5? — 推荐都做,但可拆 commit
2. **白名单文件列表精确范围?** 推荐沿用 app/self.md 已列举:`self.md / readable.md / executable/index.ts / visible/index.tsx / knowledge/*.md`
3. **GET file endpoint 是否区分 raw vs structured response?** 推荐 `{ content: string; etag?: string }` 简单形态

## review 记录

(待 fan-out:app 维度 reviewer + visible 维度 reviewer + persistable 维度 reviewer)

## 裁决

(待)

## 落地验收

(landed 后:
1. PUT/GET file 原语真接通 + versioning 真触发
2. client-source-url 真返 absPath + fsUrl, 前端 dynamic import 真加载 Object UI
3. tree/file/read endpoint 工作
4. web A7/E1/E2/F1-F5/D1-D3 桩点全解除
5. 5+ 个新 test case 进 storybook dashboard)
