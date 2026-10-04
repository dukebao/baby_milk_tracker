"""Integration checks use an isolated SQLite file, never the development database."""
import datetime
import os
from pathlib import Path
import sys
import tempfile
import sqlite3
import subprocess

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
test_dir = tempfile.TemporaryDirectory()
os.environ["DATABASE_URL"] = "sqlite:///" + str(Path(test_dir.name) / "test.db")
from database import engine, SessionLocal
from main import app
from models import Base, SessionToken, HouseholdInvite
from time_utils import utc_now


@pytest.fixture(scope="session", autouse=True)
def cleanup_test_database():
    yield
    engine.dispose()
    test_dir.cleanup()


@pytest.fixture
def client():
    Base.metadata.drop_all(engine)
    with TestClient(app) as client:
        yield client


def register(client, email):
    response = client.post("/auth/register", json={"email": email, "password": "testpass", "baby_name": "Baby"})
    assert response.status_code == 200, response.text
    data = response.json()
    return data, {"Authorization": "Bearer " + data["token"], "X-Baby-Id": str(data["babies"][0]["id"])}


def test_tracking_and_access(client):
    owner, headers = register(client, "owner@example.com")
    other, other_headers = register(client, "other@example.com")
    date = "2026-10-02"
    assert client.get(f"/days/{date}").status_code == 401
    other_headers["X-Baby-Id"] = headers["X-Baby-Id"]
    assert client.get(f"/days/{date}", headers=other_headers).status_code == 403
    for amount in (80, 200, -50):
        assert client.post("/entries", headers=headers, json={"date": date, "amount": amount}).status_code == 200
    for kind in ("pee", "poop"):
        response = client.post("/" + kind, headers=headers, json={"date": date})
        assert response.status_code == 200, response.text
        assert response.json()["timestamp"].endswith("+00:00")
    day = client.get(f"/days/{date}", headers=headers).json()
    assert sum(entry["amount"] for entry in day["entries"]) == 230
    assert len(day["pee_logs"]) == len(day["poop_logs"]) == 1
    entry = day["entries"][0]
    assert client.put(f'/entries/{entry["id"]}', headers=headers, json={"amount": 100, "notes": "corrected"}).status_code == 200
    assert client.delete(f'/entries/{entry["id"]}', headers=other_headers).status_code == 403
    assert client.delete(f'/entries/{entry["id"]}', headers=headers).status_code == 200
    assert client.post("/entries", headers=headers, json={"date": "bad", "amount": 80}).status_code == 400
    assert client.post("/goals", headers=headers, json={"date": date, "goal": -1}).status_code == 422
    for goal in (700, 900):
        assert client.post("/goals", headers=headers, json={"date": date, "goal": goal}).status_code == 200
    assert client.get(f"/goals/{date}", headers=headers).json() == {"goal": 900}
    assert client.post("/measurements", headers=headers, json={"date": date, "weight": 5, "height": 60}).status_code == 200
    assert client.get(f"/measurements/{date}", headers=headers).json()["measurement"]["weight"] == 5
    assert client.post("/measurements", headers=headers, json={"date": date, "weight": -1, "height": 60}).status_code == 422


def test_milk_button_preferences(client):
    _, headers = register(client, "owner@example.com")
    _, other_headers = register(client, "other@example.com")
    path = "/me/preferences"
    defaults = {"milk_amounts": [80, 200, -50]}
    assert client.get(path).status_code == 401
    assert client.put(path, json=defaults).status_code == 401
    assert client.get(path, headers=headers).json() == defaults
    preferred = {"milk_amounts": [90, 120.5, -30]}
    assert client.put(path, headers=headers, json=preferred).json() == preferred
    login = client.post("/auth/login", json={"email": "owner@example.com", "password": "testpass"}).json()
    assert client.get(path, headers={"Authorization": "Bearer " + login["token"]}).json() == preferred
    assert client.get(path, headers=other_headers).json() == defaults
    for invalid in ([80, 200], [80, 200, -50, 100], [0, 200, -50], ["bad", 200, -50], ["Infinity", 200, -50]):
        assert client.put(path, headers=headers, json={"milk_amounts": invalid}).status_code == 422
    assert client.get(path, headers=headers).json() == preferred
    assert client.put(path, headers=headers, json=defaults).status_code == 200


