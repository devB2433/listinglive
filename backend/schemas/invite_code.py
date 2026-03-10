"""
邀请码 schema
"""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class InviteCodeOut(BaseModel):
    id: UUID
    code: str
    owner_user_id: UUID | None = None
    created_by_user_id: UUID
    used_by_user_id: UUID | None = None
    is_active: bool
    used_at: datetime | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class AdminCreateInviteCodeRequest(BaseModel):
    owner_user_id: UUID | None = None
