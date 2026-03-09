param(
  [int]$BackendPort = 8003,
  [int]$FrontendPort = 3001
)

$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$runtimeDir = Join-Path $root '.runtime'

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

function Kill-ByPidFile([string]$PidFile) {
  if (-not (Test-Path $PidFile)) { return }
  $storedPid = (Get-Content $PidFile -Raw -ErrorAction SilentlyContinue).Trim()
  if ($storedPid -and $storedPid -match '^\d+$') {
    $ErrorActionPreference = 'SilentlyContinue'
    & taskkill /PID $storedPid /F /T 2>$null
    $ErrorActionPreference = 'Stop'
  }
  Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
}

function Stop-PortProcess([int]$Port) {
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($conns) {
    $procIds = $conns | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $procIds) {
      if ($procId -and $procId -ne 0) {
        & taskkill /PID $procId /F /T 2>$null
      }
    }
  }
}

# === Step 1: Kill by PID files (precise) ===
if (Test-Path $runtimeDir) {
  Get-ChildItem $runtimeDir -Filter '*.pid' | ForEach-Object { Kill-ByPidFile $_.FullName }
}

# === Step 2: Kill by port (fallback) ===
Stop-PortProcess -Port $BackendPort
Stop-PortProcess -Port $FrontendPort

# === Step 3: Kill by command-line pattern (fallback) ===
$projectProcs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  ($_.CommandLine -match 'backend\.main:app' -and $_.CommandLine -match 'listinglive') -or
  ($_.CommandLine -match 'celery' -and $_.CommandLine -match 'backend\.tasks\.celery_app') -or
  ($_.CommandLine -match 'next dev' -and $_.CommandLine -match 'listinglive[\\/]frontend')
}
foreach ($proc in $projectProcs) {
  & taskkill /PID $proc.ProcessId /F /T 2>$null
}

# === Step 4: Wait briefly for ports to release ===
$deadline = (Get-Date).AddSeconds(15)
while ((Get-Date) -lt $deadline) {
  $b = Get-NetTCPConnection -LocalPort $BackendPort -State Listen -ErrorAction SilentlyContinue
  $f = Get-NetTCPConnection -LocalPort $FrontendPort -State Listen -ErrorAction SilentlyContinue
  if (-not $b -and -not $f) { break }
  Start-Sleep -Milliseconds 500
}

Write-Host "Stopped frontend/backend/worker for ListingLive"
