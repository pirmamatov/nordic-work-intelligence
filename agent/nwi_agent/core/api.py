from __future__ import annotations

import ipaddress
import json
import ssl
import urllib.error
import urllib.parse
import urllib.request

from .. import __version__


class NetworkError(Exception):
    """Serverga yetib bo'lmadi — ma'lumot navbatda qoladi va keyin qayta yuboriladi."""


class Unauthorized(Exception):
    """Token rad etildi: agent bekor qilingan yoki xodim faol emas."""


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(f"{status} {code}: {message}")
        self.status = status
        self.code = code


def validate_server_url(url: str, allow_http: bool) -> str:
    """Faqat HTTPS. HTTP faqat sinov uchun, aniq ruxsat bilan va faqat ichki tarmoq manzillariga."""
    parsed = urllib.parse.urlparse(url.strip().rstrip("/"))
    if parsed.scheme == "https" and parsed.hostname:
        return parsed.geturl()
    if parsed.scheme == "http" and parsed.hostname and allow_http:
        host = parsed.hostname
        try:
            address = ipaddress.ip_address(host)
            private = address.is_private or address.is_loopback
        except ValueError:
            private = host == "localhost"
        if private:
            return parsed.geturl()
        raise ValueError("HTTP faqat ichki tarmoq manzillari uchun ruxsat etiladi")
    raise ValueError("Server manzili https:// bilan boshlanishi kerak")


class ApiClient:
    def __init__(self, base_url: str, token: str | None = None, ca_file: str | None = None, timeout: float = 20):
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout
        # Sertifikat har doim tekshiriladi; ca_file — universitetning ichki sertifikat markazi uchun.
        self._ssl = ssl.create_default_context(cafile=ca_file) if self.base_url.startswith("https://") else None

    def _request(
        self, method: str, path: str, body: bytes | None = None, content_type: str = "application/json", query: dict | None = None
    ):
        url = f"{self.base_url}/api/agent/v1{path}"
        if query:
            url += "?" + urllib.parse.urlencode(query)
        request = urllib.request.Request(url, data=body, method=method)
        request.add_header("User-Agent", f"nwi-agent/{__version__}")
        request.add_header("Accept", "application/json")
        if body is not None:
            request.add_header("Content-Type", content_type)
        if self.token:
            request.add_header("Authorization", f"Bearer {self.token}")
        try:
            with urllib.request.urlopen(request, timeout=self.timeout, context=self._ssl) as response:
                raw = response.read()
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            try:
                error = json.loads(raw).get("error", {})
            except (ValueError, AttributeError):
                error = {}
            if exc.code == 401:
                raise Unauthorized(error.get("message", "rad etildi")) from exc
            raise ApiError(exc.code, error.get("code", "HTTP_ERROR"), error.get("message", "")) from exc
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            raise NetworkError(str(exc)) from exc
        try:
            return json.loads(raw) if raw else {}
        except ValueError as exc:
            raise ApiError(502, "INVALID_RESPONSE", "server javobi JSON emas") from exc

    def _json(self, method: str, path: str, payload: dict | None = None):
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        return self._request(method, path, body)

    def enroll(self, code: str, hostname: str, os_version: str, machine_id: str) -> dict:
        return self._json(
            "POST",
            "/enroll",
            {
                "code": code,
                "hostname": hostname,
                "osVersion": os_version,
                "machineId": machine_id,
                "agentVersion": __version__,
                "consentAcknowledged": True,
            },
        )

    def get_config(self) -> dict:
        return self._json("GET", "/config")

    def heartbeat(self, queue_depth: int, errors: list[dict]) -> dict:
        return self._json("POST", "/heartbeat", {"agentVersion": __version__, "queueDepth": queue_depth, "errors": errors})

    def post_events(self, sent_at: str, events: list[dict]) -> dict:
        return self._json("POST", "/events", {"sentAt": sent_at, "events": events})

    def post_screenshot(self, shot_id: str, captured_at: str, jpeg: bytes) -> dict:
        return self._request("POST", "/screenshots", jpeg, "image/jpeg", {"id": shot_id, "capturedAt": captured_at})
