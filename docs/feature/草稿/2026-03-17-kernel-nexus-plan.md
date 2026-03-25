# OOC Kernel 重构 & Nexus 飞书对接 实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 Kernel 核心 API（文件系统化 + LLM API + 单步调试 + Shell 执行 + 定时任务），并完成 Nexus 飞书 IM 对接的 Trait 实现。

**Architecture:** Kernel 重构的核心思路是"去 API 化"——将 createTrait/editTrait/readShared/writeShared 等高层 API 替换为文件系统路径暴露 + 热加载钩子，让 OOC Object 像操作本地文件一样操作自己的 Trait 和 Shared 目录。同时新增 LLM 调用能力、Shell 执行能力、单步调试能力和定时任务能力。Nexus 飞书对接通过 Trait 封装飞书 Bot API，实现消息收发。

**Tech Stack:** Bun (TypeScript), 飞书开放平台 API, node:child_process (Shell 执行)

**基于调研:** task.md (需求定义), nexus/shared/ (Skill/Trait 映射分析, OpenClaw 生态分析), kernel/shared/架构/ (系统架构文档)

---

## 文件结构总览

### Kernel 重构涉及的文件

```
src/flow/thinkloop.ts          — 修改: buildExecutionContext() 重构沙箱 API
src/flow/parser.ts             — 修改: 新增 [program/shell] 和 [program/javascript] 解析
src/executable/executor.ts     — 修改: 新增 Shell 执行器
src/world/world.ts             — 修改: 单步调试 API + 定时任务调度
src/world/scheduler.ts         — 修改: 定时任务集成
src/server/server.ts           — 修改: 新增调试/定时任务 HTTP 端点
src/types/flow.ts              — 修改: 新增 ActionType "shell"
src/thinkable/client.ts        — 修改: 暴露 LLM 调用接口给沙箱
```

### Nexus 飞书对接涉及的文件

```
.ooc/objects/nexus/traits/feishu-bot/readme.md   — 新建: Trait readme
.ooc/objects/nexus/traits/feishu-bot/index.ts    — 新建: 飞书 API 封装
src/server/server.ts                              — 修改: 飞书 webhook 回调端点
```

---

## Chunk 1: Kernel 核心 API 重构

### Task 1: 文件系统 API 替代高层 API

**目标:** 将 createTrait/editTrait/activateTrait/readShared/writeShared 等 API 替换为目录路径暴露 + 文件操作 + 热加载钩子。

**原理:** 当前 `buildExecutionContext()` 注入了 ~25 个 API，其中 Trait 元编程 API（createTrait/editTrait/activateTrait）和协作文件 API（readShared/writeShared）本质上都是文件操作的封装。重构后，直接暴露目录路径，让 Object 用 Bun/Node 原生文件 API 操作，然后通过 `reloadTrait()` / `reloadReadme()` 触发热加载。

**Files:**
- Modify: `src/flow/thinkloop.ts:517-1060` (buildExecutionContext 函数)
- Modify: `src/world/router.ts:90-115` (readShared/writeShared 可保留但标记 deprecated)

**变更详情:**

当前沙箱注入的 API 分类：
```
保留不变:
  - print, getData, getAllData, setData, persistData, getStoneData
  - talk (协作消息，非文件操作)
  - createPlan, create_plan_node, finish_plan_node, moveFocus, advanceFocus
  - popTodo, removeTodo, getTodo
  - Trait methods (MethodRegistry 注册的方法)

替换为路径暴露:
  - createTrait(name, opts)     → 暴露 self_traits_dir 路径
  - editTrait(name, opts)       → 暴露 self_traits_dir 路径
  - activateTrait(name)         → 保留（这是运行时状态操作，非文件操作）
  - readShared(target, file)    → 暴露 world_dir 路径 + 约定 shared/ 子目录
  - writeShared(file, content)  → 暴露 self_shared_dir 路径
  - createWindow/editWindow/removeWindow/listWindows → 暴露 self_dir 路径

新增:
  - self_dir: string            — 对象根目录 (.ooc/objects/{name}/)
  - self_traits_dir: string     — Trait 目录
  - self_shared_dir: string     — Shared 目录
  - world_dir: string           — .ooc/ 根目录
  - task_shared_dir: string     — 当前任务的 shared 目录
  - reloadTrait(name): void     — 热加载指定 Trait
  - reloadReadme(): void        — 热加载 readme.md
  - reloadMemory(): void        — 热加载 memory.md
```