def test_history_exports_and_members_are_scoped(client):
    owner, headers = register(client, "owner@example.com")
    _, other_headers = register(client, "other@example.com")
    for amount in (120, -20):
        client.post("/entries", headers=headers, json={"date": "2026-05-04", "amount": amount, "notes": "=SUM(A1:A2)"})
    client.post("/entries", headers=headers, json={"date": "2026-05-05", "amount": 80})
    client.post("/pee", headers=headers, json={"date": "2026-05-04"})
    client.post("/poop", headers=headers, json={"date": "2026-05-04"})
    client.post("/goals", headers=headers, json={"date": "2026-05-04", "goal": 700})
    client.post("/measurements", headers=headers, json={"date": "2026-05-04", "weight": 5, "height": 60})
    history = client.get("/history?start_date=2026-05-01&end_date=2026-05-31", headers=headers).json()
    assert history["earliest_date"] == "2026-05-04"
    assert history["days"][0] == {"date": "2026-05-04", "milk_ml": 100, "milk_entries": 2,
                                   "pee_logs": 1, "poop_logs": 1, "breastfeeding_logs": 0, "daily_goals": 1, "measurements": 1}
    day = client.get("/days/2026-05-04", headers=headers).json()
    assert day["goal"] == 700 and day["measurement"] == {"weight": 5, "height": 60}
    assert client.get("/history?start_date=2026-05-06&end_date=2026-05-04", headers=headers).status_code == 400
    assert client.get("/history?start_date=bad&end_date=2026-05-04", headers=headers).status_code == 400
    exported = client.get("/exports?format=json&start_date=2026-05-04&end_date=2026-05-04", headers=headers)
    assert exported.status_code == 200
    assert len(exported.json()["milk_entries"]) == 2
    assert len(exported.json()["measurements"]) == 1
    assert "users" not in exported.json() and "token" not in exported.json()
    assert len(client.get("/exports", headers=headers).json()["milk_entries"]) == 3
    csv = client.get("/exports?format=csv", headers=headers)
    assert csv.headers["content-type"].startswith("text/csv")
    assert "'=SUM(A1:A2)" in csv.text and "-20.0" in csv.text
    assert client.get("/exports?format=xml", headers=headers).status_code == 400
    assert client.get("/exports?start_date=2026-05-04", headers=headers).status_code == 400
    members_path = f'/households/{owner["households"][0]["id"]}/members'
    assert client.get(members_path, headers=headers).json()["members"][0]["role"] == "owner"
    assert client.get(members_path, headers=other_headers).status_code == 403
    other_headers["X-Baby-Id"] = headers["X-Baby-Id"]
    for path in ("/history?start_date=2026-05-01&end_date=2026-05-31", "/exports"):
        assert client.get(path).status_code == 401
        assert client.get(path, headers=other_headers).status_code == 403
    assert len(client.get("/days/2026-05-04", headers=headers).json()["entries"]) == 2


