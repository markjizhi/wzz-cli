# 文转赚 CLI 发布工具

配合 AI 助手（如 Claude、ChatGPT 等）使用，只需告诉 AI "使用 wzz-cli 发布这篇文章"，AI 会自动调用命令完成发布。

## 安装

确保本地有 Node.js (>=12.0)，告诉你的 AI 助手执行：

```bash
npm install -g github:你的用户名/wzz-cli
```

## 使用方式

安装完成后，直接对 AI 说：

- "使用 wzz-cli 发布这篇文章，路径是 /path/to/article.md"
- "用 wzz-cli 把这个目录下的文章发到文转赚"
- "帮我登录 wzz-cli"

AI 会根据项目中的 CLAUDE.md 自动执行对应命令，无需你手动输入任何命令。

## 首次使用

第一次使用时 AI 会执行 `wzz login`，浏览器会自动打开授权页面，你只需在网页上点确认即可。

## 命令列表

| 命令 | 说明 |
|------|------|
| `wzz login` | 浏览器授权登录 |
| `wzz logout` | 退出登录 |
| `wzz list` | 查看分类和专栏列表 |
| `wzz publish <file>` | 发布文章（交互选择分类/专栏） |
| `wzz publish <file> --dry-run` | 预览模式，不实际发布 |
| `wzz publish <file> --category <id> --column <id>` | 指定分类和专栏直接发布 |
| `wzz help` | 帮助 |

## Markdown 文件格式

```markdown
---
title: "文章标题"
category: 5
column: 12
pay_money: 9.9
thumb: ./images/cover.jpg
status: 1
author: 作者名
---

正文内容，支持**加粗**和*斜体*。

![](./images/pic1.jpg)

第二段文字。
```

### frontmatter 字段

| 字段 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| title | 否 | 自动从正文标题或文件名推断 | 文章标题 |
| category | 否 | 发布时交互选择 | 分类ID |
| column | 否 | 发布时交互选择 | 专栏ID |
| pay_money | 否 | 0 | 付费金额，0为免费 |
| thumb | 否 | 自动取第一张图 | 缩略图路径 |
| status | 否 | 1 | 1上架 0下架 |
| author | 否 | 空 | 作者名 |

不写 frontmatter 也可以，发布时会交互选择分类和专栏，并自动回写到文件。

### 图片路径

- 相对路径（相对于 Markdown 文件所在目录）：`./images/pic.jpg`
- 绝对路径：`/Users/xxx/pic.jpg`
- 图片自动上传到服务器

## 注意事项

- 零依赖，不需要 `npm install`
- `.credentials` 包含登录 token，不要手动分享
- token 有效期 7 天，过期后重新 `wzz login`
