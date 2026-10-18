import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[2]

# Must run before Settings reads os.environ; real env vars (e.g. on the host) win over .env.
load_dotenv(BACKEND_DIR / ".env")

DEFAULT_SQLITE_URL = f"sqlite+aiosqlite:///{BACKEND_DIR / 'kardex.db'}"
PASSWORD_PLACEHOLDERS = ("[YOUR-PASSWORD]", "[YOUR_PASSWORD]")


def _database_url(name: str, default: str) -> str:
    value = os.getenv(name) or default
    if any(placeholder in value for placeholder in PASSWORD_PLACEHOLDERS):
        return DEFAULT_SQLITE_URL
    return value


@dataclass(frozen=True)
class Settings:
    # Runtime connection (Supabase: transaction pooler, port 6543).
    DATABASE_URL: str = _database_url("DATABASE_URL", DEFAULT_SQLITE_URL)
    # Migrations (Supabase: session pooler or direct, port 5432). Falls back to DATABASE_URL.
    DIRECT_URL: str = _database_url("DIRECT_URL", DATABASE_URL)
    APP_ENV: str = os.getenv("APP_ENV", "development")
    PORT: int = int(os.getenv("PORT", "8000"))
    SQL_ECHO: bool = os.getenv("SQL_ECHO", "false").lower() == "true"


settings = Settings()


def get_settings() -> Settings:
    return settings
