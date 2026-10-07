from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.games import router as games_router
from app.api.v1.router import router as root_router
from app.api.v1.sessions import router as sessions_router
from app.core.database import init_db

app = FastAPI(title="Kardex API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(root_router)
app.include_router(games_router, prefix="/api/v1")
app.include_router(sessions_router, prefix="/api/v1")


@app.on_event("startup")
async def startup() -> None:
    await init_db()


@app.get("/")
async def root() -> dict[str, str]:
    return {"message": "Kardex backend is running"}
