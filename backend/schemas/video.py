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
    property_types: list[str]
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


class UserAvatarOut(BaseModel):
    id: UUID
    key: str
    name: str
    is_default: bool


class UploadAvatarResponse(UserAvatarOut):
    pass


class ProfileCardOptionFlags(BaseModel):
    include_avatar: bool = True
    include_name: bool = True
    include_phone: bool = True
    include_address: bool = True
    include_brokerage_name: bool = True
    include_logo: bool = True


class ProfileCardOut(BaseModel):
    id: UUID
    display_name: str
    template_key: str
    full_name: str
    slogan: str
    phone: str
    contact_address: str
    homepage: str
    email: str
    brokerage_name: str
    avatar_asset_id: UUID | None
    logo_asset_id: UUID | None
    is_default: bool
    show_avatar_default: bool
    show_name_default: bool
    show_phone_default: bool
    show_address_default: bool
    show_brokerage_default: bool
    show_logo_default: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class UpsertProfileCardRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=100)
    template_key: str = Field(default="clean_light", pattern=r"^(clean_light|brand_dark|agent_focus)$")
    full_name: str = Field(min_length=1, max_length=120)
    slogan: str = Field(default="", max_length=160)
    phone: str = Field(min_length=1, max_length=64)
    contact_address: str = Field(min_length=1, max_length=255)
    homepage: str = Field(default="", max_length=255)
    email: str = Field(default="", max_length=255)
    brokerage_name: str = Field(default="", max_length=120)
    avatar_asset_id: UUID | None = None
    logo_asset_id: UUID | None = None
    is_default: bool = False
    show_avatar_default: bool = True
    show_name_default: bool = True
    show_phone_default: bool = True
    show_address_default: bool = True
    show_brokerage_default: bool = True
    show_logo_default: bool = True


class CreateShortVideoTaskRequest(BaseModel):
    image_key: str
    scene_template_id: UUID
    resolution: str = Field(pattern=r"^(480p|720p|1080p)$")
    aspect_ratio: str = Field(pattern=r"^(16:9|9:16|1:1|adaptive)$")
    duration_seconds: int = Field(ge=2, le=10)
    logo_key: str | None = None
    logo_position_x: float | None = Field(default=None, ge=0, le=1)
    logo_position_y: float | None = Field(default=None, ge=0, le=1)
    avatar_key: str | None = None
    avatar_position: str | None = Field(default=None, pattern=r"^(top_left|top_right|bottom_left|bottom_right)$")
    avatar_position_x: float | None = Field(default=None, ge=0, le=1)
    avatar_position_y: float | None = Field(default=None, ge=0, le=1)
    profile_card_id: UUID | None = None
    profile_card_options: ProfileCardOptionFlags | None = None
    service_tier: str = Field(default="standard", pattern=r"^(standard|flex)$")


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
    error_code: str | None = None
    error_source: str | None = None
    error_detail: str | None = None
    error_retryable: bool | None = None
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
    logo_position_x: float | None = Field(default=None, ge=0, le=1)
    logo_position_y: float | None = Field(default=None, ge=0, le=1)
    avatar_key: str | None = None
    avatar_position: str | None = Field(default=None, pattern=r"^(top_left|top_right|bottom_left|bottom_right)$")
    avatar_position_x: float | None = Field(default=None, ge=0, le=1)
    avatar_position_y: float | None = Field(default=None, ge=0, le=1)
    profile_card_id: UUID | None = None
    profile_card_options: ProfileCardOptionFlags | None = None
    segments: list[LongVideoSegmentInput] | None = None
    service_tier: str = Field(default="standard", pattern=r"^(standard|flex)$")


class VideoTaskOut(BaseModel):
    id: UUID
    task_type: str
    service_tier: str
    status: str
    image_keys: list[str]
    resolution: str
    aspect_ratio: str
    duration_seconds: int
    logo_key: str | None
    logo_position_x: float | None = None
    logo_position_y: float | None = None
    avatar_key: str | None
    avatar_position: str | None
    avatar_position_x: float | None = None
    avatar_position_y: float | None = None
    profile_card_id: UUID | None
    profile_card_data: dict | None
    quota_consumed: int
    planned_quota_consumed: int
    charged_quota_consumed: int
    charge_status: str
    charged_at: datetime | None
    provider_name: str | None
    provider_status: str | None
    video_key: str | None
    download_url: str | None
    error_code: str | None = None
    error_source: str | None = None
    error_detail: str | None = None
    error_retryable: bool | None = None
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
    service_tier: str
    status: str
    resolution: str
    aspect_ratio: str
    duration_seconds: int
    logo_key: str | None = None
    logo_position_x: float | None = None
    logo_position_y: float | None = None
    avatar_key: str | None = None
    avatar_position: str | None = None
    avatar_position_x: float | None = None
    avatar_position_y: float | None = None
    profile_card_id: UUID | None = None
    profile_card_data: dict | None = None
    quota_consumed: int
    planned_quota_consumed: int
    charged_quota_consumed: int
    charge_status: str
    charged_at: datetime | None
    provider_status: str | None
    video_key: str | None
    download_url: str | None
    error_code: str | None = None
    error_source: str | None = None
    error_detail: str | None = None
    error_retryable: bool | None = None
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