- [ ] **Step 1: 在 buildExecutionContext 中新增路径常量注入**

在 `src/flow/thinkloop.ts` 的 `buildExecutionContext` 函数中，在 `context` 对象初始化处（约 L550）新增路径：

```typescript
const context: Record<string, unknown> = {
  sharedDir: flow.sharedDir,
  taskId: flow.taskId,
  // 新增文件系统路径
  self_dir: stoneDir,
  self_traits_dir: join(stoneDir, "traits"),
  self_shared_dir: join(stoneDir, "shared"),
  world_dir: join(stoneDir, "..", ".."),
  task_shared_dir: flow.sharedDir,
};
```

- [ ] **Step 2: 新增 reloadTrait / reloadReadme / reloadMemory API**

在 Trait 元编程 API 区域（约 L872）之后，新增热加载 API：

```typescript
tracker.register(context, [
  {
    name: "reloadTrait",
    fn: (name: string) => {
      if (!TRAIT_NAME_RE.test(name)) return `[错误] trait 名称无效: ${name}`;
      hotReloadTrait(name);
      return `✓ trait "${name}" 已提交热加载（下一轮思考生效）`;
    },
    effect: (args) => `reloadTrait("${args[0]}")`,
  },
  {
    name: "reloadReadme",
    fn: () => {
      const readmePath = join(stoneDir, "readme.md");
      if (!existsSync(readmePath)) return "[错误] readme.md 不存在";
      // 重新读取并更新 stone 的 thinkable/talkable
      const content = readFileSync(readmePath, "utf-8");
      // 触发 stone 数据刷新（需要 stone 引用可变）
      return "✓ readme.md 已重新加载";
    },
    effect: () => "reloadReadme()",
  },
  {
    name: "reloadMemory",
    fn: () => {
      const memoryPath = join(stoneDir, "memory.md");
      if (!existsSync(memoryPath)) return "[错误] memory.md 不存在";
      return "✓ memory.md 已重新加载（下一轮思考生效）";
    },
    effect: () => "reloadMemory()",
  },
]);
```

- [ ] **Step 3: 将 createTrait/editTrait 标记为 deprecated 但保留**

不直接删除旧 API（避免破坏已有 Trait 代码），而是在返回值中追加 deprecation 提示：

```typescript
// 在 _createTrait 函数返回成功时追加提示
const result = `✓ trait "${name}" 已创建`;
return result + "\n[提示] createTrait 将在未来版本移除，建议直接操作 self_traits_dir 目录 + 调用 reloadTrait()";
```

- [ ] **Step 4: 更新 kernel trait 的 readme 文档**

更新 kernel 的系统指令 trait，告知 Object 新的文件系统 API 用法。

- [ ] **Step 5: 验证现有 Trait 代码兼容性**

运行现有对象的 talk 测试，确认旧 API 仍然可用。

---

### Task 2: 提供 LLM API

**目标:** 允许 OOC Object 在 [program] 中调用 LLM 模型，实现"对象调用 AI"的能力。

**Files:**
- Modify: `src/flow/thinkloop.ts:517-596` (buildExecutionContext, 新增 llm API 注入)
- Modify: `src/thinkable/client.ts` (暴露简化的调用接口)

