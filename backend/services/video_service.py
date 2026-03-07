"""
视频任务服务
"""
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from uuid import UUID

from fastapi import UploadFile
from PIL import Image
from sqlalchemy import Select, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.api_errors import AppError
from backend.core.config import settings
from backend.core.database import AsyncSessionLocal
from backend.core.entitlements import (
    BASIC_SHORT_VIDEO_DURATION_SECONDS,
    CAPABILITY_MERGE_DRAG_REORDER,
    CAPABILITY_MERGE_PER_IMAGE_TEMPLATE,
    CAPABILITY_MERGE_PER_SEGMENT_DURATION,
    CAPABILITY_MERGE_VIDEO_CREATE,
    CAPABILITY_SHORT_VIDEO_CREATE,
)
from backend.core.scene_templates import (
    SCENE_TEMPLATE_CATEGORY_LONG_UNIFIED,
    SCENE_TEMPLATE_CATEGORY_SHORT,
    load_scene_templates,
)
from backend.models.long_video_segment import LongVideoSegment
from backend.models.logo_asset import LogoAsset
from backend.models.scene_template import SceneTemplate
from backend.models.user import User
from backend.models.video_task import VideoTask
from backend.schemas.video import LongVideoSegmentInput, UploadLogoResponse, UserLogoOut, VideoTaskListItem, VideoTaskOut
from backend.services.entitlement_service import PermissionDeniedError, build_user_access_context, has_capability
from backend.services.quota_service import consume_quota, get_active_subscription, refund_quota
from backend.services.storage_service import delete_key, ensure_key_exists, get_local_path, make_storage_key, save_bytes
from backend.services.video_merge_service import merge_segment_videos
from backend.services.video_provider import get_video_provider

ALLOWED_IMAGE_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024
DEFAULT_STORAGE_DAYS = 30

VIDEO_TASK_STATUS_QUEUED = "queued"
VIDEO_TASK_STATUS_PROCESSING = "processing"
VIDEO_TASK_STATUS_MERGING = "merging"
VIDEO_TASK_STATUS_SUCCEEDED = "succeeded"
VIDEO_TASK_STATUS_FAILED = "failed"

VIDEO_TASK_TYPE_SHORT = "short"
VIDEO_TASK_TYPE_LONG = "long"
LONG_VIDEO_MIN_IMAGES = 2
LONG_VIDEO_MAX_IMAGES = 10
LONG_VIDEO_SEGMENT_STATUS_QUEUED = "queued"
LONG_VIDEO_SEGMENT_STATUS_PROCESSING = "processing"
LONG_VIDEO_SEGMENT_STATUS_SUCCEEDED = "succeeded"
LONG_VIDEO_SEGMENT_STATUS_FAILED = "failed"


async def sync_scene_templates(db: AsyncSession) -> None:
    configured_templates = load_scene_templates()
    configured_keys = {item.template_key for item in configured_templates}
    existing_stmt = select(SceneTemplate)
    existing_templates = list((await db.execute(existing_stmt)).scalars().all())
    existing_by_key = {item.template_key: item for item in existing_templates}

    for config in configured_templates:
        template = existing_by_key.get(config.template_key)
        if template is None:
            db.add(
                SceneTemplate(
                    template_key=config.template_key,
                    category=config.category,
                    name=config.name,
                    prompt=config.prompt,
                    sort_order=config.sort_order,
                    is_enabled=config.is_enabled,
                )
            )
            continue

        template.name = config.name
        template.category = config.category
        template.prompt = config.prompt
        template.sort_order = config.sort_order
        template.is_enabled = config.is_enabled

    for template in existing_templates:
        if template.template_key not in configured_keys and template.is_enabled:
            template.is_enabled = False

    await db.commit()


async def sync_scene_templates_on_startup() -> None:
    async with AsyncSessionLocal() as db:
        await sync_scene_templates(db)


async def list_scene_templates(db: AsyncSession, *, category: str = SCENE_TEMPLATE_CATEGORY_SHORT) -> list[SceneTemplate]:
    stmt = (
        select(SceneTemplate)
        .where(SceneTemplate.is_enabled.is_(True), SceneTemplate.category == category)
        .order_by(SceneTemplate.sort_order.asc(), SceneTemplate.created_at.asc())
    )
    return list((await db.execute(stmt)).scalars().all())


