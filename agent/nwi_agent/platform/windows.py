"""Windows'ga xos amallar (ctypes orqali Win32 API). Faqat Windows'da import qilinadi.

Bu modul klaviatura yoki sichqoncha hodisalarini tinglamaydi, oyna sarlavhalarini,
clipboard yoki fayllarni o'qimaydi. Ishlatiladigan chaqiruvlar:
  GetForegroundWindow + QueryFullProcessImageNameW — oldingi plandagi dastur fayl nomi;
  GetLastInputInfo — oxirgi kiritishdan beri o'tgan vaqt;
  OpenInputDesktop — ekran qulflanganini aniqlash;
  CryptProtectData / CryptUnprotectData — token va navbatdagi fayllarni himoyalash (DPAPI).
"""

from __future__ import annotations

import ctypes
import io
import os
import platform as py_platform
import socket
import winreg
from ctypes import wintypes as wt

user32 = ctypes.WinDLL("user32", use_last_error=True)
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
crypt32 = ctypes.WinDLL("crypt32", use_last_error=True)

PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
DESKTOP_SWITCHDESKTOP = 0x0100
CRYPTPROTECT_UI_FORBIDDEN = 0x1
ERROR_ALREADY_EXISTS = 183
LOCK_SCREEN_PROCESSES = {"lockapp.exe", "logonui.exe"}
MAX_SCREENSHOT_WIDTH = 1920
JPEG_QUALITY = 60


class LASTINPUTINFO(ctypes.Structure):
    _fields_ = [("cbSize", wt.UINT), ("dwTime", wt.DWORD)]


class DATA_BLOB(ctypes.Structure):
    _fields_ = [("cbData", wt.DWORD), ("pbData", ctypes.POINTER(ctypes.c_byte))]


user32.GetForegroundWindow.restype = wt.HWND
user32.GetWindowThreadProcessId.argtypes = [wt.HWND, ctypes.POINTER(wt.DWORD)]
user32.GetWindowThreadProcessId.restype = wt.DWORD
user32.GetLastInputInfo.argtypes = [ctypes.POINTER(LASTINPUTINFO)]
user32.GetLastInputInfo.restype = wt.BOOL
user32.OpenInputDesktop.argtypes = [wt.DWORD, wt.BOOL, wt.DWORD]
user32.OpenInputDesktop.restype = wt.HANDLE
user32.CloseDesktop.argtypes = [wt.HANDLE]
kernel32.GetTickCount.restype = wt.DWORD
kernel32.OpenProcess.argtypes = [wt.DWORD, wt.BOOL, wt.DWORD]
kernel32.OpenProcess.restype = wt.HANDLE
kernel32.QueryFullProcessImageNameW.argtypes = [wt.HANDLE, wt.DWORD, wt.LPWSTR, ctypes.POINTER(wt.DWORD)]
kernel32.QueryFullProcessImageNameW.restype = wt.BOOL
kernel32.CloseHandle.argtypes = [wt.HANDLE]
kernel32.LocalFree.argtypes = [ctypes.c_void_p]
kernel32.LocalFree.restype = ctypes.c_void_p
kernel32.CreateMutexW.argtypes = [ctypes.c_void_p, wt.BOOL, wt.LPCWSTR]
kernel32.CreateMutexW.restype = wt.HANDLE
_BLOB_ARGS = [
    ctypes.POINTER(DATA_BLOB),
    ctypes.c_void_p,
    ctypes.c_void_p,
    ctypes.c_void_p,
    ctypes.c_void_p,
    wt.DWORD,
    ctypes.POINTER(DATA_BLOB),
]
crypt32.CryptProtectData.argtypes = _BLOB_ARGS
crypt32.CryptProtectData.restype = wt.BOOL
crypt32.CryptUnprotectData.argtypes = _BLOB_ARGS
crypt32.CryptUnprotectData.restype = wt.BOOL

_mutex_handle = None