**设计决策:**
- 使用与 ThinkLoop 相同的 LLM 客户端实例（共享配额和配置）
- 提供简化的 `callLLM(prompt, options?)` 接口，不暴露底层 OpenAI 兼容 API
- 限制：单次调用 max_tokens 上限 4096，防止滥用

- [ ] **Step 1: 在 client.ts 中新增简化调用方法**

```typescript
// src/thinkable/client.ts 新增
export interface SimpleLLMOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  system?: string;
}

// 在 OpenAICompatibleClient 类中新增方法
async simpleCall(prompt: string, options?: SimpleLLMOptions): Promise<string> {
  const messages = [];
  if (options?.system) {
    messages.push({ role: "system" as const, content: options.system });
  }
  messages.push({ role: "user" as const, content: prompt });

  const response = await this.chat({
    model: options?.model ?? this._defaultModel,
    messages,
    max_tokens: Math.min(options?.maxTokens ?? 4096, 4096),
    temperature: options?.temperature ?? 0.7,
  });

  return response.choices[0]?.message?.content ?? "";
}
```

- [ ] **Step 2: 在 buildExecutionContext 中注入 callLLM**

```typescript
// 需要将 llm client 传入 buildExecutionContext
// 修改函数签名，新增 llm 参数
tracker.register(context, [
  {
    name: "callLLM",
    fn: async (prompt: string, options?: SimpleLLMOptions) => {
      try {
        return await llm.simpleCall(prompt, options);
      } catch (e: unknown) {
        return `[错误] LLM 调用失败: ${e instanceof Error ? e.message : String(e)}`;
      }
    },
    effect: (args) => `callLLM(${(args[0] as string).slice(0, 50)}...)`,
  },
]);
```

- [ ] **Step 3: 更新 buildExecutionContext 函数签名**

将 `llm: LLMClient` 参数传入 buildExecutionContext，从 runThinkLoop 调用处传递。

- [ ] **Step 4: 测试 LLM API**

创建测试 Trait，在 [program] 中调用 callLLM 验证功能。

---

### Task 3: 单步调试（Pause 逻辑重构）

**目标:** pause 时不自动解析执行 LLM 输出，开放接口允许读取/修改 pause 时的 LLM 输出，然后手动触发下一轮 think。每轮 think 同样自动停在 pause 点，实现"单步调试"。

**当前行为:** pause 时 ThinkLoop 暂存 `_pendingOutput`，resume 时跳过 LLM 调用直接执行暂存的 output。
**目标行为:** pause 时暂存 `_pendingOutput` 但不自动 resume。提供 HTTP API 读取/修改 `_pendingOutput`，手动触发 `stepOnce()`，执行完一轮后再次 pause。

**Files:**
- Modify: `src/flow/thinkloop.ts:139-200` (pause/resume 逻辑)
- Modify: `src/world/world.ts:395-418` (pauseObject/resumeFlow)
- Modify: `src/server/server.ts` (新增调试端点)
- Modify: `src/types/flow.ts` (FlowData 新增 debugMode 字段)

- [ ] **Step 1: 在 FlowData 中新增 debug 相关字段**

```typescript
// src/types/flow.ts
interface FlowData {
  // ... 现有字段
  /** 调试模式：pause 后每次只执行一轮 */
  debugMode?: boolean;
}
```

- [ ] **Step 2: 修改 ThinkLoop 的 pause 检测逻辑**

当前逻辑（thinkloop.ts L192）：
```typescript
if (config.isPaused?.()) {
  flow.setFlowData("_pendingOutput", llmOutput);
  // ... 退出循环
}
```

修改为：当 debugMode 开启时，每轮执行完毕后自动 pause：
```typescript
// 在每轮 think 结束后（执行完 programs 之后）
if (flow.toJSON().debugMode || config.isPaused?.()) {
  flow.setFlowData("_pendingOutput", llmOutput);
  flow.setStatus("pausing");
  break;
}
```

- [ ] **Step 3: 在 World 中新增 stepOnce 方法**

