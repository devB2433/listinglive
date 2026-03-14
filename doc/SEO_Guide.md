# ListingLive SEO 执行指南

**项目**: ListingLive  
**目标**: 在不干扰 SaaS 核心功能迭代的前提下，尽早建立稳定的自然搜索基础  
**适用范围**: 首页、博客、公开营销页；不包含登录后产品功能页的索引优化

---

## 一、结论

ListingLive 不需要等到“所有功能都做完”再开始 SEO。

更合适的做法是：

1. **现在就完成基础 SEO**：让 Google 能发现、理解、索引公开页面。
2. **产品继续迭代**：SaaS 核心功能、付费、任务流转继续按产品优先级推进。
3. **内容与 SEO 持续积累**：博客、首页文案、专题页随着产品成熟逐步扩展。

原因很简单：

- SEO 生效通常需要时间，越早开始越能积累。
- 技术基础 SEO 的成本不高，但长期收益高。
- 登录后页面并不需要做排名，SEO 主要服务于获客层，而不是产品内部使用层。

---

## 二、当前站点现状

基于当前代码结构，和 SEO 最相关的页面/文件如下：

- 根布局：[frontend/src/app/layout.tsx](frontend/src/app/layout.tsx)
- 首页：[frontend/src/app/page.tsx](frontend/src/app/page.tsx)
- 博客列表页：[frontend/src/app/blog/page.tsx](frontend/src/app/blog/page.tsx)
- 博客详情页：[frontend/src/app/blog/[slug]/page.tsx](frontend/src/app/blog/[slug]/page.tsx)
- 博客布局：[frontend/src/app/blog/layout.tsx](frontend/src/app/blog/layout.tsx)
- 博客元数据：[frontend/src/lib/blog-posts-meta.ts](frontend/src/lib/blog-posts-meta.ts)
- 多语言文案：[frontend/src/lib/locale.ts](frontend/src/lib/locale.ts)
- Next 配置：[frontend/next.config.mjs](frontend/next.config.mjs)

当前已经具备的基础：

- 公开 URL 结构清晰：`/`、`/blog`、`/blog/[slug]`
- 博客文章为静态内容，适合被索引
- 根布局与博客页已有初步 metadata
- 已有中英文文案基础

当前明显缺口：

- 没有 `sitemap.xml`
- 没有 `robots.txt`
- 首页没有独立的 SEO metadata
- 博客详情页缺少 description
- 登录后页面和后台页面没有明确 `noindex`
- 多语言有界面切换，但没有完整的 SEO 语言策略

---

## 三、SEO 目标边界

### 应重点做 SEO 的页面

- 首页 `/`
- 博客列表 `/blog`
- 博客文章 `/blog/[slug]`
- 未来的公开营销页
  - 功能介绍页
  - 价格页
  - 面向加拿大地产经纪的专题页

### 不应作为 SEO 重点的页面

- `/dashboard`
- `/account`
- `/billing`
- `/videos/create`
- `/videos/tasks`
- `/videos/merge`
- `/admin`
- 其他所有登录后使用页

这些页面应该优先关注：

- 产品体验
- 转化率
- 留存
- 任务完成率

而不是搜索引擎排名。

---

## 四、执行原则

1. **先做技术基础，再做内容扩张**
2. **先做公开页，再处理私有页索引控制**
3. **先做品牌词与核心定位，再扩展长尾词**
4. **内容优先服务真实用户，不做关键词堆砌**
5. **SEO 不反向绑架产品设计**

---

## 五、分阶段执行计划

## 阶段 1：本周内完成的基础 SEO

### 目标

让 Google 能正确发现、抓取、理解 ListingLive 的公开页面。

### 任务 1：补齐 sitemap 与 robots

**建议改动文件**：

- 新增 `frontend/src/app/sitemap.ts`
- 新增 `frontend/src/app/robots.ts`

**执行内容**：

- 生成 `sitemap.xml`
- 包含以下页面：
  - 首页 `/`
  - 博客列表 `/blog`
  - 所有博客文章 `/blog/[slug]`
- `robots.txt` 至少包含：
  - 允许抓取公开站点
  - 指向 sitemap 地址

**原因**：

- 这是最基础、最确定有价值的技术 SEO。
- 也是让 Search Console 更快理解站点结构的前提。

