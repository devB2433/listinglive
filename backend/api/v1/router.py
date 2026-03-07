"""
v1 路由汇总
"""
from fastapi import APIRouter

from backend.api.v1 import auth, billing, users, videos

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["认证"])
api_router.include_router(users.router, prefix="/users", tags=["用户"])
api_router.include_router(billing.router, prefix="/billing", tags=["套餐与配额"])
api_router.include_router(videos.router, prefix="/videos", tags=["视频"])

