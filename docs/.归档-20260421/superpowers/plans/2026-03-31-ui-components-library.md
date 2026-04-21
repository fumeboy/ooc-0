# OOC UI 组件库实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 OOC Object 自渲染 UI 实现 8 个可复用组件，分三个阶段完成：CodeAgent 组件 → 数据展示组件 → 关系导航组件。

**Architecture:** 纯 React 组件 + Tailwind CSS + CSS Variables。仅新增一个依赖 `@codemirror/merge`。组件放置在 `kernel/web/src/components/ui/` 目录。

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, CodeMirror 6 (@uiw/react-codemirror)

**Spec:** `docs/superpowers/specs/2026-03-31-ui-components-library-design.md`

---

## 文件结构

| 操作 | 路径 | 说明 |
|------|------|------|
| 新建 | `kernel/web/src/components/ui/codemirror/theme.ts` | 共享 CodeMirror 主题 |
| 新建 | `kernel/web/src/components/ui/FileDiffViewer.tsx` | 文件 Diff 组件 |
| 新建 | `kernel/web/src/components/ui/CodeChangeSet.tsx` | 多文件变更集 |
| 新建 | `kernel/web/src/components/ui/JsonTreeViewer.tsx` | JSON 树查看器 |
| 新建 | `kernel/web/src/components/ui/DataTable.tsx` | 数据表格 |
| 新建 | `kernel/web/src/components/ui/KeyValuePanel.tsx` | 键值对面板 |
| 新建 | `kernel/web/src/components/ui/ActivityFeed.tsx` | 活动时间线 |
| 新建 | `kernel/web/src/components/ui/MentionPicker.tsx` | @ 对象选择器 |
| 新建 | `kernel/web/src/components/ui/RelationList.tsx` | 关系列表 |
| 修改 | `kernel/web/src/components/ui/CodeMirrorViewer.tsx` | 提取主题到共享模块 |
| 修改 | `kernel/web/package.json` | 添加 @codemirror/merge 依赖 |

---

## 实现顺序

### Phase 1: CodeAgent 场景组件 (P0 - 迫切)
1. 提取 CodeMirror 主题到共享模块
2. 安装 @codemirror/merge 依赖
3. 实现 FileDiffViewer
4. 实现 CodeChangeSet

### Phase 2: 数据展示场景组件 (P1 - 迫切)
5. 实现 JsonTreeViewer
6. 实现 KeyValuePanel
7. 实现 DataTable

### Phase 3: 关系与导航场景组件 (P2)
8. 实现 ActivityFeed
9. 实现 MentionPicker
10. 实现 RelationList

---

## Phase 1: CodeAgent 场景组件

### Task 1: 提取 CodeMirror 主题到共享模块

**Files:**
- Create: `kernel/web/src/components/ui/codemirror/theme.ts`
- Modify: `kernel/web/src/components/ui/CodeMirrorViewer.tsx`

**前置条件：** 已阅读 `CodeMirrorViewer.tsx` 理解现有主题结构

- [ ] **Step 1: 创建 codemirror 目录和 theme.ts 文件**

路径：`kernel/web/src/components/ui/codemirror/theme.ts`

```typescript
/**
 * 共享的 CodeMirror 主题配置
 *
 * 被 CodeMirrorViewer 和 FileDiffViewer 共用。
 * 使用 CSS Variables 自动适配亮暗主题。
 */

import { EditorView } from "@codemirror/view";

/** 暖色调浅色主题（匹配 OOC 前端风格） */
export const oocTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--background)",
    color: "var(--foreground)",
    fontSize: "13px",
  },
  ".cm-gutters": {
    backgroundColor: "var(--muted)",
    color: "var(--muted-foreground)",
    border: "none",
    paddingRight: "8px",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
  ".cm-activeLine": {
    backgroundColor: "transparent",
  },
  ".cm-cursor": {
    display: "none",
  },
  ".cm-selectionBackground, ::selection": {
    backgroundColor: "var(--accent) !important",
  },
});

/** 只读编辑器的基础配置扩展 */
export const readonlyExtensions = [
  EditorView.lineWrapping,
];
```

