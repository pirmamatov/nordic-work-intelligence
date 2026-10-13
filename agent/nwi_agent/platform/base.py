from __future__ import annotations

from typing import Protocol


class Platform(Protocol):
    """Operatsion tizimga bog'liq amallar. Yadro faqat shu interfeys orqali ishlaydi."""

    def foreground_process(self) -> str | None:
        """Oldingi plandagi oyna jarayonining fayl nomi (yo'lsiz, kichik harfda). Oyna sarlavhasi olinmaydi."""

    def idle_seconds(self) -> float:
        """Oxirgi klaviatura/sichqoncha kiritishidan beri o'tgan vaqt. Kiritish mazmuni olinmaydi."""

    def is_locked(self) -> bool:
        """Ekran qulflangan yoki himoyalangan ish stoli (UAC, kirish oynasi) ochiq."""

    def capture_screen(self) -> bytes | None:
        """Ekran tasviri (JPEG). Olib bo'lmasa None."""

    def protect(self, data: bytes) -> bytes: ...
    def unprotect(self, data: bytes) -> bytes: ...
    def machine_id(self) -> str: ...
    def hostname(self) -> str: ...
    def os_version(self) -> str: ...
