from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.engine import URL, make_url
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings


def normalize_database_url(raw_url: str) -> URL:
    """Accept libpq-style `sslmode=` (as in most PostgreSQL connection strings); asyncpg wants `ssl=`."""
    url = make_url(raw_url)
    if not url.drivername.startswith("postgresql") or "sslmode" not in url.query:
        return url
    query = dict(url.query)
    query["ssl"] = query.pop("sslmode")
    return url.set(query=query)


def build_engine(raw_url: str) -> AsyncEngine:
    url = normalize_database_url(raw_url)
    kwargs: dict = {"echo": settings.SQL_ECHO}
    if url.drivername.startswith("postgresql"):
        # Drop connections that died while idle (e.g. PostgreSQL restarted) instead of failing a request.
        kwargs["pool_pre_ping"] = True
    return create_async_engine(url, **kwargs)


engine = build_engine(settings.DATABASE_URL)
SessionLocal = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session
