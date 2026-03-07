"""
存储抽象层：业务只依赖此接口，可切换 local / S3 实现
"""
from abc import ABC, abstractmethod
from typing import BinaryIO


class StorageBackend(ABC):
    """统一存储接口：save / get_url / delete"""

    @abstractmethod
    async def save(self, key: str, body: BinaryIO, content_type: str | None = None) -> None:
        """按 key 写入文件，key 建议带前缀如 uploads/images/xxx"""
        ...

    @abstractmethod
    def get_url(self, key: str, expires_in: int | None = None) -> str:
        """获取访问 URL；expires_in 为秒，None 表示永久（仅本地时有效）"""
        ...

    @abstractmethod
    async def delete(self, key: str) -> None:
        """按 key 删除"""
        ...

    async def exists(self, key: str) -> bool:
        """可选：存在性检查，默认可抛 NotImplementedError"""
        raise NotImplementedError
