"""
管理后台 dashboard 路由
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.deps import get_db, require_root_user
from backend.core.api_errors import AppError
from backend.models.user import User
from backend.schemas.admin import AdminDashboardDailyStatsOut, AdminDashboardSummaryOut
from backend.services.admin_dashboard_service import get_admin_dashboard_daily_stats, get_admin_dashboard_summary

router = APIRouter()


@router.get("/summary", response_model=AdminDashboardSummaryOut)
async def get_dashboard_summary(
    current_user: User = Depends(require_root_user),
    db: AsyncSession = Depends(get_db),
) -> AdminDashboardSummaryOut:
    _ = current_user
    return AdminDashboardSummaryOut(**(await get_admin_dashboard_summary(db)))


@router.get("/daily-stats", response_model=AdminDashboardDailyStatsOut)
async def get_dashboard_daily_stats(
    days: int = Query(default=30, ge=7, le=90),
    current_user: User = Depends(require_root_user),
    db: AsyncSession = Depends(get_db),
) -> AdminDashboardDailyStatsOut:
    _ = current_user
    try:
        return AdminDashboardDailyStatsOut(**(await get_admin_dashboard_daily_stats(db, days=days)))
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})
