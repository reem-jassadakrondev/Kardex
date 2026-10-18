from __future__ import annotations

import sqlite3
from pathlib import Path

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import create_engine

import app.models  # noqa: F401
from app.models.base import Base

BACKEND_DIR = Path(__file__).resolve().parents[1]


def alembic_config(db_path: Path) -> Config:
    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", f"sqlite+aiosqlite:///{db_path}")
    return cfg


def test_upgrade_creates_schema_and_seeds(tmp_path: Path) -> None:
    db_path = tmp_path / "test.db"
    command.upgrade(alembic_config(db_path), "head")

    with sqlite3.connect(db_path) as conn:
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
        games = {row[0] for row in conn.execute("SELECT code FROM games")}
        game_tables = conn.execute("SELECT code, game_code, plays_per_round FROM game_tables").fetchall()

    assert {"games", "game_tables", "dt_rounds", "dt_block_counts", "dt_play_events", "alembic_version"} <= tables
    assert not {"game_sessions", "rounds"} & tables  # Baccarat prototype dropped in 0004
    assert games == {"dragon_tiger"}
    assert game_tables == [("dt-1", "dragon_tiger", 60)]


def test_models_match_migrations(tmp_path: Path) -> None:
    db_path = tmp_path / "test.db"
    command.upgrade(alembic_config(db_path), "head")

    engine = create_engine(f"sqlite:///{db_path}")
    with engine.connect() as conn:
        diff = compare_metadata(MigrationContext.configure(conn), Base.metadata)
    engine.dispose()

    assert diff == [], f"Models and migrations differ — add a migration: {diff}"


def test_downgrade_to_base(tmp_path: Path) -> None:
    db_path = tmp_path / "test.db"
    cfg = alembic_config(db_path)
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "base")

    with sqlite3.connect(db_path) as conn:
        tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}

    assert tables == {"alembic_version"}
