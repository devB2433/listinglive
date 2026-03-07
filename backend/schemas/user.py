"""
用户相关 schema
"""
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class UserProfile(BaseModel):
    id: UUID
    username: str
    email: str
    email_verified: bool
    preferred_language: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class UserPreferencesUpdate(BaseModel):
    preferred_language: str