async def list_user_logos(db: AsyncSession, user_id: UUID) -> list[UserLogoOut]:
    stmt = (
        select(LogoAsset)
        .where(LogoAsset.user_id == user_id)
        .order_by(LogoAsset.is_default.desc(), LogoAsset.created_at.desc())
    )
    logos = list((await db.execute(stmt)).scalars().all())
    return [
        UserLogoOut(id=logo.id, key=logo.key, name=logo.display_name, is_default=logo.is_default)
        for logo in logos
    ]


async def upload_logo_asset(db: AsyncSession, user_id: UUID, file: UploadFile, display_name: str | None) -> UploadLogoResponse:
    key = await save_image_upload(file, f"uploads/{user_id}/logos")
    name = (display_name or "").strip() or Path(file.filename or "").stem or "未命名 Logo"

    existing_default_stmt = select(LogoAsset).where(
        LogoAsset.user_id == user_id,
        LogoAsset.is_default.is_(True),
    )
    existing_default = (await db.execute(existing_default_stmt)).scalar_one_or_none()

    logo = LogoAsset(
        user_id=user_id,
        key=key,
        display_name=name[:100],
        is_default=existing_default is None,
    )
    db.add(logo)
    await db.flush()
    await db.refresh(logo)
    return UploadLogoResponse(id=logo.id, key=logo.key, name=logo.display_name, is_default=logo.is_default)


async def set_default_logo(db: AsyncSession, user_id: UUID, logo_id: UUID) -> UserLogoOut:
    stmt = select(LogoAsset).where(LogoAsset.user_id == user_id)
    logos = list((await db.execute(stmt)).scalars().all())
    target = next((logo for logo in logos if logo.id == logo_id), None)
    if target is None:
        raise AppError("videos.logo.notFound")

    for logo in logos:
        logo.is_default = logo.id == logo_id
    await db.flush()
    return UserLogoOut(id=target.id, key=target.key, name=target.display_name, is_default=target.is_default)


async def delete_logo_asset(db: AsyncSession, user_id: UUID, logo_id: UUID) -> None:
    stmt = select(LogoAsset).where(LogoAsset.user_id == user_id)
    logos = list((await db.execute(stmt)).scalars().all())
    target = next((logo for logo in logos if logo.id == logo_id), None)
    if target is None:
        raise AppError("videos.logo.notFound")

    await delete_key(target.key)
    was_default = target.is_default
    await db.delete(target)
    await db.flush()

    if was_default:
        remaining = [logo for logo in logos if logo.id != logo_id]
        if remaining:
            newest = sorted(remaining, key=lambda item: item.created_at, reverse=True)[0]
            newest.is_default = True
            await db.flush()


async def get_default_logo_key(db: AsyncSession, user_id: UUID) -> str | None:
    stmt = select(LogoAsset).where(
        LogoAsset.user_id == user_id,
        LogoAsset.is_default.is_(True),
    )
    logo = (await db.execute(stmt)).scalar_one_or_none()
    return logo.key if logo else None


async def save_image_upload(file: UploadFile, prefix: str) -> str:
    if file.content_type not in ALLOWED_IMAGE_CONTENT_TYPES:
        raise AppError("videos.upload.invalidImageType")

    data = await file.read()
    if not data:
        raise AppError("videos.upload.emptyFile")
    if len(data) > MAX_UPLOAD_SIZE_BYTES:
        raise AppError("videos.upload.fileTooLarge")
    try:
        with Image.open(BytesIO(data)) as image:
            image.verify()
    except Exception as exc:
        raise AppError("videos.upload.invalidImageFile") from exc

    extension = Path(file.filename or "").suffix.lower() or ALLOWED_IMAGE_CONTENT_TYPES[file.content_type]
    return await save_bytes(prefix, data, extension, file.content_type)


async def validate_user_image_key(user_id: UUID, image_key: str) -> None:
    user_image_prefix = f"uploads/{user_id}/images/"
    if not image_key.startswith(user_image_prefix):
        raise AppError("videos.image.invalidOwnership")
    if not await ensure_key_exists(image_key):
        raise AppError("videos.image.missing")


async def validate_user_logo_key(db: AsyncSession, user_id: UUID, logo_key: str | None) -> None:
    if not logo_key:
        return
    user_logo_prefix = f"uploads/{user_id}/logos/"
    if not logo_key.startswith(user_logo_prefix):
        raise AppError("videos.logo.invalidOwnership")
    if not await ensure_key_exists(logo_key):
        raise AppError("videos.logo.missing")
    logo_stmt = select(LogoAsset).where(LogoAsset.user_id == user_id, LogoAsset.key == logo_key)
    if (await db.execute(logo_stmt)).scalar_one_or_none() is None:
        raise AppError("videos.logo.invalidOwnership")


