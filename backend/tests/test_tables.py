from __future__ import annotations

import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient


def play(client: TestClient, code: str, values: str) -> None:
    version = client.get(f"/api/v1/tables/{code}").json()["version"]
    for value in values:
        res = client.post(f"/api/v1/tables/{code}/plays", json={"value": value, "version": version})
        assert res.status_code == 200, res.text
        version = res.json()["version"]


def active(client: TestClient) -> dict[str, dict]:
    return {t["code"]: t for t in client.get("/api/v1/tables").json()}


def test_list_has_default_table(client: TestClient) -> None:
    tables = active(client)
    assert tables["dt-1"]["name"] == "โต๊ะ 1"
    assert tables["dt-1"]["total_rounds"] == 0
    assert tables["dt-1"]["deleted_at"] is None


def test_create_and_data_stays_per_table(client: TestClient) -> None:
    res = client.post("/api/v1/tables", json={"name": "  โต๊ะ   VIP "})
    assert res.status_code == 201
    new = res.json()
    assert new["name"] == "โต๊ะ VIP" and new["plays_per_round"] == 60 and new["code"].startswith("t-")

    play(client, new["code"], "RRB")
    play(client, "dt-1", "G")
    state_new = client.get(f"/api/v1/tables/{new['code']}").json()
    state_dt1 = client.get("/api/v1/tables/dt-1").json()
    assert state_new["cursor"] == {"round_no": 1, "position": 4}
    assert state_dt1["cursor"] == {"round_no": 1, "position": 2}
    assert client.get(f"/api/v1/tables/{new['code']}/grid").json()["rounds"][0]["results"] == "RRB"
    assert client.get("/api/v1/tables/dt-1/grid").json()["rounds"][0]["results"] == "G"
    assert active(client)[new["code"]]["total_rounds"] == 1


def test_names_are_unique_and_validated(client: TestClient) -> None:
    assert client.post("/api/v1/tables", json={"name": "A"}).status_code == 201
    assert client.post("/api/v1/tables", json={"name": "a"}).status_code == 409
    assert client.post("/api/v1/tables", json={"name": "   "}).status_code == 400
    assert client.post("/api/v1/tables", json={"name": "x" * 51}).status_code == 400

    b = client.post("/api/v1/tables", json={"name": "B"}).json()["code"]
    assert client.patch(f"/api/v1/tables/{b}", json={"name": "A"}).status_code == 409
    res = client.patch(f"/api/v1/tables/{b}", json={"name": "B2"})
    assert res.status_code == 200 and res.json()["name"] == "B2"
    assert client.get(f"/api/v1/tables/{b}").json()["table"]["name"] == "B2"
    assert client.patch("/api/v1/tables/nope", json={"name": "C"}).status_code == 404


def test_trash_and_restore(client: TestClient) -> None:
    code = client.post("/api/v1/tables", json={"name": "T"}).json()["code"]
    play(client, code, "RB")
    version = client.get(f"/api/v1/tables/{code}").json()["version"]

    assert client.delete(f"/api/v1/tables/{code}").status_code == 200
    assert code not in active(client)
    assert [t["code"] for t in client.get("/api/v1/tables?deleted=true").json()] == [code]
    # A trashed table is read-only and invisible to the grid API.
    assert client.get(f"/api/v1/tables/{code}").status_code == 404
    assert client.post(f"/api/v1/tables/{code}/plays", json={"value": "R", "version": version + 1}).status_code == 404
    assert client.patch(f"/api/v1/tables/{code}", json={"name": "X"}).status_code == 404
    # The name is free again while the table is in the trash, so restoring then conflicts.
    other = client.post("/api/v1/tables", json={"name": "T"}).json()["code"]
    assert client.post(f"/api/v1/tables/{code}/restore").status_code == 409
    client.patch(f"/api/v1/tables/{other}", json={"name": "T-new"})

    res = client.post(f"/api/v1/tables/{code}/restore")
    assert res.status_code == 200 and res.json()["total_rounds"] == 1
    assert client.get(f"/api/v1/tables/{code}/grid").json()["rounds"][0]["results"] == "RB"


def test_purge_needs_trash_and_exact_name(client: TestClient, db_path: Path) -> None:
    code = client.post("/api/v1/tables", json={"name": "Purge me"}).json()["code"]
    play(client, code, "RBY")
    play(client, "dt-1", "K")

    assert client.delete(f"/api/v1/tables/{code}/permanent", params={"confirm_name": "Purge me"}).status_code == 404  # not trashed
    client.delete(f"/api/v1/tables/{code}")
    assert client.delete(f"/api/v1/tables/{code}/permanent", params={"confirm_name": "purge me"}).status_code == 422
    assert client.delete(f"/api/v1/tables/{code}/permanent", params={"confirm_name": "Purge me"}).status_code == 204

    with sqlite3.connect(db_path) as conn:
        assert conn.execute("SELECT count(*) FROM game_tables WHERE code = ?", (code,)).fetchone() == (0,)
        per_table = conn.execute("SELECT table_id, count(*) FROM dt_play_events GROUP BY table_id").fetchall()
        rounds = conn.execute("SELECT count(*) FROM dt_rounds").fetchone()
        counts = conn.execute("SELECT count(*) FROM dt_block_counts").fetchone()
    assert len(per_table) == 1 and rounds == (1,) and counts == (1,)  # only dt-1's single play remains
    assert client.get("/api/v1/tables?deleted=true").json() == []
