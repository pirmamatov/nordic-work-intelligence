from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime

ACTIVE = "ACTIVE"
IDLE = "IDLE"
LOCKED = "LOCKED"

# Ekran qulflangan paytdagi segmentlar uchun shartli jarayon nomi.
LOCKED_PROCESS = "system-locked"


def iso(ts: float) -> str:
    """Epoch soniyani UTC ISO 8601 ko'rinishiga o'tkazadi (millisekund aniqligida)."""
    return datetime.fromtimestamp(ts, tz=UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


@dataclass(frozen=True)
class Sample:
    """Bir lahzadagi holat. Klaviatura yoki sichqoncha mazmuni bu yerda yo'q — faqat
    oxirgi kiritishdan beri o'tgan vaqt."""

    ts: float
    process: str | None
    idle_sec: float
    locked: bool


@dataclass
class Segment:
    """Bitta dastur bitta holatda (faol / nofaol / qulflangan) bo'lgan uzluksiz oraliq."""

    session_id: str
    process: str
    state: str
    start: float
    end: float
    id: str = field(default_factory=lambda: str(uuid.uuid4()))

    @property
    def duration(self) -> float:
        return self.end - self.start

    def to_event(self) -> dict:
        seconds = int(self.duration)
        return {
            "id": self.id,
            "sessionId": self.session_id,
            "processName": self.process,
            "startedAt": iso(self.start),
            "endedAt": iso(self.end),
            "activeSec": seconds if self.state == ACTIVE else 0,
            "idleSec": 0 if self.state == ACTIVE else seconds,
            "state": self.state,
        }
