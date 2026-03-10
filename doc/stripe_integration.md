# Stripe 配置与集成说明

本文档整合 Stripe 的详细配置步骤与 ListingLive 的集成说明，包括：基础概念、正式项目接入、本地 demo（payments_test）配置、Webhook、常见问题等。

参考：[Stripe Webhooks](https://docs.stripe.com/webhooks)、[Stripe CLI](https://docs.stripe.com/stripe-cli)。

---

## 目录

1. [快速开始](#1-快速开始)
2. [Stripe 基础概念](#2-stripe-基础概念)
3. [正式项目集成](#3-正式项目集成)
4. [payments_test 本地 Demo 配置](#4-payments_test-本地-demo-配置)
5. [Webhook 配置详解](#5-webhook-配置详解)
6. [常见问题与排查](#6-常见问题与排查)
7. [附录](#7-附录)

---

## 1. 快速开始

### 1.1 交互式向导（推荐）

不熟悉 Stripe 时，可先运行向导按步骤完成配置：

```bash
python scripts/billing/stripe_setup_wizard.py
```

向导会引导：获取 API 密钥、配置 .env、创建 Product、配置 Webhook、填写 Price ID、同步数据库。

### 1.2 当前项目已支持的能力

- 订阅套餐 Checkout：`POST /api/v1/billing/checkout/subscription`
- 配额包 Checkout：`POST /api/v1/billing/checkout/quota-package`
- Billing Portal：`POST /api/v1/billing/customer-portal`
- Webhook：`POST /api/v1/billing/webhooks/stripe`
- 本地订阅与配额同步：`checkout.session.completed`、`customer.subscription.*`、`invoice.*`

当前套餐目录为：

- 订阅：`Basic (CAD 9.9 / 20 credits)`、`Pro (CAD 19.9 / 50 credits)`、`Ultimate (CAD 49.9 / 150 credits)`
- 配额包：`pack_10 (CAD 5 / 10 credits)`、`pack_50 (CAD 20 / 50 credits)`、`pack_150 (CAD 50 / 150 credits)`

---

## 2. Stripe 基础概念

### 2.1 什么是 Stripe？

Stripe 是在线支付服务商。应用通过 Stripe API 发起支付，用户跳转到 Stripe 支付页完成付款，Stripe 通过 Webhook 通知后端支付结果。

### 2.2 核心概念

| 概念 | 说明 |
|------|------|
| **Product（产品）** | 售卖项，如「订阅套餐」。一个 Product 可有多个 Price。 |
| **Price（价格）** | 具体定价，如「99 元/月」。每个 Price 绑定一个 Product，ID 形如 `price_xxx`。 |
| **Checkout Session** | 用户点击购买后生成的临时支付会话，跳转 Stripe 支付页完成付款。 |
| **Webhook** | 支付/订阅事件发生后，Stripe 向你的服务器发送 HTTP 请求，用于同步状态。 |
| **Billing Portal** | Stripe 提供的自助页，用户可管理订阅、换卡、取消等。 |
| **Payment Link** | Stripe 生成的固定支付链接（如 `https://buy.stripe.com/test_xxx`），可用于 Demo 或简单场景。 |

### 2.3 测试模式 vs 正式模式

- **测试模式**：使用 `sk_test_xxx`、`pk_test_xxx`，不会真实扣款，可用测试卡 `4242 4242 4242 4242`。
- **正式模式**：使用 `sk_live_xxx`、`pk_live_xxx`，会真实扣款。

建议先完整走通测试模式再切正式。

---

## 3. 正式项目集成

### 3.1 环境变量

在项目根目录 `.env` 中配置：

```env
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_CURRENCY=cad
STRIPE_CHECKOUT_SUCCESS_URL=http://127.0.0.1:3001/billing/success?session_id={CHECKOUT_SESSION_ID}
STRIPE_CHECKOUT_CANCEL_URL=http://127.0.0.1:3001/billing/cancel
STRIPE_BILLING_PORTAL_RETURN_URL=http://127.0.0.1:3001/billing
```

- `STRIPE_WEBHOOK_SECRET`：由 Stripe CLI（`stripe listen`）或 Dashboard Webhook 端点提供。
- 生产环境：将上述 URL 中的域名改为实际前端域名。

### 3.2 在 Stripe 中创建 Product 与 Price

当前使用 **三个订阅套餐** 和 **三个配额包**。

**订阅套餐**

1. [Stripe Dashboard → Products](https://dashboard.stripe.com/test/products) → **Add product**。
2. 分别创建：
   - `ListingLive Basic`，`CAD 9.9 / Monthly`
   - `ListingLive Pro`，`CAD 19.9 / Monthly`
   - `ListingLive Ultimate`，`CAD 49.9 / Monthly`
3. 创建后进入每个 Product，在 **Pricing** 中复制 Price ID（`price_xxx`）。

**配额包**

1. 再分别创建：
   - `ListingLive Credits 10`，`CAD 5 / One time`
   - `ListingLive Credits 50`，`CAD 20 / One time`
   - `ListingLive Credits 150`，`CAD 50 / One time`
2. 复制每个 Product 下 Price 的 `price_xxx`。

**复用 payments_test demo 的 Price**

若已在 demo 中创建过对应 Product（如 `prod_U6guOu1ErGxa1W`、`prod_U6gviiYsFJbzzA`）：

1. Dashboard → Products → 找到对应 Product。
2. 进入详情，在 **Pricing** 中复制 `price_xxx`。
3. 填入 `config/stripe_price_ids.local.json`（见下节）。

### 3.3 Price ID 映射与同步

1. 复制样例并编辑：

   ```bash
   copy config\stripe_price_ids.example.json config\stripe_price_ids.local.json
   ```

2. 在 `stripe_price_ids.local.json` 中填写完整映射。示例：

   | 套餐/包 | Price ID | Payment Link（测试） |
   |--------|----------|----------------------|
   | Basic | `price_xxx` | 在 Stripe Dashboard 中复制 |
   | Pro | `price_xxx` | 在 Stripe Dashboard 中复制 |
   | Ultimate | `price_xxx` | 在 Stripe Dashboard 中复制 |
   | pack_10 | `price_xxx` | 在 Stripe Dashboard 中复制 |
   | pack_50 | `price_xxx` | 在 Stripe Dashboard 中复制 |
   | pack_150 | `price_xxx` | 在 Stripe Dashboard 中复制 |

   ```json
   {
     "subscriptions": {
       "basic": "replace_with_basic_price_id",
       "pro": "replace_with_pro_price_id",
       "ultimate": "replace_with_ultimate_price_id"
     },
     "quota_packages": {
       "pack_10": "replace_with_pack_10_price_id",
       "pack_50": "replace_with_pack_50_price_id",
       "pack_150": "replace_with_pack_150_price_id"
     }
   }
   ```

3. 执行同步：

   ```bash
   python scripts/billing/sync_stripe_price_ids.py --config config/stripe_price_ids.local.json
   ```

4. 可选预检查：加 `--dry-run` 只打印变更不写库。

生产环境建议把文件维护在：

```text
/opt/listinglive/config/stripe_price_ids.local.json
```

生产容器里会把该目录只读挂载到 `/run/listinglive/config`，因此可直接执行：

```bash
docker compose --env-file /opt/listinglive/config/.env.prod -f docker-compose.prod.yml exec api python scripts/billing/sync_stripe_price_ids.py --config /run/listinglive/config/stripe_price_ids.local.json --dry-run
docker compose --env-file /opt/listinglive/config/.env.prod -f docker-compose.prod.yml exec api python scripts/billing/sync_stripe_price_ids.py --config /run/listinglive/config/stripe_price_ids.local.json
```

### 3.4 Billing Portal

1. Stripe Dashboard → **Settings** → **Billing** → **Customer portal**。
2. 至少开启：更新付款方式、查看账单、取消订阅。
3. 取消策略建议：**Cancel at period end**。
4. 建议开启订阅切换，便于 `Basic -> Pro -> Ultimate` 升级。
5. **Return URL**：本地 `http://127.0.0.1:3001/billing`，生产改为实际套餐页地址。

### 3.5 联调顺序建议

1. 配置 `.env` 中的 Stripe 密钥与 URL。
2. 在 Stripe 创建上述 6 个 Product 与 Price。
3. 填写 `config/stripe_price_ids.local.json` 并执行同步脚本。
4. 启动后端、前端、数据库。
5. 启动 `stripe listen --forward-to http://127.0.0.1:8003/api/v1/billing/webhooks/stripe`，将输出的 `whsec_xxx` 写入 `STRIPE_WEBHOOK_SECRET`。
6. 登录测试账号进入 `/billing`，测试订阅与配额包购买。
7. 检查 `stripe_webhook_events`、`subscriptions`、`quota_packages` 表。

### 3.6 接入后需核对的表

- **订阅**：`users.stripe_customer_id`，`subscription_plans.stripe_price_id`，`subscriptions.*`。
- **配额包**：`quota_package_plans.stripe_price_id`，`quota_packages.*`。
- **Webhook**：`stripe_webhook_events.event_id`、`processed`、`error_message`。

---

## 4. payments_test 本地 Demo 配置

`payments_test` 为独立 Demo：Payment Links + 本地 Webhook 接收，不依赖项目后端。用于快速验证「支付 → 跳转 → Webhook 事件」。

### 4.1 Stripe 账号与测试模式

1. 打开 [dashboard.stripe.com](https://dashboard.stripe.com)，登录。
2. 右上角确认 **Test mode** 已开启。

### 4.2 Payment Link 支付完成跳转

1. [Payment Links](https://dashboard.stripe.com/test/payment-links) → 选择要测试的 Link → **Edit**。
2. **After the payment** → **Redirect to a URL**。
3. 填写（端口与本地服务一致，默认 8899）：
   ```text
   http://127.0.0.1:8899/success.html?session_id={CHECKOUT_SESSION_ID}
   ```
   或 `http://localhost:8899/...`（若本机 localhost 可用）。  
   `{CHECKOUT_SESSION_ID}` 为 Stripe 占位符，付完成后会自动替换为当次 session ID。
4. 保存。对每个要测试的 Payment Link 重复配置。

### 4.3 Stripe CLI 与 Webhook 密钥

1. 安装 Stripe CLI：
   - Windows：`scoop install stripe` 或从 [Stripe CLI](https://docs.stripe.com/stripe-cli) 下载。
   - macOS：`brew install stripe/stripe-cli/stripe`。
2. 登录：`stripe login`。
3. 新开终端，执行（保持运行）：
   ```bash
   stripe listen --forward-to http://127.0.0.1:8899/webhook
   ```
4. 终端输出 `whsec_xxx`，复制到 `payments_test/webhook_secret.txt`（仅此一行）。

### 4.4 启动 Demo 服务

```bash
cd payments_test
pip install -r requirements.txt
python server.py
```

浏览器访问 http://127.0.0.1:8899，完成一笔测试支付后，在 http://127.0.0.1:8899/events.html 查看 Webhook 事件。

### 4.5 Demo 故障排查

| 现象 | 处理 |
|------|------|
| 支付后 events 页无事件 | 确认 `stripe listen` 在运行，且转发到 `http://127.0.0.1:8899/webhook`。 |
| 事件列表 500 或报错 | 确认 `webhook_secret.txt` 存在且内容为当前 `stripe listen` 输出的 `whsec_xxx`。 |
| 支付后未跳回 success | 检查 Payment Link 的「After the payment」是否已设为上列 redirect URL，端口是否为 8899。 |
| localhost 无法访问、127.0.0.1 可以 | 本机 localhost 可能解析到 IPv6；使用 `http://127.0.0.1:8899` 或改服务绑定（见 server.py）。 |

---

## 5. Webhook 配置详解

### 5.1 本地开发

Stripe 无法直接访问本机，需用 CLI 转发：

```bash
stripe listen --forward-to http://127.0.0.1:8003/api/v1/billing/webhooks/stripe
```

- `8003` 为正式项目后端端口；Demo 使用 8899 见上文。
- 将输出的 `whsec_xxx` 写入 `.env` 的 `STRIPE_WEBHOOK_SECRET`（正式项目）或 `payments_test/webhook_secret.txt`（Demo）。

### 5.2 生产环境

1. Stripe Dashboard → **Developers** → **Webhooks** → **Add endpoint**。
2. **Endpoint URL**：`https://your-domain.com/api/v1/billing/webhooks/stripe`。
3. **Select events** 至少勾选：
   - `checkout.session.completed`
   - `customer.subscription.created` / `updated` / `deleted`
   - `invoice.paid`、`invoice.payment_failed`
4. 创建后在端点详情中 **Reveal** Signing secret，将 `whsec_xxx` 填入生产环境 `STRIPE_WEBHOOK_SECRET`。

### 5.3 说明

- Webhook 为**账号级别**配置，不是按 Payment Link 配置；同一端点接收所有已选事件（包括 Payment Link 产生的 `checkout.session.completed`）。
- 需尽快返回 2xx，耗时逻辑建议异步处理；用 `event_id` 做幂等。

---

## 6. 常见问题与排查

### 6.1 点击购买报 `billing.plan.notConfigured`

- **原因**：`subscription_plans.stripe_price_id` 为空。
- **处理**：在 Stripe 创建对应 Price，并执行 `sync_stripe_price_ids.py`。

### 6.2 点击配额包购买报 `billing.quotaPackage.notConfigured`

- **原因**：`quota_package_plans.stripe_price_id` 为空。
- **处理**：同上，回填 Price ID 并同步。

### 6.3 支付成功但本地没有开通

- **原因**：多为 `STRIPE_WEBHOOK_SECRET` 错误、Webhook 未订阅事件、或本地未运行 `stripe listen`。
- **处理**：检查 Stripe CLI/Dashboard 的 Webhook 日志；检查 `stripe_webhook_events` 表及 `error_message`。

### 6.4 Portal 能打开但不能切换套餐

- **原因**：Billing Portal 中未开启「Switch plans」或未勾选对应 Price。
- **处理**：Settings → Billing → Customer portal 中开启并选择 Price（当前若仅一个订阅可暂不开放）。

### 6.5 查看 Stripe 事件

- Dashboard：Developers → Webhooks → 选择端点 → Events。
- CLI：`stripe listen` 运行时终端会实时打印事件。

---

## 7. 附录

### 7.1 测试卡号

| 卡号 | 说明 |
|------|------|
| 4242 4242 4242 4242 | 支付成功 |
| 4000 0000 0000 0002 | 支付被拒绝 |
| 4000 0025 0000 3155 | 需要 3D 验证 |

有效期填任意未来日期，CVC 任意 3 位。

### 7.2 相关表结构速查

| 表 | 关键字段 |
|----|----------|
| `users` | `stripe_customer_id` |
| `subscription_plans` | `stripe_price_id` |
| `subscriptions` | `stripe_subscription_id`, `stripe_price_id`, `status` |
| `quota_package_plans` | `stripe_price_id` |
| `quota_packages` | `stripe_checkout_session_id`, `payment_status` |
| `stripe_webhook_events` | `event_id`, `processed`, `error_message` |

### 7.3 生产环境部署检查

- [ ] 使用 `sk_live_xxx`、`pk_live_xxx`（关闭 Test mode）
- [ ] 所有 URL 已改为生产域名
- [ ] Webhook 端点已在 Dashboard 配置，并使用生产环境 `whsec_xxx`
- [ ] Billing Portal 返回 URL 为生产域名
- [ ] 在 Stripe 正式环境中创建 Product 与 Price，并重新执行 `sync_stripe_price_ids.py` 写入正式 Price ID

### 7.4 参考链接

- [Stripe Webhooks](https://docs.stripe.com/webhooks)
- [Stripe CLI](https://docs.stripe.com/stripe-cli)
- [Stripe 测试卡](https://docs.stripe.com/testing#cards)
