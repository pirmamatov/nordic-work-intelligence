from __future__ import annotations

from .models import ACTIVE, IDLE, LOCKED, LOCKED_PROCESS, Sample, Segment

MIN_SEGMENT_SEC = 1.0


class Segmenter:
    """Har soniyadagi namunalarni segmentlarga yig'adi.

    Segment quyidagi hollarda yopiladi: dastur yoki holat o'zgardi; segment juda uzaydi
    (ma'lumot serverga bo'lib-bo'lib yetishi uchun); namunalar orasida uzilish bo'ldi
    (kompyuter uxlagan) yoki soat orqaga surildi.
    """

    def __init__(self, session_id: str, idle_threshold_sec: float, max_segment_sec: float = 300, gap_sec: float = 10):
        self.session_id = session_id
        self.idle_threshold_sec = idle_threshold_sec
        self.max_segment_sec = max_segment_sec
        self.gap_sec = gap_sec
        self._current: Segment | None = None
        self._last_ts: float | None = None

    @property
    def current_state(self) -> str | None:
        return self._current.state if self._current else None

    def _classify(self, sample: Sample) -> tuple[str, str] | None:
        if sample.locked:
            return LOCKED_PROCESS, LOCKED
        if sample.process is None:
            return None
        return sample.process, IDLE if sample.idle_sec >= self.idle_threshold_sec else ACTIVE

    def _close(self, end: float) -> list[Segment]:
        segment, self._current = self._current, None
        if segment is None:
            return []
        segment.end = end
        return [segment] if segment.duration >= MIN_SEGMENT_SEC else []

    def _open(self, process: str, state: str, start: float) -> None:
        self._current = Segment(self.session_id, process, state, start, start)

    def feed(self, sample: Sample) -> list[Segment]:
        """Namunani qabul qiladi va shu qadamda yopilgan segmentlarni qaytaradi."""
        key = self._classify(sample)
        if key is None:
            # Oldingi plandagi oyna aniqlanmadi (masalan, oynalar almashayotgan lahza): namuna tashlab ketiladi.
            return []
        process, state = key
        closed: list[Segment] = []
        last = self._last_ts
        self._last_ts = sample.ts

        if self._current is not None and last is not None and (sample.ts - last > self.gap_sec or sample.ts < last):
            closed += self._close(last)

        current = self._current
        if current is None:
            self._open(process, state, sample.ts)
        elif (current.process, current.state) != (process, state):
            boundary = sample.ts
            if state == IDLE and current.state == ACTIVE:
                # Nofaollik chegaradan o'tgan lahzada emas, oxirgi kiritish paytida boshlangan.
                boundary = max(current.start, sample.ts - sample.idle_sec)
            closed += self._close(boundary)
            self._open(process, state, boundary)
        elif sample.ts - current.start >= self.max_segment_sec:
            closed += self._close(sample.ts)
            self._open(process, state, sample.ts)
        return closed

    def flush(self) -> list[Segment]:
        """Ochiq segmentni oxirgi namuna vaqtida yopadi (to'xtash yoki ish vaqti tugashi)."""
        if self._current is None or self._last_ts is None:
            self._current = None
            return []
        return self._close(self._last_ts)
