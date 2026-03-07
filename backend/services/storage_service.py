"""
存储服务封装
"""
from functools import lru_cache
from io import BytesIO
from pathlib import Path

from backend.core.config import settings
from backend.core.storage.base import StorageBackend
from backend.core.storage.local import LocalStorageBackend, generate_key, make_local_storage


@lru_cache
def get_storage_backend() -> StorageBackend:
    if settings.STORAGE_TYPE == "local":
        return make_local_storage()
    raise RuntimeError(f"暂不支持的存储类型: {settings.STORAGE_TYPE}")


async def save_bytes(prefix: str, data: bytes, extension: str, content_type: str | None = None) -> str:
    key = make_storage_key(prefix, extension)
    await get_storage_backend().save(key, BytesIO(data), content_type)
    return key


async def ensure_key_exists(key: str) -> bool:
    return await get_storage_backend().exists(key)


async def delete_key(key: str) -> None:
    await get_storage_backend().delete(key)


def get_local_path(key: str) -> Path:
    storage = get_storage_backend()
    if not isinstance(storage, LocalStorageBackend):
        raise RuntimeError("当前存储后端不支持直接文件路径访问")
    path = storage.get_path(key)
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def make_storage_key(prefix: str, extension: str) -> str:
    return generate_key(prefix, extension)


def list_local_keys(prefix: str) -> list[str]:
    storage = get_storage_backend()
    if not isinstance(storage, LocalStorageBackend):
        raise RuntimeError("当前存储后端不支持目录遍历")

    root = storage.root / prefix
    if not root.exists():
        return []

    keys: list[str] = []
    for path in root.rglob("*"):
        if path.is_file():
            keys.append(path.relative_to(storage.root).as_posix())
    keys.sort(reverse=True)
    return keys
