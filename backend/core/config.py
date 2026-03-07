"""
配置：从环境变量加载，无硬编码敏感信息
"""
from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict

# 项目根目录（backend/core/config.py -> 向上两级）
_PROJECT_ROOT = Path(__file__).resolve().parents[2]
_ENV_FILE = _PROJECT_ROOT / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE) if _ENV_FILE.exists() else ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    PROJECT_NAME: str = "ListingLive"
    API_V1_PREFIX: str = "/api/v1"
    DEBUG: bool = True  # 开发时默认 True，便于 500 时看到具体错误；生产请设 False

    # 数据库
    DATABASE_URL: str = "postgresql+asyncpg://listinglive:listinglive@localhost:5432/listinglive"

    @property
    def SYNC_DATABASE_URL(self) -> str:
        """同步 URL 供 Alembic 迁移使用"""
        if self.DATABASE_URL.startswith("postgresql+asyncpg://"):
            return self.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://", 1)
        return self.DATABASE_URL

    # Redis（Celery broker + 缓存）
    REDIS_URL: str = "redis://localhost:6379/0"

    # JWT
    SECRET_KEY: str = "change-me-in-production"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # 存储（短期本地）
    STORAGE_TYPE: str = "local"
    STORAGE_LOCAL_ROOT: str = "./data/storage"
    SCENE_TEMPLATE_CONFIG_PATH: str = "config/scene_templates.json"
    TRANSITION_EFFECT_CONFIG_PATH: str = "config/transition_effects.json"

    # 视频生成
    VIDEO_PROVIDER: str = "local"
    VIDEO_DEFAULT_MODEL: str = "doubao-seedance-1-0-pro-fast-251015"
    VIDEO_POLL_INTERVAL_SECONDS: int = 5
    VIDEO_MAX_POLL_SECONDS: int = 300
    VIDEO_FPS: int = 12
    VIDEO_GENERATE_TIMEOUT_SECONDS: int = 600
    VIDEO_MERGE_TIMEOUT_SECONDS: int = 900
    VIDEO_TASK_STALE_SECONDS: int = 1800
    VIDEO_EXPIRED_CLEANUP_BATCH_SIZE: int = 100
    SEEDANCE_API_KEY: str | None = None

    # 验证码
    VERIFY_CODE_EXPIRE_SECONDS: int = 300
    VERIFY_CODE_RATE_LIMIT_SECONDS: int = 60

    # 测试账号（生产应关闭）
    ENABLE_TEST_ACCOUNT: bool = True

    # Stripe
    STRIPE_SECRET_KEY: str | None = None
    STRIPE_PUBLISHABLE_KEY: str | None = None
    STRIPE_WEBHOOK_SECRET: str | None = None
    STRIPE_CURRENCY: str = "cad"
    STRIPE_CHECKOUT_SUCCESS_URL: str = "http://127.0.0.1:3001/billing/success?session_id={CHECKOUT_SESSION_ID}"
    STRIPE_CHECKOUT_CANCEL_URL: str = "http://127.0.0.1:3001/billing/cancel"
    STRIPE_BILLING_PORTAL_RETURN_URL: str = "http://127.0.0.1:3001/billing"

    # CORS
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:3001",
    ]

    @property
    def SCENE_TEMPLATE_CONFIG_FILE(self) -> Path:
        path = Path(self.SCENE_TEMPLATE_CONFIG_PATH)
        return path if path.is_absolute() else _PROJECT_ROOT / path

    @property
    def TRANSITION_EFFECT_CONFIG_FILE(self) -> Path:
        path = Path(self.TRANSITION_EFFECT_CONFIG_PATH)
        return path if path.is_absolute() else _PROJECT_ROOT / path


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
