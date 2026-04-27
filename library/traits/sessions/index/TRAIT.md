---
namespace: library
name: sessions/index
type: how_to_use_tool
version: 1.0.0
description: >-
  Sessions 索引与筛选能力。快速检索、筛选和分析 OOC 系统中的
  Sessions（会话/Flow）。支持按参与对象、时间范围、关键词、状态等条件组合筛选。当需要查找历史对话、分析对象活动、回顾任务执行记录时使用。
deps: []
---
# Sessions Index Skill

快速索引和筛选 OOC 系统中的 Sessions，帮助对象高效检索历史对话和任务记录。

---

## 核心概念

OOC 中的 Session 对应一次完整的任务执行：

- **Session** = 顶层 Flow（`flows/{taskId}/`），由人类或系统发起
- **Sub-flow** = Session 内参与协作的对象各自的 Flow（`flows/{taskId}/flows/{stoneName}/`）
- 每个 Session 有 `taskId`、`status`、`messages`、`createdAt`、`updatedAt` 等字段

### Session 状态

| 状态 | 含义 |
|------|------|
| `running` | 正在执行中 |
| `waiting` | 等待外部输入（如等待人类回复） |
| `pausing` | 被暂停（调试模式或手动暂停） |
| `finished` | 正常完成 |
| `failed` | 执行失败 |

---

## 数据获取

### 方式一：HTTP API（推荐）

```javascript
// 获取所有 sessions 摘要列表（按 updatedAt 倒序）
const res = await fetch("http://localhost:8080/api/flows");
const { data: { sessions } } = await res.json();
print(JSON.stringify(sessions, null, 2));
```

返回字段：

```typescript
{
  taskId: string;       // Session ID（如 "task_20260326023219_ke4b"）
  title?: string;       // 用户自定义标题
  status: FlowStatus;   // running | waiting | pausing | finished | failed
  firstMessage: string; // 第一条输入消息内容
  messageCount: number; // 消息总数
  actionCount: number;  // Action 总数
  hasProcess: boolean;  // 是否有行为树
  createdAt: number;    // 创建时间戳（ms）
  updatedAt: number;    // 最后更新时间戳（ms）
}
```

### 方式二：获取单个 Session 详情

```javascript
// 获取完整 Session 数据（含 messages、sub-flows）
const res = await fetch("http://localhost:8080/api/flows/task_20260326023219_ke4b");
const { data: { flow, subFlows } } = await res.json();
print(`状态: ${flow.status}`);
print(`参与对象: ${subFlows.map(s => s.stoneName).join(", ")}`);
print(`消息数: ${flow.messages.length}`);
```

---

## 筛选能力

### 1. 按参与对象筛选

找出某个对象参与的所有 sessions。

```javascript
// 获取所有 sessions
const res = await fetch("http://localhost:8080/api/flows");
const { data: { sessions } } = await res.json();

// 目标对象名
const targetObject = "sophia";

// 逐个检查 session 的 sub-flows
const results = [];
for (const session of sessions) {
  const detail = await fetch(`http://localhost:8080/api/flows/${session.taskId}`);
  const { data: { flow, subFlows } } = await detail.json();

  // 检查 sub-flows 中是否包含目标对象
  const participated = subFlows.some(sf => sf.stoneName === targetObject);
  // 也检查消息中是否有目标对象的参与
  const inMessages = flow.messages.some(
    m => m.from === targetObject || m.to === targetObject
  );

  if (participated || inMessages) {
    results.push({
      taskId: session.taskId,
      title: session.title,
      status: session.status,
      firstMessage: session.firstMessage.slice(0, 80),
      createdAt: new Date(session.createdAt).toLocaleString(),
    });
  }
}

print(`${targetObject} 参与了 ${results.length} 个 sessions:`);
print(JSON.stringify(results, null, 2));
```

### 2. 按时间范围筛选

```javascript
const res = await fetch("http://localhost:8080/api/flows");
const { data: { sessions } } = await res.json();

