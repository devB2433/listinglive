"""
管理后台 schema
"""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class AdminDailyStatPoint(BaseModel):
    date: str
    value: int


class AdminDashboardSummaryOut(BaseModel):
    total_users: int
    new_users_today: int
    tasks_today: int
    succeeded_today: int
    failed_today: int
    processing_now: int
    active_subscriptions: int


class AdminDashboardDailyStatsOut(BaseModel):
    new_users: list[AdminDailyStatPoint]
    tasks_created: list[AdminDailyStatPoint]


class AdminUserListItemOut(BaseModel):
    id: UUID
    username: str
    email: str
    email_verified: bool
    preferred_language: str
    status: str
    invited_by_code: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class AdminUserListOut(BaseModel):
    items: list[AdminUserListItemOut]
    total: int
    page: int
    page_size: int


class AdminResetUserPasswordRequest(BaseModel):
    new_password: str


class AdminMfaStatusOut(BaseModel):
    enabled: bool
    configured: bool
    confirmed_at: datetime | None = None


class AdminMfaSetupOut(BaseModel):
    secret: str
    otpauth_url: str
    qr_svg: str


class AdminMfaEnableRequest(BaseModel):
    code: str


class AdminMfaDisableRequest(BaseModel):
    code: str


class AdminTaskListItemOut(BaseModel):
    id: UUID
    user_id: UUID
    username: str
    email: str
    task_type: str
    service_tier: str
    status: str
    provider_name: str | None = None
    provider_status: str | None = None
    planned_quota_consumed: int
    charged_quota_consumed: int
    charge_status: str
    queued_at: datetime
    processing_started_at: datetime | None = None
    finished_at: datetime | None = None
    queue_wait_seconds: int | None = None
    processing_seconds: int | None = None
    total_elapsed_seconds: int | None = None
    error_message: str | None = None
    created_at: datetime


class AdminTaskListOut(BaseModel):
    items: list[AdminTaskListItemOut]
    total: int
    page: int
    page_size: int


class AdminTaskDetailOut(AdminTaskListItemOut):
    resolution: str
    aspect_ratio: str
    duration_seconds: int
    prompt: str
    video_key: str | None = None

