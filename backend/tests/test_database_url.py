from __future__ import annotations

from app.core.database import build_engine, normalize_database_url

LOCAL_URL = "postgresql+asyncpg://kardex:secret@localhost:5432/kardex"


def test_sslmode_is_translated_for_asyncpg() -> None:
    url = normalize_database_url(f"{LOCAL_URL}?sslmode=require")

    assert "sslmode" not in url.query
    assert url.query["ssl"] == "require"


def test_asyncpg_receives_only_supported_connect_args() -> None:
    engine = build_engine(f"{LOCAL_URL}?sslmode=require")
    _, kwargs = engine.dialect.create_connect_args(engine.url)

    assert kwargs["ssl"] == "require"
    assert "sslmode" not in kwargs
    assert kwargs["host"] == "localhost" and kwargs["database"] == "kardex"


def test_plain_urls_are_untouched() -> None:
    assert normalize_database_url(LOCAL_URL).render_as_string(hide_password=False) == LOCAL_URL
    assert str(normalize_database_url("sqlite+aiosqlite:///./kardex.db")) == "sqlite+aiosqlite:///./kardex.db"