async def get_enabled_scene_template(db: AsyncSession, scene_template_id: UUID) -> SceneTemplate:
    template = await db.get(SceneTemplate, scene_template_id)
    if template is None or not template.is_enabled:
        raise AppError("videos.template.unavailable")
    return template


async def get_enabled_scene_template_by_category(
    db: AsyncSession,
    scene_template_id: UUID,
    *,
    category: str,
) -> SceneTemplate:
    template = await get_enabled_scene_template(db, scene_template_id)
    if template.category != category:
        raise AppError("videos.template.unavailable")
    return template


def resolve_long_video_segments(
    *,
    image_keys: list[str],
    scene_template_id: UUID,
    duration_seconds: int,
    segments: list[LongVideoSegmentInput] | None,
    access_context,
) -> list[LongVideoSegmentInput]:
    if not segments:
        return [
            LongVideoSegmentInput(
                image_key=image_key,
                scene_template_id=scene_template_id,
                duration_seconds=duration_seconds,
                sort_order=index,
            )
            for index, image_key in enumerate(image_keys)
        ]

    if len(segments) != len(image_keys):
        raise AppError("videos.long.invalidSegments")

    sort_orders = [segment.sort_order for segment in segments]
    if len(set(sort_orders)) != len(sort_orders):
        raise AppError("videos.long.invalidSegments")

    normalized_segments = sorted(segments, key=lambda item: item.sort_order)
    ordered_image_keys = [segment.image_key for segment in normalized_segments]
    if len(set(ordered_image_keys)) != len(ordered_image_keys):
        raise AppError("videos.long.invalidSegments")
    if set(ordered_image_keys) != set(image_keys):
        raise AppError("videos.long.invalidSegments")

    requested_template_ids = {segment.scene_template_id for segment in normalized_segments}
    requested_durations = {segment.duration_seconds for segment in normalized_segments}

    if len(requested_template_ids) > 1 and not has_capability(access_context, CAPABILITY_MERGE_PER_IMAGE_TEMPLATE):
        raise PermissionDeniedError("videos.long.perImageTemplateDenied")

    if len(requested_durations) > 1 and not has_capability(access_context, CAPABILITY_MERGE_PER_SEGMENT_DURATION):
        raise PermissionDeniedError("videos.long.perSegmentDurationDenied")

    if ordered_image_keys != image_keys and not has_capability(access_context, CAPABILITY_MERGE_DRAG_REORDER):
        raise PermissionDeniedError("videos.long.dragReorderDenied")

    return [
        LongVideoSegmentInput(
            image_key=segment.image_key,
            scene_template_id=segment.scene_template_id,
            duration_seconds=segment.duration_seconds,
            sort_order=index,
        )
        for index, segment in enumerate(normalized_segments)
    ]


async def create_short_video_task(
    db: AsyncSession,
    user: User,
    *,
    image_key: str,
    scene_template_id: UUID,
    resolution: str,
    aspect_ratio: str,
    duration_seconds: int,
    logo_key: str | None,
) -> VideoTask:
    access_context = await build_user_access_context(db, user.id)
    if not has_capability(access_context, CAPABILITY_SHORT_VIDEO_CREATE):
        raise PermissionDeniedError("videos.short.permissionDenied")

    if not access_context.limits.short_duration_editable and duration_seconds != BASIC_SHORT_VIDEO_DURATION_SECONDS:
        raise PermissionDeniedError("videos.short.fixedDurationOnly")

    if resolution not in access_context.limits.allowed_resolutions:
        raise PermissionDeniedError("videos.common.unsupportedResolution")

    if aspect_ratio not in access_context.limits.allowed_aspect_ratios:
        raise PermissionDeniedError("videos.common.unsupportedAspectRatio")

    await validate_user_image_key(user.id, image_key)
    await validate_user_logo_key(db, user.id, logo_key)
    template = await get_enabled_scene_template_by_category(
        db,
        scene_template_id,
        category=SCENE_TEMPLATE_CATEGORY_SHORT,
    )

    prompt = template.prompt.strip()
    await consume_quota(db, user.id, 1)

    task = VideoTask(
        user_id=user.id,
        scene_template_id=template.id,
        task_type=VIDEO_TASK_TYPE_SHORT,
        status=VIDEO_TASK_STATUS_QUEUED,
        image_keys=[image_key],
        prompt=prompt,
        resolution=resolution,
        aspect_ratio=aspect_ratio,
        duration_seconds=duration_seconds,
        logo_key=logo_key,
        quota_consumed=1,
    )
    db.add(task)
    await db.flush()
    await db.refresh(task)
    return task


