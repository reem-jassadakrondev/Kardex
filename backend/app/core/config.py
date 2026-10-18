import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[2]

# Must run before Settings reads os.environ; real env vars (e.g. on the host) win over .env.
load_dotenv(BACKEND_DIR / ".env")

# Fallback only for tests/benchmarks without a .env; real installs set DATABASE_URL to PostgreSQL.
DEFAULT_SQLITE_URL = f"sqlite+aiosqlite:///{BACKEND_DIR / 'kardex.db'}"


@dataclass(frozen=True)
class Settings:
    # PostgreSQL on the same machine, e.g. postgresql+asyncpg://kardex:<password>@localhost:5432/kardex
    DATABASE_URL: str = os.getenv("DATABASE_URL") or DEFAULT_SQLITE_URL
    APP_ENV: str = os.getenv("APP_ENV", "development")
    PORT: int = int(os.getenv("PORT", "8000"))
    SQL_ECHO: bool = os.getenv("SQL_ECHO", "false").lower() == "true"
    # Built frontend served by this server (on-premise install). Ignored when the folder has no index.html.
    FRONTEND_DIST: Path = Path(os.getenv("FRONTEND_DIST") or BACKEND_DIR.parent / "frontend" / "dist")


settings = Settings()


def get_settings() -> Settings:
    return settings
