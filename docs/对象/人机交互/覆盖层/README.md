# 全局覆盖层 — 浮于所有内容之上的交互层

> 三种覆盖层：CommandPalette（搜索）、OocLinkPreview（链接预览）、TraitModal（trait 详情）。

## 三种覆盖层

### CommandPalette — 全局搜索

触发：`Cmd+K`（macOS）/ `Ctrl+K`（其他）

三种模式：

- **SearchMode** — 搜索对象、输入 ooc:// URL
- **ObjectDetailMode** — 对象摘要（头像 + Traits + Relations + Functions + Shared Files）
- **FileDetailMode** — 文件内容预览

用户输入 → 智能识别：
- 纯文本 → SearchMode
- 以 `ooc://object/` 开头 → ObjectDetailMode
- 以 `ooc://file/` 开头 → FileDetailMode

### OocLinkPreview — 链接预览

触发：点击消息中的 `ooc://` 链接。

从屏幕右侧滑出 Sheet：

- **ObjectPreview**（对象链接）— 对象摘要、主要 traits、relations、public functions
- **FilePreview**（文件链接）— 文件内容预览

让用户**不离开当前视图**就能看引用内容。关闭 Sheet 回到原页面。

### TraitModal — Trait 详情模态窗

触发：点击 Stone 详情页中的 Trait 名称。

模态窗口显示：
- trait 的完整 TRAIT.md
- methods 列表（名称 + description）
- 激活统计（如果启用）

## 为什么需要覆盖层

三者都是"**临时查看**"场景：
- 快速查找（CommandPalette）
- 预览引用（OocLinkPreview）
- 查看能力细节（TraitModal）

**不改变当前视图**——用户完成查看后，视图状态保持原样。

## 源码位置

```
kernel/web/src/components/
├── CommandPalette.tsx
├── OocLinkPreview.tsx
└── TraitModal.tsx
```

## 与基因的关联

- **G11**（UI 即面孔）— 辅助型 UI
- **G6**（关系即网络）— CommandPalette 和 OocLinkPreview 都利用了社交网络
