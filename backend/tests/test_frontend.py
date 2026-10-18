from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.frontend import mount_frontend


def make_app(dist: Path) -> TestClient:
    app = FastAPI()

    @app.get("/api/v1/health")
    async def health() -> dict:
        return {"status": "ok"}

    assert mount_frontend(app, dist)
    return TestClient(app)


def test_serves_spa_with_fallback(tmp_path: Path) -> None:
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<html>app</html>")
    (tmp_path / "assets" / "app.js").write_text("console.log(1)")
    (tmp_path / "favicon.svg").write_text("<svg/>")
    client = make_app(tmp_path)

    assert client.get("/").text == "<html>app</html>"
    assert client.get("/dragon-tiger").text == "<html>app</html>"  # client-side route
    assert client.get("/dragon-tiger").headers["cache-control"] == "no-cache"
    assert client.get("/assets/app.js").text == "console.log(1)"
    assert client.get("/favicon.svg").text == "<svg/>"
    assert client.get("/api/v1/health").json() == {"status": "ok"}
    assert client.get("/api/v1/nope").status_code == 404  # unknown API paths are not swallowed by the SPA


def test_does_not_escape_dist(tmp_path: Path) -> None:
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("index")
    (tmp_path / "secret.txt").write_text("secret")
    client = make_app(dist)

    assert client.get("/..%2Fsecret.txt").text == "index"


def test_skips_when_not_built(tmp_path: Path) -> None:
    assert mount_frontend(FastAPI(), tmp_path) is False
