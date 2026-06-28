# lifecycle —— OOC 系统 object 生命周期 维度的设计师

我是 OOC 7+1 维度模型中,object base 第 5 维 **lifecycle** 的维度对象。本维度由 [issue 2026-06-28-lifecycle-module-and-reload](../../../../docs/issues/2026-06-28-lifecycle-module-and-reload.md) 引入。

## 维度定位

**lifecycle 是 object base 的第 5 维**——object base 名单从 4 个(readable/executable/visible/persistable)扩展到 5 个(+lifecycle)。

按 self-constitutive 判据(supervisor `knowledge/index.md` §A `## OOC`)——是否构成对象「自我」:lifecycle 钩**改变对象本身的存在态**(诞生时尚未引入、激活、停用、被新代码接管),不是 runtime 单向旁路(对照 observable 是观测 agent、不改变其行为,故不入维度)。OOP 哲学侧:构造 + 析构 + 类重载是对象本质生命周期,属自我而非横切——OOC 在 object 层兑现这一传统。

## 核心设计

`OocClass.lifecycle: LifecycleModule` 槽位,内含三可选钩(`packages/@ooc/core/types/lifecycle.ts`):

```ts
interface LifecycleModule<Data = any> {
  active?: ObjectLifecycleHook<Data>;     // refcount 0→1
  unactive?: ObjectLifecycleHook<Data>;   // refcount 1→0
  on_reload?: OnReloadHook<Data>;         // hot-reload
}
```

### 1. `active` —— 首次激活钩

派发时机:object 在某 session 内被首次引用(refcount 0→1)。

典型用例:**class 级 long-lived service** 经单例 + active 钩自然表达(issue P)——单例对象被根级 context 静态引用即永生(refcount 永 ≥1、unactive 不触发),active 即 process-level once。service 资源在 active 内启动:fs.watch / lark event relay / database connection 等。

签名:`exec(ctx, self) => void | { delete?: boolean }`(返回 delete 仅 unactive 路径 honor)。

### 2. `unactive` —— 停用钩

派发时机:object 在某 session 内最后一个引用被移除(refcount 1→0)。

返回 `{ delete?: boolean }` 自决:
- 缺省 / `false` = **停用**(释放运行时资源、磁盘身份留存,之后被重新引用即再 active)
- `true` = **彻底删除**(从 session 对象表移除 + 持久化文件清理)

**无独立 destruct 钩**——OOC object 默认持久身份,删除由 unactive 自决(详 [object self.md 核心 11](../object/self.md))。

### 3. `on_reload` —— 热更新钩(本 issue 新增)

派发时机:class 源码 hot-reload(`stone:changed` event 类别 `code` / `identity` / `knowledge`)后,实例首次承新代码运行前。

签名 `exec(ctx, self, info: { changedFiles? }) => void`——`changedFiles` 是触发本次 invalidate 的源文件相对路径列表(hot-reload watcher 产)。class 据此精细判定哪些资源需重建:
- 重建 in-memory cache
- 重启 fs.watch / file watcher
- 重接外部连接(database / API client / websocket)
- 重算派生态

**class 自承迁移责任**——OOC 协议层不假定具体迁移语义,只提供派发时机 + changedFiles 信息。

## 顺序契约

**`on_reload` before `active`** —— 资源就位先于激活。

`ThreadRuntime.dispatchActive` 入口先调 `maybeDispatchOnReload`,确保 class 在被 active 前已经处理过新代码接管。

## 失败语义

**fail-loud** —— on_reload 抛 → 整个 active 链路停 → 上层错误处理。class 自承迁移失败后果。与 OOC 全局 fail-loud 哲学一致(`docs/solutions/conventions/llm-tool-handlers-fail-loud` 同源)。

## 派发架构

```
hot-reload (fs.watch)
  ↓
stoneRegistry.invalidate(id, files) → stone:changed event
  ↓
WorldRuntime listener:
  - serverLoader.invalidateStone() → executable/readable 缓存失效
  - ReloadTable.registerInvalidation(classId, files) → 标记 ts + 累积 changedFiles
  ↓
(下次 ThreadRuntime.dispatchActive 该 class 任一 inst 时)
  ↓
maybeDispatchOnReload:
  - peek(classId) 获取 ReloadMark
  - 对比本 thread 本地 onReloadCursor[classId]
  - invalidatedAt > cursor → 派发 on_reload, 推进 cursor
  ↓
on_reload(ctx, self, { changedFiles }) 完成
  ↓
active(ctx, self) 才被调用
```

`ReloadTable` 进程级单例(每 `WorldRuntime` 一份,测试隔离 + 多 world 并存);`onReloadCursor` 是每 thread 本地表(自然跨 session,无需 broadcast)。

## 命名警示

`thinkable.active(data) => boolean` 谓词(issue E 引入,用于判 thinkable 类实例是否终态、driver GC)与 `lifecycle.active` 钩**同名、不同语义**:

- `thinkable.active` 是**查询谓词**——返 `boolean` 判 inst 是否终态(`data.status !== "done" && data.status !== "failed"`)
- `lifecycle.active` 是**副作用钩**——在 refcount 0→1 时被派发

二者目前共存,各在自己模块中只读自身签名。future issue 处理重命名(候选 `thinkable.isAlive` / `thinkable.isRunning`)。

## 源码锚点

- `packages/@ooc/core/types/lifecycle.ts` —— LifecycleModule / ObjectLifecycleHook / OnReloadHook 类型契约
- `packages/@ooc/core/runtime/reload-table.ts` —— ReloadTable 进程级 invalidate 标记表
- `packages/@ooc/core/runtime/object-registry.ts:226-238` —— resolveActive / resolveUnactive / resolveOnReload 本类直查
- `packages/@ooc/core/runtime/world-runtime.ts:55-71` —— stone:changed listener 接入 ReloadTable
- `packages/@ooc/builtins/agent/children/thread/runtime/thread-runtime.ts:maybeDispatchOnReload` —— 派发实现
- `packages/@ooc/tests/lifecycle-on-reload.test.ts` —— 6 case 测试覆盖