- [ ] **Step 2: 修改 CodeMirrorViewer.tsx 使用共享主题**

在 `CodeMirrorViewer.tsx` 中：

1. 删除现有的 `oocTheme` 定义（约 32-57 行）
2. 添加导入：`import { oocTheme } from "./codemirror/theme";`
3. 更新 `getLanguageExtension` 导出（供 FileDiffViewer 使用）

修改后的完整文件：

```typescript
/**
 * CodeMirrorViewer — 只读代码查看器（基于 CodeMirror 6）
 *
 * 支持 JSON / JavaScript / TypeScript / Markdown 语法高亮。
 * 纯查看模式，不可编辑。
 */
import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { javascript } from "@codemirror/lang-javascript";
import { markdown } from "@codemirror/lang-markdown";
import { oocTheme } from "./codemirror/theme";

/** 根据文件扩展名选择语言扩展 */
export function getLanguageExtension(ext: string) {
  switch (ext) {
    case "json":
      return json();
    case "js":
    case "jsx":
      return javascript({ jsx: true });
    case "ts":
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "md":
      return markdown();
    default:
      return undefined;
  }
}

interface CodeMirrorViewerProps {
  content: string;
  ext: string;
}

export function CodeMirrorViewer({ content, ext }: CodeMirrorViewerProps) {
  const extensions = useMemo(() => {
    const exts = [oocTheme];
    const lang = getLanguageExtension(ext);
    if (lang) exts.push(lang);
    return exts;
  }, [ext]);

  return (
    <CodeMirror
      value={content}
      extensions={extensions}
      editable={false}
      readOnly={true}
      basicSetup={{
        lineNumbers: true,
        foldGutter: ext === "json",
        highlightActiveLine: false,
        highlightActiveLineGutter: false,
      }}
    />
  );
}
```

- [ ] **Step 3: 验证 TypeScript 编译通过**

在 `kernel/web` 目录运行：
```bash
cd /Users/bytedance/x/ooc/ooc-1/kernel/web && npx tsc --noEmit
```

Expected: 无 TypeScript 错误

- [ ] **Step 4: 验证现有功能不受影响**

检查应用运行时 CodeMirrorViewer 仍能正常显示代码（如有运行中的服务器可手动验证）

- [ ] **Step 5: 提交**

```bash
cd /Users/bytedance/x/ooc/ooc-1
git add kernel/web/src/components/ui/codemirror/theme.ts
git add kernel/web/src/components/ui/CodeMirrorViewer.tsx
git commit -m "refactor: extract CodeMirror theme to shared module"
```

---

### Task 2: 安装 @codemirror/merge 依赖

**Files:**
- Modify: `kernel/web/package.json`

- [ ] **Step 1: 添加依赖到 package.json**

在 `kernel/web/package.json` 的 `dependencies` 中添加：
```json
"@codemirror/merge": "^6.0.0"
```

确认与现有 `@uiw/react-codemirror` 版本兼容（^4.25.8 使用 CodeMirror 6）

- [ ] **Step 2: 安装依赖**

```bash
cd /Users/bytedance/x/ooc/ooc-1/kernel/web && bun install
```

Expected: 安装成功，node_modules 中出现 @codemirror/merge

- [ ] **Step 3: 验证依赖可导入**

创建临时测试文件验证：
```bash
cd /Users/bytedance/x/ooc/ooc-1/kernel/web && node -e "import('@codemirror/merge').then(m => console.log('OK:', Object.keys(m)))"
```

Expected: 输出包含 `mergeView`, `MergeConfig` 等

- [ ] **Step 4: 提交**

