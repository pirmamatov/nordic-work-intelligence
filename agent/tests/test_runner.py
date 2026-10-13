from nwi_agent.platform.fake import FakePlatform

from .conftest import run_seconds


def test_faoliyat_yigiladi_va_serverga_yetadi(make_agent, server, clock):
    platform = FakePlatform()
    agent = make_agent(platform)
    assert agent.load_config() is True

    run_seconds(agent, clock, 60)
    platform.process = "chrome.exe"
    run_seconds(agent, clock, 30)
    agent.flush()
    assert agent.sync_once() is True

    events = sorted(server.events.values(), key=lambda e: e["startedAt"])
    assert [(e["processName"], e["activeSec"], e["state"]) for e in events] == [
        ("winword.exe", 60, "ACTIVE"),
        ("chrome.exe", 29, "ACTIVE"),
    ]
    assert events[0]["startedAt"] == "2026-10-13T06:00:00.000Z"
    assert agent.queue.event_count() == 0
    assert agent.status.online is True


def test_tarmoq_uzilganda_malumot_yoqolmaydi_va_keyin_bir_marta_yetadi(make_agent, server, clock):
    platform = FakePlatform()
    agent = make_agent(platform)
    agent.load_config()

    server.fail_status = 503
    for process in ["winword.exe", "excel.exe", "chrome.exe", "winword.exe"]:
        platform.process = process
        run_seconds(agent, clock, 20)
        agent.sync_once()
    agent.flush()
    assert agent.sync_once() is False
    assert agent.status.online is False
    assert server.events == {}
    queued = agent.queue.event_count()
    assert queued == 4

    server.fail_status = None
    assert agent.sync_once() is True
    assert len(server.events) == queued
    assert agent.queue.event_count() == 0
    # Yana bir sinxronlash hech narsa yubormaydi.
    posts = server.event_posts
    agent.sync_once()
    assert server.event_posts == posts


def test_server_ochiq_bolmaganda_ham_navbat_saqlanadi(make_agent, clock):
    agent = make_agent(url="http://127.0.0.1:9")  # hech narsa tinglamaydigan port
    assert agent.load_config() is False
    assert agent.config is None
    run_seconds(agent, clock, 10)
    # Tekshirilgan konfiguratsiyasiz agent hech narsa yig'maydi.
    assert agent.queue.event_count() == 0
    assert agent.status.collecting is False


def test_javob_yoqolganda_qayta_yuborish_dublikat_bermaydi(make_agent, server, clock):
    platform = FakePlatform()
    agent = make_agent(platform)
    agent.load_config()
    run_seconds(agent, clock, 30)
    platform.process = "excel.exe"
    run_seconds(agent, clock, 30)
    agent.flush()

    # Server hodisalarni yozdi, lekin agent tasdiqni ololmadi.
    server.lose_next_event_response = True
    assert agent.sync_once() is False
    assert len(server.events) == 2
    assert agent.queue.event_count() == 2

    assert agent.sync_once() is True
    assert len(server.events) == 2
    assert agent.queue.event_count() == 0


def test_oflayn_ishlaganda_saqlangan_konfiguratsiyadan_foydalanadi(make_agent, server, clock, tmp_path):
    first = make_agent()
    assert first.load_config() is True
    first.queue.close()

    server.fail_status = 503
    second = make_agent()
    assert second.load_config() is False
    assert second.config is not None
    run_seconds(second, clock, 10)
    second.flush()
    assert second.queue.event_count() == 1


def test_ish_vaqtidan_tashqarida_hech_narsa_yigilmaydi(make_agent, server, clock):
    agent = make_agent()
    agent.load_config()
    run_seconds(agent, clock, 10)
    clock.now += 8 * 3600  # 19:00 Toshkent — ish vaqti tugagan
    run_seconds(agent, clock, 600)
    assert agent.status.in_schedule is False and agent.status.collecting is False
    agent.sync_once()
    [event] = server.events.values()
    assert event["activeSec"] == 9
    assert event["endedAt"] <= "2026-10-13T06:00:10.000Z"


def test_imzosi_notogri_konfiguratsiya_qollanmaydi(make_agent, server, clock):
    server.tamper_signature = True
    platform = FakePlatform()
    agent = make_agent(platform)
    assert agent.load_config() is False
    assert agent.config is None
    run_seconds(agent, clock, 700)
    assert agent.queue.event_count() == 0
    assert platform.captures == 0
    assert agent.queue.peek_errors()[0][1] == "CONFIG_REJECTED"


