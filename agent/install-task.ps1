<#
  Agentni joriy foydalanuvchi tizimga kirganda avtomatik ishga tushadigan qilib sozlaydi
  (Windows Task Scheduler). Vazifa yashirin emas: "Task Scheduler"da o'z nomi bilan ko'rinadi.

    .\install-task.ps1              # o'rnatish
    .\install-task.ps1 -Remove      # olib tashlash
#>
param([switch]$Remove)
$ErrorActionPreference = "Stop"
$taskName = "Nordic Work Intelligence Agent"

if ($Remove) {
  Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Vazifa olib tashlandi."
  exit 0
}

$exe = Join-Path $PSScriptRoot "dist\NordicWorkIntelligence\NordicWorkIntelligence.exe"
if (-not (Test-Path $exe)) { throw "Avval .\build.ps1 ni ishga tushiring: $exe topilmadi." }

$action = New-ScheduledTaskAction -Execute $exe
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
  -Description "Ish vaqtidagi faoliyat statistikasi (Nordic International University)" -Force | Out-Null

Start-ScheduledTask -TaskName $taskName
Write-Host "O'rnatildi va ishga tushirildi: $taskName"
