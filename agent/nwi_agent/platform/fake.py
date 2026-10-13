from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass
class FakePlatform:
    """Testlar va Windows'siz muhitda sinash uchun boshqariladigan platforma."""

    process: str | None = "winword.exe"
    idle: float = 0.0
    locked: bool = False
    screen: bytes | None = b"\xff\xd8\xff\xe0" + b"soxta-ekran-tasviri" * 10 + b"\xff\xd9"
    captures: int = field(default=0)

    def foreground_process(self) -> str | None:
        return self.process

    def idle_seconds(self) -> float:
        return self.idle

    def is_locked(self) -> bool:
        return self.locked

    def capture_screen(self) -> bytes | None:
        self.captures += 1
        # Brauzerda ko'rsatib tekshirish uchun haqiqiy tasvir fayli berilishi mumkin.
        sample = os.environ.get("NWI_AGENT_FAKE_SCREEN_FILE")
        if sample:
            with open(sample, "rb") as file:
                return file.read()
        return self.screen

    # Haqiqiy shifrlash emas: faqat "diskda ochiq yotmaydi" shartini testda tekshirish uchun.
    def protect(self, data: bytes) -> bytes:
        return b"FAKE-DPAPI:" + bytes(b ^ 0x5A for b in data)

    def unprotect(self, data: bytes) -> bytes:
        if not data.startswith(b"FAKE-DPAPI:"):
            raise ValueError("himoyalangan ma'lumot formati noto'g'ri")
        return bytes(b ^ 0x5A for b in data[len(b"FAKE-DPAPI:") :])

    def machine_id(self) -> str:
        return "fake-machine-0001"

    def hostname(self) -> str:
        return "FAKE-PC"

    def os_version(self) -> str:
        return "Windows (sinov)"