def acquire_single_instance(name: str = "Local\\NordicWorkIntelligenceAgent") -> bool:
    """Bir foydalanuvchi sessiyasida faqat bitta agent ishlashini ta'minlaydi."""
    global _mutex_handle
    _mutex_handle = kernel32.CreateMutexW(None, False, name)
    return bool(_mutex_handle) and ctypes.get_last_error() != ERROR_ALREADY_EXISTS


def enable_dpi_awareness() -> None:
    """Ekran tasviri to'liq o'lchamda olinishi uchun (masshtablangan ekranlarda)."""
    try:
        ctypes.WinDLL("shcore").SetProcessDpiAwareness(2)
    except (OSError, AttributeError):
        pass


def _dpapi(function, data: bytes) -> bytes:
    buffer = ctypes.create_string_buffer(data, len(data))
    blob_in = DATA_BLOB(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte)))
    blob_out = DATA_BLOB()
    if not function(ctypes.byref(blob_in), None, None, None, None, CRYPTPROTECT_UI_FORBIDDEN, ctypes.byref(blob_out)):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        return ctypes.string_at(blob_out.pbData, blob_out.cbData)
    finally:
        kernel32.LocalFree(blob_out.pbData)


class WindowsPlatform:
    def foreground_process(self) -> str | None:
        hwnd = user32.GetForegroundWindow()
        if not hwnd:
            return None
        pid = wt.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
        if not pid.value:
            return None
        handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid.value)
        if not handle:
            return None
        try:
            buffer = ctypes.create_unicode_buffer(32768)
            size = wt.DWORD(len(buffer))
            if not kernel32.QueryFullProcessImageNameW(handle, 0, buffer, ctypes.byref(size)):
                return None
            # Faqat fayl nomi: to'liq yo'lda foydalanuvchi nomi bo'lishi mumkin.
            return os.path.basename(buffer.value).lower() or None
        finally:
            kernel32.CloseHandle(handle)

    def idle_seconds(self) -> float:
        info = LASTINPUTINFO()
        info.cbSize = ctypes.sizeof(LASTINPUTINFO)
        if not user32.GetLastInputInfo(ctypes.byref(info)):
            return 0.0
        # GetTickCount 49,7 kunda nolga qaytadi; ayirma 32 bitda hisoblanadi.
        return ((kernel32.GetTickCount() - info.dwTime) & 0xFFFFFFFF) / 1000.0

    def is_locked(self) -> bool:
        desktop = user32.OpenInputDesktop(0, False, DESKTOP_SWITCHDESKTOP)
        if not desktop:
            # Kirish ish stoliga yetib bo'lmadi: ekran qulflangan yoki UAC oynasi ochiq.
            return True
        user32.CloseDesktop(desktop)
        return self.foreground_process() in LOCK_SCREEN_PROCESSES

    def capture_screen(self) -> bytes | None:
        from PIL import ImageGrab

        try:
            image = ImageGrab.grab(all_screens=True)
        except OSError:
            return None
        if image.width > MAX_SCREENSHOT_WIDTH:
            height = round(image.height * MAX_SCREENSHOT_WIDTH / image.width)
            image = image.resize((MAX_SCREENSHOT_WIDTH, height))
        out = io.BytesIO()
        image.convert("RGB").save(out, format="JPEG", quality=JPEG_QUALITY, optimize=True)
        return out.getvalue()

    def protect(self, data: bytes) -> bytes:
        return _dpapi(crypt32.CryptProtectData, data)

    def unprotect(self, data: bytes) -> bytes:
        return _dpapi(crypt32.CryptUnprotectData, data)

    def machine_id(self) -> str:
        with winreg.OpenKey(
            winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Cryptography", 0, winreg.KEY_READ | winreg.KEY_WOW64_64KEY
        ) as key:
            return str(winreg.QueryValueEx(key, "MachineGuid")[0])

    def hostname(self) -> str:
        return socket.gethostname()

    def os_version(self) -> str:
        return f"Windows {py_platform.release()} ({py_platform.version()})"
