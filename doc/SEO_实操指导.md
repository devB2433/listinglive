# SEO 实操指导

本文档只做两件事：**在谷歌要做哪些配置**、**日常怎么用这套 SEO**，以及 **博客发布时如何符合现有约定**。

---

## 一、你在谷歌需要做的配置（只有 Search Console）

所有和 Google 相关的 SEO 配置都在 **Google Search Console** 完成，无需其它产品。

### 1. 打开并添加资源

1. 打开 [Google Search Console](https://search.google.com/search-console)，用谷歌账号登录。
2. 点击「添加资源」。
3. 选择「**网址前缀**」。
4. 输入：`https://listinglive.ca`（或你的正式域名）。

### 2. 验证站点（任选一种方式）

- **HTML 标签**：Search Console 会给你一段 `<meta name="google-site-verification" content="xxx" />`。在项目里加到根布局的 metadata，例如在 `frontend/src/app/layout.tsx` 的 `metadata` 中增加：
  ```ts
  verification: { google: "这里填 content 里的那串值" },
  ```
  部署后回到 Search Console 点击「验证」。
- **HTML 文件上传**：下载 Search Console 提供的 HTML 文件，放到 `frontend/public/`，部署后在同一页面点击「验证」。
- **DNS**：若你管理域名 DNS，按提示添加指定的 TXT 记录后点击「验证」。

### 3. 提交 Sitemap（必做）

1. 验证通过后，左侧菜单选择「**站点地图**」。
2. 在「添加新的站点地图」中输入：**`sitemap.xml`**（或完整 URL：`https://listinglive.ca/sitemap.xml`）。
3. 点击「提交」。  
   这里提交的正是代码里 `frontend/src/app/sitemap.ts` 动态生成的地址，无需在服务器上单独放文件。过几小时或几天会显示已发现的 URL 数量。

### 4. 可选：确认 robots.txt

在 Search Console 的「设置」或「robots.txt 测试工具」中打开 `https://listinglive.ca/robots.txt`，应能看到允许 `/`、禁止 `/api/`、`/dashboard/`、`/admin/` 等，以及 `Sitemap: https://listinglive.ca/sitemap.xml`。一致即说明 `frontend/src/app/robots.ts` 在生产环境生效正常。

### 5. 可选：加快首次收录

在「**网址检查**」中分别输入首页、`/blog`、一两篇博客的完整 URL，对每个 URL 使用「**请求编入索引**」。适合新站上线或重要新文发布时做一次。

**除此以外，不需要在 Google 里做其它 SEO 配置。** Analytics（GA4）是另一产品，若要做流量统计可单独配置。

---

## 二、日常怎么用这套 SEO

### 发新博客时

- 新文章按下方「博客发布约定」放到 `content/blog/` 并在 `blog-posts-meta.ts` 里写好一条元数据，然后**重新部署**。
- `sitemap.ts` 会从 `BLOG_POSTS` 自动把新文章加入 sitemap，**不需要改 sitemap 代码**。
- 若希望尽快被收录：部署后在 Search Console「网址检查」里对新文章 URL 做一次「请求编入索引」；或再次提交一次 sitemap（可选）。

### 看效果与问题时

- **效果**：Search Console 左侧「效果」——查看展示次数、点击次数、CTR、平均排名；可按页面、国家、设备等筛选。
- **收录**：「覆盖率」或「网页」——看哪些 URL 被索引、是否有错误或未收录。
- 建议**每月看一次**，简单复盘：品牌词与博客页的展示/点击是否增长、是否有该收录的未收录或不该收录的被收录。

### 不需要做的事

- 不需要每次发博文都在 Google 里改配置。
- 不需要在服务器上手动维护 sitemap/robots 文件。
- 不需要在 Google 里单独「开启」Article 结构化数据——代码已输出 JSON-LD，Google 会自动识别。

### 小结表

| 你在谷歌要做的事 | 频率 |
|------------------|------|
| 添加资源并验证站点 | 一次 |
| 提交 sitemap：`sitemap.xml` | 一次（之后可偶尔重新提交以刷新） |
| 可选：网址检查 + 请求编入索引（首页、博客列表、新文章） | 上线或发重要新文时 |
| 查看「效果」与「覆盖率」、做月度复盘 | 每月一次 |

---

## 三、博客发布约定（符合现有 front matter 约定）

本站博客**不在 .md 文件里写 YAML front matter**，而是用 **`frontend/src/lib/blog-posts-meta.ts`** 维护每篇文章的元数据，正文放在 `content/blog/*.md`。发布新文需要同时做下面两件事。

### 3.1 在 `content/blog/` 下新增一篇 .md

- **位置**：`content/blog/` 目录。
- **文件名**：任意合法文件名，建议用英文、小写、连字符，例如 `my-new-post.md`。该文件名将作为下面的 `sourceFile`，必须**完全一致**。
- **内容**：直接写 Markdown 即可，无需在文件顶部写 YAML。建议第一篇标题用一级标题 `# 文章标题`，与 meta 里的 `title` 一致或接近即可；正文从第二行开始写。

示例（`content/blog/my-new-post.md`）：

```markdown
# My New Post

*一句副标题或引语。*

---

正文段落……
```

### 3.2 在 `blog-posts-meta.ts` 里增加一条元数据

- **文件**：`frontend/src/lib/blog-posts-meta.ts`。
- **在 `BLOG_POSTS` 数组里新增一个对象**，字段约定如下：

| 字段 | 必填 | 说明 |
|------|------|------|
| **slug** | ✅ | URL 片段，对应 `/blog/[slug]`，建议英文、小写、连字符，如 `my-new-post`。与文件名（去掉 .md）一致即可。 |
| **title** | ✅ | 文章标题，用于页面 title、列表展示和结构化数据。 |
| **date** | ✅ | 发布日期，格式 **YYYY-MM-DD**，如 `2026-03-15`。 |
| **sourceFile** | ✅ | 文件名，必须与 `content/blog/` 下的文件名**完全一致**，如 `my-new-post.md`。 |
| **summary** | 可选 | 短文摘要，用于 meta description 和 SEO、首页「来自博客」等；建议 1～2 句。 |
| **author** | 可选 | 作者名，用于 Article 结构化数据；不填则默认为 "ListingLive"。 |

示例（新增一篇《My New Post》）：

```ts
// 在 BLOG_POSTS 数组里增加（注意逗号）
{
  slug: "my-new-post",
  title: "My New Post",
  date: "2026-03-15",
  sourceFile: "my-new-post.md",
  summary: "一句简短摘要，用于搜索和分享预览。",
  author: "Your Name",  // 可选
},
```

- 数组已按 `date` 倒序排序（`.sort((a, b) => b.date.localeCompare(a.date))`），新加一条即可，无需自己排序。

### 3.3 怎样才算「符合约定」

- **文件**：`content/blog/<sourceFile>` 存在，且 `sourceFile` 与 meta 里写的**完全一致**（含大小写、扩展名 `.md`）。
- **meta**：在 `blog-posts-meta.ts` 的 `BLOG_POSTS` 中有且仅有一条对应记录，且 **slug、title、date、sourceFile** 均必填且格式正确（date 为 YYYY-MM-DD）。
- **结果**：部署后会出现 `/blog/<slug>` 页面，sitemap 会自动包含该 URL，且该页具备 title、description（来自 summary）和 Article 结构化数据。

### 3.4 检查清单（发布前自检）

- [ ] 已在 `content/blog/` 下创建 `*.md`，内容无误。
- [ ] 已在 `frontend/src/lib/blog-posts-meta.ts` 的 `BLOG_POSTS` 中新增一条，且 `sourceFile` 与文件名一致、`date` 为 YYYY-MM-DD。
- [ ] 如需更好 SEO，已填写 `summary`（1～2 句）。
- [ ] 部署后可在 `/blog` 列表和 `/blog/<slug>` 页正常打开；若已配置 Search Console，可选对新 URL 做一次「请求编入索引」。
