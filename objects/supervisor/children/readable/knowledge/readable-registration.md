---
title: readable 维度注册与 builtin 文件形态
activates_on:
  "object::root": "show_description"
---

# registerReadable 与 builtin 物理分文件

readable 是与 executable 并列的**一等注册维度**。`ObjectRegistry` 两个入口按维度分工（`packages/@ooc/core/runtime/object-registry.ts`）：

- `registerExecutable(type, patch)`（`:115`）——只收 `methods`（object method）+ 类元 `parentClass` / `isBuiltinFeature`。
- `registerReadable(type, patch)`（`:131`）——只收 readable 维度字段：`readable` / `renderXml` / `windowMethods` / `compressView` / `onClose` / `basicKnowledge` / `consumedMessageIds`（`packages/@ooc/core/_shared/types/registry.ts:64-77`）。

两入口共用私有 `mergeExistingDefinition`：按维度分别 merge 进同一 `ObjectDefinition`、**互不覆盖**（一维度未传的字段保留另一维度已注册的值）。类型层即拒绝越界字段——registerExecutable 传 readable 字段会编译失败，反之亦然。

**builtin 目录形态**（维度劈分后）：
- `executable/index.ts` —— executable 维度，调 `registerExecutable`。
- `readable.ts` —— readable 维度，调 `registerReadable`（自注册整套展示构造：readable fn + windowMethods + compressView + ...）。
- barrel `index.ts` —— 分别 side-effect 加载两维度（`import "./readable.js"` + `export * from "./executable/index.js"`）。**executable 不 import readable**，两维度物理解耦。
- 共享的展示工具（如 file 的 `asTuple`、viewport helper）下沉到 `packages/@ooc/builtins/_shared/`，避免两维度互相 import。

标准对象定义样板：`packages/@ooc/builtins/example/`（self.md + executable/index.ts + readable.ts + visible/，barrel 分注册）。

**沿 class 链回退**：registry 有 `resolveWindowMethod`（window method 沿 parentClass 链回退，镜像 object method 的 `resolveMethod`，`object-registry.ts:264/273`）；当前无自定义对象覆盖 readable，该链尚未被真正行使——详见 self.md「已知问题」。
