<#
  Windows agentini yig'adi (PyInstaller). Windows kompyuterda, PowerShell'da ishga tushiring:

    .\build.ps1 -ServerUrl "https://nwi.nordic.uz" -ConfigPublicKey "<base64 kalit>"

  ConfigPublicKey serverda shunday olinadi:
    docker compose run --rm api npm run agent:pubkey -w @nwi/api

  Talab: Python 3.12 yoki yangiroq (python.org), "Add python.exe to PATH" belgilangan.
#>
param(
  [Parameter(Mandatory = $true)][string]$ServerUrl,
  [Parameter(Mandatory = $true)][string]$ConfigPublicKey
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Test-Path ".venv")) { python -m venv .venv }
& .\.venv\Scripts\python.exe -m pip install --upgrade pip
& .\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt

# Server manzili va imzo ochiq kaliti dastur ichiga joylanadi.
$config = @"
"""Yig'ish paytida build.ps1 tomonidan yozilgan."""

SERVER_URL = "$ServerUrl"
CONFIG_PUBLIC_KEY = "$ConfigPublicKey"
"@
$original = Get-Content -Raw nwi_agent\build_config.py
try {
  Set-Content -Path nwi_agent\build_config.py -Value $config -Encoding UTF8

  & .\.venv\Scripts\python.exe -m pytest
  if ($LASTEXITCODE -ne 0) { throw "Testlar o'tmadi — yig'ish to'xtatildi." }

  & .\.venv\Scripts\python.exe -m PyInstaller --noconfirm --clean --windowed `
    --name NordicWorkIntelligence `
    --collect-data tzdata `
    --hidden-import pystray._win32 `
    nwi_agent\__main__.py
  if ($LASTEXITCODE -ne 0) { throw "PyInstaller xatolik bilan tugadi." }
}
finally {
  Set-Content -Path nwi_agent\build_config.py -Value $original -Encoding UTF8 -NoNewline
}

Write-Host ""
Write-Host "Tayyor: dist\NordicWorkIntelligence\NordicWorkIntelligence.exe"
Write-Host "Avtomatik ishga tushirish uchun: .\install-task.ps1"
