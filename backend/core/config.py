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
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # 存储（短期本地）
    STORAGE_TYPE: str = "local"
    STORAGE_LOCAL_ROOT: str = "./data/storage"
    AI_PROVIDER_CONFIG_PATH: str = "config/ai_provider.toml"
    SCENE_TEMPLATE_CONFIG_PATH: str = "config/scene_templates.json"
    TRANSITION_EFFECT_CONFIG_PATH: str = "config/transition_effects.json"

    # 视频任务运行时
    VIDEO_POLL_INTERVAL_SECONDS: int = 5
    VIDEO_MAX_POLL_SECONDS: int = 300
    VIDEO_FPS: int = 24
    VIDEO_GENERATE_TIMEOUT_SECONDS: int = 600
    VIDEO_MERGE_TIMEOUT_SECONDS: int = 900
    VIDEO_TASK_STALE_SECONDS: int = 1800
    VIDEO_TASK_STALE_STARTUP_SECONDS: int = 120  # 启动时用更短阈值，快速识别因重启而孤儿化的任务
    VIDEO_EXPIRED_CLEANUP_BATCH_SIZE: int = 100
    VIDEO_PROVIDER_MAX_RETRIES: int = 2
    VIDEO_PROVIDER_RETRY_BACKOFF_SECONDS: int = 5
    VIDEO_PROVIDER_CONCURRENCY_LIMIT: int = 1
    VIDEO_PROVIDER_CONCURRENCY_WAIT_SECONDS: int = 60
    VIDEO_PROVIDER_QUEUE_HEARTBEAT_SECONDS: int = 15
    VIDEO_LONG_MERGE_CONCURRENCY_LIMIT: int = 1
    VIDEO_LONG_MERGE_WAIT_SECONDS: int = 900
    VIDEO_LONG_MERGE_LOCK_TTL_SECONDS: int = 1800
    LOCAL_VIDEO_PROVIDER_DELAY_SECONDS: float = 0
    FLEX_POLL_INTERVAL_SECONDS: int = 60
    FLEX_POLL_BATCH_SIZE: int = 20
    FLEX_HARD_TIMEOUT_SECONDS: int = 7200
    FLEX_SUBMIT_STALE_SECONDS: int = 300

    # 视频 provider 旧环境变量，当前仅作为 ai_provider.toml 缺失时的兼容回退
    VIDEO_PROVIDER: str = "seedance"
    VIDEO_DEFAULT_MODEL: str = "doubao-seedance-1-0-pro-fast-251015"
    ARK_PROFILE: str = "test"
    ARK_API_KEY: str | None = None
    ARK_BASE_URL: str = "https://ark.cn-beijing.volces.com/api/v3"
    ARK_VIDEO_MODEL_ID: str | None = None
    ARK_PRODUCTION_API_KEY: str | None = None
    ARK_PRODUCTION_VIDEO_MODEL_ID: str = "ep-20260307215031-lgmpq"
    ARK_TEST_API_KEY: str | None = None
    ARK_TEST_VIDEO_MODEL_ID: str = "ep-20260307234310-k24x7"
    ARK_HTTP_TIMEOUT_SECONDS: int = 60
    ARK_TRANSPORT: str = "rest"
    ARK_REQUEST_STYLE: str = "prompt_flags"
    ARK_CAMERA_FIXED: bool = False
    ARK_PROVIDER_WATERMARK: bool = False
    SEEDANCE_API_KEY: str | None = None
    ARK_DOWNLOAD_TIMEOUT_SECONDS: int = 300
    SEEDANCE_DOWNLOAD_TIMEOUT_SECONDS: int = 300

    # 验证码
    VERIFY_CODE_EXPIRE_SECONDS: int = 300
    VERIFY_CODE_RATE_LIMIT_SECONDS: int = 60

    # 邮件发送（生产建议使用 SMTP）
    MAIL_PROVIDER: str = ""
    MAIL_FROM: str = ""
    MAIL_FROM_NAME: str = "ListingLive"
    MAIL_REPLY_TO: str | None = None
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str | None = None
    SMTP_USE_TLS: bool = True
    SMTP_USE_SSL: bool = False
    SMTP_TIMEOUT_SECONDS: int = 20

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
    STRIPE_BILLING_PORTAL_CONFIGURATION_ID: str | None = None

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
    def AI_PROVIDER_CONFIG_FILE(self) -> Path:
        path = Path(self.AI_PROVIDER_CONFIG_PATH)
        return path if path.is_absolute() else _PROJECT_ROOT / path

    @property
    def TRANSITION_EFFECT_CONFIG_FILE(self) -> Path:
        path = Path(self.TRANSITION_EFFECT_CONFIG_PATH)
        return path if path.is_absolute() else _PROJECT_ROOT / path

    @property
    def ACTIVE_ARK_API_KEY(self) -> str | None:
        if self.ARK_API_KEY:
            return self.ARK_API_KEY
        profile = self.ARK_PROFILE.lower()
        if profile == "production":
            return self.ARK_PRODUCTION_API_KEY
        if profile == "test":
            return self.ARK_TEST_API_KEY
        return None

    @property
    def ACTIVE_ARK_VIDEO_MODEL_ID(self) -> str:
        if self.ARK_VIDEO_MODEL_ID:
            return self.ARK_VIDEO_MODEL_ID
        profile = self.ARK_PROFILE.lower()
        if profile == "production":
            return self.ARK_PRODUCTION_VIDEO_MODEL_ID
        if profile == "test":
            return self.ARK_TEST_VIDEO_MODEL_ID
        return self.ARK_PRODUCTION_VIDEO_MODEL_ID


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
