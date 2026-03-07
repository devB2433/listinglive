"""
本地目录存储实现（短期）
"""
import os
import uuid
from pathlib import Path
from typing import BinaryIO

from backend.core.config import settings
from backend.core.storage.base import StorageBackend


class LocalStorageBackend(StorageBackend):
    def __init__(self) -> None:
        self.root = Path(settings.STORAGE_LOCAL_ROOT)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        p = self.root / key
        if not p.resolve().is_relative_to(self.root.resolve()):
            raise ValueError("key must not escape root")
        return p

    async def save(self, key: str, body: BinaryIO, content_type: str | None = None) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(body.read())

    def get_url(self, key: str, expires_in: int | None = None) -> str:
        # 本地时返回路径占位，实际下载由 API 路由读文件返回；或可配置 BASE_URL 拼成直链
        return f"/api/v1/storage/file?key={key}"

    async def delete(self, key: str) -> None:
        path = self._path(key)
        if path.exists():
            path.unlink()

    async def exists(self, key: str) -> bool:
        return self._path(key).exists()

    def get_path(self, key: str) -> Path:
        """本地实现专用：供 API 读文件流"""
        return self._path(key)


def make_local_storage() -> LocalStorageBackend:
    return LocalStorageBackend()


def generate_key(prefix: str, extension: str = "") -> str:
    """生成唯一 key，避免冲突"""
    name = uuid.uuid4().hex
    if extension and not extension.startswith("."):
        extension = "." + extension
    return f"{prefix.rstrip('/')}/{name}{extension}"
