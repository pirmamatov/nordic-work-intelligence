from __future__ import annotations

import base64
import json
import threading
from datetime import UTC
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from nwi_agent.core.api import ApiClient
from nwi_agent.core.queue import LocalQueue
from nwi_agent.core.runner import Agent
from nwi_agent.core.state import Enrollment, StateStore
from nwi_agent.platform.fake import FakePlatform

INSTALLATION_ID = "0190aaaa-0000-7000-8000-000000000001"
TOKEN = "sinov-tokeni"


class FakeServer:
    """Haqiqiy API xatti-harakatini takrorlaydigan mahalliy HTTP server (dublikatlarni id bo'yicha tashlaydi)."""

    def __init__(self):
        self.key = Ed25519PrivateKey.generate()
        self.public_key = base64.b64encode(
            self.key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        ).decode()
        self.events: dict[str, dict] = {}
        self.event_posts = 0
        self.screenshots: dict[str, bytes] = {}
        self.heartbeats: list[dict] = []
        self.config = self.default_config()
        self.fail_status: int | None = None  # barcha so'rovlarga shu holat kodi qaytadi
        self.lose_next_event_response = False  # hodisalar yoziladi, lekin javob "yo'qoladi"
        self.screenshot_error: tuple[int, str] | None = None
        self.tamper_signature = False
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), self._handler())
        self.url = f"http://127.0.0.1:{self.httpd.server_address[1]}"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    @staticmethod
    def default_config() -> dict:
        return {
            "configVersion": "builtin:0",
            "installationId": INSTALLATION_ID,
            "issuedAt": "2026-10-13T00:00:00.000Z",
            "workSchedule": {"days": [1, 2, 3, 4, 5], "start": "09:00", "end": "18:00"},
            "timezone": "Asia/Tashkent",
            "idleThresholdSec": 300,
            "screenshots": {"enabled": False, "intervalSec": 600},
            "excludedProcesses": [],
            "allowedDomains": [],
            "heartbeatIntervalSec": 60,
            "syncIntervalSec": 30,
            "maxBatchSize": 500,
        }

    def signed_config(self) -> dict:
        payload = json.dumps(self.config)
        signature = self.key.sign(payload.encode())
        if self.tamper_signature:
            payload = payload.replace('"enabled": false', '"enabled": true')
        return {
            "configVersion": self.config["configVersion"],
            "payload": payload,
            "signature": base64.b64encode(signature).decode(),
            "algorithm": "Ed25519",
        }

    def close(self):
        self.httpd.shutdown()
        self.httpd.server_close()

    def _handler(self):
        server = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def _send(self, status: int, body: dict):
                raw = json.dumps(body).encode()
                self.send_response(status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)

            def _handle(self):
                url = urlparse(self.path)
                body = self.rfile.read(int(self.headers.get("Content-Length") or 0))
                if self.headers.get("Authorization") != f"Bearer {TOKEN}":
                    return self._send(401, {"error": {"code": "AGENT_UNAUTHORIZED", "message": "rad etildi"}})
                if server.fail_status:
                    return self._send(server.fail_status, {"error": {"code": "UNAVAILABLE", "message": "ishlamayapti"}})
                route = url.path.removeprefix("/api/agent/v1")
                if route == "/config":
                    return self._send(200, server.signed_config())
                if route == "/heartbeat":
                    server.heartbeats.append(json.loads(body))
                    return self._send(200, {"serverTime": "x", "configVersion": server.config["configVersion"]})
                if route == "/events":
                    server.event_posts += 1
                    events = json.loads(body)["events"]
                    duplicates = sum(1 for e in events if e["id"] in server.events)
                    for e in events:
                        server.events.setdefault(e["id"], e)
                    if server.lose_next_event_response:
                        server.lose_next_event_response = False
                        return self._send(502, {"error": {"code": "BAD_GATEWAY", "message": "javob yo'qoldi"}})
                    return self._send(200, {"accepted": [e["id"] for e in events], "duplicates": duplicates, "rejected": []})
                if route == "/screenshots":
                    if server.screenshot_error:
                        status, code = server.screenshot_error
                        return self._send(status, {"error": {"code": code, "message": code}})
                    shot_id = parse_qs(url.query)["id"][0]
                    duplicate = shot_id in server.screenshots
                    server.screenshots.setdefault(shot_id, body)
                    return self._send(200 if duplicate else 201, {"id": shot_id, "duplicate": duplicate})
                return self._send(404, {"error": {"code": "NOT_FOUND", "message": ""}})

            do_GET = do_POST = _handle

        return Handler


class Clock:
    """Qo'lda suriladigan soat. Boshlanishi: 2026-10-13 (seshanba) 11:00 Toshkent vaqti."""

    def __init__(self):
        self.now = 1791871200.0

    def __call__(self) -> float:
        return self.now


@pytest.fixture
def server():
    srv = FakeServer()
    yield srv
    srv.close()


@pytest.fixture
def clock():
    c = Clock()
    # 1791871200 = 2026-10-13T06:00:00Z ekanini kafolatlaydi (testlar shunga tayanadi).
    from datetime import datetime

    assert datetime.fromtimestamp(c.now, tz=UTC).isoformat() == "2026-10-13T06:00:00+00:00"
    return c


@pytest.fixture
def make_agent(tmp_path, server, clock):
    created = []

    def factory(platform: FakePlatform | None = None, url: str | None = None, token: str = TOKEN):
        platform = platform or FakePlatform()
        enrollment = Enrollment(url or server.url, INSTALLATION_ID, token, server.public_key)
        store = StateStore(tmp_path / "state", platform)
        queue = LocalQueue(tmp_path / "queue.db")
        api = ApiClient(enrollment.server_url, token, timeout=3)
        agent = Agent(platform, api, queue, store, enrollment, tmp_path / "shots", clock=clock)
        created.append(queue)
        return agent

    yield factory
    for queue in created:
        queue.close()


def run_seconds(agent: Agent, clock: Clock, seconds: int) -> None:
    """Agentni `seconds` soniya davomida har soniyada namuna oldirib ishlatadi."""
    for _ in range(seconds):
        agent.sample_once()
        clock.now += 1
