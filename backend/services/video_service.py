"""
视频任务服务
"""
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from io import BytesIO
from pathlib import Path
from uuid import UUID

import httpx
from fastapi import UploadFile
from PIL import Image
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.api_errors import AppError
from backend.core.config import settings
from backend.core.database import AsyncSessionLocal
from backend.core.redis_client import get_redis
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
    validate_scene_template_property_type,
)
from backend.models.long_video_segment import LongVideoSegment
from backend.models.logo_asset import LogoAsset
from backend.models.scene_template import SceneTemplate
from backend.models.user import User
from backend.models.video_task import VideoTask
from backend.schemas.video import (
    LongVideoSegmentInput,
    LongVideoSegmentStatusOut,
    UploadLogoResponse,
    UserLogoOut,
    VideoTaskListItem,
    VideoTaskOut,
)
from backend.services.entitlement_service import PermissionDeniedError, build_user_access_context, has_capability
from backend.services.quota_service import (
    TASK_CHARGE_STATUS_CHARGED,
    TASK_CHARGE_STATUS_PENDING,
    TASK_CHARGE_STATUS_SKIPPED,
    check_quota_available,
    consume_quota,
    get_active_subscription,
    refund_quota,
)
from backend.services.storage_service import delete_key, ensure_key_exists, get_local_path, make_storage_key, save_bytes
from backend.services.video_merge_service import merge_segment_videos
from backend.services.video_provider import (
    AsyncTaskVideoProvider,
    GeneratedVideo,
    ProviderTaskSnapshot,
    SubmittedVideoTask,
    apply_logo_to_video_file,
    get_video_provider,
)

ALLOWED_IMAGE_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024
DEFAULT_STORAGE_DAYS = 30
logger = logging.getLogger(__name__)

VIDEO_TASK_STATUS_QUEUED = "queued"
VIDEO_TASK_STATUS_PROCESSING = "processing"
VIDEO_TASK_STATUS_MERGING = "merging"
VIDEO_TASK_STATUS_SUBMITTING = "submitting"
VIDEO_TASK_STATUS_SUBMITTED = "submitted"
VIDEO_TASK_STATUS_PROVIDER_PROCESSING = "provider_processing"
VIDEO_TASK_STATUS_FINALIZING = "finalizing"
VIDEO_TASK_STATUS_SUCCEEDED = "succeeded"
VIDEO_TASK_STATUS_FAILED = "failed"

VIDEO_TASK_TYPE_SHORT = "short"
VIDEO_TASK_TYPE_LONG = "long"
TASK_SERVICE_TIER_STANDARD = "standard"
TASK_SERVICE_TIER_FLEX = "flex"
LONG_VIDEO_MIN_IMAGES = 2
LONG_VIDEO_MAX_IMAGES = 10
LONG_VIDEO_SEGMENT_STATUS_QUEUED = "queued"
LONG_VIDEO_SEGMENT_STATUS_PROCESSING = "processing"
LONG_VIDEO_SEGMENT_STATUS_SUCCEEDED = "succeeded"
LONG_VIDEO_SEGMENT_STATUS_FAILED = "failed"
ACTIVE_VIDEO_TASK_STATUSES = (
    VIDEO_TASK_STATUS_QUEUED,
    VIDEO_TASK_STATUS_PROCESSING,
    VIDEO_TASK_STATUS_MERGING,
)
FLEX_POLLABLE_VIDEO_TASK_STATUSES = (
    VIDEO_TASK_STATUS_SUBMITTED,
    VIDEO_TASK_STATUS_PROVIDER_PROCESSING,
)
FLEX_SUBMIT_RETRYABLE_TASK_STATUSES = (
    VIDEO_TASK_STATUS_QUEUED,
    VIDEO_TASK_STATUS_SUBMITTING,
)
STALE_VIDEO_TASK_STATUSES = (
    VIDEO_TASK_STATUS_PROCESSING,
    VIDEO_TASK_STATUS_MERGING,
)
PROVIDER_QUEUE_LOCK_KEY = "video_provider:queue_claim_lock"
TASK_EXECUTION_LOCK_PREFIX = "video_task:execution"


def normalize_service_tier(service_tier: str | None) -> str:
    return (service_tier or TASK_SERVICE_TIER_STANDARD).strip().lower()


def validate_service_tier_for_task_type(*, task_type: str, service_tier: str | None) -> str:
    normalized = normalize_service_tier(service_tier)
    if normalized not in {TASK_SERVICE_TIER_STANDARD, TASK_SERVICE_TIER_FLEX}:
        raise AppError("videos.serviceTier.invalid", status_code=400)
    if task_type == VIDEO_TASK_TYPE_LONG and normalized == TASK_SERVICE_TIER_FLEX:
        raise AppError("videos.long.flexUnavailable", status_code=400)
    return normalized


def is_flex_task(task: VideoTask) -> bool:
    return normalize_service_tier(getattr(task, "service_tier", None)) == TASK_SERVICE_TIER_FLEX


def is_flex_task_stale(task: VideoTask, *, now: datetime) -> bool:
    started_at = task.provider_submitted_at or task.processing_started_at or task.updated_at or task.created_at
    if started_at is None:
        return False
    return started_at <= now - timedelta(seconds=settings.FLEX_HARD_TIMEOUT_SECONDS)


def build_next_flex_poll_at(*, now: datetime | None = None) -> datetime:
    current_time = now or datetime.now(timezone.utc)
    return current_time + timedelta(seconds=max(settings.FLEX_POLL_INTERVAL_SECONDS, 5))


def merge_provider_task_ids(
    *provider_task_maps: dict[str, str] | None,
    provider_task_id: str | None = None,
) -> dict[str, str]:
    merged: dict[str, str] = {}
    for provider_task_map in provider_task_maps:
        if provider_task_map:
            merged.update({key: value for key, value in provider_task_map.items() if value})
    if provider_task_id:
        merged["provider_task_id"] = provider_task_id
    return merged


def get_async_video_provider() -> AsyncTaskVideoProvider:
    provider = get_video_provider()
    if not isinstance(provider, AsyncTaskVideoProvider):
        raise AppError("videos.flex.unsupportedProvider", status_code=503)
    return provider


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
                    property_types=list(config.property_types),
                    sort_order=config.sort_order,
                    is_enabled=config.is_enabled,
                )
            )
            continue

        template.name = config.name
        template.category = config.category
        template.prompt = config.prompt
        template.property_types = list(config.property_types)
        template.sort_order = config.sort_order
        template.is_enabled = config.is_enabled

    for template in existing_templates:
        if template.template_key not in configured_keys and template.is_enabled:
            template.is_enabled = False

    await db.commit()


async def sync_scene_templates_on_startup() -> None:
    async with AsyncSessionLocal() as db:
        await sync_scene_templates(db)