async def create_long_video_task(
    db: AsyncSession,
    user: User,
    *,
    image_keys: list[str],
    scene_template_id: UUID,
    resolution: str,
    aspect_ratio: str,
    duration_seconds: int,
    logo_key: str | None,
    segments: list[LongVideoSegmentInput] | None = None,
) -> VideoTask:
    access_context = await build_user_access_context(db, user.id)
    if not has_capability(access_context, CAPABILITY_MERGE_VIDEO_CREATE):
        raise PermissionDeniedError("videos.long.permissionDenied")
    if len(image_keys) < LONG_VIDEO_MIN_IMAGES or len(image_keys) > LONG_VIDEO_MAX_IMAGES:
        raise AppError("videos.long.invalidImageCount")
    if resolution not in access_context.limits.allowed_resolutions:
        raise PermissionDeniedError("videos.common.unsupportedResolution")
    if aspect_ratio not in access_context.limits.allowed_aspect_ratios:
        raise PermissionDeniedError("videos.common.unsupportedAspectRatio")

    resolved_segments = resolve_long_video_segments(
        image_keys=image_keys,
        scene_template_id=scene_template_id,
        duration_seconds=duration_seconds,
        segments=segments,
        access_context=access_context,
    )
    ordered_image_keys = [segment.image_key for segment in resolved_segments]

    for image_key in ordered_image_keys:
        await validate_user_image_key(user.id, image_key)
    await validate_user_logo_key(db, user.id, logo_key)

    template_ids = {segment.scene_template_id for segment in resolved_segments}
    if segments:
        templates_by_id = {
            template_id: await get_enabled_scene_template_by_category(
                db,
                template_id,
                category=SCENE_TEMPLATE_CATEGORY_SHORT,
            )
            for template_id in template_ids
        }
        task_template = templates_by_id[resolved_segments[0].scene_template_id]
    else:
        task_template = await get_enabled_scene_template_by_category(
            db,
            scene_template_id,
            category=SCENE_TEMPLATE_CATEGORY_LONG_UNIFIED,
        )

    quota_amount = len(ordered_image_keys)
    await consume_quota(db, user.id, quota_amount)

    task = VideoTask(
        user_id=user.id,
        scene_template_id=task_template.id,
        task_type=VIDEO_TASK_TYPE_LONG,
        status=VIDEO_TASK_STATUS_QUEUED,
        image_keys=ordered_image_keys,
        prompt=task_template.prompt.strip(),
        resolution=resolution,
        aspect_ratio=aspect_ratio,
        duration_seconds=duration_seconds,
        logo_key=logo_key,
        quota_consumed=quota_amount,
        provider_task_ids={"segment_count": len(ordered_image_keys), "completed_segments": 0},
    )
    db.add(task)
    await db.flush()

    for segment in resolved_segments:
        db.add(
            LongVideoSegment(
                task_id=task.id,
                sort_order=segment.sort_order,
                image_key=segment.image_key,
                scene_template_id=segment.scene_template_id if segments else None,
                duration_seconds=segment.duration_seconds,
                status=LONG_VIDEO_SEGMENT_STATUS_QUEUED,
            )
        )

    await db.flush()
    await db.refresh(task)
    return task