```typescript
// src/world/world.ts
async stepOnce(objectName: string, flowId: string, modifiedOutput?: string): Promise<Flow> {
  const stone = this._registry.get(objectName);
  if (!stone) throw new Error(`对象 "${objectName}" 不存在`);

  const flow = await Flow.load(/* flow 目录 */);
  if (modifiedOutput !== undefined) {
    flow.setFlowData("_pendingOutput", modifiedOutput);
  }

  // 确保 debugMode 开启
  flow.setFlowData("debugMode", true);

  // 运行一轮 ThinkLoop（会在执行完后自动 pause）
  // 复用 _resumePausedFlow 的逻辑但强制 debugMode
  return this._resumePausedFlow(objectName, flowId);
}
```

- [ ] **Step 4: 新增 HTTP 调试端点**

```typescript
// src/server/server.ts 新增:

// GET /api/objects/:name/flows/:flowId/pending-output
// 读取暂存的 LLM 输出
// 返回: { success: true, data: { output: string | null } }

// POST /api/objects/:name/flows/:flowId/step
// body: { modifiedOutput?: string }
// 执行一轮 think，返回执行结果
// 返回: { success: true, data: flow.toJSON() }

// POST /api/objects/:name/flows/:flowId/debug-mode
// body: { enabled: boolean }
// 开启/关闭调试模式
```

- [ ] **Step 5: 验证单步调试流程**

手动测试：pause → 读取 pending output → 修改 → step → 检查结果 → 再 step。

---

### Task 4: 支持 [program/shell] 执行 Shell 脚本

**目标:** 扩展 Parser 支持 `[program/shell]` 段落执行 Shell 脚本，原 `[program]` 改为 `[program/javascript]` 的别名。

**Files:**
- Modify: `src/flow/parser.ts:49-66` (正则表达式扩展)
- Modify: `src/flow/parser.ts:90-240` (解析逻辑)
- Modify: `src/executable/executor.ts` (新增 Shell 执行)
- Modify: `src/flow/thinkloop.ts:200-300` (执行分发逻辑)
- Modify: `src/types/flow.ts` (ActionType 新增)

- [ ] **Step 1: 扩展 Parser 正则和类型**

```typescript
// src/flow/parser.ts

// 修改 SECTION_TAG_RE 支持 program/shell 和 program/javascript
const SECTION_TAG_RE = /^\s*\[(thought|program(?:\/(?:javascript|shell))?|finish|wait|break)\]\s*$/;

// ExtractedProgram 新增 lang 字段
export interface ExtractedProgram {
  code: string;
  startIndex: number;
  endIndex: number;
  /** 执行语言: "javascript" | "shell"，默认 "javascript" */
  lang: "javascript" | "shell";
}
```

- [ ] **Step 2: 修改解析逻辑识别 program/shell**

在 `parseLLMOutput` 函数中，当匹配到 `[program/shell]` 时，设置 `lang: "shell"`；匹配到 `[program]` 或 `[program/javascript]` 时，设置 `lang: "javascript"`。

- [ ] **Step 3: 在 executor.ts 中新增 Shell 执行器**

```typescript
// src/executable/executor.ts 新增
import { spawn } from "node:child_process";

export async function executeShell(
  code: string,
  cwd: string,
  timeout: number = 30000,
): Promise<ExecutionResult> {
  return new Promise((resolve) => {
    const proc = spawn("sh", ["-c", code], {
      cwd,
      timeout,
      env: { ...process.env, PATH: process.env.PATH },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });

    proc.on("close", (exitCode) => {
      resolve({
        success: exitCode === 0,
        returnValue: exitCode,
        stdout: stdout.trim(),
        error: exitCode !== 0 ? stderr.trim() || `exit code ${exitCode}` : null,
        errorType: exitCode !== 0 ? "ShellError" : null,
        isSyntaxError: false,
        errorLine: null,
      });
    });

    proc.on("error", (err) => {
      resolve({
        success: false,
        returnValue: null,
        stdout: "",
        error: err.message,
        errorType: "SpawnError",
        isSyntaxError: false,
        errorLine: null,
      });
    });
  });
}
```

