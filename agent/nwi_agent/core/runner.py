from __future__ import annotations

import logging
import threading
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from ..platform.base import Platform
from .api import ApiClient, ApiError, NetworkError, Unauthorized
from .config import AgentConfig, ConfigError, verify_signed_config
from .models import Sample, iso
from .queue import LocalQueue
from .schedule import in_schedule
from .segmenter import Segmenter
from .state import Enrollment, StateStore

log = logging.getLogger("nwi.agent")

MAX_QUEUED_SCREENSHOTS = 200
# Server hech qachon qabul qilmaydigan tasvirlar: navbatda saqlab turishning ma'nosi yo'q.
PERMANENT_SCREENSHOT_ERRORS = {"SCREENSHOTS_DISABLED", "INVALID_IMAGE", "INVALID_CAPTURE_TIME", "PAYLOAD_TOO_LARGE"}


@dataclass
class Status:
    """Foydalanuvchiga ko'rsatiladigan holat."""

    config_loaded: bool = False
    collecting: bool = False
    in_schedule: bool = False
    online: bool = False
    revoked: bool = False
    screenshots_enabled: bool = False
    queued_events: int = 0
    queued_screenshots: int = 0
    last_sync: float | None = None
    last_capture: float | None = None


class Agent:
    def __init__(
        self,
        platform: Platform,
        api: ApiClient,
        queue: LocalQueue,
        store: StateStore,
        enrollment: Enrollment,
        screenshots_dir: Path,
        clock: Callable[[], float] = time.time,
        on_capture: Callable[[], None] | None = None,
    ):
        self.platform = platform
        self.api = api
        self.queue = queue
        self.store = store
        self.enrollment = enrollment
        self.screenshots_dir = screenshots_dir
        self.clock = clock
        self.on_capture = on_capture
        self.status = Status()
        self.config: AgentConfig | None = None
        self.session_id = str(uuid.uuid4())
        self._segmenter: Segmenter | None = None
        self._lock = threading.Lock()
        self._next_capture = 0.0
        screenshots_dir.mkdir(parents=True, exist_ok=True)

    # ── konfiguratsiya ──

    def _apply(self, config: AgentConfig) -> None:
        with self._lock:
            previous = self.config
            if previous is None or previous.idle_threshold_sec != config.idle_threshold_sec:
                self._store_segments(self._segmenter.flush() if self._segmenter else [])
                self._segmenter = Segmenter(self.session_id, config.idle_threshold_sec)
            if previous is None or not previous.screenshots_enabled:
                # Birinchi tasvir yoqilgandan keyin to'liq bir interval o'tgach olinadi.
                self._next_capture = self.clock() + config.screenshot_interval_sec
            self.config = config
            self.status.config_loaded = True
            self.status.screenshots_enabled = config.screenshots_enabled

    def load_config(self) -> bool:
        """Serverdan konfiguratsiyani oladi; aloqa bo'lmasa oxirgi tekshirilgan nusxadan foydalanadi.
        Imzosi yaroqsiz konfiguratsiya hech qachon qo'llanmaydi."""
        try:
            response = self.api.get_config()
            config = verify_signed_config(response, self.enrollment.public_key, self.enrollment.installation_id)
            self.store.save_signed_config(response)
            self._apply(config)
            self.status.online = True
            return True
        except Unauthorized:
            self._revoke()
            return False
        except ConfigError as exc:
            log.error("Serverdan kelgan konfiguratsiya rad etildi: %s", exc)
            self.queue.add_error("CONFIG_REJECTED", str(exc))
        except (NetworkError, ApiError) as exc:
            self.status.online = False
            log.warning("Konfiguratsiyani olib bo'lmadi: %s", exc)

        if self.config is None:
            cached = self.store.load_signed_config()
            if cached:
                try:
                    self._apply(verify_signed_config(cached, self.enrollment.public_key, self.enrollment.installation_id))
                except ConfigError as exc:
                    log.error("Saqlangan konfiguratsiya yaroqsiz: %s", exc)
        return False

    def _revoke(self) -> None:
        if not self.status.revoked:
            log.warning("Server tokenni rad etdi: agent bekor qilingan. Ma'lumot yig'ish to'xtatildi.")
        self.status.revoked = True
        self.status.collecting = False
        self.status.online = False

    # ── ma'lumot yig'ish ──

    def _store_segments(self, segments) -> None:
        self.queue.put_events([s.to_event() for s in segments])

    def sample_once(self) -> None:
        with self._lock:
            config, segmenter = self.config, self._segmenter
            if config is None or segmenter is None or self.status.revoked:
                self.status.collecting = False
                return
            now = self.clock()
            self.status.in_schedule = in_schedule(now, config.work_schedule, config.timezone)
            if not self.status.in_schedule:
                # Ish vaqtidan tashqarida hech narsa yig'ilmaydi.
                self._store_segments(segmenter.flush())
                self.status.collecting = False
                return

            locked = self.platform.is_locked()
            process = None if locked else self.platform.foreground_process()
            self._store_segments(segmenter.feed(Sample(now, process, self.platform.idle_seconds(), locked)))
            self.status.collecting = True
            self._maybe_capture(config, now, process, locked)

    def _maybe_capture(self, config: AgentConfig, now: float, process: str | None, locked: bool) -> None:
        if not config.screenshots_enabled or now < self._next_capture:
            return
        self._next_capture = now + config.screenshot_interval_sec
        # Qulflangan ekran, aniqlanmagan oyna va istisno ro'yxatidagi dasturlar suratga olinmaydi.
        if locked or process is None or process in config.excluded_processes:
            return
        if self.queue.screenshot_count() >= MAX_QUEUED_SCREENSHOTS:
            return
        try:
            image = self.platform.capture_screen()
            if not image:
                return
            shot_id = str(uuid.uuid4())
            path = self.screenshots_dir / f"{shot_id}.bin"
            # Navbatdagi tasvir diskda ochiq holda yotmaydi.
            path.write_bytes(self.platform.protect(image))
            self.queue.put_screenshot(shot_id, iso(now), path)
            self.status.last_capture = now
        except Exception as exc:  # noqa: BLE001 — tasvir xatosi faoliyat hisobini to'xtatmasligi kerak
            log.error("Ekran tasvirini olib bo'lmadi: %s", exc)
            self.queue.add_error("CAPTURE_FAILED", str(exc))
            return
        if self.on_capture:
            self.on_capture()

    def flush(self) -> None:
        with self._lock:
            if self._segmenter:
                self._store_segments(self._segmenter.flush())

    # ── sinxronlash ──

    def sync_once(self) -> bool:
        """Navbatni serverga yuboradi. Server tasdiqlagan yozuvlargina navbatdan o'chiriladi."""
        if self.status.revoked:
            return False
        batch_size = self.config.max_batch_size if self.config else 500
        try:
            while batch := self.queue.peek_events(batch_size):
                response = self.api.post_events(iso(self.clock()), batch)
                rejected = response.get("rejected", [])
                for item in rejected:
                    self.queue.add_error("EVENT_REJECTED", f"{item.get('id')}: {item.get('reason')}")
                done = list(response.get("accepted", [])) + [r["id"] for r in rejected if r.get("id")]
                if not done:
                    # Server hech birini taniy olmadi: cheksiz qayta yuborishning oldini olish uchun to'plam tashlanadi.
                    done = [e["id"] for e in batch]
                self.queue.delete_events(done)

            for shot_id, captured_at, path in self.queue.peek_screenshots(MAX_QUEUED_SCREENSHOTS):
                try:
                    image = self.platform.unprotect(path.read_bytes())
                except (OSError, ValueError) as exc:
                    self.queue.add_error("SCREENSHOT_UNREADABLE", str(exc))
                    self.queue.delete_screenshot(shot_id)
                    continue
                try:
                    self.api.post_screenshot(shot_id, captured_at, image)
                except ApiError as exc:
                    if exc.code not in PERMANENT_SCREENSHOT_ERRORS:
                        raise
                    self.queue.add_error("SCREENSHOT_REJECTED", exc.code)
                self.queue.delete_screenshot(shot_id)
        except Unauthorized:
            self._revoke()
            return False
        except (NetworkError, ApiError) as exc:
            self.status.online = False
            log.warning("Sinxronlash bajarilmadi, keyin qayta uriniladi: %s", exc)
            return False
        finally:
            self.status.queued_events = self.queue.event_count()
            self.status.queued_screenshots = self.queue.screenshot_count()
        self.status.online = True
        self.status.last_sync = self.clock()
        return True

    def heartbeat_once(self) -> bool:
        if self.status.revoked:
            return False
        errors = self.queue.peek_errors()
        try:
            response = self.api.heartbeat(
                self.queue.event_count(),
                [{"code": code, "message": message, "occurredAt": iso(at)} for _, code, message, at in errors],
            )
        except Unauthorized:
            self._revoke()
            return False
        except (NetworkError, ApiError) as exc:
            self.status.online = False
            log.warning("Server bilan aloqa yo'q: %s", exc)
            return False
        if errors:
            self.queue.delete_errors(errors[-1][0])
        self.status.online = True
        if self.config is None or response.get("configVersion") != self.config.version:
            self.load_config()
        return True

    # ── asosiy sikl ──

    def run(self, stop: threading.Event) -> None:
        """Namuna olish har soniyada; tarmoq amallari alohida oqimda (sekin tarmoq hisobni to'xtatmasligi uchun)."""
        self.load_config()
        network = threading.Thread(target=self._network_loop, args=(stop,), name="nwi-network", daemon=True)
        network.start()
        while not stop.wait(1.0):
            try:
                self.sample_once()
            except Exception as exc:
                log.exception("Namuna olishda xatolik")
                self.queue.add_error("SAMPLE_FAILED", str(exc))
        self.flush()
        network.join(timeout=30)
        self.sync_once()

    def _network_loop(self, stop: threading.Event) -> None:
        next_sync = next_heartbeat = 0.0
        backoff = 0.0
        while not stop.wait(1.0):
            now = time.monotonic()
            config = self.config
            try:
                if now >= next_heartbeat:
                    self.heartbeat_once()
                    next_heartbeat = now + (config.heartbeat_interval_sec if config else 60)
                if now >= next_sync:
                    ok = self.sync_once()
                    # Aloqa bo'lmasa oraliq asta-sekin uzayadi (eng ko'pi 5 daqiqa).
                    backoff = 0.0 if ok else min(max(backoff * 2, 30.0), 300.0)
                    next_sync = now + (config.sync_interval_sec if config else 30) + backoff
            except Exception as exc:
                log.exception("Tarmoq siklida xatolik")
                self.queue.add_error("NETWORK_LOOP_FAILED", str(exc))
