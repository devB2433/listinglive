param(
  [int]$BackendPort = 8003,
  [int]$FrontendPort = 3001
)

$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $root

function Stop-PortProcess([int]$Port) {
  $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($conns) {
    $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($procId in $pids) {
      if ($procId -and $procId -ne 0) {
        try { Stop-Process -Id $procId -Force -ErrorAction Stop } catch {}
      }
    }
  }
}

function Reset-LogFile([string]$Path) {
  if (Test-Path $Path) {
    try {
      Remove-Item $Path -Force -ErrorAction Stop
    } catch {
      Start-Sleep -Milliseconds 800
      try { Remove-Item $Path -Force -ErrorAction Stop } catch {}
    }
  }
}

function Wait-HttpReady([string]$Url, [int]$TimeoutSeconds = 60) {
  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return
      }
    } catch {}
    Start-Sleep -Milliseconds 800
  }
  throw "Timed out waiting for $Url"
}

Stop-PortProcess -Port $BackendPort
Stop-PortProcess -Port $FrontendPort

$projectProcs = Get-CimInstance Win32_Process | Where-Object {
  ($_.CommandLine -match 'backend.main:app' -and $_.CommandLine -match 'listinglive') -or
  ($_.CommandLine -match 'celery' -and $_.CommandLine -match 'backend.tasks.celery_app') -or
  ($_.CommandLine -match 'next dev' -and $_.CommandLine -match 'listinglive\\frontend')
}
foreach ($proc in $projectProcs) {
  try { Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop } catch {}
}

Start-Sleep -Seconds 2

if (-not (Test-Path '.env')) {
  Copy-Item '.env.example' '.env'
}
if (-not (Test-Path 'frontend/.env.local')) {
  'NEXT_PUBLIC_API_URL=http://localhost:8003' | Set-Content 'frontend/.env.local'
}

docker-compose up -d postgres redis | Out-Null

$runtimeDir = Join-Path $root '.runtime'
New-Item -ItemType Directory -Force $runtimeDir | Out-Null

$backendOut = Join-Path $runtimeDir 'backend.out.log'
$backendErr = Join-Path $runtimeDir 'backend.err.log'
$workerOut = Join-Path $runtimeDir 'worker.out.log'
$workerErr = Join-Path $runtimeDir 'worker.err.log'
$frontendOut = Join-Path $runtimeDir 'frontend.out.log'
$frontendErr = Join-Path $runtimeDir 'frontend.err.log'

Reset-LogFile $backendOut
Reset-LogFile $backendErr
Reset-LogFile $workerOut
Reset-LogFile $workerErr
Reset-LogFile $frontendOut
Reset-LogFile $frontendErr

$env:PYTHONPATH = $root
Start-Process python -ArgumentList '-m','uvicorn','backend.main:app','--host','127.0.0.1','--port',$BackendPort -WorkingDirectory $root -RedirectStandardOutput $backendOut -RedirectStandardError $backendErr | Out-Null
Start-Process python -ArgumentList '-m','celery','-A','backend.tasks.celery_app','worker','-l','info','-P','solo' -WorkingDirectory $root -RedirectStandardOutput $workerOut -RedirectStandardError $workerErr | Out-Null
Start-Process npm.cmd -ArgumentList 'run','dev:fixed' -WorkingDirectory (Join-Path $root 'frontend') -RedirectStandardOutput $frontendOut -RedirectStandardError $frontendErr | Out-Null

Wait-HttpReady "http://127.0.0.1:$BackendPort/health"
Wait-HttpReady "http://localhost:$FrontendPort"
Start-Sleep -Seconds 2

Write-Host "Backend: http://127.0.0.1:$BackendPort"
Write-Host "Worker: celery -A backend.tasks.celery_app worker -l info -P solo"
Write-Host "Frontend: http://localhost:$FrontendPort"
Write-Host "Logs: $runtimeDir"
