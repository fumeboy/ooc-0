# OOC 系统 Python → Bun (TypeScript) 迁移技术调研

## 1. 项目现状分析

### 1.1 当前技术栈

- 语言: Python 3.12
- 依赖: pydantic, httpx, loguru
- 测试: pytest + pytest-asyncio
- 代码量: ~20,000 行 Python（kernel 目录）
- 打包: setuptools + pip

### 1.2 核心能力与 Python 特性依赖

OOC 系统深度依赖以下 Python 特性：

① 动态代码执行（CodeExecutor）
  - 使用 exec() + compile() 在受限命名空间中执行 LLM 生成的 Python 代码
  - 通过 __builtins__ 白名单控制可用函数
  - AST 静态分析（sandbox.py）拦截危险操作
  - 注入 self 和 world 到执行命名空间

② 动态类加载与元编程（persistence + stone）
  - importlib 动态加载 code.py
  - 运行时创建派生类（type() 动态构造 class）
  - __dict__ 直接作为字段存储
  - set_code() 热重载：修改 code.py 后重新加载 class
  - 对象可以修改自身的方法和字段定义（元编程）

③ 类继承体系
  - Stone → Flow → Chat 三层继承
  - Stone → Extension → Filesystem/Browser/Terminal
  - from_dict() / to_dict() 序列化链
  - META_CLASS 类变量用于类型标识

④ 其他 Python 特性
  - dataclass（Bias, ThinkOutput, Context 等）
  - Enum（Lifecycle, FlowStatus）
  - 类型注解 + TYPE_CHECKING 延迟导入
  - loguru 结构化日志
  - httpx 同步 HTTP 客户端

### 1.3 已有的 Node.js 存档版本

.存档/nodejs_project/ 中有一个早期 Node.js 实现，使用了：
  - node:vm 的 createContext + runInContext 做沙箱执行
  - Proxy 做 world 方法代理
  - IPC 子进程隔离（sandbox runner）
  - TypeScript 类型定义

这个存档版本可以作为迁移参考。

---

## 2. Bun 平台能力评估

### 2.1 Bun 核心优势

- TypeScript 原生支持: 直接运行 .ts/.tsx，无需编译步骤
- 内置测试框架: bun:test，Jest 兼容 API
- 内置包管理: bun install，比 npm 快 30x
- 高性能 HTTP: Bun.serve() 内置路由、WebSocket
- 文件 I/O: Bun.file() / Bun.write() 优化 API
- 子进程: Bun.spawn() / Bun.$ shell API
- Node.js 兼容: 大部分 node: 模块已完全兼容
- 启动速度: 比 Node.js 快 4x

### 2.2 关键能力对照

Python 能力              → Bun/TS 对应方案                    难度   备注
─────────────────────────────────────────────────────────────────────────────
exec() 动态执行          → node:vm createContext              ★★☆   Bun 已支持 node:vm（标记为🟡部分实现）
                           或 Bun.spawn 子进程隔离                    存档版本已有 node:vm 实现可参考
importlib 动态加载       → dynamic import() + 文件写入        ★★☆   Bun 原生支持 dynamic import
type() 动态创建类        → class 表达式 + Proxy               ★☆☆   JS 原生支持
__dict__ 字段存储        → Map / plain object                 ★☆☆   JS 对象天然是字典
dataclass               → interface + class / zod schema     ★☆☆   TypeScript 类型系统更强
Enum                    → const enum / union type            ★☆☆   TS 原生支持
httpx HTTP 客户端       → fetch (内置)                        ★☆☆   Bun 内置 Web 标准 fetch
loguru 日志             → pino / consola / console           ★☆☆   多种成熟方案
pytest 测试             → bun:test (内置)                     ★☆☆   Jest 兼容 API
AST 安全检查            → acorn/babel AST 解析               ★★☆   JS AST 工具链成熟
类继承体系              → class extends                      ★☆☆   TS class 继承完全对应
序列化 to_dict/from_dict → toJSON() / static fromJSON()      ★☆☆   JSON 是 JS 原生能力
Ref[T] 延迟引用         → Proxy / getter                     ★☆☆   Proxy 比 Python 描述符更灵活
HTTP Server             → Bun.serve()                        ★☆☆   内置高性能 HTTP

### 2.3 node:vm 在 Bun 中的状态

Bun 对 node:vm 标记为 🟡（部分实现）。关键 API 状态：
  - vm.Script: 已支持
  - vm.createContext: 已支持
  - vm.runInContext: 已支持
  - vm.Module (ESM): 未完全支持

对于 OOC 的代码执行需求（在受限上下文中执行字符串代码），vm.Script + createContext 已足够。
存档版本的 sandbox/runner.ts 已验证了这条路径的可行性。

---

## 3. 迁移方案设计

### 3.1 架构映射

