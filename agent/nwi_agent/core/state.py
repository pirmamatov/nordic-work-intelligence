from __future__ import annotations

import base64
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol


class Protector(Protocol):
    """Ma'lumotni joriy Windows foydalanuvchisi uchun shifrlaydi (DPAPI)."""

    def protect(self, data: bytes) -> bytes: ...
    def unprotect(self, data: bytes) -> bytes: ...


@dataclass
class Enrollment:
    server_url: str
    installation_id: str
    token: str
    public_key: str
    ca_file: str | None = None


class StateStore:
    """Agentning diskdagi holati. Token hech qachon ochiq matnda yozilmaydi."""

    def __init__(self, directory: Path, protector: Protector):
        self.directory = directory
        self.protector = protector
        directory.mkdir(parents=True, exist_ok=True)

    def _write(self, name: str, data: dict) -> None:
        tmp = self.directory / f"{name}.tmp"
        tmp.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, self.directory / name)

    def _read(self, name: str) -> dict | None:
        try:
            return json.loads((self.directory / name).read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None

    def save_enrollment(self, enrollment: Enrollment) -> None:
        protected = self.protector.protect(enrollment.token.encode("utf-8"))
        self._write(
            "enrollment.json",
            {
                "serverUrl": enrollment.server_url,
                "installationId": enrollment.installation_id,
                "tokenProtected": base64.b64encode(protected).decode("ascii"),
                "publicKey": enrollment.public_key,
                "caFile": enrollment.ca_file,
            },
        )

    def load_enrollment(self) -> Enrollment | None:
        data = self._read("enrollment.json")
        if not data:
            return None
        try:
            token = self.protector.unprotect(base64.b64decode(data["tokenProtected"])).decode("utf-8")
            return Enrollment(data["serverUrl"], data["installationId"], token, data["publicKey"], data.get("caFile"))
        except Exception:  # noqa: BLE001 — buzilgan yoki boshqa foydalanuvchiga tegishli holat
            return None

    def clear_enrollment(self) -> None:
        (self.directory / "enrollment.json").unlink(missing_ok=True)

    def save_signed_config(self, response: dict) -> None:
        self._write("config.json", {"payload": response["payload"], "signature": response["signature"]})

    def load_signed_config(self) -> dict | None:
        return self._read("config.json")
