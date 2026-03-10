#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import statistics
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO
from typing import Sequence
from uuid import UUID
from uuid import uuid4

from PIL import Image, ImageDraw
from sqlalchemy import select

from backend.core.config import settings
from backend.core.database import AsyncSessionLocal
from backend.core.scene_templates import SCENE_TEMPLATE_CATEGORY_SHORT
from backend.models.quota import QuotaPackage
from backend.models.scene_template import SceneTemplate
from backend.models.user import User
from backend.models.video_task import VideoTask
from backend.services.auth_service import _hash_password
from backend.services.quota_service import ensure_signup_bonus, get_quota_snapshot
from backend.services.storage_service import save_bytes
from backend.services.video_service import (
    create_short_video_task,
    enqueue_video_task_or_fail,
    sync_scene_templates,
)
from backend.tasks.video import process_short_video_task_job


@dataclass
class TaskMetrics:
    task_id: str
    status: str
    queue_wait_seconds: int | None
    processing_seconds: int | None
    total_elapsed_seconds: int | None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Queue load test without calling the real video provider API.")
    parser.add_argument("--tasks", type=int, default=8, help="Number of short video tasks to enqueue.")
    parser.add_argument("--poll-interval", type=float, default=2.0, help="Polling interval in seconds.")
    parser.add_argument("--timeout", type=int, default=1800, help="Overall timeout in seconds.")
    parser.add_argument("--prefix", default="queue-loadtest", help="Username/email prefix for the generated load test user.")
    return parser.parse_args()


def percentile(values: Sequence[int], p: float) -> int:
    if not values:
        return 0
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, round((len(ordered) - 1) * p)))
    return ordered[index]


def build_summary(values: Sequence[int]) -> dict[str, float | int]:
    if not values:
        return {"count": 0, "min": 0, "p50": 0, "p95": 0, "max": 0, "avg": 0}
    return {
        "count": len(values),
        "min": min(values),
        "p50": percentile(values, 0.50),
        "p95": percentile(values, 0.95),
        "max": max(values),
        "avg": round(statistics.fmean(values), 2),
    }


def make_test_image(index: int) -> bytes:
    image = Image.new("RGB", (1280, 720), color=((index * 37) % 255, (index * 71) % 255, (index * 113) % 255))
    draw = ImageDraw.Draw(image)
    draw.rectangle((40, 40, 1240, 680), outline=(255, 255, 255), width=8)
    draw.text((80, 80), f"Queue load test #{index + 1}", fill=(255, 255, 255))
    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


async def ensure_loadtest_user(prefix: str, required_quota: int) -> tuple[User, SceneTemplate]:
    async with AsyncSessionLocal() as db:
        await sync_scene_templates(db)
        timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
        unique_suffix = uuid4().hex[:6]
        username = f"{prefix}-{timestamp}-{unique_suffix}"
        email = f"{username}@local.test"
        user = User(
            username=username,
            email=email,
            password_hash=_hash_password("Loadtest!1"),
            email_verified=True,
            preferred_language="en",
            status="active",
        )
        db.add(user)
        await db.flush()
        await ensure_signup_bonus(db, user.id)
        extra_quota = max(required_quota - 5, 0)
        if extra_quota > 0:
            db.add(
                QuotaPackage(
                    user_id=user.id,
                    package_type="load_test",
                    quota_total=extra_quota,
                    quota_used=0,
                    expires_at=None,
                    stripe_payment_intent_id=None,
                )
            )
        template_stmt = (
            select(SceneTemplate)
            .where(SceneTemplate.category == SCENE_TEMPLATE_CATEGORY_SHORT, SceneTemplate.is_enabled.is_(True))
            .order_by(SceneTemplate.sort_order.asc(), SceneTemplate.created_at.asc())
            .limit(1)
        )
        template = (await db.execute(template_stmt)).scalar_one()
        await db.commit()
        return user, template