// 最近 N 天
const days = 3;
const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

const recent = sessions.filter(s => s.createdAt >= cutoff);

print(`最近 ${days} 天的 sessions（共 ${recent.length} 个）:`);
for (const s of recent) {
  print(`- [${s.status}] ${s.taskId} | ${new Date(s.createdAt).toLocaleString()} | ${s.firstMessage.slice(0, 60)}`);
}
```

```javascript
// 指定日期范围
const from = new Date("2026-03-26").getTime();
const to = new Date("2026-03-28").getTime();

const ranged = sessions.filter(s => s.createdAt >= from && s.createdAt <= to);
print(`${new Date(from).toLocaleDateString()} ~ ${new Date(to).toLocaleDateString()} 共 ${ranged.length} 个 sessions`);
```

### 3. 按聊天内容关键词搜索

```javascript
const res = await fetch("http://localhost:8080/api/flows");
const { data: { sessions } } = await res.json();

const keyword = "哲学";
const matched = [];

for (const session of sessions) {
  // 先检查 firstMessage（快速过滤）
  if (session.firstMessage.includes(keyword)) {
    matched.push({ ...session, matchSource: "firstMessage" });
    continue;
  }

  // 深度搜索：获取完整消息列表
  const detail = await fetch(`http://localhost:8080/api/flows/${session.taskId}`);
  const { data: { flow } } = await detail.json();

  const hitMsg = flow.messages.find(m => m.content.includes(keyword));
  if (hitMsg) {
    matched.push({
      taskId: session.taskId,
      title: session.title,
      status: session.status,
      matchSource: "messages",
      matchSnippet: hitMsg.content.slice(0, 100),
      from: hitMsg.from,
    });
  }
}

print(`包含「${keyword}」的 sessions（共 ${matched.length} 个）:`);
print(JSON.stringify(matched, null, 2));
```

### 4. 按 Session 状态筛选

```javascript
const res = await fetch("http://localhost:8080/api/flows");
const { data: { sessions } } = await res.json();

// 筛选特定状态
const targetStatus = "finished"; // running | waiting | pausing | finished | failed
const filtered = sessions.filter(s => s.status === targetStatus);

print(`状态为 ${targetStatus} 的 sessions（共 ${filtered.length} 个）:`);
for (const s of filtered) {
  print(`- ${s.taskId} | ${new Date(s.updatedAt).toLocaleString()} | ${s.firstMessage.slice(0, 60)}`);
}
```

```javascript
// 查找所有异常 sessions（failed）
const failed = sessions.filter(s => s.status === "failed");
print(`失败的 sessions（共 ${failed.length} 个）:`);
for (const s of failed) {
  print(`- ${s.taskId} | ${new Date(s.createdAt).toLocaleString()}`);
  print(`  首条消息: ${s.firstMessage.slice(0, 80)}`);
}
```

### 5. 组合筛选

```javascript
const res = await fetch("http://localhost:8080/api/flows");
const { data: { sessions } } = await res.json();

// 组合条件
const filters = {
  status: "finished",           // 可选：状态筛选
  days: 7,                      // 可选：最近 N 天
  keyword: null,                // 可选：关键词（在 firstMessage 中搜索）
  object: null,                 // 可选：参与对象（需要深度查询）
  minMessages: 3,               // 可选：最少消息数
};

let results = [...sessions];

// 状态筛选
if (filters.status) {
  results = results.filter(s => s.status === filters.status);
}

// 时间筛选
if (filters.days) {
  const cutoff = Date.now() - filters.days * 24 * 60 * 60 * 1000;
  results = results.filter(s => s.createdAt >= cutoff);
}

// 关键词筛选（快速，仅搜索 firstMessage）
if (filters.keyword) {
  results = results.filter(s => s.firstMessage.includes(filters.keyword));
}

// 消息数筛选
if (filters.minMessages) {
  results = results.filter(s => s.messageCount >= filters.minMessages);
}

