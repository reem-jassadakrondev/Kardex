from __future__ import annotations

import sqlite3
from collections.abc import AsyncGenerator, Iterator
from pathlib import Path

import pytest
from alembic import command
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.database import get_db
from app.main import app
from tests.test_migrations import alembic_config


@pytest.fixture
def db_path(tmp_path: Path) -> Path:
    """A migrated SQLite database with an extra 4-plays-per-round table `t4` for short rounds."""
    path = tmp_path / "test.db"
    command.upgrade(alembic_config(path), "head")
    with sqlite3.connect(path) as conn:
        conn.execute(
            "INSERT INTO game_tables (code, name, game_code, plays_per_round, version, created_at) "
            "VALUES ('t4', 'test', 'dragon_tiger', 4, 0, '2026-01-01 00:00:00')"
        )
    return path


@pytest.fixture
def client(db_path: Path) -> Iterator[TestClient]:
    engine = create_async_engine(f"sqlite+aiosqlite:///{db_path}", poolclass=NullPool)
    sessions = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