### 任务 2：完善根级 metadata

**建议关注文件**：

- [frontend/src/app/layout.tsx](frontend/src/app/layout.tsx)

**执行内容**：

- 增加更完整的默认 metadata：
  - `metadataBase`
  - `title` 模板
  - `description`
  - `openGraph`
  - `twitter`

**目标效果**：

- 统一整个站点公开页面的标题规则
- 让分享链接时有更好的预览基础

### 任务 3：让首页拥有真正的首页 SEO 定位

**建议关注文件**：

- [frontend/src/app/page.tsx](frontend/src/app/page.tsx)
- [frontend/src/lib/locale.ts](frontend/src/lib/locale.ts)

**执行内容**：

- 为首页配置独立的 title 和 description
- 文案要明确回答：
  - ListingLive 是什么
  - 为谁服务
  - 核心价值是什么

**建议方向**：

- 强调加拿大地产经纪人
- 强调房源图片转动态内容
- 强调更低成本、更快产出、更易发布

### 任务 4：控制不该索引的页面

**建议关注文件**：

- [frontend/src/app/(dashboard)/layout.tsx](frontend/src/app/(dashboard)/layout.tsx)
- [frontend/src/app/admin/layout.tsx](frontend/src/app/admin/layout.tsx)
- [frontend/src/app/(auth)/login/page.tsx](frontend/src/app/(auth)/login/page.tsx)
- [frontend/src/app/(auth)/register/page.tsx](frontend/src/app/(auth)/register/page.tsx)
- [frontend/src/app/(auth)/reset-password/page.tsx](frontend/src/app/(auth)/reset-password/page.tsx)

**执行内容**：

- 为登录后区域设置 `noindex`
- 后台管理页设置 `noindex`
- 登录/注册/重置密码根据业务决定是否收录

**建议默认策略**：

- `dashboard/*`：`noindex`
- `admin/*`：`noindex`
- `reset-password`：`noindex`
- `login` / `register`：可索引，也可保守 `noindex`

如果当前品牌曝光还弱，允许 `login/register` 被品牌词搜索命中是有价值的。

---

## 阶段 2：博客 SEO 完整化

### 目标

让博客从“可访问”升级为“可被理解、可被展示、可积累自然流量”。

### 任务 1：为每篇博客补充 description

**建议关注文件**：

- [frontend/src/app/blog/[slug]/page.tsx](frontend/src/app/blog/[slug]/page.tsx)
- [frontend/src/lib/blog-posts-meta.ts](frontend/src/lib/blog-posts-meta.ts)
- [content/blog/who-i-am.md](content/blog/who-i-am.md)

**执行内容**：

- 在博客 metadata 中加入 description
- 最好不要临时截正文，而是给每篇文章维护明确摘要字段

**推荐方式**：

- 在 `blog-posts-meta.ts` 中为每篇文章增加：
  - `summary`
  - 可选 `keywords`
  - 可选 `author`

### 任务 2：为博客增加 Article 结构化数据

**建议关注文件**：

- [frontend/src/app/blog/[slug]/page.tsx](frontend/src/app/blog/[slug]/page.tsx)

**执行内容**：

- 为每篇文章输出 `Article` 或 `BlogPosting` JSON-LD
- 至少包含：
  - 标题
  - 发布时间
  - 作者
  - 描述
  - URL

**意义**：

- 提升搜索引擎对文章类型、发布时间和内容归属的理解

### 任务 3：统一博客内容格式

**建议关注文件**：

- `content/blog/*.md`

**执行内容**：

- 每篇文章保持稳定结构：
  - 标题
  - 副标题/导语
  - 分节标题
  - 结尾 CTA 或引导
- 未来新增文章时，优先围绕以下主题：
  - 加拿大地产经纪工作流
  - 房源营销效率
  - AI 内容生成在地产场景中的实用方法
  - 产品更新与真实使用价值

---

## 阶段 3：多语言 SEO 策略

### 目标

把当前“界面可切换语言”升级为“搜索引擎可理解语言版本”。

### 当前风险

- 代码里已有中英文文案，但 `<html lang="en">` 固定
- 没有 `hreflang`
- 没有明确 canonical 策略

### 任务 1：确定语言 URL 策略

在真正动手前，先做一个决策：

**方案 A：同一 URL，多语言切换**

