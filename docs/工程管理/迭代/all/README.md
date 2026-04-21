# all/ — 完整迭代文档

> 所有 feature / bugfix 文档的**物理文件**都在这里。
> 其他目录（todo / doing / finish）仅存软链接指向本目录的文件。

## 文件命名

```
<日期>_<类型>_<短标题>.md
```

- 日期：`YYYYMMDD`
- 类型：`feature` 或 `bugfix`
- 短标题：中文或英文

## 为什么集中在 all/

**单一真相源**：
- 内容只写一次
- 改内容不用多处同步
- 状态变更 = 动软链接，不动内容

**按时间线浏览**：`ls all/` 按日期排序看历史。
**按状态浏览**：`ls todo/`、`ls doing/`、`ls finish/`。

## 添加新文档

通过 `iteration` skill：

```
/iteration feature <title> <description>
```

Skill 会：
1. 在 `all/` 下创建文档（按模板）
2. 在 `todo/` 创建软链接
3. （可选）spawn sub agent 认领
