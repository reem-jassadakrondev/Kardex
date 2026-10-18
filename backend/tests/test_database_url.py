from __future__ import annotations

from app.core.database import build_engine, normalize_database_url

SUPABASE_POOLER_URL = (
    "postgresql+asyncpg://postgres.ref:secret@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres"
    "?pgbouncer=true&sslmode=require"
)


def test_supabase_params_are_translated_for_asyncpg() -> None:
    url = normalize_database_url(SUPABASE_POOLER_URL)

    assert "pgbouncer" not in url.query
    assert "sslmode" not in url.query
    assert url.query["ssl"] == "require"
    assert url.port == 6543


def test_asyncpg_receives_only_supported_connect_args() -> None:
    engine = build_engine(SUPABASE_POOLER_URL)
    _, kwargs = engine.dialect.create_connect_args(engine.url)

    assert kwargs["ssl"] == "require"
    assert "pgbouncer" not in kwargs
    assert "sslmode" not in kwargs


def test_sqlite_url_is_untouched() -> None:
    url = normalize_database_url("sqlite+aiosqlite:///./kardex.db")
    assert str(url) == "sqlite+aiosqlite:///./kardex.db"
