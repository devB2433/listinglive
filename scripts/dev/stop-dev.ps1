param(
  [int]$BackendPort = 8003,
  [int]$FrontendPort = 3001
)

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

Write-Host "Stopped frontend/backend/worker for ListingLive"