def test_breastfeeding_logs_time_without_amount_and_is_baby_scoped(client):
    import csv
    import io
    _, headers = register(client, "owner@example.com")
    _, other_headers = register(client, "other@example.com")
    date = "2026-05-04"
    before = utc_now().replace(tzinfo=datetime.timezone.utc)
    assert client.post("/breastfeeding", json={"date": date}).status_code == 401
    assert client.post("/breastfeeding", headers=headers, json={"date": "bad"}).status_code == 400
    saved = client.post("/breastfeeding", headers=headers, json={"date": date})
    assert saved.status_code == 200
    assert datetime.datetime.fromisoformat(saved.json()["timestamp"]) >= before
    day = client.get(f"/days/{date}", headers=headers).json()
    assert day["entries"] == []
    assert len(day["breastfeeding_logs"]) == 1
    log = day["breastfeeding_logs"][0]
    assert log["created_at"] == saved.json()["timestamp"] and "amount" not in log
    assert client.get(f"/days/{date}", headers=other_headers).json()["breastfeeding_logs"] == []
    assert client.get(f"/breastfeeding/{date}", headers=headers).json()["logs"] == [log]
    assert client.get("/days/2026-05-05", headers=headers).json()["breastfeeding_logs"] == []
    history = client.get("/history?start_date=2026-05-01&end_date=2026-05-31", headers=headers).json()
    assert history["earliest_date"] == date
    assert history["days"][0]["breastfeeding_logs"] == 1 and history["days"][0]["milk_ml"] == 0
    exported = client.get("/exports", headers=headers).json()["breastfeeding_logs"]
    assert len(exported) == 1 and exported[0]["created_at"] == log["created_at"]
    assert "amount" not in exported[0]
    csv_response = client.get("/exports?format=csv", headers=headers)
    rows = list(csv.DictReader(io.StringIO(csv_response.text.lstrip("\ufeff"))))
    assert rows[0]["type"] == "breastfeeding_logs" and rows[0]["amount_ml"] == ""
    other_headers["X-Baby-Id"] = headers["X-Baby-Id"]
    assert client.get(f"/breastfeeding/{date}", headers=other_headers).status_code == 403
    assert client.post("/breastfeeding", headers=other_headers, json={"date": date}).status_code == 403
    assert client.delete(f'/breastfeeding/{log["id"]}', headers=other_headers).status_code == 403
    assert client.delete(f'/breastfeeding/{log["id"]}', headers=headers).status_code == 200
    assert client.get(f"/days/{date}", headers=headers).json()["breastfeeding_logs"] == []


def test_sqlite_backup_preserves_source(tmp_path):
    from backup_db import backup_database
    source = tmp_path / "source.db"
    with sqlite3.connect(source) as connection:
        connection.execute("CREATE TABLE records (amount INTEGER)")
        connection.execute("INSERT INTO records VALUES (120)")
    snapshot = backup_database(source, tmp_path / "backups")
    second = backup_database(source, tmp_path / "backups")
    assert snapshot != second
    with sqlite3.connect(snapshot) as connection:
        assert connection.execute("SELECT amount FROM records").fetchone() == (120,)
    with sqlite3.connect(source) as connection:
        assert connection.execute("SELECT amount FROM records").fetchone() == (120,)


def test_baby_name_edit_is_owner_only_and_preserves_history(client):
    owner, headers = register(client, "owner@example.com")
    _, guest_headers = register(client, "guest@example.com")
    baby_id = owner["babies"][0]["id"]
    household_id = owner["households"][0]["id"]
    client.post("/entries", headers=headers, json={"date": "2026-05-04", "amount": 120})
    path = f"/babies/{baby_id}"
    assert client.put(path, json={"name": "Aria"}).status_code == 401
    assert client.put(path, headers=guest_headers, json={"name": "Wrong"}).status_code == 403
    token = client.post(f"/households/{household_id}/invites", headers=headers, json={}).json()["token"]
    assert client.post(f"/invites/{token}/accept", headers=guest_headers).status_code == 200
    assert client.put(path, headers=guest_headers, json={"name": "Wrong"}).status_code == 403
    assert client.put(path, headers=headers, json={"name": "  "}).status_code == 400
    assert client.put(path, headers=headers, json={"name": ""}).status_code == 422
    renamed = client.put(path, headers=headers, json={"name": " Aria "}).json()["baby"]
    assert renamed["id"] == baby_id and renamed["name"] == "Aria"
    assert client.get("/me", headers=headers).json()["babies"][0]["name"] == "Aria"
    assert len(client.get("/days/2026-05-04", headers=headers).json()["entries"]) == 1


