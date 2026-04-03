---
namespace: lark
name: doc
type: how_to_use_tool
version: 1.0.0
when: never
description: >-
  飞书云文档：创建和编辑飞书文档。从 Markdown
  创建文档、获取文档内容、更新文档（追加/覆盖/替换/插入/删除）、上传和下载文档中的图片和文件、搜索云空间文档。当用户需要创建或编辑飞书文档、读取文档内容、在文档中插入图片、搜索云空间文档时使用；如果用户是想按名称或关键词先定位电子表格、报表等云空间对象，也优先使用本
  skill 的 docs +search 做资源发现。
deps: ["lark/shared"]
examples:
  - title: 获取文档内容
    description: 使用 +fetch shortcut 获取文档的 Markdown 内容
    shell_script: |
      lark-cli docs +fetch --token doxcnxxxxxxxxx
  - title: 搜索云空间文档
    description: 按名称或关键词搜索文档、表格等云空间对象
    shell_script: |
      lark-cli docs +search --query "产品需求"
  - title: 创建新文档
    description: 使用 +create shortcut 创建新的云文档
    shell_script: |
      lark-cli docs +create --title "新文档" --markdown '# 标题\n\n内容'
common_mistakes:
  - title: Wiki 链接直接使用
    description: Wiki 链接不能直接用于文档操作，需要先用 lark/wiki 查询
    correct: |
      # 正确：先用 lark/wiki 查询获取真实 token
      lark-cli wiki spaces get_node --params '{"token":"wikcnxxxx"}'
      # 然后用返回的 obj_token
      lark-cli docs +fetch --token doxcnxxxx
    wrong: |
      # 错误：直接用 wiki_token
      lark-cli docs +fetch --token wikcnxxxx
  - title: +fetch 的 --doc 参数
    description: 新版 +fetch 使用 --token 参数，不是 --doc
    correct: |
      # 正确：使用 --token
      lark-cli docs +fetch --token doxcnxxxx
    wrong: |
      # 错误：使用旧的 --doc 参数
      lark-cli docs +fetch --doc doxcnxxxx
---
# docs (v1)

**CRITICAL — 开始前 MUST 先用 Read 工具读取 [`../shared/TRAIT.md`](../shared/TRAIT.md)，其中包含认证、权限处理**

## 核心概念

### 文档类型与 Token

飞书开放平台中，不同类型的文档有不同的 URL 格式和 Token 处理方式。在进行文档操作（如添加评论、下载文件等）时，必须先获取正确的 `file_token`。

### 文档 URL 格式与 Token 处理

| URL 格式 | 示例 | Token 类型 | 处理方式 |
|----------|------|-----------|----------|
| `/docx/` | `https://example.larksuite.com/docx/doxcnxxxxxxxxx` | `file_token` | URL 路径中的 token 直接作为 `file_token` 使用 ✅ |
| `/doc/` | `https://example.larksuite.com/doc/doccnxxxxxxxxx` | `file_token` | URL 路径中的 token 直接作为 `file_token` 使用 ✅ |
| `/wiki/` | `https://example.larksuite.com/wiki/wikcnxxxxxxxxx` | `wiki_token` | ⚠️ **不能直接使用**，需要先查询获取真实的 `obj_token` |
| `/sheets/` | `https://example.larksuite.com/sheets/shtcnxxxxxxxxx` | `file_token` | URL 路径中的 token 直接作为 `file_token` 使用 ✅ |
| `/drive/folder/` | `https://example.larksuite.com/drive/folder/fldcnxxxx` | `folder_token` | URL 路径中的 token 作为文件夹 token 使用 ✅ |

### Wiki 链接特殊处理（关键！）

知识库链接（`/wiki/TOKEN`）背后可能是云文档、电子表格、多维表格等不同类型的文档。**不能直接假设 URL 中的 token 就是 file_token**，必须先查询实际类型和真实 token。

#### 处理流程

1. **使用 `lark/wiki` trait 的 `wiki.spaces.get_node` 查询节点信息**

```bash
lark-cli wiki spaces get_node --params '{"token":"wiki_token"}'
```

2. **从返回结果中提取关键信息**
   - `node.obj_type`：文档类型（docx/doc/sheet/bitable/slides/file/mindnote）
   - `node.obj_token`：**真实的文档 token**（用于后续操作）
   - `node.title`：文档标题

3. **根据 `obj_type` 使用对应的 API**

| obj_type | 说明 | 使用的 trait |
|----------|------|-------------|
| `docx` | 新版云文档 | `lark/doc` |
| `doc` | 旧版云文档 | `lark/doc` |
| `sheet` | 电子表格 | `lark/sheets` |
| `bitable` | 多维表格 | `lark/bitable` |
| `slides` | 幻灯片 | `lark/doc` (drive API) |
| `file` | 文件 | `lark/doc` (drive API) |
| `mindnote` | 思维导图 | `lark/doc` (drive API) |

