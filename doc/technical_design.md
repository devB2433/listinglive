# 技术方案 (Technical Design)

**项目名称**: Vivid - 房地产视频生成服务  
**版本**: 1.0  
**日期**: 2026-03-05

---

## 1. 技术栈总览

### 后端
- Python 3.11+ + FastAPI
- Celery + Redis (异步任务)
- SQLAlchemy 2.0 + PostgreSQL 15+
- Stripe Python SDK (支付)
- AWS SES (邮件)

### 前端
- Next.js 14+ + React 18+ + TypeScript
- Ant Design / shadcn/ui
- Tailwind CSS
- Stripe Elements

### 基础设施
- 文件存储：短期使用服务器本地目录；抽象层兼容后续 AWS S3 + CloudFront。
- Docker + AWS ECS (容器化部署)
- Vercel (前端托管)
- Sentry (监控)

### 第三方服务
- Volcengine Seedance API (视频生成)
- Stripe (支付)

---

## 2. 系统架构



### 核心模块
1. **API服务** (FastAPI): 用户认证、任务管理、支付管理、文件上传下载、管理后台
2. **异步任务服务** (Celery): 视频生成、视频合并、邮件发送、定时任务
3. **前端服务** (Next.js): 用户界面、管理后台界面

---

## 3. 数据库设计

### 核心表结构

**users** (用户表)
- id, username (唯一), password_hash, email, email_verified, status, created_at, updated_at
- 初始测试账号：用户名 root、密码 root（种子数据或迁移创建；生产可配置关闭）

**subscriptions** (订阅表)
- id, user_id, plan_type, status, quota_per_month, quota_used, storage_days
- stripe_subscription_id, stripe_customer_id
- current_period_start, current_period_end

**quota_packages** (配额包表)
- id, user_id, package_type, quota_total, quota_used, expires_at
- stripe_payment_intent_id

**video_tasks** (视频任务表)
- id, user_id, task_type, status
- images (JSONB), resolution, aspect_ratio, logo_url
- video_url, thumbnail_url, quota_consumed
- volcengine_task_ids (JSONB), error_message, expires_at

**scene_templates** (场景模板表)
- id, name, prompt, sort_order, is_enabled

**custom_style_requests** (自定义风格请求表)
- id, user_id, description, contact_phone, status, admin_notes

**subscription_plans** (订阅计划配置表)
- id, plan_type, name, quota_per_month, price_cad, storage_days, stripe_price_id

**quota_package_plans** (配额包计划配置表)
- id, package_type, name, quota_amount, price_cad, validity_days, stripe_price_id

**system_configs** (系统配置表)
- key, value, description

**notifications** (通知表)
- id, user_id, type, title, content, is_read, related_task_id

---

## 4. API设计

### 响应格式
成功:   
失败: 

### 核心端点

**认证**:  
- POST /api/auth/send-code（注册前：邮箱 → 发邮件验证码）  
- POST /api/auth/register（用户名、密码、邮箱、验证码 → 完成注册）  
- POST /api/auth/login（用户名或邮箱 + 密码 → 返回 JWT）  
- POST /api/auth/refresh, /logout

**用户**: GET /api/user/profile, /quota, /subscription

**视频**: POST /api/videos/upload-image, /create-task  
GET /api/videos/tasks, /tasks/:id, /download/:id  
POST /api/videos/batch-download

**模板**: GET /api/templates

**订阅**: GET /api/subscriptions/plans  
POST /api/subscriptions/create, /upgrade, /cancel

**配额包**: GET /api/quota-packages/plans  
POST /api/quota-packages/purchase

**自定义风格**: POST /api/custom-styles/request

**通知**: GET /api/notifications  
PUT /api/notifications/:id/read

