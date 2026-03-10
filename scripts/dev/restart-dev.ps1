param(
  [int]$BackendPort = 8003,
  [int]$FrontendPort = 3001,
  [int]$WorkerCount = 8
)

$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $root
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

function Kill-PortListeners([int]$Port) {
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $conns) { return }
  $procIds = $conns | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($procId in $procIds) {
    if ($procId -and $procId -ne 0) {
      $ErrorActionPreference = 'SilentlyContinue'
      & taskkill /PID $procId /F /T 2>$null
      $ErrorActionPreference = 'Stop'
    }
  }
}

function Kill-ProjectProcesses {
  $patterns = @(
    @{ Cmd = 'backend\.main:app'; Ctx = 'listinglive' },
    @{ Cmd = 'celery';            Ctx = 'backend\.tasks\.celery_app' },
    @{ Cmd = 'next dev';          Ctx = 'listinglive' }
  )
  $procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
  foreach ($p in $procs) {
    $cl = $p.CommandLine
    if (-not $cl) { continue }
    foreach ($pat in $patterns) {
      if ($cl -match $pat.Cmd -and $cl -match $pat.Ctx) {
        $ErrorActionPreference = 'SilentlyContinue'
        & taskkill /PID $p.ProcessId /F /T 2>$null
        $ErrorActionPreference = 'Stop'
        break
      }
    }
  }
}

function Wait-PortFree([int]$Port, [int]$TimeoutSeconds = 15) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  $attempt = 0
  while ((Get-Date) -lt $deadline) {
    $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $conns) { return $true }
    $attempt++
    if ($attempt % 6 -eq 0) {
      $ErrorActionPreference = 'SilentlyContinue'
      Kill-PortListeners -Port $Port
      $ErrorActionPreference = 'Stop'
    }
    Start-Sleep -Milliseconds 500
  }
  return $false
}

function Reset-LogFile([string]$Path) {
  if (Test-Path $Path) {
    try { Remove-Item $Path -Force -ErrorAction Stop } catch {
      Start-Sleep -Milliseconds 800
      try { Remove-Item $Path -Force -ErrorAction Stop } catch {}
    }
  }
}

function Wait-HttpReady([string]$Url, [int]$TimeoutSeconds = 90) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
      if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { return }
    } catch {}
    Start-Sleep -Milliseconds 800
  }
  throw "Timed out waiting for $Url"
}

function Save-Pid([System.Diagnostics.Process]$Proc, [string]$Name) {
  if ($Proc -and $Proc.Id) {
    $Proc.Id | Set-Content (Join-Path $runtimeDir "$Name.pid") -NoNewline
  }
}

# === Phase 1: Kill previous processes (PID files first, then fallback) ===
if (Test-Path $runtimeDir) {
  Get-ChildItem $runtimeDir -Filter '*.pid' | ForEach-Object { Kill-ByPidFile $_.FullName }
}
Kill-PortListeners -Port $BackendPort
Kill-PortListeners -Port $FrontendPort
Kill-ProjectProcesses

# === Phase 2: Wait for ports to be free ===
$null = Wait-PortFree -Port $BackendPort
$null = Wait-PortFree -Port $FrontendPort

# === Phase 3: Ensure config files ===
if (-not (Test-Path '.env')) { Copy-Item '.env.example' '.env' }
if (-not (Test-Path 'config/ai_provider.toml') -and (Test-Path 'config/ai_provider.toml.example')) {
  Copy-Item 'config/ai_provider.toml.example' 'config/ai_provider.toml'
  Write-Host 'Created config/ai_provider.toml from example. Please fill in video.api_key and video.model_id before testing remote generation.'
}
if (-not (Test-Path 'frontend/.env.local')) {
  'NEXT_PUBLIC_API_URL=http://localhost:8003' | Set-Content 'frontend/.env.local'
}

# === Phase 4: Infrastructure ===
docker-compose up -d postgres redis | Out-Null

# === Phase 5: Reset log files ===
New-Item -ItemType Directory -Force $runtimeDir | Out-Null

$backendOut = Join-Path $runtimeDir 'backend.out.log'
$backendErr = Join-Path $runtimeDir 'backend.err.log'
$frontendOut = Join-Path $runtimeDir 'frontend.out.log'
$frontendErr = Join-Path $runtimeDir 'frontend.err.log'

Reset-LogFile $backendOut
Reset-LogFile $backendErr
Get-ChildItem $runtimeDir -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'worker*.log' } | ForEach-Object {
  Reset-LogFile $_.FullName
}
Reset-LogFile $frontendOut
Reset-LogFile $frontendErr

# === Phase 6: Start services ===
$env:PYTHONPATH = $root

$backendProc = Start-Process python -ArgumentList '-m','uvicorn','backend.main:app','--host','127.0.0.1','--port',$BackendPort,'--reload','--reload-dir','backend' -WorkingDirectory $root -RedirectStandardOutput $backendOut -RedirectStandardError $backendErr -PassThru
Save-Pid $backendProc 'backend'

for ($i = 1; $i -le $WorkerCount; $i++) {
  $wOut = if ($i -eq 1) { Join-Path $runtimeDir 'worker.out.log' } else { Join-Path $runtimeDir "worker-$i.out.log" }
  $wErr = if ($i -eq 1) { Join-Path $runtimeDir 'worker.err.log' } else { Join-Path $runtimeDir "worker-$i.err.log" }
  $wName = if ($i -eq 1) { 'worker' } else { "worker-$i" }
  $wProc = Start-Process python -ArgumentList '-m','celery','-A','backend.tasks.celery_app','worker','-l','info','-P','solo','-Q','celery,video-standard,video-flex','-n',"listinglive-worker-$i@%h" -WorkingDirectory $root -RedirectStandardOutput $wOut -RedirectStandardError $wErr -PassThru
  Save-Pid $wProc $wName
}

$beatOut = Join-Path $runtimeDir 'beat.out.log'
$beatErr = Join-Path $runtimeDir 'beat.err.log'
Reset-LogFile $beatOut
Reset-LogFile $beatErr
$beatProc = Start-Process python -ArgumentList '-m','celery','-A','backend.tasks.celery_app','beat','-l','info' -WorkingDirectory $root -RedirectStandardOutput $beatOut -RedirectStandardError $beatErr -PassThru
Save-Pid $beatProc 'beat'

$frontendProc = Start-Process npm.cmd -ArgumentList 'run','dev:fixed' -WorkingDirectory (Join-Path $root 'frontend') -RedirectStandardOutput $frontendOut -RedirectStandardError $frontendErr -PassThru
Save-Pid $frontendProc 'frontend'

# === Phase 7: Wait for ready ===
Wait-HttpReady "http://127.0.0.1:$BackendPort/health"
Wait-HttpReady "http://localhost:$FrontendPort"

Write-Host "Backend: http://127.0.0.1:$BackendPort (auto-reload enabled)"
Write-Host "Workers: $WorkerCount x celery worker | Beat: celery beat"
Write-Host "Frontend: http://localhost:$FrontendPort"
Write-Host "Logs: $runtimeDir"
