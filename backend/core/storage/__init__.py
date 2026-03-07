# 存储抽象：base 接口 + local / s3 实现

from backend.core.storage.base import StorageBackend
from backend.core.storage.local import LocalStorageBackend, make_local_storage, generate_key

__all__ = ["StorageBackend", "LocalStorageBackend", "make_local_storage", "generate_key"]