```bash
cd /Users/bytedance/x/ooc/ooc-1
git add kernel/web/package.json
git add kernel/web/bun.lockb  # 或 package-lock.json，视实际锁文件而定
git commit -m "deps: add @codemirror/merge for FileDiffViewer"
```

**注意：** 检查实际的锁文件名（可能是 `bun.lockb`、`pnpm-lock.yaml` 或 `package-lock.json`）

---

### Task 3: 实现 FileDiffViewer 组件

**Files:**
- Create: `kernel/web/src/components/ui/FileDiffViewer.tsx`

**前置条件：** Task 1 和 Task 2 已完成

- [ ] **Step 1: 创建 FileDiffViewer.tsx 组件**

```typescript
/**
 * FileDiffViewer — 文件 Diff 对比组件
 *
 * 基于 @codemirror/merge 实现，支持分栏和统一两种视图模式。
 * 用于 CodeAgent 展示代码变更前后对比。
 *
 * @ref https://github.com/codemirror/merge
 */

import { useMemo } from "react";
import { EditorView } from "@codemirror/view";
import { mergeView, MergeConfig } from "@codemirror/merge";
import CodeMirror from "@uiw/react-codemirror";
import { oocTheme } from "./codemirror/theme";
import { getLanguageExtension } from "./CodeMirrorViewer";

export type FileDiffViewMode = "split" | "unified";

interface FileDiffViewerProps {
  /** 旧版本内容 */
  oldContent: string;
  /** 新版本内容 */
  newContent: string;
  /** 文件扩展名，用于语法高亮 */
  language?: string;
  /** 视图模式：分栏或统一视图 */
  viewMode?: FileDiffViewMode;
  /** 文件名（可选，用于标题展示） */
  fileName?: string;
  /** 是否显示行号 */
  showGutter?: boolean;
  /** 是否允许折叠未修改的代码块 */
  collapseUnchanged?: boolean;
  /** 最大高度 */
  maxHeight?: string;
}

/**
 * Diff 高亮颜色配置
 * 使用语义化颜色，与 OOC 主题一致
 */
const diffHighlight = EditorView.theme({
  // 删除行背景色
  ".cm-deletedLine": {
    backgroundColor: "color-mix(in srgb, #fecaca 30%, transparent)",
  },
  // 删除字符高亮
  ".cm-deletedText": {
    backgroundColor: "#fca5a5",
    textDecoration: "line-through",
  },
  // 新增行背景色
  ".cm-insertedLine": {
    backgroundColor: "color-mix(in srgb, #bbf7d0 30%, transparent)",
  },
  // 新增字符高亮
  ".cm-insertedText": {
    backgroundColor: "#86efac",
  },
  //  gutter 中的修改标记
  ".cm-changeGutter": {
    width: "4px",
    padding: "0 2px",
  },
  ".cm-changeGutter.insert": {
    borderLeft: "3px solid #22c55e",
  },
  ".cm-changeGutter.delete": {
    borderLeft: "3px solid #ef4444",
  },
});

export function FileDiffViewer({
  oldContent,
  newContent,
  language,
  viewMode = "split",
  fileName,
  showGutter = true,
  collapseUnchanged = false,
  maxHeight,
}: FileDiffViewerProps) {
  // 根据 language 或文件名推断扩展名
  const ext = useMemo(() => {
    if (language) return language.toLowerCase();
    if (fileName) {
      const match = fileName.match(/\.([^.]+)$/);
      return match ? match[1]!.toLowerCase() : "";
    }
    return "";
  }, [language, fileName]);

  // 构建扩展
  const extensions = useMemo(() => {
    const exts: any[] = [oocTheme, diffHighlight];

    // 语言扩展
    const langExt = getLanguageExtension(ext);
    if (langExt) exts.push(langExt);

    // mergeView 配置
    const mergeConfig: MergeConfig = {
      a: oldContent,
      b: newContent,
      // 统一视图或分栏视图
      unified: viewMode === "unified",
      // 高亮字符级差异
      highlightChanges: true,
      // gutter 标记
      gutter: showGutter ? {} : false,
    };

    // 折叠未修改代码（如果启用）
    if (collapseUnchanged) {
      (mergeConfig as any).collapseUnchanged = 2; // 2 行上下文
    }

    exts.push(mergeView(mergeConfig));

    return exts;
  }, [oldContent, newContent, ext, viewMode, showGutter, collapseUnchanged]);

  const containerStyle: React.CSSProperties = {
    maxHeight,
    overflow: "auto",
  };

  return (
    <div style={containerStyle} className="file-diff-viewer">
      {fileName && (
        <div className="text-xs text-[var(--muted-foreground)] mb-2 px-2 font-mono">
          {fileName}
        </div>
      )}
      <CodeMirror
        value=""
        extensions={extensions}
        editable={false}
        readOnly={true}
        basicSetup={{
          lineNumbers: showGutter,
          foldGutter: false,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
        }}
      />
    </div>
  );
}

/**
 * 便捷组件：分栏视图（默认）
 */
export function SplitDiffViewer(props: Omit<FileDiffViewerProps, "viewMode">) {
  return <FileDiffViewer {...props} viewMode="split" />;
}

/**
 * 便捷组件：统一视图
 */
export function UnifiedDiffViewer(props: Omit<FileDiffViewerProps, "viewMode">) {
  return <FileDiffViewer {...props} viewMode="unified" />;
}
```

