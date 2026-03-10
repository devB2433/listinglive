"""
视频相关路由
"""
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.deps import get_current_user, get_db
from backend.core.api_errors import AppError
from backend.core.scene_templates import SCENE_TEMPLATE_CATEGORY_SHORT
from backend.models.user import User
from backend.schemas.video import (
    CreateLongVideoTaskRequest,
    CreateShortVideoTaskRequest,
    SceneTemplateOut,
    UploadFileResponse,
    UploadLogoResponse,
    UserLogoOut,
    VideoTaskListItem,
    VideoTaskOut,
)
from backend.services.storage_service import get_local_path
from backend.services.entitlement_service import PermissionDeniedError
from backend.services.video_service import (
    create_long_video_task,
    create_short_video_task,
    cleanup_storage_keys_best_effort,
    delete_logo_asset,
    enqueue_video_task_or_fail,
    get_video_task_for_user,
    list_long_segments_for_task_ids,
    list_scene_templates,
    list_user_logos,
    list_video_tasks_for_user,
    retry_long_video_task,
    save_image_upload,
    set_default_logo,
    to_video_task_list_item,
    to_video_task_out,
    upload_logo_asset,
)
from backend.tasks.video import (
    process_long_video_task_job,
    process_short_video_task_job,
    submit_flex_short_video_task_job,
)

router = APIRouter()


@router.get("/scene-templates", response_model=list[SceneTemplateOut])
async def get_scene_templates(
    category: str = Query(default=SCENE_TEMPLATE_CATEGORY_SHORT),
    property_type: str | None = Query(default=None, pattern=r"^(standard_home|luxury_home|apartment_rental)$"),
    db: AsyncSession = Depends(get_db),
) -> list[SceneTemplateOut]:
    return await list_scene_templates(db, category=category, property_type=property_type)


@router.get("/logos", response_model=list[UserLogoOut])
async def get_user_logos(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[UserLogoOut]:
    return await list_user_logos(db, user.id)


@router.post("/uploads/image", response_model=UploadFileResponse)
async def upload_image(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
) -> UploadFileResponse:
    try:
        key = await save_image_upload(file, f"uploads/{user.id}/images")
        return UploadFileResponse(key=key)
    except PermissionDeniedError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/uploads/logo", response_model=UploadLogoResponse)
async def upload_logo(
    file: UploadFile = File(...),
    name: str | None = Form(default=None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UploadLogoResponse:
    try:
        return await upload_logo_asset(db, user.id, file, name)
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.delete("/logos/{logo_id}")
async def delete_logo(
    logo_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        await delete_logo_asset(db, user.id, logo_id)
        return {"message": "ok"}
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/logos/{logo_id}/default", response_model=UserLogoOut)
async def set_logo_as_default(
    logo_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserLogoOut:
    try:
        return await set_default_logo(db, user.id, logo_id)
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.post("/tasks/short", response_model=VideoTaskOut)
async def create_short_task(
    body: CreateShortVideoTaskRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VideoTaskOut:
    try:
        task = await create_short_video_task(
            db,
            user,
            image_key=body.image_key,
            scene_template_id=body.scene_template_id,
            resolution=body.resolution,
            aspect_ratio=body.aspect_ratio,
            duration_seconds=body.duration_seconds,
            logo_key=body.logo_key,
            service_tier=body.service_tier,
        )
        await db.commit()
        await db.refresh(task)
        enqueue_fn = submit_flex_short_video_task_job.delay if task.service_tier == "flex" else process_short_video_task_job.delay
        await enqueue_video_task_or_fail(db, task=task, enqueue_fn=enqueue_fn)
        return to_video_task_out(task)
    except PermissionDeniedError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/tasks/merge", response_model=VideoTaskOut)
async def create_long_task(
    body: CreateLongVideoTaskRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VideoTaskOut:
    try:
        task = await create_long_video_task(
            db,
            user,
            image_keys=body.image_keys,
            scene_template_id=body.scene_template_id,
            resolution=body.resolution,
            aspect_ratio=body.aspect_ratio,
            duration_seconds=body.duration_seconds,
            logo_key=body.logo_key,
            segments=body.segments,
            service_tier=body.service_tier,
        )
        await db.commit()
        await db.refresh(task)
        await enqueue_video_task_or_fail(db, task=task, enqueue_fn=process_long_video_task_job.delay)
        return to_video_task_out(task)
    except PermissionDeniedError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/tasks", response_model=list[VideoTaskListItem])
async def list_tasks(
    status: str | None = Query(default=None),
    task_type: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[VideoTaskListItem]:
    tasks = await list_video_tasks_for_user(db, user.id, status=status, task_type=task_type, limit=limit)
    long_task_ids = [task.id for task in tasks if task.task_type == "long"]
    segments_by_task_id = await list_long_segments_for_task_ids(db, long_task_ids)
    return [to_video_task_list_item(task, long_segments=segments_by_task_id.get(task.id)) for task in tasks]


@router.get("/tasks/{task_id}", response_model=VideoTaskOut)
async def get_task(
    task_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VideoTaskOut:
    task = await get_video_task_for_user(db, user.id, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    segments_by_task_id = await list_long_segments_for_task_ids(db, [task.id] if task.task_type == "long" else [])
    return to_video_task_out(task, long_segments=segments_by_task_id.get(task.id))


@router.post("/tasks/{task_id}/retry", response_model=VideoTaskOut)
async def retry_task(
    task_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VideoTaskOut:
    try:
        task, cleanup_keys = await retry_long_video_task(db, user_id=user.id, task_id=task_id)
        await db.commit()
        await db.refresh(task)
        await cleanup_storage_keys_best_effort(cleanup_keys)
        await enqueue_video_task_or_fail(db, task=task, enqueue_fn=process_long_video_task_job.delay)
        segments_by_task_id = await list_long_segments_for_task_ids(db, [task.id])
        return to_video_task_out(task, long_segments=segments_by_task_id.get(task.id))
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.get("/tasks/{task_id}/download")
async def download_task_video(
    task_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await get_video_task_for_user(db, user.id, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    if task.video_key is None or task.status != "succeeded":
        raise HTTPException(status_code=400, detail="视频尚未生成完成")
    if task.expires_at and task.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="视频已过期")

    path = get_local_path(task.video_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail="视频文件不存在")

    return FileResponse(path, media_type="video/mp4", filename=f"listinglive-{task_id}.mp4")
