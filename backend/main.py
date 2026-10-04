"""HTTP API; SQLite locally, PostgreSQL through DATABASE_URL when configured."""
from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import Optional
import datetime
import hashlib
import hmac
import os
import secrets

from database import get_db
from time_utils import utc_now
from reporting import history_summary, export_records
from init_db import initialize_database, ensure_household_member
from models import (User, UserPreferences, SessionToken, Household, HouseholdMember, HouseholdInvite,
                    Baby, MilkEntry, DailyGoal, Measurement, PeeLog, PoopLog, BreastfeedingLog)
from schemas import (RegisterRequest, LoginRequest, BabyCreate, BabyUpdate, InviteCreate,
                     HouseholdUpdate, EntryCreate, EntryUpdate, GoalCreate,
                     MeasurementCreate, DateOnly, PreferencesUpdate)


@asynccontextmanager
async def lifespan(app):
    initialize_database()
    yield


app = FastAPI(title="Baby Milk Tracker API", lifespan=lifespan)
allowed_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in allowed_origins if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def utc_iso(value):
    return value.replace(tzinfo=datetime.timezone.utc).isoformat() if value else None


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 200000)
    return f"{salt}${digest.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        salt, expected = stored_hash.split("$", 1)
    except (AttributeError, ValueError):
        return False
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 200000)
    return hmac.compare_digest(digest.hex(), expected)


def create_session(db: Session, user: User):
    token = secrets.token_urlsafe(32)
    session = SessionToken(token=token, user_id=user.id)
    db.add(session)
    db.commit()
    return token


def serialize_baby(baby: Baby):
    return {"id": baby.id, "name": baby.name, "household_id": baby.household_id}


def serialize_household(household: Household):
    return {"id": household.id, "name": household.name}


def get_user_babies(db: Session, user_id: int):
    return (
        db.query(Baby)
        .join(HouseholdMember, HouseholdMember.household_id == Baby.household_id)
        .filter(HouseholdMember.user_id == user_id)
        .order_by(Baby.id.asc())
        .all()
    )