def test_invites_and_owner_permissions(client):
    owner, headers = register(client, "owner@example.com")
    guest, guest_headers = register(client, "guest@example.com")
    household_id = owner["households"][0]["id"]
    path = f"/households/{household_id}/invites"
    assert client.post(path, headers=guest_headers, json={}).status_code == 403
    token = client.post(path, headers=headers, json={"invited_email": "guest@example.com"}).json()["token"]
    assert client.post(f"/invites/{token}/accept", headers=headers).status_code == 403
    joined = client.post(f"/invites/{token}/accept", headers=guest_headers)
    assert joined.status_code == 200, joined.text
    assert any(baby["id"] == owner["babies"][0]["id"] for baby in joined.json()["babies"])
    assert client.post(f"/invites/{token}/accept", headers=guest_headers).status_code == 400
    guest_headers["X-Baby-Id"] = headers["X-Baby-Id"]
    assert client.get("/days/2026-10-02", headers=guest_headers).status_code == 200
    assert client.post("/babies", headers=guest_headers, json={"name": "Other", "household_id": household_id}).status_code == 403
    token = client.post(path, headers=headers, json={}).json()["token"]
    with SessionLocal() as db:
        invite = db.query(HouseholdInvite).filter_by(token=token).one()
        invite.expires_at = utc_now() - datetime.timedelta(days=1)
        db.commit()
    assert client.post(f"/invites/{token}/accept", headers=guest_headers).status_code == 400


def test_login_logout_and_expiry(client):
    data, headers = register(client, "owner@example.com")
    assert client.post("/auth/login", json={"email": "owner@example.com", "password": "wrong"}).status_code == 401
    assert client.post("/auth/login", json={"email": "owner@example.com", "password": "testpass"}).status_code == 200
    with SessionLocal() as db:
        session = db.query(SessionToken).filter_by(token=data["token"]).one()
        session.created_at = utc_now() - datetime.timedelta(days=31)
        db.commit()
    assert client.get("/me", headers=headers).status_code == 401
    assert client.post("/auth/logout", headers=headers).status_code == 200
    assert client.get("/me", headers=headers).status_code == 401


def test_schema_and_foreign_keys(client):
    assert set(inspect(engine).get_table_names()) == set(Base.metadata.tables)
    with engine.connect() as connection:
        assert connection.exec_driver_sql("PRAGMA foreign_keys").scalar() == 1
    from generate_schema import generate_sql
    sql = generate_sql()
    checked_in = Path(__file__).resolve().parents[1] / "sql" / "supabase_schema.sql"
    assert checked_in.read_text(encoding="utf-8") == sql
    assert sql.count("ENABLE ROW LEVEL SECURITY") == len(Base.metadata.tables)


def test_legacy_sqlite_upgrade_preserves_history(tmp_path):
    legacy_path = tmp_path / "legacy.db"
    with sqlite3.connect(legacy_path) as connection:
        connection.executescript("""
            CREATE TABLE users (id INTEGER PRIMARY KEY, email VARCHAR NOT NULL,
                password_hash VARCHAR NOT NULL, created_at DATETIME);
            CREATE TABLE babies (id INTEGER PRIMARY KEY, name VARCHAR NOT NULL,
                created_by INTEGER NOT NULL, created_at DATETIME);
            CREATE TABLE baby_members (id INTEGER PRIMARY KEY, baby_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL, role VARCHAR);
            CREATE TABLE milk_entries (id INTEGER PRIMARY KEY, date DATE,
                amount FLOAT, notes VARCHAR, created_at DATETIME);
            INSERT INTO users VALUES (1, 'legacy@example.com', 'unused', '2025-01-01');
            INSERT INTO babies VALUES (1, 'Legacy baby', 1, '2025-01-01');
            INSERT INTO baby_members VALUES (1, 1, 1, 'owner');
            INSERT INTO milk_entries VALUES (1, '2025-01-01', 80, 'old history', '2025-01-01');
        """)
    env = dict(os.environ, DATABASE_URL="sqlite:///" + str(legacy_path))
    initializer = Path(__file__).resolve().parents[1] / "init_db.py"
    for _ in range(2):
        result = subprocess.run([sys.executable, str(initializer)], env=env, capture_output=True, text=True)
        assert result.returncode == 0, result.stderr
    with sqlite3.connect(legacy_path) as connection:
        assert connection.execute("SELECT amount, notes, baby_id FROM milk_entries").fetchone() == (80, "old history", None)
        assert connection.execute("SELECT COUNT(*) FROM households").fetchone()[0] == 1
        assert connection.execute("SELECT COUNT(*) FROM household_members").fetchone()[0] == 1
        assert connection.execute("SELECT household_id FROM babies").fetchone()[0] is not None
