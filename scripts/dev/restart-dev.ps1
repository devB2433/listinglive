param(
  [int]$BackendPort = 8003,
  [int]$FrontendPort = 3001,
  [int]$WorkerCount = 8,
  [switch]$UseDockerApp,
  [string]$DockerEnvFile = ".env.prod.test",
  [string]$DockerComposeFile = "docker-compose.prod.yml",
  [switch]$DockerBuild
)

$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $root
$runtimeDir = Join-Path $root '.runtime'
$dockerComposeFiles = @($DockerComposeFile)
if ($UseDockerApp) {
  $localOverride = Join-Path $root 'docker-compose.prod.local.yml'
  if (Test-Path $localOverride) {
    $dockerComposeFiles += $localOverride
  }
}

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

function Get-ContainerTimeZone {
  try {
    $windowsId = (Get-TimeZone).Id
    $ianaId = $null
    if ([System.TimeZoneInfo]::TryConvertWindowsIdToIanaId($windowsId, [ref]$ianaId) -and $ianaId) {
      return $ianaId
    }
  } catch {}
  return 'UTC'
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

function Run-DockerCompose([string[]]$ComposeArgs) {
  $prefix = @('--env-file', $DockerEnvFile)
  foreach ($composeFile in $dockerComposeFiles) {
    $prefix += @('-f', $composeFile)
  }
  & docker compose @prefix @ComposeArgs
}

function Ensure-DockerAppConfig {
  $configRoot = Join-Path $root ".tmp/prod-test/config"
  New-Item -ItemType Directory -Force $configRoot | Out-Null
  $aiProviderToml = Join-Path $configRoot "ai_provider.toml"
  if (-not (Test-Path $aiProviderToml)) {
    @'
[video]
provider = "local"
'@ | Set-Content $aiProviderToml -NoNewline
    Write-Host "Created $aiProviderToml with local provider."
  }
}

function Wait-DockerServiceReady([string]$Service, [string[]]$CheckArgs, [int]$TimeoutSeconds = 120) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $composeExecArgs = @('exec', '-T', $Service) + $CheckArgs
      Run-DockerCompose $composeExecArgs 2>$null | Out-Null
      if ($LASTEXITCODE -eq 0) { return }
    } catch {}
    Start-Sleep -Milliseconds 1000
  }
  throw "Timed out waiting for docker service '$Service' to become ready."
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

# Clear Next.js dev build cache to avoid stale/missing server chunks after route switching.
$frontendBuildDir = Join-Path $root 'frontend/.next'
if (Test-Path $frontendBuildDir) {
  Remove-Item $frontendBuildDir -Recurse -Force -ErrorAction SilentlyContinue
}

if ($UseDockerApp) {
  if (-not (Test-Path $DockerEnvFile)) {
    throw "Docker env file not found: $DockerEnvFile"
  }
  if (-not (Test-Path $DockerComposeFile)) {
    throw "Docker compose file not found: $DockerComposeFile"
  }
  Ensure-DockerAppConfig
}

# === Phase 4: Infrastructure ===
$env:CONTAINER_TIMEZONE = Get-ContainerTimeZone
if ($UseDockerApp) {
  if ($DockerBuild) {
    Write-Host "Building app images (frontend/api/worker/beat)..."
    Run-DockerCompose @('build', 'frontend', 'api', 'worker', 'beat')
  }
  Run-DockerCompose @('up', '-d', 'postgres', 'redis') | Out-Null
} else {
  docker-compose up -d postgres redis | Out-Null
}

# === Phase 4.5: Wait for Postgres and run migrations ===
$pgReady = $false
$pgDeadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $pgDeadline) {
  try {
    if ($UseDockerApp) {
      Run-DockerCompose @('exec', '-T', 'postgres', 'pg_isready', '-U', 'listinglive') 2>$null | Out-Null
    } else {
      docker-compose exec -T postgres pg_isready -U listinglive 2>$null | Out-Null
    }
    if ($LASTEXITCODE -eq 0) { $pgReady = $true; break }
  } catch {}
  Start-Sleep -Milliseconds 800
}
if (-not $pgReady) {
  Write-Warning "Postgres did not become ready in time; migrations may fail."
}
$env:PYTHONPATH = $root
Write-Host "Running database migrations (alembic upgrade head)..."
if ($UseDockerApp) {
  Run-DockerCompose @('run', '--rm', 'api', 'alembic', 'upgrade', 'head')
} else {
  & python -m alembic upgrade head
}
if ($LASTEXITCODE -ne 0) {
  Write-Error "Database migration failed. Fix errors and re-run the script."
}

if ($UseDockerApp) {
  Write-Host "Starting full container app stack..."
  Run-DockerCompose @('up', '-d', 'api', 'worker', 'beat', 'frontend', 'reverse-proxy') | Out-Null
  Wait-DockerServiceReady -Service 'api' -CheckArgs @('python', '-c', "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=5)")
  Wait-DockerServiceReady -Service 'frontend' -CheckArgs @('node', '-e', "fetch('http://127.0.0.1:3000').then((r)=>process.exit(r.ok ? 0 : 1)).catch(()=>process.exit(1))")
  Write-Host "Mode: full container"
  Write-Host "Frontend (via reverse proxy): http://localhost:$FrontendPort"
  Write-Host "Use this for regression/production-parity checks."
  return
}

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