async def get_video_task_for_user(db: AsyncSession, user_id: UUID, task_id: UUID) -> VideoTask | None:
    stmt = select(VideoTask).where(VideoTask.id == task_id, VideoTask.user_id == user_id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def list_video_tasks_for_user(
    db: AsyncSession,
    user_id: UUID,
    *,
    status: str | None = None,
    task_type: str | None = None,
    limit: int = 20,
) -> list[VideoTask]:
    stmt: Select[tuple[VideoTask]] = select(VideoTask).where(VideoTask.user_id == user_id)
    if status:
        stmt = stmt.where(VideoTask.status == status)
    if task_type:
        stmt = stmt.where(VideoTask.task_type == task_type)
    stmt = stmt.order_by(VideoTask.created_at.desc()).limit(limit)
    return list((await db.execute(stmt)).scalars().all())


async def get_storage_days_for_user(db: AsyncSession, user_id: UUID) -> int:
    subscription = await get_active_subscription(db, user_id)
    if subscription is None:
        return DEFAULT_STORAGE_DAYS
    return max(subscription.storage_days, DEFAULT_STORAGE_DAYS)


def get_segment_progress(task: VideoTask) -> tuple[int | None, int | None]:
    if task.task_type != VIDEO_TASK_TYPE_LONG:
        return None, None
    segment_count = len(task.image_keys)
    provider_task_ids = task.provider_task_ids or {}
    completed_segments = provider_task_ids.get("completed_segments", 0)
    if task.status == VIDEO_TASK_STATUS_SUCCEEDED:
        completed_segments = segment_count
    return segment_count, completed_segments


def to_video_task_out(task: VideoTask) -> VideoTaskOut:
    segment_count, completed_segments = get_segment_progress(task)
    return VideoTaskOut(
        id=task.id,
        task_type=task.task_type,
        status=task.status,
        image_keys=task.image_keys,
        resolution=task.resolution,
        aspect_ratio=task.aspect_ratio,
        duration_seconds=task.duration_seconds,
        logo_key=task.logo_key,
        quota_consumed=task.quota_consumed,
        provider_name=task.provider_name,
        video_key=task.video_key,
        download_url=build_download_url(task),
        error_message=task.error_message,
        expires_at=task.expires_at,
        created_at=task.created_at,
        updated_at=task.updated_at,
        segment_count=segment_count,
        completed_segments=completed_segments,
    )


def to_video_task_list_item(task: VideoTask) -> VideoTaskListItem:
    segment_count, completed_segments = get_segment_progress(task)
    return VideoTaskListItem(
        id=task.id,
        task_type=task.task_type,
        status=task.status,
        resolution=task.resolution,
        aspect_ratio=task.aspect_ratio,
        duration_seconds=task.duration_seconds,
        video_key=task.video_key,
        download_url=build_download_url(task),
        error_message=task.error_message,
        created_at=task.created_at,
        updated_at=task.updated_at,
        segment_count=segment_count,
        completed_segments=completed_segments,
    )


def build_download_url(task: VideoTask) -> str | None:
    if task.status != VIDEO_TASK_STATUS_SUCCEEDED or not task.video_key:
        return None
    return f"/api/v1/videos/tasks/{task.id}/download"


async def process_short_video_task(task_id: UUID | str) -> None:
    if isinstance(task_id, str):
        task_id = UUID(task_id)
    async with AsyncSessionLocal() as db:
        task = await db.get(VideoTask, task_id)
        if task is None:
            return
        if task.status == VIDEO_TASK_STATUS_SUCCEEDED:
            return

        task.status = VIDEO_TASK_STATUS_PROCESSING
        task.error_message = None
        await db.commit()
        await db.refresh(task)

        try:
            output_key, generated = await generate_video_output(
                image_key=task.image_keys[0],
                prompt=task.prompt,
                resolution=task.resolution,
                aspect_ratio=task.aspect_ratio,
                duration_seconds=task.duration_seconds,
                logo_key=task.logo_key,
            )
            task.video_key = output_key
            task.provider_name = generated.provider_name
            task.provider_task_ids = generated.provider_task_ids
            task.status = VIDEO_TASK_STATUS_SUCCEEDED
            task.expires_at = datetime.now(timezone.utc) + timedelta(days=await get_storage_days_for_user(db, task.user_id))
            await db.commit()
        except Exception as exc:
            await db.rollback()
            task = await db.get(VideoTask, task_id)
            if task is None:
                return
            task.status = VIDEO_TASK_STATUS_FAILED
            task.error_message = str(exc)
            await refund_quota(db, task.user_id, task.quota_consumed)
            await db.commit()


async def process_long_video_task(task_id: UUID | str) -> None:
    if isinstance(task_id, str):
        task_id = UUID(task_id)
    async with AsyncSessionLocal() as db:
        task = await db.get(VideoTask, task_id)
        if task is None:
            return
        if task.status == VIDEO_TASK_STATUS_SUCCEEDED:
            return

        segment_keys: list[str] = []
        try:
            task.status = VIDEO_TASK_STATUS_PROCESSING
            task.error_message = None
            await db.commit()
            await db.refresh(task)

            segment_stmt = (
                select(LongVideoSegment)
                .where(LongVideoSegment.task_id == task.id)
                .order_by(LongVideoSegment.sort_order.asc(), LongVideoSegment.created_at.asc())
            )
            segments = list((await db.execute(segment_stmt)).scalars().all())
            if len(segments) < LONG_VIDEO_MIN_IMAGES:
                raise AppError("videos.long.invalidSegments")

            provider_details: dict[str, dict[str, str]] = {}
            for index, segment in enumerate(segments, start=1):
                segment.status = LONG_VIDEO_SEGMENT_STATUS_PROCESSING
                await db.commit()

                template_id = segment.scene_template_id or task.scene_template_id
                if template_id is None:
                    raise AppError("videos.template.unavailable")
                template_category = SCENE_TEMPLATE_CATEGORY_SHORT if segment.scene_template_id is not None else SCENE_TEMPLATE_CATEGORY_LONG_UNIFIED
                template = await get_enabled_scene_template_by_category(
                    db,
                    template_id,
                    category=template_category,
                )
                output_key, generated = await generate_video_output(
                    image_key=segment.image_key,
                    prompt=template.prompt.strip(),
                    resolution=task.resolution,
                    aspect_ratio=task.aspect_ratio,
                    duration_seconds=segment.duration_seconds,
                    logo_key=task.logo_key,
                )
                segment.segment_video_key = output_key
                segment.provider_task_id = next(iter(generated.provider_task_ids.values()), None)
                segment.status = LONG_VIDEO_SEGMENT_STATUS_SUCCEEDED
                segment.error_message = None
                segment_keys.append(output_key)
                provider_details[str(segment.id)] = generated.provider_task_ids
                task.provider_name = generated.provider_name
                task.provider_task_ids = {
                    "segment_count": len(segments),
                    "completed_segments": index,
                    "segments": provider_details,
                }
                await db.commit()

            task.status = VIDEO_TASK_STATUS_MERGING
            await db.commit()

            output_key = create_output_key()
            merge_segment_videos(
                [get_local_path(key) for key in segment_keys],
                get_local_path(output_key),
                fps=settings.VIDEO_FPS,
            )

            task.video_key = output_key
            task.status = VIDEO_TASK_STATUS_SUCCEEDED
            task.expires_at = datetime.now(timezone.utc) + timedelta(days=await get_storage_days_for_user(db, task.user_id))
            task.provider_task_ids = {
                **(task.provider_task_ids or {}),
                "segment_count": len(segments),
                "completed_segments": len(segments),
            }
            await db.commit()
            for key in segment_keys:
                await delete_key(key)
        except Exception as exc:
            await db.rollback()
            task = await db.get(VideoTask, task_id)
            if task is None:
                return
            task.status = VIDEO_TASK_STATUS_FAILED
            task.error_message = str(exc)

            segment_stmt = select(LongVideoSegment).where(LongVideoSegment.task_id == task.id)
            segments = list((await db.execute(segment_stmt)).scalars().all())
            for segment in segments:
                if segment.status != LONG_VIDEO_SEGMENT_STATUS_SUCCEEDED:
                    segment.status = LONG_VIDEO_SEGMENT_STATUS_FAILED
                    segment.error_message = str(exc)
            await refund_quota(db, task.user_id, task.quota_consumed)
            await db.commit()

            for key in segment_keys:
                await delete_key(key)
            if task.video_key:
                await delete_key(task.video_key)


async def generate_video_output(
    *,
    image_key: str,
    prompt: str,
    resolution: str,
    aspect_ratio: str,
    duration_seconds: int,
    logo_key: str | None,
) -> tuple[str, object]:
    provider = get_video_provider()
    image_path = get_local_path(image_key)
    logo_path = get_local_path(logo_key) if logo_key else None
    output_key = create_output_key()
    output_path = get_local_path(output_key)

    result = await provider.generate_image_to_video(
        input_path=image_path,
        output_path=output_path,
        prompt=prompt,
        resolution=resolution,
        aspect_ratio=aspect_ratio,
        duration_seconds=duration_seconds,
        logo_path=logo_path,
    )
    return output_key, result


def create_output_key() -> str:
    now = datetime.now(timezone.utc)
    prefix = f"videos/{now:%Y/%m/%d}"
    return make_storage_key(prefix, ".mp4")
