import base64
import copy

import pytest

from nwi_agent.core.api import validate_server_url
from nwi_agent.core.config import ConfigError, verify_signed_config
from nwi_agent.core.queue import LocalQueue
from nwi_agent.core.schedule import in_schedule
from nwi_agent.core.state import Enrollment, StateStore
from nwi_agent.platform.fake import FakePlatform

from .conftest import INSTALLATION_ID

SCHEDULE = {"days": [1, 2, 3, 4, 5], "start": "09:00", "end": "18:00"}
# 2026-10-13 — seshanba. 06:00 UTC = 11:00 Toshkent.
TUE_11 = 1791871200.0


@pytest.mark.parametrize(
    ("offset_hours", "expected"),
    [(0, True), (-2, True), (-2.01, False), (6.99, True), (7, False), (24, True), (4 * 24, False), (5 * 24, False), (6 * 24, True)],
)
def test_ish_jadvali_toshkent_vaqtida(offset_hours, expected):
    assert in_schedule(TUE_11 + offset_hours * 3600, SCHEDULE, "Asia/Tashkent") is expected


def test_imzolangan_konfiguratsiya_qabul_qilinadi(server):
    config = verify_signed_config(server.signed_config(), server.public_key, INSTALLATION_ID)
    assert config.idle_threshold_sec == 300
    assert config.screenshots_enabled is False
    assert config.work_schedule == SCHEDULE


def test_ozgartirilgan_konfiguratsiya_rad_etiladi(server):
    response = server.signed_config()
    response["payload"] = response["payload"].replace('"enabled": false', '"enabled": true')
    with pytest.raises(ConfigError, match="imzosi"):
        verify_signed_config(response, server.public_key, INSTALLATION_ID)


def test_boshqa_kalit_bilan_imzolangan_konfiguratsiya_rad_etiladi(server):
    other_key = base64.b64encode(bytes(range(32))).decode()
    with pytest.raises(ConfigError):
        verify_signed_config(server.signed_config(), other_key, INSTALLATION_ID)


def test_boshqa_qurilma_konfiguratsiyasi_rad_etiladi(server):
    with pytest.raises(ConfigError, match="boshqa"):
        verify_signed_config(server.signed_config(), server.public_key, "0190aaaa-0000-7000-8000-00000000ffff")


@pytest.mark.parametrize(
    "mutate",
    [
        lambda c: c.update(idleThresholdSec=1),
        lambda c: c["screenshots"].update(intervalSec=5),
        lambda c: c.update(timezone="Yoq/Zona"),
        lambda c: c["workSchedule"].update(start="18:00", end="09:00"),
        lambda c: c["workSchedule"].update(days=[0, 9]),
        lambda c: c.update(excludedProcesses="chrome.exe"),
        lambda c: c.pop("maxBatchSize"),
    ],
)
def test_togri_imzolangan_lekin_yaroqsiz_qiymat_rad_etiladi(server, mutate):
    server.config = copy.deepcopy(server.config)
    mutate(server.config)
    with pytest.raises(ConfigError):
        verify_signed_config(server.signed_config(), server.public_key, INSTALLATION_ID)


def test_navbat_qayta_ochilganda_saqlanadi_va_takror_yozilmaydi(tmp_path):
    queue = LocalQueue(tmp_path / "q.db")
    events = [{"id": f"e{i}", "n": i} for i in range(5)]
    queue.put_events(events)
    queue.put_events(events[:3])
    assert queue.event_count() == 5
    queue.close()

    reopened = LocalQueue(tmp_path / "q.db")
    assert [e["id"] for e in reopened.peek_events(3)] == ["e0", "e1", "e2"]
    reopened.delete_events(["e0", "e2", "yoq"])
    assert [e["id"] for e in reopened.peek_events(10)] == ["e1", "e3", "e4"]
    reopened.close()


def test_navbatdagi_tasvir_ochirilganda_fayli_ham_ochadi(tmp_path):
    queue = LocalQueue(tmp_path / "q.db")
    path = tmp_path / "a.bin"
    path.write_bytes(b"x")
    queue.put_screenshot("a", "2026-10-13T06:00:00.000Z", path)
    assert queue.screenshot_count() == 1
    queue.delete_screenshot("a")
    assert queue.screenshot_count() == 0 and not path.exists()
    queue.close()


def test_token_diskda_ochiq_saqlanmaydi(tmp_path):
    store = StateStore(tmp_path, FakePlatform())
    store.save_enrollment(Enrollment("https://nwi.example", "inst", "juda-maxfiy-token", "pub"))
    assert "juda-maxfiy-token" not in (tmp_path / "enrollment.json").read_text()
    assert store.load_enrollment() == Enrollment("https://nwi.example", "inst", "juda-maxfiy-token", "pub", None)
    (tmp_path / "enrollment.json").write_text('{"buzilgan": true}')
    assert store.load_enrollment() is None


@pytest.mark.parametrize(
    ("url", "allow_http", "ok"),
    [
        ("https://nwi.nordic.uz", False, True),
        ("https://nwi.nordic.uz/", False, True),
        ("http://nwi.nordic.uz", False, False),
        ("http://192.168.1.20:4000", False, False),
        ("http://192.168.1.20:4000", True, True),
        ("http://localhost:4000", True, True),
        ("http://8.8.8.8:4000", True, False),
        ("http://nwi.nordic.uz", True, False),
        ("ftp://x", True, False),
        ("", False, False),
    ],
)
def test_server_manzili_tekshiruvi(url, allow_http, ok):
    if ok:
        assert validate_server_url(url, allow_http).startswith(url.rstrip("/")[:8])
    else:
        with pytest.raises(ValueError):
            validate_server_url(url, allow_http)
