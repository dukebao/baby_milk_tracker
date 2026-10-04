"""Create tables and retain the existing additive SQLite upgrades."""
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session
from database import DATABASE_URL, engine, SessionLocal
from models import Base, Baby, BabyMember, Household, HouseholdMember


def add_column_if_missing(table_name: str, column_name: str, column_sql: str):
    if not DATABASE_URL.startswith("sqlite"):
        return
    with engine.begin() as connection:
        columns = connection.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
        if column_name not in [column[1] for column in columns]:
            connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_sql}"))


def ensure_household_member(db: Session, household_id: int, user_id: int, role: str):
    existing = (
        db.query(HouseholdMember)
        .filter(HouseholdMember.household_id == household_id, HouseholdMember.user_id == user_id)
        .first()
    )
    if existing:
        return existing
    member = HouseholdMember(household_id=household_id, user_id=user_id, role=role)
    db.add(member)
    db.flush()
    return member


def ensure_legacy_households():
    if not DATABASE_URL.startswith("sqlite"):
        return
    db = SessionLocal()
    try:
        babies = db.query(Baby).filter(Baby.household_id.is_(None)).all()
        for baby in babies:
            household = Household(name=f"{baby.name} Household", created_by=baby.created_by)
            db.add(household)
            db.flush()
            baby.household_id = household.id
            ensure_household_member(db, household.id, baby.created_by, "owner")

            legacy_members = db.query(BabyMember).filter(BabyMember.baby_id == baby.id).all()
            for legacy_member in legacy_members:
                ensure_household_member(db, household.id, legacy_member.user_id, legacy_member.role or "caregiver")
        db.commit()
    finally:
        db.close()


def initialize_database():
    if not DATABASE_URL.startswith("sqlite"):
        missing = set(Base.metadata.tables) - set(inspect(engine).get_table_names(schema="public"))
        if missing:
            raise RuntimeError("Run backend/sql/supabase_schema.sql first. Missing tables: " + ", ".join(sorted(missing)))
        return
    Base.metadata.create_all(bind=engine)
    for table in ["milk_entries", "daily_goals", "measurements", "pee_logs", "poop_logs"]:
        add_column_if_missing(table, "baby_id", "baby_id INTEGER")
    for table in ["milk_entries", "measurements", "pee_logs", "poop_logs"]:
        add_column_if_missing(table, "created_by", "created_by INTEGER")
    add_column_if_missing("babies", "household_id", "household_id INTEGER")
    ensure_legacy_households()


if __name__ == "__main__":
    initialize_database()
    print("Database initialized.")