#### 查询示例

```bash
# 查询 wiki 节点
lark-cli wiki spaces get_node --params '{"token":"wikcnxxxxxxxxx"}'
```

返回结果示例：
```json
{
  "node": {
    "obj_type": "docx",
    "obj_token": "doxcnXyz123456789",
    "title": "产品需求文档",
    "node_type": "origin",
    "space_id": "12345678910"
  }
}
```

### 资源关系

```
Wiki Space (知识空间)
└── Wiki Node (知识库节点)
    ├── obj_type: docx (新版文档)
    │   └── obj_token (真实文档 token) → 使用 lark/doc trait
    ├── obj_type: doc (旧版文档)
    │   └── obj_token (真实文档 token) → 使用 lark/doc trait
    ├── obj_type: sheet (电子表格)
    │   └── obj_token (真实文档 token) → 使用 lark/sheets trait
    └── obj_type: bitable (多维表格)
        └── obj_token (真实文档 token) → 使用 lark/bitable trait

Drive Folder (云空间文件夹)
└── File (文件/文档)
    └── file_token (直接使用)
```

## Shortcuts（推荐优先使用）

Shortcut 是对常用操作的高级封装（`lark-cli docs +<verb> [flags]`）。有 Shortcut 的操作优先使用。

| Shortcut | 说明 |
|----------|------|
| `+search` | 搜索云空间文档、Wiki、电子表格等 |
| `+create` | 创建新的飞书文档 |
| `+fetch` | 获取文档内容（转为 Markdown） |
| `+update` | 更新文档内容（追加/覆盖/替换/插入/删除） |
| `+media-insert` | 在文档末尾插入本地图片或文件 |
| `+media-download` | 下载文档中的媒体或画板缩略图 |
| `+whiteboard-update` | 更新文档中的画板 |

## 完整示例

### 示例 1：获取文档内容 (+fetch)

**场景**：用户提供了一个 docx 链接，需要获取内容

```bash
# 从 URL 提取 token: doxcnXyz123456789
# URL: https://example.larksuite.com/docx/doxcnXyz123456789

# ✅ 正确：使用 +fetch
lark-cli docs +fetch --token doxcnXyz123456789
```

**输出**：文档内容转换为 Markdown 格式

### 示例 2：搜索云空间文档 (+search)

**场景**：用户说"帮我找一下产品需求文档"

```bash
# 搜索关键词
lark-cli docs +search --query "产品需求"
```

**返回结果会包含**：
- 文档（DOCX/DOC）
- 电子表格（SHEET）
- 多维表格（BITABLE）
- Wiki 节点

**注意**：`+search` 返回的结果中，`SHEET` 类型的需要切换到 `lark/sheets` trait 进行后续操作。

### 示例 3：创建新文档 (+create)

**场景**：需要创建一个新的产品文档

```bash
# 创建新文档
lark-cli docs +create --title "产品需求文档 v2.0" --markdown '
# 产品需求文档

## 1. 背景

产品需要新增以下功能...

## 2. 功能列表

- [ ] 功能 A
- [ ] 功能 B
'
```

**返回**：新创建文档的 token 和 URL

### 示例 4：更新文档 (+update)

**场景**：需要在现有文档末尾追加内容

```bash
# mode: append (追加到末尾)
lark-cli docs +update --token doxcnXyz123456789 --mode append --markdown '
## 3. 新增章节

这是新增的内容...
'
```

**可用的 mode 选项**：

| mode | 说明 |
|------|------|
| `append` | 追加到文档末尾 |
| `prepend` | 插入到文档开头 |
| `replace` | 替换整个文档 |
| `insert` | 插入到指定位置（需要 `--range`） |
| `delete` | 删除指定范围的内容（需要 `--range`） |

## 快速决策

- 用户说"找一个表格""按名称搜电子表格""找报表""最近打开的表格"，先用 `lark-cli docs +search` 做资源发现。
- `docs +search` 不是只搜文档 / Wiki；结果里会直接返回 `SHEET` 等云空间对象。
- 拿到 spreadsheet URL / token 后，再切到 `lark/sheets` 做对象内部读取、筛选、写入等操作。

## 补充说明

`docs +search` 除了搜索文档 / Wiki，也承担"先定位云空间对象，再切回对应业务 skill 操作"的资源发现入口角色；当用户口头说"表格 / 报表"时，也优先从这里开始。

## 重要说明：画板编辑

