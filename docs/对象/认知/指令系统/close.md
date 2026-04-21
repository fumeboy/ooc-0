# close — 关闭上下文

> 取消未 submit 的 form，或卸载已加载的 trait / skill。

## 签名

```typescript
close({
  form_id: "f_001"
})
```

## 语义

close 的行为根据 form 类型不同：

### command 类型

```
form 状态 = open，未 submit
  → close 取消这次 open
  → 关联的 trait 卸载（refcount--）
  → 不执行任何指令
```

对 command 类型，close **等于取消**。如果 LLM 已经 open 了，但发现不需要执行，就 close。

### trait 类型

```
trait 的 readme 之前通过 open 加载到 Context
  → close 卸载该 trait（refcount--）
  → 下一轮 Context 中该 trait 的 readme 消失
```

trait 类型的 close **等于"用完了，释放 Context 空间"**。

### skill 类型

类似 trait，close 卸载 skill 内容。

## 典型用法

### 场景 1：选错了 command

```
LLM: open(command=program)
LLM: 啊，其实我想用 talk 而不是 program
LLM: close(form_id=xxx)
LLM: open(command=talk)
LLM: submit(...)
```

避免错误 submit 浪费 LLM token。

### 场景 2：不再需要某 trait 的详细文档

```
LLM: open(type=trait, name=kernel/computable/file_ops)
LLM: 阅读了详细 API
LLM: submit program 执行 writeFile
LLM: 不再需要 file_ops 的详细说明了
LLM: close(form_id=xxx)  // 释放 Context
```

把"临时查文档"的 trait 及时 close，避免 Context 膨胀。

### 场景 3：多个 trait 临时加载

```
LLM: open(type=trait, name=A) → 看一眼
LLM: close(form_id=A)
LLM: open(type=trait, name=B) → 看一眼
LLM: close(form_id=B)
```

像查字典一样快速翻阅多个 trait。

## 自动 close 机制

**submit 后不需要手动 close**：

```
open(command=program) → f_001
submit(form_id=f_001, code=...) → form 状态 submitted
// 此时 computable trait 的 refcount 已自动 --
```

**线程 return 时所有 open 的 form 自动 close**：

```
open(...) → f_001, f_002
return(...) → f_001, f_002 自动 cancel，关联 trait 全部 deactivate
```

## Refcount 保护

如果多个 form 同时激活同一个 trait，close 一个不会立即卸载：

```
form_1: open(command=program) → computable.refcount=1
form_2: open(command=program) → computable.refcount=2
close(form_1) → computable.refcount=1 （computable 还在）
close(form_2) → computable.refcount=0 （computable 真正卸载）
```

## close 失败情况

- form_id 不存在 → 错误
- form 已 submitted → 错误（已完成，无需再 close）

## 源码锚点

| 概念 | 实现 |
|---|---|
| close tool 定义 | `kernel/src/thread/tools.ts` |
| handleClose | `kernel/src/thread/engine.ts` |
| FormManager.cancel | `kernel/src/thread/form.ts` |
| deactivateTrait | `kernel/src/thread/tree.ts` |
