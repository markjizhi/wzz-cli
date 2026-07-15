# wzz-cli

文转赚系统的命令行发布工具，专为 AI 助手设计。零依赖，安装即用。

## 安装

告诉你的 AI 助手：

> "帮我全局安装 wzz-cli，仓库地址是 github:shulei/wzz-cli"

要求本地有 Node.js >= 12.0。

## 使用方式

安装完成后，你只需要用自然语言告诉 AI 你想做什么，它会自动完成所有操作。你不需要记住任何命令。

常见对话示例：

- "帮我登录文转赚"（首次使用，浏览器会弹出授权页面，点确认即可）
- "查一下我有哪些分类和专栏"
- "帮我把这篇文章发到文转赚"
- "把这篇文章的标题改一下重新发布"
- "看看我 Python 专栏里都有什么文章"
- "把我上次发的那篇文章导出为 Markdown"
- "帮我更新一下 wzz-cli"

## AI 调用流程

### 0. 安装与更新

```bash
npm install -g github:shulei/wzz-cli
```

安装和更新是同一条命令，重新执行即可拉取最新版本。

### 1. 登录（仅首次）

```bash
wzz login
```

会打开浏览器让用户授权，授权完成后自动保存凭据。token 有效期 7 天。

### 2. 获取分类和专栏

```bash
wzz list
```

输出所有可用的分类 ID 和专栏 ID，发布时需要用到。

### 3. 发布文章

```bash
wzz publish "/path/to/article.md" --category <分类ID> --column <专栏ID>
```

使用 `--category` 和 `--column` 参数可跳过交互式选择，实现全自动发布。

预览模式（不实际发布）：

```bash
wzz publish "/path/to/article.md" --dry-run
```

### 4. 编辑已发布文章

```bash
wzz edit "/path/to/article.md" --id <文章ID> --category <分类ID> --column <专栏ID>
```

全量替换文章内容。文章 ID 也可写在 frontmatter 的 `article_id` 字段中。

### 5. 查看专栏文章列表

```bash
wzz column <专栏ID>
```

返回该专栏下所有文章的 ID、标题、状态和更新时间。

### 6. 查看文章详情

```bash
wzz article <文章ID>
```

### 7. 导出文章为 Markdown

```bash
wzz article <文章ID> --md
```

在当前目录生成 `article_<ID>.md` 文件，包含完整 frontmatter 和正文。

## 命令速查

| 命令 | 说明 |
|------|------|
| `wzz login` | 浏览器授权登录 |
| `wzz logout` | 退出登录 |
| `wzz list` | 获取分类和专栏列表（含 ID） |
| `wzz publish <file> --category <id> --column <id>` | 非交互式发布 |
| `wzz publish <file> --dry-run` | 预览模式 |
| `wzz edit <file> --id <id> --category <id> --column <id>` | 编辑已发布文章 |
| `wzz column <id>` | 查看专栏文章列表 |
| `wzz article <id>` | 查看文章详情 |
| `wzz article <id> --md` | 导出文章为 Markdown |
| `wzz help` | 帮助信息 |

## Markdown 文件格式

```markdown
---
title: "文章标题"
category: 5
column: 12
pay_money: 9.9
status: 1
author: "作者名"
thumb: ./images/cover.jpg
article_id: 123
---

正文内容，支持**加粗**和*斜体*。

![](./images/pic1.jpg)

第二段文字。

[视频](https://example.com/video.mp4)
```

### frontmatter 字段

| 字段 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| title | 否 | 自动从正文标题或文件名推断 | 文章标题 |
| category | 否 | 发布时交互选择 | 分类 ID |
| column | 否 | 发布时交互选择 | 专栏 ID |
| pay_money | 否 | 0 | 付费金额，0 为免费 |
| status | 否 | 1 | 1 上架，0 下架 |
| author | 否 | 空 | 作者名 |
| thumb | 否 | 自动取正文第一张图 | 缩略图路径 |
| article_id | 否 | - | 文章 ID，用于 edit 命令 |

不写 frontmatter 也可以发布，工具会自动推断标题并回写 frontmatter 到文件。

### 图片处理

- 支持相对路径（相对于 Markdown 文件所在目录）和绝对路径
- 远程 URL（http/https 开头）直接使用，不会重新上传
- 本地图片自动上传到服务器
- 未指定缩略图时，自动使用正文第一张图

### 视频组件

正文中使用 `[视频](url)` 语法插入视频组件。

## 注意事项

- 路径包含空格时必须用引号包裹
- `.credentials` 文件包含登录 token，不要提交到版本控制
- token 过期后需重新执行 `wzz login`
- 建议先 `--dry-run` 预览，确认无误再正式发布
- `config.json` 中的 `site_url` 为目标站点地址
