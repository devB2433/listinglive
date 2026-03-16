"""
视频相关路由
"""
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.deps import get_current_user, get_db
from backend.core.api_errors import AppError
from backend.core.scene_templates import SCENE_TEMPLATE_CATEGORY_SHORT
from backend.models.user import User
from backend.schemas.video import (
    CreateLongVideoTaskRequest,
    CreateShortVideoTaskRequest,
    ProfileCardOut,
    RenameLogoRequest,
    SceneTemplateOut,
    UploadFileResponse,
    UploadAvatarResponse,
    UploadLogoResponse,
    UpsertProfileCardRequest,
    UserAvatarOut,
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
    delete_avatar_asset,
    delete_logo_asset,
    delete_profile_card,
    enqueue_video_task_or_fail,
    generate_profile_card_preview_png_from_request,
    generate_profile_card_preview_png,
    get_user_avatar_asset,
    get_user_logo_asset,
    get_video_task_for_user,
    list_long_segments_for_task_ids,
    list_profile_cards,
    list_scene_templates,
    list_user_avatars,
    list_user_logos,
    list_video_tasks_for_user,
    rename_logo_asset,
    retry_video_task,
    save_image_upload,
    set_default_avatar,
    set_default_logo,
    to_video_task_list_item,
    to_video_task_out,
    upload_avatar_asset,
    upload_logo_asset,
    upsert_profile_card,
)
from backend.tasks.video import (
    process_long_video_task_job,
    process_short_video_task_job,
    submit_flex_short_video_task_job,
)

router = APIRouter()


def error_detail(code: str, message: str | None = None) -> dict:
    detail = {"code": code}
    if message:
        detail["message"] = message
    return detail


def app_error_detail(exc: AppError) -> dict:
    if hasattr(exc, "to_detail"):
        detail = exc.to_detail()
        if isinstance(detail, dict):
            return detail
    return {"code": exc.code}


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


