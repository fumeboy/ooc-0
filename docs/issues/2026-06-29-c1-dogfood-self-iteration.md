---
title: C1 · 第一次真实自我迭代 dogfood — 让 agent 经 talk(super) 改自己源码 + PR 合入 main
status: landed
date: 2026-06-29
follows: 2026-06-29-runtime-server-web-roadmap.md
priority: P2
---

# C1 · 第一次真实自我迭代 dogfood

## 背景

S 系列 10 issue + A 系列 4 commit 已让 OOC 端到端可跑:
- 8 维度全 self.md + index.md 完整
- 7 个 server module + 25+ endpoint
- web 真 build + 177 pass / 0 fail
- reflectable feat-branch PR 机制 (issue D) 落地 + super flow + 4 reflect method
- agent 自写程序 (executable/index.ts + readable + visible) 在 stones git versioned 字段中

但**从未真实跑过一次端到端自我迭代** — reflectable 是设计承诺,需要**一次实证**:

让一个真 agent (如 `_builtin/supervisor` 或新建实例) 经 `talk(target="super")` 通道:
1. 在 super flow 内自看 — 看到自己当前 self.md / executable 等源码状态
2. 提出修改 — 比如给自己加一条 method `summarize_last_thread`
3. 经 `create_pr_for_class_edits` 起 feat-branch PR
4. reviewer 评审 + 合入 main (worldConfig.prAutoMerge=true 自动 / 或人工经
   POST /api/runtime/pr-issues/:id/resolve)
5. 下次 hydrate 拿新版本 (经 hot-reload + lifecycle.on_reload)
6. 验证: agent 真能调那个新加的 method

这是**自举的临界点** — 过了这条线,OOC 不再是设计,是引擎在转。

## 设计权威锚

- **`## reflectable`**(index.md):"super flow = 显式合并入口,4 reflect method 按字段类型分流"
- **`## reflectable × persistable`**:"versioned 字段值 + class 源码 → feat-branch PR;agent 的自我迭代须经审核闸"
- **`## lifecycle`** + F1 + issue 2026-06-28-lifecycle-module-and-reload:on_reload 在 hot-reload 触发,让 class 经新代码接管

## 改动提案

### 三阶段

**Phase 1 · setup**:
1. 准备一个简单 agent (建一个 `_builtin/agent_dogfood`,继承 `_builtin/agent`,初始 executable 为空 + 占位 self.md)
2. 用 mock LLM 跑通基本 thinkloop (确保 thinkable + executable + readable 在端到端工作)

**Phase 2 · dogfood path**:
3. agent_dogfood 内手动 talk(target="super") 进 super flow
4. 在 super flow 内调 `create_pr_for_class_edits` 给自己 executable/index.ts 加一条 method
5. 看 PR-Issue 落账 + reviewer 接收 + worldConfig.prAutoMerge=true 自动合入
6. 看 hot-reload watcher 检测到 stones/main 改变 → reloadTable 标记
7. 下次 agent_dogfood 的 active 钩前 on_reload 调用
8. agent_dogfood 真能 exec 新 method

**Phase 3 · sanity check**:
- e2e test `tests/c1-dogfood-self-iteration.test.ts` (Tier A: mock LLM)
- 实际可能 Tier B (真 LLM) 才有完整 demo 价值,但 Tier A 测**机制可达**已足够

### 关键技术风险

1. **stone-feat-branch + worktree git versioning 的实际能跑度** — issue D 落地是设计,具体 git 命令链(`worktree add` + `commit` + `git merge --ff-only`)在 git 2.20 环境是否完整无 bug
2. **hot-reload watcher 在 dev=true 时是否捕捉 stones/main 的 ff-merge commit** — fs.watch recursive 模式应捕,但需验
3. **on_reload 钩在 server 端真触发** — F1 已建链路,但真跑过没 lifecycle.on_reload 写入 reloadTable + thread dispatchActive 命中 cursor 越界

### 验收

完整端到端 demo:
- 起 server `--world ./.ooc-world --port N --dev`
- 经 POST /api/sessions 创 agent_dogfood session
- agent 经 talk(super) 进 super flow
- agent 在 super flow 内提议加一个 method
- super flow 内 create_pr_for_class_edits 路径走完
- PR auto-merge (worldConfig.prAutoMerge=true)
- 看 git log 真有 commit
- 重新跑 agent_dogfood → 验证新 method 可调

## 风险与权衡

- **风险 1**:整套链路可能撞出未知 bug — issue D/F1/lifecycle 等单独都过 test,但**端到端组合**还没真跑过
- **风险 2**:tier A mock LLM 可能足以验机制,但**真 LLM 的 dogfood 演示** (Tier B) 才有"OOC 真活"的展示效果

## 待裁决点

1. **是否做完整 Phase 1-3,还是仅 Phase 1+2 验机制?**
2. **是否需要专门起 issue C2 fitness gate (PR 合入前必须 tests 全绿)?**
   - 推荐:**是**,作为 C1 的 quality gate
3. **C1 是否需要 sub-agent 评审 / 完整性批评官?**
   - 推荐:作为「OOC 哲学层最关键的兑现」,值得请 supervisor 亲自看过 PR-Issue 整链

## review 记录

(待 fan-out)

## 裁决

(待 supervisor 决断 - 推荐 Phase 1-3 全做,作为 OOC 真活的第一个公开演示)

## 落地验收

(landed 后: 1. agent_dogfood 真存在并能加 method; 2. super flow → PR → merge → on_reload → 新 method 可调全链路 e2e test 跑通; 3. 同步给 supervisor `knowledge/example-cases.md` 加一条作为 OOC 自举的实证)
