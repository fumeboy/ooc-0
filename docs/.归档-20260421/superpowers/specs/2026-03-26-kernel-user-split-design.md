# OOC Kernel/User 分仓设计

## 背景

当前 OOC 项目是单一 git 仓库，框架代码（src/、web UI、内核 traits）和用户数据（stones、flows、docs）混在一起。这导致：

1. 框架升级和用户数据耦合，难以独立演进
2. 无法区分"具有持久价值的框架代码"和"运行时产生的临时数据"
3. 未来多用户场景下，每个用户需要独立的 Agent 工作区，但共享同一套框架

## 设计目标

- 将 OOC 拆为 kernel（框架）和 user（工作区）两个独立 git 仓库
- user repo 通过 git submodule 引用 kernel repo
- 明确每个文件的归属，保护具有持久价值的数据

## 目录结构

### kernel repo

```
kernel/
├── src/                        # 后端代码（原 src/）
│   ├── cli.ts
│   ├── server/
│   ├── world/
│   ├── flow/
│   ├── stone/
│   ├── trait/
│   ├── context/
│   ├── process/
│   ├── executable/
│   ├── thinkable/
│   ├── persistence/
│   ├── integrations/
│   ├── types/
│   └── logging.ts
├── web/                        # Web UI（原 .ooc/web/）
│   ├── src/
│   ├── package.json
│   ├── vite.config.ts
│   └── tsconfig.json
├── traits/                     # 内核 traits（原 .ooc/kernel/traits/）
│   ├── computable/
│   ├── talkable/
│   ├── reflective/
│   ├── verifiable/
│   ├── debuggable/
│   ├── plannable/
│   ├── testable/
│   ├── reviewable/
│   ├── web_search/
│   └── object_creation/
├── tests/                      # 测试（原 tests/）
├── package.json
├── tsconfig.json
└── .gitignore
```

### user repo

```
user/
├── kernel/                     # git submodule → kernel repo
├── stones/                     # 对象定义（原 .ooc/stones/）
│   ├── supervisor/
│   ├── sophia/
│   ├── kernel/
│   ├── iris/
│   ├── nexus/
│   ├── bruce/
│   ├── alan_kay/
│   ├── skill_manager/
│   └── user/
├── flows/                      # 运行时 Flow（gitignore）
├── docs/                       # 文档（原 .ooc/docs/）
│   ├── meta.md
│   ├── 哲学文档/
│   ├── feature/
│   ├── 规范/
│   ├── 组织/
│   ├── 体验用例/
│   ├── 参考/
│   ├── 理想与现实/
│   └── 历史文档/
├── data.json                   # 全局状态（gitignore）
├── server.json                 # 服务器配置（gitignore）
└── .gitignore
```

## 文件归属映射

| 原路径 | 新路径 | 归属 |
|--------|--------|------|
| `src/**` | `kernel/src/**` | kernel repo |
| `.ooc/web/**` | `kernel/web/**` | kernel repo |
| `.ooc/kernel/traits/**` | `kernel/traits/**` | kernel repo |
| `tests/**` | `kernel/tests/**` | kernel repo |
| `package.json` | `kernel/package.json` | kernel repo |
| `tsconfig.json` | `kernel/tsconfig.json` | kernel repo |
| `.ooc/stones/**` | `user/stones/**` | user repo |
| `.ooc/docs/**` | `user/docs/**` | user repo |
| `.ooc/flows/**` | `user/flows/**` | user repo (gitignore) |
| `.ooc/data.json` | `user/data.json` | user repo (gitignore) |
| `CLAUDE.md` | `user/CLAUDE.md` | user repo |
| `README.md` | `kernel/README.md` | kernel repo |

## 运行时路径解析

kernel 代码需要知道 user 目录的位置。约定：

- 启动命令从 user repo 根目录执行：`bun kernel/src/cli.ts`
- kernel 代码通过 `process.cwd()` 获取 user 根目录
- 所有路径解析基于 `cwd`（user 根目录），而非 kernel 代码所在目录

路径映射：
- stones: `${cwd}/stones/`
- flows: `${cwd}/flows/`
- docs: `${cwd}/docs/`
- kernel traits: `${cwd}/kernel/traits/`
- data.json: `${cwd}/data.json`

