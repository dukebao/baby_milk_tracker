"""Baby-scoped history summaries and portable JSON/CSV exports."""
import csv
import datetime
import io
import json

from fastapi import HTTPException
from fastapi.responses import Response
from sqlalchemy import func
from models import MilkEntry, PeeLog, PoopLog, BreastfeedingLog, DailyGoal, Measurement
from time_utils import utc_now

MODELS = {"milk_entries": MilkEntry, "pee_logs": PeeLog, "poop_logs": PoopLog,
          "breastfeeding_logs": BreastfeedingLog, "daily_goals": DailyGoal, "measurements": Measurement}


def date_range(start, end, required=False):
    if not start and not end and not required:
        return None, None
    try:
        first = datetime.date.fromisoformat(start or "")
        last = datetime.date.fromisoformat(end or "")
    except ValueError:
        raise HTTPException(status_code=400, detail="Choose a valid start and end date")
    if first > last:
        raise HTTPException(status_code=400, detail="Start date must be before the end date")
    if required and (last - first).days > 365:
        raise HTTPException(status_code=400, detail="History range must be at most one year")
    return first, last


def history_summary(db, baby_id, start, end):
    first, last = date_range(start, end, required=True)
    days = {}
    earliest = None
    for name, model in MODELS.items():
        first_record = db.query(func.min(model.date)).filter(model.baby_id == baby_id).scalar()
        if first_record and (earliest is None or first_record < earliest):
            earliest = first_record
        fields = [model.date, func.count(model.id)]
        if model is MilkEntry:
            fields.append(func.sum(model.amount))
        rows = db.query(*fields).filter(model.baby_id == baby_id, model.date.between(first, last)).group_by(model.date).all()
        for row in rows:
            day = days.setdefault(str(row[0]), {"date": str(row[0]), "milk_ml": 0, "milk_entries": 0,
                                              "pee_logs": 0, "poop_logs": 0, "breastfeeding_logs": 0, "daily_goals": 0, "measurements": 0})
            day[name] = row[1]
            if model is MilkEntry:
                day["milk_ml"] = row[2] or 0
    return {"days": sorted(days.values(), key=lambda day: day["date"]), "earliest_date": str(earliest) if earliest else None}


def serialize(row):
    result = {}
    for column in row.__table__.columns:
        value = getattr(row, column.name)
        if isinstance(value, datetime.datetime):
            value = value.replace(tzinfo=datetime.timezone.utc).isoformat()
        elif isinstance(value, datetime.date):
            value = value.isoformat()
        result[column.name] = value
    return result


def export_records(db, baby, start, end, format):
    if format not in ("json", "csv"):
        raise HTTPException(status_code=400, detail="Choose JSON or CSV")
    first, last = date_range(start, end)
    data = {"version": 1, "exported_at": utc_now().replace(tzinfo=datetime.timezone.utc).isoformat(),
            "baby": {"id": baby.id, "name": baby.name}, "start_date": start, "end_date": end}
    for name, model in MODELS.items():
        query = db.query(model).filter(model.baby_id == baby.id)
        if first:
            query = query.filter(model.date.between(first, last))
        data[name] = [serialize(row) for row in query.order_by(model.date, model.id).all()]
    if format == "json":
        content = json.dumps(data, ensure_ascii=False, indent=2)
        media_type = "application/json"
    else:
        output = io.StringIO(newline="")
        columns = ["date", "type", "amount_ml", "notes", "created_at", "goal_ml", "weight_kg", "height_cm"]
        writer = csv.DictWriter(output, fieldnames=columns)
        writer.writeheader()
        rows = []
        for name in MODELS:
            for record in data[name]:
                notes = record.get("notes") or ""
                # Keep free text from being interpreted as a spreadsheet formula.
                if notes.lstrip().startswith(("=", "+", "-", "@")) or notes.startswith(("\t", "\r", "\n")):
                    notes = "'" + notes
                rows.append({"date": record["date"], "type": name, "amount_ml": record.get("amount", ""),
                             "notes": notes, "created_at": record.get("created_at", ""),
                             "goal_ml": record.get("goal", ""), "weight_kg": record.get("weight", ""),
                             "height_cm": record.get("height", "")})
        writer.writerows(sorted(rows, key=lambda row: (row["date"], row["created_at"])))
        content = "\ufeff" + output.getvalue()
        media_type = "text/csv"
    return Response(content, media_type=media_type,
                    headers={"Content-Disposition": f'attachment; filename="baby-{baby.id}-records.{format}"'})
