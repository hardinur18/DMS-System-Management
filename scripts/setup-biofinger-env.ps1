[CmdletBinding()]
param(
  [string]$ProjectRoot = "",
  [switch]$Force
)

$ErrorActionPreference = "Stop"

function Read-Value {
  param(
    [string]$Label,
    [string]$DefaultValue = "",
    [switch]$Required
  )

  $suffix = if ($DefaultValue) { " [$DefaultValue]" } else { "" }
  while ($true) {
    $value = Read-Host "$Label$suffix"
    if (-not $value -and $DefaultValue) {
      return $DefaultValue
    }
    if ($value -or -not $Required) {
      return $value
    }
    Write-Host "Wajib diisi." -ForegroundColor Yellow
  }
}

function Read-SecretValue {
  param(
    [string]$Label,
    [bool]$HasExisting
  )

  $suffix = if ($HasExisting) { " [ENTER untuk keep existing]" } else { "" }
  while ($true) {
    $secure = Read-Host "$Label$suffix" -AsSecureString
    $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    try {
      $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }

    if ($value) {
      return $value
    }
    if ($HasExisting) {
      return $null
    }
    Write-Host "Wajib diisi." -ForegroundColor Yellow
  }
}

function Read-DotEnv {
  param([string]$Path)

  $values = [ordered]@{}
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return $values
  }

  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#") -or $line -notmatch "=") {
      return
    }

    $parts = $line -split "=", 2
    $name = $parts[0].Trim()
    $value = $parts[1].Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    if ($name) {
      $values[$name] = $value
    }
  }

  return $values
}

function Escape-DotEnvValue {
  param([string]$Value)

  if ($null -eq $Value) {
    return ""
  }
  if ($Value -match "\s|#|'|`"") {
    return '"' + ($Value -replace '\\', '\\' -replace '"', '\"') + '"'
  }
  return $Value
}

function Get-ExistingValue {
  param(
    [System.Collections.IDictionary]$Values,
    [string]$Key,
    [string]$DefaultValue = ""
  )

  if ($Values.Contains($Key) -and $Values[$Key]) {
    return [string]$Values[$Key]
  }
  return $DefaultValue
}

if (-not $ProjectRoot) {
  $ProjectRoot = Join-Path $PSScriptRoot ".."
}
$ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$envPath = Join-Path $ProjectRoot ".env.local"
$values = Read-DotEnv -Path $envPath

Write-Host "Setup Biofinger env lokal DMS" -ForegroundColor Cyan
Write-Host "File: $envPath"
Write-Host "Nilai rahasia akan ditulis ke .env.local yang sudah di-ignore git."

$values["SUPABASE_PROJECT_REF"] = Read-Value -Label "SUPABASE_PROJECT_REF" -DefaultValue (Get-ExistingValue -Values $values -Key "SUPABASE_PROJECT_REF") -Required

$existingToken = [bool]($values["SUPABASE_ACCESS_TOKEN"])
$token = Read-SecretValue -Label "SUPABASE_ACCESS_TOKEN" -HasExisting $existingToken
if ($null -ne $token) {
  $values["SUPABASE_ACCESS_TOKEN"] = $token
}

$values["BIOFINGER_HOST"] = Read-Value -Label "BIOFINGER_HOST" -DefaultValue (Get-ExistingValue -Values $values -Key "BIOFINGER_HOST" -DefaultValue "192.168.1.201") -Required
$values["BIOFINGER_PORT"] = Read-Value -Label "BIOFINGER_PORT" -DefaultValue (Get-ExistingValue -Values $values -Key "BIOFINGER_PORT" -DefaultValue "4370") -Required
$values["BIOFINGER_COMM_KEY"] = Read-Value -Label "BIOFINGER_COMM_KEY" -DefaultValue (Get-ExistingValue -Values $values -Key "BIOFINGER_COMM_KEY" -DefaultValue "0") -Required
$values["BIOFINGER_TIMEZONE_OFFSET"] = Read-Value -Label "BIOFINGER_TIMEZONE_OFFSET" -DefaultValue (Get-ExistingValue -Values $values -Key "BIOFINGER_TIMEZONE_OFFSET" -DefaultValue "+07:00") -Required
$values["BIOFINGER_DEVICE_CODE"] = Read-Value -Label "BIOFINGER_DEVICE_CODE" -DefaultValue (Get-ExistingValue -Values $values -Key "BIOFINGER_DEVICE_CODE" -DefaultValue "BIO-AT301-001") -Required
$values["BIOFINGER_EXPORT_DIR"] = Read-Value -Label "BIOFINGER_EXPORT_DIR" -DefaultValue (Get-ExistingValue -Values $values -Key "BIOFINGER_EXPORT_DIR" -DefaultValue "exports") -Required
$values["BIOFINGER_LOG_DIR"] = Read-Value -Label "BIOFINGER_LOG_DIR" -DefaultValue (Get-ExistingValue -Values $values -Key "BIOFINGER_LOG_DIR" -DefaultValue "logs/biofinger-sync") -Required
$values["BIOFINGER_CONVERT_ON_IMPORT"] = Get-ExistingValue -Values $values -Key "BIOFINGER_CONVERT_ON_IMPORT" -DefaultValue "false"
$values["BIOFINGER_CONVERSION_BATCH_SIZE"] = Get-ExistingValue -Values $values -Key "BIOFINGER_CONVERSION_BATCH_SIZE" -DefaultValue "1000"

if (-not $Force -and (Test-Path -LiteralPath $envPath -PathType Leaf)) {
  Copy-Item -LiteralPath $envPath -Destination "$envPath.bak" -Force
}

$orderedKeys = @(
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "VITE_USE_APP_USERS_FUNCTION",
  "SUPABASE_PROJECT_REF",
  "SUPABASE_ACCESS_TOKEN",
  "DATABASE_URL",
  "BIOFINGER_HOST",
  "BIOFINGER_PORT",
  "BIOFINGER_COMM_KEY",
  "BIOFINGER_TIMEZONE_OFFSET",
  "BIOFINGER_DEVICE_CODE",
  "BIOFINGER_EXPORT_DIR",
  "BIOFINGER_LOG_DIR",
  "BIOFINGER_PYTHON",
  "BIOFINGER_NODE",
  "BIOFINGER_CONVERT_ON_IMPORT",
  "BIOFINGER_CONVERSION_BATCH_SIZE"
)

$lines = New-Object System.Collections.Generic.List[string]
$written = @{}
foreach ($key in $orderedKeys) {
  if ($values.Contains($key)) {
    $lines.Add("$key=$(Escape-DotEnvValue -Value $values[$key])")
    $written[$key] = $true
  }
}

foreach ($key in $values.Keys) {
  if (-not $written.ContainsKey($key)) {
    $lines.Add("$key=$(Escape-DotEnvValue -Value $values[$key])")
  }
}

Set-Content -LiteralPath $envPath -Value $lines -Encoding UTF8

Write-Host ".env.local updated." -ForegroundColor Green
Write-Host "Next test:"
Write-Host "powershell -ExecutionPolicy Bypass -File scripts\run-biofinger-sync.ps1 -DryRun -MaxEvents 20"
