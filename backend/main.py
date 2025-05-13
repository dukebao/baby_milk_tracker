from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException
from sqlalchemy import Column, Integer, String, Float, Date, create_engine, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from typing import List
import datetime
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define expected data model
class EntryCreate(BaseModel):
    date: str
    amount: float
    notes: str = ""

# SQLite Database setup
DATABASE_URL = "sqlite:///./milk_tracking.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# WebSocket Connection Manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: str):
        for connection in self.active_connections:
            await connection.send_text(message)

manager = ConnectionManager()

# Database Model
class MilkEntry(Base):
    __tablename__ = "milk_entries"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, index=True)
    amount = Column(Float)
    notes = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

Base.metadata.create_all(bind=engine)

class DailyGoal(Base):
    __tablename__ = "daily_goals"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, unique=True, index=True)
    goal = Column(Integer, default=800)  # Default fallback

class GoalCreate(BaseModel):
    date: str
    goal: int

class Measurement(Base):
    __tablename__ = "measurements"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, index=True)
    weight = Column(Float)  # in kilograms
    height = Column(Float)  # in centimeters
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class MeasurementCreate(BaseModel):
    date: str  # "YYYY-MM-DD"
    weight: float
    height: float

class PeeLog(Base):
    __tablename__ = "pee_logs"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class PoopLog(Base):
    __tablename__ = "poop_logs"
    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class DateOnly(BaseModel):
    date: str

Base.metadata.create_all(bind=engine)

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# WebSocket Endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# API Endpoints

@app.post("/entries")
async def add_entry(entry: EntryCreate, db: Session = Depends(get_db)):
    print("🔹 Received Entry:", entry.dict())  # Log incoming data

    # Validate date format
    try:
        entry_date = datetime.datetime.strptime(entry.date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    new_entry = MilkEntry(
    date=entry_date,
    amount=entry.amount,
    notes=entry.notes,
    created_at=datetime.datetime.utcnow()
)

    db.add(new_entry)
    db.commit()

    await manager.broadcast(f"New entry: {entry.date} - {entry.amount}ml")
    return {"message": "Entry added successfully"}

@app.get("/entries/{date}")
async def get_entries(date: str, db: Session = Depends(get_db)):
    entry_date = datetime.datetime.strptime(date, "%Y-%m-%d").date()
    entries = db.query(MilkEntry).filter(MilkEntry.date == entry_date).all()
    return {
    "entries": [
        {
            "id": e.id,
            "date": str(e.date),
            "amount": e.amount,
            "notes": e.notes,
            "created_at": e.created_at.isoformat() if e.created_at else None
        }
        for e in entries
    ]
}


@app.put("/entries/{entry_id}")
async def update_entry(entry_id: int, amount: float, notes: str, db: Session = Depends(get_db)):
    entry = db.query(MilkEntry).filter(MilkEntry.id == entry_id).first()
    if not entry:
        return {"error": "Entry not found"}
    entry.amount = amount
    entry.notes = notes
    db.commit()
    await manager.broadcast(f"Updated entry {entry_id}: {amount}ml")
    return {"message": "Entry updated"}

@app.delete("/entries/{entry_id}")
async def delete_entry(entry_id: int, db: Session = Depends(get_db)):
    entry = db.query(MilkEntry).filter(MilkEntry.id == entry_id).first()
    if not entry:
        return {"error": "Entry not found"}
    db.delete(entry)
    db.commit()
    await manager.broadcast(f"Deleted entry {entry_id}")
    return {"message": "Entry deleted"}

@app.post("/goals")
def set_goal(goal_data: GoalCreate, db: Session = Depends(get_db)):
    goal_date = datetime.datetime.strptime(goal_data.date, "%Y-%m-%d").date()
    existing_goal = db.query(DailyGoal).filter(DailyGoal.date == goal_date).first()
    if existing_goal:
        existing_goal.goal = goal_data.goal
    else:
        new_goal = DailyGoal(date=goal_date, goal=goal_data.goal)
        db.add(new_goal)
    db.commit()
    return {"message": "Goal set successfully", "date": goal_data.date, "goal": goal_data.goal}


@app.get("/goals/{date}")
def get_goal(date: str, db: Session = Depends(get_db)):
    goal_date = datetime.datetime.strptime(date, "%Y-%m-%d").date()
    goal_entry = db.query(DailyGoal).filter(DailyGoal.date == goal_date).first()
    if not goal_entry:
        return {"goal": 800}  # Default fallback
    return {"goal": goal_entry.goal}

@app.post("/pee")
async def add_pee_log(data: DateOnly, db: Session = Depends(get_db)):
    try:
        log_date = datetime.datetime.strptime(data.date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format.")
    pee_log = PeeLog(date=log_date)
    db.add(pee_log)
    db.commit()
    return {"message": "Pee logged", "timestamp": pee_log.created_at.isoformat()}

@app.post("/poop")
async def add_poop_log(data: DateOnly, db: Session = Depends(get_db)):
    try:
        log_date = datetime.datetime.strptime(data.date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format.")
    poop_log = PoopLog(date=log_date)
    db.add(poop_log)
    db.commit()
    return {"message": "Poop logged", "timestamp": poop_log.created_at.isoformat()}

@app.get("/pee/{date}")
def get_pee_logs(date: str, db: Session = Depends(get_db)):
    log_date = datetime.datetime.strptime(date, "%Y-%m-%d").date()
    logs = db.query(PeeLog).filter(PeeLog.date == log_date).all()
    return {"logs": [{"id": l.id, "created_at": l.created_at.isoformat()} for l in logs]}

@app.get("/poop/{date}")
def get_poop_logs(date: str, db: Session = Depends(get_db)):
    log_date = datetime.datetime.strptime(date, "%Y-%m-%d").date()
    logs = db.query(PoopLog).filter(PoopLog.date == log_date).all()
    return {"logs": [{"id": l.id, "created_at": l.created_at.isoformat()} for l in logs]}

@app.delete("/pee/{entry_id}")
def delete_pee(entry_id: int, db: Session = Depends(get_db)):
    entry = db.query(PeeLog).filter(PeeLog.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Pee entry not found")
    db.delete(entry)
    db.commit()
    return {"message": f"Pee entry {entry_id} deleted"}

@app.delete("/poop/{entry_id}")
def delete_poop(entry_id: int, db: Session = Depends(get_db)):
    entry = db.query(PoopLog).filter(PoopLog.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Poop entry not found")
    db.delete(entry)
    db.commit()
    return {"message": f"Poop entry {entry_id} deleted"}

@app.post("/measurements")
def add_or_update_measurement(measurement: MeasurementCreate, db: Session = Depends(get_db)):
    entry_date = datetime.datetime.strptime(measurement.date, "%Y-%m-%d").date()
    existing = db.query(Measurement).filter(Measurement.date == entry_date).first()

    if existing:
        existing.weight = measurement.weight
        existing.height = measurement.height
        message = "Measurement updated"
    else:
        new_measurement = Measurement(
            date=entry_date,
            weight=measurement.weight,
            height=measurement.height
        )
        db.add(new_measurement)
        message = "Measurement added"

    db.commit()
    return {"message": message}