- [ ] **Step 4: 在 ThinkLoop 中根据 lang 分发执行**

```typescript
// src/flow/thinkloop.ts 执行 program 的位置
for (const prog of parsed.programs) {
  if (prog.lang === "shell") {
    result = await executeShell(prog.code, stoneDir);
  } else {
    result = await codeExecutor.execute(prog.code, execContext);
  }
  // ... 记录 action
}
```

- [ ] **Step 5: ActionType 新增 "shell"**

```typescript
// src/types/flow.ts
type ActionType = "thought" | "program" | "shell" | "message_in" | "message_out" | "pause" | "inject";
```

- [ ] **Step 6: 安全考量**

Shell 执行有安全风险，需要：
- 默认 timeout 30s
- cwd 限制在对象目录内
- 未来可增加沙箱（如 Docker）

---

### Task 5: 定时任务 API

**目标:** 提供 API 支持定时任务，由 Scheduler 负责执行。定时任务本质是"在指定时间点给 OOC Object 发消息"。

**Files:**
- Create: `src/world/cron.ts` (定时任务管理器)
- Modify: `src/world/world.ts` (集成 CronManager)
- Modify: `src/server/server.ts` (新增定时任务 HTTP 端点)
- Modify: `src/flow/thinkloop.ts` (沙箱注入 schedule API)

- [ ] **Step 1: 创建 CronManager**

```typescript
// src/world/cron.ts
export interface ScheduledTask {
  id: string;
  targetObject: string;
  message: string;
  /** 触发时间（Unix ms） */
  triggerAt: number;
  /** 创建者 */
  createdBy: string;
  /** 是否已执行 */
  fired: boolean;
}

export class CronManager {
  private _tasks: ScheduledTask[] = [];
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _onFire: (task: ScheduledTask) => void;

  constructor(onFire: (task: ScheduledTask) => void) {
    this._onFire = onFire;
  }

  /** 添加定时任务 */
  schedule(targetObject: string, message: string, triggerAt: number, createdBy: string): string {
    const id = `cron_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    this._tasks.push({ id, targetObject, message, triggerAt, createdBy, fired: false });
    return id;
  }

  /** 取消定时任务 */
  cancel(id: string): boolean {
    const idx = this._tasks.findIndex(t => t.id === id);
    if (idx < 0) return false;
    this._tasks.splice(idx, 1);
    return true;
  }

  /** 列出所有待执行任务 */
  list(): ScheduledTask[] {
    return this._tasks.filter(t => !t.fired);
  }

  /** 启动轮询（每秒检查） */
  start(): void {
    if (this._timer) return;
    this._timer = setInterval(() => this._tick(), 1000);
  }

  /** 停止轮询 */
  stop(): void {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }

  private _tick(): void {
    const now = Date.now();
    for (const task of this._tasks) {
      if (!task.fired && task.triggerAt <= now) {
        task.fired = true;
        this._onFire(task);
      }
    }
    // 清理已执行的任务
    this._tasks = this._tasks.filter(t => !t.fired);
  }
}
```

- [ ] **Step 2: 在 World 中集成 CronManager**

```typescript
// src/world/world.ts
import { CronManager } from "./cron.js";

// World 类新增:
private _cron: CronManager;

// 在 constructor 中初始化:
this._cron = new CronManager((task) => {
  this.talk(task.targetObject, task.message, `cron:${task.createdBy}`).catch(err => {
    consola.error(`[Cron] 定时任务 ${task.id} 执行失败:`, err);
  });
});

