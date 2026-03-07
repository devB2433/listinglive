"""
认证相关 schema
"""
from pydantic import BaseModel, EmailStr


class SendCodeRequest(BaseModel):
    email: EmailStr


class RegisterRequest(BaseModel):
    username: str
    password: str
    email: EmailStr
    code: str


class LoginRequest(BaseModel):
    username_or_email: str  # 用户名或邮箱
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str