## 版本管理策略

### kernel repo

git 跟踪所有文件。`.gitignore`:
```
node_modules/
dist/
.env
web/node_modules/
web/dist/
```

### user repo

保护有持久价值的数据，忽略运行时数据。`.gitignore`:
```
# 运行时数据
flows/
data.json
server.json

# 依赖
kernel/web/node_modules/
kernel/node_modules/

# 环境
.env
```

git 跟踪的有价值数据：
- `stones/*/readme.md` — 对象身份定义
- `stones/*/data.json` — 对象元数据
- `stones/*/traits/**` — 对象自定义 traits
- `stones/*/shared/ui/**` — 对象自渲染 UI
- `docs/**` — 所有文档
- `CLAUDE.md` — Supervisor prompt

### submodule 管理

```bash
# user repo 初始化
git submodule add <kernel-repo-url> kernel

# 升级 kernel
cd kernel && git pull origin main && cd ..
git add kernel && git commit -m "upgrade kernel"
```

## 需要修改的代码

### 1. CLI 入口（src/cli.ts）— CRITICAL

当前代码：
```typescript
const OOC_ROOT = join(process.cwd(), ".ooc");
```

修改为：
```typescript
const OOC_ROOT = process.cwd(); // user repo 根目录即 OOC_ROOT
```

启动时验证 submodule：
```typescript
if (!existsSync(join(process.cwd(), "kernel"))) {
  consola.error("kernel/ submodule not initialized. Run: git submodule update --init");
  process.exit(1);
}
```

### 2. 路径常量（src/world/world.ts）— CRITICAL

当前硬编码 `.ooc/` 前缀的路径需要改为基于 `cwd` 的相对路径：
- `.ooc/stones/` → `stones/`
- `.ooc/flows/` → `flows/`
- `.ooc/kernel/traits/` → `kernel/traits/`
- `.ooc/data.json` → `data.json`

所有路径在 World 初始化时计算为绝对路径，后续不受 cwd 变化影响。

### 3. Web UI Vite 配置（web/vite.config.ts）— CRITICAL

当前 `__dirname` 指向 `kernel/web/`，需要向上两级才能到达 user 根目录：

```typescript
// 当前
const OOC_ROOT = path.resolve(__dirname, "..");  // → kernel/

// 修改为
const OOC_ROOT = path.resolve(__dirname, "../.."); // → user/
```

Vite alias 同步调整：
```typescript
alias: {
  "@ooc": path.resolve(__dirname, "src"),          // kernel/web/src ✓
  "@stones": path.resolve(__dirname, "../../stones"), // user/stones ✓
  "@flows": path.resolve(__dirname, "../../flows"),   // user/flows ✓
}
```

### 4. Server 静态文件服务（src/server/server.ts）

Web UI 静态文件路径：
- 开发模式：Vite dev server（端口 5173），从 `kernel/web/` 启动
- 生产模式：静态文件从 `kernel/web/dist/` 提供

### 5. @ref 注释

所有源文件中的 `@ref .ooc/docs/` 改为 `@ref docs/`（因为 cwd 就是 user 根目录）。
涉及约 35+ 个源文件，使用 sed 批量替换。

## 迁移步骤

1. 创建 kernel repo，将 src/、tests/、.ooc/web/、.ooc/kernel/traits/、package.json、tsconfig.json 移入
2. 修改 kernel 代码中的路径常量
3. 创建 user repo，将 .ooc/stones/、.ooc/docs/、CLAUDE.md 移入
4. 在 user repo 中添加 kernel 为 submodule
5. 更新所有 @ref 注释路径
6. 验证：从 user/ 目录执行 `bun kernel/src/cli.ts`，确认功能正常
7. 运行测试：`cd kernel && bun test`

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| 路径硬编码散落各处 | 迁移前 grep 所有 `.ooc/` 引用，统一修改 |
| submodule 操作对用户不友好 | 提供 setup.sh 脚本自动化初始化 |
| Web UI 的 /@fs/ 动态加载路径变化 | 调整 `__OOC_ROOT__` 指向 user 根目录 |
| 测试依赖 user 目录结构 | 测试使用临时目录模拟 user 结构 |