def test_token_bekor_qilinganda_yigish_toxtaydi(make_agent, server, clock):
    agent = make_agent()
    agent.load_config()
    run_seconds(agent, clock, 10)
    agent.flush()
    agent.api.token = "bekor-qilingan"
    assert agent.sync_once() is False
    assert agent.status.revoked is True
    before = agent.queue.event_count()
    run_seconds(agent, clock, 60)
    agent.flush()
    assert agent.queue.event_count() == before
    assert agent.status.collecting is False


def test_siyosat_ozgarsa_agent_yangi_konfiguratsiyani_oladi(make_agent, server, clock):
    agent = make_agent()
    agent.load_config()
    assert agent.status.screenshots_enabled is False
    server.config = {**server.config, "configVersion": "p1:2", "screenshots": {"enabled": True, "intervalSec": 60}}
    assert agent.heartbeat_once() is True
    assert agent.config.version == "p1:2"
    assert agent.status.screenshots_enabled is True


def test_agent_xatolari_serverga_yuboriladi(make_agent, server):
    agent = make_agent()
    agent.load_config()
    agent.queue.add_error("CAPTURE_FAILED", "ekran yo'q")
    agent.heartbeat_once()
    assert server.heartbeats[-1]["errors"][0]["code"] == "CAPTURE_FAILED"
    assert agent.queue.peek_errors() == []


# ── ekran tasvirlari ──


def enable_screenshots(server, interval=60, excluded=()):
    server.config = {
        **server.config,
        "configVersion": "p1:1",
        "screenshots": {"enabled": True, "intervalSec": interval},
        "excludedProcesses": list(excluded),
    }


def test_ochirilgan_bolsa_tasvir_olinmaydi(make_agent, server, clock):
    platform = FakePlatform()
    agent = make_agent(platform)
    agent.load_config()
    run_seconds(agent, clock, 1800)
    assert platform.captures == 0
    assert agent.queue.screenshot_count() == 0


def test_yoqilgan_bolsa_interval_boyicha_olinadi_va_xabar_beriladi(make_agent, server, clock):
    enable_screenshots(server, interval=60)
    platform = FakePlatform()
    agent = make_agent(platform)
    notified = []
    agent.on_capture = lambda: notified.append(clock.now)
    agent.load_config()

    run_seconds(agent, clock, 59)
    assert platform.captures == 0  # birinchi tasvir to'liq intervaldan keyin
    run_seconds(agent, clock, 125)
    assert platform.captures == 3
    assert len(notified) == 3

    # Navbatdagi fayl diskda ochiq holda yotmaydi.
    [(_, _, path), *_] = agent.queue.peek_screenshots(10)
    assert platform.screen not in path.read_bytes()

    assert agent.sync_once() is True
    assert list(server.screenshots.values()) == [platform.screen] * 3
    assert agent.queue.screenshot_count() == 0
    assert list(agent.screenshots_dir.iterdir()) == []


def test_qulflangan_ekran_va_istisno_dastur_suratga_olinmaydi(make_agent, server, clock):
    enable_screenshots(server, interval=60, excluded=["KeePass.exe"])
    platform = FakePlatform()
    agent = make_agent(platform)
    agent.load_config()

    platform.locked = True
    run_seconds(agent, clock, 130)
    platform.locked = False
    platform.process = "keepass.exe"
    run_seconds(agent, clock, 130)
    platform.process = None
    run_seconds(agent, clock, 130)
    assert platform.captures == 0

    platform.process = "winword.exe"
    run_seconds(agent, clock, 61)
    assert platform.captures == 1


def test_ish_vaqtidan_tashqarida_tasvir_olinmaydi(make_agent, server, clock):
    enable_screenshots(server, interval=60)
    platform = FakePlatform()
    agent = make_agent(platform)
    agent.load_config()
    clock.now += 8 * 3600
    run_seconds(agent, clock, 600)
    assert platform.captures == 0


def test_server_rad_etgan_tasvir_navbatda_qolmaydi_vaqtinchalik_xatoda_qoladi(make_agent, server, clock):
    enable_screenshots(server, interval=60)
    agent = make_agent()
    agent.load_config()
    run_seconds(agent, clock, 125)
    assert agent.queue.screenshot_count() == 2

    server.screenshot_error = (503, "UNAVAILABLE")
    assert agent.sync_once() is False
    assert agent.queue.screenshot_count() == 2

    # Administrator tasvirlarni o'chirdi: server endi qabul qilmaydi, agent ularni tashlaydi.
    server.screenshot_error = (403, "SCREENSHOTS_DISABLED")
    assert agent.sync_once() is True
    assert agent.queue.screenshot_count() == 0
    assert server.screenshots == {}
    assert list(agent.screenshots_dir.iterdir()) == []
