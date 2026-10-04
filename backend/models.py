"""Shared SQLite/PostgreSQL table definitions."""
from time_utils import utc_now
from sqlalchemy import Column, Date, DateTime, Float, ForeignKey, Integer, JSON, String, UniqueConstraint
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=utc_now)


class UserPreferences(Base):
    __tablename__ = "user_preferences"
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    milk_amounts = Column(JSON, nullable=False)


class SessionToken(Base):
    __tablename__ = "session_tokens"
    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=utc_now)


class Household(Base):
    __tablename__ = "households"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=utc_now)


class HouseholdMember(Base):
    __tablename__ = "household_members"
    __table_args__ = (UniqueConstraint("household_id", "user_id"),)
    id = Column(Integer, primary_key=True, index=True)
    household_id = Column(Integer, ForeignKey("households.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String, default="caregiver")
    created_at = Column(DateTime, default=utc_now)


class HouseholdInvite(Base):
    __tablename__ = "household_invites"
    id = Column(Integer, primary_key=True, index=True)
    household_id = Column(Integer, ForeignKey("households.id"), nullable=False)
    token = Column(String, unique=True, index=True, nullable=False)
    role = Column(String, default="caregiver")
    invited_email = Column(String, nullable=True)
    expires_at = Column(DateTime, nullable=False)
    used_at = Column(DateTime, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=utc_now)


class Baby(Base):
    __tablename__ = "babies"
    id = Column(Integer, primary_key=True, index=True)
    household_id = Column(Integer, ForeignKey("households.id"), index=True, nullable=True)
    name = Column(String, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=utc_now)


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
    created_at = Column(DateTime, default=utc_now)


class DailyGoal(Base):
    __tablename__ = "daily_goals"
    __table_args__ = (UniqueConstraint("baby_id", "date"),)
    id = Column(Integer, primary_key=True, index=True)
    baby_id = Column(Integer, ForeignKey("babies.id"), index=True, nullable=True)
    date = Column(Date, index=True)
    goal = Column(Integer, default=800)


class Measurement(Base):
    __tablename__ = "measurements"
    __table_args__ = (UniqueConstraint("baby_id", "date"),)
    id = Column(Integer, primary_key=True, index=True)
    baby_id = Column(Integer, ForeignKey("babies.id"), index=True, nullable=True)
    date = Column(Date, index=True)
    weight = Column(Float)
    height = Column(Float)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=utc_now)


class PeeLog(Base):
    __tablename__ = "pee_logs"
    id = Column(Integer, primary_key=True, index=True)
    baby_id = Column(Integer, ForeignKey("babies.id"), index=True, nullable=True)
    date = Column(Date, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=utc_now)


class PoopLog(Base):
    __tablename__ = "poop_logs"
    id = Column(Integer, primary_key=True, index=True)
    baby_id = Column(Integer, ForeignKey("babies.id"), index=True, nullable=True)
    date = Column(Date, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=utc_now)


class BreastfeedingLog(Base):
    __tablename__ = "breastfeeding_logs"
    id = Column(Integer, primary_key=True, index=True)
    baby_id = Column(Integer, ForeignKey("babies.id"), index=True, nullable=False)
    date = Column(Date, index=True, nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=utc_now, nullable=False)