Python 目录                    → TypeScript 目录
─────────────────────────────────────────────────
kernel/meta/stone.py           → src/meta/stone.ts
kernel/meta/flow.py            → src/meta/flow.ts
kernel/meta/chat.py            → src/meta/chat.ts
kernel/meta/bias.py            → src/meta/bias.ts
kernel/meta/context.py         → src/meta/context.ts
kernel/meta/relation.py        → src/meta/relation.ts
kernel/meta/ref.py             → src/meta/ref.ts
kernel/meta/biases/            → src/meta/biases/
kernel/meta/objects/           → src/meta/objects/
kernel/thinkable/client.py     → src/thinkable/client.ts
kernel/thinkable/config.py     → src/thinkable/config.ts
kernel/executable/executor.py  → src/executable/executor.ts
kernel/executable/sandbox.py   → src/executable/sandbox.ts
kernel/storable/persistence.py → src/storable/persistence.ts
kernel/world/world.py          → src/world/world.ts
kernel/world/registry.py       → src/world/registry.ts
kernel/world/events.py         → src/world/events.ts
kernel/extensions/             → src/extensions/
kernel/server/                 → src/server/  (可用 Bun.serve 重写)
kernel/bootstrap.py            → src/bootstrap.ts
kernel/cli.py                  → src/cli.ts
tests/                         → tests/

### 3.2 核心模块迁移策略

#### A. Stone（基础对象）

Python:
  class Stone:
      def __init__(self, name, **params):
          self.name = name
          # 字段直接存在 __dict__

TypeScript 等价:
  class Stone {
    name: string;
  }

#### B. CodeExecutor（代码执行引擎）

Python:
  exec(compile(code, "<ooc-exec>", "exec"), namespace)

TypeScript 等价（三种方案）:

  方案 1: node:vm（推荐，存档版本已验证）
    import vm from "node:vm";
    const context = vm.createContext({ self, world, ...safeBuiltins });
    const script = new vm.Script(code);
    script.runInContext(context);

  方案 2: Bun.spawn 子进程隔离
    将代码写入临时文件，用 Bun.spawn 在子进程中执行
    通过 IPC 通信（存档版本的 sandbox runner 模式）

  方案 3: Function 构造器（最简单但安全性最低）
    const fn = new Function("self", "world", code);
    fn(self, world);

推荐: 方案 1 作为默认，方案 2 作为高安全场景备选。

#### C. 动态类加载与热重载

Python:
  importlib.util.spec_from_file_location → module → class

TypeScript 等价:
  // 写入 .ts 文件后 dynamic import
  const mod = await import(`file://${codePath}?t=${Date.now()}`);
  // 查询字符串强制绕过模块缓存，实现热重载

推荐: 对象的 code.ts 使用 dynamic import 加载，热重载通过 cache-busting query string。

#### D. AST 安全检查

Python:
  ast.parse(code) → 遍历 AST 节点检查危险操作

TypeScript 等价:
  // 使用 acorn（轻量 JS parser）
  import * as acorn from "acorn";
  const ast = acorn.parse(code, { ecmaVersion: "latest" });
  // 遍历 AST 检查 import/require/eval/Function 等危险调用

acorn 是零依赖的轻量 parser，非常适合沙箱安全检查。

#### E. LLM 客户端

Python:
  httpx.Client → POST chat/completions

TypeScript 等价:
  // Bun 内置 fetch，无需第三方库
  const resp = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, max_tokens }),
  });
  const data = await resp.json();

#### F. HTTP Server

Python:
  http.server.HTTPServer（标准库）

TypeScript 等价:
  // Bun.serve 内置路由，性能远超 Python 标准库
  Bun.serve({
    routes: {
      "/api/objects/:name": req => { ... },
      "/api/talk": { POST: async req => { ... } },
    },
  });

#### G. 持久化

Python:
  json.dump/load + importlib 加载 code.py

TypeScript 等价:
  // JSON 序列化
  await Bun.write(dataPath, JSON.stringify(data, null, 2));
  const data = await Bun.file(dataPath).json();

  // 代码文件加载
  const mod = await import(codePath);

#### H. 事件总线

Python:
  自定义 EventBus（同步 emit/on）

TypeScript 等价:
  // 使用 Node.js EventEmitter（Bun 完全兼容）
  import { EventEmitter } from "node:events";
  // 或自定义 typed EventBus

---

## 4. 依赖替换方案

Python 依赖        → Bun/TS 替代                  说明
──────────────────────────────────────────────────────────
pydantic           → class-transformer/zod          用于对象序列化/反序列化
httpx              → fetch (内置)                   无需第三方库
loguru             → pino / consola                 pino 高性能，consola 美观
pytest             → bun:test (内置)                Jest 兼容
pytest-asyncio     → bun:test (原生 async)          内置支持
setuptools         → package.json + bun build       Bun 原生打包

