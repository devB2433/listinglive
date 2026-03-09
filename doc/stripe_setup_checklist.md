# Stripe 落地配置清单

Stripe 的完整配置与集成说明已整合到：

**[doc/stripe_integration.md](stripe_integration.md)**

该文档包含：快速开始、正式项目集成（当前仅 99 元订阅 + 50 元配额包）、Price ID 映射与同步、Webhook、payments_test Demo 配置、常见问题与生产部署检查。

快速入口：

- 交互式向导：`python scripts/billing/stripe_setup_wizard.py`
- 同步 Price ID：`python scripts/billing/sync_stripe_price_ids.py --config config/stripe_price_ids.local.json`