async def list_scene_templates(
    db: AsyncSession,
    *,
    category: str = SCENE_TEMPLATE_CATEGORY_SHORT,
    property_type: str | None = None,
) -> list[SceneTemplate]:
    stmt = select(SceneTemplate).where(SceneTemplate.is_enabled.is_(True), SceneTemplate.category == category)
    if property_type:
        stmt = stmt.where(SceneTemplate.property_types.contains([validate_scene_template_property_type(property_type)]))
    stmt = stmt.order_by(SceneTemplate.sort_order.asc(), SceneTemplate.created_at.asc())
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
    service_tier: str = TASK_SERVICE_TIER_STANDARD,
) -> VideoTask:
    service_tier = validate_service_tier_for_task_type(task_type=VIDEO_TASK_TYPE_SHORT, service_tier=service_tier)
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
    planned_quota = 1
    await check_quota_available(db, user.id, planned_quota)

    task = VideoTask(
        user_id=user.id,
        scene_template_id=template.id,
        task_type=VIDEO_TASK_TYPE_SHORT,
        service_tier=service_tier,
        status=VIDEO_TASK_STATUS_SUBMITTING if service_tier == TASK_SERVICE_TIER_FLEX else VIDEO_TASK_STATUS_QUEUED,
        image_keys=[image_key],
        prompt=prompt,
        resolution=resolution,
        aspect_ratio=aspect_ratio,
        duration_seconds=duration_seconds,
        logo_key=logo_key,
        quota_consumed=planned_quota,
        planned_quota_consumed=planned_quota,
        charged_quota_consumed=0,
        charge_status=TASK_CHARGE_STATUS_PENDING,
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
    service_tier: str = TASK_SERVICE_TIER_STANDARD,
) -> VideoTask:
    service_tier = validate_service_tier_for_task_type(task_type=VIDEO_TASK_TYPE_LONG, service_tier=service_tier)
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
    await check_quota_available(db, user.id, quota_amount)

    queued_at = datetime.now(timezone.utc)
    task = VideoTask(
        user_id=user.id,
        scene_template_id=task_template.id,
        task_type=VIDEO_TASK_TYPE_LONG,
        service_tier=service_tier,
        status=VIDEO_TASK_STATUS_QUEUED,
        image_keys=ordered_image_keys,
        prompt=task_template.prompt.strip(),
        resolution=resolution,
        aspect_ratio=aspect_ratio,
        duration_seconds=duration_seconds,
        logo_key=logo_key,
        quota_consumed=quota_amount,
        planned_quota_consumed=quota_amount,
        charged_quota_consumed=0,
        charge_status=TASK_CHARGE_STATUS_PENDING,
        queued_at=queued_at,
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
                queued_at=queued_at,
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


async def list_long_segments_for_task_ids(
    db: AsyncSession,
    task_ids: list[UUID],
) -> dict[UUID, list[LongVideoSegment]]:
    if not task_ids:
        return {}

    stmt = (
        select(LongVideoSegment)
        .where(LongVideoSegment.task_id.in_(task_ids))
        .order_by(LongVideoSegment.task_id.asc(), LongVideoSegment.sort_order.asc(), LongVideoSegment.created_at.asc())
    )
    segments = list((await db.execute(stmt)).scalars().all())
    grouped: dict[UUID, list[LongVideoSegment]] = {task_id: [] for task_id in task_ids}
    for segment in segments:
        grouped.setdefault(segment.task_id, []).append(segment)
    return grouped


def get_task_planned_quota(task: VideoTask) -> int:
    if getattr(task, "planned_quota_consumed", None) is not None:
        return int(task.planned_quota_consumed)
    return int(task.quota_consumed or 0)


async def settle_task_quota_charge(db: AsyncSession, task: VideoTask) -> None:
    if task.charge_status == TASK_CHARGE_STATUS_CHARGED:
        return
    planned_quota = get_task_planned_quota(task)
    if planned_quota <= 0:
        task.charged_quota_consumed = 0
        task.charge_status = TASK_CHARGE_STATUS_SKIPPED
        task.charged_at = None
        return
    await consume_quota(db, task.user_id, planned_quota)
    task.charged_quota_consumed = planned_quota
    task.charge_status = TASK_CHARGE_STATUS_CHARGED
    task.charged_at = datetime.now(timezone.utc)
    task.quota_refunded_at = None


def mark_task_charge_skipped(task: VideoTask) -> None:
    if task.charge_status == TASK_CHARGE_STATUS_CHARGED:
        return
    task.charged_quota_consumed = 0
    task.charge_status = TASK_CHARGE_STATUS_SKIPPED
    task.charged_at = None


async def retry_long_video_task(
    db: AsyncSession,
    *,
    user_id: UUID,
    task_id: UUID,
) -> tuple[VideoTask, list[str]]:
    task = await get_video_task_for_user(db, user_id, task_id)
    if task is None:
        raise ValueError("任务不存在")
    if task.task_type != VIDEO_TASK_TYPE_LONG:
        raise AppError("videos.task.retryUnavailable", status_code=400)

    cleanup_keys: list[str] = []
    segments = list(
        (
            await db.execute(
                select(LongVideoSegment)
                .where(LongVideoSegment.task_id == task.id)
                .order_by(LongVideoSegment.sort_order.asc(), LongVideoSegment.created_at.asc())
            )
        )
        .scalars()
        .all()
    )
    failed_segments = [segment for segment in segments if segment.status == LONG_VIDEO_SEGMENT_STATUS_FAILED]
    if task.status != VIDEO_TASK_STATUS_FAILED and not failed_segments:
        raise AppError("videos.task.retryUnavailable", status_code=400)

    now = datetime.now(timezone.utc)
    provider_details: dict[str, dict[str, str]] = {}
    completed_segments = 0
    for segment in segments:
        if segment.status == LONG_VIDEO_SEGMENT_STATUS_SUCCEEDED and segment.segment_video_key:
            completed_segments += 1
            if segment.provider_task_id:
                provider_details[str(segment.id)] = {"provider_task_id": segment.provider_task_id}
            continue
        if segment.status == LONG_VIDEO_SEGMENT_STATUS_QUEUED:
            segment.error_message = None
            continue
        if segment.segment_video_key:
            cleanup_keys.append(segment.segment_video_key)
            segment.segment_video_key = None
        segment.status = LONG_VIDEO_SEGMENT_STATUS_QUEUED
        segment.provider_task_id = None
        segment.error_message = None
        segment.queued_at = now
        segment.processing_started_at = None
        segment.finished_at = None

    if task.video_key:
        cleanup_keys.append(task.video_key)
        task.video_key = None
    task.status = VIDEO_TASK_STATUS_PROCESSING
    task.error_message = None
    task.charge_status = TASK_CHARGE_STATUS_PENDING
    task.charged_quota_consumed = 0
    task.charged_at = None
    task.quota_refunded_at = None
    if task.processing_started_at is None:
        task.processing_started_at = now
    task.finished_at = None
    task.provider_task_ids = {
        "segment_count": len(segments),
        "completed_segments": completed_segments,
        "segments": provider_details,
    }
    await db.flush()
    return task, cleanup_keys


async def get_storage_days_for_user(db: AsyncSession, user_id: UUID) -> int:
    subscription = await get_active_subscription(db, user_id)
    if subscription is None:
        return DEFAULT_STORAGE_DAYS
    return max(subscription.storage_days, DEFAULT_STORAGE_DAYS)


def create_temporary_output_path(output_path: Path) -> Path:
    return output_path.with_name(f"{output_path.stem}.tmp{output_path.suffix}")


def is_task_stale(updated_at: datetime, *, now: datetime, stale_seconds: int) -> bool:
    return updated_at <= now - timedelta(seconds=stale_seconds)


def is_retryable_provider_error(exc: Exception) -> bool:
    if isinstance(exc, (AppError, FileNotFoundError, PermissionDeniedError, ValueError)):
        return False
    if isinstance(exc, httpx.TimeoutException):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        status_code = exc.response.status_code
        return status_code == 429 or status_code >= 500
    if isinstance(exc, httpx.HTTPError):
        return True
    if isinstance(exc, (TimeoutError, ConnectionError, OSError)):
        return True
    if isinstance(exc, RuntimeError):
        message = str(exc)
        if (
            "未接入正式" in message
            or "暂不支持" in message
            or "尚未完成" in message
            or "本地图片到远端输入引用" in message
        ):
            return False
        return True
    return False


async def safe_delete_storage_key(key: str | None) -> bool:
    if not key:
        return True
    try:
        await delete_key(key)
        return True
    except Exception:
        logger.warning("Failed to delete storage key: %s", key, exc_info=True)
        return False


def safe_delete_local_path(path: Path | None) -> None:
    if path is None:
        return
    try:
        if path.exists():
            path.unlink()
    except Exception:
        logger.warning("Failed to delete local path: %s", path, exc_info=True)


async def enqueue_video_task_or_fail(
    db: AsyncSession,
    *,
    task: VideoTask,
    enqueue_fn,
) -> None:
    try:
        enqueue_fn(str(task.id))
    except Exception as exc:
        await db.rollback()
        task = await db.get(VideoTask, task.id)
        if task is None:
            raise AppError("videos.task.enqueueFailed", status_code=503) from exc
        await fail_video_task(db, task.id, "videos.task.enqueueFailed", refund_quota_on_failure=True)
        await db.commit()
        raise AppError("videos.task.enqueueFailed", status_code=503) from exc


async def fail_video_task(
    db: AsyncSession,
    task_id: UUID,
    error_message: str,
    *,
    refund_quota_on_failure: bool = False,
    preserve_successful_long_segments: bool = False,
) -> tuple[VideoTask | None, list[str]]:
    task = await db.get(VideoTask, task_id)
    if task is None:
        return None, []
    if task.status == VIDEO_TASK_STATUS_FAILED:
        return task, []
    if task.status == VIDEO_TASK_STATUS_SUCCEEDED:
        return task, []

    cleanup_keys: list[str] = []
    if task.video_key:
        cleanup_keys.append(task.video_key)
        task.video_key = None

    if task.task_type == VIDEO_TASK_TYPE_LONG:
        segment_stmt = select(LongVideoSegment).where(LongVideoSegment.task_id == task.id)
        segments = list((await db.execute(segment_stmt)).scalars().all())
        for segment in segments:
            if segment.segment_video_key and not (preserve_successful_long_segments and segment.status == LONG_VIDEO_SEGMENT_STATUS_SUCCEEDED):
                cleanup_keys.append(segment.segment_video_key)
                segment.segment_video_key = None
            if segment.status != LONG_VIDEO_SEGMENT_STATUS_SUCCEEDED:
                segment.status = LONG_VIDEO_SEGMENT_STATUS_FAILED
                segment.finished_at = datetime.now(timezone.utc)
            segment.error_message = error_message

    task.status = VIDEO_TASK_STATUS_FAILED
    task.error_message = error_message
    task.finished_at = datetime.now(timezone.utc)
    task.next_poll_at = None
    if task.provider_status != "failed":
        task.provider_status = "failed"
    charged_amount = int(getattr(task, "charged_quota_consumed", 0) or 0)
    if refund_quota_on_failure and charged_amount > 0 and task.quota_refunded_at is None:
        await refund_quota(db, task.user_id, charged_amount)
        task.charged_quota_consumed = 0
        task.quota_refunded_at = datetime.now(timezone.utc)
        mark_task_charge_skipped(task)
    elif task.charge_status == TASK_CHARGE_STATUS_PENDING:
        mark_task_charge_skipped(task)
    await db.flush()
    return task, cleanup_keys


async def cleanup_storage_keys_best_effort(keys: list[str]) -> None:
    seen: set[str] = set()
    for key in keys:
        if key in seen:
            continue
        seen.add(key)
        await safe_delete_storage_key(key)


def get_task_duration_snapshot(
    task: VideoTask,
    *,
    now: datetime | None = None,
) -> tuple[int | None, int | None, int | None]:
    current_time = now or datetime.now(timezone.utc)

    queue_wait_seconds: int | None = None
    if task.queued_at:
        queue_end = task.processing_started_at or current_time
        queue_wait_seconds = max(0, int((queue_end - task.queued_at).total_seconds()))

    processing_seconds: int | None = None
    if task.processing_started_at:
        processing_end = task.finished_at or current_time
        processing_seconds = max(0, int((processing_end - task.processing_started_at).total_seconds()))

    total_elapsed_seconds: int | None = None
    if task.created_at:
        total_end = task.finished_at or current_time
        total_elapsed_seconds = max(0, int((total_end - task.created_at).total_seconds()))

    return queue_wait_seconds, processing_seconds, total_elapsed_seconds


def get_long_segment_duration_snapshot(
    segment: LongVideoSegment,
    *,
    now: datetime | None = None,
) -> tuple[int | None, int | None, int | None]:
    current_time = now or datetime.now(timezone.utc)

    queue_wait_seconds: int | None = None
    if segment.queued_at:
        queue_end = segment.processing_started_at or current_time
        queue_wait_seconds = max(0, int((queue_end - segment.queued_at).total_seconds()))

    processing_seconds: int | None = None
    if segment.processing_started_at:
        processing_end = segment.finished_at or current_time
        processing_seconds = max(0, int((processing_end - segment.processing_started_at).total_seconds()))

    total_elapsed_seconds: int | None = None
    if segment.created_at:
        total_end = segment.finished_at or current_time
        total_elapsed_seconds = max(0, int((total_end - segment.created_at).total_seconds()))

    return queue_wait_seconds, processing_seconds, total_elapsed_seconds


async def heartbeat_queued_task(db: AsyncSession, task: VideoTask) -> VideoTask:
    task.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(task)
    return task


async def heartbeat_active_video_task(db: AsyncSession, task: VideoTask) -> VideoTask:
    task.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(task)
    return task


async def heartbeat_long_segment(db: AsyncSession, segment: LongVideoSegment) -> LongVideoSegment:
    segment.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(segment)
    return segment


def _task_execution_lock_timeout_seconds(task_type: str) -> int:
    if task_type == VIDEO_TASK_TYPE_LONG:
        return max(
            settings.VIDEO_GENERATE_TIMEOUT_SECONDS * LONG_VIDEO_MAX_IMAGES + settings.VIDEO_MERGE_TIMEOUT_SECONDS + 300,
            3600,
        )
    return max(settings.VIDEO_GENERATE_TIMEOUT_SECONDS + 300, 1800)


@asynccontextmanager
async def hold_task_execution_lock(task: VideoTask):
    try:
        redis = await get_redis()
    except Exception:
        logger.warning("Failed to connect to Redis for task execution lock. Proceeding without lock.", exc_info=True)
        yield True
        return

    lock = redis.lock(
        f"{TASK_EXECUTION_LOCK_PREFIX}:{task.id}",
        timeout=_task_execution_lock_timeout_seconds(task.task_type),
        blocking_timeout=0,
    )
    acquired = False
    try:
        acquired = await lock.acquire(blocking=False)
        yield acquired
    finally:
        if acquired:
            try:
                await lock.release()
            except Exception:
                logger.warning("Failed to release task execution lock for %s.", task.id, exc_info=True)


async def wait_for_task_execution_turn(db: AsyncSession, task_id: UUID, *, allow_resume: bool = False) -> VideoTask | None:
    task = await db.get(VideoTask, task_id)
    if task is None:
        return None
    if task.status in {VIDEO_TASK_STATUS_SUCCEEDED, VIDEO_TASK_STATUS_FAILED}:
        return task
    if task.status in {VIDEO_TASK_STATUS_PROCESSING, VIDEO_TASK_STATUS_MERGING}:
        return task if allow_resume else None
    if settings.VIDEO_PROVIDER_CONCURRENCY_LIMIT <= 0:
        task.status = VIDEO_TASK_STATUS_PROCESSING
        task.error_message = None
        task.processing_started_at = task.processing_started_at or datetime.now(timezone.utc)
        task.finished_at = None
        await db.commit()
        await db.refresh(task)
        return task

    heartbeat_at = datetime.now(timezone.utc)
    lock_timeout_seconds = max(
        settings.VIDEO_GENERATE_TIMEOUT_SECONDS + settings.VIDEO_MERGE_TIMEOUT_SECONDS,
        120,
    )
    while True:
        await db.refresh(task)
        if task.status in {VIDEO_TASK_STATUS_SUCCEEDED, VIDEO_TASK_STATUS_FAILED}:
            return task
        if task.status in {VIDEO_TASK_STATUS_PROCESSING, VIDEO_TASK_STATUS_MERGING}:
            return task if allow_resume else None

        now = datetime.now(timezone.utc)
        if now >= heartbeat_at + timedelta(seconds=settings.VIDEO_PROVIDER_QUEUE_HEARTBEAT_SECONDS):
            task = await heartbeat_queued_task(db, task)
            heartbeat_at = now

        try:
            redis = await get_redis()
        except Exception:
            logger.warning(
                "Failed to connect to Redis for task queue ordering. Proceeding without the FIFO gate.",
                exc_info=True,
            )
            task.status = VIDEO_TASK_STATUS_PROCESSING
            task.error_message = None
            task.processing_started_at = task.processing_started_at or now
            task.finished_at = None
            await db.commit()
            await db.refresh(task)
            return task

        lock = redis.lock(
            PROVIDER_QUEUE_LOCK_KEY,
            timeout=lock_timeout_seconds,
            blocking_timeout=5,
        )
        acquired = False
        try:
            acquired = await lock.acquire(blocking=True)
            if not acquired:
                await asyncio.sleep(1)
                continue

            await db.refresh(task)
            if task.status in {VIDEO_TASK_STATUS_SUCCEEDED, VIDEO_TASK_STATUS_FAILED}:
                return task
            if task.status in {VIDEO_TASK_STATUS_PROCESSING, VIDEO_TASK_STATUS_MERGING}:
                return task if allow_resume else None

            eligible_stmt = (
                select(VideoTask.id)
                .where(
                    VideoTask.service_tier == TASK_SERVICE_TIER_STANDARD,
                    VideoTask.status.in_(ACTIVE_VIDEO_TASK_STATUSES),
                )
                .order_by(VideoTask.queued_at.asc(), VideoTask.created_at.asc(), VideoTask.id.asc())
                .limit(settings.VIDEO_PROVIDER_CONCURRENCY_LIMIT)
            )
            eligible_ids = list((await db.execute(eligible_stmt)).scalars().all())
            if task.id in eligible_ids:
                task.status = VIDEO_TASK_STATUS_PROCESSING
                task.error_message = None
                task.processing_started_at = task.processing_started_at or now
                task.finished_at = None
                await db.commit()
                await db.refresh(task)
                return task
        finally:
            if acquired:
                try:
                    await lock.release()
                except Exception:
                    logger.warning("Failed to release FIFO queue lock.", exc_info=True)

        await asyncio.sleep(1)


async def call_provider_with_resilience(
    provider,
    *,
    input_path: Path,
    output_path: Path,
    prompt: str,
    resolution: str,
    aspect_ratio: str,
    duration_seconds: int,
    logo_path: Path | None,
):
    # For remote async-task providers, retrying the whole call at this layer
    # can submit duplicate third-party jobs. Those providers should manage
    # their own granular network retries internally.
    allow_whole_call_retry = not getattr(provider, "supports_remote_lifecycle", False)
    attempt = 0
    while True:
        try:
            return await asyncio.wait_for(
                provider.generate_image_to_video(
                    input_path=input_path,
                    output_path=output_path,
                    prompt=prompt,
                    resolution=resolution,
                    aspect_ratio=aspect_ratio,
                    duration_seconds=duration_seconds,
                    logo_path=logo_path,
                ),
                timeout=settings.VIDEO_GENERATE_TIMEOUT_SECONDS,
            )
        except Exception as exc:
            should_retry = allow_whole_call_retry and is_retryable_provider_error(exc)
            if attempt >= settings.VIDEO_PROVIDER_MAX_RETRIES or not should_retry:
                if is_retryable_provider_error(exc):
                    if isinstance(exc, (asyncio.TimeoutError, TimeoutError)):
                        raise AppError("videos.provider.timeout", status_code=503) from exc
                    raise AppError("videos.provider.unavailable", status_code=503) from exc
                raise
            backoff_seconds = settings.VIDEO_PROVIDER_RETRY_BACKOFF_SECONDS * (2**attempt)
            logger.warning(
                "Video provider call failed on attempt %s/%s: %s. Retrying in %s seconds.",
                attempt + 1,
                settings.VIDEO_PROVIDER_MAX_RETRIES + 1,
                exc,
                backoff_seconds,
            )
            await asyncio.sleep(backoff_seconds)
            attempt += 1


async def reconcile_stale_video_tasks(*, startup_mode: bool = False) -> int:
    now = datetime.now(timezone.utc)
    stale_seconds = (
        settings.VIDEO_TASK_STALE_STARTUP_SECONDS
        if startup_mode
        else settings.VIDEO_TASK_STALE_SECONDS
    )
    stmt = (
        select(VideoTask)
        .where(
            VideoTask.service_tier == TASK_SERVICE_TIER_STANDARD,
            VideoTask.status.in_(STALE_VIDEO_TASK_STATUSES),
        )
        .order_by(VideoTask.updated_at.asc())
    )
    cleaned = 0
    async with AsyncSessionLocal() as db:
        tasks = list((await db.execute(stmt)).scalars().all())
        for task in tasks:
            if task.task_type == VIDEO_TASK_TYPE_LONG and task.status == VIDEO_TASK_STATUS_PROCESSING:
                failed_segment_stmt = (
                    select(LongVideoSegment.id)
                    .where(
                        LongVideoSegment.task_id == task.id,
                        LongVideoSegment.status == LONG_VIDEO_SEGMENT_STATUS_FAILED,
                    )
                    .limit(1)
                )
                failed_segment_id = (await db.execute(failed_segment_stmt)).scalar_one_or_none()
                if failed_segment_id is not None:
                    continue
            if not is_task_stale(task.updated_at, now=now, stale_seconds=stale_seconds):
                continue
            _, cleanup_keys = await fail_video_task(db, task.id, "视频任务执行超时或中断，请重试。", refund_quota_on_failure=True)
            await db.commit()
            await cleanup_storage_keys_best_effort(cleanup_keys)
            cleaned += 1
    return cleaned


async def reconcile_stale_video_tasks_on_startup() -> None:
    cleaned = await reconcile_stale_video_tasks(startup_mode=True)
    if cleaned > 0:
        logger.warning("Reconciled %s stale video task(s) on startup.", cleaned)


async def recover_flex_video_tasks_on_startup() -> int:
    now = datetime.now(timezone.utc)
    recovered = 0
    async with AsyncSessionLocal() as db:
        submit_stmt = (
            select(VideoTask)
            .where(
                VideoTask.task_type == VIDEO_TASK_TYPE_SHORT,
                VideoTask.service_tier == TASK_SERVICE_TIER_FLEX,
                VideoTask.provider_task_id.is_(None),
                VideoTask.status.in_(FLEX_SUBMIT_RETRYABLE_TASK_STATUSES),
            )
            .order_by(VideoTask.created_at.asc())
        )
        submit_tasks = list((await db.execute(submit_stmt)).scalars().all())
        poll_stmt = (
            select(VideoTask)
            .where(
                VideoTask.task_type == VIDEO_TASK_TYPE_SHORT,
                VideoTask.service_tier == TASK_SERVICE_TIER_FLEX,
                VideoTask.provider_task_id.is_not(None),
                VideoTask.status.in_(FLEX_POLLABLE_VIDEO_TASK_STATUSES),
            )
            .order_by(VideoTask.created_at.asc())
        )
        poll_tasks = list((await db.execute(poll_stmt)).scalars().all())
        finalize_stmt = (
            select(VideoTask)
            .where(
                VideoTask.task_type == VIDEO_TASK_TYPE_SHORT,
                VideoTask.service_tier == TASK_SERVICE_TIER_FLEX,
                VideoTask.provider_task_id.is_not(None),
                VideoTask.status == VIDEO_TASK_STATUS_FINALIZING,
            )
            .order_by(VideoTask.created_at.asc())
        )
        finalize_tasks = list((await db.execute(finalize_stmt)).scalars().all())
        for task in poll_tasks:
            task.next_poll_at = now
            task.error_message = None
            recovered += 1
        await db.commit()

    if submit_tasks:
        from backend.tasks.video import submit_flex_short_video_task_job

        for task in submit_tasks:
            submit_flex_short_video_task_job.delay(str(task.id))
        recovered += len(submit_tasks)

    if finalize_tasks:
        from backend.tasks.video import finalize_flex_short_video_task_job

        for task in finalize_tasks:
            finalize_flex_short_video_task_job.delay(str(task.id))
        recovered += len(finalize_tasks)

    return recovered


async def cleanup_expired_video_files() -> int:
    now = datetime.now(timezone.utc)
    cleaned = 0
    async with AsyncSessionLocal() as db:
        stmt = (
            select(VideoTask)
            .where(
                VideoTask.status == VIDEO_TASK_STATUS_SUCCEEDED,
                VideoTask.expires_at.is_not(None),
                VideoTask.expires_at < now,
                VideoTask.video_key.is_not(None),
            )
            .order_by(VideoTask.expires_at.asc())
            .limit(settings.VIDEO_EXPIRED_CLEANUP_BATCH_SIZE)
        )
        tasks = list((await db.execute(stmt)).scalars().all())
        for task in tasks:
            deleted = await safe_delete_storage_key(task.video_key)
            if deleted:
                task.video_key = None
                cleaned += 1
        await db.commit()
    return cleaned


async def cleanup_expired_video_files_on_startup() -> None:
    cleaned = await cleanup_expired_video_files()
    if cleaned > 0:
        logger.info("Cleaned up %s expired video file(s) on startup.", cleaned)


def get_segment_progress(task: VideoTask) -> tuple[int | None, int | None]:
    if task.task_type != VIDEO_TASK_TYPE_LONG:
        return None, None
    segment_count = len(task.image_keys)
    provider_task_ids = task.provider_task_ids or {}
    completed_segments = provider_task_ids.get("completed_segments", 0)
    if task.status == VIDEO_TASK_STATUS_SUCCEEDED:
        completed_segments = segment_count
    return segment_count, completed_segments


def serialize_long_segments(segments: list[LongVideoSegment] | None) -> list[LongVideoSegmentStatusOut] | None:
    if segments is None:
        return None
    serialized: list[LongVideoSegmentStatusOut] = []
    for segment in segments:
        queue_wait_seconds, processing_seconds, total_elapsed_seconds = get_long_segment_duration_snapshot(segment)
        serialized.append(
            LongVideoSegmentStatusOut(
                id=segment.id,
                sort_order=segment.sort_order,
                image_key=segment.image_key,
                duration_seconds=segment.duration_seconds,
                status=segment.status,
                provider_task_id=segment.provider_task_id,
                segment_video_key=segment.segment_video_key,
                error_message=segment.error_message,
                queued_at=segment.queued_at,
                processing_started_at=segment.processing_started_at,
                finished_at=segment.finished_at,
                queue_wait_seconds=queue_wait_seconds,
                processing_seconds=processing_seconds,
                total_elapsed_seconds=total_elapsed_seconds,
                created_at=segment.created_at,
                updated_at=segment.updated_at,
            )
        )
    return serialized


def to_video_task_out(task: VideoTask, *, long_segments: list[LongVideoSegment] | None = None) -> VideoTaskOut:
    segment_count, completed_segments = get_segment_progress(task)
    queue_wait_seconds, processing_seconds, total_elapsed_seconds = get_task_duration_snapshot(task)
    planned_quota = get_task_planned_quota(task)
    return VideoTaskOut(
        id=task.id,
        task_type=task.task_type,
        service_tier=normalize_service_tier(task.service_tier),
        status=task.status,
        image_keys=task.image_keys,
        resolution=task.resolution,
        aspect_ratio=task.aspect_ratio,
        duration_seconds=task.duration_seconds,
        logo_key=task.logo_key,
        quota_consumed=planned_quota,
        planned_quota_consumed=planned_quota,
        charged_quota_consumed=task.charged_quota_consumed,
        charge_status=task.charge_status,
        charged_at=task.charged_at,
        provider_name=task.provider_name,
        provider_status=task.provider_status,
        video_key=task.video_key,
        download_url=build_download_url(task),
        error_message=task.error_message,
        queued_at=task.queued_at,
        processing_started_at=task.processing_started_at,
        finished_at=task.finished_at,
        queue_wait_seconds=queue_wait_seconds,
        processing_seconds=processing_seconds,
        total_elapsed_seconds=total_elapsed_seconds,
        expires_at=task.expires_at,
        created_at=task.created_at,
        updated_at=task.updated_at,
        segment_count=segment_count,
        completed_segments=completed_segments,
        long_segments=serialize_long_segments(long_segments),
    )


def to_video_task_list_item(task: VideoTask, *, long_segments: list[LongVideoSegment] | None = None) -> VideoTaskListItem:
    segment_count, completed_segments = get_segment_progress(task)
    queue_wait_seconds, processing_seconds, total_elapsed_seconds = get_task_duration_snapshot(task)
    planned_quota = get_task_planned_quota(task)
    return VideoTaskListItem(
        id=task.id,
        task_type=task.task_type,
        service_tier=normalize_service_tier(task.service_tier),
        status=task.status,
        resolution=task.resolution,
        aspect_ratio=task.aspect_ratio,
        duration_seconds=task.duration_seconds,
        quota_consumed=planned_quota,
        planned_quota_consumed=planned_quota,
        charged_quota_consumed=task.charged_quota_consumed,
        charge_status=task.charge_status,
        charged_at=task.charged_at,
        provider_status=task.provider_status,
        video_key=task.video_key,
        download_url=build_download_url(task),
        error_message=task.error_message,
        queued_at=task.queued_at,
        processing_started_at=task.processing_started_at,
        finished_at=task.finished_at,
        queue_wait_seconds=queue_wait_seconds,
        processing_seconds=processing_seconds,
        total_elapsed_seconds=total_elapsed_seconds,
        created_at=task.created_at,
        updated_at=task.updated_at,
        segment_count=segment_count,
        completed_segments=completed_segments,
        long_segments=serialize_long_segments(long_segments),
    )


def build_download_url(task: VideoTask) -> str | None:
    if task.status != VIDEO_TASK_STATUS_SUCCEEDED or not task.video_key:
        return None
    return f"/api/v1/videos/tasks/{task.id}/download"


async def submit_flex_short_video_task(task_id: UUID | str) -> None:
    if isinstance(task_id, str):
        task_id = UUID(task_id)
    async with AsyncSessionLocal() as db:
        task = await db.get(VideoTask, task_id)
        if task is None or task.task_type != VIDEO_TASK_TYPE_SHORT or not is_flex_task(task):
            return
        async with hold_task_execution_lock(task) as acquired:
            if not acquired:
                return
            task = await db.get(VideoTask, task_id)
            if task is None or task.provider_task_id or task.status in {VIDEO_TASK_STATUS_SUCCEEDED, VIDEO_TASK_STATUS_FAILED}:
                return

            provider = get_async_video_provider()
            image_path = get_local_path(task.image_keys[0])
            logo_path = get_local_path(task.logo_key) if task.logo_key else None
            now = datetime.now(timezone.utc)
            task.status = VIDEO_TASK_STATUS_SUBMITTING
            task.error_message = None
            task.processing_started_at = task.processing_started_at or now
            task.finished_at = None
            await db.commit()
            await db.refresh(task)

            try:
                submitted = await asyncio.wait_for(
                    provider.submit_image_to_video(
                        input_path=image_path,
                        prompt=task.prompt,
                        resolution=task.resolution,
                        aspect_ratio=task.aspect_ratio,
                        duration_seconds=task.duration_seconds,
                        logo_path=logo_path,
                    ),
                    timeout=settings.VIDEO_GENERATE_TIMEOUT_SECONDS,
                )
                now = datetime.now(timezone.utc)
                task.provider_name = submitted.provider_name
                task.provider_task_id = submitted.provider_task_id
                task.provider_task_ids = merge_provider_task_ids(
                    task.provider_task_ids,
                    submitted.provider_task_ids,
                    provider_task_id=submitted.provider_task_id,
                )
                task.provider_status = VIDEO_TASK_STATUS_SUBMITTED
                task.provider_submitted_at = now
                task.provider_last_polled_at = now
                task.next_poll_at = build_next_flex_poll_at(now=now)
                task.status = VIDEO_TASK_STATUS_SUBMITTED
                await db.commit()
            except Exception as exc:
                await db.rollback()
                _, cleanup_keys = await fail_video_task(db, task_id, str(exc), refund_quota_on_failure=True)
                await db.commit()
                await cleanup_storage_keys_best_effort(cleanup_keys)


async def poll_flex_short_video_tasks(*, limit: int | None = None) -> int:
    batch_size = limit or settings.FLEX_POLL_BATCH_SIZE
    now = datetime.now(timezone.utc)
    task_ids_to_finalize: list[str] = []
    polled = 0
    async with AsyncSessionLocal() as db:
        stmt = (
            select(VideoTask)
            .where(
                VideoTask.task_type == VIDEO_TASK_TYPE_SHORT,
                VideoTask.service_tier == TASK_SERVICE_TIER_FLEX,
                VideoTask.provider_task_id.is_not(None),
                VideoTask.status.in_(FLEX_POLLABLE_VIDEO_TASK_STATUSES),
                VideoTask.next_poll_at.is_not(None),
                VideoTask.next_poll_at <= now,
            )
            .order_by(VideoTask.next_poll_at.asc(), VideoTask.created_at.asc())
            .limit(batch_size)
        )
        tasks = list((await db.execute(stmt)).scalars().all())
        if not tasks:
            return 0

        provider = get_async_video_provider()
        for task in tasks:
            polled += 1
            if is_flex_task_stale(task, now=now):
                _, cleanup_keys = await fail_video_task(
                    db,
                    task.id,
                    "videos.flex.timeout",
                    refund_quota_on_failure=True,
                )
                await db.commit()
                await cleanup_storage_keys_best_effort(cleanup_keys)
                continue

            try:
                snapshot = await provider.get_video_task(task.provider_task_id)
                current_time = datetime.now(timezone.utc)
                task.provider_last_polled_at = current_time
                task.provider_status = snapshot.status
                task.provider_task_ids = merge_provider_task_ids(
                    task.provider_task_ids,
                    snapshot.provider_task_ids,
                    provider_task_id=task.provider_task_id,
                )
                task.error_message = None
                if snapshot.status == "succeeded":
                    task.provider_completed_at = current_time
                    task.status = VIDEO_TASK_STATUS_FINALIZING
                    task.next_poll_at = None
                    task_ids_to_finalize.append(str(task.id))
                elif snapshot.status == "failed":
                    _, cleanup_keys = await fail_video_task(
                        db,
                        task.id,
                        snapshot.error_message or "videos.provider.failed",
                        refund_quota_on_failure=True,
                    )
                    await db.commit()
                    await cleanup_storage_keys_best_effort(cleanup_keys)
                    continue
                else:
                    task.status = VIDEO_TASK_STATUS_PROVIDER_PROCESSING
                    task.next_poll_at = build_next_flex_poll_at(now=current_time)
                await db.commit()
            except Exception as exc:
                await db.rollback()
                task = await db.get(VideoTask, task.id)
                if task is None:
                    continue
                if is_retryable_provider_error(exc):
                    current_time = datetime.now(timezone.utc)
                    task.provider_last_polled_at = current_time
                    task.provider_status = task.provider_status or VIDEO_TASK_STATUS_PROVIDER_PROCESSING
                    task.status = VIDEO_TASK_STATUS_PROVIDER_PROCESSING
                    task.next_poll_at = build_next_flex_poll_at(now=current_time)
                    await db.commit()
                    continue
                _, cleanup_keys = await fail_video_task(db, task.id, str(exc), refund_quota_on_failure=True)
                await db.commit()
                await cleanup_storage_keys_best_effort(cleanup_keys)

    if task_ids_to_finalize:
        from backend.tasks.video import finalize_flex_short_video_task_job

        for task_id in task_ids_to_finalize:
            finalize_flex_short_video_task_job.delay(task_id)
    return polled


async def finalize_flex_short_video_task(task_id: UUID | str) -> None:
    if isinstance(task_id, str):
        task_id = UUID(task_id)
    async with AsyncSessionLocal() as db:
        task = await db.get(VideoTask, task_id)
        if task is None or task.task_type != VIDEO_TASK_TYPE_SHORT or not is_flex_task(task):
            return
        async with hold_task_execution_lock(task) as acquired:
            if not acquired:
                return
            task = await db.get(VideoTask, task_id)
            if task is None or task.status in {VIDEO_TASK_STATUS_SUCCEEDED, VIDEO_TASK_STATUS_FAILED}:
                return
            if not task.provider_task_id:
                _, cleanup_keys = await fail_video_task(db, task_id, "videos.flex.providerTaskMissing", refund_quota_on_failure=True)
                await db.commit()
                await cleanup_storage_keys_best_effort(cleanup_keys)
                return

            provider = get_async_video_provider()
            output_key: str | None = None
            output_path: Path | None = None
            temp_output_path: Path | None = None
            try:
                snapshot: ProviderTaskSnapshot = await provider.get_video_task(task.provider_task_id)
                if snapshot.status != "succeeded" or not snapshot.video_url:
                    task.provider_last_polled_at = datetime.now(timezone.utc)
                    task.provider_status = snapshot.status
                    task.status = VIDEO_TASK_STATUS_PROVIDER_PROCESSING
                    task.next_poll_at = build_next_flex_poll_at()
                    await db.commit()
                    return

                current_time = datetime.now(timezone.utc)
                task.status = VIDEO_TASK_STATUS_FINALIZING
                task.provider_status = snapshot.status
                task.provider_last_polled_at = current_time
                task.provider_completed_at = task.provider_completed_at or current_time
                task.next_poll_at = None
                await db.commit()
                await db.refresh(task)

                output_key = create_output_key()
                output_path = get_local_path(output_key)
                temp_output_path = create_temporary_output_path(output_path)
                await provider.download_generated_video(snapshot.video_url, temp_output_path)
                if task.logo_key:
                    logo_path = get_local_path(task.logo_key)
                    if logo_path.exists():
                        await asyncio.to_thread(apply_logo_to_video_file, temp_output_path, logo_path)
                temp_output_path.replace(output_path)

                task.video_key = output_key
                task.provider_name = task.provider_name or provider.provider_name
                task.provider_task_ids = merge_provider_task_ids(
                    task.provider_task_ids,
                    snapshot.provider_task_ids,
                    provider_task_id=task.provider_task_id,
                )
                await settle_task_quota_charge(db, task)
                task.status = VIDEO_TASK_STATUS_SUCCEEDED
                task.finished_at = datetime.now(timezone.utc)
                task.expires_at = datetime.now(timezone.utc) + timedelta(days=await get_storage_days_for_user(db, task.user_id))
                await db.commit()
            except Exception as exc:
                await db.rollback()
                _, cleanup_keys = await fail_video_task(db, task_id, str(exc), refund_quota_on_failure=True)
                await db.commit()
                if output_key:
                    cleanup_keys.append(output_key)
                await cleanup_storage_keys_best_effort(cleanup_keys)
                safe_delete_local_path(temp_output_path)
                safe_delete_local_path(output_path)


async def process_short_video_task(task_id: UUID | str) -> None:
    if isinstance(task_id, str):
        task_id = UUID(task_id)
    async with AsyncSessionLocal() as db:
        task = await db.get(VideoTask, task_id)
        if task is None:
            return
        if is_flex_task(task):
            return await submit_flex_short_video_task(task_id)
        async with hold_task_execution_lock(task) as acquired:
            if not acquired:
                return

            task = await wait_for_task_execution_turn(db, task_id)
            if task is None:
                return
            if task.status in {
                VIDEO_TASK_STATUS_SUCCEEDED,
                VIDEO_TASK_STATUS_FAILED,
            }:
                return

            output_key: str | None = None
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
                task.provider_task_id = generated.provider_task_ids.get("provider_task_id")
                task.provider_status = "succeeded"
                task.provider_submitted_at = task.provider_submitted_at or datetime.now(timezone.utc)
                task.provider_last_polled_at = datetime.now(timezone.utc)
                task.provider_completed_at = datetime.now(timezone.utc)
                task.next_poll_at = None
                await settle_task_quota_charge(db, task)
                task.status = VIDEO_TASK_STATUS_SUCCEEDED
                task.finished_at = datetime.now(timezone.utc)
                task.expires_at = datetime.now(timezone.utc) + timedelta(days=await get_storage_days_for_user(db, task.user_id))
                await db.commit()
            except Exception as exc:
                await db.rollback()
                _, cleanup_keys = await fail_video_task(db, task_id, str(exc), refund_quota_on_failure=True)
                await db.commit()
                if output_key:
                    cleanup_keys.append(output_key)
                await cleanup_storage_keys_best_effort(cleanup_keys)


async def process_long_video_task(task_id: UUID | str) -> None:
    if isinstance(task_id, str):
        task_id = UUID(task_id)
    async with AsyncSessionLocal() as db:
        task = await db.get(VideoTask, task_id)
        if task is None:
            return
        async with hold_task_execution_lock(task) as acquired:
            if not acquired:
                return

            task = await wait_for_task_execution_turn(db, task_id, allow_resume=True)
            if task is None:
                return
            if task.status in {
                VIDEO_TASK_STATUS_SUCCEEDED,
                VIDEO_TASK_STATUS_FAILED,
            }:
                return

            segment_keys: list[str] = []
            final_output_key: str | None = None
            temp_output_path: Path | None = None
            try:
                segment_stmt = (
                    select(LongVideoSegment)
                    .where(LongVideoSegment.task_id == task.id)
                    .order_by(LongVideoSegment.sort_order.asc(), LongVideoSegment.created_at.asc())
                )
                segments = list((await db.execute(segment_stmt)).scalars().all())
                if len(segments) < LONG_VIDEO_MIN_IMAGES:
                    raise AppError("videos.long.invalidSegments")

                existing_provider_details = task.provider_task_ids or {}
                provider_details: dict[str, dict[str, str]] = dict(existing_provider_details.get("segments") or {})
                completed_segments = 0
                for segment in segments:
                    if segment.status == LONG_VIDEO_SEGMENT_STATUS_SUCCEEDED and segment.segment_video_key:
                        segment_keys.append(segment.segment_video_key)
                        completed_segments += 1
                        if segment.provider_task_id:
                            provider_details[str(segment.id)] = {"provider_task_id": segment.provider_task_id}
                        continue

                    if segment.status == LONG_VIDEO_SEGMENT_STATUS_FAILED:
                        task.error_message = segment.error_message or f"长视频片段失败：{segment.id}"
                        task.provider_task_ids = {
                            "segment_count": len(segments),
                            "completed_segments": completed_segments,
                            "segments": provider_details,
                        }
                        await db.commit()
                        return

                    existing_provider_task_id = segment.provider_task_id if segment.status == LONG_VIDEO_SEGMENT_STATUS_PROCESSING else None
                    if segment.status == LONG_VIDEO_SEGMENT_STATUS_PROCESSING and not existing_provider_task_id:
                        segment.status = LONG_VIDEO_SEGMENT_STATUS_QUEUED

                    segment.status = LONG_VIDEO_SEGMENT_STATUS_PROCESSING
                    segment.error_message = None
                    segment.processing_started_at = segment.processing_started_at or datetime.now(timezone.utc)
                    segment.finished_at = None
                    await heartbeat_long_segment(db, segment)
                    await heartbeat_active_video_task(db, task)

                    template_id = segment.scene_template_id or task.scene_template_id
                    if template_id is None:
                        raise AppError("videos.template.unavailable")
                    template_category = SCENE_TEMPLATE_CATEGORY_SHORT if segment.scene_template_id is not None else SCENE_TEMPLATE_CATEGORY_LONG_UNIFIED
                    template = await get_enabled_scene_template_by_category(
                        db,
                        template_id,
                        category=template_category,
                    )
                    try:
                        output_key, generated = await generate_long_segment_output(
                            task=task,
                            segment=segment,
                            prompt=template.prompt.strip(),
                            db=db,
                            existing_provider_task_id=existing_provider_task_id,
                        )
                    except Exception as segment_exc:
                        await db.rollback()
                        task = await db.get(VideoTask, task_id)
                        segment = await db.get(LongVideoSegment, segment.id)
                        if task is None or segment is None:
                            return
                        segment.status = LONG_VIDEO_SEGMENT_STATUS_FAILED
                        segment.error_message = str(segment_exc)
                        segment.finished_at = datetime.now(timezone.utc)
                        task.error_message = str(segment_exc)
                        task.provider_task_ids = {
                            "segment_count": len(segments),
                            "completed_segments": completed_segments,
                            "segments": provider_details,
                        }
                        await db.commit()
                        return
                    segment.segment_video_key = output_key
                    segment.provider_task_id = generated.provider_task_ids.get("provider_task_id") or next(
                        iter(generated.provider_task_ids.values()),
                        None,
                    )
                    segment.status = LONG_VIDEO_SEGMENT_STATUS_SUCCEEDED
                    segment.error_message = None
                    segment.finished_at = datetime.now(timezone.utc)
                    segment_keys.append(output_key)
                    completed_segments += 1
                    provider_details[str(segment.id)] = generated.provider_task_ids
                    task.provider_name = generated.provider_name
                    task.provider_task_ids = {
                        "segment_count": len(segments),
                        "completed_segments": completed_segments,
                        "segments": provider_details,
                    }
                    await db.commit()

                task.status = VIDEO_TASK_STATUS_MERGING
                task.error_message = None
                await heartbeat_active_video_task(db, task)

                final_output_key = create_output_key()
                final_output_path = get_local_path(final_output_key)
                temp_output_path = create_temporary_output_path(final_output_path)
                await asyncio.wait_for(
                    asyncio.to_thread(
                        merge_segment_videos,
                        [get_local_path(key) for key in segment_keys],
                        temp_output_path,
                        fps=settings.VIDEO_FPS,
                    ),
                    timeout=settings.VIDEO_MERGE_TIMEOUT_SECONDS,
                )
                temp_output_path.replace(final_output_path)
                if task.logo_key:
                    logo_path = get_local_path(task.logo_key)
                    if logo_path.exists():
                        await asyncio.to_thread(apply_logo_to_video_file, final_output_path, logo_path)

                task.video_key = final_output_key
                await settle_task_quota_charge(db, task)
                task.status = VIDEO_TASK_STATUS_SUCCEEDED
                task.finished_at = datetime.now(timezone.utc)
                task.expires_at = datetime.now(timezone.utc) + timedelta(days=await get_storage_days_for_user(db, task.user_id))
                task.provider_task_ids = {
                    **(task.provider_task_ids or {}),
                    "segment_count": len(segments),
                    "completed_segments": len(segments),
                    "segments": provider_details,
                }
                await db.commit()
                await cleanup_storage_keys_best_effort(segment_keys)
            except Exception as exc:
                await db.rollback()
                _, cleanup_keys = await fail_video_task(
                    db,
                    task_id,
                    str(exc),
                    refund_quota_on_failure=True,
                    preserve_successful_long_segments=True,
                )
                await db.commit()
                if final_output_key:
                    cleanup_keys.append(final_output_key)
                await cleanup_storage_keys_best_effort(cleanup_keys)
                safe_delete_local_path(temp_output_path)


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
    temp_output_path = create_temporary_output_path(output_path)

    try:
        result = await call_provider_with_resilience(
            provider,
            input_path=image_path,
            output_path=temp_output_path,
            prompt=prompt,
            resolution=resolution,
            aspect_ratio=aspect_ratio,
            duration_seconds=duration_seconds,
            logo_path=logo_path,
        )
        temp_output_path.replace(output_path)
        return output_key, result
    except Exception:
        safe_delete_local_path(temp_output_path)
        safe_delete_local_path(output_path)
        raise


async def generate_long_segment_output(
    *,
    task: VideoTask,
    segment: LongVideoSegment,
    prompt: str,
    db: AsyncSession,
    existing_provider_task_id: str | None = None,
) -> tuple[str, GeneratedVideo]:
    provider = get_video_provider()
    image_path = get_local_path(segment.image_key)
    output_key = create_output_key()
    output_path = get_local_path(output_key)
    temp_output_path = create_temporary_output_path(output_path)

    try:
        if isinstance(provider, AsyncTaskVideoProvider):
            submitted: SubmittedVideoTask
            if existing_provider_task_id:
                submitted = SubmittedVideoTask(
                    provider_name=provider.provider_name,
                    provider_task_id=existing_provider_task_id,
                    provider_task_ids={"provider_task_id": existing_provider_task_id},
                )
            else:
                submitted = await provider.submit_image_to_video(
                    input_path=image_path,
                    prompt=prompt,
                    resolution=task.resolution,
                    aspect_ratio=task.aspect_ratio,
                    duration_seconds=segment.duration_seconds,
                    logo_path=None,
                )
                segment.provider_task_id = submitted.provider_task_id
                await heartbeat_long_segment(db, segment)
                task.provider_name = submitted.provider_name
                await heartbeat_active_video_task(db, task)

            poll_interval_seconds = max(settings.VIDEO_POLL_INTERVAL_SECONDS, 1)
            deadline = asyncio.get_running_loop().time() + max(
                settings.VIDEO_MAX_POLL_SECONDS,
                poll_interval_seconds,
            )
            while True:
                snapshot = await provider.get_video_task(submitted.provider_task_id)
                await heartbeat_long_segment(db, segment)
                await heartbeat_active_video_task(db, task)
                if snapshot.status == "succeeded":
                    break
                if snapshot.status == "failed":
                    raise RuntimeError(snapshot.error_message or "视频生成失败")
                if asyncio.get_running_loop().time() >= deadline:
                    raise TimeoutError(f"视频生成任务轮询超时: {submitted.provider_task_id}")
                await asyncio.sleep(poll_interval_seconds)
            if not snapshot.video_url:
                raise RuntimeError("视频生成成功，但未返回可下载的视频地址")
            await provider.download_generated_video(snapshot.video_url, temp_output_path)
            temp_output_path.replace(output_path)

            provider_task_ids = {
                **submitted.provider_task_ids,
                "provider_task_id": submitted.provider_task_id,
            }
            if snapshot.provider_task_ids:
                provider_task_ids.update(snapshot.provider_task_ids)
            return output_key, GeneratedVideo(provider_name=submitted.provider_name, provider_task_ids=provider_task_ids)

        result = await call_provider_with_resilience(
            provider,
            input_path=image_path,
            output_path=temp_output_path,
            prompt=prompt,
            resolution=task.resolution,
            aspect_ratio=task.aspect_ratio,
            duration_seconds=segment.duration_seconds,
            logo_path=None,
        )
        temp_output_path.replace(output_path)
        return output_key, result
    except Exception:
        safe_delete_local_path(temp_output_path)
        safe_delete_local_path(output_path)
        raise


def create_output_key() -> str:
    now = datetime.now(timezone.utc)
    prefix = f"videos/{now:%Y/%m/%d}"
    return make_storage_key(prefix, ".mp4")
