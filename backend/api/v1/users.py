"""
用户路由：当前用户 profile
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.api.deps import get_current_user, get_db
from backend.models.user import User
from backend.schemas.user import UserPreferencesUpdate, UserProfile

router = APIRouter()


@router.get("/me", response_model=UserProfile)
async def get_me(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("/me/preferences", response_model=UserProfile)
async def update_my_preferences(
    body: UserPreferencesUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    if body.preferred_language not in {"zh-CN", "en"}:
        raise HTTPException(status_code=400, detail={"code": "users.preferences.invalidLanguage"})

    user.preferred_language = body.preferred_language
    await db.commit()
    await db.refresh(user)
    return user