> **⚠️ lark-doc skill 不能直接编辑已有画板内容，但 `docs +update` 可以新建空白画板**

### 场景 1：已通过 docs +fetch 获取到文档内容和画板 token

如果用户已经通过 `docs +fetch` 拉取了文档内容，并且文档中已有画板（返回的 markdown 中包含 `<whiteboard token="xxx"/>` 标签），请引导用户：
1. 记录画板的 token
2. 查看 [`../whiteboard/TRAIT.md`](../whiteboard/TRAIT.md) 了解如何编辑画板内容

### 场景 2：刚创建画板，需要编辑

如果用户刚通过 `docs +update` 创建了空白画板，需要编辑时：

**步骤 1：按空白画板语法创建**
- 在 `--markdown` 中直接传 `<whiteboard type="blank"></whiteboard>`
- 需要多个空白画板时，在同一个 `--markdown` 里重复多个 whiteboard 标签

**步骤 2：从响应中记录 token**
- `docs +update` 成功后，读取响应字段 `data.board_tokens`
- `data.board_tokens` 是新建画板的 token 列表，后续编辑直接使用这里的 token

**步骤 3：引导编辑**
- 记录需要编辑的画板 token
- 查看 [`../whiteboard/TRAIT.md`](../whiteboard/TRAIT.md) 了解如何编辑画板内容

### 注意事项
- 已有画板内容无法通过 lark-doc 的 `docs +update` 直接编辑
- 编辑画板需要使用专门的 [`../whiteboard/TRAIT.md`](../whiteboard/TRAIT.md)

## 常见错误对比

### 错误 1：Wiki 链接直接使用

```bash
# ❌ 错误：直接用 wiki_token 调用 +fetch
lark-cli docs +fetch --token wikcnAbcDef

# ✅ 正确：先用 lark/wiki 查询
lark-cli wiki spaces get_node --params '{"token":"wikcnAbcDef"}'
# 假设返回 obj_token: "doxcnXyz123", obj_type: "docx"
lark-cli docs +fetch --token doxcnXyz123
```

### 错误 2：混淆 token 类型

```bash
# ❌ 错误：sheet token 用了 doc API
lark-cli docs +fetch --token shtcnXyz123  # 这是电子表格！

# ✅ 正确：
# 1. 先搜索或查询确认类型
# 2. 如果是 sheet，激活 lark/sheets trait
```

### 错误 3：+fetch 使用旧参数名

```bash
# ❌ 错误：使用旧的 --doc 参数
lark-cli docs +fetch --doc doxcnXyz123

# ✅ 正确：使用 --token 参数
lark-cli docs +fetch --token doxcnXyz123
```

### 错误 4：search 后忘记切换 trait

```toml
# ❌ 错误：搜索到 SHEET 类型后，还是用 doc API
[program]
code = """
lark-cli docs +search --query "销售报表"
# 结果返回类型是 SHEET，但继续用 docs +fetch
lark-cli docs +fetch --token shtcnXyz123  # 错误！
"""

# ✅ 正确：根据类型切换 trait
[thought]
content = """
搜索结果显示这是一个 SHEET 类型的文件，
需要激活 lark/sheets trait 进行后续操作。
"""

[cognize_stack_frame_push]
title = "读取电子表格数据"
traits = ["lark/sheets"]
```

## 决策流程

```
用户需求
    │
    ▼
是搜索/定位需求？ ──► 是 ──► docs +search ──► 检查返回的 obj_type
    │                         │
    │                         ▼
    │                    ┌─────────────────┐
    │                    │ obj_type 判断   │
    │                    ├─────────────────┤
    │                    │ DOCX/DOC ─────► lark/doc
    │                    │ SHEET ─────────► lark/sheets
    │                    │ BITABLE ───────► lark/bitable
    │                    │ WIKI ──────────► lark/wiki (再查询)
    │                    └─────────────────┘
    │
    ▼
直接操作文档？ ──► 是 ──► 检查 URL/token 格式
    │
    ├─ 是 wiki_token (wikcn 开头) ──► lark/wiki 查询
    │
    ├─ 是 docx/doc token ──► lark/doc +fetch/+update
    │
    └─ 是 sheet token ──► lark/sheets
```

## 与其他 Trait 的协作

| 场景 | 流程 |
|------|------|
| 用户提供 Wiki 链接 | `lark/wiki` (查询) → `lark/doc` 或 `lark/sheets` |
| 用户提供 docx 链接 | 直接用 `lark/doc` |
| 用户提供 sheets 链接 | 直接用 `lark/sheets` |
| 用户说"找个表格" | `lark/doc +search` → 按结果类型切换 |

**记住：先定位，再操作。定位用 `lark/doc +search`，操作按类型切换 trait。**