- [ ] **Step 2: 验证 TypeScript 编译通过**

```bash
cd /Users/bytedance/x/ooc/ooc-1/kernel/web && npx tsc --noEmit
```

Expected: 无 TypeScript 错误

**注意：** 如果 `@codemirror/merge` 的类型有问题，可能需要：
- 检查 `@codemirror/merge` 的版本兼容性
- 或添加 `// @ts-ignore` 临时解决

- [ ] **Step 3: 提交**

```bash
cd /Users/bytedance/x/ooc/ooc-1
git add kernel/web/src/components/ui/FileDiffViewer.tsx
git commit -m "feat: add FileDiffViewer component for code diff display"
```

---

### Task 4: 实现 CodeChangeSet 组件

**Files:**
- Create: `kernel/web/src/components/ui/CodeChangeSet.tsx`

**前置条件：** Task 3 (FileDiffViewer) 已完成

- [ ] **Step 1: 创建 CodeChangeSet.tsx 组件**

```typescript
/**
 * CodeChangeSet — 多文件变更集组件
 *
 * 展示 Git 风格的文件变更列表，点击文件可查看 Diff。
 * 用于 CodeAgent 展示批量代码修改。
 */

import { useState, useMemo } from "react";
import { cn } from "../../lib/utils";
import { FileDiffViewer } from "./FileDiffViewer";
import { Badge } from "./Badge";
import {
  File,
  FilePlus,
  FileMinus,
  FileEdit,
  ChevronRight,
  ChevronDown,
  FolderOpen,
  Folder,
} from "lucide-react";

export type FileChangeStatus = "added" | "modified" | "deleted" | "renamed";

export interface FileChange {
  /** 文件路径 */
  path: string;
  /** 变更类型 */
  status: FileChangeStatus;
  /** 新增行数 */
  additions: number;
  /** 删除行数 */
  deletions: number;
  /** 旧版本内容（modified/deleted/renamed 时需要） */
  oldContent?: string;
  /** 新版本内容（added/modified/renamed 时需要） */
  newContent?: string;
  /** 重命名时的旧路径 */
  oldPath?: string;
}

interface CodeChangeSetProps {
  /** 文件变更列表 */
  changes: FileChange[];
  /** 当前选中的文件路径 */
  selectedPath?: string;
  /** 文件选择回调 */
  onSelect?: (path: string) => void;
  /** 是否默认收起文件列表 */
  collapsed?: boolean;
  /** 是否显示统计信息 */
  showStats?: boolean;
  /** 最大高度 */
  maxHeight?: string;
  /** 空状态文本 */
  emptyText?: string;
}

/** 变更状态对应的图标 */
const STATUS_ICONS: Record<FileChangeStatus, typeof File> = {
  added: FilePlus,
  modified: FileEdit,
  deleted: FileMinus,
  renamed: FileEdit,
};

/** 变更状态对应的颜色 */
const STATUS_COLORS: Record<FileChangeStatus, string> = {
  added: "text-green-600 dark:text-green-400",
  modified: "text-amber-600 dark:text-amber-400",
  deleted: "text-red-600 dark:text-red-400",
  renamed: "text-purple-600 dark:text-purple-400",
};

/**
 * 将文件路径按目录分组
 */
function groupByDirectory(changes: FileChange[]): Map<string, FileChange[]> {
  const groups = new Map<string, FileChange[]>();

  for (const change of changes) {
    const parts = change.path.split("/");
    if (parts.length > 1) {
      const dir = parts.slice(0, -1).join("/");
      if (!groups.has(dir)) groups.set(dir, []);
      groups.get(dir)!.push(change);
    } else {
      // 根目录文件
      if (!groups.has("")) groups.set("", []);
      groups.get("")!.push(change);
    }
  }

  return groups;
}

export function CodeChangeSet({
  changes,
  selectedPath: externalSelectedPath,
  onSelect,
  collapsed = false,
  showStats = true,
  maxHeight,
  emptyText = "暂无变更",
}: CodeChangeSetProps) {
  // 内部选中状态（若无外部控制）
  const [internalSelectedPath, setInternalSelectedPath] = useState<string | null>(null);
  const selectedPath = externalSelectedPath ?? internalSelectedPath;

  // 列表展开状态
  const [listCollapsed, setListCollapsed] = useState(collapsed);

  // 展开的目录
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  // 计算统计信息
  const stats = useMemo(() => {
    const totalFiles = changes.length;
    const totalAdditions = changes.reduce((sum, c) => sum + c.additions, 0);
    const totalDeletions = changes.reduce((sum, c) => sum + c.deletions, 0);
    return { totalFiles, totalAdditions, totalDeletions };
  }, [changes]);

  // 按目录分组
  const groups = useMemo(() => groupByDirectory(changes), [changes]);

  // 选中的变更
  const selectedChange = changes.find((c) => c.path === selectedPath);

  // 处理文件选择
  const handleSelect = (path: string) => {
    if (onSelect) {
      onSelect(path);
    } else {
      setInternalSelectedPath(path === selectedPath ? null : path);
    }
  };

  // 切换目录展开
  const toggleDir = (dir: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });
  };

  // 空状态
  if (changes.length === 0) {
    return (
      <div className="text-center py-8 text-[var(--muted-foreground)]">
        {emptyText}
      </div>
    );
  }

  // 容器样式
  const containerStyle: React.CSSProperties = {
    maxHeight,
    overflow: "auto",
  };

  return (
    <div className="code-change-set" style={containerStyle}>
      {/* 统计信息栏 */}
      {showStats && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setListCollapsed(!listCollapsed)}
              className="flex items-center gap-1 text-xs hover:bg-[var(--accent)] px-2 py-1 rounded transition-colors"
            >
              {listCollapsed ? (
                <ChevronRight className="w-3 h-3" />
              ) : (
                <ChevronDown className="w-3 h-3" />
              )}
              <span>已修改 {stats.totalFiles} 个文件</span>
            </button>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="text-green-600 dark:text-green-400">
              +{stats.totalAdditions}
            </span>
            <span className="text-red-600 dark:text-red-400">
              -{stats.totalDeletions}
            </span>
          </div>
        </div>
      )}

      {/* 主体：文件列表 + Diff 查看器 */}
      <div className="flex flex-col lg:flex-row min-h-[200px]">
        {/* 文件列表 */}
        {!listCollapsed && (
          <div className="lg:w-64 lg:border-r border-[var(--border)] overflow-auto">
            {Array.from(groups.entries()).map(([dir, dirChanges]) => {
              const isRoot = dir === "";
              const isExpanded = isRoot || expandedDirs.has(dir);

              return (
                <div key={dir || "root"}>
                  {/* 目录头（非根目录） */}
                  {!isRoot && (
                    <button
                      onClick={() => toggleDir(dir)}
                      className="w-full flex items-center gap-1.5 px-3 py-1.5 text-xs hover:bg-[var(--accent)] transition-colors"
                    >
                      {isExpanded ? (
                        <FolderOpen className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      ) : (
                        <Folder className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      )}
                      <span className="truncate text-[var(--muted-foreground)]">
                        {dir}
                      </span>
                    </button>
                  )}

                  {/* 目录下的文件 */}
                  {isExpanded &&
                    dirChanges.map((change) => {
                      const Icon = STATUS_ICONS[change.status];
                      const colorClass = STATUS_COLORS[change.status];
                      const isSelected = change.path === selectedPath;
                      const fileName = isRoot
                        ? change.path
                        : change.path.slice(dir.length + 1);

                      return (
                        <button
                          key={change.path}
                          onClick={() => handleSelect(change.path)}
                          className={cn(
                            "w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors",
                            isRoot ? "pl-3" : "pl-8",
                            isSelected
                              ? "bg-[var(--accent)] font-medium"
                              : "hover:bg-[var(--accent)]/50"
                          )}
                        >
                          <Icon className={cn("w-3.5 h-3.5 shrink-0", colorClass)} />
                          <span className="truncate flex-1">{fileName}</span>
                          <span className="flex items-center gap-1 shrink-0">
                            {change.additions > 0 && (
                              <span className="text-green-600 dark:text-green-400">
                                +{change.additions}
                              </span>
                            )}
                            {change.deletions > 0 && (
                              <span className="text-red-600 dark:text-red-400">
                                -{change.deletions}
                              </span>
                            )}
                          </span>
                        </button>
                      );
                    })}
                </div>
              );
            })}
          </div>
        )}

        {/* Diff 查看器区域 */}
        <div className="flex-1 min-w-0">
          {selectedChange ? (
            <div className="h-full">
              {/* 重命名特殊处理 */}
              {selectedChange.status === "renamed" && selectedChange.oldPath && (
                <div className="px-3 py-2 border-b border-[var(--border)] text-xs text-[var(--muted-foreground)]">
                  <span className="text-red-600 dark:text-red-400 line-through">
                    {selectedChange.oldPath}
                  </span>
                  <span className="mx-2">→</span>
                  <span className="text-green-600 dark:text-green-400">
                    {selectedChange.path}
                  </span>
                </div>
              )}

              {/* 删除文件特殊处理 */}
              {selectedChange.status === "deleted" ? (
                <div className="p-4">
                  <div className="text-xs text-red-600 dark:text-red-400 mb-2">
                    此文件已删除
                  </div>
                  {selectedChange.oldContent && (
                    <FileDiffViewer
                      oldContent={selectedChange.oldContent}
                      newContent=""
                      language={selectedChange.path.split(".").pop()}
                      fileName={selectedChange.path}
                    />
                  )}
                </div>
              ) : (
                /* 正常 Diff */
                selectedChange.oldContent !== undefined &&
                selectedChange.newContent !== undefined && (
                  <FileDiffViewer
                    oldContent={selectedChange.oldContent}
                    newContent={selectedChange.newContent}
                    language={selectedChange.path.split(".").pop()}
                    fileName={selectedChange.path}
                  />
                )
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full min-h-[150px] text-[var(--muted-foreground)] text-xs">
              选择左侧文件查看变更详情
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
