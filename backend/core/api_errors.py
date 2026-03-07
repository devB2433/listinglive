"""
面向前端的统一错误类型
"""
from dataclasses import dataclass


@dataclass
class AppError(Exception):
    code: str
    status_code: int = 400

    def __str__(self) -> str:
        return self.code
