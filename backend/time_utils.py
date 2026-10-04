"""Store naive UTC for existing columns; serialize explicit UTC at the API boundary."""
from datetime import datetime, timezone


def utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None)
