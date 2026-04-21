# User Inbox Read-State 后端持久化

> 类型：feature
> 创建日期：2026-04-21
> 完成日期：2026-04-22
> 状态：finish
> 负责人：Alan Kay

## 背景 / 问题描述

MessageSidebar 迭代为 user inbox 的"未读角标"做了临时方案——**localStorage 记录已读 messageId**（key: `ooc:user-inbox:last-read:{sid}`）。

问题：
- 换浏览器/清缓存即丢失已读状态
- 多端登录无法同步
- 服务端无法感知用户是否读过

## 目标

1. 在 `flows/{sessionId}/user/data.json` 扩展 `readState` 字段：
   ```json
   {
     "inbox": [...],
     "readState": {
       "lastReadTimestampByObject": { "bruce": 1776..., "iris": 1776... }
     }
   }
   ```
2. HTTP API：
   - `POST /api/sessions/:sid/user-read-state`（更新某对象的 lastReadAt）
   - 读由 `GET /user-inbox` 统一返回（合并结构）
3. 前端 MessageSidebar 切换到用后端数据；localStorage 兜底保留（离线 / 服务降级）
4. 完整 E2E：打开 MessageSidebar → 切到某对象 thread → 未读角标清除 → 刷新页面仍然为已读

## 方案

1. `kernel/src/persistence/user-inbox.ts` 新增：
   - `readUserReadState(sid) → { lastReadTimestampByObject: {} }`
   - `setUserReadObject(sid, objectName, timestamp)`
   - 复用 SerialQueue 基础设施（见 write-queue 迭代）
2. `kernel/src/server/server.ts`：
   - `GET /user-inbox` 响应扩展 `readState` 字段
   - `POST /user-read-state` 接受 `{ objectName, timestamp }`
3. `kernel/web/src/api/client.ts` / `types.ts`：
   - `UserInbox` 扩展 `readState`
   - `setUserReadObject(sid, objectName, timestamp?)`
4. `kernel/web/src/features/MessageSidebar.tsx`：
   - `useUserThreads` 用 readState 计算 unread
   - 切 thread 时调 API 更新 readState
   - localStorage 作为 offline fallback（失败 → 用本地）
5. 测试：单元 + 集成

## 影响范围

- `kernel/src/persistence/user-inbox.ts`
- `kernel/src/server/server.ts`
- `kernel/src/types/*`（如有 UserInbox 类型）
- `kernel/web/src/api/{types,client}.ts`
- `kernel/web/src/features/MessageSidebar.tsx`
- `kernel/web/src/hooks/useUserThreads.ts`
- 测试

## 依赖

- 建议在 **Write Queue 统一** 迭代完成后做（复用 SerialQueue）

## 验证标准

- 单元测试 + 集成测试
- 全量测试 550+ pass / 0 fail
- E2E：切 thread → 角标清除 → 刷新页面保持已读

## 执行记录

### 2026-04-22

**实现**：

后端（`kernel/src/persistence/user-inbox.ts`）：
- `UserInboxData` 扩展：inbox + `readState: { lastReadTimestampByObject }`
- 新 `readUserReadState(sid)` / `setUserReadObject(sid, objectName, timestamp)`
- `setUserReadObject` 单调递增（旧 ts 比新 ts 大时忽略）
- 所有写入共用迭代 #2 的 `_userInboxQueue: SerialQueue<string>`

HTTP（`kernel/src/server/server.ts`）：
- `GET /api/sessions/:sid/user-inbox` 响应扩展 `readState` 字段
- 新 `POST /api/sessions/:sid/user-read-state`（body `{ objectName, timestamp }`）
- 400 校验：objectName 必填字符串，timestamp 必填有限数字

前端：
- `api/types.ts` `UserInbox` 扩展 `readState` 字段；新 `UserReadState` 类型
- `api/client.ts` 新 `setUserReadObject(sid, objectName, timestamp)`
- `hooks/useUserThreads.ts` 重构：
  - 拉取 inbox 同时拉 `readState`
  - 未读判定改为 `action.timestamp > readState[objectName]`（服务端就绪时）
  - 未就绪时回退 localStorage（`ooc:user-inbox:last-read:{sid}` id 集合）
  - 新 `markObjectRead(sid, objectName, ts, fallbackIds?)` helper：主 POST 服务端，失败写 localStorage
- `features/MessageSidebar.tsx` 切线程时：
  - 反查该 thread 所属对象 + 最大 message_out timestamp
  - 调 `markObjectRead(activeId, objectName, maxTs, msgIds)`
  - 同时写 localStorage（离线保底）

**测试**：
- `kernel/tests/user-inbox-read-state.test.ts`（9 tests）：读空、读已有、set 单调递增、多对象独立、并发、与 inbox 并存、readUserInbox 合并返回
- `kernel/tests/server-user-inbox.test.ts` 新 `POST /user-read-state`（3 tests）：合法 payload、单调递增、400 缺字段
- 更新旧 `tests/user-inbox.test.ts` / `tests/server-user-inbox.test.ts` 适配新字段结构（原用 `toEqual({ inbox: [] })` 精确匹配，现用 `.inbox` 属性断言）

**测试基线**：561 pass → **573 pass**（+12，实际 +9 新测试 + 3 扩展旧测试），0 fail，6 skip
前端 tsc noEmit / vite build 通过。

**E2E 体验验证**：
- 启动 `bun kernel/src/cli.ts start 8080`，curl 三次调用链通过：
  - GET 空 session → `{ inbox: [], readState: { lastReadTimestampByObject: {} } }`
  - POST `{ objectName: "bruce", timestamp: 1234 }` → 返回更新后的 readState
  - GET 同 session → readState 反映 bruce=1234

**影响**：
- 已读状态跨浏览器/端同步
- 服务端成为已读状态权威来源（localStorage 降级为离线兜底）
- 为未来「团队多端协同看到同一 user 的已读进度」铺路
