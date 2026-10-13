from __future__ import annotations

import argparse
import logging
import os
import signal
import sys
import threading
from logging.handlers import RotatingFileHandler
from pathlib import Path

from . import __version__, build_config
from .core.api import ApiClient, ApiError, NetworkError, Unauthorized, validate_server_url
from .core.config import ConfigError, verify_signed_config
from .core.queue import LocalQueue
from .core.runner import Agent
from .core.state import Enrollment, StateStore

log = logging.getLogger("nwi.agent")


def data_dir() -> Path:
    override = os.environ.get("NWI_AGENT_HOME")
    if override:
        return Path(override)
    return Path(os.environ.get("LOCALAPPDATA", Path.home())) / "NordicWorkIntelligence"


def build_platform():
    if sys.platform == "win32":
        from .platform.windows import WindowsPlatform

        return WindowsPlatform()
    if os.environ.get("NWI_AGENT_FAKE_PLATFORM") == "1":
        # Faqat ishlab chiqish va sinov uchun: haqiqiy ma'lumot yig'ilmaydi.
        from .platform.fake import FakePlatform

        return FakePlatform()
    raise SystemExit("Bu agent faqat Windows uchun mo‘ljallangan.")


def setup_logging(directory: Path) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    handler = RotatingFileHandler(directory / "agent.log", maxBytes=1_000_000, backupCount=3, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s: %(message)s"))
    logging.basicConfig(level=logging.INFO, handlers=[handler])


def enroll(platform, store: StateStore, server_url: str, code: str, public_key: str, ca_file: str | None, allow_http: bool) -> Enrollment:
    """Bir martalik kod bilan ro'yxatdan o'tadi. Qaytgan konfiguratsiya imzosi mos kelmasa hech narsa saqlanmaydi."""
    if not public_key:
        raise ValueError("Konfiguratsiya ochiq kaliti berilmagan (yig‘ishda yoki --public-key orqali)")
    url = validate_server_url(server_url, allow_http)
    api = ApiClient(url, ca_file=ca_file)
    response = api.enroll(code.strip().upper(), platform.hostname(), platform.os_version(), platform.machine_id())
    enrollment = Enrollment(url, response["installationId"], response["token"], public_key, ca_file)
    verify_signed_config(response["config"], public_key, enrollment.installation_id)
    store.save_enrollment(enrollment)
    store.save_signed_config(response["config"])
    return enrollment


def describe_enroll_error(exc: Exception) -> str:
    if isinstance(exc, Unauthorized):
        return "Ro‘yxatdan o‘tish kodi noto‘g‘ri yoki muddati o‘tgan."
    if isinstance(exc, NetworkError):
        return f"Serverga ulanib bo‘lmadi: {exc}"
    if isinstance(exc, ConfigError):
        return f"Server konfiguratsiyasi imzosi mos kelmadi — server manzili yoki ochiq kalit noto‘g‘ri ({exc})."
    if isinstance(exc, ApiError):
        return f"Server so‘rovni rad etdi: {exc}"
    return str(exc)


def make_agent(platform, store: StateStore, enrollment: Enrollment, home: Path) -> Agent:
    api = ApiClient(enrollment.server_url, enrollment.token, enrollment.ca_file)
    return Agent(platform, api, LocalQueue(home / "queue.db"), store, enrollment, home / "screenshots")


def cmd_enroll(args, platform, store: StateStore) -> int:
    from .ui import texts

    print(texts.NOTICE, "\n")
    if not args.accept and input(f"{texts.CONSENT_LABEL}? (ha/yo‘q): ").strip().lower() != "ha":
        print("Bekor qilindi.")
        return 1
    try:
        enrollment = enroll(
            platform,
            store,
            args.server or build_config.SERVER_URL,
            args.code,
            args.public_key or build_config.CONFIG_PUBLIC_KEY,
            args.ca_file,
            args.allow_http,
        )
    except Exception as exc:  # noqa: BLE001
        print("Xatolik:", describe_enroll_error(exc))
        return 1
    print(f"Ro‘yxatdan o‘tildi. O‘rnatish identifikatori: {enrollment.installation_id}")
    return 0


def cmd_status(_args, _platform, store: StateStore) -> int:
    enrollment = store.load_enrollment()
    if not enrollment:
        print("Agent ro‘yxatdan o‘tmagan.")
        return 1
    print(f"Versiya: {__version__}\nServer: {enrollment.server_url}\nO‘rnatish: {enrollment.installation_id}")
    return 0


def cmd_run(args, platform, store: StateStore) -> int:
    home = store.directory
    use_ui = not args.no_ui
    if sys.platform == "win32":
        from .platform.windows import acquire_single_instance, enable_dpi_awareness

        if not acquire_single_instance():
            return 0  # agent allaqachon ishlayapti
        enable_dpi_awareness()

    enrollment = store.load_enrollment()
    if not enrollment and use_ui:
        from .ui.app import enroll_dialog, show_error

        while not enrollment:
            answer = enroll_dialog(build_config.SERVER_URL)
            if answer is None:
                return 1
            try:
                enrollment = enroll(platform, store, answer[0], answer[1], build_config.CONFIG_PUBLIC_KEY, None, args.allow_http)
            except Exception as exc:  # noqa: BLE001
                log.error("Ro'yxatdan o'tish bajarilmadi: %s", exc)
                show_error(describe_enroll_error(exc))
    if not enrollment:
        print("Agent ro‘yxatdan o‘tmagan. Avval: nwi-agent enroll --server ... --code ...")
        return 1

    agent = make_agent(platform, store, enrollment, home)
    stop = threading.Event()
    log.info("Agent ishga tushdi, versiya %s", __version__)
    if not use_ui:
        signal.signal(signal.SIGINT, lambda *_: stop.set())
        signal.signal(signal.SIGTERM, lambda *_: stop.set())
        agent.run(stop)
        return 0

    from .ui.app import AgentUI

    worker = threading.Thread(target=agent.run, args=(stop,), name="nwi-agent", daemon=True)
    worker.start()
    try:
        AgentUI(agent, stop).run()
    finally:
        stop.set()
        worker.join(timeout=40)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="nwi-agent", description="Nordic Work Intelligence — Windows agenti")
    parser.add_argument("--version", action="version", version=__version__)
    sub = parser.add_subparsers(dest="command")

    p_enroll = sub.add_parser("enroll", help="Bir martalik kod bilan ro‘yxatdan o‘tish")
    p_enroll.add_argument("--server", help="Server manzili, masalan https://nwi.nordic.uz")
    p_enroll.add_argument("--code", required=True, help="Administrator bergan kod")
    p_enroll.add_argument("--public-key", help="Konfiguratsiya imzosi ochiq kaliti (base64)")
    p_enroll.add_argument("--ca-file", help="Ichki sertifikat markazining PEM fayli")
    p_enroll.add_argument("--allow-http", action="store_true", help="FAQAT SINOV: ichki tarmoqda shifrlanmagan HTTP")
    p_enroll.add_argument("--accept", action="store_true", help="Monitoring shartlari bilan tanishilgan")

    p_run = sub.add_parser("run", help="Agentni ishga tushirish (sukut bo‘yicha)")
    p_run.add_argument("--no-ui", action="store_true", help="Oynasiz rejim (faqat sinov uchun)")
    p_run.add_argument("--allow-http", action="store_true", help="FAQAT SINOV: ichki tarmoqda shifrlanmagan HTTP")

    sub.add_parser("status", help="Ro‘yxatdan o‘tish holatini ko‘rsatish")

    args = parser.parse_args(argv)
    if args.command is None:
        args = parser.parse_args(["run", *(argv or [])])

    home = data_dir()
    setup_logging(home)
    platform = build_platform()
    store = StateStore(home, platform)
    return {"enroll": cmd_enroll, "run": cmd_run, "status": cmd_status}[args.command](args, platform, store)


if __name__ == "__main__":
    sys.exit(main())
