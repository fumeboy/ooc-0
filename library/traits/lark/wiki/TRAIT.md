---
name: lark/wiki
type: how_to_use_tool
version: 1.0.0
when: never
description: >-
  飞书知识库：管理知识空间和文档节点。创建和查询知识空间、管理节点层级结构、在知识库中组织文档和快捷方式。当用户需要在知识库中查找或创建文档、浏览知识空间结构、移动或复制节点时使用。
deps: ["lark/shared"]
examples:
  - title: 查询 wiki 节点信息
    description: 从 wiki 链接获取真实的文档类型和 token
    shell_script: |
      lark-cli wiki spaces get_node --params '{"token":"wikcnxxxxxxxxx"}'
common_mistakes:
  - title: 直接使用 wiki_token 作为 file_token
    description: Wiki 链接的 token 不能直接用于文档操作，需要先查询
    correct: |
      # 正确：先查询获取真实的 obj_token
      lark-cli wiki spaces get_node --params '{"token":"wikcnxxxx"}'
      # 从返回结果中提取 node.obj_token
    wrong: |
      # 错误：直接用 wiki_token 调用文档 API
      lark-cli docs +fetch --token wikcnxxxx
---
# wiki (v2)

**CRITICAL — 开始前 MUST 先用 Read 工具读取 [`../shared/TRAIT.md`](../shared/TRAIT.md)，其中包含认证、权限处理**

## 快速开始

### 最常用场景：解析 Wiki 链接

当用户提供了一个 Wiki 链接时，**不能直接假设 URL 中的 token 就是 file_token**。

Wiki 链接格式：`https://example.larksuite.com/wiki/wikcnxxxxxxxxx`

**正确的处理流程：**

1. **从 URL 中提取 wiki_token**
   - 从路径中提取 `wikcnxxxxxxxxx` 部分

2. **调用 `wiki.spaces.get_node` 查询节点信息**

```bash
lark-cli wiki spaces get_node --params '{"token":"wikcnxxxxxxxxx"}'
```

3. **从返回结果中提取关键信息**

返回结果示例：
```json
{
  "node": {
    "obj_type": "docx",
    "obj_token": "doxcnxxxxxxxxx",
    "title": "文档标题",
    "node_type": "origin",
    "space_id": "12345678910"
  }
}
```

4. **根据 `obj_type` 使用对应的 API**

| obj_type | 说明 | 使用的 trait |
|----------|------|-------------|
| `docx` | 新版云文档 | `lark/doc` |
| `doc` | 旧版云文档 | `lark/doc` |
| `sheet` | 电子表格 | `lark/sheets` |
| `bitable` | 多维表格 | `lark/bitable` |
| `slides` | 幻灯片 | `lark/doc` (drive API) |
| `file` | 文件 | `lark/doc` (drive API) |
| `mindnote` | 思维导图 | `lark/doc` (drive API) |

## API Resources

```bash
lark-cli schema wiki.<resource>.<method>   # 调用 API 前必须先查看参数结构
lark-cli wiki <resource> <method> [flags] # 调用 API
```

> **重要**：使用原生 API 时，必须先运行 `schema` 查看 `--data` / `--params` 参数结构，不要猜测字段格式。

### spaces

- `get_node` — 获取知识空间节点信息

## 权限表

| 方法 | 所需 scope |
|------|-----------|
| `spaces.get_node` | `wiki:node:read` |

## 完整示例

### 示例 1：用户提供 Wiki 链接，需要获取文档内容

**用户输入：**
```
请帮我分析这个飞书文档：https://example.larksuite.com/wiki/wikcnAbcDefGhiJkl
```

**处理步骤：**

```toml
[thought]
content = """
用户提供了一个 Wiki 链接。我需要：
1. 从 URL 提取 wiki_token: wikcnAbcDefGhiJkl
2. 调用 wiki.spaces.get_node 查询节点信息
3. 根据返回的 obj_type 和 obj_token 调用对应 API
"""

[program]
lang = "shell"
code = """
lark-cli wiki spaces get_node --params '{"token":"wikcnAbcDefGhiJkl"}'
"""
```

**假设返回结果：**
```json
{
  "node": {
    "obj_type": "docx",
    "obj_token": "doxcnXyz123456789",
    "title": "产品需求文档"
  }
}
```

**继续处理：**

```toml
[thought]
content = """
查询结果显示这是一个 docx 类型的文档，obj_token 是 doxcnXyz123456789。
现在需要激活 lark/doc trait，使用 +fetch 获取文档内容。
"""

[cognize_stack_frame_push]
title = "获取文档内容"
traits = ["lark/doc"]
```

### 示例 2：不同 URL 类型的处理方式

| URL 格式 | token 类型 | 处理方式 |
|----------|-----------|----------|
| `/wiki/wikcnxxx` | wiki_token | ⚠️ 必须先调用 `wiki.spaces.get_node` |
| `/docx/doxcnxxx` | file_token | ✅ 直接使用 `lark/doc +fetch` |
| `/doc/doccnxxx` | file_token | ✅ 直接使用 `lark/doc +fetch` |
| `/sheets/shtcnxxx` | file_token | ✅ 直接使用 `lark/sheets` |

## 常见错误对比

### 错误 1：直接使用 wiki_token 调用文档 API

```bash
# ❌ 错误：Wiki token 不能直接用于文档操作
lark-cli docs +fetch --token wikcnAbcDef

# ✅ 正确：先查询获取真实的 obj_token
lark-cli wiki spaces get_node --params '{"token":"wikcnAbcDef"}'
# 然后用返回的 obj_token 调用对应 API
```

### 错误 2：忘记检查 obj_type

```bash
# ❌ 错误：假设所有 wiki 链接背后都是 docx
lark-cli wiki spaces get_node --params '{"token":"wikcnxxx"}'
# 返回 obj_type: "sheet"，但还是用 doc API

# ✅ 正确：根据 obj_type 选择对应的 trait
# obj_type: "docx" → activateTrait("lark/doc")
# obj_type: "sheet" → activateTrait("lark/sheets")
# obj_type: "bitable" → activateTrait("lark/bitable")
```

### 错误 3：--params 参数格式错误

```bash
# ❌ 错误：参数不是有效的 JSON
lark-cli wiki spaces get_node --params '{token:"wikcnxxx"}'  # 缺少引号

# ✅ 正确：必须是有效的 JSON
lark-cli wiki spaces get_node --params '{"token":"wikcnxxx"}'
```

## 决策流程

```
用户提供链接
    │
    ▼
提取 URL 中的 token
    │
    ▼
判断 token 类型
    ├─ wiki_token (wikcn 开头) ──► 调用 wiki.spaces.get_node
    │                                    │
    │                                    ▼
    │                              提取 obj_type, obj_token
    │                                    │
    │                                    ▼
    │                              根据 obj_type 选择 trait
    │
    ├─ file_token (doxcn/doccn/shtcn 等) ──► 直接用对应 trait
    │
    └─ 其他 ──► 参考 lark/doc 的 URL 格式表
```

## 与其他 Trait 的协作

| 场景 | 流程 |
|------|------|
| 用户提供 Wiki 链接 | `lark/wiki` (查询) → `lark/doc` 或 `lark/sheets` (操作) |
| 用户提供 docx 链接 | 直接用 `lark/doc` |
| 用户提供 sheets 链接 | 直接用 `lark/sheets` |

**记住：Wiki trait 只用于"解析 Wiki 链接"，实际的文档操作需要切换到对应的 trait。**