// 参与对象筛选（需要逐个查询详情，放在最后以减少请求数）
if (filters.object) {
  const withObject = [];
  for (const s of results) {
    const detail = await fetch(`http://localhost:8080/api/flows/${s.taskId}`);
    const { data: { subFlows } } = await detail.json();
    if (subFlows.some(sf => sf.stoneName === filters.object)) {
      withObject.push(s);
    }
  }
  results = withObject;
}

print(`筛选结果（共 ${results.length} 个）:`);
for (const s of results) {
  print(`- [${s.status}] ${s.taskId} | msgs:${s.messageCount} | ${s.firstMessage.slice(0, 60)}`);
}
```

---

## 实用场景

### 场景 A：生成对象活动报告

```javascript
const res = await fetch("http://localhost:8080/api/flows");
const { data: { sessions } } = await res.json();

// 统计各状态数量
const stats = {};
for (const s of sessions) {
  stats[s.status] = (stats[s.status] || 0) + 1;
}
print("Sessions 状态分布:");
print(JSON.stringify(stats, null, 2));

// 统计每日 session 数
const daily = {};
for (const s of sessions) {
  const day = new Date(s.createdAt).toISOString().slice(0, 10);
  daily[day] = (daily[day] || 0) + 1;
}
print("\n每日 Session 数:");
for (const [day, count] of Object.entries(daily).sort()) {
  print(`  ${day}: ${count}`);
}
```

### 场景 B：查找最近失败的任务并分析原因

```javascript
const res = await fetch("http://localhost:8080/api/flows");
const { data: { sessions } } = await res.json();

const failed = sessions.filter(s => s.status === "failed").slice(0, 5);

for (const s of failed) {
  const detail = await fetch(`http://localhost:8080/api/flows/${s.taskId}`);
  const { data: { flow } } = await detail.json();

  print(`\n--- ${s.taskId} ---`);
  print(`时间: ${new Date(s.createdAt).toLocaleString()}`);
  print(`首条消息: ${s.firstMessage.slice(0, 100)}`);

  // 找最后一条消息，通常包含失败原因
  const lastMsg = flow.messages[flow.messages.length - 1];
  if (lastMsg) {
    print(`最后消息 (from ${lastMsg.from}): ${lastMsg.content.slice(0, 200)}`);
  }
}
```

### 场景 C：查找两个对象之间的协作记录

```javascript
const res = await fetch("http://localhost:8080/api/flows");
const { data: { sessions } } = await res.json();

const objectA = "sophia";
const objectB = "supervisor";
const collaborations = [];

for (const session of sessions) {
  const detail = await fetch(`http://localhost:8080/api/flows/${session.taskId}`);
  const { data: { subFlows } } = await detail.json();

  const names = subFlows.map(sf => sf.stoneName);
  if (names.includes(objectA) && names.includes(objectB)) {
    collaborations.push({
      taskId: session.taskId,
      title: session.title,
      status: session.status,
      createdAt: new Date(session.createdAt).toLocaleString(),
    });
  }
}

print(`${objectA} 与 ${objectB} 的协作记录（共 ${collaborations.length} 次）:`);
print(JSON.stringify(collaborations, null, 2));
```

---

## 注意事项

1. **性能**：按对象筛选和关键词深度搜索需要逐个请求 Session 详情，sessions 数量多时较慢。建议先用时间/状态等条件缩小范围，再做深度查询。
2. **API 地址**：默认 `http://localhost:8080`，根据实际部署调整。
3. **时间戳**：所有时间字段为 Unix 毫秒时间戳，用 `new Date(ts)` 转换。
4. **Sub-flow 结构**：Session 目录下 `flows/user/` 是 main flow，`flows/{stoneName}/` 是各参与对象的 sub-flow。
5. **taskId 格式**：`task_YYYYMMDDHHMMSS_xxxx`，ID 本身包含创建时间信息。