@router.get("/avatars", response_model=list[UserAvatarOut])
async def get_user_avatars(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[UserAvatarOut]:
    return await list_user_avatars(db, user.id)


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
        raise HTTPException(status_code=exc.status_code, detail=app_error_detail(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=error_detail("videos.validation.invalidState", str(exc)))


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
        raise HTTPException(status_code=400, detail=error_detail("videos.validation.invalidState", str(exc)))


@router.post("/uploads/avatar", response_model=UploadAvatarResponse)
async def upload_avatar(
    file: UploadFile = File(...),
    name: str | None = Form(default=None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UploadAvatarResponse:
    try:
        return await upload_avatar_asset(db, user.id, file, name)
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=error_detail("videos.validation.invalidState", str(exc)))


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
        raise HTTPException(status_code=404, detail=error_detail("videos.resource.notFound", str(exc)))


@router.delete("/avatars/{avatar_id}")
async def delete_avatar(
    avatar_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        await delete_avatar_asset(db, user.id, avatar_id)
        return {"message": "ok"}
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=error_detail("videos.resource.notFound", str(exc)))


@router.get("/avatars/{avatar_id}/preview")
async def preview_avatar(
    avatar_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    avatar = await get_user_avatar_asset(db, user.id, avatar_id)
    if avatar is None:
        raise HTTPException(status_code=404, detail={"code": "videos.avatar.notFound"})
    path = get_local_path(avatar.key)
    if not path.exists():
        raise HTTPException(status_code=404, detail={"code": "videos.avatar.missing"})
    return FileResponse(path, media_type="image/png", filename=f"avatar-{avatar_id}.png")


@router.get("/logos/{logo_id}/preview")
async def preview_logo(
    logo_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    logo = await get_user_logo_asset(db, user.id, logo_id)
    if logo is None:
        raise HTTPException(status_code=404, detail={"code": "videos.logo.notFound"})
    path = get_local_path(logo.key)
    if not path.exists():
        raise HTTPException(status_code=404, detail={"code": "videos.logo.missing"})
    return FileResponse(path, media_type="image/png", filename=f"logo-{logo_id}.png")


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
        raise HTTPException(status_code=404, detail=error_detail("videos.resource.notFound", str(exc)))


@router.patch("/logos/{logo_id}", response_model=UserLogoOut)
async def rename_logo(
    logo_id: UUID,
    body: RenameLogoRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserLogoOut:
    try:
        return await rename_logo_asset(db, user.id, logo_id, body.name)
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=error_detail("videos.validation.invalidState", str(exc)))


@router.post("/avatars/{avatar_id}/default", response_model=UserAvatarOut)
async def set_avatar_as_default(
    avatar_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserAvatarOut:
    try:
        return await set_default_avatar(db, user.id, avatar_id)
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=error_detail("videos.resource.notFound", str(exc)))


@router.get("/profile-cards", response_model=list[ProfileCardOut])
async def get_profile_cards(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[ProfileCardOut]:
    return await list_profile_cards(db, user.id)


@router.post("/profile-cards", response_model=ProfileCardOut)
async def create_profile_card(
    body: UpsertProfileCardRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProfileCardOut:
    try:
        return await upsert_profile_card(db, user.id, body)
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})


@router.patch("/profile-cards/{profile_card_id}", response_model=ProfileCardOut)
async def update_profile_card(
    profile_card_id: UUID,
    body: UpsertProfileCardRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ProfileCardOut:
    try:
        return await upsert_profile_card(db, user.id, body, profile_card_id=profile_card_id)
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})


@router.delete("/profile-cards/{profile_card_id}")
async def remove_profile_card(
    profile_card_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    try:
        await delete_profile_card(db, user.id, profile_card_id)
        return {"message": "ok"}
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})


@router.get("/profile-cards/{profile_card_id}/preview")
async def preview_profile_card(
    profile_card_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    try:
        png_bytes = await generate_profile_card_preview_png(
            db,
            user_id=user.id,
            profile_card_id=profile_card_id,
        )
        return Response(content=png_bytes, media_type="image/png")
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})


@router.post("/profile-cards/preview")
async def preview_profile_card_draft(
    body: UpsertProfileCardRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    try:
        png_bytes = await generate_profile_card_preview_png_from_request(
            db,
            user_id=user.id,
            body=body,
        )
        return Response(content=png_bytes, media_type="image/png")
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})


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
            logo_position_x=body.logo_position_x,
            logo_position_y=body.logo_position_y,
            avatar_key=body.avatar_key,
            avatar_position=body.avatar_position,
            avatar_position_x=body.avatar_position_x,
            avatar_position_y=body.avatar_position_y,
            profile_card_id=body.profile_card_id,
            profile_card_options=body.profile_card_options,
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
        raise HTTPException(status_code=exc.status_code, detail=app_error_detail(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=error_detail("videos.validation.invalidState", str(exc)))


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
            logo_position_x=body.logo_position_x,
            logo_position_y=body.logo_position_y,
            avatar_key=body.avatar_key,
            avatar_position=body.avatar_position,
            avatar_position_x=body.avatar_position_x,
            avatar_position_y=body.avatar_position_y,
            profile_card_id=body.profile_card_id,
            profile_card_options=body.profile_card_options,
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
        raise HTTPException(status_code=400, detail=error_detail("videos.validation.invalidState", str(exc)))


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
        raise HTTPException(status_code=404, detail=error_detail("videos.task.notFound"))
    segments_by_task_id = await list_long_segments_for_task_ids(db, [task.id] if task.task_type == "long" else [])
    return to_video_task_out(task, long_segments=segments_by_task_id.get(task.id))


@router.post("/tasks/{task_id}/retry", response_model=VideoTaskOut)
async def retry_task(
    task_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> VideoTaskOut:
    try:
        task, cleanup_keys = await retry_video_task(db, user_id=user.id, task_id=task_id)
        await db.commit()
        await db.refresh(task)
        await cleanup_storage_keys_best_effort(cleanup_keys)
        enqueue_fn = process_long_video_task_job.delay
        if task.task_type == "short":
            enqueue_fn = submit_flex_short_video_task_job.delay if task.service_tier == "flex" else process_short_video_task_job.delay
        await enqueue_video_task_or_fail(db, task=task, enqueue_fn=enqueue_fn)
        segments_by_task_id = await list_long_segments_for_task_ids(db, [task.id])
        return to_video_task_out(task, long_segments=segments_by_task_id.get(task.id))
    except AppError as exc:
        raise HTTPException(status_code=exc.status_code, detail={"code": exc.code})
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=error_detail("videos.task.notFound", str(exc)))


@router.get("/tasks/{task_id}/download")
async def download_task_video(
    task_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    task = await get_video_task_for_user(db, user.id, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail=error_detail("videos.task.notFound"))
    if task.video_key is None or task.status != "succeeded":
        raise HTTPException(status_code=400, detail=error_detail("videos.task.notReady"))
    if task.expires_at and task.expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail=error_detail("videos.task.expired"))

    path = get_local_path(task.video_key)
    if not path.exists():
        raise HTTPException(status_code=404, detail=error_detail("videos.storage.fileMissing"))

    return FileResponse(path, media_type="video/mp4", filename=f"listinglive-{task_id}.mp4")
