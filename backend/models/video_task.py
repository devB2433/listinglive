"""
视频任务模型
"""
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base


class VideoTask(Base):
    __tablename__ = "video_tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    scene_template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("scene_templates.id"),
        nullable=True,
        index=True,
    )
    task_type: Mapped[str] = mapped_column(String(32), nullable=False, default="short")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="queued")
    image_keys: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    prompt: Mapped[str] = mapped_column(Text, nullable=False)
    resolution: Mapped[str] = mapped_column(String(32), nullable=False)
    aspect_ratio: Mapped[str] = mapped_column(String(32), nullable=False)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    logo_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    quota_consumed: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    planned_quota_consumed: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    charged_quota_consumed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    charge_status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending")
    charged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    provider_name: Mapped[str | None] = mapped_column(String(32), nullable=True)
    provider_task_ids: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    video_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    queued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    processing_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    quota_refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
