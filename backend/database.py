"""Database configuration without import-time schema changes."""
import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import sessionmaker

BACKEND_DIR = Path(__file__).resolve().parent
load_dotenv(BACKEND_DIR / ".env")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/dev_milk_tracking.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

url = make_url(DATABASE_URL)
is_sqlite = url.get_backend_name() == "sqlite"
if is_sqlite and url.database and url.database != ":memory:":
    db_path = Path(url.database)
    if not db_path.is_absolute():
        db_path = BACKEND_DIR / db_path
    db_path.parent.mkdir(parents=True, exist_ok=True)
    url = url.set(database=str(db_path))

engine = create_engine(
    url, pool_pre_ping=True,
    connect_args={"check_same_thread": False, "timeout": 30} if is_sqlite else {},
)

if is_sqlite:
    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, record):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
