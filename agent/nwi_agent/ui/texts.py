"""Xodimga ko'rsatiladigan matnlar."""

from __future__ import annotations

from datetime import datetime

from ..core.config import AgentConfig
from ..core.runner import Status

APP_NAME = "Nordic Work Intelligence"
DAY_NAMES = {1: "Du", 2: "Se", 3: "Cho", 4: "Pa", 5: "Ju", 6: "Sha", 7: "Ya"}

NOTICE = """Bu dastur Nordic International University tomonidan ish vaqtidagi faoliyat statistikasini yuritish uchun o‘rnatiladi. U yashirin ishlamaydi: belgisi doim vazifalar panelida turadi.

YIG‘ILADI (faqat ish vaqtida):
 • qaysi dastur oldingi planda ekani (dastur fayli nomi, masalan winword.exe) va qancha vaqt;
 • klaviatura yoki sichqoncha ishlatilgan-ishlatilmagani — faqat vaqti;
 • ekran qulflangan vaqt;
 • agar tashkilot siyosatida yoqilgan bo‘lsa — ekran tasviri. Bu holda ekranda doimiy belgi turadi va har bir tasvir olinganda xabar chiqadi.

YIG‘ILMAYDI:
 • klaviaturada nima terilgani, parollar;
 • clipboard (nusxa olingan matn);
 • oyna sarlavhalari, fayllar nomi va mazmuni;
 • yozishmalar va AI suhbatlari mazmuni;
 • veb-kamera va mikrofon;
 • ish vaqtidan tashqaridagi har qanday faoliyat.

Siz o‘zingiz haqingizda yig‘ilgan ma’lumotni administrator panelida ko‘rishingiz mumkin."""

CONSENT_LABEL = "Yuqoridagi shartlar bilan tanishdim"


def _clock(ts: float | None) -> str:
    return datetime.fromtimestamp(ts).strftime("%H:%M:%S") if ts else "—"


def policy_summary(config: AgentConfig | None) -> str:
    if config is None:
        return "Monitoring siyosati hali olinmagan. Siyosat olinmaguncha hech narsa yig‘ilmaydi."
    days = ", ".join(DAY_NAMES[d] for d in config.work_schedule["days"])
    lines = [
        f"Ish vaqti: {days}, {config.work_schedule['start']}–{config.work_schedule['end']} ({config.timezone})",
        f"Nofaollik chegarasi: {config.idle_threshold_sec // 60} daqiqa",
    ]
    if config.screenshots_enabled:
        lines.append(f"Ekran tasvirlari: YOQILGAN, har {config.screenshot_interval_sec // 60} daqiqada")
        if config.excluded_processes:
            lines.append("Suratga olinmaydigan dasturlar: " + ", ".join(sorted(config.excluded_processes)))
    else:
        lines.append("Ekran tasvirlari: o‘chirilgan")
    return "\n".join(lines)


def status_summary(status: Status) -> str:
    if status.revoked:
        state = "Agent administrator tomonidan bekor qilingan. Ma’lumot yig‘ilmayapti."
    elif not status.config_loaded:
        state = "Siyosat kutilmoqda. Ma’lumot yig‘ilmayapti."
    elif status.collecting:
        state = "Ish vaqti: faoliyat statistikasi yuritilmoqda."
    else:
        state = "Ish vaqtidan tashqari: hech narsa yig‘ilmayapti."
    return "\n".join(
        [
            state,
            f"Server bilan aloqa: {'bor' if status.online else 'yo‘q (ma’lumot kompyuterda saqlanib, keyin yuboriladi)'}",
            f"Oxirgi sinxronlash: {_clock(status.last_sync)}",
            f"Yuborilmagan yozuvlar: {status.queued_events}, tasvirlar: {status.queued_screenshots}",
            f"Oxirgi ekran tasviri: {_clock(status.last_capture)}",
        ]
    )


def tooltip(status: Status) -> str:
    if status.revoked:
        return f"{APP_NAME}: bekor qilingan"
    if status.collecting and status.screenshots_enabled:
        return f"{APP_NAME}: ish vaqti, ekran tasviri yoqilgan"
    if status.collecting:
        return f"{APP_NAME}: ish vaqti"
    return f"{APP_NAME}: yig‘ilmayapti"
