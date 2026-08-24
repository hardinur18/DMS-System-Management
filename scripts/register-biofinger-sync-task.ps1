[CmdletBinding()]
param(
  [string]$ProjectRoot = "",
  [string]$TaskName = "DMS Biofinger Sync",
  [int]$EveryMinutes = 5,
  [switch]$DryRun,
  [switch]$RunNow
)

$ErrorActionPreference = "Stop"

if ($EveryMinutes -lt 1) {
  throw "EveryMinutes minimal 1."
}

if (-not $ProjectRoot) {
  $ProjectRoot = Join-Path $PSScriptRoot ".."
}
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$syncScript = Join-Path $ProjectRoot "scripts\run-biofinger-sync.ps1"
if (-not (Test-Path -LiteralPath $syncScript -PathType Leaf)) {
  throw "Script sync tidak ditemukan: $syncScript"
}

$arguments = @(
  "-NoProfile",
  "-ExecutionPolicy", "Bypass",
  "-File", "`"$syncScript`""
)
if ($DryRun) {
  $arguments += "-DryRun"
}

$action = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument ($arguments -join " ") `
  -WorkingDirectory $ProjectRoot

$trigger = New-ScheduledTaskTrigger `
  -Once `
  -At (Get-Date).AddMinutes(1) `
  -RepetitionInterval (New-TimeSpan -Minutes $EveryMinutes) `
  -RepetitionDuration (New-TimeSpan -Days 3650)

$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -AllowStartIfOnBatteries `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

$principal = New-ScheduledTaskPrincipal `
  -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType Interactive `
  -RunLevel Limited

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Sync Biofinger AT-301 to DMS Supabase staging." `
  -Force | Out-Null

if ($RunNow) {
  Start-ScheduledTask -TaskName $TaskName
}

Write-Host "Task Scheduler registered: $TaskName"
Write-Host "Interval: every $EveryMinutes minute(s)"
Write-Host "Project: $ProjectRoot"
Write-Host "Script: $syncScript"
if ($DryRun) {
  Write-Host "Mode: dry-run"
}
