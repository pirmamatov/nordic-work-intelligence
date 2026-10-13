from __future__ import annotations

import base64
import json
import re
from dataclasses import dataclass
from zoneinfo import ZoneInfo

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey


class ConfigError(Exception):
    """Konfiguratsiya imzosi yoki mazmuni yaroqsiz — u qo'llanmaydi."""


@dataclass(frozen=True)
class AgentConfig:
    version: str
    work_schedule: dict
    timezone: str
    idle_threshold_sec: int
    screenshots_enabled: bool
    screenshot_interval_sec: int
    excluded_processes: frozenset[str]
    allowed_domains: frozenset[str]
    heartbeat_interval_sec: int
    sync_interval_sec: int
    max_batch_size: int


_TIME = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise ConfigError(message)


def _int_in(data: dict, key: str, low: int, high: int) -> int:
    value = data.get(key)
    _require(isinstance(value, int) and not isinstance(value, bool) and low <= value <= high, f"{key} qiymati noto'g'ri")
    return value


def verify_signed_config(response: dict, public_key_b64: str, installation_id: str) -> AgentConfig:
    """Imzoni tekshiradi, so'ng mazmunni tekshiradi. Imzo aynan kelgan baytlar ustida tekshiriladi."""
    try:
        payload = response["payload"]
        signature = base64.b64decode(response["signature"], validate=True)
        key = Ed25519PublicKey.from_public_bytes(base64.b64decode(public_key_b64, validate=True))
        _require(isinstance(payload, str), "payload matn bo'lishi kerak")
        key.verify(signature, payload.encode("utf-8"))
        data = json.loads(payload)
    except InvalidSignature as exc:
        raise ConfigError("konfiguratsiya imzosi noto'g'ri") from exc
    except (KeyError, ValueError, TypeError) as exc:
        raise ConfigError(f"konfiguratsiya formati noto'g'ri: {exc}") from exc

    _require(isinstance(data, dict), "konfiguratsiya obyekt bo'lishi kerak")
    # Boshqa qurilma uchun imzolangan konfiguratsiya bu yerda qo'llanmaydi.
    _require(data.get("installationId") == installation_id, "konfiguratsiya boshqa o'rnatishga tegishli")

    schedule = data.get("workSchedule")
    _require(isinstance(schedule, dict), "workSchedule yo'q")
    days = schedule.get("days")
    _require(isinstance(days, list) and len(days) > 0 and all(isinstance(d, int) and 1 <= d <= 7 for d in days), "ish kunlari noto'g'ri")
    start, end = schedule.get("start"), schedule.get("end")
    _require(
        isinstance(start, str) and isinstance(end, str) and bool(_TIME.match(start)) and bool(_TIME.match(end)) and start < end,
        "ish vaqti noto'g'ri",
    )

    timezone_name = data.get("timezone")
    try:
        ZoneInfo(timezone_name)
    except Exception as exc:
        raise ConfigError("vaqt zonasi noto'g'ri") from exc

    shots = data.get("screenshots")
    _require(isinstance(shots, dict) and isinstance(shots.get("enabled"), bool), "screenshots bo'limi noto'g'ri")
    for key in ("excludedProcesses", "allowedDomains"):
        _require(isinstance(data.get(key), list) and all(isinstance(v, str) for v in data[key]), f"{key} noto'g'ri")
    _require(isinstance(data.get("configVersion"), str), "configVersion yo'q")

    return AgentConfig(
        version=data["configVersion"],
        work_schedule={"days": sorted(set(days)), "start": start, "end": end},
        timezone=timezone_name,
        idle_threshold_sec=_int_in(data, "idleThresholdSec", 30, 3600),
        screenshots_enabled=shots["enabled"],
        screenshot_interval_sec=_int_in(shots, "intervalSec", 60, 3600),
        excluded_processes=frozenset(p.lower() for p in data["excludedProcesses"]),
        allowed_domains=frozenset(d.lower() for d in data["allowedDomains"]),
        heartbeat_interval_sec=_int_in(data, "heartbeatIntervalSec", 15, 3600),
        sync_interval_sec=_int_in(data, "syncIntervalSec", 5, 3600),
        max_batch_size=_int_in(data, "maxBatchSize", 1, 500),
    )
