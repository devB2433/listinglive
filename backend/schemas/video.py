"""
视频任务相关 schema
"""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class SceneTemplateOut(BaseModel):
    id: UUID
    template_key: str
    name: str
    sort_order: int

    class Config:
        from_attributes = True


class UploadFileResponse(BaseModel):
    key: str
    url: str | None = None


class UserLogoOut(BaseModel):
    id: UUID
    key: str
    name: str
    is_default: bool


class UploadLogoResponse(UserLogoOut):
    pass


class CreateShortVideoTaskRequest(BaseModel):
    image_key: str
    scene_template_id: UUID
    resolution: str = Field(pattern=r"^(480p|720p|1080p)$")
    aspect_ratio: str = Field(pattern=r"^(16:9|9:16|1:1|adaptive)$")
    duration_seconds: int = Field(ge=2, le=10)
    logo_key: str | None = None


class LongVideoSegmentInput(BaseModel):
    image_key: str
    scene_template_id: UUID
    duration_seconds: int = Field(ge=2, le=10)
    sort_order: int = Field(ge=0)


class LongVideoSegmentStatusOut(BaseModel):
    id: UUID
    sort_order: int
    image_key: str
    duration_seconds: int
    status: str
    provider_task_id: str | None
    segment_video_key: str | None
    error_message: str | None
    queued_at: datetime
    processing_started_at: datetime | None
    finished_at: datetime | None
    queue_wait_seconds: int | None = None
    processing_seconds: int | None = None
    total_elapsed_seconds: int | None = None
    created_at: datetime
    updated_at: datetime


class CreateLongVideoTaskRequest(BaseModel):
    image_keys: list[str] = Field(min_length=2, max_length=10)
    scene_template_id: UUID
    resolution: str = Field(pattern=r"^(480p|720p|1080p)$")
    aspect_ratio: str = Field(pattern=r"^(16:9|9:16|1:1|adaptive)$")
    duration_seconds: int = Field(ge=2, le=10)
    logo_key: str | None = None
    segments: list[LongVideoSegmentInput] | None = None


class VideoTaskOut(BaseModel):
    id: UUID
    task_type: str
    status: str
    image_keys: list[str]
    resolution: str
    aspect_ratio: str
    duration_seconds: int
    logo_key: str | None
    quota_consumed: int
    planned_quota_consumed: int
    charged_quota_consumed: int
    charge_status: str
    charged_at: datetime | None
    provider_name: str | None
    video_key: str | None
    download_url: str | None
    error_message: str | None
    queued_at: datetime
    processing_started_at: datetime | None
    finished_at: datetime | None
    queue_wait_seconds: int | None = None
    processing_seconds: int | None = None
    total_elapsed_seconds: int | None = None
    expires_at: datetime | None
    created_at: datetime
    updated_at: datetime
    segment_count: int | None = None
    completed_segments: int | None = None
    long_segments: list[LongVideoSegmentStatusOut] | None = None


class VideoTaskListItem(BaseModel):
    id: UUID
    task_type: str
    status: str
    resolution: str
    aspect_ratio: str
    duration_seconds: int
    quota_consumed: int
    planned_quota_consumed: int
    charged_quota_consumed: int
    charge_status: str
    charged_at: datetime | None
    video_key: str | None
    download_url: str | None
    error_message: str | None
    queued_at: datetime
    processing_started_at: datetime | None
    finished_at: datetime | None
    queue_wait_seconds: int | None = None
    processing_seconds: int | None = None
    total_elapsed_seconds: int | None = None
    created_at: datetime
    updated_at: datetime
    segment_count: int | None = None
    completed_segments: int | None = None
    long_segments: list[LongVideoSegmentStatusOut] | None = None
