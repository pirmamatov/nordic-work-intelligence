from __future__ import annotations

import json
import sqlite3
import threading
import time
from pathlib import Path


class LocalQueue:
    """Serverga yuborilmagan ma'lumotlarning diskdagi navbati (SQLite, WAL).

    Yozuv server qabul qilganini tasdiqlamaguncha o'chirilmaydi, shuning uchun tarmoq
    uzilishi yoki kompyuter o'chishi ma'lumot yo'qolishiga olib kelmaydi.
    """

    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._db = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self._db.execute("PRAGMA journal_mode=WAL")
        self._db.execute("PRAGMA synchronous=NORMAL")
        self._db.executescript(
            """
            CREATE TABLE IF NOT EXISTS events (
              seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS screenshots (
              seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
              captured_at TEXT NOT NULL, path TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS errors (
              seq INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT NOT NULL, message TEXT NOT NULL, occurred_at REAL NOT NULL);
            """
        )

    def close(self) -> None:
        with self._lock:
            self._db.close()

    # ── faoliyat hodisalari ──

    def put_events(self, events: list[dict]) -> None:
        if not events:
            return
        with self._lock:
            self._db.execute("BEGIN")
            self._db.executemany(
                "INSERT OR IGNORE INTO events (id, payload) VALUES (?, ?)",
                [(e["id"], json.dumps(e, ensure_ascii=False)) for e in events],
            )
            self._db.execute("COMMIT")

    def peek_events(self, limit: int) -> list[dict]:
        with self._lock:
            rows = self._db.execute("SELECT payload FROM events ORDER BY seq LIMIT ?", (limit,)).fetchall()
        return [json.loads(r[0]) for r in rows]

    def delete_events(self, ids: list[str]) -> None:
        if not ids:
            return
        with self._lock:
            self._db.execute("BEGIN")
            self._db.executemany("DELETE FROM events WHERE id = ?", [(i,) for i in ids])
            self._db.execute("COMMIT")

    def event_count(self) -> int:
        with self._lock:
            return self._db.execute("SELECT count(*) FROM events").fetchone()[0]

    # ── ekran tasvirlari (fayllar alohida, himoyalangan holda saqlanadi) ──

    def put_screenshot(self, shot_id: str, captured_at: str, path: Path) -> None:
        with self._lock:
            self._db.execute(
                "INSERT OR IGNORE INTO screenshots (id, captured_at, path) VALUES (?, ?, ?)",
                (shot_id, captured_at, str(path)),
            )

    def peek_screenshots(self, limit: int) -> list[tuple[str, str, Path]]:
        with self._lock:
            rows = self._db.execute("SELECT id, captured_at, path FROM screenshots ORDER BY seq LIMIT ?", (limit,)).fetchall()
        return [(r[0], r[1], Path(r[2])) for r in rows]

    def delete_screenshot(self, shot_id: str) -> None:
        with self._lock:
            row = self._db.execute("SELECT path FROM screenshots WHERE id = ?", (shot_id,)).fetchone()
            self._db.execute("DELETE FROM screenshots WHERE id = ?", (shot_id,))
        if row:
            Path(row[0]).unlink(missing_ok=True)

    def screenshot_count(self) -> int:
        with self._lock:
            return self._db.execute("SELECT count(*) FROM screenshots").fetchone()[0]

    # ── agent xatolari (keyingi aloqada serverga yuboriladi) ──

    def add_error(self, code: str, message: str) -> None:
        with self._lock:
            self._db.execute("INSERT INTO errors (code, message, occurred_at) VALUES (?, ?, ?)", (code, message[:1000], time.time()))
            # Xatolar jurnali cheksiz o'smasligi kerak.
            self._db.execute("DELETE FROM errors WHERE seq <= (SELECT max(seq) FROM errors) - 200")

    def peek_errors(self, limit: int = 20) -> list[tuple[int, str, str, float]]:
        with self._lock:
            return self._db.execute("SELECT seq, code, message, occurred_at FROM errors ORDER BY seq LIMIT ?", (limit,)).fetchall()

    def delete_errors(self, up_to_seq: int) -> None:
        with self._lock:
            self._db.execute("DELETE FROM errors WHERE seq <= ?", (up_to_seq,))
