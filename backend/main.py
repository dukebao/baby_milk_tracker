from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException
from sqlalchemy import Column, Integer, String, Float, Date, create_engine
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

    new_entry = MilkEntry(date=entry_date, amount=entry.amount, notes=entry.notes)
    db.add(new_entry)
    db.commit()

    await manager.broadcast(f"New entry: {entry.date} - {entry.amount}ml")
    return {"message": "Entry added successfully"}

@app.get("/entries/{date}")
async def get_entries(date: str, db: Session = Depends(get_db)):
    entry_date = datetime.datetime.strptime(date, "%Y-%m-%d").date()
    entries = db.query(MilkEntry).filter(MilkEntry.date == entry_date).all()
    return {"entries": [{"id": e.id, "date": str(e.date), "amount": e.amount, "notes": e.notes} for e in entries]}

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
