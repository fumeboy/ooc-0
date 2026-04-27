---
namespace: library
name: lark
type: how_to_use_tool
description: 飞书/Lark 能力索引（子 trait 见本目录）
---

# library/lark

本目录作为 `library/lark/*` 子 trait 的索引入口。

## 子 Trait 列表

- `library/lark/shared`：lark-cli 认证、身份切换、权限与 scope 基础。
- `library/lark/doc`：飞书云文档（创建/读取/更新/搜索）。
- `library/lark/drive`：飞书云空间（文件夹/文件上传下载/权限/评论）。
- `library/lark/im`：飞书即时消息（收发消息、群聊管理、附件/图片）。
- `library/lark/mail`：飞书邮箱（草稿/发送/回复/搜索/附件）。
- `library/lark/calendar`：飞书日历（日程查询/创建/参会人/忙闲）。
- `library/lark/task`：飞书任务（清单/待办创建、状态更新、分配）。
- `library/lark/sheets`：飞书电子表格（创建/批量读写/导出）。
- `library/lark/base`：飞书多维表格（Base）建表/字段/记录/视图。
- `library/lark/wiki`：飞书知识库（空间/节点/层级管理）。
- `library/lark/vc`：飞书视频会议（会议记录/纪要产物检索）。
- `library/lark/minutes`：飞书妙记（总结/待办/章节/逐字稿）。
- `library/lark/event`：飞书事件订阅（WebSocket 监听消息/变更事件）。
- `library/lark/openapi-explorer`：未封装 OpenAPI 探索与调用。
- `library/lark/skill-maker`：封装自定义 lark-cli skill。
- `library/lark/whiteboard`：飞书画板/图表绘制。
- `library/lark/workflow-meeting-summary`：会议纪要汇总工作流。
- `library/lark/workflow-standup-report`：日程+待办的 standup 摘要工作流。

## 使用建议

优先阅读并使用 `library/lark/shared` 完成登录/权限/身份切换，再调用其他子 trait。