**管理后台**: /api/admin/users, /templates, /configs, /stats/*, /custom-styles

---

## 5. 异步任务设计

### Celery任务

**generate_video_task**: 调用Volcengine API → 轮询状态 → 下载到存储（本地/S3）→ 更新数据库 → 发送通知

**Reminder**: 正式接入 Seedance 或其他第三方视频模型时，即使对方返回成品视频 URL，也必须先由后端下载回我方存储（当前本地目录，后续可切 S3），再通过我方 `/api/v1/videos/tasks/{id}/download` 等受控接口提供给用户。不要把第三方临时链接直接透传给前端或用户。

**merge_videos_task**: 等待子视频完成 → 下载 → moviepy合并 → 添加转场和水印 → 上传至存储（本地/S3）→ 通知

**send_email_task**: 使用AWS SES发送邮件

**定时任务**:
- cleanup_expired_videos: 每天清理过期视频
- reset_monthly_quota: 每月1号重置配额
- send_expiry_reminders: 每天发送到期提醒

### 任务队列
- 高优先级: 支付回调、用户操作
- 普通队列: 视频生成、邮件发送
- 低优先级: 统计分析、清理任务

---

## 6. 文件存储方案

### 6.1 存储策略（短期与后续）

- **短期**：使用**服务器本地目录**存储所有文件（用户上传图片、生成视频、Logo 等）。通过配置指定根目录（如 `STORAGE_LOCAL_ROOT`），便于部署与备份。
- **兼容后续**：采用**存储抽象层**设计，业务代码只依赖统一接口（上传、下载、获取访问 URL、删除），不直接依赖本地路径或 S3 SDK。后续接入 S3（及可选 CloudFront）时，仅新增实现并切换配置即可，无需修改任务、下载、过期清理等业务逻辑。
- **配置**：通过 `STORAGE_TYPE=local`（当前）或 `STORAGE_TYPE=s3`（后续）切换实现；S3 时需配置 bucket、region、可选 CDN 域名等。
- **下载来源约束**：用户下载的视频必须来自我方存储，不直接使用第三方生成平台返回的临时 URL。第三方 URL 仅用于后端回收成品文件。

### 6.2 存储接口约定（抽象层）

业务侧统一使用以下能力，由具体实现（本地/S3）负责：

- **保存**：按 key 写入文件流，支持 content_type。
- **获取访问 URL**：支持过期时间（用于下载链接、signed URL）。
- **删除**：按 key 删除（用于过期清理）。
- **可选**：存在性检查、列表（若业务需要）。

### 6.3 本地存储时的目录建议

- 按类型分子目录，如：`uploads/images/`、`uploads/logos/`、`outputs/videos/`。
- key 使用随机或时间路径，避免冲突与可预测性。
- 下载：通过 API 路由读取文件并返回流，或生成临时 token 对应只读 URL。

### 6.4 后续 S3 方案（预留）

- **S3 存储结构**：bucket 内按前缀区分类型（如 `images/`、`videos/`），key 与本地方案一致便于迁移。
- **生命周期**：S3 Lifecycle Policy 按对象过期时间自动删除，或由应用定时任务清理。
- **CDN**：CloudFront 加速视频下载，存储层返回的 URL 使用 CDN 域名。

### 生命周期策略（实现层面）

- **本地存储**：由应用定时任务根据套餐 storage_days 清理过期文件。
- **S3 方案**：S3 Lifecycle Policy 自动删除过期视频；根据用户套餐设置不同过期时间。

### CDN 加速（S3 方案时）

- CloudFront 加速视频下载。

---

## 7. 支付集成方案

### Stripe集成

**订阅流程**: 选择套餐 → Stripe Checkout → 支付 → Webhook通知 → 创建订阅 → 更新配额

**配额包流程**: 选择配额包 → Stripe Payment Intent → 支付 → Webhook通知 → 创建配额包 → 更新配额

**Webhook事件**:
- checkout.session.completed: 订阅创建
- invoice.payment_succeeded: 续费成功
- invoice.payment_failed: 续费失败
- customer.subscription.updated: 订阅升级
- customer.subscription.deleted: 订阅取消
- payment_intent.succeeded: 配额包购买

### 税务处理
- Stripe Tax自动计算GST/HST
- 根据省份计算不同税率

---

## 8. 通知系统设计

### 站内通知
- 存储在notifications表
- 前端轮询或WebSocket推送
- 支持已读/未读状态

### 邮件通知
- AWS SES发送
- 邮件模板化 (HTML + 纯文本)
- Celery异步发送

### 通知类型
- 视频生成成功/失败
- 订阅续费成功/失败
- 配额即将用完
- 视频即将到期

---

## 9. 安全性设计

### 认证与授权
- JWT Token (Access: 15分钟, Refresh: 7天)
- 管理员权限验证

### 数据安全
- HTTPS加密传输
- 数据库连接加密
- 敏感信息使用环境变量

### 文件上传安全
- 文件类型验证 (MIME + 扩展名)
- 文件大小限制 (图片10MB, logo 2MB)
- 文件名随机化

### API安全
- 速率限制 (Rate Limiting)
- CORS配置
- 防止SQL注入 (ORM)
- 防止XSS (输入验证)
- 防止CSRF (SameSite Cookie)

### 支付安全
- Stripe Webhook签名验证
- 支付金额服务端验证
- 防止重复支付 (幂等性)

---

## 10. 性能优化

### 数据库优化
- 合理索引设计
- 查询优化 (避免N+1)
- 连接池配置

### 缓存策略
- Redis缓存:
  - 用户配额 (TTL: 5分钟)
  - 场景模板 (TTL: 1小时)
  - 订阅计划 (TTL: 1小时)
  - 任务状态 (实时更新)

### CDN加速
- 静态资源CDN (前端)
- 视频文件CDN (CloudFront)

### 异步处理
- 所有耗时操作异步化
- 任务队列优先级管理

---

## 11. 监控与日志

### 错误监控
- Sentry集成
- 捕获所有异常
- 错误分类和告警

### 性能监控
- API响应时间
- 数据库查询性能
- Celery任务执行时间

### 业务监控
- 视频生成成功率
- API调用成本
- 用户活跃度
- 收入指标

### 日志系统
- 结构化日志 (JSON格式)
- 日志级别: DEBUG, INFO, WARNING, ERROR
- 日志聚合 (CloudWatch / ELK)

---

## 12. 部署方案

### 容器化
- Docker + Docker Compose
- 后端: FastAPI + Celery Workers
- 数据库: PostgreSQL + Redis

### 生产环境
- **后端**: AWS ECS Fargate + Load Balancer + Auto Scaling
- **前端**: Vercel (自动部署 + 全球CDN)
- **数据库**: AWS RDS PostgreSQL (Multi-AZ)
- **Redis**: AWS ElastiCache
- **文件存储**: 短期本地目录；后续可切换为 AWS S3 (ca-central-1) + CloudFront

### CI/CD
- GitHub Actions
- 自动构建Docker镜像
- 自动部署到ECS

---

## 13. 环境配置

### 关键环境变量


---

## 14. 技术风险与应对

### Volcengine API风险
**风险**: API不稳定、限流、价格变动  
**应对**: 重试机制、监控成功率和成本、预留备用方案

### 存储成本风险
**风险**: 本地磁盘占满或后续 S3 成本随用户增长上升
**应对**: 严格生命周期策略、监控容量与成本、考虑压缩；切换 S3 时沿用相同策略

### 并发性能风险
**风险**: 高并发时性能下降  
**应对**: 负载测试、Auto Scaling、连接池优化

### 支付安全风险
**风险**: 支付欺诈、重复支付  
**应对**: Webhook签名验证、幂等性设计、完整日志

---

**文档结束**
