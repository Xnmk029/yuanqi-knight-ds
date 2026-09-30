# Start signal server in a visible cmd window with live logs
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = if ($env:YQKS_PORT) { [int]$env:YQKS_PORT } else { 9000 }

# Port precheck: common conflict is NetEase UU accelerator (uu.exe binds 9000)
$listener = Get-NetTCPConnection -LocalPort $port -State Listen, Bound -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)" -ErrorAction SilentlyContinue
  Write-Host ''
  Write-Host ('!! Port ' + $port + ' is in use (PID ' + $listener.OwningProcess + ': ' + $owner.Name + ')') -ForegroundColor Yellow
  if ($owner.Name -eq 'uu.exe') {
    Write-Host '!! Owner is NetEase UU accelerator (uu.exe). UU binds port 9000 for its local proxy.' -ForegroundColor Yellow
    Write-Host '!! Fix: quit UU accelerator and retry, or set env YQKS_PORT=9001 and rerun (update SakuraFrp tunnel local port too).' -ForegroundColor Yellow
  } else {
    Write-Host '!! Fix: stop that process and retry, or set env YQKS_PORT=9001 (update SakuraFrp tunnel local port too).' -ForegroundColor Yellow
  }
  Write-Host ''
  exit 1
}

$wsDir = Join-Path $root 'node_modules\ws'
if (-not (Test-Path $wsDir)) {
  Write-Output 'Installing signaling server dependencies (ws)...'
  Push-Location $root
  npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Error 'npm install failed. Install Node.js and retry.'
    Pop-Location
    exit 1
  }
  Pop-Location
}
$env:PORT = "$port"
Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', 'node index.js' -WorkingDirectory $root
Write-Output ('Signal server started in a new cmd window (port ' + $port + ')')
Write-Output ('Check: http://127.0.0.1:' + $port + '/health')