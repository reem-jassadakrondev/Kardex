"""Serve the built frontend (frontend/dist) from the API server, so one process runs the whole app.

Used for on-premise installs: the browser loads the page and calls /api/v1 on the same origin, which
works over plain HTTP on a LAN and needs no CORS or VITE_API_BASE_URL.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles


def mount_frontend(app: FastAPI, dist: Path) -> bool:
    """Serve `dist` with SPA fallback to index.html. Returns False (and does nothing) if not built."""
    dist = dist.resolve()
    index = dist / "index.html"
    if not index.is_file():
        return False

    if (dist / "assets").is_dir():
        # Hashed file names → safe to cache; index.html below is never cached so updates show up.
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str) -> FileResponse:
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404)
        candidate = (dist / path).resolve()
        if path and candidate.is_file() and dist in candidate.parents:
            return FileResponse(candidate)
        return FileResponse(index, headers={"Cache-Control": "no-cache"})

    return True
