"""
v1 路由汇总
"""
from fastapi import APIRouter

from backend.api.v1 import admin_auth, admin_dashboard, admin_security, admin_tasks, admin_users, auth, billing, invite_codes, users, videos

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["认证"])
api_router.include_router(admin_auth.router, prefix="/admin", tags=["管理员认证"])
api_router.include_router(users.router, prefix="/users", tags=["用户"])
api_router.include_router(invite_codes.router, prefix="/invite-codes", tags=["邀请码"])
api_router.include_router(invite_codes.admin_router, prefix="/admin/invite-codes", tags=["管理员邀请码"])
api_router.include_router(admin_dashboard.router, prefix="/admin/dashboard", tags=["管理员后台"])
api_router.include_router(admin_security.router, prefix="/admin/security", tags=["管理员安全"])
api_router.include_router(admin_users.router, prefix="/admin/users", tags=["管理员用户"])
api_router.include_router(admin_tasks.router, prefix="/admin/tasks", tags=["管理员任务"])
api_router.include_router(billing.router, prefix="/billing", tags=["套餐与配额"])
api_router.include_router(videos.router, prefix="/videos", tags=["视频"])

