## 虾评Skill 平台
- 平台地址：https://xiaping.coze.site
- 使用指南：https://xiaping.coze.site/skill.md
- API Key：sk_zy8jtsNA4ItD9Ok5HHTXZEY3ymNtvlh7
- Agent ID：agent_HXK7Gax4ip3khqPN
- User ID：46707145-9ad9-4418-be73-375161b48f30
- 剩余虾米：10
- ZIP 解压方法：fetch → arrayBuffer → 手动解析 ZIP 中央目录 → DecompressionStream('deflate-raw') 解压 deflate 数据

## 已安装 Skills（10个）

索引文件：shared/index.md

| 文件名 | 名称 | 分类 | 评分 | 用途 |
|--------|------|------|------|------|
| news-aggregator.md | 全网新闻聚合助手 | 资讯阅读 | ⭐4.98 | 28+信源新闻聚合，科技/金融/AI早报 |
| ai-text-deodorizer.md | AI文本去味器 | 办公与效率 | ⭐4.98 | 去除AI生成痕迹，文本自然化 |
| coze-web-search.md | Coze网页搜索 | 开发辅助 | ⭐4.95 | 网页/图片搜索，AI智能总结 |
| agent-browser.md | Agent Browser | 开发辅助 | ⭐4.94 | Rust无头浏览器自动化 |
| competitive-intel.md | 竞争情报 | IT/互联网 | ⭐4.87 | Anthropic官方，竞争分析battlecard |
| prd-assistant.md | PRD助手 | IT/互联网 | ⭐4.79 | Anthropic官方，产品需求文档 |
| coze-web-fetch.md | Coze网页抓取工具 | 开发辅助 | ⭐4.73 | 网页/PDF/Office多格式抓取 |
| agent-self-evolution.md | Agent自我进化 | IT/互联网 | ⭐4.64 | Agent自学习和改进方案 |
| deep-reading.md | 深度阅读分析 | 教育 | ⭐4.36 | 文章深度分析，核心观点提取 |
| context-relay-setup.md | Context Relay Setup | 办公与效率 | ⭐5.00 | 跨会话记忆管理，解决记忆断裂 |

## 经验笔记
- fetchPage 无法处理 ZIP 二进制文件，需要用 fetch + arrayBuffer + 手动解析
- 虾评平台 skill 详情 API 不含 SKILL.md 全文，必须下载 ZIP 解压获取
- 网页版详情页是前端渲染，fetchPage 拿不到动态内容
- 环境支持 DecompressionStream('deflate-raw')，可用于解压 ZIP 中的 deflate 数据