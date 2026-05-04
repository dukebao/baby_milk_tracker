from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, String, create_engine, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import Session, sessionmaker
from typing import List, Optional
import datetime
import hashlib
import hmac
import os
import secrets


app = FastAPI()

allowed_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in allowed_origins if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./data/dev_milk_tracking.db")
if DATABASE_URL.startswith("sqlite:///"):
    db_file = DATABASE_URL.replace("sqlite:///", "", 1)
    db_dir = os.path.dirname(db_file)
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class SessionToken(Base):
    __tablename__ = "session_tokens"
    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class Baby(Base):
    __tablename__ = "babies"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class BabyMember(Base):
    __tablename__ = "baby_members"
    id = Column(Integer, primary_key=True, index=True)
    baby_id = Column(Integer, ForeignKey("babies.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String, default="owner")


class MilkEntry(Base):
    __tablename__ = "milk_entries"
    id = Column(Integer, primary_key=True, index=True)
    baby_id = Column(Integer, ForeignKey("babies.id"), index=True, nullable=True)
    date = Column(Date, index=True)
    amount = Column(Float)
    notes = Column(String, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class DailyGoal(Base):
    __tablename__ = "daily_goals"
    id = Column(Integer, primary_key=True, index=True)
    baby_id = Column(Integer, ForeignKey("babies.id"), index=True, nullable=True)
    date = Column(Date, index=True)
    goal = Column(Integer, default=800)


class Measurement(Base):
    __tablename__ = "measurements"
    id = Column(Integer, primary_key=True, index=True)
    baby_id = Column(Integer, ForeignKey("babies.id"), index=True, nullable=True)
    date = Column(Date, index=True)
    weight = Column(Float)
    height = Column(Float)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class PeeLog(Base):
    __tablename__ = "pee_logs"
    id = Column(Integer, primary_key=True, index=True)
    baby_id = Column(Integer, ForeignKey("babies.id"), index=True, nullable=True)
    date = Column(Date, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class PoopLog(Base):
    __tablename__ = "poop_logs"
    id = Column(Integer, primary_key=True, index=True)
    baby_id = Column(Integer, ForeignKey("babies.id"), index=True, nullable=True)
    date = Column(Date, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class RegisterRequest(BaseModel):
    email: str
    password: str
    baby_name: str = "Baby"


class LoginRequest(BaseModel):
    email: str
    password: str


class BabyCreate(BaseModel):
    name: str


class EntryCreate(BaseModel):
    date: str
    amount: float
    notes: str = ""


class GoalCreate(BaseModel):
    date: str
    goal: int


class MeasurementCreate(BaseModel):
    date: str
    weight: float
    height: float


class DateOnly(BaseModel):
    date: str


Base.metadata.create_all(bind=engine)


def add_column_if_missing(table_name: str, column_name: str, column_sql: str):
    if not DATABASE_URL.startswith("sqlite"):
        return
    with engine.begin() as connection:
        columns = connection.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
        if column_name not in [column[1] for column in columns]:
            connection.execute(text(f"ALTER TABLE {table_name} ADD COLUMN {column_sql}"))


for table in ["milk_entries", "daily_goals", "measurements", "pee_logs", "poop_logs"]:
    add_column_if_missing(table, "baby_id", "baby_id INTEGER")

for table in ["milk_entries", "measurements", "pee_logs", "poop_logs"]:
    add_column_if_missing(table, "created_by", "created_by INTEGER")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 200000)
    return f"{salt}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    salt, expected = stored_hash.split("$", 1)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 200000)
    return hmac.compare_digest(digest.hex(), expected)


def create_session(db: Session, user: User):
    token = secrets.token_urlsafe(32)
    session = SessionToken(token=token, user_id=user.id)
    db.add(session)
    db.commit()
    return token


def serialize_baby(baby: Baby):
    return {"id": baby.id, "name": baby.name}


def get_user_babies(db: Session, user_id: int):
    return (
        db.query(Baby)
        .join(BabyMember, BabyMember.baby_id == Baby.id)
        .filter(BabyMember.user_id == user_id)
        .order_by(Baby.id.asc())
        .all()
    )


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing login token")
    token = authorization.replace("Bearer ", "", 1)
    session = db.query(SessionToken).filter(SessionToken.token == token).first()
    if not session:
        raise HTTPException(status_code=401, detail="Invalid login token")
    user = db.query(User).filter(User.id == session.user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="Invalid user")
    return user


def get_current_baby(
    x_baby_id: Optional[int] = Header(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not x_baby_id:
        raise HTTPException(status_code=400, detail="Choose a baby first")
    member = (
        db.query(BabyMember)
        .filter(BabyMember.baby_id == x_baby_id, BabyMember.user_id == user.id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=403, detail="You do not have access to this baby")
    baby = db.query(Baby).filter(Baby.id == x_baby_id).first()
    if not baby:
        raise HTTPException(status_code=404, detail="Baby not found")
    return baby


def parse_date(value: str):
    try:
        return datetime.datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/auth/register")
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    email = data.email.strip().lower()
    if not email or len(data.password) < 6:
        raise HTTPException(status_code=400, detail="Use an email and a password with at least 6 characters")
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Email already registered")

    user = User(email=email, password_hash=hash_password(data.password))
    db.add(user)
    db.flush()

    baby = Baby(name=data.baby_name.strip() or "Baby", created_by=user.id)
    db.add(baby)
    db.flush()
    db.add(BabyMember(baby_id=baby.id, user_id=user.id, role="owner"))
    db.commit()

    token = create_session(db, user)
    return {"token": token, "user": {"id": user.id, "email": user.email}, "babies": [serialize_baby(baby)]}


@app.post("/auth/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    email = data.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_session(db, user)
    babies = get_user_babies(db, user.id)
    return {"token": token, "user": {"id": user.id, "email": user.email}, "babies": [serialize_baby(b) for b in babies]}


@app.post("/auth/logout")
def logout(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "", 1)
        db.query(SessionToken).filter(SessionToken.token == token).delete()
        db.commit()
    return {"message": "Logged out"}


@app.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    babies = get_user_babies(db, user.id)
    return {"user": {"id": user.id, "email": user.email}, "babies": [serialize_baby(b) for b in babies]}


@app.get("/babies")
def list_babies(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"babies": [serialize_baby(baby) for baby in get_user_babies(db, user.id)]}


@app.post("/babies")
def add_baby(data: BabyCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Baby name is required")
    baby = Baby(name=name, created_by=user.id)
    db.add(baby)
    db.flush()
    db.add(BabyMember(baby_id=baby.id, user_id=user.id, role="owner"))
    db.commit()
    return {"baby": serialize_baby(baby)}


@app.post("/entries")
async def add_entry(
    entry: EntryCreate,
    baby: Baby = Depends(get_current_baby),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    new_entry = MilkEntry(
        baby_id=baby.id,
        date=parse_date(entry.date),
        amount=entry.amount,
        notes=entry.notes,
        created_by=user.id,
        created_at=datetime.datetime.utcnow(),
    )
    db.add(new_entry)
    db.commit()
    return {"message": "Entry added successfully"}


@app.get("/entries/{date}")
def get_entries(date: str, baby: Baby = Depends(get_current_baby), db: Session = Depends(get_db)):
    entry_date = parse_date(date)
    entries = (
        db.query(MilkEntry)
        .filter(MilkEntry.date == entry_date, MilkEntry.baby_id == baby.id)
        .order_by(MilkEntry.created_at.desc())
        .all()
    )
    return {
        "entries": [
            {
                "id": e.id,
                "date": str(e.date),
                "amount": e.amount,
                "notes": e.notes,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in entries
        ]
    }


@app.put("/entries/{entry_id}")
def update_entry(
    entry_id: int,
    amount: float,
    notes: str,
    baby: Baby = Depends(get_current_baby),
    db: Session = Depends(get_db),
):
    entry = db.query(MilkEntry).filter(MilkEntry.id == entry_id, MilkEntry.baby_id == baby.id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    entry.amount = amount
    entry.notes = notes
    db.commit()
    return {"message": "Entry updated"}


@app.delete("/entries/{entry_id}")
def delete_entry(entry_id: int, baby: Baby = Depends(get_current_baby), db: Session = Depends(get_db)):
    entry = db.query(MilkEntry).filter(MilkEntry.id == entry_id, MilkEntry.baby_id == baby.id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    db.delete(entry)
    db.commit()
    return {"message": "Entry deleted"}


@app.post("/goals")
def set_goal(goal_data: GoalCreate, baby: Baby = Depends(get_current_baby), db: Session = Depends(get_db)):
    goal_date = parse_date(goal_data.date)
    existing_goal = db.query(DailyGoal).filter(DailyGoal.date == goal_date, DailyGoal.baby_id == baby.id).first()
    if existing_goal:
        existing_goal.goal = goal_data.goal
    else:
        db.add(DailyGoal(baby_id=baby.id, date=goal_date, goal=goal_data.goal))
    db.commit()
    return {"message": "Goal set successfully", "date": goal_data.date, "goal": goal_data.goal}


@app.get("/goals/{date}")
def get_goal(date: str, baby: Baby = Depends(get_current_baby), db: Session = Depends(get_db)):
    goal_date = parse_date(date)
    goal_entry = db.query(DailyGoal).filter(DailyGoal.date == goal_date, DailyGoal.baby_id == baby.id).first()
    return {"goal": goal_entry.goal if goal_entry else 800}


@app.post("/pee")
def add_pee_log(
    data: DateOnly,
    baby: Baby = Depends(get_current_baby),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    pee_log = PeeLog(baby_id=baby.id, date=parse_date(data.date), created_by=user.id)
    db.add(pee_log)
    db.commit()
    db.refresh(pee_log)
    return {"message": "Pee logged", "timestamp": pee_log.created_at.isoformat()}


@app.post("/poop")
def add_poop_log(
    data: DateOnly,
    baby: Baby = Depends(get_current_baby),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    poop_log = PoopLog(baby_id=baby.id, date=parse_date(data.date), created_by=user.id)
    db.add(poop_log)
    db.commit()
    db.refresh(poop_log)
    return {"message": "Poop logged", "timestamp": poop_log.created_at.isoformat()}


@app.get("/pee/{date}")
def get_pee_logs(date: str, baby: Baby = Depends(get_current_baby), db: Session = Depends(get_db)):
    log_date = parse_date(date)
    logs = db.query(PeeLog).filter(PeeLog.date == log_date, PeeLog.baby_id == baby.id).all()
    return {"logs": [{"id": log.id, "created_at": log.created_at.isoformat()} for log in logs]}


@app.get("/poop/{date}")
def get_poop_logs(date: str, baby: Baby = Depends(get_current_baby), db: Session = Depends(get_db)):
    log_date = parse_date(date)
    logs = db.query(PoopLog).filter(PoopLog.date == log_date, PoopLog.baby_id == baby.id).all()
    return {"logs": [{"id": log.id, "created_at": log.created_at.isoformat()} for log in logs]}


@app.delete("/pee/{entry_id}")
def delete_pee(entry_id: int, baby: Baby = Depends(get_current_baby), db: Session = Depends(get_db)):
    entry = db.query(PeeLog).filter(PeeLog.id == entry_id, PeeLog.baby_id == baby.id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Pee entry not found")
    db.delete(entry)
    db.commit()
    return {"message": f"Pee entry {entry_id} deleted"}


@app.delete("/poop/{entry_id}")
def delete_poop(entry_id: int, baby: Baby = Depends(get_current_baby), db: Session = Depends(get_db)):
    entry = db.query(PoopLog).filter(PoopLog.id == entry_id, PoopLog.baby_id == baby.id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Poop entry not found")
    db.delete(entry)
    db.commit()
    return {"message": f"Poop entry {entry_id} deleted"}


@app.post("/measurements")
def add_or_update_measurement(
    measurement: MeasurementCreate,
    baby: Baby = Depends(get_current_baby),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry_date = parse_date(measurement.date)
    existing = db.query(Measurement).filter(Measurement.date == entry_date, Measurement.baby_id == baby.id).first()

    if existing:
        existing.weight = measurement.weight
        existing.height = measurement.height
        message = "Measurement updated"
    else:
        db.add(
            Measurement(
                baby_id=baby.id,
                date=entry_date,
                weight=measurement.weight,
                height=measurement.height,
                created_by=user.id,
            )
        )
        message = "Measurement added"

    db.commit()
    return {"message": message}
