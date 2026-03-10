"""
管理后台任务路由
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.deps import get_db, require_root_user
from backend.core.api_errors import AppError
from backend.models.user import User
from backend.schemas.admin import AdminTaskDetailOut, AdminTaskListItemOut, AdminTaskListOut
from backend.services.admin_task_service import get_admin_task_or_404, list_admin_tasks

router = APIRouter()


@router.get("", response_model=AdminTaskListOut)
async def get_admin_tasks(
    query: str | None = Query(default=None),
    status: str | None = Query(default=None),
    task_type: str | None = Query(default=None),
    service_tier: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    current_user: User = Depends(require_root_user),
    db: AsyncSession = Depends(get_db),
) -> AdminTaskListOut:
    _ = current_user
    result = await list_admin_tasks(
        db,
        query=query,
        status=status,
        task_type=task_type,
        service_tier=service_tier,
        page=page,
        page_size=page_size,
    )
    return AdminTaskListOut(
        items=[AdminTaskListItemOut(**item) for item in result["items"]],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
    )


@router.get("/{task_id}", response_model=AdminTaskDetailOut)
async def get_admin_task(
    task_id: UUID,
    current_user: User = Depends(require_root_user),
    db: AsyncSession = Depends(get_db),
) -> AdminTaskDetailOut:
    _ = current_user
    try:
        return AdminTaskDetailOut(**(await get_admin_task_or_404(db, task_id)))
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})
