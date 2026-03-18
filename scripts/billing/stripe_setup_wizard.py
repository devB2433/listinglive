#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Stripe 配置交互式向导

在项目根目录执行：
    python scripts/billing/stripe_setup_wizard.py

向导会逐步引导你完成 Stripe 配置，包括：
- 获取 API 密钥
- 配置 .env
- 创建 Product 与 Price
- 配置 Webhook
- 同步 Price ID 到数据库
"""
from __future__ import annotations

import io
import json
import os
import re
import sys
import webbrowser
from pathlib import Path

# 项目根目录
ROOT = Path(__file__).resolve().parents[2]
ENV_PATH = ROOT / ".env"
EXAMPLE_ENV = ROOT / ".env.example"
STRIPE_CONFIG_EXAMPLE = ROOT / "config" / "stripe_price_ids.example.json"
STRIPE_CONFIG_LOCAL = ROOT / "config" / "stripe_price_ids.local.json"

STRIPE_KEYS = [
    "STRIPE_SECRET_KEY",
    "STRIPE_PUBLISHABLE_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_CURRENCY",
    "STRIPE_CHECKOUT_SUCCESS_URL",
    "STRIPE_CHECKOUT_CANCEL_URL",
    "STRIPE_BILLING_PORTAL_RETURN_URL",
]

STRIPE_DASHBOARD_URLS = {
    "api_keys": "https://dashboard.stripe.com/test/apikeys",
    "products": "https://dashboard.stripe.com/test/products",
    "webhooks": "https://dashboard.stripe.com/test/webhooks",
    "billing_portal": "https://dashboard.stripe.com/settings/billing/portal",
}


def clear_screen() -> None:
    os.system("cls" if os.name == "nt" else "clear")


def print_header(title: str) -> None:
    print("\n" + "=" * 60)
    print(f"  {title}")
    print("=" * 60 + "\n")


def print_step(step: int, total: int, title: str) -> None:
    print(f"\n>>> 步骤 {step}/{total}: {title}\n")


def prompt(text: str, default: str = "") -> str:
    if default:
        result = input(f"{text} [{default}]: ").strip()
        return result if result else default
    return input(f"{text}: ").strip()


def prompt_yes_no(text: str, default: bool = True) -> bool:
    suffix = " [Y/n]" if default else " [y/N]"
    result = input(f"{text}{suffix}: ").strip().lower()
    if not result:
        return default
    return result in ("y", "yes")


def open_url(url: str, description: str) -> None:
    if prompt_yes_no(f"是否在浏览器中打开 {description}？", default=True):
        webbrowser.open(url)
        input("\n完成后按 Enter 继续...")


def load_env() -> dict[str, str]:
    """读取 .env 文件为 key=value 字典"""
    result: dict[str, str] = {}
    if not ENV_PATH.exists():
        return result
    for line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            key, _, value = line.partition("=")
            result[key.strip()] = value.strip().strip('"').strip("'")
    return result


def save_env(updates: dict[str, str]) -> None:
    """更新 .env 文件中的键值"""
    if not ENV_PATH.exists() and EXAMPLE_ENV.exists():
        content = EXAMPLE_ENV.read_text(encoding="utf-8")
    elif ENV_PATH.exists():
        content = ENV_PATH.read_text(encoding="utf-8")
    else:
        content = ""

    lines = content.splitlines()
    new_lines: list[str] = []
    keys_written: set[str] = set()
    has_stripe_section = False

    for line in lines:
        if "=" in line and not line.strip().startswith("#"):
            key = line.split("=")[0].strip()
            if key.startswith("STRIPE"):
                has_stripe_section = True
            if key in updates:
                new_lines.append(f'{key}={updates[key]}')
                keys_written.add(key)
                continue
        new_lines.append(line)

    for key, value in updates.items():
        if key not in keys_written:
            if not has_stripe_section:
                new_lines.append("")
                new_lines.append("# Stripe")
                has_stripe_section = True
            new_lines.append(f'{key}={value}')

    ENV_PATH.write_text("\n".join(new_lines) + "\n", encoding="utf-8")


def is_valid_stripe_key(key: str, prefix: str) -> bool:
    return key.startswith(prefix) and len(key) > len(prefix) + 5


def step_api_keys(env: dict[str, str]) -> dict[str, str]:
    """步骤 1: 获取 API 密钥"""
    print_step(1, 6, "获取 Stripe API 密钥")

    print("1. 登录 Stripe Dashboard，确认右上角「Test mode」已开启")
    print("2. 进入 Developers → API keys")
    print("3. 复制 Publishable key (pk_test_xxx) 和 Secret key (sk_test_xxx)\n")

    open_url(STRIPE_DASHBOARD_URLS["api_keys"], "Stripe API Keys 页面")

    updates: dict[str, str] = {}

    secret = prompt("请输入 Secret key (sk_test_xxx)")
    if secret:
        if not is_valid_stripe_key(secret, "sk_test_"):
            print("  提示: Secret key 格式可能不正确，请确认以 sk_test_ 开头")
        updates["STRIPE_SECRET_KEY"] = secret

    publishable = prompt("请输入 Publishable key (pk_test_xxx)")
    if publishable:
        if not is_valid_stripe_key(publishable, "pk_test_"):
            print("  提示: Publishable key 格式可能不正确，请确认以 pk_test_ 开头")
        updates["STRIPE_PUBLISHABLE_KEY"] = publishable

    currency = prompt("货币代码 (如 cad, usd)", "cad")
    if currency:
        updates["STRIPE_CURRENCY"] = currency.lower()

    return updates


def step_env_urls(env: dict[str, str]) -> dict[str, str]:
    """步骤 2: 配置跳转 URL"""
    print_step(2, 6, "配置支付跳转 URL")

    print("用户支付成功或取消后，会跳转回你的前端页面。")
    print("本地开发通常使用 http://127.0.0.1:3001\n")

    base = prompt("前端基础 URL (如 http://127.0.0.1:3001)", "http://127.0.0.1:3001")
    base = base.rstrip("/")

    return {
        "STRIPE_CHECKOUT_SUCCESS_URL": f"{base}/billing/success?session_id={{CHECKOUT_SESSION_ID}}",
        "STRIPE_CHECKOUT_CANCEL_URL": f"{base}/billing/cancel",
        "STRIPE_BILLING_PORTAL_RETURN_URL": f"{base}/billing",
    }


def step_create_products(env: dict[str, str]) -> None:
    """步骤 3: 创建 Product 与 Price"""
    print_step(3, 6, "在 Stripe 中创建 Product 与 Price")

    print("需要创建以下内容：\n")
    print("【订阅套餐】3 个 Product，每个带 1 个月付 Price：")
    print("  - ListingLive Basic (plan_type=basic)")
    print("  - ListingLive Pro (plan_type=pro)")
    print("  - ListingLive Ultimate (plan_type=ultimate)\n")
    print("【配额包】3 个 Product，每个带 1 个一次性 Price：")
    print("  - ListingLive Credits 10 (package_type=pack_10)")
    print("  - ListingLive Credits 50 (package_type=pack_50)")
    print("  - ListingLive Credits 150 (package_type=pack_150)\n")
    print("每个 Product 创建后，在 Pricing 区域复制 Price ID (price_xxx)\n")

    open_url(STRIPE_DASHBOARD_URLS["products"], "Stripe Products 页面")

    input("\n创建完成后按 Enter 继续（Price ID 将在下一步填写）...")


def step_webhook(env: dict[str, str]) -> dict[str, str]:
    """步骤 4: 配置 Webhook"""
    print_step(4, 6, "配置 Webhook")

    print("【本地开发】使用 Stripe CLI 转发：")
    print("  stripe listen --forward-to http://127.0.0.1:8003/api/v1/billing/webhooks/stripe")
    print("  执行后会输出 whsec_xxx，复制到下方\n")
    print("【生产环境】在 Dashboard 添加 endpoint，订阅事件后获取 whsec_xxx\n")

    open_url(STRIPE_DASHBOARD_URLS["webhooks"], "Stripe Webhooks 页面")

    whsec = prompt("请输入 Webhook signing secret (whsec_xxx，可稍后配置)")
    if whsec and whsec.startswith("whsec_"):
        return {"STRIPE_WEBHOOK_SECRET": whsec}
    return {}


def step_price_ids() -> None:
    """步骤 5: 填写 Price ID 映射"""
    print_step(5, 6, "填写 Price ID 到本地配置")

    if not STRIPE_CONFIG_LOCAL.exists():
        if STRIPE_CONFIG_EXAMPLE.exists():
            STRIPE_CONFIG_LOCAL.write_text(STRIPE_CONFIG_EXAMPLE.read_text(encoding="utf-8"), encoding="utf-8")
            print(f"已从示例创建 {STRIPE_CONFIG_LOCAL.relative_to(ROOT)}\n")
        else:
            print("错误: 未找到 stripe_price_ids.example.json")
            return

    config = json.loads(STRIPE_CONFIG_LOCAL.read_text(encoding="utf-8"))

    print("请从 Stripe Dashboard → Products → 每个 Product 的 Price 详情中复制 price_xxx\n")

    for plan_type in ["basic", "pro", "ultimate"]:
        current = config.get("subscriptions", {}).get(plan_type, "")
        if "replace" in str(current).lower():
            current = ""
        val = prompt(f"  订阅 {plan_type} 的 Price ID", current)
        if val:
            config.setdefault("subscriptions", {})[plan_type] = val

    for pack_type in ["pack_10", "pack_50", "pack_150"]:
        current = config.get("quota_packages", {}).get(pack_type, "")
        if "replace" in str(current).lower():
            current = ""
        val = prompt(f"  配额包 {pack_type} 的 Price ID", current)
        if val:
            config.setdefault("quota_packages", {})[pack_type] = val

    STRIPE_CONFIG_LOCAL.write_text(json.dumps(config, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"\n已保存到 {STRIPE_CONFIG_LOCAL.relative_to(ROOT)}")


def step_sync(env: dict[str, str]) -> None:
    """步骤 6: 同步到数据库"""
    print_step(6, 6, "同步 Price ID 到数据库")

    if not STRIPE_CONFIG_LOCAL.exists():
        print("请先完成步骤 5，创建 stripe_price_ids.local.json")
        return

    if not prompt_yes_no("是否立即执行同步脚本？", default=True):
        print("\n稍后可手动执行：")
        print("  python scripts/billing/sync_stripe_price_ids.py")
        return

    import subprocess

    cmd = [sys.executable, "scripts/billing/sync_stripe_price_ids.py"]
    result = subprocess.run(cmd, cwd=str(ROOT))
    if result.returncode != 0:
        print("\n同步失败，请检查数据库连接和配置文件")
    else:
        print("\n同步成功！")


def main() -> None:
    # Windows 控制台 UTF-8 支持
    if sys.platform == "win32":
        try:
            sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
            sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8", errors="replace")
        except Exception:
            pass

    os.chdir(ROOT)

    print_header("Stripe 配置交互式向导")
    print("本向导将引导你完成 ListingLive 的 Stripe 支付配置。")
    print("请确保已注册 Stripe 账号：https://stripe.com\n")

    env = load_env()

    all_updates: dict[str, str] = {}

    # 步骤 1: API 密钥
    all_updates.update(step_api_keys(env))

    # 步骤 2: URL
    all_updates.update(step_env_urls(env))

    # 步骤 3: 创建 Product
    step_create_products(env)

    # 步骤 4: Webhook
    all_updates.update(step_webhook(env))

    # 保存 .env
    if all_updates:
        if prompt_yes_no("\n是否将上述配置写入 .env 文件？", default=True):
            save_env(all_updates)
            print(f"\n已更新 {ENV_PATH.relative_to(ROOT)}")
        else:
            print("\n请手动将以下内容添加到 .env：")
            for k, v in all_updates.items():
                print(f"  {k}={v}")

    # 步骤 5: Price ID
    step_price_ids()

    # 步骤 6: 同步
    step_sync(env)

    print_header("配置完成")
    print("建议的后续步骤：")
    print("1. 配置 Billing Portal：Settings → Billing → Customer portal")
    print("2. 启动 stripe listen（本地开发）")
    print("3. 启动项目，进入 /billing 测试购买流程")
    print("\n详细文档：doc/stripe_configuration_guide.md\n")


if __name__ == "__main__":
    main()
