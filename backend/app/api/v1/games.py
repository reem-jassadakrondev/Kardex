from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.game import Game

router = APIRouter(prefix="/games", tags=["games"])


@router.get("")
async def list_games(db: AsyncSession = Depends(get_db)) -> list[dict]:
    result = await db.execute(select(Game))
    games = result.scalars().all()
    return [
        {
            "code": game.code,
            "name": game.name,
            "is_active": game.is_active,
            "rules_config": game.rules_config,
        }
        for game in games
    ]
