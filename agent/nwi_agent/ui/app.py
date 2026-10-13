"""Agentning ko'rinadigan qismi: tray belgisi, holat oynasi va ekran tasviri indikatori.

tkinter asosiy oqimda ishlaydi; tray va agent oqimlaridan keladigan amallar navbat orqali uzatiladi.
"""

from __future__ import annotations

import queue
import threading
import tkinter as tk
from tkinter import messagebox, scrolledtext, ttk

import pystray
from PIL import Image, ImageDraw

from ..core.runner import Agent
from . import texts

BRAND = "#087268"
ALERT = "#b42318"


def _icon(color: str) -> Image.Image:
    image = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.ellipse((4, 4, 60, 60), fill=color)
    draw.rectangle((20, 20, 28, 44), fill="white")
    draw.polygon([(28, 20), (36, 20), (44, 44), (36, 44)], fill="white")
    draw.rectangle((36, 20, 44, 44), fill="white")
    return image


class Indicator:
    """Ekran tasvirlari yoqilganida ekranning yuqori o'ng burchagida doim ko'rinib turadigan belgi."""

    IDLE_TEXT = "●  Ekran tasviri yoqilgan"
    FLASH_TEXT = "●  Ekran tasviri olindi"

    def __init__(self, root: tk.Tk):
        self.window = tk.Toplevel(root)
        self.window.withdraw()
        self.window.overrideredirect(True)
        self.window.attributes("-topmost", True)
        self.label = tk.Label(self.window, text=self.IDLE_TEXT, fg="white", bg=ALERT, font=("Segoe UI", 10, "bold"), padx=12, pady=5)
        self.label.pack()
        self.visible = False
        self._flash_job: str | None = None

    def set_visible(self, visible: bool) -> None:
        if visible == self.visible:
            return
        self.visible = visible
        if not visible:
            self.window.withdraw()
            return
        self.window.update_idletasks()
        x = self.window.winfo_screenwidth() - self.window.winfo_reqwidth() - 16
        self.window.geometry(f"+{x}+12")
        self.window.deiconify()
        self.window.lift()

    def flash(self) -> None:
        self.set_visible(True)
        self.label.config(text=self.FLASH_TEXT, bg="#000000")
        if self._flash_job:
            self.window.after_cancel(self._flash_job)
        self._flash_job = self.window.after(4000, lambda: self.label.config(text=self.IDLE_TEXT, bg=ALERT))


class AgentUI:
    def __init__(self, agent: Agent, stop: threading.Event):
        self.agent = agent
        self.stop = stop
        self.tasks: queue.Queue = queue.Queue()
        self.root = tk.Tk()
        self.root.withdraw()
        self.root.title(texts.APP_NAME)
        self.indicator = Indicator(self.root)
        self.status_window: tk.Toplevel | None = None
        self.status_text: tk.Text | None = None
        agent.on_capture = lambda: self.tasks.put(self.indicator.flash)
        self.tray = pystray.Icon(
            "nordic-work-intelligence",
            _icon(BRAND),
            texts.APP_NAME,
            pystray.Menu(
                pystray.MenuItem("Holat va yig‘iladigan ma’lumotlar", lambda: self.tasks.put(self.show_status), default=True),
            ),
        )

    def show_status(self) -> None:
        if self.status_window is None or not self.status_window.winfo_exists():
            self.status_window = tk.Toplevel(self.root)
            self.status_window.title(texts.APP_NAME)
            self.status_window.geometry("640x560")
            self.status_text = scrolledtext.ScrolledText(self.status_window, wrap="word", font=("Segoe UI", 10), padx=12, pady=12)
            self.status_text.pack(fill="both", expand=True)
        self._render_status()
        self.status_window.deiconify()
        self.status_window.lift()

    def _render_status(self) -> None:
        if self.status_text is None or self.status_window is None or not self.status_window.winfo_exists():
            return
        body = "\n\n".join(
            [
                "HOLAT\n" + texts.status_summary(self.agent.status),
                "AMALDAGI SIYOSAT\n" + texts.policy_summary(self.agent.config),
                texts.NOTICE,
            ]
        )
        self.status_text.config(state="normal")
        self.status_text.delete("1.0", "end")
        self.status_text.insert("1.0", body)
        self.status_text.config(state="disabled")

    def _tick(self) -> None:
        while True:
            try:
                self.tasks.get_nowait()()
            except queue.Empty:
                break
        if self.stop.is_set():
            self.tray.stop()
            self.root.quit()
            return
        status = self.agent.status
        self.indicator.set_visible(status.collecting and status.screenshots_enabled)
        self.tray.title = texts.tooltip(status)
        self.tray.icon = _icon(ALERT if status.collecting and status.screenshots_enabled else BRAND)
        self._render_status()
        self.root.after(1000, self._tick)

    def run(self) -> None:
        self.tray.run_detached()
        self.root.after(300, self._tick)
        self.root.mainloop()


def enroll_dialog(default_server: str) -> tuple[str, str] | None:
    """Ro'yxatdan o'tish oynasi. Xodim shartlar bilan tanishganini belgilamaguncha davom etib bo'lmaydi."""
    result: list[tuple[str, str]] = []
    root = tk.Tk()
    root.title(f"{texts.APP_NAME} — ro‘yxatdan o‘tish")
    root.geometry("680x640")

    notice = scrolledtext.ScrolledText(root, wrap="word", font=("Segoe UI", 10), height=18, padx=10, pady=10)
    notice.insert("1.0", texts.NOTICE)
    notice.config(state="disabled")
    notice.pack(fill="both", expand=True, padx=12, pady=(12, 6))

    form = ttk.Frame(root)
    form.pack(fill="x", padx=12, pady=6)
    ttk.Label(form, text="Server manzili:").grid(row=0, column=0, sticky="w", pady=3)
    server = ttk.Entry(form, width=52)
    server.insert(0, default_server)
    server.grid(row=0, column=1, sticky="we", padx=8)
    ttk.Label(form, text="Ro‘yxatdan o‘tish kodi:").grid(row=1, column=0, sticky="w", pady=3)
    code = ttk.Entry(form, width=52)
    code.grid(row=1, column=1, sticky="we", padx=8)
    form.columnconfigure(1, weight=1)

    agreed = tk.BooleanVar(value=False)
    button = ttk.Button(root, text="Ro‘yxatdan o‘tish", state="disabled")
    ttk.Checkbutton(
        root,
        text=texts.CONSENT_LABEL,
        variable=agreed,
        command=lambda: button.config(state="normal" if agreed.get() else "disabled"),
    ).pack(anchor="w", padx=12, pady=6)

    def submit() -> None:
        if not server.get().strip() or not code.get().strip():
            messagebox.showerror(texts.APP_NAME, "Server manzili va kodni kiriting.")
            return
        result.append((server.get().strip(), code.get().strip()))
        root.destroy()

    button.config(command=submit)
    button.pack(anchor="e", padx=12, pady=(0, 12))
    root.mainloop()
    return result[0] if result else None


def show_error(message: str) -> None:
    root = tk.Tk()
    root.withdraw()
    messagebox.showerror(texts.APP_NAME, message)
    root.destroy()
