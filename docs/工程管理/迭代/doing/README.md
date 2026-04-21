# doing/ — 进行中的迭代项

> 本目录**只存软链接**，指向 `../all/` 中的文件。

## 语义

- 出现在这里 = 正在执行（已认领）
- 从这里消失 → 要么进入 `finish/`（完成），要么回到 `todo/`（搁置），要么被删除（放弃）

## 典型流转

### 认领

```bash
# 从 todo 认领
mv todo/<name>.md doing/<name>.md
# 或：
rm todo/<name>.md
ln -s ../all/<name>.md doing/<name>.md
```

### 完成

```bash
# 移到 finish
mv doing/<name>.md finish/<name>.md
```

### 搁置

```bash
# 回到 todo
mv doing/<name>.md todo/<name>.md
```

## 推荐：同时只有少量 doing

健康的节奏是 `ls doing/` 数量保持小（通常 1-3 个）。过多说明任务切换太频繁，需要收缩。
