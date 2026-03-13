"""
用户个人名片配置模型
"""
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base


class ProfileCard(Base):
    __tablename__ = "profile_cards"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False, default="Default card")
    template_key: Mapped[str] = mapped_column(String(32), nullable=False, default="clean_light")
    full_name: Mapped[str] = mapped_column(String(120), nullable=False)
    slogan: Mapped[str] = mapped_column(String(160), nullable=False, default="")
    phone: Mapped[str] = mapped_column(String(64), nullable=False)
    contact_address: Mapped[str] = mapped_column(String(255), nullable=False)
    homepage: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    email: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    brokerage_name: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    avatar_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("avatar_assets.id"),
        nullable=True,
        index=True,
    )
    logo_asset_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("logo_assets.id"),
        nullable=True,
        index=True,
    )
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    show_avatar_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    show_name_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    show_phone_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    show_address_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    show_brokerage_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    show_logo_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