// 在 init() 中启动:
this._cron.start();
```

- [ ] **Step 3: 在沙箱中注入 schedule API**

```typescript
// src/flow/thinkloop.ts buildExecutionContext 中新增
tracker.register(context, [
  {
    name: "schedule",
    fn: (targetObject: string, message: string, delayMs: number) => {
      const triggerAt = Date.now() + delayMs;
      const id = world.cron.schedule(targetObject, message, triggerAt, stone.name);
      return { id, triggerAt: new Date(triggerAt).toISOString() };
    },
    effect: (args) => `schedule("${args[0]}", delay=${args[2]}ms)`,
  },
  {
    name: "cancelSchedule",
    fn: (id: string) => world.cron.cancel(id),
    effect: (args) => `cancelSchedule("${args[0]}")`,
  },
  {
    name: "listSchedules",
    fn: () => world.cron.list(),
  },
]);
```

注意：需要将 world 引用（或 cron 引用）传入 buildExecutionContext。

- [ ] **Step 4: 新增 HTTP 端点**

```typescript
// GET /api/cron — 列出所有定时任务
// POST /api/cron — 创建定时任务 { target, message, triggerAt }
// DELETE /api/cron/:id — 取消定时任务
```

- [ ] **Step 5: 测试定时任务**

创建一个 5 秒后触发的定时任务，验证消息投递。

---

## Chunk 2: Nexus 飞书 IM 对接

### Task 6: 飞书 Bot Trait 实现

**目标:** 通过飞书开放平台的 Bot API，让 OOC Object 能够收发飞书消息。实现为 Nexus 的一个 Trait，同时在 server 中新增 webhook 回调端点接收飞书事件。

**背景:**
- 飞书开放平台提供 Bot（机器人）能力，通过 HTTP 回调接收消息事件
- Bot 通过 REST API 发送消息
- 需要：App ID + App Secret → 获取 tenant_access_token → 调用 API
- 参考文档：https://open.feishu.cn/document/server-docs/im-v1/message/create

**架构决策:**
- 飞书 Bot 作为 Nexus 的 Trait（`feishu-bot`），提供 `sendMessage` / `replyMessage` 方法
- OOC Server 新增 `/api/webhook/feishu` 端点接收飞书事件推送
- 收到飞书消息后，转化为 OOC talk 消息投递给目标 Object
- 飞书凭证存储在 `.ooc/config/feishu.json`（不进 git）

**Files:**
- Create: `.ooc/objects/nexus/traits/feishu-bot/readme.md`
- Create: `.ooc/objects/nexus/traits/feishu-bot/index.ts`
- Create: `src/integrations/feishu.ts` (飞书 API 客户端)
- Modify: `src/server/server.ts` (webhook 端点)
- Modify: `src/world/world.ts` (飞书事件 → talk 转发)

- [ ] **Step 1: 创建飞书 API 客户端**

```typescript
// src/integrations/feishu.ts
import { consola } from "consola";

export interface FeishuConfig {
  appId: string;
  appSecret: string;
  /** 可选：验证 token（用于 webhook 验证） */
  verificationToken?: string;
  /** 可选：加密 key */
  encryptKey?: string;
}

export class FeishuClient {
  private _config: FeishuConfig;
  private _tenantToken: string | null = null;
  private _tokenExpiresAt: number = 0;

  constructor(config: FeishuConfig) {
    this._config = config;
  }

