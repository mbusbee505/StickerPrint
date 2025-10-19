from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from datetime import datetime
from typing import Optional

from ..database import get_db, AppConfig

router = APIRouter(prefix="/api/config", tags=["config"])


class UpdateConfigRequest(BaseModel):
    base_prompt: Optional[str] = None
    api_key: Optional[str] = None
    model: Optional[str] = None
    provider: Optional[str] = None


def mask_api_key(api_key: str) -> str:
    """Mask API key for display"""
    if not api_key or len(api_key) < 8:
        return "********"
    return api_key[:4] + "********" + api_key[-4:]


@router.get("")
async def get_config(db: AsyncSession = Depends(get_db)):
    """Get current configuration with masked API key"""
    result = await db.execute(
        select(AppConfig).where(AppConfig.key.in_(['base_prompt', 'api_key', 'model', 'provider']))
    )
    config_items = result.scalars().all()

    config = {item.key: item.value for item in config_items}

    # Mask API key
    if 'api_key' in config:
        config['api_key'] = mask_api_key(config['api_key'])

    return config


@router.put("")
async def update_config(
    request: UpdateConfigRequest,
    db: AsyncSession = Depends(get_db)
):
    """Update configuration values"""
    updated_keys = []

    if request.base_prompt is not None:
        result = await db.execute(
            select(AppConfig).where(AppConfig.key == "base_prompt")
        )
        config = result.scalar_one_or_none()

        if config:
            config.value = request.base_prompt
            config.updated_at = datetime.utcnow()
        else:
            config = AppConfig(
                key="base_prompt",
                value=request.base_prompt,
                updated_at=datetime.utcnow()
            )
            db.add(config)

        updated_keys.append("base_prompt")

    if request.api_key is not None:
        result = await db.execute(
            select(AppConfig).where(AppConfig.key == "api_key")
        )
        config = result.scalar_one_or_none()

        if config:
            config.value = request.api_key
            config.updated_at = datetime.utcnow()
        else:
            config = AppConfig(
                key="api_key",
                value=request.api_key,
                updated_at=datetime.utcnow()
            )
            db.add(config)

        updated_keys.append("api_key")

    if request.model is not None:
        result = await db.execute(
            select(AppConfig).where(AppConfig.key == "model")
        )
        config = result.scalar_one_or_none()

        if config:
            config.value = request.model
            config.updated_at = datetime.utcnow()
        else:
            config = AppConfig(
                key="model",
                value=request.model,
                updated_at=datetime.utcnow()
            )
            db.add(config)

        updated_keys.append("model")

    if request.provider is not None:
        result = await db.execute(
            select(AppConfig).where(AppConfig.key == "provider")
        )
        config = result.scalar_one_or_none()

        if config:
            config.value = request.provider
            config.updated_at = datetime.utcnow()
        else:
            config = AppConfig(
                key="provider",
                value=request.provider,
                updated_at=datetime.utcnow()
            )
            db.add(config)

        updated_keys.append("provider")

    await db.commit()

    return {
        "success": True,
        "updated_keys": updated_keys
    }
