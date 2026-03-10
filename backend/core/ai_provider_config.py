"""
AI provider TOML 配置加载。
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
import tomllib

from backend.core.config import settings

SUPPORTED_VIDEO_PROVIDERS = {"local", "seedance"}
SUPPORTED_TRANSPORTS = {"rest", "sdk"}
SUPPORTED_REQUEST_STYLES = {"prompt_flags", "structured"}


@dataclass(frozen=True)
class VideoProviderConfig:
    provider: str
    base_url: str | None
    api_key: str | None
    model_id: str | None
    transport: str = "rest"
    request_style: str = "prompt_flags"
    camera_fixed: bool = False
    watermark: bool = False
    timeout_seconds: int = 60
    download_timeout_seconds: int = 300
    default_model: str = "doubao-seedance-1-0-pro-fast-251015"

    @property
    def requires_remote_provider(self) -> bool:
        return self.provider != "local"


def _normalize_string(value: object, field_name: str) -> str:
    if not isinstance(value, str):
        raise RuntimeError(f"`video.{field_name}` 必须是字符串")
    normalized = value.strip()
    if not normalized:
        raise RuntimeError(f"`video.{field_name}` 不能为空")
    return normalized


def _read_optional_string(section: dict[str, object], field_name: str) -> str | None:
    value = section.get(field_name)
    if value is None:
        return None
    return _normalize_string(value, field_name)


def _read_required_string(section: dict[str, object], field_name: str) -> str:
    value = section.get(field_name)
    if value is None:
        raise RuntimeError(f"`video.{field_name}` 是必填项")
    return _normalize_string(value, field_name)


def _read_bool(section: dict[str, object], field_name: str, *, default: bool) -> bool:
    value = section.get(field_name, default)
    if not isinstance(value, bool):
        raise RuntimeError(f"`video.{field_name}` 必须是布尔值")
    return value


def _read_int(section: dict[str, object], field_name: str, *, default: int) -> int:
    value = section.get(field_name, default)
    if not isinstance(value, int) or isinstance(value, bool):
        raise RuntimeError(f"`video.{field_name}` 必须是整数")
    if value <= 0:
        raise RuntimeError(f"`video.{field_name}` 必须大于 0")
    return value


def _validate_choice(field_name: str, value: str, *, allowed: set[str]) -> str:
    normalized = value.lower().strip()
    if normalized not in allowed:
        allowed_list = ", ".join(sorted(allowed))
        raise RuntimeError(f"`video.{field_name}` 仅支持: {allowed_list}")
    return normalized


def _build_video_provider_config_from_section(section: dict[str, object]) -> VideoProviderConfig:
    provider = _validate_choice(
        "provider",
        _read_required_string(section, "provider"),
        allowed=SUPPORTED_VIDEO_PROVIDERS,
    )
    base_url = _read_optional_string(section, "base_url")
    api_key = _read_optional_string(section, "api_key")
    model_id = _read_optional_string(section, "model_id")
    transport = _validate_choice(
        "transport",
        _read_optional_string(section, "transport") or "rest",
        allowed=SUPPORTED_TRANSPORTS,
    )
    request_style = _validate_choice(
        "request_style",
        _read_optional_string(section, "request_style") or "prompt_flags",
        allowed=SUPPORTED_REQUEST_STYLES,
    )
    config = VideoProviderConfig(
        provider=provider,
        base_url=base_url,
        api_key=api_key,
        model_id=model_id,
        transport=transport,
        request_style=request_style,
        camera_fixed=_read_bool(section, "camera_fixed", default=False),
        watermark=_read_bool(section, "watermark", default=False),
        timeout_seconds=_read_int(section, "timeout_seconds", default=60),
        download_timeout_seconds=_read_int(section, "download_timeout_seconds", default=300),
        default_model=_read_optional_string(section, "default_model") or settings.VIDEO_DEFAULT_MODEL,
    )
    if config.requires_remote_provider:
        if not config.base_url:
            raise RuntimeError("`video.base_url` 是远端 provider 的必填项")
        if not config.api_key:
            raise RuntimeError("`video.api_key` 是远端 provider 的必填项")
        if not config.model_id:
            raise RuntimeError("`video.model_id` 是远端 provider 的必填项")
    return config


def _build_legacy_video_provider_config() -> VideoProviderConfig:
    provider = settings.VIDEO_PROVIDER.lower().strip()
    api_key = settings.ACTIVE_ARK_API_KEY or settings.SEEDANCE_API_KEY
    model_id = settings.ACTIVE_ARK_VIDEO_MODEL_ID or settings.VIDEO_DEFAULT_MODEL
    return VideoProviderConfig(
        provider=provider,
        base_url=settings.ARK_BASE_URL,
        api_key=api_key,
        model_id=model_id,
        transport=settings.ARK_TRANSPORT.lower(),
        request_style=settings.ARK_REQUEST_STYLE.lower(),
        camera_fixed=settings.ARK_CAMERA_FIXED,
        watermark=settings.ARK_PROVIDER_WATERMARK,
        timeout_seconds=settings.ARK_HTTP_TIMEOUT_SECONDS,
        download_timeout_seconds=max(
            settings.ARK_DOWNLOAD_TIMEOUT_SECONDS,
            settings.SEEDANCE_DOWNLOAD_TIMEOUT_SECONDS,
            30,
        ),
        default_model=settings.VIDEO_DEFAULT_MODEL,
    )


def load_video_provider_config(config_path: Path | None = None) -> VideoProviderConfig:
    path = config_path or settings.AI_PROVIDER_CONFIG_FILE
    if not path.exists():
        return _build_legacy_video_provider_config()
    try:
        with path.open("rb") as handle:
            payload = tomllib.load(handle)
    except tomllib.TOMLDecodeError as exc:
        raise RuntimeError(f"AI provider 配置文件解析失败: {path} ({exc})") from exc

    video_section = payload.get("video")
    if not isinstance(video_section, dict):
        raise RuntimeError(f"AI provider 配置文件缺少 `[video]` 段: {path}")
    return _build_video_provider_config_from_section(video_section)


@lru_cache
def get_video_provider_config() -> VideoProviderConfig:
    return load_video_provider_config()


def clear_video_provider_config_cache() -> None:
    get_video_provider_config.cache_clear()