async def create_and_enqueue_tasks(task_count: int, prefix: str) -> tuple[list[UUID], str]:
    user, template = await ensure_loadtest_user(prefix, task_count)
    async with AsyncSessionLocal() as db:
        user = await db.get(User, user.id)
        if user is None:
            raise RuntimeError("Load test user could not be reloaded.")

        task_ids: list[UUID] = []
        for index in range(task_count):
            image_key = await save_bytes(
                f"uploads/{user.id}/images",
                make_test_image(index),
                ".png",
                "image/png",
            )
            task = await create_short_video_task(
                db,
                user,
                image_key=image_key,
                scene_template_id=template.id,
                resolution="1080p",
                aspect_ratio="16:9",
                duration_seconds=4,
                logo_key=None,
                service_tier="standard",
            )
            await db.commit()
            await db.refresh(task)
            await enqueue_video_task_or_fail(db, task=task, enqueue_fn=process_short_video_task_job.delay)
            task_ids.append(task.id)

        snapshot = await get_quota_snapshot(db, user.id)
        print(
            f"Created {task_count} tasks for {user.username}. "
            f"Remaining quota after enqueue: {snapshot['total_available'] - await get_pending_reserved(db, user.id)}"
        )
        return task_ids, user.username


async def get_pending_reserved(db, user_id) -> int:
    from backend.services.quota_service import get_pending_task_charge_amount

    return await get_pending_task_charge_amount(db, user_id)


async def collect_metrics(task_ids: Sequence[UUID], poll_interval: float, timeout: int) -> list[TaskMetrics]:
    started_at = time.perf_counter()
    last_reported = -1
    while True:
        async with AsyncSessionLocal() as db:
            stmt = select(VideoTask).where(VideoTask.id.in_(task_ids)).order_by(VideoTask.created_at.asc())
            tasks = list((await db.execute(stmt)).scalars().all())

        completed = sum(1 for task in tasks if task.finished_at is not None)
        if completed != last_reported:
            states: dict[str, int] = {}
            for task in tasks:
                states[task.status] = states.get(task.status, 0) + 1
            print(f"[progress] completed={completed}/{len(task_ids)} states={states}")
            last_reported = completed

        if completed == len(task_ids):
            return [
                TaskMetrics(
                    task_id=str(task.id),
                    status=task.status,
                    queue_wait_seconds=None if task.queued_at is None else max(
                        0,
                        int(((task.processing_started_at or task.finished_at or task.queued_at) - task.queued_at).total_seconds()),
                    ),
                    processing_seconds=None if task.processing_started_at is None else max(
                        0,
                        int(((task.finished_at or task.processing_started_at) - task.processing_started_at).total_seconds()),
                    ),
                    total_elapsed_seconds=None if task.created_at is None else max(
                        0,
                        int(((task.finished_at or task.created_at) - task.created_at).total_seconds()),
                    ),
                )
                for task in tasks
            ]

        if time.perf_counter() - started_at > timeout:
            raise TimeoutError(f"Timed out waiting for {len(task_ids)} tasks to finish.")

        await asyncio.sleep(poll_interval)


async def async_main(args: argparse.Namespace) -> int:
    task_ids, username = await create_and_enqueue_tasks(args.tasks, args.prefix)
    test_started = time.perf_counter()
    metrics = await collect_metrics(task_ids, args.poll_interval, args.timeout)
    elapsed = round(time.perf_counter() - test_started, 2)

    queue_values = [value for value in (item.queue_wait_seconds for item in metrics) if value is not None]
    processing_values = [value for value in (item.processing_seconds for item in metrics) if value is not None]
    total_values = [value for value in (item.total_elapsed_seconds for item in metrics) if value is not None]
    succeeded = sum(1 for item in metrics if item.status == "succeeded")
    failed = [item for item in metrics if item.status != "succeeded"]

    print("")
    print("=== Queue load test summary ===")
    print(f"user={username}")
    print(f"tasks={len(metrics)} succeeded={succeeded} failed={len(failed)} elapsed_seconds={elapsed}")
    print(f"provider_config_path={settings.AI_PROVIDER_CONFIG_FILE}")
    print(f"video_provider_concurrency_limit={settings.VIDEO_PROVIDER_CONCURRENCY_LIMIT}")
    print(f"video_queue_heartbeat_seconds={settings.VIDEO_PROVIDER_QUEUE_HEARTBEAT_SECONDS}")
    print(f"local_video_provider_delay_seconds={settings.LOCAL_VIDEO_PROVIDER_DELAY_SECONDS}")
    print(f"queue_wait={build_summary(queue_values)}")
    print(f"processing={build_summary(processing_values)}")
    print(f"total_elapsed={build_summary(total_values)}")
    if elapsed > 0:
        print(f"throughput_tasks_per_minute={round((succeeded / elapsed) * 60, 2)}")

    if failed:
        print("failed_task_ids=" + ",".join(item.task_id for item in failed))
        return 1
    return 0


def main() -> int:
    args = parse_args()
    return asyncio.run(async_main(args))


if __name__ == "__main__":
    raise SystemExit(main())
