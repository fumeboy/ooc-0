# 用例 009: 飞书文档读取

## 元信息
- 覆盖功能: lark-wiki trait + lark-doc trait，飞书 Wiki/文档读取
- 前置条件: OOC 服务器运行，.ooc/config/feishu.json 配置了有效的飞书凭证
- 优先级: P1

## 操作步骤

1. 向 supervisor 发送消息，请求分析飞书文档
```bash
curl -s -X POST http://localhost:8080/api/talk/supervisor \
  -H "Content-Type: application/json" \
  -d '{"message": "分析飞书文档 https://bytedance.larkoffice.com/wiki/UbpdwXweyi86HHkRHCCcLPN4n8c"}' \
  --max-time 300
```

2. 记录返回的 taskId，等待 flow 完成

3. 查询 Flow 详情
```bash
curl -s http://localhost:8080/api/flows/$TASK_ID
```

## 预期结果

### 阶段 1: 需求理解
- supervisor 能够识别这是一个飞书链接
- supervisor 能够区分 URL 类型（Wiki 链接 vs 直接文档链接）
- supervisor 能够激活正确的 trait（lark-wiki 和 lark-doc）

### 阶段 2: Wiki 解析
- 从 Wiki URL 中提取 wiki_token：`UbpdwXweyi86HHkRHCCcLPN4n8c`
- 调用 `wiki.spaces.get_node` 获取节点信息
- 从节点信息中提取实际文档 token（obj_token）
- 识别文档类型：docx 等

### 阶段 3: 文档读取
- 调用 `docs +fetch` 获取文档内容
- 能够解析文档结构化内容（标题、列表、表格等）

### 阶段 4: 结构化输出
- 以用户友好的方式呈现文档摘要
- 包含关键信息：标题、类型、核心内容
- 提供后续建议（如委派给其他对象处理）

## 检查点
- [ ] API 返回 success: true
- [ ] supervisor 能够识别飞书链接类型
- [ ] 正确激活 lark-wiki / lark-doc traits
- [ ] 成功调用 wiki.spaces.get_node
- [ ] 成功调用 docs +fetch
- [ ] 最终输出包含文档标题和核心内容
- [ ] flow 状态为 finished 或 waiting（不是 running/failed）
