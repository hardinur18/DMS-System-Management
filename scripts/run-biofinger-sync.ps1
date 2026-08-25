[CmdletBinding()]
param(
  [string]$ProjectRoot = "",
  [string]$DeviceHost = "",
  [int]$DevicePort = 0,
  [int]$CommKey = -1,
  [string]$TimezoneOffset = "",
  [string]$DeviceCode = "",
  [string]$ExportDir = "",
  [string]$LogDir = "",
  [string]$PythonPath = "",
  [string]$NodePath = "",
  [ValidateSet("auto", "management", "database")]
  [string]$ImportMode = "auto",
  [int]$ChunkSize = 100,
  [int]$ApiDelayMs = 150,
  [int]$ApiRetries = 7,
  [int]$MaxEvents = 0,
  [int]$SampleLimit = 1,
  [int]$OverlapMinutes = 1440,
  [switch]$FullHistory,
  [switch]$Convert,
  [switch]$DryRun,
  [switch]$NoImport
)

$ErrorActionPreference = "Stop"
$env:ELECTRON_RUN_AS_NODE = $null

function Import-DotEnv {
  param(
    [string]$Path,
    [switch]$Overwrite
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return
  }

  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) {
      return
    }

    if ($line.StartsWith("export ")) {
      $line = $line.Substring(7).Trim()
    }

    $parts = $line -split "=", 2
    if ($parts.Count -ne 2) {
      return
    }

    $name = $parts[0].Trim()
    $value = $parts[1].Trim()
    if (-not $name) {
      return
    }

    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    if ($Overwrite -or -not [Environment]::GetEnvironmentVariable($name, "Process")) {
      [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
  }
}

function Get-EnvOrDefault {
  param(
    [string]$Name,
    [string]$DefaultValue
  )

  $value = [Environment]::GetEnvironmentVariable($Name, "Process")
  if ($value) {
    return $value
  }

  $value = [Environment]::GetEnvironmentVariable($Name, "User")
  if ($value) {
    [Environment]::SetEnvironmentVariable($Name, $value, "Process")
    return $value
  }

  $value = [Environment]::GetEnvironmentVariable($Name, "Machine")
  if ($value) {
    [Environment]::SetEnvironmentVariable($Name, $value, "Process")
    return $value
  }

  return $DefaultValue
}

function Resolve-CommandPath {
  param(
    [string]$ExplicitPath,
    [string[]]$Candidates,
    [string]$Fallback
  )

  if ($ExplicitPath) {
    return $ExplicitPath
  }

  foreach ($candidate in $Candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
      return $candidate
    }
  }

  return $Fallback
}

function Format-CommandLine {
  param(
    [string]$FilePath,
    [string[]]$Arguments
  )

  $parts = @($FilePath) + $Arguments
  return ($parts | ForEach-Object {
    if ($_ -match "\s") {
      '"' + ($_ -replace '"', '\"') + '"'
    } else {
      $_
    }
  }) -join " "
}

function Write-Log {
  param([string]$Message)

  $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  $line = "[$timestamp] $Message"
  Add-Content -LiteralPath $script:LogPath -Value $line
  Write-Host $line
}

function Invoke-LoggedCommand {
  param(
    [string]$Label,
    [string]$FilePath,
    [string[]]$Arguments
  )

  Write-Log "START $Label"
  Write-Log ("CMD " + (Format-CommandLine -FilePath $FilePath -Arguments $Arguments))

  $output = & $FilePath @Arguments 2>&1
  $exitCode = if ($null -eq $LASTEXITCODE) { 0 } else { [int]$LASTEXITCODE }

  foreach ($line in $output) {
    $text = ($line | Out-String).TrimEnd()
    if ($text) {
      Write-Log $text
    }
  }

  if ($exitCode -ne 0) {
    throw "$Label failed with exit code $exitCode."
  }

  Write-Log "DONE $Label"
  return ($output -join [Environment]::NewLine)
}

function Get-MaxEventAtFromJsonl {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return $null
  }

  $maxAt = $null
  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line) {
      return
    }
    try {
      $row = $line | ConvertFrom-Json
      if ($row.device_event_at) {
        $eventAt = [DateTimeOffset]::Parse([string]$row.device_event_at)
        if ($null -eq $maxAt -or $eventAt -gt $maxAt) {
          $maxAt = $eventAt
        }
      }
    } catch {
      return
    }
  }

  return $maxAt
}