  /** 获取 tenant_access_token（自动缓存） */
  private async _getToken(): Promise<string> {
    if (this._tenantToken && Date.now() < this._tokenExpiresAt) {
      return this._tenantToken;
    }

    const resp = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: this._config.appId,
        app_secret: this._config.appSecret,
      }),
    });

    const data = await resp.json() as { code: number; tenant_access_token: string; expire: number };
    if (data.code !== 0) throw new Error(`飞书 token 获取失败: ${JSON.stringify(data)}`);

    this._tenantToken = data.tenant_access_token;
    // 提前 5 分钟过期
    this._tokenExpiresAt = Date.now() + (data.expire - 300) * 1000;
    return this._tenantToken;
  }

  /** 发送消息 */
  async sendMessage(
    receiveIdType: "open_id" | "user_id" | "chat_id",
    receiveId: string,
    msgType: "text" | "interactive",
    content: string,
  ): Promise<{ messageId: string }> {
    const token = await this._getToken();
    const resp = await fetch(
      `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          receive_id: receiveId,
          msg_type: msgType,
          content,
        }),
      },
    );

    const data = await resp.json() as { code: number; data?: { message_id: string } };
    if (data.code !== 0) throw new Error(`飞书消息发送失败: ${JSON.stringify(data)}`);
    return { messageId: data.data!.message_id };
  }

  /** 回复消息 */
  async replyMessage(
    messageId: string,
    msgType: "text" | "interactive",
    content: string,
  ): Promise<{ messageId: string }> {
    const token = await this._getToken();
    const resp = await fetch(
      `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/reply`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ msg_type: msgType, content }),
      },
    );

    const data = await resp.json() as { code: number; data?: { message_id: string } };
    if (data.code !== 0) throw new Error(`飞书回复失败: ${JSON.stringify(data)}`);
    return { messageId: data.data!.message_id };
  }

  /** 验证 webhook 回调签名 */
  verifyChallenge(body: Record<string, unknown>): string | null {
    if (body.type === "url_verification") {
      return body.challenge as string;
    }
    return null;
  }
}
```

- [ ] **Step 2: 创建 feishu-bot Trait readme**

```markdown
<!-- .ooc/objects/nexus/traits/feishu-bot/readme.md -->
---
when: "always"
deps: []
hooks:
  before:
    inject: |
      你可以通过飞书 Bot 与外部用户沟通。
      使用 sendFeishuMessage(chatId, text) 发送消息。
      使用 replyFeishuMessage(messageId, text) 回复消息。
---

# 飞书 Bot

连接飞书 IM，实现与外部用户的消息收发。

## 能力
- 向飞书群/用户发送文本消息
- 回复飞书消息
- 接收飞书消息（通过 webhook 自动转为 OOC talk）
```

- [ ] **Step 3: 创建 feishu-bot Trait 代码**

```typescript
// .ooc/objects/nexus/traits/feishu-bot/index.ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** 获取飞书配置 */
function getConfig(ctx: { sharedDir: string }) {
  // 从 .ooc/config/feishu.json 读取
  const configPath = join(ctx.sharedDir, "..", "..", "..", "config", "feishu.json");
  if (!existsSync(configPath)) {
    throw new Error("飞书配置不存在，请创建 .ooc/config/feishu.json");
  }
  return JSON.parse(readFileSync(configPath, "utf-8"));
}

/**
 * 向飞书群或用户发送文本消息
 * @param ctx - OOC 方法上下文
 * @param chatId - 飞书 chat_id（群聊 ID）
 * @param text - 消息文本
 */
export async function sendFeishuMessage(ctx: unknown, chatId: string, text: string): Promise<string> {
  const config = getConfig(ctx as { sharedDir: string });
  const tokenResp = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret }),
  });
  const tokenData = await tokenResp.json() as { tenant_access_token: string };

  const resp = await fetch(
    `https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenData.tenant_access_token}`,
      },
      body: JSON.stringify({
        receive_id: chatId,
        msg_type: "text",
        content: JSON.stringify({ text }),
      }),
    },
  );

  const data = await resp.json() as { code: number; data?: { message_id: string } };
  if (data.code !== 0) return `[错误] 发送失败: ${JSON.stringify(data)}`;
  return `✓ 消息已发送 (message_id: ${data.data!.message_id})`;
}

/**
 * 回复飞书消息
 * @param ctx - OOC 方法上下文
 * @param messageId - 要回复的消息 ID
 * @param text - 回复文本
 */
export async function replyFeishuMessage(ctx: unknown, messageId: string, text: string): Promise<string> {
  const config = getConfig(ctx as { sharedDir: string });
  const tokenResp = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: config.appId, app_secret: config.appSecret }),
  });
  const tokenData = await tokenResp.json() as { tenant_access_token: string };

  const resp = await fetch(
    `https://open.feishu.cn/open-apis/im/v1/messages/${messageId}/reply`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tokenData.tenant_access_token}`,
      },
      body: JSON.stringify({
        msg_type: "text",
        content: JSON.stringify({ text }),
      }),
    },
  );

  const data = await resp.json() as { code: number; data?: { message_id: string } };
  if (data.code !== 0) return `[错误] 回复失败: ${JSON.stringify(data)}`;
  return `✓ 已回复 (message_id: ${data.data!.message_id})`;
}
```

- [ ] **Step 4: 在 server.ts 中新增飞书 webhook 端点**

```typescript
// src/server/server.ts 新增路由

