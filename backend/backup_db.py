"""Create a consistent local SQLite snapshot, including while the app is running."""
import argparse
from datetime import datetime, timezone
import os
from pathlib import Path
import sqlite3
from uuid import uuid4

from dotenv import load_dotenv
from sqlalchemy.engine import make_url

BACKEND_DIR = Path(__file__).resolve().parent


def backup_database(source: Path, directory: Path):
    source = source.resolve(strict=True)
    directory = directory.resolve()
    directory.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    target = directory / f"milk-tracker-{timestamp}-{uuid4().hex[:8]}.db"
    # Never create/modify the source database; use SQLite's online backup API.
    with sqlite3.connect(source.as_uri() + "?mode=ro", uri=True) as original:
        with sqlite3.connect(target) as snapshot:
            original.backup(snapshot)
            if snapshot.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise RuntimeError("Backup integrity check failed")
    return target


def main():
    load_dotenv(BACKEND_DIR / ".env")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, help="Override the configured SQLite source path")
    parser.add_argument("--directory", type=Path, default=BACKEND_DIR / "data" / "backups")
    args = parser.parse_args()
    source = args.source
    if source is None:
        url = make_url(os.getenv("DATABASE_URL", "sqlite:///./data/dev_milk_tracking.db"))
        if url.get_backend_name() != "sqlite" or not url.database or url.database == ":memory:":
            parser.error("This utility backs up SQLite files. Use your database provider for PostgreSQL backups.")
        source = Path(url.database)
        if not source.is_absolute():
            source = BACKEND_DIR / source
    print(f"Backup saved: {backup_database(source, args.directory)}")


if __name__ == "__main__":
    main()
