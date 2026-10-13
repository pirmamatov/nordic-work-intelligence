from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo


def in_schedule(ts: float, work_schedule: dict, timezone_name: str) -> bool:
    """Lahza ish jadvali ichidami. Jadvaldan tashqarida agent hech narsa yig'maydi."""
    local = datetime.fromtimestamp(ts, tz=ZoneInfo(timezone_name))
    if local.isoweekday() not in work_schedule["days"]:
        return False
    return work_schedule["start"] <= local.strftime("%H:%M") < work_schedule["end"]