try {
  if (-not $ProjectRoot) {
    $ProjectRoot = Join-Path $PSScriptRoot ".."
  }
  $ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
  Set-Location -LiteralPath $ProjectRoot

  Import-DotEnv -Path (Join-Path $ProjectRoot ".env")
  Import-DotEnv -Path (Join-Path $ProjectRoot ".env.local") -Overwrite

  [void](Get-EnvOrDefault -Name "SUPABASE_PROJECT_REF" -DefaultValue "")
  [void](Get-EnvOrDefault -Name "SUPABASE_ACCESS_TOKEN" -DefaultValue "")
  [void](Get-EnvOrDefault -Name "DATABASE_URL" -DefaultValue "")

  if (-not $DeviceHost) { $DeviceHost = Get-EnvOrDefault -Name "BIOFINGER_HOST" -DefaultValue "192.168.1.201" }
  if ($DevicePort -le 0) { $DevicePort = [int](Get-EnvOrDefault -Name "BIOFINGER_PORT" -DefaultValue "4370") }
  if ($CommKey -lt 0) { $CommKey = [int](Get-EnvOrDefault -Name "BIOFINGER_COMM_KEY" -DefaultValue "0") }
  if (-not $TimezoneOffset) { $TimezoneOffset = Get-EnvOrDefault -Name "BIOFINGER_TIMEZONE_OFFSET" -DefaultValue "+07:00" }
  if (-not $DeviceCode) { $DeviceCode = Get-EnvOrDefault -Name "BIOFINGER_DEVICE_CODE" -DefaultValue "BIO-AT301-001" }
  if (-not $ExportDir) { $ExportDir = Get-EnvOrDefault -Name "BIOFINGER_EXPORT_DIR" -DefaultValue "exports" }
  if (-not $LogDir) { $LogDir = Get-EnvOrDefault -Name "BIOFINGER_LOG_DIR" -DefaultValue "logs\biofinger-sync" }
  if (-not $PythonPath) { $PythonPath = Get-EnvOrDefault -Name "BIOFINGER_PYTHON" -DefaultValue "" }
  if (-not $NodePath) { $NodePath = Get-EnvOrDefault -Name "BIOFINGER_NODE" -DefaultValue "" }

  $ExportDir = Join-Path $ProjectRoot $ExportDir
  $LogDir = Join-Path $ProjectRoot $LogDir
  New-Item -ItemType Directory -Path $ExportDir -Force | Out-Null
  New-Item -ItemType Directory -Path $LogDir -Force | Out-Null

  $safeDeviceCode = ($DeviceCode -replace "[^A-Za-z0-9._-]", "-").ToLowerInvariant()
  $startedAt = Get-Date
  $runId = $startedAt.ToString("yyyyMMdd-HHmmss")
  $script:LogPath = Join-Path $LogDir "$safeDeviceCode-$runId.log"
  New-Item -ItemType File -Path $script:LogPath -Force | Out-Null

  $venvPython = Join-Path $ProjectRoot ".local-tools\biofinger-venv\Scripts\python.exe"
  $wingetNode = if ($env:LOCALAPPDATA) {
    Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages\OpenJS.NodeJS.22_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v22.23.1-win-x64\node.exe"
  } else {
    ""
  }

  $PythonPath = Resolve-CommandPath -ExplicitPath $PythonPath -Candidates @() -Fallback "python"
  $NodePath = Resolve-CommandPath -ExplicitPath $NodePath -Candidates @($wingetNode) -Fallback "node"

  $usersOutput = Join-Path $ExportDir "$safeDeviceCode-users-latest.biofinger.jsonl"
  $eventsOutput = Join-Path $ExportDir "$safeDeviceCode-events-latest.biofinger.jsonl"
  $stateDir = Join-Path $ProjectRoot ".local-tools\biofinger-sync"
  $statePath = Join-Path $stateDir "$safeDeviceCode-last-event-at.txt"

  Write-Log "Biofinger sync started."
  Write-Log "ProjectRoot=$ProjectRoot"
  Write-Log "Device=$DeviceCode $DeviceHost`:$DevicePort"
  Write-Log "ExportUsers=$usersOutput"
  Write-Log "ExportEvents=$eventsOutput"

  $sinceAt = $null
  if (-not $FullHistory -and $MaxEvents -le 0 -and (Test-Path -LiteralPath $statePath -PathType Leaf)) {
    $stateValue = (Get-Content -LiteralPath $statePath -Raw).Trim()
    if ($stateValue) {
      try {
        $sinceAt = [DateTimeOffset]::Parse($stateValue).AddMinutes(-1 * [Math]::Max(0, $OverlapMinutes))
        Write-Log "Incremental since=$($sinceAt.ToString('o')) from state=$stateValue overlap=${OverlapMinutes}m"
      } catch {
        Write-Log "State file ignored because timestamp is invalid."
      }
    }
  }

  $syncArgs = @(
    "scripts\biofinger_sync.py",
    "--host", $DeviceHost,
    "--port", [string]$DevicePort,
    "--comm-key", [string]$CommKey,
    "--timezone-offset", $TimezoneOffset,
    "--sample-limit", [string]([Math]::Max(0, $SampleLimit)),
    "--users-output", $usersOutput,
    "--output", $eventsOutput,
    "--json"
  )
  if ($sinceAt) {
    $syncArgs += @("--since", $sinceAt.ToString("o"))
  }
  if ($MaxEvents -gt 0) {
    $syncArgs += @("--max-events", [string]$MaxEvents)
  }

  $syncOutput = Invoke-LoggedCommand -Label "read AT-301" -FilePath $PythonPath -Arguments $syncArgs
  try {
    $syncSummary = $syncOutput | ConvertFrom-Json
    Write-Log "Read summary: users=$($syncSummary.users_count), attendance=$($syncSummary.attendance_count)"
  } catch {
    Write-Log "Read summary: raw output logged."
  }

  if ($NoImport) {
    Write-Log "NoImport enabled. Import step skipped."
    Write-Log "Biofinger sync finished."
    exit 0
  }

  $resolvedImportMode = $ImportMode
  if ($resolvedImportMode -eq "auto") {
    if ($env:SUPABASE_ACCESS_TOKEN -and $env:SUPABASE_PROJECT_REF) {
      $resolvedImportMode = "management"
    } elseif ($env:DATABASE_URL) {
      $resolvedImportMode = "database"
    } else {
      throw "Set SUPABASE_ACCESS_TOKEN + SUPABASE_PROJECT_REF, or set DATABASE_URL."
    }
  }

  $importArgs = @(
    "scripts\import-biofinger-jsonl.mjs",
    "--device-code", $DeviceCode,
    "--users", $usersOutput,
    "--events", $eventsOutput,
    "--chunk-size", [string]$ChunkSize
  )

  if ($DryRun) {
    $importArgs += "--dry-run"
  }
  if ($Convert) {
    $importArgs += "--convert"
  }

  if ($resolvedImportMode -eq "management") {
    if (-not $env:SUPABASE_PROJECT_REF) {
      throw "SUPABASE_PROJECT_REF belum diset."
    }
    if (-not $env:SUPABASE_ACCESS_TOKEN) {
      throw "SUPABASE_ACCESS_TOKEN belum diset."
    }

    $importArgs += @(
      "--management-api",
      "--ref", $env:SUPABASE_PROJECT_REF,
      "--api-delay-ms", [string]$ApiDelayMs,
      "--api-retries", [string]$ApiRetries
    )
  } elseif ($resolvedImportMode -eq "database") {
    if (-not $env:DATABASE_URL) {
      throw "DATABASE_URL belum diset."
    }
  }

  Invoke-LoggedCommand -Label "import Biofinger staging" -FilePath $NodePath -Arguments $importArgs | Out-Null

  if (-not $DryRun -and $MaxEvents -le 0) {
    $maxEventAt = Get-MaxEventAtFromJsonl -Path $eventsOutput
    if ($maxEventAt) {
      New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
      Set-Content -LiteralPath $statePath -Value $maxEventAt.ToString("o") -Encoding UTF8
      Write-Log "State updated: $($maxEventAt.ToString('o'))"
    } else {
      Write-Log "State unchanged: no exported event timestamp."
    }
  }

  Write-Log "Biofinger sync finished."
  exit 0
} catch {
  if ($script:LogPath) {
    Write-Log ("ERROR " + $_.Exception.Message)
  }
  Write-Error $_.Exception.Message
  exit 1
}
