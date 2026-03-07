# Stripe 落地配置清单

本文档用于把 `ListingLive` 当前已经接好的 Stripe 代码链路真正连到 Stripe 测试环境或正式环境。

## 1. 当前代码已支持的能力

- 订阅套餐 Checkout：`POST /api/v1/billing/checkout/subscription`
- 配额包 Checkout：`POST /api/v1/billing/checkout/quota-package`
- Billing Portal：`POST /api/v1/billing/customer-portal`
- Webhook：`POST /api/v1/billing/webhooks/stripe`
- 本地订阅与配额同步：`checkout.session.completed`、`customer.subscription.*`、`invoice.*`

当前缺少的是 Stripe Dashboard 中的真实配置，以及本地数据库里的 `stripe_price_id` 映射。

## 2. 先准备环境变量

在项目根目录 `.env` 中至少配置以下变量：

```env
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_CURRENCY=cad
STRIPE_CHECKOUT_SUCCESS_URL=http://127.0.0.1:3001/billing/success?session_id={CHECKOUT_SESSION_ID}
STRIPE_CHECKOUT_CANCEL_URL=http://127.0.0.1:3001/billing/cancel
STRIPE_BILLING_PORTAL_RETURN_URL=http://127.0.0.1:3001/billing
```

说明：

- `STRIPE_SECRET_KEY`：服务端调用 Stripe API 使用
- `STRIPE_PUBLISHABLE_KEY`：当前前端暂未直接使用 Stripe.js，但建议一并配置好
- `STRIPE_WEBHOOK_SECRET`：由 Stripe Dashboard 或 Stripe CLI 提供
- `STRIPE_CURRENCY`：当前建议使用 `cad`
- `*_URL`：需要和你实际前端域名保持一致

## 3. 在 Stripe Dashboard 中创建 Product 与 Price

建议采用“一个业务档位一个 Product，一个 Product 下只保留当前有效 Price”的运维方式。

### 3.1 订阅套餐

请在 Stripe 中创建以下 Product：

| 本地 plan_type | 建议 Product 名称 | 类型 | 说明 |
| --- | --- | --- | --- |
| `basic` | `ListingLive Basic` | Recurring | 月付订阅 |
| `pro` | `ListingLive Pro` | Recurring | 月付订阅 |
| `ultimate` | `ListingLive Ultimate` | Recurring | 月付订阅 |

建议的 Product metadata：

```text
app=listinglive
billing_kind=subscription
plan_type=basic|pro|ultimate
```

每个 Product 下创建一个月付 Price：

- Billing period：`Monthly`
- Currency：`CAD`
- Tax behavior：按你的税务策略选择
- Usage model：固定订阅，不要选 metered billing

### 3.2 配额包

请在 Stripe 中创建以下 Product：

| 本地 package_type | 建议 Product 名称 | 类型 | 说明 |
| --- | --- | --- | --- |
| `pack_10` | `ListingLive Credits 10` | One-time | 一次性配额包 |
| `pack_30` | `ListingLive Credits 30` | One-time | 一次性配额包 |
| `pack_50` | `ListingLive Credits 50` | One-time | 一次性配额包 |

建议的 Product metadata：

```text
app=listinglive
billing_kind=quota_package
package_type=pack_10|pack_30|pack_50
```

每个 Product 下创建一个一次性 Price：

- Price type：`One-time`
- Currency：`CAD`

说明：

- 当前业务规则里，配额包永久有效，因此 Stripe 侧不需要做周期性续费
- 配额包是否永久有效由本地业务表 `quota_packages.expires_at = NULL` 控制

## 4. Price 命名与映射约定

请把 Stripe Price 和本地类型保持一一对应：

### 订阅套餐

| 本地类型 | Stripe Price 作用 |
| --- | --- |
| `basic` | 基础版月付订阅 |
| `pro` | Pro 月付订阅 |
| `ultimate` | Ultimate 月付订阅 |

### 配额包

| 本地类型 | Stripe Price 作用 |
| --- | --- |
| `pack_10` | 10 点额度 |
| `pack_30` | 30 点额度 |
| `pack_50` | 50 点额度 |

创建完 Price 后，把返回的 `price_xxx` 写到本地映射文件，再运行同步脚本：

- 样例文件：`config/stripe_price_ids.example.json`
- 同步脚本：`scripts/billing/sync_stripe_price_ids.py`

## 5. 开启 Stripe Billing Portal

在 Stripe Dashboard 中打开 Customer Portal，并至少允许以下能力：

