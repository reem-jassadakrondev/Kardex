import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./kardex.db")
    DIRECT_URL: str = os.getenv("DIRECT_URL", "sqlite+aiosqlite:///./kardex.db")
    APP_ENV: str = os.getenv("APP_ENV", "development")
    PORT: int = int(os.getenv("PORT", "8000"))

    def __post_init__(self) -> None:
        if self.DATABASE_URL.startswith("postgresql") and "[YOUR-PASSWORD]" in self.DATABASE_URL:
            object.__setattr__(self, "DATABASE_URL", "sqlite+aiosqlite:///./kardex.db")
        if self.DIRECT_URL.startswith("postgresql") and "[YOUR-PASSWORD]" in self.DIRECT_URL:
            object.__setattr__(self, "DIRECT_URL", "sqlite+aiosqlite:///./kardex.db")


settings = Settings()


def get_settings() -> Settings:
    return settings