- 优点：实现成本低
- 缺点：SEO 上不如独立语言 URL 清晰

**方案 B：语言独立 URL**

- 例如 `/en/...` 和 `/zh/...`
- 优点：更适合 SEO、hreflang 和 canonical
- 缺点：实现成本更高

**建议**：

如果短期目标是尽快上线基础 SEO，先维持 **方案 A**。  
如果中期明确要做中文/英文双搜索增长，再升级到 **方案 B**。

### 任务 2：补充语言标识

**建议关注文件**：

- [frontend/src/app/layout.tsx](frontend/src/app/layout.tsx)
- [frontend/src/lib/locale.ts](frontend/src/lib/locale.ts)

**执行内容**：

- 确保页面语言标识与实际内容一致
- 后续根据方案加：
  - `lang`
  - `hreflang`
  - `canonical`

---

## 阶段 4：内容增长与落地页扩展

### 目标

从“技术可收录”升级为“围绕目标用户建立内容资产”。

### 重点方向

围绕你的实际用户群，逐步建设内容：

- 加拿大地产经纪人如何提高内容产出效率
- 单图如何快速变成可发布素材
- 多图房源展示的最佳实践
- 如何用 AI 降低房源营销成本
- 加拿大本地经纪人 AI 工具社区理念

### 可扩展的页面类型

- 功能页
  - 短视频生成
  - 长视频合并
  - 品牌化片尾卡
- 场景页
  - 豪宅
  - 出租公寓
  - 开放看房宣传
- 人群页
  - 独立经纪人
  - 小型地产团队
  - 加拿大本地房产营销从业者

### 内容节奏建议

- 每月 2-4 篇高质量博客
- 每月更新首页和关键营销页文案一次
- 每季度新增 1-2 个专题页

---

## 阶段 5：监控、反馈与迭代

### 目标

把 SEO 从“写完即结束”变成“可观测、可迭代”。

### 任务 1：接入 Search Console

**执行内容**：

- 验证域名
- 提交 sitemap
- 定期查看：
  - 已索引页面
  - 覆盖率问题
  - 搜索查询词
  - CTR
  - 页面展示次数

### 任务 2：建立基础监控节奏

**建议每月复盘一次**：

- 首页品牌词点击量是否增长
- 博客页面是否开始出现 impressions
- 哪些文章带来真实搜索流量
- 有没有错误页面被索引
- 有没有该收录的公开页未收录

### 任务 3：用数据反推内容方向

如果 Search Console 显示某类搜索词已经有曝光，就继续扩展那类内容。  
不要一开始铺太多方向，优先放大已经有信号的主题。

---

## 六、建议的执行顺序

按投入产出比，建议按这个顺序推进：

1. `sitemap.xml` + `robots.txt`
2. 根布局 metadata 完整化
3. 首页 title / description
4. 博客详情页 description
5. 登录后页面 `noindex`
6. Search Console 接入
7. 博客结构化数据
8. 多语言 SEO 策略
9. 公开专题页与内容扩张

---

## 七、一个月内的最小可行 SEO 版本

如果只做最关键的一轮，建议完成下面这些：

- [ ] 站点有 `sitemap.xml`
- [ ] 站点有 `robots.txt`
- [ ] 首页有独立 title/description
- [ ] 博客列表页 metadata 优化
- [ ] 博客详情页有 title/description
- [ ] `dashboard` / `admin` 等页面明确 `noindex`
- [ ] Search Console 已接入
- [ ] 至少 3-5 篇可索引博客内容

做到这一步，就已经不是“没做 SEO 的 SaaS”，而是一个有基础索引能力和内容资产雏形的公开站点了。

---

## 八、暂时不要做的事

为了避免 SEO 影响主业务推进，下面这些事情不建议现在重投入：

- 不要为每个功能点同时做大量 landing page
- 不要为了关键词去堆砌内容
- 不要把私有页面公开给搜索引擎
- 不要一开始就追求复杂外链策略
- 不要为了 SEO 频繁改核心产品信息架构

---

## 九、最终建议

对于 ListingLive，SEO 最正确的位置是：

- **短期**：技术基础 + 首页 + 博客
- **中期**：围绕加拿大地产经纪人的内容体系
- **长期**：品牌词、专题词、长尾词共同增长