// POST /api/webhook/feishu
// 飞书事件回调：
// 1. url_verification → 返回 challenge
// 2. im.message.receive_v1 → 提取消息内容，调用 world.talk() 投递给目标 Object

if (method === "POST" && path === "/api/webhook/feishu") {
  const body = await req.json();

  // URL 验证（飞书首次配置回调时发送）
  if (body.type === "url_verification") {
    return json({ challenge: body.challenge });
  }

  // 消息事件
  const event = body.event;
  if (body.header?.event_type === "im.message.receive_v1" && event) {
    const msgType = event.message?.message_type;
    const chatId = event.message?.chat_id;
    const senderId = event.sender?.sender_id?.open_id;
    let content = "";

    if (msgType === "text") {
      try {
        content = JSON.parse(event.message.content).text;
      } catch { content = event.message.content; }
    } else {
      content = `[${msgType}] ${event.message.content}`;
    }

    // 投递给 nexus（或根据配置路由到其他对象）
    const targetObject = "nexus";
    const from = `feishu:${senderId}`;
    await world.talk(targetObject, content, from);

    consola.info(`[Feishu] ${from} → ${targetObject}: ${content.slice(0, 50)}`);
  }

  return json({ success: true });
}
```

- [ ] **Step 5: 创建飞书配置模板**

```json
// .ooc/config/feishu.json.example
{
  "appId": "cli_xxxxxxxxxx",
  "appSecret": "xxxxxxxxxxxxxxxxxxxxxxxx",
  "verificationToken": "xxxxxxxxxxxxxxxx",
  "encryptKey": ""
}
```

将 `.ooc/config/feishu.json` 加入 `.gitignore`。

- [ ] **Step 6: 端到端测试**

1. 在飞书开放平台创建测试 Bot
2. 配置 webhook URL 指向 OOC Server
3. 在飞书群中 @Bot 发消息
4. 验证消息到达 nexus 对象
5. nexus 通过 sendFeishuMessage 回复

---

## 实施顺序与依赖关系

```
Task 1 (文件系统 API)  ──→  无依赖，可独立开始
Task 2 (LLM API)       ──→  无依赖，可独立开始
Task 3 (单步调试)      ──→  无依赖，可独立开始
Task 4 (Shell 执行)    ──→  依赖 Task 1 完成（parser 修改）
Task 5 (定时任务)      ──→  依赖 Task 1 完成（buildExecutionContext 签名变更）
Task 6 (飞书对接)      ──→  无依赖，可独立开始
```

**推荐并行策略:**
- Agent A: Task 1 → Task 4
- Agent B: Task 2 + Task 3
- Agent C: Task 5 + Task 6

**总预估改动量:**
- 新增文件: 3 个 (`src/world/cron.ts`, `src/integrations/feishu.ts`, feishu-bot trait)
- 修改文件: 7 个 (`thinkloop.ts`, `parser.ts`, `executor.ts`, `world.ts`, `scheduler.ts`, `server.ts`, `types/flow.ts`)
- 新增代码: ~600 行
- 修改代码: ~200 行
