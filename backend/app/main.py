from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.api.v1.dt_tables import router as dt_tables_router
from app.api.v1.router import router as root_router
from app.core.config import settings
from app.core.frontend import mount_frontend

# Schema is managed by Alembic: run `alembic upgrade head` before starting the server.
app = FastAPI(title="Kardex API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# The legacy (ES5 + polyfills) frontend bundle is ~530 KB; gzip brings it to ~170 KB for slow old iPads.
app.add_middleware(GZipMiddleware, minimum_size=1000)

app.include_router(root_router)
app.include_router(dt_tables_router, prefix="/api/v1")

# Registered last: its catch-all route must not shadow the API.
if not mount_frontend(app, settings.FRONTEND_DIST):

    @app.get("/")
    async def root() -> dict[str, str]:
        return {"message": "Kardex backend is running (frontend not built: run `npm run build` in frontend/)"}