SEO 不应该拖慢 SaaS 的核心功能开发，但应该尽早开始，为未来的自然流量和品牌信任打地基。

---

## 十、Search Console 接入与月度复盘机制（规划）

### 10.1 Search Console 接入步骤

1. **验证站点**
   - 打开 [Google Search Console](https://search.google.com/search-console)。
   - 选择「网址前缀」或「网域」资源（推荐先使用网址前缀，如 `https://listinglive.ca`）。
   - 按提示完成验证（HTML 文件上传、HTML 标签、DNS 记录或 Google Analytics 等任选其一）。

2. **提交 Sitemap**
   - 在 Search Console 中进入「站点地图」。
   - 提交：`https://listinglive.ca/sitemap.xml`（与 [frontend/src/app/sitemap.ts](frontend/src/app/sitemap.ts) 生成地址一致）。
   - 确认生产环境已配置 `NEXT_PUBLIC_SITE_URL=https://listinglive.ca`，使 sitemap 中的 URL 为正式域名。

3. **确认 robots.txt**
   - 在「设置」或「 robots.txt 测试工具」中确认 `https://listinglive.ca/robots.txt` 可访问且内容符合预期（见 [frontend/src/app/robots.ts](frontend/src/app/robots.ts)）。

4. **初期检查**
   - 「覆盖率」：查看是否有「有效」「未编入索引」或「错误」页面，优先处理错误与重要未收录页。
   - 「网址检查」：对首页、`/blog`、一两篇博客文章做一次「请求编入索引」，加快首次收录。

### 10.2 月度 SEO 复盘机制

- **频率**：每月一次（可固定在每月第一周）。
- **数据来源**：Search Console「效果」报告（搜索展示次数、点击次数、平均 CTR、平均排名）。
- **关注指标**：
  - 品牌词（如 ListingLive、ListingLive blog）的展示与点击。
  - 博客页面的展示与点击，以及哪些文章开始获得展示。
  - 索引页面数是否与预期一致（首页、博客列表、各博客文章应被收录；dashboard/admin 等不应成为主要索引）。
- **动作**：
  - 若有新博客或重要公开页，在 Search Console 中提交 sitemap 或使用「请求编入索引」。
  - 根据「效果」中的查询词，调整后续内容方向（优先放大已有展示的主题）。
  - 记录当月的 impressions/clicks 与简单结论，便于下月对比。
- **不追求**：短期排名暴涨；在无数据前大规模铺关键词或落地页。

---

## 十一、谷歌配置与日常使用（实操指南）

下面按「你在谷歌要做什么」和「代码已经为你做了什么」对照说明，方便你直接按步骤操作。

### 11.1 代码已经为你做好的事（无需额外配置）

| 功能 | 说明 | 对应代码 |
|------|------|----------|
| **sitemap.xml** | 自动包含首页、`/blog`、所有博客文章 URL，带 `lastModified` 与 `priority` | `frontend/src/app/sitemap.ts` |
| **robots.txt** | 允许抓取 `/`，禁止抓取 `/api/`、`/dashboard/`、`/admin/`、`/account/`、`/billing/`、`/videos/` 等，并声明 sitemap 地址 | `frontend/src/app/robots.ts` |
| **全局 metadata** | 全站默认 title 模板、description、Open Graph、Twitter 卡片，分享链接有预览 | `frontend/src/app/layout.tsx`（`metadataBase`、`title`、`description` 等） |
| **首页 / 博客 SEO** | 首页、博客列表、每篇博客有独立 title 和 description | 各页的 `metadata` 或 `generateMetadata` |
| **不该被收录的页面** | dashboard、account、admin、me 等已设置 `noindex`，Google 不会把这些当重点收录 | `(dashboard)/layout.tsx`、`admin/layout.tsx`、`me/page.tsx` |
| **博客结构化数据** | 每篇博客文章页输出 Article 的 JSON-LD，便于 Google 理解类型与作者 | `frontend/src/app/blog/[slug]/page.tsx` 中的 `buildArticleJsonLd` |

生产环境只需保证 **`NEXT_PUBLIC_SITE_URL`** 正确（如 `https://listinglive.ca`），sitemap 和 metadata 里的链接就会是正式域名。  
你**不需要**在谷歌里配置 sitemap 或 robots 的「内容」——只要在 Search Console 里**提交** sitemap 的地址即可。

### 11.2 在谷歌需要做的配置（仅此一处）

所有和 Google 相关的配置都在 **Google Search Console** 完成：

1. **打开 Search Console**  
   访问：[https://search.google.com/search-console](https://search.google.com/search-console)（用你的谷歌账号登录）。

2. **添加资源（验证站点）**  
   - 点击「添加资源」。
   - 选择「网址前缀」。
   - 输入：`https://listinglive.ca`（或你的正式域名）。
   - 按页面提示选一种验证方式完成验证，例如：
     - **HTML 标签**：把提供的 `<meta>` 加到 `frontend/src/app/layout.tsx` 的 `<head>`（若用 Next 的 metadata，可用 `metadata.verification.google`）。
     - **HTML 文件上传**：下载文件放到 `frontend/public/` 后重新部署，再在 Search Console 里点验证。
     - **DNS**：若你管理域名 DNS，可添加指定 TXT 记录。

3. **提交 Sitemap（必做）**  
   - 验证通过后，左侧选「站点地图」。
   - 在「添加新的站点地图」里输入：`sitemap.xml`（或完整 URL：`https://listinglive.ca/sitemap.xml`）。
   - 提交后状态会显示「无法获取」或「成功」；等一段时间（几小时到几天）会显示已发现的 URL 数量。  
   这里提交的正是你代码里 `sitemap.ts` 动态生成的地址，无需在服务器上单独放文件。

4. **可选：确认 robots.txt**  
   - 在 Search Console 左侧「设置」或「robots.txt 测试工具」中查看 `https://listinglive.ca/robots.txt`。  
   应能看到允许 `/`、禁止上述路径、以及 `Sitemap: https://listinglive.ca/sitemap.xml`。  
   若一致，说明 `robots.ts` 在生产环境生效正常。

5. **可选：加快首次收录**  
   - 在「网址检查」里分别输入首页 `https://listinglive.ca`、`https://listinglive.ca/blog`、以及一两篇博客（如 `https://listinglive.ca/blog/who-i-am`）。
   - 对每个 URL 使用「请求编入索引」。  
   这样不必干等爬虫自然发现，适合新站上线后前几周做一次。

除此之外，**不需要**在 Google 里做其它 SEO 相关配置。  
Analytics（GA4）是另一产品，若你要做流量统计可单独配置，与 Search Console 的「收录与搜索表现」是两回事。

### 11.3 日常怎么「使用」这套 SEO

- **发新博客**  
  新文章放到 `content/blog/` 并符合 `blog-posts-meta.ts` 的约定后，重新部署。  
  - `sitemap.ts` 会从 `BLOG_POSTS` 自动把新文章加入 sitemap，无需改代码。  
  - 若想尽快被收录：上线后在 Search Console「网址检查」里对新文章 URL 做一次「请求编入索引」；或直接再提交一次 sitemap（可选）。

- **看效果与问题**  
  - **效果**：Search Console 左侧「效果」——看展示次数、点击次数、CTR、平均排名；可按页面、国家、设备等筛选。  
  - **收录**：「覆盖率」或「网页」——看哪些 URL 被索引、是否有错误或未收录。  
  - 建议每月看一次，按「十、10.2 月度 SEO 复盘机制」做简单复盘。

- **不做什么**  
  - 不需要每次发博文都在 Google 里改配置。  
  - 不需要为 sitemap/robots 在服务器上手动维护文件。  
  - 不需要在 Google 里单独「开启」Article 结构化数据——代码已输出 JSON-LD，Google 会自动识别。

### 11.4 小结

| 你在谷歌要做的事 | 频率 |
|------------------|------|
| 添加资源并验证站点 | 一次 |
| 提交 sitemap：`sitemap.xml` | 一次（之后可偶尔重新提交以刷新） |
| 可选：网址检查 + 请求编入索引（首页、博客列表、新文章） | 上线或发重要新文时 |
| 查看「效果」与「覆盖率」、做月度复盘 | 每月一次 |

代码已负责：sitemap 内容、robots 规则、各页 title/description、noindex 边界、博客 Article 结构化数据。  
你只需在 **Search Console 验证站点并提交 sitemap**，然后按需使用「网址检查」和月度复盘即可真正用上这套 SEO。
