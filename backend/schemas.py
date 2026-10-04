"""API request validation."""
from typing import Optional
from pydantic import BaseModel, Field, confloat


class RegisterRequest(BaseModel):
    email: str
    password: str
    baby_name: str = "Baby"
    household_name: str = ""


class LoginRequest(BaseModel):
    email: str
    password: str


class PreferencesUpdate(BaseModel):
    milk_amounts: list[confloat(allow_inf_nan=False)] = Field(min_length=3, max_length=3)


class BabyCreate(BaseModel):
    name: str
    household_id: Optional[int] = None


class BabyUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class InviteCreate(BaseModel):
    invited_email: str = ""
    role: str = "caregiver"


class HouseholdUpdate(BaseModel):
    name: str


class EntryCreate(BaseModel):
    date: str
    amount: float = Field(allow_inf_nan=False)
    notes: str = ""


class GoalCreate(BaseModel):
    date: str
    goal: int = Field(gt=0)


class MeasurementCreate(BaseModel):
    date: str
    weight: float = Field(gt=0, allow_inf_nan=False)
    height: float = Field(gt=0, allow_inf_nan=False)


class DateOnly(BaseModel):
    date: str


class EntryUpdate(BaseModel):
    amount: float = Field(allow_inf_nan=False)
    notes: str = ""