- 更新付款方式
- 查看账单历史
- 取消订阅
- 升级/降级订阅

建议设置：

- 允许取消：`At period end`
- 允许切换价格：开启，并只暴露当前这 3 个订阅 Price
- Return URL：指向你的前端套餐页
  - 本地开发：`http://127.0.0.1:3001/billing`
  - 生产环境：替换成真实域名

注意：

- 当前代码已经支持 Portal Session 创建
- 如果 Portal 中没有开放切换套餐，前端“管理订阅”按钮虽然能跳转，但用户无法在 Stripe 页面里更改套餐

## 6. 配置 Webhook

### 6.1 本地开发

如果使用 Stripe CLI，本地转发命令示例：

```bash
stripe listen --forward-to http://127.0.0.1:8003/api/v1/billing/webhooks/stripe
```

执行后，CLI 会输出一个 `whsec_xxx`，写入 `.env` 的 `STRIPE_WEBHOOK_SECRET`。

### 6.2 Dashboard 中的正式 endpoint

正式环境 Webhook 地址：

```text
https://your-domain.com/api/v1/billing/webhooks/stripe
```

### 6.3 必选事件

请至少订阅这些事件：

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

说明：

- `checkout.session.completed`：首购成功后把 session 与本地用户关联起来
- `customer.subscription.*`：同步订阅当前状态、套餐和周期
- `invoice.paid`：续费成功后刷新新周期配额
- `invoice.payment_failed`：续费失败后同步订阅状态

## 7. 本地数据库 Price ID 回填

创建完 Stripe Price 后，建议执行以下流程：

1. 复制样例文件：

```bash
copy config\\stripe_price_ids.example.json config\\stripe_price_ids.local.json
```

2. 把真实 `price_xxx` 填进去
3. 执行同步脚本：

```bash
python scripts\\billing\\sync_stripe_price_ids.py --config config\\stripe_price_ids.local.json
```

4. 再检查数据库中：

- `subscription_plans.stripe_price_id`
- `quota_package_plans.stripe_price_id`

## 8. 建议的最小联调顺序

按下面顺序走最稳：

1. 配置 `.env` 中的 Stripe 密钥和 URL
2. 在 Stripe 创建 Product 与 Price
3. 用同步脚本把 `stripe_price_id` 回填到本地数据库
4. 启动本地后端、前端和数据库
5. 启动 Stripe CLI 转发 webhook
6. 登录测试账号进入 `/billing`
7. 发起一次订阅 Checkout
8. 确认 webhook 成功写入 `stripe_webhook_events`
9. 确认本地 `subscriptions` 正确生成或更新
10. 发起一次配额包购买
11. 确认本地 `quota_packages` 正确增加
12. 进入 Billing Portal 测试取消和套餐切换

## 9. 接入后应该重点核对的表

### 订阅相关

- `users.stripe_customer_id`
- `subscription_plans.stripe_price_id`
- `subscriptions.subscription_plan_id`
- `subscriptions.stripe_subscription_id`
- `subscriptions.stripe_price_id`
- `subscriptions.status`
- `subscriptions.current_period_start`
- `subscriptions.current_period_end`

### 配额包相关

- `quota_package_plans.stripe_price_id`
- `quota_packages.quota_package_plan_id`
- `quota_packages.stripe_checkout_session_id`
- `quota_packages.stripe_payment_intent_id`
- `quota_packages.payment_status`

### Webhook 幂等

- `stripe_webhook_events.event_id`
- `stripe_webhook_events.processed`
- `stripe_webhook_events.error_message`

## 10. 常见问题排查

### 点击购买直接报 `billing.plan.notConfigured`

原因：

- 本地 `subscription_plans.stripe_price_id` 还是空

处理：

- 先创建 Stripe Price
- 再运行 `sync_stripe_price_ids.py`

### 点击配额包购买报 `billing.quotaPackage.notConfigured`

原因：

- 本地 `quota_package_plans.stripe_price_id` 还是空

处理：

- 同上，回填 Price ID

### Portal 能打开但不能切套餐

原因：

- Stripe Billing Portal 里未开放价格切换

处理：

- 在 Portal 配置中勾选 subscription update

### 支付成功但本地没有开通

原因通常有三类：

- `STRIPE_WEBHOOK_SECRET` 错误
- Webhook endpoint 未订阅必要事件
- Webhook 没有转发到后端

处理：

- 先检查 Stripe CLI 或 Dashboard 的 webhook 日志
- 再检查本地 `stripe_webhook_events` 表
