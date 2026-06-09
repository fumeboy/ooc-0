---
activates_on: {"window::root": "show_content"}
---

# inbox per-message 存储 —— 根治并发回报丢正文竞态

## 问题

caller 同时被多个 callee 回报时，第二路 talk 正文**静默丢失**，inbox 只剩 framework 的 done 占位——peer 平等轴的多对一回报通道出现数据丢失。

## 根因

inbox 此前随 thread.json 整体 read-modify-write。worker 持 caller in-memory 跑很久（含 LLM），期间外部 `deliverTalkMessage` append 的新消息，被 worker 跑完的整体 `writeThread` 覆盖；per-thread 锁锁不住长 runJob。

## 设计

利用 inbox 本就是 **append-only**（消费靠 `consumedMessageIds` 派生过滤、无物理移除）的性质，把 inbox 拆成 `<threadDir>/inbox/<msgId>.json` per-message 文件：

- 不同 msgId → 不同文件 → 并发 append **互不覆盖**。
- 写盘只增不删 → stale in-memory inbox **不会抹掉**并发新增。

## 实现

- `persistInboxMessages`：幂等 append，文件已存在则跳过（`packages/@ooc/core/persistable/inbox-store.ts:34`）。
- `readInboxMessages`：扫目录合并，损坏文件跳过并 warn、不阻塞 readThread（`inbox-store.ts:58`）。
- `writeThread`：先持久化目录、`stripVolatileForPersist` 从 thread.json strip inbox（`packages/@ooc/core/persistable/thread-json.ts:68` / `:45`）。
- `readThread`：以目录为权威、merge 历史 thread.json.inbox 做平滑迁移。

delivery / worker / scheduler / do / service 等写入点**零改动**——仍 `thread.inbox=[...]` + writeThread，持久化层透明改走目录。

## 验证

`packages/@ooc/core/persistable/inbox-store.test.ts` 三个并发回归：stale write 不覆盖 / 5 路并发全存活 / 幂等（commit `917db9f5`）。

## 未决

`readThread` merge 历史 `thread.json.inbox` 是过渡逻辑，存量 world 迁移完毕后可移除该 fallback 分支。
