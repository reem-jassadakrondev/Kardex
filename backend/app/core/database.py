from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

engine_kwargs: dict = {"pool_pre_ping": True}

if settings.DATABASE_URL.startswith("postgresql"):
    engine_kwargs["connect_args"] = {
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
    }
elif settings.DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_async_engine(settings.DATABASE_URL, **engine_kwargs, echo=settings.APP_ENV == "development")
SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session


async def init_db() -> None:
    from app.models.base import Base
    from app.models.game import Game
    from app.models.round import Round
    from app.models.session import GameSession

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async with SessionLocal() as session:
        default_games = [
            {
                "code": "baccarat",
                "name": "Baccarat",
                "is_active": True,
                "rules_config": {"min_deck_count": 1, "max_deck_count": 12},
            },
            {
                "code": "dragon_tiger",
                "name": "เสือมังกร",
                "is_active": True,
                "rules_config": {"min_deck_count": 1, "max_deck_count": 8},
            },
            {
                "code": "pokdeng",
                "name": "โพกเด้ง",
                "is_active": False,
                "rules_config": {"min_deck_count": 1, "max_deck_count": 6},
            },
            {
                "code": "sic_bo",
                "name": "Sic Bo",
                "is_active": False,
                "rules_config": {"min_deck_count": 1, "max_deck_count": 4},
            },
        ]

        for game_data in default_games:
            existing_game = await session.get(Game, game_data["code"])
            if existing_game is None:
                session.add(Game(**game_data))

        await session.commit()
