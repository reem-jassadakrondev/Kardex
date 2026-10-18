from __future__ import annotations

from collections.abc import AsyncGenerator
from uuid import uuid4

from sqlalchemy.engine import URL, make_url
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings


def normalize_database_url(raw_url: str) -> URL:
    """Translate libpq-style query params (as copied from Supabase) into what asyncpg accepts."""
    url = make_url(raw_url)
    if not url.drivername.startswith("postgresql"):
        return url

    query = dict(url.query)
    query.pop("pgbouncer", None)
    if "sslmode" in query:
        query["ssl"] = query.pop("sslmode")
    return url.set(query=query)


def build_engine(raw_url: str) -> AsyncEngine:
    url = normalize_database_url(raw_url)
    kwargs: dict = {"echo": settings.SQL_ECHO}

    if url.drivername.startswith("postgresql"):
        kwargs["pool_pre_ping"] = True
        # The Supabase transaction pooler (pgbouncer) cannot reuse named prepared statements.
        kwargs["connect_args"] = {
            "statement_cache_size": 0,
            "prepared_statement_cache_size": 0,
            "prepared_statement_name_func": lambda: f"__asyncpg_{uuid4()}__",
        }

    return create_async_engine(url, **kwargs)


engine = build_engine(settings.DATABASE_URL)
SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