def get_user_households(db: Session, user_id: int):
    return (
        db.query(Household)
        .join(HouseholdMember, HouseholdMember.household_id == Household.id)
        .filter(HouseholdMember.user_id == user_id)
        .order_by(Household.id.asc())
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
    if not session or session.created_at < utc_now() - datetime.timedelta(days=30):
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
    baby = db.query(Baby).filter(Baby.id == x_baby_id).first()
    if not baby:
        raise HTTPException(status_code=404, detail="Baby not found")
    member = (
        db.query(HouseholdMember)
        .filter(HouseholdMember.household_id == baby.household_id, HouseholdMember.user_id == user.id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=403, detail="You do not have access to this baby")
    return baby


def require_household_owner(household_id: int, user: User, db: Session):
    member = (
        db.query(HouseholdMember)
        .filter(HouseholdMember.household_id == household_id, HouseholdMember.user_id == user.id)
        .first()
    )
    if not member or member.role != "owner":
        raise HTTPException(status_code=403, detail="Only a household owner can do this")
    household = db.query(Household).filter(Household.id == household_id).first()
    if not household:
        raise HTTPException(status_code=404, detail="Household not found")
    return household


def require_household_member(household_id: int, user: User, db: Session):
    member = (
        db.query(HouseholdMember)
        .filter(HouseholdMember.household_id == household_id, HouseholdMember.user_id == user.id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=403, detail="You do not have access to this household")
    household = db.query(Household).filter(Household.id == household_id).first()
    if not household:
        raise HTTPException(status_code=404, detail="Household not found")
    return household


def parse_date(value: str):
    try:
        return datetime.datetime.strptime(value, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")


def serialize_milk_entry(entry: MilkEntry):
    return {
        "id": entry.id,
        "date": str(entry.date),
        "amount": entry.amount,
        "notes": entry.notes,
        "created_at": utc_iso(entry.created_at),
    }


def serialize_log(log):
    return {"id": log.id, "created_at": utc_iso(log.created_at)}


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

    baby_name = data.baby_name.strip() or "Baby"
    household = Household(name=data.household_name.strip() or f"{baby_name} Family", created_by=user.id)
    db.add(household)
    db.flush()
    db.add(HouseholdMember(household_id=household.id, user_id=user.id, role="owner"))

    baby = Baby(name=baby_name, household_id=household.id, created_by=user.id)
    db.add(baby)
    db.flush()
    db.commit()

    token = create_session(db, user)
    return {
        "token": token,
        "user": {"id": user.id, "email": user.email},
        "babies": [serialize_baby(baby)],
        "households": [serialize_household(household)],
    }


@app.post("/auth/login")
def login(data: LoginRequest, db: Session = Depends(get_db)):
    email = data.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_session(db, user)
    babies = get_user_babies(db, user.id)
    households = get_user_households(db, user.id)
    return {
        "token": token,
        "user": {"id": user.id, "email": user.email},
        "babies": [serialize_baby(b) for b in babies],
        "households": [serialize_household(household) for household in households],
    }


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


@app.get("/me/preferences")
def get_preferences(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    preferences = db.get(UserPreferences, user.id)
    return {"milk_amounts": preferences.milk_amounts if preferences else [80, 200, -50]}


@app.put("/me/preferences")
def save_preferences(data: PreferencesUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if any(amount == 0 for amount in data.milk_amounts):
        raise HTTPException(status_code=422, detail="Milk button amounts must be nonzero")
    preferences = db.get(UserPreferences, user.id)
    if preferences is None:
        preferences = UserPreferences(user_id=user.id)
        db.add(preferences)
    preferences.milk_amounts = data.milk_amounts
    db.commit()
    return {"milk_amounts": preferences.milk_amounts}


@app.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    babies = get_user_babies(db, user.id)
    households = get_user_households(db, user.id)
    return {
        "user": {"id": user.id, "email": user.email},
        "milk_amounts": get_preferences(user, db)["milk_amounts"],
        "babies": [serialize_baby(b) for b in babies],
        "households": [serialize_household(household) for household in households],
    }


@app.get("/babies")
def list_babies(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"babies": [serialize_baby(baby) for baby in get_user_babies(db, user.id)]}


@app.post("/babies")
def add_baby(data: BabyCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Baby name is required")

    household_id = data.household_id
    if household_id:
        household = require_household_owner(household_id, user, db)
    else:
        household = Household(name=f"{name} Household", created_by=user.id)
        db.add(household)
        db.flush()
        db.add(HouseholdMember(household_id=household.id, user_id=user.id, role="owner"))

    baby = Baby(name=name, household_id=household.id, created_by=user.id)
    db.add(baby)
    db.commit()
    return {"baby": serialize_baby(baby)}


@app.put("/babies/{baby_id}")
def update_baby(baby_id: int, data: BabyUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    baby = db.get(Baby, baby_id)
    if not baby:
        raise HTTPException(status_code=404, detail="Baby not found")
    require_household_owner(baby.household_id, user, db)
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Baby name is required")
    baby.name = name
    db.commit()
    return {"baby": serialize_baby(baby)}


@app.post("/households/{household_id}/invites")
def create_household_invite(
    household_id: int,
    data: InviteCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_household_owner(household_id, user, db)
    token = secrets.token_urlsafe(24)
    invite = HouseholdInvite(
        household_id=household_id,
        token=token,
        role=data.role if data.role in ["owner", "caregiver"] else "caregiver",
        invited_email=data.invited_email.strip().lower() or None,
        expires_at=utc_now() + datetime.timedelta(days=7),
        created_by=user.id,
    )
    db.add(invite)
    db.commit()
    return {
        "token": token,
        "join_path": f"/join/{token}",
        "expires_at": utc_iso(invite.expires_at),
    }


@app.put("/households/{household_id}")
def update_household(
    household_id: int,
    data: HouseholdUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    household = require_household_member(household_id, user, db)
    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Household name is required")
    household.name = name
    db.commit()
    return {"household": serialize_household(household)}


@app.get("/households/{household_id}/members")
def household_members(household_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    require_household_member(household_id, user, db)
    members = db.query(HouseholdMember, User).join(User, User.id == HouseholdMember.user_id).filter(
        HouseholdMember.household_id == household_id).order_by(HouseholdMember.id).all()
    return {"members": [{"user_id": member.user_id, "email": account.email, "role": member.role}
                        for member, account in members]}


@app.get("/invites/{token}")
def get_invite(token: str, db: Session = Depends(get_db)):
    invite = db.query(HouseholdInvite).filter(HouseholdInvite.token == token).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    household = db.query(Household).filter(Household.id == invite.household_id).first()
    return {
        "household": serialize_household(household),
        "invited_email": invite.invited_email,
        "expires_at": utc_iso(invite.expires_at),
        "used_at": utc_iso(invite.used_at),
    }


@app.post("/invites/{token}/accept")
def accept_invite(
    token: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    invite = db.query(HouseholdInvite).filter(HouseholdInvite.token == token).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Invite not found")
    if invite.used_at:
        raise HTTPException(status_code=400, detail="Invite has already been used")
    if invite.expires_at < utc_now():
        raise HTTPException(status_code=400, detail="Invite has expired")
    if invite.invited_email and invite.invited_email != user.email:
        raise HTTPException(status_code=403, detail="This invite is for a different email")

    claimed = db.query(HouseholdInvite).filter(
        HouseholdInvite.id == invite.id,
        HouseholdInvite.used_at.is_(None),
        HouseholdInvite.expires_at >= utc_now(),
    ).update({"used_at": utc_now()}, synchronize_session=False)
    if claimed != 1:
        db.rollback()
        raise HTTPException(status_code=400, detail="Invite has already been used or expired")
    ensure_household_member(db, invite.household_id, user.id, invite.role)
    db.commit()

    babies = get_user_babies(db, user.id)
    households = get_user_households(db, user.id)
    return {
        "message": "Invite accepted",
        "babies": [serialize_baby(baby) for baby in babies],
        "households": [serialize_household(household) for household in households],
        "accepted_household_id": invite.household_id,
    }


@app.post("/entries")
def add_entry(
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
        created_at=utc_now(),
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
    return {"entries": [serialize_milk_entry(entry) for entry in entries]}


@app.get("/days/{date}")
def get_day_summary(date: str, baby: Baby = Depends(get_current_baby), db: Session = Depends(get_db)):
    entry_date = parse_date(date)
    entries = (
        db.query(MilkEntry)
        .filter(MilkEntry.date == entry_date, MilkEntry.baby_id == baby.id)
        .order_by(MilkEntry.created_at.desc())
        .all()
    )
    pee_logs = db.query(PeeLog).filter(PeeLog.date == entry_date, PeeLog.baby_id == baby.id).all()
    poop_logs = db.query(PoopLog).filter(PoopLog.date == entry_date, PoopLog.baby_id == baby.id).all()
    breastfeeding_logs = db.query(BreastfeedingLog).filter(BreastfeedingLog.date == entry_date, BreastfeedingLog.baby_id == baby.id).all()
    goal = db.query(DailyGoal).filter(DailyGoal.date == entry_date, DailyGoal.baby_id == baby.id).first()
    measurement = db.query(Measurement).filter(Measurement.date == entry_date, Measurement.baby_id == baby.id).first()

    return {
        "entries": [serialize_milk_entry(entry) for entry in entries],
        "pee_logs": [serialize_log(log) for log in pee_logs],
        "poop_logs": [serialize_log(log) for log in poop_logs],
        "breastfeeding_logs": [serialize_log(log) for log in breastfeeding_logs],
        "goal": goal.goal if goal else None,
        "measurement": {"weight": measurement.weight, "height": measurement.height} if measurement else None,
    }


@app.get("/history")
def get_history(start_date: str, end_date: str, baby: Baby = Depends(get_current_baby), db: Session = Depends(get_db)):
    return history_summary(db, baby.id, start_date, end_date)


@app.get("/exports")
def get_export(start_date: Optional[str] = None, end_date: Optional[str] = None, format: str = "json",
               baby: Baby = Depends(get_current_baby), db: Session = Depends(get_db)):
    return export_records(db, baby, start_date, end_date, format)


@app.put("/entries/{entry_id}")
def update_entry(
    entry_id: int,
    data: EntryUpdate,
    baby: Baby = Depends(get_current_baby),
    db: Session = Depends(get_db),
):
    entry = db.query(MilkEntry).filter(MilkEntry.id == entry_id, MilkEntry.baby_id == baby.id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    entry.amount = data.amount
    entry.notes = data.notes
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
    return {"message": "Pee logged", "timestamp": utc_iso(pee_log.created_at)}


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
    return {"message": "Poop logged", "timestamp": utc_iso(poop_log.created_at)}


@app.get("/pee/{date}")
def get_pee_logs(date: str, baby: Baby = Depends(get_current_baby), db: Session = Depends(get_db)):
    log_date = parse_date(date)
    logs = db.query(PeeLog).filter(PeeLog.date == log_date, PeeLog.baby_id == baby.id).all()
    return {"logs": [serialize_log(log) for log in logs]}


@app.get("/poop/{date}")
def get_poop_logs(date: str, baby: Baby = Depends(get_current_baby), db: Session = Depends(get_db)):
    log_date = parse_date(date)
    logs = db.query(PoopLog).filter(PoopLog.date == log_date, PoopLog.baby_id == baby.id).all()
    return {"logs": [serialize_log(log) for log in logs]}


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


@app.post("/breastfeeding")
def add_breastfeeding_log(data: DateOnly, baby: Baby = Depends(get_current_baby),
                          user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    log = BreastfeedingLog(baby_id=baby.id, date=parse_date(data.date), created_by=user.id)
    db.add(log)
    db.commit()
    db.refresh(log)
    return {"message": "Breastfeeding logged", "timestamp": utc_iso(log.created_at)}


@app.get("/breastfeeding/{date}")
def get_breastfeeding_logs(date: str, baby: Baby = Depends(get_current_baby), db: Session = Depends(get_db)):
    logs = db.query(BreastfeedingLog).filter(BreastfeedingLog.baby_id == baby.id,
                                           BreastfeedingLog.date == parse_date(date)).order_by(BreastfeedingLog.created_at.desc()).all()
    return {"logs": [serialize_log(log) for log in logs]}


@app.delete("/breastfeeding/{entry_id}")
def delete_breastfeeding_log(entry_id: int, baby: Baby = Depends(get_current_baby), db: Session = Depends(get_db)):
    log = db.query(BreastfeedingLog).filter(BreastfeedingLog.id == entry_id, BreastfeedingLog.baby_id == baby.id).first()
    if not log:
        raise HTTPException(status_code=404, detail="Breastfeeding entry not found")
    db.delete(log)
    db.commit()
    return {"message": "Breastfeeding entry deleted"}


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


@app.get("/measurements/{date}")
def get_measurement(date: str, baby: Baby = Depends(get_current_baby), db: Session = Depends(get_db)):
    entry = db.query(Measurement).filter(
        Measurement.date == parse_date(date), Measurement.baby_id == baby.id
    ).first()
    return {"measurement": {
        "id": entry.id, "date": str(entry.date), "weight": entry.weight,
        "height": entry.height, "created_at": utc_iso(entry.created_at),
    } if entry else None}