新增推荐依赖:
  - acorn: JS AST 解析（沙箱安全检查）
  - class-transformer: 对象序列化/反序列化
  - zod: 运行时类型校验（替代 pydantic）
  - pino: 结构化日志（可选，console 也够用）

---

## 5. 迁移收益分析

### 5.1 性能提升

- 启动速度: Bun 比 Python 快一个数量级
- HTTP 吞吐: Bun.serve 远超 Python http.server
- 文件 I/O: Bun.file/write 经过底层优化
- 包安装: bun install 比 pip 快 10-30x

### 5.2 开发体验提升

- TypeScript 类型系统: 编译期捕获错误，IDE 智能提示
- 单一工具链: bun 同时是 runtime + 包管理 + 测试 + 打包
- 无需虚拟环境: 不再需要 venv/conda
- 前后端统一: 如果未来有 Web 前端，可以共享类型定义

### 5.3 生态优势

- npm 生态远大于 PyPI（尤其在 Web/Agent 工具链方面）
- LLM SDK 生态: OpenAI/Anthropic 的 JS SDK 维护活跃
- 前端集成: 天然支持 React/Vue 等前端框架

### 5.4 潜在风险

- node:vm 在 Bun 中标记为部分实现（🟡），可能存在边界情况
  → 缓解: 存档版本已验证核心 API 可用；备选方案为子进程隔离
- LLM 生成的代码需要从 Python 切换为 JavaScript
  → 这是最大的语义变化：所有 bias prompt 中关于"输出 Python 程序"的描述需改为"输出 JavaScript 程序"
  → LLM 生成 JS 代码的能力已经非常成熟
- 对象的 code.py 需要全部改为 code.ts
  → 已有对象的代码需要一次性迁移
- Python 的 exec() 可以执行语句（赋值、循环等），JS 的 eval() 只能执行表达式
  → 使用 node:vm 或 Function 构造器可以执行完整语句，不是问题

---

## 6. 迁移路线图

### Phase 1: 基础设施（建议首先完成）
  1. 初始化 Bun 项目: package.json, tsconfig.json, 目录结构
  2. 实现 Stone 基类: 字段存储、序列化、Bias/Relation 数据结构
  3. 实现 CodeExecutor: node:vm 沙箱 + AST 安全检查
  4. 实现持久化: code.ts + data.json 读写

### Phase 2: 核心能力
  5. 实现 Flow: 生命周期、Context、Thinkloop
  6. 实现 LLM 客户端: fetch 调用 OpenAI 兼容 API
  7. 实现 World: 对象注册、事件总线、Flow 调度
  8. 实现 Chat: 双向对话能力

### Phase 3: 扩展与集成
  9. 实现 Extensions: Filesystem, Browser, Terminal
  10. 实现 HTTP Server: Bun.serve 替代 Python http.server
  11. 实现 CLI: bun 脚本入口
  12. 实现 Bootstrap: 系统启动流程

### Phase 4: 测试与验证
  13. 单元测试: bun:test 覆盖所有核心模块
  14. 集成测试: 真实 LLM 多轮对话
  15. 迁移已有对象: code.py → code.ts

---

## 7. 关键设计决策（需要确认）

  Q1: 对象代码语言
      LLM 生成的代码从 Python 改为 JavaScript/TypeScript？
      → 建议: 改为 JavaScript（LLM 生成 JS 能力成熟，且与宿主语言一致）

  Q2: 沙箱方案
      node:vm（进程内隔离）vs Bun.spawn（子进程隔离）？
      → 建议: 默认 node:vm，高安全场景可选子进程

  Q3: 类型校验
      zod（运行时校验）vs 纯 TypeScript 类型？
      → 建议: 核心数据结构用 zod，内部逻辑用纯 TS 类型

  Q4: 日志方案
      pino vs consola vs console？
      → 建议: 开发阶段用 consola（美观），生产用 pino（高性能）

  Q5: 是否保留 Python 版本
      并行维护 vs 完全切换？
      → 建议: 完全切换，Python 版本归档到 .存档/py_project/

---

## 8. 结论

迁移可行性: ★★★★☆（高度可行）

OOC 系统的核心能力（动态代码执行、元编程、对象持久化）在 Bun/TypeScript 中都有成熟的对应方案。
最大的工作量不在技术障碍，而在代码量的等价重写（~20,000 行）。

存档的 nodejs_project 已经验证了关键路径（node:vm 沙箱、Proxy 代理、IPC 隔离），
可以作为迁移的起点参考。

Bun 相比 Python 的核心优势:
  - TypeScript 类型安全 + 编译期检查
  - 单一工具链（runtime + test + package + build）
  - 更好的性能（启动、HTTP、I/O）
  - 前后端统一的可能性
